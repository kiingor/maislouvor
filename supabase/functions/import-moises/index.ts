import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MOISES_HOSTS = new Set(["extensions-prod.moises.ai", "moises.ai", "www.moises.ai"]);

const SECTION_HEADER_REGEX =
  /^\[(intro|verse|chorus|bridge|outro|verso|refr[aã]o|ponte|pre[- ]?chorus|pr[eé][- ]?refr[aã]o)\]$/i;

const CHORD_LINE_REGEX =
  /^(?:[A-G](?:#|b)?(?:m|maj7|m7|M7|7|sus2|sus4|add9|dim|aug|9|11|13)?(?:\/[A-G](?:#|b)?)?)(?:\s+[A-G](?:#|b)?(?:m|maj7|m7|M7|7|sus2|sus4|add9|dim|aug|9|11|13)?(?:\/[A-G](?:#|b)?)?)*$/i;

const INLINE_CHORD_REGEX =
  /\b[A-G](?:#|b)?(?:m|maj7|m7|M7|7|sus2|sus4|add9|dim|aug|9|11|13)?(?:\/[A-G](?:#|b)?)?\b/g;

type ResolvedInput = {
  text: string;
  fromMoisesUrl: boolean;
};

const decodeHtmlEntities = (text: string) =>
  text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const isUiLine = (line: string) =>
  /^(copy link|print\s*\/\s*pdf|print|pdf|transpose[−\-+0-9\s]*|key\s*[A-G]|bpm\s*\d+|time\s*\d+\/\d+)$/i.test(
    line.trim(),
  );

const normalizeKey = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;

  const value = raw.trim();
  if (!value) return null;

  const normalized = value
    .replace(/\s+/g, " ")
    .replace(/[♭]/g, "b")
    .replace(/[♯]/g, "#");

  const majorMinor = normalized.match(/^([A-G](?:#|b)?)(?:\s+|\-)?(major|maj|min|minor|m)$/i);
  if (majorMinor) {
    const note = majorMinor[1].toUpperCase();
    const quality = majorMinor[2].toLowerCase();
    return quality === "major" || quality === "maj" ? note : `${note}m`;
  }

  const simple = normalized.match(/^([A-G](?:#|b)?m?)$/i);
  if (simple) {
    const token = simple[1];
    if (token.endsWith("m") || token.endsWith("M")) {
      return `${token.slice(0, -1).toUpperCase()}m`;
    }
    return token.toUpperCase();
  }

  return normalized;
};

const extractReadableTextFromHtml = (html: string) => {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");

  const withLineBreaks = withoutNoise
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|td)>/gi, "\n");

  return decodeHtmlEntities(withLineBreaks)
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
};

const splitCleanLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.replace(/\\\[/g, "[").replace(/\\\]/g, "]").replace(/\u00A0/g, " ").trim())
    .filter((line) => !isUiLine(line));

const isChordLine = (line: string) => {
  const compact = line.replace(/\s+/g, " ").trim();
  return compact.length > 0 && CHORD_LINE_REGEX.test(compact);
};

const collapseBlankLines = (lines: string[]) => {
  const collapsed: string[] = [];
  let lastWasBlank = false;

  for (const line of lines) {
    const normalized = line.replace(/[ \t]{2,}/g, " ").trimEnd();
    const blank = normalized.length === 0;
    if (blank && lastWasBlank) continue;
    collapsed.push(normalized);
    lastWasBlank = blank;
  }

  return collapsed;
};

const focusChartText = (rawText: string) => {
  const lines = splitCleanLines(rawText);
  if (lines.length === 0) return rawText;

  const firstSectionIndex = lines.findIndex((line) => SECTION_HEADER_REGEX.test(line));
  const start = firstSectionIndex >= 0 ? Math.max(0, firstSectionIndex - 8) : 0;
  const focused = lines.slice(start, start + 500);

  return collapseBlankLines(focused).join("\n").trim();
};

const extractDeterministicMoisesData = (rawText: string) => {
  const lines = splitCleanLines(rawText);
  const firstSectionIndex = lines.findIndex((line) => SECTION_HEADER_REGEX.test(line));
  const start = firstSectionIndex >= 0 ? firstSectionIndex : 0;

  const title =
    lines.find(
      (line, index) =>
        index < 12 &&
        line.length >= 2 &&
        line.length <= 90 &&
        !SECTION_HEADER_REGEX.test(line) &&
        !isChordLine(line) &&
        !/^key\b|^bpm\b|^time\b/i.test(line),
    ) ?? "Música importada";

  const keyMatch = rawText.match(/\bKey\s*([A-G](?:#|b)?(?:\s*(?:major|minor|maj|min|m))?)/i);
  const bpmMatch = rawText.match(/\bBPM\s*(\d{2,3})/i);

  const chartLines = collapseBlankLines(lines.slice(start, start + 500));
  const cifraText = chartLines.join("\n").trim();

  const lyricsLines: string[] = [];
  let lastWasBlank = false;

  for (const line of chartLines) {
    if (!line) {
      if (!lastWasBlank) {
        lyricsLines.push("");
        lastWasBlank = true;
      }
      continue;
    }

    if (SECTION_HEADER_REGEX.test(line)) {
      lyricsLines.push(line);
      lastWasBlank = false;
      continue;
    }

    if (isChordLine(line)) continue;

    const withoutInlineChords = line.replace(INLINE_CHORD_REGEX, " ").replace(/[ \t]{2,}/g, " ").trim();
    if (!withoutInlineChords) continue;

    lyricsLines.push(withoutInlineChords);
    lastWasBlank = false;
  }

  return {
    title,
    key_original: normalizeKey(keyMatch?.[1] ?? null),
    bpm: bpmMatch ? Number(bpmMatch[1]) : null,
    cifra_text: cifraText,
    lyrics_text: lyricsLines.join("\n").trim() || null,
  };
};

const resolveInputText = async (input: string): Promise<ResolvedInput> => {
  const trimmed = input.trim();
  if (!trimmed) return { text: "", fromMoisesUrl: false };

  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return { text: trimmed, fromMoisesUrl: false };
  }

  if (!MOISES_HOSTS.has(parsedUrl.hostname)) {
    return { text: trimmed, fromMoisesUrl: false };
  }

  const response = await fetch(parsedUrl.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; LovableCloud/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error("Não foi possível abrir o link do Moises. Tente colar o conteúdo da página.");
  }

  const html = await response.text();
  const readable = extractReadableTextFromHtml(html);

  if (readable.length < 80) {
    throw new Error("O link do Moises não retornou conteúdo legível. Cole o texto da página para importar.");
  }

  return { text: readable, fromMoisesUrl: true };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const input =
      typeof body?.text === "string"
        ? body.text
        : typeof body?.url === "string"
          ? body.url
          : typeof body?.input === "string"
            ? body.input
            : "";

    const trimmedInput = input.trim();

    if (!input || typeof input !== "string" || trimmedInput.length < 8) {
      return new Response(
        JSON.stringify({
          error: "Cole o conteúdo completo do Chord Chart para importar.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (/^https?:\/\/\S+$/i.test(trimmedInput)) {
      return new Response(
        JSON.stringify({
          error: "O link sozinho do Moises pode trazer dados incorretos. Abra o link, copie todo o conteúdo (Ctrl+A / Ctrl+C) e cole aqui.",
        }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const resolved = await resolveInputText(trimmedInput);

    if (!resolved.text || resolved.text.trim().length < 20) {
      return new Response(
        JSON.stringify({
          error: "Não foi possível ler dados suficientes. Tente colar o conteúdo inteiro da página.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (resolved.fromMoisesUrl) {
      const deterministic = extractDeterministicMoisesData(resolved.text);
      if (deterministic.cifra_text && deterministic.cifra_text.length >= 20) {
        return new Response(JSON.stringify({ success: true, data: deterministic }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const focusedText = focusChartText(resolved.text);
    const truncatedText = focusedText.substring(0, 30000);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `You are a music data extractor. You will receive text from a single chord chart. The text may contain chord names mixed inline with lyrics (e.g. "Nada vai me FsepaCrar" means chord F appears before "sepa" and chord C appears before "rar").

Extract:
- title: song title
- artist: artist name (if identifiable)
- key_original: normalize to compact format ("C major" => "C", "A minor" => "Am")
- bpm: BPM number if present
- cifra_text: full cifra in Brazilian format with chords on a separate line above lyrics
- lyrics_text: lyrics only, preserving section headers

CRITICAL RULES:
1. Extract ONLY what is in the provided text. NEVER invent content.
2. If there is not enough song content, return empty cifra_text.
3. Use only the single song represented in the input text.

Return ONLY valid JSON.`,
          },
          {
            role: "user",
            content: truncatedText,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_moises_data",
              description: "Extract song data from chord chart text",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Song title" },
                  artist: { type: "string", description: "Artist name" },
                  key_original: { type: "string", description: "Original key/tom" },
                  bpm: { type: "number", description: "BPM tempo" },
                  cifra_text: { type: "string", description: "Full cifra with chords above lyrics" },
                  lyrics_text: { type: "string", description: "Lyrics only, with section headers" },
                },
                required: ["title", "cifra_text"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_moises_data" } },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente." }), {
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
      const text = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, text);
      return new Response(JSON.stringify({ error: "Erro ao processar os dados" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      return new Response(JSON.stringify({ error: "Não foi possível extrair os dados" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extracted = JSON.parse(toolCall.function.arguments ?? "{}");

    if (!extracted?.cifra_text?.trim()) {
      return new Response(
        JSON.stringify({ error: "Não foi possível extrair a cifra deste conteúdo. Tente colar o texto completo da página." }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const normalized = {
      ...extracted,
      key_original: normalizeKey(extracted.key_original),
    };

    return new Response(JSON.stringify({ success: true, data: normalized }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("import-moises error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
