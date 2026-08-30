import { describe, expect, it, vi } from "vitest";
import { getYouTubeVideoId, normalizeMediaUrl, openExternalMedia } from "./mediaUrl";

describe("normalizeMediaUrl", () => {
  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://youtube.com@evil.example/watch?v=dQw4w9WgXcQ",
    "https://evil.example/media",
  ])("rejeita URL insegura: %s", (value) => {
    expect(normalizeMediaUrl(value)).toBeNull();
  });

  it("aceita HTTPS de provedores permitidos", () => {
    expect(normalizeMediaUrl("https://open.spotify.com/track/abc")).toBe("https://open.spotify.com/track/abc");
  });
});

describe("getYouTubeVideoId", () => {
  it("extrai IDs apenas de URLs válidas do YouTube", () => {
    expect(getYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(getYouTubeVideoId("javascript:https://youtu.be/dQw4w9WgXcQ")).toBeNull();
  });
});

describe("openExternalMedia", () => {
  it("não chama window.open para esquemas executáveis", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    expect(openExternalMedia("javascript:alert(1)")).toBe(false);
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("abre URL permitida sem acesso ao opener", () => {
    const child = { opener: window } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(child);
    expect(openExternalMedia("https://open.spotify.com/track/abc")).toBe(true);
    expect(open).toHaveBeenCalledWith("https://open.spotify.com/track/abc", "_blank", "noopener,noreferrer");
    expect(child.opener).toBeNull();
    open.mockRestore();
  });
});
