import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate Cifra Club domain
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return new Response(JSON.stringify({ error: "URL inválida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!parsed.hostname.includes("cifraclub.com.br")) {
      return new Response(JSON.stringify({ error: "Apenas URLs do Cifra Club são aceitas" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the page HTML
    const pageRes = await fetch(url, {
      headers: { "User-Agent": "+Louvor/1.0" },
    });
    if (!pageRes.ok) {
      return new Response(JSON.stringify({ error: "Não foi possível acessar a página" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = await pageRes.text();

    // Truncate HTML to avoid token limits - keep first ~60k chars
    const truncatedHtml = html.substring(0, 60000);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are a music data extractor. Given HTML from Cifra Club, extract:
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
                  key_original: { type: "string", description: "Original key/tom" },
                  cifra_text: { type: "string", description: "Full cifra text with chords above lyrics" },
                },
                required: ["title", "artist", "cifra_text"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_song_data" } },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, t);
      return new Response(JSON.stringify({ error: "Erro ao processar a cifra" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "Não foi possível extrair os dados da cifra" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extracted = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ success: true, data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("import-cifra error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
