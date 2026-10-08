import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
const mock = vi.hoisted(() => ({ platform: "ios", apple: vi.fn(), google: vi.fn(), open: vi.fn(), toast: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => mock.platform, isNativePlatform: () => mock.platform !== "web" }, registerPlugin: () => ({ authorize: mock.apple }) }));
vi.mock("@capacitor/browser", () => ({ Browser: { open: mock.open } }));
vi.mock("@/lib/nativeGoogleOAuth", () => ({ getNativeGoogleOAuth: () => ({ signInWithOAuth: mock.google }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mock.toast }) }));
const session = vi.hoisted(() => ({ signInWithIdToken: vi.fn(), invoke: vi.fn(), signOut: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: session.invoke }, auth: { signOut: session.signOut, signInWithOAuth: mock.google, signInWithIdToken: session.signInWithIdToken } } }));
import { SocialLoginButtons } from "./SocialLoginButtons";

function mount(onStart?: () => void) {
  render(<MemoryRouter><Routes><Route path="/" element={<SocialLoginButtons onStart={onStart} />} /><Route path="/app/home" element={<p>Área do app</p>} /></Routes></MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks(); mock.platform = "ios";
  mock.apple.mockResolvedValue({ identityToken: "apple-token", nonce: "raw-nonce", authorizationCode: "single-use-code" });
  session.signInWithIdToken.mockResolvedValue({ data: { session: {}, user: { id: "user", user_metadata: {} } }, error: null });
  mock.google.mockResolvedValue({ data: { url: "https://accounts.google.com/" }, error: null });
  session.invoke.mockResolvedValue({ data: { ok: true }, error: null });
  session.signOut.mockResolvedValue({ error: null });
  mock.open.mockResolvedValue(undefined);
});
describe("social login", () => {
  it.each(["web", "android"])("shows Google and hides Apple on %s", platform => {
    mock.platform = platform; mount();
    expect(screen.getByRole("button", { name: "Continuar com Google" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Entrar com Apple" })).toBeNull();
  });
  it("uses the native credential and raw nonce, then enters the app", async () => {
    const onStart = vi.fn(); mount(onStart); fireEvent.click(screen.getByRole("button", { name: "Entrar com Apple" }));
    expect(await screen.findByText("Área do app")).toBeVisible();
    expect(session.signInWithIdToken).toHaveBeenCalledWith({ provider: "apple", token: "apple-token", nonce: "raw-nonce" });
    expect(onStart).toHaveBeenCalledOnce();
    expect(session.invoke).toHaveBeenCalledWith("apple-auth-token", { body: { authorizationCode: "single-use-code" } });
  });
  it("ends the local session if secure Apple token storage fails", async () => {
    session.invoke.mockResolvedValue({ data: null, error: new Error("unavailable") });
    mount(); fireEvent.click(screen.getByRole("button", { name: "Entrar com Apple" }));
    await waitFor(() => expect(session.signOut).toHaveBeenCalledWith({ scope: "local" }));
    expect(screen.queryByText("Área do app")).toBeNull();
  });
  it("does not navigate when the server rejects Apple's credential", async () => {
    session.signInWithIdToken.mockResolvedValue({ data: { session: null, user: null }, error: new Error("invalid") });
    mount(); fireEvent.click(screen.getByRole("button", { name: "Entrar com Apple" }));
    await waitFor(() => expect(mock.toast).toHaveBeenCalledOnce());
    expect(screen.queryByText("Área do app")).toBeNull();
    expect(screen.getByRole("button", { name: "Entrar com Apple" })).toBeEnabled();
  });
  it("cancels Apple's sheet without an error or server request", async () => {
    mock.apple.mockRejectedValue({ code: "CANCELED" }); mount(); fireEvent.click(screen.getByRole("button", { name: "Entrar com Apple" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Entrar com Apple" })).toBeEnabled());
    expect(mock.toast).not.toHaveBeenCalled(); expect(session.signInWithIdToken).not.toHaveBeenCalled();
  });
  it("opens Google in the native browser with the app callback", async () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "Continuar com Google" }));
    await waitFor(() => expect(mock.open).toHaveBeenCalledWith({ url: "https://accounts.google.com/" }));
    expect(mock.google).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: "com.maislouvor.app://auth/callback", skipBrowserRedirect: true } });
  });
  it("allows retry when the native browser cannot open", async () => {
    mock.open.mockRejectedValue(new Error("unavailable")); mount(); fireEvent.click(screen.getByRole("button", { name: "Continuar com Google" }));
    await waitFor(() => expect(mock.toast).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Continuar com Google" })).toBeEnabled();
  });
  it("keeps the web callback for Google on web", async () => {
    mock.platform = "web"; mount(); fireEvent.click(screen.getByRole("button", { name: "Continuar com Google" }));
    await waitFor(() => expect(mock.google).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback`, skipBrowserRedirect: false } }));
    expect(mock.open).not.toHaveBeenCalled();
  });
});
