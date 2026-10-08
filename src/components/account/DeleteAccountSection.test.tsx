import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DeleteAccountSection } from "./DeleteAccountSection";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), invoke: vi.fn(), signOut: vi.fn(), toast: vi.fn(), refetchTeams: vi.fn(),
  update: vi.fn(), eq: vi.fn(), select: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = { eq: (...args: unknown[]) => { mocks.eq(...args); return chain; }, select: (...args: unknown[]) => mocks.select(...args) };
  return {
    supabase: {
      rpc: mocks.rpc,
      functions: { invoke: mocks.invoke },
      from: () => ({ update: (values: unknown) => { mocks.update(values); return chain; } }),
      auth: {
        getSession: async () => ({ data: { session: { user: { id: "user-1" } } } }),
        signOut: mocks.signOut,
      },
    },
  };
});
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/contexts/TeamContext", () => ({ useTeam: () => ({ refetch: mocks.refetchTeams }) }));

const team = (overrides: Record<string, unknown>) => ({
  team_id: "team-a", team_name: "Louvor Sede", role: "editor", is_owner: false, member_count: 4,
  action: "leave", candidates: [], ...overrides,
});
const preview = (teams: unknown[], canDelete = true) => ({
  has_profile: true, can_delete: canDelete, teams, personal: { chat_messages: 3, support_tickets: 1, draft_songs: 2 },
});
const candidates = [
  { profile_id: "p-mario", full_name: "Mario", role: "editor" },
  { profile_id: "p-mel", full_name: "Mel", role: "viewer" },
];

// O jsdom deste Node não expõe localStorage: um armazenamento em memória basta.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
});

