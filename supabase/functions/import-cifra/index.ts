import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  enforceRateLimit,
  errorResponse,
  HttpError,
  json,
  readJsonBody,
  readResponseText,
  requireAuthenticated,
  requiredEnv,
  requirePost,
  requireString,
  requireTeamEditor,
} from "../_shared/security.ts";

const parseCifraClubUrl = (rawUrl: string) => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new HttpError(400, "URL inválida");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    (hostname !== "cifraclub.com.br" && !hostname.endsWith(".cifraclub.com.br"))
  ) {
    throw new HttpError(400, "Apenas URLs HTTPS do Cifra Club são aceitas");
  }
  return parsed;
};

const fetchCifraClubPage = async (initialUrl: URL) => {
  let currentUrl = initialUrl;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(currentUrl, {
      headers: { "User-Agent": "+Louvor/1.0" },
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      if (!location || redirects === 3) {
        throw new HttpError(502, "Redirecionamento inválido no Cifra Club");
      }
      currentUrl = parseCifraClubUrl(new URL(location, currentUrl).toString());
      continue;
    }
    return response;
  }
  throw new HttpError(502, "Redirecionamentos demais no Cifra Club");
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requirePost(req);
    const context = await requireAuthenticated(req);
    const body = await readJsonBody(req, 8_192);
    const teamId = await requireTeamEditor(context, body.team_id);
    await enforceRateLimit(context, "import-cifra", teamId, 10, 600);

    const url = requireString(body.url, "url", { max: 2_048 });
    const parsed = parseCifraClubUrl(url);

    // Fetch the page HTML
    const pageRes = await fetchCifraClubPage(parsed);
    if (!pageRes.ok) {
      throw new HttpError(502, "Não foi possível acessar a página");
    }

    const html = await readResponseText(pageRes, 1_000_000);

    // Truncate HTML to avoid token limits - keep first ~60k chars
    const truncatedHtml = html.substring(0, 60000);

    const LOVABLE_API_KEY = requiredEnv("LOVABLE_API_KEY");

    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                `You are a music data extractor. Given HTML from Cifra Club, extract:
- title: the song title
- artist: the artist name
- key_original: the original key/tom (e.g. "C", "Am", "G#m"). Look for "tom:" or similar indicators.
- cifra_text: the full cifra (chords + lyrics) preserving chord positioning above lyrics for monospace display. Keep blank lines between sections. Remove any HTML tags. Include section headers like [Intro], [Verse], [Chorus] etc.

Return ONLY valid JSON with these 4 fields. No markdown, no extra text.`,
            },
            {
              role: "user",
              content: truncatedHtml,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_song_data",
                description: "Extract song data from Cifra Club HTML",
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Song title" },
                    artist: { type: "string", description: "Artist name" },
                    key_original: {
                      type: "string",
                      description: "Original key/tom",
                    },
                    cifra_text: {
                      type: "string",
                      description: "Full cifra text with chords above lyrics",
                    },
                  },
                  required: ["title", "artist", "cifra_text"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "extract_song_data" },
          },
        }),
      },
    );

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({
            error:
              "Limite de requisições excedido. Tente novamente em alguns instantes.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const t = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, t);
      return new Response(
        JSON.stringify({ error: "Erro ao processar a cifra" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(
        JSON.stringify({ error: "Não foi possível extrair os dados da cifra" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const extracted = JSON.parse(toolCall.function.arguments);

    return json({ success: true, data: extracted });
  } catch (e) {
    console.error("import-cifra error:", e);
    return errorResponse(e);
  }
});
