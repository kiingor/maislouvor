import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddSongModal } from "./AddSongModal";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  insert: vi.fn(),
  toast: vi.fn(),
  permission: vi.fn(() => true),
  leader: true,
}));
vi.mock("@/contexts/TeamContext", () => ({
  useTeam: () => ({
    currentTeam: { id: "team" },
    profileId: "profile",
    isAdmin: mocks.leader,
    can: mocks.permission,
  }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));
vi.mock("@/pages/SongEditor", () => ({
  default: ({ songId }: { songId: string }) => <div>Draft editor {songId}</div>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: async () => ({ data: [], error: null }),
        single: async () => ({ data: { id: "new-draft" }, error: null }),
        insert: (body: unknown) => {
          mocks.insert(body);
          return builder;
        },
      };
      return builder;
    },
  },
}));
const fixture = (n: number) => ({
  id: `song-${n}`,
  title: `Música ${n}`,
  artist: "Artista QA",
  key_current: "G",
  theme: "Adoração",
  tags: ["abertura"],
  cover_path: null,
  already_added: n === 2,
});
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.leader = true;
  mocks.permission.mockReturnValue(true);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  mocks.rpc.mockImplementation(async (name, args) => {
    if (name === "song_catalog_facets")
      return { data: [{ value: "Adoração" }], error: null };
    if (name === "add_complete_songs_to_repertorio")
      return { data: args.p_song_ids.length, error: null };
    const data = args.p_selected_ids
      ? args.p_selected_ids.map((id: string) =>
          fixture(Number(id.split("-")[1]))
        )
      : Array.from({ length: 12 }, (_, i) =>
          fixture((args.p_page - 1) * 12 + i + 1)
        );
    return {
      data: {
        songs: data,
        total: args.p_selected_ids ? data.length : 30,
        page: args.p_page,
        page_size: args.p_page_size,
      },
      error: null,
    };
  });
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
const start = async (onClose = vi.fn()) => {
  render(<AddSongModal open onOpenChange={onClose} repertorioId="rep" />, {
    wrapper,
  });
  fireEvent.click(screen.getByRole("button", { name: /Buscar músicas/ }));
  await screen.findByRole("checkbox", {
    name: "Selecionar Música 1, Artista QA",
  });
  return onClose;
};
describe("registered song catalog", () => {
  it("requests bounded server pages, retains cross-page selections and adds one batch", async () => {
    const closed = await start();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Selecionar Música 1, Artista QA" })
    );
    expect(
      screen.getByRole("checkbox", { name: "Música 2 já está no repertório" })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await screen.findByRole("checkbox", {
      name: "Selecionar Música 13, Artista QA",
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "search_song_catalog",
      expect.objectContaining({ p_page: 2, p_page_size: 12, p_team_id: "team" })
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Selecionar Música 13, Artista QA" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Adicionar (2)" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        "add_complete_songs_to_repertorio",
        { p_repertorio_id: "rep", p_song_ids: ["song-1", "song-13"] }
      )
    );
    expect(closed).toHaveBeenCalledWith(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("resets page for text and filter changes, and ignores filters only in selected view", async () => {
    await start();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Selecionar Música 1, Artista QA" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await screen.findByText("Música 13");
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "acústico" },
    });
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        "search_song_catalog",
        expect.objectContaining({ p_page: 1, p_query: "acústico" })
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Tema: Todos" }));
    await screen.findByRole("option", { name: "Adoração" });
    fireEvent.click(screen.getByRole("option", { name: "Adoração" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        "search_song_catalog",
        expect.objectContaining({ p_page: 1, p_theme: "Adoração" })
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver selecionadas" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        "search_song_catalog",
        expect.objectContaining({
          p_query: "",
          p_theme: "",
          p_selected_ids: ["song-1"],
        })
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Voltar à busca" }));
    expect(screen.getByRole("searchbox")).toHaveValue("acústico");
    expect(
      screen.getByRole("button", { name: "Tema: Adoração" })
    ).toBeInTheDocument();
  });
  it("shows retry on failed search and keeps selection on failed addition", async () => {
    await start();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Selecionar Música 1, Artista QA" })
    );
    mocks.rpc.mockImplementation(async (name) =>
      name === "add_complete_songs_to_repertorio"
        ? { data: null, error: { message: "Música incompleta" } }
        : { data: null, error: { message: "Offline" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Adicionar (1)" }));
    await screen.findByRole("button", { name: "Tentar novamente" });
    expect(screen.getByText("1 selecionada")).toBeInTheDocument();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" })
    );
  });
  it("creates a persisted draft without linking an incomplete song or offering CifraClub", async () => {
    render(<AddSongModal open onOpenChange={vi.fn()} repertorioId="rep" />, {
      wrapper,
    });
    expect(screen.queryByText(/CifraClub|Cifra Clube/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar nova/ }));
    await screen.findByText("Draft editor new-draft");
    expect(mocks.insert).toHaveBeenCalledWith({
      team_id: "team",
      created_by: "profile",
      title: "",
      is_draft: true,
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "add_complete_songs_to_repertorio",
      expect.anything()
    );
  });
});

describe("web-only authoring", () => {
  it.each(["native", "web-editor"])("%s can add existing songs without creating drafts", async (mode) => {
    if (mode === "native") vi.stubEnv("VITE_STORE_BUILD", "1");
    else mocks.leader = false;
    render(<AddSongModal open onOpenChange={vi.fn()} repertorioId="rep" />, { wrapper });
    expect(screen.queryByRole("button", { name: /Cadastrar nova|Retomar rascunhos/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Buscar músicas/ }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Selecionar Música 1, Artista QA" }));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar (1)" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("add_complete_songs_to_repertorio", {
      p_repertorio_id: "rep", p_song_ids: ["song-1"],
    }));
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("closes the global library registration entry point in the app", () => {
    vi.stubEnv("VITE_STORE_BUILD", "1");
    render(<AddSongModal open onOpenChange={vi.fn()} />, { wrapper });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
