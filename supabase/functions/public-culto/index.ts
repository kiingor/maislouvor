import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response(JSON.stringify({ error: "Token is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: culto, error: cErr } = await supabase
      .from("cultos")
      .select("id, name, date, description")
      .eq("public_token", token)
      .eq("is_public", true)
      .single();

    if (cErr || !culto) {
      return new Response(JSON.stringify({ error: "Culto not found or not public" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: cSongs }, { data: blocks }, { data: lineup }] = await Promise.all([
      supabase
        .from("culto_songs")
        .select("sort_order, notes, key_override, songs(id, title, artist, key_current, key_original, cifra_text, lyrics_text)")
        .eq("culto_id", culto.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("culto_blocks")
        .select("id, title, kind, duration_min, notes, sort_order")
        .eq("culto_id", culto.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("culto_lineup")
        .select("instrument, status, team_members(profiles(full_name))")
        .eq("culto_id", culto.id),
    ]);

    const songItems = (cSongs || []).map((cs: any) => ({
      type: "song" as const,
      sort_order: cs.sort_order,
      title: cs.songs?.title ?? "—",
      artist: cs.songs?.artist ?? null,
      key: cs.key_override || cs.songs?.key_current || cs.songs?.key_original || null,
      notes: cs.notes ?? null,
      cifra_text: cs.songs?.cifra_text ?? null,
      lyrics_text: cs.songs?.lyrics_text ?? null,
    }));

    const blockItems = (blocks || []).map((b: any) => ({
      type: "block" as const,
      sort_order: b.sort_order,
      title: b.title,
      kind: b.kind,
      duration_min: b.duration_min,
      notes: b.notes ?? null,
    }));

    const items = [...songItems, ...blockItems].sort((a, b) => a.sort_order - b.sort_order);

    const lineupByInstrument: Record<string, string[]> = {};
    for (const l of lineup || []) {
      const inst = (l as any).instrument;
      const name = (l as any).team_members?.profiles?.full_name;
      if (!inst || !name) continue;
      (lineupByInstrument[inst] ||= []).push(name);
    }

    return new Response(
      JSON.stringify({
        name: culto.name,
        date: culto.date,
        description: culto.description,
        items,
        lineup: lineupByInstrument,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("public-culto error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
