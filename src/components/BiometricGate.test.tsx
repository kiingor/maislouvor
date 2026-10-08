import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const m = vi.hoisted(() => ({ native: true, status: vi.fn(), unlock: vi.fn(), lock: vi.fn(), enable: vi.fn(), clear: vi.fn(), getSession: vi.fn(), onAuth: vi.fn(), addListener: vi.fn(), stop: vi.fn(), start: vi.fn() }));
vi.mock("@/lib/biometricStorage", () => ({ isFaceIdPlatform: () => m.native, sessionStorageKey: "test-session", enableFaceId: m.enable, BiometricSession: { status: m.status, unlock: m.unlock, lock: m.lock, clear: m.clear } }));
vi.mock("@capacitor/app", () => ({ App: { addListener: m.addListener } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: m.getSession, onAuthStateChange: m.onAuth, stopAutoRefresh: m.stop, startAutoRefresh: m.start } } }));
import { BiometricGate } from "./BiometricGate";
const session = { user: { id: "test-user" }, access_token: "test", refresh_token: "test" };
const mount = () => render(<QueryClientProvider client={new QueryClient()}><BiometricGate><p>Conteúdo da conta</p></BiometricGate></QueryClientProvider>);
beforeEach(() => {
  vi.clearAllMocks(); const memory = new Map<string, string>(); vi.stubGlobal("localStorage", { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k), clear: () => memory.clear() }); m.native = true;
  m.status.mockResolvedValue({ available: true, enabled: false, locked: false });
  m.lock.mockResolvedValue(undefined); m.unlock.mockResolvedValue(undefined); m.enable.mockResolvedValue(undefined);
  m.getSession.mockResolvedValue({ data: { session }, error: null });
  m.onAuth.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  m.addListener.mockResolvedValue({ remove: vi.fn() }); m.stop.mockResolvedValue(undefined); m.start.mockResolvedValue(undefined);
});
const signIn = async () => { await waitFor(() => expect(m.onAuth).toHaveBeenCalled()); act(() => m.onAuth.mock.calls[0][0]("SIGNED_IN", session)); };
describe("Face ID opt-in and access gate", () => {
  it("offers Face ID after the first successful sign-in", async () => {
    mount(); await signIn(); expect(await screen.findByText("Entrar com Face ID nas próximas vezes?")).toBeVisible();
    expect(m.enable).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ativar Face ID" }));
    await waitFor(() => expect(m.enable).toHaveBeenCalledWith(session));
  });
  it("respects Agora não on later logins", async () => {
    const view = mount(); await signIn(); fireEvent.click(await screen.findByRole("button", { name: "Agora não" }));
    view.unmount(); m.onAuth.mockClear(); mount(); await signIn();
    expect(screen.queryByText("Entrar com Face ID nas próximas vezes?")).toBeNull(); expect(m.enable).not.toHaveBeenCalled();
  });
  it("keeps the account hidden when Face ID is cancelled", async () => {
    m.status.mockResolvedValue({ available: true, enabled: true, locked: true }); m.unlock.mockRejectedValue({ code: "CANCELED" });
    mount(); await waitFor(() => expect(m.unlock).toHaveBeenCalledOnce());
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível entrar");
    expect(screen.queryByText("Conteúdo da conta")).toBeNull(); expect(m.getSession).not.toHaveBeenCalled();
  });
  it("shows the account only after biometric unlock and a usable session", async () => {
    m.status.mockResolvedValueOnce({ available: true, enabled: true, locked: true }).mockResolvedValue({ available: true, enabled: true, locked: false });
    mount(); expect(screen.queryByText("Conteúdo da conta")).toBeNull();
    expect(await screen.findByText("Conteúdo da conta")).toBeVisible(); expect(m.unlock).toHaveBeenCalledOnce(); expect(m.getSession).toHaveBeenCalledOnce();
  });
  it("does not let an expired or revoked session through after Face ID", async () => {
    m.status.mockResolvedValue({ available: true, enabled: true, locked: true }); m.getSession.mockResolvedValue({ data: { session: null }, error: new Error("revoked") });
    mount(); await screen.findByRole("alert"); expect(screen.queryByText("Conteúdo da conta")).toBeNull(); expect(m.lock).toHaveBeenCalled();
  });
  it("locks protected content after entering the background", async () => {
    m.status.mockResolvedValue({ available: true, enabled: true, locked: false }); mount();
    await screen.findByText("Conteúdo da conta"); await waitFor(() => expect(m.addListener).toHaveBeenCalledTimes(2));
    await act(async () => m.addListener.mock.calls.find(([event]) => event === "pause")![1]());
    await waitFor(() => expect(screen.queryByText("Conteúdo da conta")).toBeNull()); expect(m.stop).toHaveBeenCalled(); expect(m.lock).toHaveBeenCalled();
  });
  it("leaves web and devices without Face ID unchanged", async () => {
    m.native = false; mount(); expect(screen.getByText("Conteúdo da conta")).toBeVisible(); expect(m.status).not.toHaveBeenCalled();
  });
});
