const ALLOWED_MEDIA_HOSTS = [
  "youtube.com",
  "youtu.be",
  "spotify.com",
  "music.apple.com",
  "deezer.com",
  "soundcloud.com",
  "vimeo.com",
] as const;

const isAllowedHost = (hostname: string) =>
  ALLOWED_MEDIA_HOSTS.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));

export function normalizeMediaUrl(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.length > 2_048) return null;

  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || !isAllowedHost(parsed.hostname.toLowerCase())
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function getYouTubeVideoId(value: string | null | undefined): string | null {
  const safeUrl = normalizeMediaUrl(value);
  if (!safeUrl) return null;

  const parsed = new URL(safeUrl);
  const hostname = parsed.hostname.toLowerCase();
  let candidate: string | null = null;

  if (hostname === "youtu.be" || hostname.endsWith(".youtu.be")) {
    candidate = parsed.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (hostname === "youtube.com" || hostname.endsWith(".youtube.com")) {
    if (parsed.pathname === "/watch") candidate = parsed.searchParams.get("v");
    else {
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live"].includes(parts[0])) candidate = parts[1] ?? null;
    }
  }

  return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
}

export function openExternalMedia(value: string | null | undefined): boolean {
  const safeUrl = normalizeMediaUrl(value);
  if (!safeUrl) return false;

  const opened = window.open(safeUrl, "_blank", "noopener,noreferrer");
  if (opened) opened.opener = null;
  return true;
}
