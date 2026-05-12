import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { cifra_text, from_key, to_key } = await req.json();

    if (!cifra_text || !from_key || !to_key) {
      return new Response(JSON.stringify({ error: "Missing cifra_text, from_key, or to_key" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (from_key === to_key) {
      return new Response(JSON.stringify({ cifra_text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are a music transposition tool. You will receive cifra text (chords + lyrics in Portuguese format) and must transpose ALL chord symbols from one key to another.

RULES:
1. Only modify chord symbols (e.g., Am7, G/B, F#dim, Bb, Csus4, etc.)
2. Keep ALL lyrics, spaces, line breaks, and formatting EXACTLY as they are
3. Preserve the exact column position of chords relative to lyrics
4. Handle enharmonic equivalents correctly
5. Return ONLY the transposed cifra text, nothing else - no explanation, no markdown, no code blocks

The input will specify from_key and to_key. Calculate the semitone interval and apply it to every chord.`,
          },
          {
            role: "user",
            content: `Transpose from ${from_key} to ${to_key}:\n\n${cifra_text}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const transposed = data.choices?.[0]?.message?.content?.trim();

    if (!transposed) throw new Error("Empty AI response");

    return new Response(JSON.stringify({ cifra_text: transposed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("transpose error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
