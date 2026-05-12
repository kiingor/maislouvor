import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INSTRUMENTAL_TAGS = /^\[(intro|solo|instrumental|interlude|interlúdio|outro|prelúdio|pré-refrão|pos-refrão|ponte)\]$/i;

/** Check if a segment is instrumental (no lyrics, just a section tag) */
function isInstrumentalSegment(segment: string): boolean {
  const lines = segment.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return true;
  // If the only non-empty line is a section tag that matches instrumental patterns
  const nonTagLines = lines.filter(l => !INSTRUMENTAL_TAGS.test(l) && !/^\[.*\]$/.test(l));
  if (nonTagLines.length === 0) {
    // Check if at least one line is an instrumental tag
    return lines.some(l => INSTRUMENTAL_TAGS.test(l));
  }
  return false;
}

/** Remove chord-only tokens and count singable words in a segment */
function countSingableWords(segment: string): number {
  const chordPattern = /^[A-G][#b]?(?:m|maj|min|dim|aug|sus[24]?|add\d+|7|9|11|13|6)*(?:\/[A-G][#b]?)?$/;
  const sectionTag = /^\[.*\]$/;
  let count = 0;
  for (const line of segment.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || sectionTag.test(trimmed)) continue;
    for (const word of trimmed.split(/\s+/)) {
      if (!chordPattern.test(word)) count++;
    }
  }
  return Math.max(count, 1);
}

/** Get effective weight for a segment, giving instrumental sections much higher weight */
function getSegmentWeight(segment: string): number {
  if (isInstrumentalSegment(segment)) {
    return 20; // Instrumental sections get weight equivalent to ~20 words
  }
  return countSingableWords(segment);
}

/** Generate proportional timestamps based on text density */
function generateFallbackTimestamps(segments: string[], duration: number): number[] {
  const weights = segments.map(getSegmentWeight);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const timestamps: number[] = [];
  let cursor = 0;
  for (let i = 0; i < segments.length; i++) {
    timestamps.push(Math.round(cursor * 10) / 10);
    cursor += (weights[i] / totalWeight) * duration;
  }
  return timestamps;
}

