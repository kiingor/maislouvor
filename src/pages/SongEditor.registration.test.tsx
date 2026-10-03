import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SongEditor from "./SongEditor";
const mocks = vi.hoisted(() => ({
  song: {} as Record<string, unknown>,
  updates: vi.fn(),
  rpc: vi.fn(),
  invoke: vi.fn(),
  toast: vi.fn(),
  can: vi.fn(() => true),
  jobs: [] as unknown[],
  pending: 0,
}));
vi.mock("@/contexts/TeamContext", () => ({
  useTeam: () => ({ currentTeam: { id: "team" }, can: mocks.can }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));
vi.mock("@/components/CoverUpload", () => ({ CoverUpload: () => null }));
vi.mock("@/components/AudioUpload", () => ({ AudioUpload: () => null }));
vi.mock("@/components/AudioTrimmer", () => ({ AudioTrimmer: () => null }));
vi.mock("@/components/StemPreviewPlayer", () => ({
  StemPreviewPlayer: () => null,
}));
vi.mock("@/components/TrackUpload", () => ({ TrackUpload: () => null }));
vi.mock("@/components/SongRegistrationLoops", () => ({
  SongRegistrationLoops: () => null,
}));
vi.mock("@/components/SongAudioAttachments", () => ({
  SongAudioAttachments: () => null,
}));
vi.mock("@/components/SongRepertoriosCard", () => ({
  SongRepertoriosCard: () => null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: null, error: null }),
      }),
    },
    from: (table: string) => {
      let columns = "",
        update = false;
      const result = () => ({
        data: update
          ? null
          : table === "songs"
          ? columns === "stems_status, stems_error"
            ? {
                stems_status: mocks.song.stems_status || "idle",
                stems_error: null,
              }
            : mocks.song
          : table === "repertorios"
          ? [{ id: "rep", name: "Repertório QA" }]
          : table === "yt_import_jobs"
          ? mocks.jobs
          : [],
        error: null,
        count: mocks.pending,
      });
      const builder: any = {
        select: (value: string) => {
          columns = value;
          return builder;
        },
        eq: () => builder,
        neq: () => builder,
        order: () => builder,
        limit: () => builder,
        single: () => Promise.resolve(result()),
        update: (fields: unknown) => {
          mocks.updates(fields);
          Object.assign(mocks.song, fields);
          update = true;
          return builder;
        },
        then: (resolve: (value: unknown) => void) =>
          Promise.resolve(result()).then(resolve),
      };
      return builder;
    },
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.can.mockReturnValue(true);
  mocks.pending = 0;
  mocks.jobs = [];
  mocks.song = {
    id: "song",
    team_id: "team",
    is_draft: true,
    title: "Canção QA",
    artist: "Artista QA",
    key_original: "C",
    key_current: "C",
    theme: "Adoração",
    tags: ["abertura"],
    cifra_text: "C G Am F",
    audio_path: "team/song.mp3",
    recording_source_url: null,
  };
  mocks.rpc.mockImplementation(async (name) => ({
    data: name === "can_edit_song_audio",
    error: null,
  }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(cleanup);
const start = async () => {
  const finished = vi.fn();
  render(
    <SongEditor
      songId="song"
      embedded
      initialRepertorioId="rep"
      onFinished={finished}
    />,
    {
      wrapper: ({ children }) => (
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <MemoryRouter>{children}</MemoryRouter>
        </QueryClientProvider>
      ),
    }
  );
  await screen.findByLabelText("Nome da música");
  return finished;
};
describe("song registration lifecycle", () => {
  it("saves original/team keys and pending tags without overwriting worker-managed audio", async () => {
    await start();
    fireEvent.change(screen.getByLabelText("Nome da música"), {
      target: { value: "Minha canção" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /^Tags/ }), {
      target: { value: "ensaio" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Tom original:/ }));
    const search = screen.getByRole("combobox", { name: "Buscar tom" });
    fireEvent.change(search, { target: { value: "F#" } });
    fireEvent.keyDown(search, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await waitFor(() =>
      expect(mocks.updates).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Minha canção",
          key_original: "F#",
          key_current: "F#",
          tags: ["abertura", "ensaio"],
          draft_repertorio_ids: ["rep"],
        })
      )
    );
    expect(mocks.updates.mock.calls[0][0]).not.toHaveProperty("audio_path");
    expect(mocks.updates.mock.calls[0][0]).not.toHaveProperty("cover_path");
  });
  it("keeps missing fields in drafts and focuses the first required field", async () => {
    Object.assign(mocks.song, {
      title: "",
      artist: "",
      key_original: "",
      key_current: "",
      theme: "",
      audio_path: null,
      cifra_text: null,
    });
    const finished = await start();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByText("Informe o nome da música.");
    expect(screen.getAllByRole("alert")).toHaveLength(4);
    await waitFor(() =>
      expect(screen.getByLabelText("Nome da música")).toHaveFocus()
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await waitFor(() => expect(finished).toHaveBeenCalled());
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "publish_song_registration",
      expect.anything()
    );
  });
  it("publishes and links only after review, using one server transaction", async () => {
    const finished = await start();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByLabelText("Link da gravação");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    const publish = await screen.findByRole("button", {
      name: "Cadastrar e adicionar",
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "publish_song_registration",
      expect.anything()
    );
    fireEvent.click(publish);
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("publish_song_registration", {
        p_song_id: "song",
        p_repertorio_ids: ["rep"],
      })
    );
    expect(finished).toHaveBeenCalled();
  });
  it("requires reimport when the saved recording URL changes", async () => {
    Object.assign(mocks.song, {
      media_url: "https://youtu.be/abcdefghijk",
      recording_source_url: "https://youtu.be/abcdefghijk",
    });
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    const link = await screen.findByLabelText("Link da gravação");
    fireEvent.change(link, {
      target: { value: "https://youtu.be/ZYXWVUTSRQP" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByText(
      "O link mudou. Importe a gravação desta versão novamente."
    );
    expect(
      screen.queryByRole("button", { name: "Cadastrar e adicionar" })
    ).not.toBeInTheDocument();
  });
  it("resumes pending imports without allowing review, and still saves the draft", async () => {
    mocks.jobs = [
      {
        id: "job",
        status: "queued",
        url: "https://youtu.be/abcdefghijk",
        error: null,
      },
    ];
    const finished = await start();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByText("Importando gravação…");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByText(
      "Importe o áudio pelo link da gravação ou escolha um arquivo."
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await waitFor(() => expect(finished).toHaveBeenCalled());
  });
});

describe("store build (VITE_STORE_BUILD=1)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_STORE_BUILD", "1");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("keeps the recording link and the file upload, with no YouTube import anywhere", async () => {
    Object.assign(mocks.song, { media_url: "https://youtu.be/abcdefghijk" });
    // Importação feita no site que falhou por cookie: no app das lojas, nada sobre isso.
    mocks.jobs = [
      { id: "job", status: "error", url: "https://youtu.be/abcdefghijk", error: "COOKIE_EXPIRED" },
    ];
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    const link = await screen.findByLabelText("Link da gravação");
    expect(link).toHaveAttribute("placeholder", "Cole o link da gravação…");
    expect(screen.getByText("Arquivo de áudio da gravação")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/YouTube|administrador/);
    const recording = screen.getByRole("region", { name: "Qual gravação vamos usar?" });
    expect(within(recording).queryByRole("button", { name: /Importar/ })).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Faixas" }), { button: 0, ctrlKey: false });
    expect(await screen.findByText(/Envie a gravação e separe em faixas/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/YouTube|Importe/);
    // Nenhum botão da gravação dispara importação (inclusive "Conferir versão", que abre o player).
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Gravação" }), { button: 0, ctrlKey: false });
    const again = await screen.findByRole("region", { name: "Qual gravação vamos usar?" });
    for (const button of within(again).getAllByRole("button")) fireEvent.click(button);
    expect(mocks.invoke).not.toHaveBeenCalledWith("import-youtube", expect.anything());
    expect(mocks.invoke).not.toHaveBeenCalledWith("import-song-audio", expect.anything());
  });
  it("asks for the audio file again when the saved recording URL changes", async () => {
    Object.assign(mocks.song, {
      media_url: "https://youtu.be/abcdefghijk",
      recording_source_url: "https://youtu.be/abcdefghijk",
    });
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.change(await screen.findByLabelText("Link da gravação"), {
      target: { value: "https://youtu.be/ZYXWVUTSRQP" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByText("O link mudou. Envie o áudio desta versão novamente.");
    expect(document.body.textContent).not.toMatch(/Importe/);
  });
});
