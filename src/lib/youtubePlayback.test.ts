import { afterEach, describe, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import { openYouTubeExternally, usesExternalYouTube, youtubeWatchUrl } from "./youtubePlayback";

afterEach(() => vi.restoreAllMocks());

describe("YouTube external playback", () => {
  it("uses native detection and opens only the canonical watch URL in another window", () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    expect(usesExternalYouTube()).toBe(true);
    openYouTubeExternally("AbCdE_f-12");
    expect(open).not.toHaveBeenCalled(); // IDs must contain exactly eleven characters.
    openYouTubeExternally("AbCdE_f-123");
    expect(open).toHaveBeenCalledWith("https://www.youtube.com/watch?v=AbCdE_f-123", "_blank", "noopener,noreferrer");
  });
  it.each(["https://evil.example/video", "abcdefghijk?x=1", "javascript:", "../abcdefghijk", "", "abcdefghij<"])("rejects a non-ID: %s", (id) => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    expect(youtubeWatchUrl(id)).toBeNull();
    openYouTubeExternally(id);
    expect(open).not.toHaveBeenCalled();
  });
  it("keeps embedding available on the web", () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(false);
    expect(usesExternalYouTube()).toBe(false);
  });
});
