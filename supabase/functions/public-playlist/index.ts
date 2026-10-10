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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Signed URLs are built with the internal SUPABASE_URL host (e.g. http://kong:8000),
    // which the browser can't reach — rewrite them to the public host.
    const publicBase = (Deno.env.get("SUPABASE_PUBLIC_URL") ?? supabaseUrl).replace(/\/$/, "");

    // Fetch repertorio
    const { data: repertorio, error: repError } = await supabase
      .from("repertorios")
      .select("id, name, team_id")
      .eq("public_token", token)
      .eq("is_public", true)
      .single();

    if (repError || !repertorio) {
      return new Response(
        JSON.stringify({ error: "Playlist not found or not public" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch songs via repertorio_songs
    const { data: repSongs } = await supabase
      .from("repertorio_songs")
      .select("sort_order, song_id, songs(id, team_id, title, artist, cover_path, media_url, lyrics_text, key_current, moderation_blocked)")
      .eq("repertorio_id", repertorio.id)
      .order("sort_order", { ascending: true });

    const songs = (repSongs || []).map((rs: any) => rs.songs).filter((song: any) => song && song.team_id === repertorio.team_id && song.moderation_blocked === false);

    // A public list never grants access to the team’s stored recordings.
    const enrichedSongs = await Promise.all(
      songs.map(async (song: any) => {
        let cover_url: string | null = null;

        if (song.cover_path) {
          const { data } = await supabase.storage
            .from("covers")
            .createSignedUrl(song.cover_path, 3600);
          cover_url = data?.signedUrl ? data.signedUrl.replace(supabaseUrl, publicBase) : null;
        }

        return {
          id: song.id,
          title: song.title,
          artist: song.artist,
          cover_url,
          audio_url: null,
          media_url: song.media_url,
          lyrics_text: song.lyrics_text,
          key_current: song.key_current,
        };
      })
    );

    return new Response(
      JSON.stringify({
        name: repertorio.name,
        audio_access: "team_only",
        songs: enrichedSongs,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
