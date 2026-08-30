import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  errorResponse,
  HttpError,
  isUuid,
  json,
  requiredEnv,
} from "../_shared/security.ts";

const isSongStoragePath = (path: unknown, teamId: string, songId: string) => {
  if (typeof path !== "string") return false;
  const prefix = `${teamId}/${songId}`;
  return path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}/`);
};

const safeMediaUrl = (value: unknown) => {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const parsed = new URL(value);
    const allowedHosts = [
      "youtube.com",
      "youtu.be",
      "spotify.com",
      "music.apple.com",
      "deezer.com",
      "soundcloud.com",
      "vimeo.com",
    ];
    const allowedHost = allowedHosts.some((host) =>
      parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );
    return parsed.protocol === "https:" && !parsed.username &&
        !parsed.password && allowedHost
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "GET") throw new HttpError(405, "Método não permitido");
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!isUuid(token)) throw new HttpError(400, "Token inválido");

    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

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
        },
      );
    }

    // Fetch songs via repertorio_songs
    const { data: repSongs } = await supabase
      .from("repertorio_songs")
      .select(
        "sort_order, song_id, songs(id, team_id, title, artist, cover_path, audio_path, media_url, lyrics_text, key_current)",
      )
      .eq("repertorio_id", repertorio.id)
      .order("sort_order", { ascending: true });

    const songs = (repSongs || [])
      .map((relation: any) => relation.songs)
      .filter((song: any) => song && song.team_id === repertorio.team_id);

    // Generate signed URLs for cover and audio
    const enrichedSongs = await Promise.all(
      songs.map(async (song: any) => {
        let cover_url: string | null = null;
        let audio_url: string | null = null;

        if (isSongStoragePath(song.cover_path, repertorio.team_id, song.id)) {
          const { data } = await supabase.storage
            .from("covers")
            .createSignedUrl(song.cover_path, 3600);
          cover_url = data?.signedUrl ?? null;
        }

        if (isSongStoragePath(song.audio_path, repertorio.team_id, song.id)) {
          const { data } = await supabase.storage
            .from("audio")
            .createSignedUrl(song.audio_path, 3600);
          audio_url = data?.signedUrl ?? null;
        }

        return {
          id: song.id,
          title: song.title,
          artist: song.artist,
          cover_url,
          audio_url,
          media_url: safeMediaUrl(song.media_url),
          lyrics_text: song.lyrics_text,
          key_current: song.key_current,
        };
      }),
    );

    return json({ name: repertorio.name, songs: enrichedSongs });
  } catch (err) {
    console.error("public-playlist error", err);
    return errorResponse(err);
  }
});
