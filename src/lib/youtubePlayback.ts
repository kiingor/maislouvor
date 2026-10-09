import { Capacitor } from "@capacitor/core";

/** Native videos leave the app; web keeps the existing embedded player. */
export function usesExternalYouTube(): boolean {
  return Capacitor.isNativePlatform();
}

export function youtubeWatchUrl(videoId: string): string | null {
  return /^[A-Za-z0-9_-]{11}$/.test(videoId)
    ? `https://www.youtube.com/watch?v=${videoId}`
    : null;
}

export function openYouTubeExternally(videoId: string): void {
  const url = youtubeWatchUrl(videoId);
  if (!url) return;
  // Capacitor iOS WKUIDelegate hands _blank to UIApplication.shared.open.
  // Do not use Browser.open: that presents an in-app browser instead.
  window.open(url, "_blank", "noopener,noreferrer");
}
