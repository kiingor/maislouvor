import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioUpload } from "./AudioUpload";
import { CoverUpload } from "./CoverUpload";
const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  sign: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({ upload: mocks.upload, createSignedUrl: mocks.sign }),
    },
  },
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.upload.mockResolvedValue({ error: null });
  mocks.sign.mockResolvedValue({
    data: { signedUrl: "https://audio.test/file" },
    error: null,
  });
});
afterEach(cleanup);
describe("registration file lifecycle", () => {
  it("waits for linking before marking an audio upload complete", async () => {
    let finish: () => void = () => {};
    const linked = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const saved = vi.fn(() => linked),
      busy = vi.fn();
    const { container } = render(
      <AudioUpload
        compact
        songId="song"
        teamId="team"
        audioPath={null}
        onUpload={saved}
        onBusyChange={busy}
      />
    );
    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: {
        files: [new File(["audio"], "audio.mp3", { type: "audio/mpeg" })],
      },
    });
    await waitFor(() => expect(saved).toHaveBeenCalledWith("team/song.mp3"));
    expect(busy).toHaveBeenLastCalledWith(true);
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Áudio enviado com sucesso" })
    );
    finish();
    await waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "Áudio enviado com sucesso",
    });
  });
  it("reports failed audio linking without a success toast", async () => {
    const { container } = render(
      <AudioUpload
        songId="song"
        teamId="team"
        audioPath={null}
        onUpload={async () => {
          throw new Error("Offline");
        }}
      />
    );
    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: {
        files: [new File(["audio"], "audio.mp3", { type: "audio/mpeg" })],
      },
    });
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: "Offline",
        })
      )
    );
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Áudio enviado com sucesso" })
    );
  });
  it("rejects unsupported or oversized artwork before uploading", async () => {
    const { container } = render(
      <CoverUpload
        compact
        songId="song"
        teamId="team"
        coverPath={null}
        onUpload={vi.fn()}
      />
    );
    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: {
        files: [new File(["picture"], "cover.svg", { type: "image/svg+xml" })],
      },
    });
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" })
    );
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Adicionar capa" })
    ).toBeInTheDocument();
  });
});
