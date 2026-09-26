import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SongAudioAttachments } from "./SongAudioAttachments";
import { SongAudioAttachmentsDialog } from "./SongAudioAttachmentsDialog";
import type { SongAudioAttachment } from "@/lib/songAudioAttachments";

const mocks = vi.hoisted(() => ({ query: vi.fn(), toast: vi.fn(), upload: vi.fn(), import: vi.fn(), rename: vi.fn(), remove: vi.fn(), sign: vi.fn() }));
vi.mock("@/hooks/useSongAudioAttachments", () => ({ useSongAudioAttachments: mocks.query }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ createSignedUrl: mocks.sign }) } } }));
vi.mock("@/lib/songAudioAttachments", async (original) => ({
  ...await original<typeof import("@/lib/songAudioAttachments")>(),
  uploadSongAudio: mocks.upload, importSongAudio: mocks.import, renameSongAudio: mocks.rename, removeSongAudio: mocks.remove,
}));
const item = (id: string, title: string, extra = {}): SongAudioAttachment => ({
  id, title, song_id: "song", audio_path: `team/song/additional/${id}.mp3`, youtube_url: null,
  status: "ready", error: null, claimed_at: null, created_at: "2026-09-26", ...extra,
});
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  mocks.query.mockReturnValue({ data: [item("1", "Contralto"), item("2", "Tenor")], refetch: vi.fn() });
  mocks.sign.mockImplementation(async (path) => ({ data: { signedUrl: `https://audio.test/${path}` }, error: null }));
  mocks.upload.mockResolvedValue(undefined);
  mocks.import.mockResolvedValue(undefined);
  mocks.rename.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(true);
});
afterEach(cleanup);

describe("additional audio interface", () => {
  it("lets viewers play only one recording at a time without editing controls", async () => {
    const onPlay = vi.fn();
    const { container } = render(<SongAudioAttachments songId="song" onPlaybackStart={onPlay} />, { wrapper });
    expect(screen.queryByRole("button", { name: "Adicionar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remover/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ouvir Contralto" }));
    await screen.findByLabelText("Reproduzir Contralto");
    fireEvent.click(screen.getByRole("button", { name: "Ouvir Tenor" }));
    await screen.findByLabelText("Reproduzir Tenor");
    expect(screen.queryByLabelText("Reproduzir Contralto")).not.toBeInTheDocument();
    expect(container.querySelectorAll("audio")).toHaveLength(1);
    expect(onPlay).toHaveBeenCalledTimes(2);
  });
  it("uploads a named file for the parent song", async () => {
    render(<SongAudioAttachments songId="song" teamId="owner-team" readOnly={false} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    const file = new File(["audio"], "Kit soprano.mp3", { type: "audio/mpeg" });
    fireEvent.change(screen.getByLabelText("Arquivo de áudio"), { target: { files: [file] } });
    expect(screen.getByLabelText("Nome do áudio")).toHaveValue("Kit soprano");
    fireEvent.click(screen.getByRole("button", { name: "Adicionar áudio" }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith("song", "owner-team", "Kit soprano", file));
  });
  it("offers a separate YouTube import without changing the main URL", async () => {
    render(<SongAudioAttachments songId="song" teamId="team" readOnly={false} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "YouTube" }), { button: 0, ctrlKey: false });
    fireEvent.change(screen.getByLabelText("Nome do áudio"), { target: { value: "Voz guia" } });
    fireEvent.change(screen.getByLabelText("Link do YouTube"), { target: { value: "https://youtu.be/abcdefghijk" } });
    fireEvent.click(screen.getByRole("button", { name: "Importar áudio" }));
    await waitFor(() => expect(mocks.import).toHaveBeenCalledWith("song", "Voz guia", "https://youtu.be/abcdefghijk"));
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("renames without replacing the recording", async () => {
    render(<SongAudioAttachments songId="song" teamId="team" readOnly={false} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Renomear Contralto" }));
    fireEvent.change(screen.getByLabelText("Nome do áudio"), { target: { value: "Kit contralto" } });
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar nome" }));
    await waitFor(() => expect(mocks.rename).toHaveBeenCalledWith("1", "Kit contralto"));
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("confirms deletion and keeps the dialog open on failure", async () => {
    mocks.remove.mockRejectedValue(new Error("Sem permissão"));
    render(<SongAudioAttachments songId="song" teamId="team" readOnly={false} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Remover Contralto" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remover" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
  it("shows persisted queue/error status and retries the same recording", async () => {
    mocks.query.mockReturnValue({ data: [item("pending", "Soprano", { audio_path: null, status: "queued" }), item("failed", "Voz guia", { audio_path: null, status: "error", error: "COOKIE_EXPIRED", youtube_url: "https://youtu.be/abcdefghijk" })] });
    render(<SongAudioAttachments songId="song" teamId="team" readOnly={false} />, { wrapper });
    expect(screen.getByRole("button", { name: "Ouvir Soprano" })).toBeDisabled();
    expect(screen.getByText(/Avise o administrador/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(mocks.import).toHaveBeenCalledWith("song", "Voz guia", "https://youtu.be/abcdefghijk", "failed"));
  });
  it("does not disguise load failures as an empty list", () => {
    mocks.query.mockReturnValue({ isError: true, refetch: vi.fn() });
    render(<SongAudioAttachments songId="song" />, { wrapper });
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar");
    expect(screen.queryByText("Nenhum áudio adicional nesta música.")).not.toBeInTheDocument();
  });
  it("prevents uploads before the additional audio backend is available", () => {
    mocks.query.mockReturnValue({ isError: true, error: { code: "PGRST205" }, refetch: vi.fn() });
    render(<SongAudioAttachments songId="song" teamId="team" readOnly={false} />, { wrapper });
    expect(screen.getByRole("alert")).toHaveTextContent("ainda não estão disponíveis neste ambiente");
    expect(screen.getByRole("button", { name: "Adicionar" })).toBeDisabled();
  });
  it("unmounts the player on close and when switching songs", async () => {
    const props = { open: true, onOpenChange: vi.fn(), songId: "song", songTitle: "Música" };
    const { rerender } = render(<SongAudioAttachmentsDialog {...props} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Ouvir Contralto" }));
    await screen.findByLabelText("Reproduzir Contralto");
    rerender(<SongAudioAttachmentsDialog {...props} songId="another-song" />);
    expect(screen.queryByLabelText("Reproduzir Contralto")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ouvir Tenor" }));
    await screen.findByLabelText("Reproduzir Tenor");
    rerender(<SongAudioAttachmentsDialog {...props} open={false} />);
    expect(screen.queryByLabelText("Reproduzir Tenor")).not.toBeInTheDocument();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
  });
});
