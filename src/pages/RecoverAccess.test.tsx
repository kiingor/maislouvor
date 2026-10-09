import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn(), signOut: vi.fn(), login: vi.fn(), rpc: vi.fn(), from: vi.fn(),
  profile: vi.fn(), teams: vi.fn(), profileFilter: vi.fn(), teamFilter: vi.fn(), toast: vi.fn(), listener: null as null | ((event: string, session: unknown) => void) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {
  getSession: mocks.getSession, getUser: mocks.getUser, signOut: mocks.signOut, signInWithPassword: mocks.login,
  onAuthStateChange: (listener: typeof mocks.listener) => { mocks.listener = listener; return { data: { subscription: { unsubscribe: vi.fn() } } }; },
}, rpc: mocks.rpc, from: mocks.from } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/InstallPWABanner", () => ({ InstallPWABanner: () => null }));
vi.mock("@/components/SocialLoginButtons", () => ({ SocialLoginButtons: () => null }));
vi.mock("@/components/auth/LoginShowcase", () => ({ LoginShowcase: () => null }));
import RecoverAccess from "./RecoverAccess";
import Login from "./Login";
import { RECOVER_ACCESS_PATH } from "@/lib/authRedirect";
const user = { id: "existing-user", email: "existing@example.test" };
const consent = { allowed: false, version: "2026-10-08", accepted_at: null };
let qc: QueryClient;
function mount() {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[RECOVER_ACCESS_PATH]}><Routes>
    <Route path={RECOVER_ACCESS_PATH} element={<RecoverAccess />} />
    <Route path="/login" element={<Login />} />
    <Route path="/minha-privacidade" element={<p>Escolhas sem acesso à equipe</p>} />
  </Routes></MemoryRouter></QueryClientProvider>);
}
async function authorize() {
  fireEvent.click(await screen.findByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Autorizar e continuar" }));
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.listener = null;
  mocks.getSession.mockResolvedValue({ data: { session: { user } }, error: null });
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.login.mockImplementation(async () => { mocks.getSession.mockResolvedValue({ data: { session: { user } }, error: null }); return { error: null }; });
  mocks.rpc.mockImplementation(async (name: string) => ({ error: null, data: { ...consent, allowed: name === "set_my_team_data_consent" } }));
  mocks.profile.mockResolvedValue({ data: { id: "own-profile" }, error: null });
  mocks.teams.mockResolvedValue({ data: [{ team_id: "own-team", teams: { id: "own-team" } }], error: null });
  mocks.profileFilter.mockImplementation(() => ({ maybeSingle: mocks.profile }));
  mocks.teamFilter.mockImplementation(() => mocks.teams());
  mocks.from.mockImplementation((table: string) => ({ select: () => ({ eq: table === "profiles" ? mocks.profileFilter : mocks.teamFilter }) }));
});
afterEach(() => { cleanup(); qc?.clear(); });
describe("access recovery for existing accounts", () => {
  it("returns from password login and confirms the own team only after an explicit individual choice", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null }); mount();
    const login = await screen.findByRole("link", { name: "Entrar na minha conta" });
    expect(login).toHaveAttribute("href", `/login?redirect=${encodeURIComponent(RECOVER_ACCESS_PATH)}`);
    fireEvent.click(login);
    await screen.findByRole("heading", { name: "Entre na sua conta" });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: user.email } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "fixture-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    const box = await screen.findByRole("checkbox");
    expect(box).not.toBeChecked(); expect(mocks.from).not.toHaveBeenCalled();
    expect(screen.getByText(user.email)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Autorizar e continuar" })).toBeDisabled();
    expect(mocks.rpc).not.toHaveBeenCalledWith("set_my_team_data_consent", expect.anything());
    await authorize();
    await screen.findByRole("heading", { name: "Acesso à equipe confirmado" });
    expect(mocks.rpc).toHaveBeenCalledWith("set_my_team_data_consent", { p_allow: true, p_version: consent.version });
    expect(mocks.profileFilter).toHaveBeenCalledWith("user_id", user.id);
    expect(mocks.teamFilter).toHaveBeenCalledWith("profile_id", "own-profile");
    expect(screen.getByText(/Agora feche o \+Louvor por completo/)).toBeInTheDocument();
  });
  it("keeps the option to decline without querying teams or saving consent", async () => {
    mount(); fireEvent.click(await screen.findByRole("link", { name: "Continuar sem autorizar" }));
    await screen.findByText("Escolhas sem acesso à equipe");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith("set_my_team_data_consent", expect.anything());
  });
  it("fails closed on consent read errors, then lets the person retry", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } }); mount();
    await screen.findByText("Não foi possível conferir sua escolha de privacidade.");
    expect(mocks.from).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("checkbox")).not.toBeChecked();
  });
  it("does not confirm access when saving consent fails", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "set_my_team_data_consent" ? { data: null, error: { message: "failed" } } : { data: consent, error: null });
    mount(); await authorize(); await screen.findByText("Não foi possível salvar sua escolha. Tente novamente.");
    expect(mocks.from).not.toHaveBeenCalled(); expect(screen.queryByText("Acesso à equipe confirmado")).not.toBeInTheDocument();
  });
  it.each(["profile", "teams"])("shows a retry, never onboarding, when the %s query fails", async table => {
    mocks[table].mockResolvedValueOnce({ data: null, error: { message: "backend failure" } }); mount(); await authorize();
    await screen.findByRole("heading", { name: "Ainda não conseguimos confirmar o acesso" });
    expect(screen.queryByRole("button", { name: /criar/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Acesso à equipe confirmado")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByRole("heading", { name: "Acesso à equipe confirmado" });
  });
  it.each(["profile", "teams"])("does not invent an onboarding flow when the %s result is empty", async table => {
    mocks[table].mockResolvedValue({ data: table === "profile" ? null : [], error: null }); mount(); await authorize();
    await screen.findByRole("heading", { name: "Equipe ainda não encontrada" });
    expect(screen.queryByRole("button", { name: /criar/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Acesso à equipe confirmado")).not.toBeInTheDocument();
  });
  it("does not query a profile when the authenticated identity changed", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "different-user" } }, error: null }); mount(); await authorize();
    await screen.findByRole("alert"); expect(mocks.from).not.toHaveBeenCalled();
    expect(screen.queryByText("Acesso à equipe confirmado")).not.toBeInTheDocument();
  });
  it("ignores a stale initial session after a sign-out event", async () => {
    let resolveSession!: (value: unknown) => void;
    mocks.getSession.mockReturnValue(new Promise(resolve => { resolveSession = resolve; })); mount();
    act(() => mocks.listener?.("SIGNED_OUT", null));
    await screen.findByRole("link", { name: "Entrar na minha conta" });
    await act(async () => resolveSession({ data: { session: { user } }, error: null }));
    expect(screen.queryByText(user.email)).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("checks existing consent without granting it again and clears the result when switching accounts", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...consent, allowed: true }, error: null }); mount();
    await screen.findByRole("heading", { name: "Acesso à equipe confirmado" });
    expect(mocks.rpc).not.toHaveBeenCalledWith("set_my_team_data_consent", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Entrar com outra conta" }));
    await screen.findByRole("link", { name: "Entrar na minha conta" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(screen.queryByText(user.email)).not.toBeInTheDocument();
    expect(screen.queryByText("Acesso à equipe confirmado")).not.toBeInTheDocument();
  });
  it("offers retry instead of pretending to be logged out when session lookup fails", async () => {
    mocks.getSession.mockRejectedValueOnce(new Error("offline")); mount();
    await screen.findByRole("alert"); expect(screen.queryByRole("link", { name: "Entrar na minha conta" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByRole("checkbox"); expect(mocks.from).not.toHaveBeenCalled();
  });
});