function renderSection(path = "/app/settings") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/app/settings" element={<DeleteAccountSection />} />
          <Route path="/login" element={<p>Tela de login</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const open = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Excluir minha conta" }));
  return screen.findByRole("dialog");
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("DeleteAccountSection", () => {
  it("opens the deletion sheet straight from /app/settings#excluir-conta and returns focus to the button", async () => {
    mocks.rpc.mockResolvedValue({ data: preview([team({})]), error: null });
    renderSection("/app/settings#excluir-conta");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Excluir minha conta" })).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Excluir minha conta" })).toHaveFocus());
  });
  it("does not open by itself without the anchor", async () => {
    renderSection();
    expect(screen.getByRole("button", { name: "Excluir minha conta" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("shows what happens, requires the typed word and signs out after deleting", async () => {
    localStorage.setItem("louvor_team_cache:user-1", "{}");
    localStorage.setItem("louvor_current_team", "team-a");
    mocks.rpc.mockResolvedValue({
      data: preview([team({}), team({ team_id: "team-c", team_name: "Projeto solo", role: "admin", is_owner: true, member_count: 1, action: "delete_team" })]),
      error: null,
    });
    mocks.invoke.mockResolvedValue({ data: { ok: true, already_deleted: false, deleted_team_ids: ["team-c"] }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    renderSection();

    expect(screen.getByRole("link", { name: "Como funciona" })).toHaveAttribute("href", "/excluir-conta");
    const dialog = await open();
    expect(within(dialog).getByRole("status")).toHaveTextContent("Conferindo suas equipes");
    const solo = (await within(dialog).findByText("Projeto solo")).closest("li")!;
    expect(solo).toHaveTextContent("Será excluída com a conta");
    expect(within(dialog).getByText("Louvor Sede").closest("li")).toHaveTextContent("Você sai da equipe");
    expect(dialog).toHaveTextContent("Suas mensagens no chat (3)");
    expect(dialog).toHaveTextContent("Rascunhos de músicas que você ainda não cadastrou (2)");
    expect(dialog).toHaveTextContent("Músicas já cadastradas, repertórios e cultos que você criou continuam");
    expect(within(dialog).getByRole("note")).toHaveTextContent("Assinaturas feitas pela App Store ou Google Play precisam ser canceladas na loja.");
    expect(mocks.rpc.mock.calls[0][0]).toBe("get_account_deletion_preview");

    const confirm = within(dialog).getByRole("button", { name: "Excluir conta" });
    expect(confirm).toBeDisabled();
    const input = within(dialog).getByLabelText(/Para confirmar, digite/);
    fireEvent.change(input, { target: { value: "excluí" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: "excluir" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(await screen.findByText("Tela de login")).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledWith("delete-account", { body: { confirmation: "excluir" } });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Conta excluída" }));
    expect(localStorage.getItem("louvor_team_cache:user-1")).toBeNull();
    expect(localStorage.getItem("louvor_current_team")).toBeNull();
  });

  it("asks the owner to transfer the team first and unlocks after the transfer", async () => {
    let previews = 0;
    mocks.rpc.mockImplementation(async (fn: string) => {
      // Contrato de produção (20261003120000): { ok: true } ou { ok: false, error }.
      if (fn === "transfer_team_ownership") return { data: { ok: true }, error: null };
      previews++;
      return previews === 1
        ? { data: preview([team({ role: "admin", is_owner: true, action: "transfer_required", candidates })], false), error: null }
        : { data: preview([team({ role: "admin", is_owner: true })]), error: null };
    });
    renderSection();
    const dialog = await open();

    expect(await within(dialog).findByText("Transfira a propriedade")).toBeInTheDocument();
    expect(within(dialog).getByText(/Resolva a equipe indicada acima/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Para confirmar, digite/)).toBeDisabled();
    const transfer = within(dialog).getByRole("button", { name: "Transferir" });
    expect(transfer).toBeDisabled();
    const select = within(dialog).getByLabelText("Novo dono(a)");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Escolha alguém", "Mario · Editor", "Mel · Membro"]);
    fireEvent.change(select, { target: { value: "p-mario" } });
    fireEvent.click(transfer);

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("transfer_team_ownership", {
      p_team_id: "team-a", p_new_owner_profile_id: "p-mario",
    }));
    expect(await within(dialog).findByText("Você sai da equipe")).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Para confirmar, digite/)).toBeEnabled();
    expect(mocks.refetchTeams).toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Propriedade transferida" }));
  });

  it("explains a refused transfer and reloads the summary", async () => {
    let previews = 0;
    const blocked = preview([team({ role: "admin", is_owner: true, action: "transfer_required", candidates })], false);
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "transfer_team_ownership") return { data: { ok: false, error: "not_member" }, error: null };
      previews++;
      return { data: blocked, error: null };
    });
    renderSection();
    const dialog = await open();

    fireEvent.change(await within(dialog).findByLabelText("Novo dono(a)"), { target: { value: "p-mel" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Transferir" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Não foi possível transferir",
      description: "A pessoa escolhida não faz mais parte da equipe. Atualize a tela e escolha outra pessoa.",
      variant: "destructive",
    })));
    await waitFor(() => expect(previews).toBe(2));
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Propriedade transferida" }));
    expect(within(dialog).getByLabelText(/Para confirmar, digite/)).toBeDisabled();
  });

  it("offers only leaders to an owner who is no longer a leader and explains the guard refusal", async () => {
    let previews = 0;
    const leaders = [{ profile_id: "p-lia", full_name: "Lia", role: "admin" }];
    mocks.rpc.mockImplementation(async (fn: string) => {
      // Prévia velha (oferecia a Mel, que não é líder): o guarda de 20261003120000 recusa com 42501.
      if (fn === "transfer_team_ownership") {
        return { data: null, error: { code: "42501", message: "Só um líder pode promover, rebaixar ou editar um líder." } };
      }
      previews++;
      return { data: preview([team({ role: "viewer", is_owner: true, action: "transfer_required",
        candidates: previews === 1 ? [...leaders, candidates[1]] : leaders })], false), error: null };
    });
    renderSection();
    const dialog = await open();

    const row = (await within(dialog).findByText("Louvor Sede")).closest("li")!;
    expect(row).toHaveTextContent("Você é dono(a) desta equipe, mas não é mais líder dela: escolha um dos líderes para assumir.");
    fireEvent.change(within(dialog).getByLabelText("Novo dono(a)"), { target: { value: "p-mel" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Transferir" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Não foi possível transferir",
      description: expect.stringMatching(/^Você não é mais líder desta equipe, então só pode passá-la para alguém que já é líder/),
      variant: "destructive",
    })));
    await waitFor(() => expect(previews).toBe(2));
    await waitFor(() => expect(within(within(dialog).getByLabelText("Novo dono(a)")).getAllByRole("option").map((o) => o.textContent))
      .toEqual(["Escolha alguém", "Lia · Líder"]));
    expect(within(dialog).getByLabelText(/Para confirmar, digite/)).toBeDisabled();
  });

  it("lets a legacy owner recover the team in the app", async () => {
    mocks.rpc.mockResolvedValue({
      data: preview([team({ role: "viewer", is_owner: true, action: "support_required", candidates })], false), error: null,
    });
    renderSection();
    const dialog = await open();

    const row = (await within(dialog).findByText("Louvor Sede")).closest("li")!;
    expect(row).toHaveTextContent("Escolha quem assume");
    expect(row).toHaveTextContent("a equipe não tem outro líder para assumir");
    expect(within(row).queryByRole("link", { name: "Falar com o suporte" })).not.toBeInTheDocument();
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    fireEvent.change(within(row).getByLabelText("Novo dono(a)"), { target: { value: candidates[0].profile_id } });
    fireEvent.click(within(row).getByRole("button", { name: "Transferir" }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("delete-account", { body: { action: "resolve_team", teamId: "team-a", newOwner: candidates[0].profile_id } }));
    expect(within(dialog).getByText(/Resolva a equipe indicada acima/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Para confirmar, digite/)).toBeDisabled();
  });

  it("lets the only leader promote someone through the members update", async () => {
    let previews = 0;
    mocks.rpc.mockImplementation(async () => {
      previews++;
      return previews === 1
        ? { data: preview([team({ role: "admin", action: "promote_required", candidates })], false), error: null }
        : { data: preview([team({ role: "admin" })]), error: null };
    });
    mocks.select.mockResolvedValue({ data: [{ id: "member-mel" }], error: null });
    renderSection();
    const dialog = await open();

    fireEvent.change(await within(dialog).findByLabelText("Novo líder"), { target: { value: "p-mel" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Promover" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ role: "admin", permissions: {} }));
    expect(mocks.eq).toHaveBeenCalledWith("team_id", "team-a");
    expect(mocks.eq).toHaveBeenCalledWith("profile_id", "p-mel");
    expect(await within(dialog).findByText("Você sai da equipe")).toBeInTheDocument();
  });

  it("keeps the dialog open and explains a server error", async () => {
    mocks.rpc.mockResolvedValue({ data: preview([]), error: null });
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { context: { json: async () => ({ ok: false, error: "storage_failed", message: "Não foi possível apagar seus arquivos agora." }) } },
    });
    renderSection();
    const dialog = await open();
    fireEvent.change(await within(dialog).findByLabelText(/Para confirmar, digite/), { target: { value: "EXCLUIR" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir conta" }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Não foi possível excluir a conta", description: "Não foi possível apagar seus arquivos agora.", variant: "destructive",
    })));
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Excluir conta" })).toBeEnabled();
  });

  it("offers a retry when the preview cannot be loaded", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "offline" } })
      .mockResolvedValueOnce({ data: preview([]), error: null });
    renderSection();
    const dialog = await open();
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Não foi possível carregar");
    fireEvent.click(within(dialog).getByRole("button", { name: "Tentar de novo" }));
    expect(await within(dialog).findByLabelText(/Para confirmar, digite/)).toBeEnabled();
  });
});
