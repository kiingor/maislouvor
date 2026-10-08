import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepertorioModal } from "./RepertorioModal";
import { SetlistGeneratorModal } from "./SetlistGeneratorModal";

const mocks = vi.hoisted(() => ({ leader: true, insert: vi.fn(), update: vi.fn() }));
vi.mock("@/contexts/TeamContext", () => ({
  useTeam: () => ({ currentTeam: { id: "team" }, profileId: "profile", isAdmin: mocks.leader, can: () => true }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    let inserting = false;
    const result = () => ({ error: null, data: inserting ? { id: "new-rep" } : table === "songs" ? [
      { id: "song", title: "Canção existente", theme: "Adoração", key_current: "C", duration_seconds: 240 },
    ] : [] });
    const q: any = {
      select: () => q, eq: () => q, single: async () => result(),
      insert: (body: unknown) => { inserting = true; mocks.insert(table, body); return q; },
      update: (body: unknown) => { mocks.update(table, body); return q; },
      then: (resolve: (v: unknown) => void) => Promise.resolve(result()).then(resolve),
    };
    return q;
  },
} }));
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);
beforeEach(() => { vi.clearAllMocks(); mocks.leader = true; });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("repertoire web creation and app maintenance", () => {
  it("creates a repertoire for a leader on the web", async () => {
    render(<RepertorioModal open onOpenChange={vi.fn()} />, { wrapper });
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Domingo" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith("repertorios", {
      name: "Domingo", team_id: "team", created_by: "profile",
    }));
  });
  it.each(["app", "web-editor"])("blocks both new repertoire dialogs for %s", (mode) => {
    if (mode === "app") vi.stubEnv("VITE_STORE_BUILD", "1");
    else mocks.leader = false;
    render(<><RepertorioModal open onOpenChange={vi.fn()} /><SetlistGeneratorModal open onOpenChange={vi.fn()} /></>, { wrapper });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("still renames an existing repertoire in the app", async () => {
    vi.stubEnv("VITE_STORE_BUILD", "1");
    render(<RepertorioModal open onOpenChange={vi.fn()} editId="rep" editName="Domingo" />, { wrapper });
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Ensaio" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("repertorios", { name: "Ensaio" }));
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("generates into an existing repertoire in the app without offering creation", async () => {
    vi.stubEnv("VITE_STORE_BUILD", "1");
    render(<SetlistGeneratorModal open onOpenChange={vi.fn()} repertorioId="rep" />, { wrapper });
    await screen.findByText("Canção existente");
    expect(screen.queryByRole("radio", { name: "Novo repertório" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nome do novo repertório")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gerar" }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith("repertorio_songs", [
      { repertorio_id: "rep", song_id: "song", sort_order: 0 },
    ]));
    expect(mocks.insert).not.toHaveBeenCalledWith("repertorios", expect.anything());
  });
});
