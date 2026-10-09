import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), login: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), toast: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: mocks.getSession, signInWithPassword: mocks.login }, rpc: mocks.rpc, functions: { invoke: mocks.invoke } } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/InstallPWABanner", () => ({ InstallPWABanner: () => null }));
vi.mock("@/components/SocialLoginButtons", () => ({ SocialLoginButtons: () => null }));
vi.mock("@/components/auth/LoginShowcase", () => ({ LoginShowcase: () => null }));
import AcceptInvite from "./AcceptInvite";
import Login from "./Login";
const token = "911021fb-bdbf-4300-8f22-4f602f61673c";
beforeEach(() => {
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.login.mockImplementation(async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "qa" } } } });
    return { error: null };
  });
  mocks.rpc.mockImplementation(async (name: string) => ({ error: null, data: { allowed: name === "set_my_team_data_consent", version: "2026-10-08", accepted_at: null } }));
  mocks.invoke.mockResolvedValue({ data: { success: true }, error: null });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("invitation login continuity", () => {
  it("resumes the invitation after password login, requesting individual consent before accepting", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[`/invite/${token}`]}><Routes>
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/login" element={<Login />} />
      <Route path="/app/repertorios" element={<p>Equipe aberta</p>} />
    </Routes></MemoryRouter></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Entrar" }));
    await screen.findByRole("heading", { name: "Entre na sua conta" });
    expect(screen.getByRole("link", { name: /Criar conta grátis/ })).toHaveAttribute("href", `/signup?redirect=${encodeURIComponent(`/invite/${token}`)}`);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "qa@example.test" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "fixture-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    const consent = await screen.findByRole("checkbox");
    expect(consent).not.toBeChecked(); expect(mocks.invoke).not.toHaveBeenCalled();
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole("button", { name: "Autorizar e continuar" }));
    await screen.findByText("Bem-vindo à equipe!");
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("accept-invite", { body: { token } }));
    expect(mocks.rpc).toHaveBeenCalledWith("set_my_team_data_consent", { p_allow: true, p_version: "2026-10-08" });
    qc.clear();
  });
});
