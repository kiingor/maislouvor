import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicPlaylist from "./PublicPlaylist";

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks();
  document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]').forEach(node => node.remove());
  delete (window as any).onYouTubeIframeAPIReady;
});

async function mount(native: boolean, audio: boolean, video = true) {
  vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(native);
  vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({
    name: "Playlist QA", audio_access: "team_only", songs: [{ id: "song", title: "Canção QA", media_url: video ? "https://youtu.be/abcdefghijk" : null, audio_url: audio ? "https://audio.example/recording.mp3" : null }],
  }) } as Response);
  render(<MemoryRouter initialEntries={["/playlist/test-token"]}><Routes><Route path="/playlist/:token" element={<PublicPlaylist />} /></Routes></MemoryRouter>);
  await screen.findByText("Canção QA");
}

describe("public playlist YouTube", () => {
  it("explains private audio and disables playback without a public video", async () => {
    await mount(false, false, false);
    expect(screen.getByText(/Áudios restritos aos integrantes da equipe/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Acessar o +Louvor" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "Reproduzir" })).toBeDisabled();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
  it("keeps the web reference video accessible when team audio is private", async () => {
    await mount(false, false);
    fireEvent.click(screen.getByRole("button", { name: "Ver vídeo" }));
    expect(document.querySelector("#yt-player")).not.toBeNull();
  });
  it.each([true, false])("never loads the YouTube API natively; audio available: %s", async (audio) => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await mount(true, audio);
    expect(document.querySelector('script[src*="youtube"], iframe, #yt-player')).toBeNull();
    if (audio) await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Ver vídeo no YouTube" }));
    expect(open).toHaveBeenCalledWith("https://www.youtube.com/watch?v=abcdefghijk", "_blank", "noopener,noreferrer");
    expect(document.querySelector('script[src*="youtube"], iframe, #yt-player')).toBeNull();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    if (!audio) {
      fireEvent.click(screen.getByRole("button", { name: "Abrir no YouTube" }));
      expect(open).toHaveBeenCalledTimes(2);
    }
  });
  it("keeps the iframe API and video mode on web", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await mount(false, true);
    expect(document.querySelector('script[src="https://www.youtube.com/iframe_api"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver vídeo" }));
    expect(document.querySelector("#yt-player")).not.toBeNull();
    expect(open).not.toHaveBeenCalled();
  });
});
