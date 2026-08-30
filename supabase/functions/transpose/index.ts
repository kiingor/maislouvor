import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  enforceRateLimit,
  errorResponse,
  HttpError,
  json,
  readJsonBody,
  requireAuthenticated,
  requiredEnv,
  requirePost,
  requireSongEditor,
  requireString,
} from "../_shared/security.ts";

const KEY_PATTERN = /^[A-G](?:#|b)?m?$/;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requirePost(req);
    const context = await requireAuthenticated(req);
    const body = await readJsonBody(req, 120_000);
    const song = await requireSongEditor(context, body.song_id);
    await enforceRateLimit(context, "transpose", song.team_id, 30, 600);

    const cifra_text = requireString(body.cifra_text, "cifra_text", {
      max: 100_000,
    });
    const from_key = requireString(body.from_key, "from_key", { max: 4 });
    const to_key = requireString(body.to_key, "to_key", { max: 4 });
    if (!KEY_PATTERN.test(from_key) || !KEY_PATTERN.test(to_key)) {
      throw new HttpError(400, "Tom musical inválido");
    }

    if (from_key === to_key) {
      return json({ cifra_text });
    }

    const LOVABLE_API_KEY = requiredEnv("LOVABLE_API_KEY");

    const response = await fetch(
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
                `You are a music transposition tool. You will receive cifra text (chords + lyrics in Portuguese format) and must transpose ALL chord symbols from one key to another.

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
              content:
                `Transpose from ${from_key} to ${to_key}:\n\n${cifra_text}`,
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const transposed = data.choices?.[0]?.message?.content?.trim();

    if (!transposed) throw new Error("Empty AI response");

    return json({ cifra_text: transposed });
  } catch (e) {
    console.error("transpose error:", e);
    return errorResponse(e);
  }
});
