import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SongSummaryModal } from "./SongSummaryModal";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/SongContentModal", () => ({ SongContentModal: () => null }));
vi.mock("@/components/SongAudioAttachmentsDialog", () => ({ SongAudioAttachmentsDialog: () => null }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("song summary video", () => {
  it.each([true, false])("uses external playback only on native (%s)", (native) => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(native);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    qc.setQueryData(["song-summary", "song"], { id: "song", title: "Canção QA", media_url: "https://youtu.be/abcdefghijk" });
    qc.setQueryData(["song-repertorios-summary", "song"], []);
    render(<QueryClientProvider client={qc}><SongSummaryModal open onOpenChange={() => {}} songId="song" /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: native ? "Abrir no YouTube" : "Vídeo" }));
    if (native) {
      expect(open).toHaveBeenCalledWith("https://www.youtube.com/watch?v=abcdefghijk", "_blank", "noopener,noreferrer");
      expect(document.querySelector("iframe")).toBeNull();
    } else {
      expect(screen.getByTitle("YouTube")).toHaveAttribute("src", "https://www.youtube.com/embed/abcdefghijk?autoplay=1");
      expect(open).not.toHaveBeenCalled();
    }
  });
});
