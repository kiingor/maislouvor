const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAdditionalAudioRequest(body: unknown) {
  if (!body || typeof body !== "object") throw new Error("Invalid request");
  const { song_id, title, url, attachment_id } = body as Record<string, unknown>;
  if (typeof song_id !== "string" || !UUID.test(song_id)
    || typeof title !== "string" || !title.trim() || title.trim().length > 120
    || typeof url !== "string" || url.length > 2048
    || (attachment_id !== undefined && (typeof attachment_id !== "string" || !UUID.test(attachment_id)))) {
    throw new Error("Invalid request");
  }
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port
    || !["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"].includes(host)) {
    throw new Error("Invalid YouTube URL");
  }
  const parts = parsed.pathname.split("/").filter(Boolean);
  const videoId = host.endsWith("youtu.be") ? parts[0]
    : parsed.pathname === "/watch" ? parsed.searchParams.get("v")
    : ["shorts", "live", "embed"].includes(parts[0]) ? parts[1] : null;
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error("Invalid video ID");
  return { songId: song_id, title: title.trim(), url: `https://www.youtube.com/watch?v=${videoId}`, attachmentId: attachment_id as string | undefined };
}
