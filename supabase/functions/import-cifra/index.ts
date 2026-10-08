import { requireAiConsent } from "../_shared/aiConsent.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

// Strip HTML tags from a fragment, keeping its text (and its inner spacing/newlines).
function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  );
}

function matchFirst(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1] : null;
}

// Deterministic parse of a Cifra Club page. Returns null if the cifra block is absent.
function parseCifraClub(html: string, url: string): {
  title: string;
  artist: string;
  key_original: string;
  cifra_text: string;
} | null {
  const preRaw = matchFirst(html, /<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (!preRaw) return null;

  // Cifra body: keep chords (<b>) and spacing, drop all tags, normalise blank lines.
  let cifra = stripTags(preRaw)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // og:title is "Song - ARTIST - Cifra Club" — handy fallback.
  const ogTitle = matchFirst(html, /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i) || "";
  const ogParts = ogTitle.split(" - ").map((p) => p.trim());

  let title =
    (matchFirst(html, /<h1[^>]*class="[^"]*\bt1\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) &&
      stripTags(matchFirst(html, /<h1[^>]*class="[^"]*\bt1\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)!)) ||
    ogParts[0] ||
    "";
  title = title.trim();

  let artist =
    (matchFirst(html, /<h2[^>]*class="[^"]*\bt3\b[^"]*"[^>]*>([\s\S]*?)<\/h2>/i) &&
      stripTags(matchFirst(html, /<h2[^>]*class="[^"]*\bt3\b[^"]*"[^>]*>([\s\S]*?)<\/h2>/i)!)) ||
    ogParts[1] ||
    "";
  artist = artist.trim();

  // Key: <span id="cifra_tom">tom: <a ...>Am</a></span>  (fallback: plain "tom: G")
  let key_original =
    matchFirst(html, /<span[^>]*id="cifra_tom"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
    matchFirst(html, /<span[^>]*id="cifra_tom"[^>]*>\s*tom:\s*([A-G][#b]?m?)/i) ||
    "";
  key_original = stripTags(key_original).trim();

  // Last-resort title/artist from the URL slug.
  if (!title || !artist) {
    const slug = url.replace(/https?:\/\/[^/]+\//, "").replace(/\/+$/, "").split("/");
    const human = (s: string) =>
      s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    if (!artist && slug[0]) artist = human(slug[0]);
    if (!title && slug[1]) title = human(slug[1]);
  }

  return { title, artist, key_original, cifra_text: cifra };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const denied = await requireAiConsent(req, body, corsHeaders);
    if (denied) return denied;
    const { url } = body;
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Fetch the page HTML (browser UA — some CDNs reject unknown agents).
    const pageRes = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      redirect: "follow",
    });
    if (!pageRes.ok) {
      return new Response(JSON.stringify({ error: `Não foi possível acessar a página (HTTP ${pageRes.status})` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = await pageRes.text();

    // 1) Fast path: parse the HTML directly (no AI, no timeout risk).
    const parsedSong = parseCifraClub(html, url);
    if (parsedSong && parsedSong.cifra_text && parsedSong.title) {
      return new Response(JSON.stringify({ success: true, data: parsedSong }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Fallback: AI extraction (guarded with a timeout so it can never hang the worker).
    const AI_KEY = Deno.env.get("AI_API_KEY") || Deno.env.get("LOVABLE_API_KEY");
    if (!AI_KEY) {
      return new Response(JSON.stringify({ error: "Não foi possível extrair a cifra desta página." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const truncatedHtml = html.substring(0, 45000);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 25000);
    let aiRes: Response;
    try {
      aiRes = await fetch((Deno.env.get("AI_BASE_URL") || "https://iarouter.softcomia.com/v1") + "/chat/completions", {
        method: "POST",
        signal: ac.signal,
        headers: { Authorization: `Bearer ${AI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: Deno.env.get("AI_MODEL") || "cerebras/gpt-oss-120b",
          stream: false,
          messages: [
            {
              role: "system",
              content:
                'Extract from Cifra Club HTML and return ONLY JSON: {"title","artist","key_original","cifra_text"}. cifra_text must preserve chord positioning above lyrics for monospace, keep [section] headers and blank lines, no HTML.',
            },
            { role: "user", content: truncatedHtml },
          ],
        }),
      });
    } catch (err) {
      clearTimeout(timer);
      console.error("AI fallback failed/timed out:", err instanceof Error ? err.message : err);
      return new Response(JSON.stringify({ error: "Não foi possível extrair a cifra (tempo esgotado)." }), {
        status: 504,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    clearTimeout(timer);

    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => "");
      console.error("AI gateway error:", aiRes.status, t.slice(0, 500));
      return new Response(JSON.stringify({ error: "Erro ao processar a cifra" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    let content: string = aiData.choices?.[0]?.message?.content ?? "";
    content = content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    let extracted: any;
    try {
      extracted = JSON.parse(content);
    } catch {
      return new Response(JSON.stringify({ error: "Não foi possível extrair os dados da cifra" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