/** Post-process AI timestamps to ensure quality */
function normalizeTimestamps(raw: number[], segmentCount: number, duration: number, segments: string[]): { timestamps: number[]; adjusted: boolean } {
  let adjusted = false;

  // 1. Ensure correct length
  let ts = raw.slice(0, segmentCount).map(v => {
    const n = Number(v);
    return Number.isFinite(n) ? n : -1;
  });

  // If too few or has invalid values, fallback
  if (ts.length < segmentCount || ts.some(v => v < 0)) {
    return { timestamps: generateFallbackTimestamps(segments, duration), adjusted: true };
  }

  // 2. First timestamp should be near 0
  if (ts[0] > 10) {
    ts[0] = 0;
    adjusted = true;
  }

  // 3. Enforce strict monotonicity with minimum gap of 3s
  const MIN_GAP = 3;
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] <= ts[i - 1] + MIN_GAP) {
      ts[i] = ts[i - 1] + MIN_GAP;
      adjusted = true;
    }
  }

  // 4. Last timestamp must leave room (at least 5s before end)
  if (ts[ts.length - 1] > duration - 5) {
    const scale = (duration - 5) / ts[ts.length - 1];
    ts = ts.map(v => Math.round(v * scale * 10) / 10);
    ts[0] = 0;
    adjusted = true;
  }

  // 5. Detect outlier intervals using median — but be lenient for instrumental sections
  const intervals = [];
  for (let i = 1; i < ts.length; i++) {
    intervals.push(ts[i] - ts[i - 1]);
  }
  if (intervals.length >= 3) {
    const sorted = [...intervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const maxAllowed = median * 3.5; // Relaxed from 2.5 to allow instrumental sections more time
    const minAllowed = median * 0.3;

    for (let i = 1; i < ts.length; i++) {
      const gap = ts[i] - ts[i - 1];
      // Skip outlier compression for instrumental segments — they legitimately need more time
      const prevIsInstrumental = isInstrumentalSegment(segments[i - 1]);
      if (gap > maxAllowed && !prevIsInstrumental) {
        ts[i] = ts[i - 1] + maxAllowed;
        adjusted = true;
        const remaining = duration - ts[i];
        const remainingSegments = ts.length - i - 1;
        if (remainingSegments > 0) {
          const step = remaining / (remainingSegments + 1);
          for (let j = i + 1; j < ts.length; j++) {
            ts[j] = Math.round((ts[i] + step * (j - i)) * 10) / 10;
          }
        }
      } else if (gap < minAllowed && gap < MIN_GAP) {
        ts[i] = ts[i - 1] + MIN_GAP;
        adjusted = true;
      }
    }
  }

  // Round all
  ts = ts.map(v => Math.round(v * 10) / 10);

  return { timestamps: ts, adjusted };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { segments, duration_seconds } = await req.json();

    if (!segments?.length || !duration_seconds) {
      return new Response(JSON.stringify({ error: "segments and duration_seconds are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are a music timing expert. Given lyric/chord segments and total song duration, estimate when each segment starts.

STRICT RULES:
- Return exactly ${segments.length} timestamps as a JSON array of numbers (seconds, one decimal).
- First timestamp MUST be between 0 and 5 (accounting for intro).
- All timestamps MUST be strictly increasing.
- The last timestamp must be at least 10 seconds before the song ends (to leave room for the final section).
- Distribute time based on MUSICAL STRUCTURE, not just word count.
- Repeated sections (e.g., Chorus/Refrão appearing multiple times) should have SIMILAR durations each time.
- Minimum interval between any two consecutive timestamps: 5 seconds.
- Maximum interval: avoid any single segment taking more than 40% of total duration.

CRITICAL — INSTRUMENTAL SECTIONS:
- Segments marked as [INSTRUMENTAL] have NO lyrics but take SIGNIFICANT time in the song.
- [Intro] typically lasts 10-45 seconds depending on the song.
- [Solo] and [Instrumental] typically last 15-40 seconds.
- [Interlude] and [Ponte] typically last 10-25 seconds.
- [Outro] typically lasts 10-30 seconds.
- Do NOT compress instrumental sections to just a few seconds — they are real musical passages.
- A song intro of 30-45 seconds is very common in worship/gospel music.`;

    const userPrompt = `Song duration: ${duration_seconds} seconds
Number of segments: ${segments.length}

Here are the segments with details:
${segments.map((s: string, i: number) => {
  const instrumental = isInstrumentalSegment(s);
  const words = countSingableWords(s);
  const label = instrumental ? "[INSTRUMENTAL]" : `(${words} singable words)`;
  return `--- Segment ${i + 1} ${label} ---\n${s}`;
}).join("\n\n")}

Return ONLY the array of ${segments.length} timestamps using the suggest_timestamps tool.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_timestamps",
              description: "Return an array of timestamps (in seconds) for when each segment starts in the song.",
              parameters: {
                type: "object",
                properties: {
                  timestamps: {
                    type: "array",
                    items: { type: "number" },
                    description: "Array of start times in seconds for each segment",
                  },
                },
                required: ["timestamps"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_timestamps" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Muitas requisições. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes para IA." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      console.log("AI failed, using heuristic fallback");
      const fallback = generateFallbackTimestamps(segments, duration_seconds);
      return new Response(JSON.stringify({ timestamps: fallback, adjusted: true, fallback: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      console.log("AI returned no tool call, using heuristic fallback");
      const fallback = generateFallbackTimestamps(segments, duration_seconds);
      return new Response(JSON.stringify({ timestamps: fallback, adjusted: true, fallback: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const args = JSON.parse(toolCall.function.arguments);
    const rawTimestamps: number[] = args.timestamps;

    console.log("Raw AI timestamps:", JSON.stringify(rawTimestamps));

    const { timestamps, adjusted } = normalizeTimestamps(rawTimestamps, segments.length, duration_seconds, segments);

    console.log("Normalized timestamps:", JSON.stringify(timestamps), "adjusted:", adjusted);

    return new Response(JSON.stringify({ timestamps, adjusted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-lyrics error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
