import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
const mock = vi.hoisted(() => ({ native: true, addListener: vi.fn(), getLaunchUrl: vi.fn(), remove: vi.fn(), close: vi.fn(), setSession: vi.fn(), toast: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => mock.native } }));
vi.mock("@capacitor/app", () => ({ App: { addListener: mock.addListener, getLaunchUrl: mock.getLaunchUrl } }));
vi.mock("@capacitor/browser", () => ({ Browser: { close: mock.close } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { setSession: mock.setSession } } }));
vi.mock("@/lib/nativeGoogleOAuth", () => ({ exchangeNativeGoogleCode: mock.setSession }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mock.toast }) }));
import { NativeAuthHandler } from "./NativeAuthHandler";
let attempt = 0;
let url: string;
const mount = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><NativeAuthHandler /><Routes><Route path="/" element={<p>Login</p>} /><Route path="/app/home" element={<p>Home</p>} /></Routes></MemoryRouter>);
beforeEach(() => {
  vi.clearAllMocks(); mock.native = true;
  url = `com.maislouvor.app://auth/callback?code=sample-${++attempt}`;
  mock.addListener.mockResolvedValue({ remove: mock.remove }); mock.getLaunchUrl.mockResolvedValue(undefined);
  mock.remove.mockResolvedValue(undefined); mock.close.mockResolvedValue(undefined);
  mock.setSession.mockResolvedValue({ data: { session: {} }, error: null });
});
describe("native authentication lifecycle", () => {
  it("finishes sign-in when the callback launches the app", async () => {
    mock.getLaunchUrl.mockResolvedValue({ url }); mount();
    expect(await screen.findByText("Home")).toBeVisible();
    expect(mock.setSession).toHaveBeenCalledOnce();
    await waitFor(() => expect(mock.close).toHaveBeenCalledOnce());
  });
  it("handles a warm callback and ignores duplicate delivery", async () => {
    mount(); await waitFor(() => expect(mock.addListener).toHaveBeenCalledOnce());
    const handle = mock.addListener.mock.calls[0][1];
    await act(async () => { await Promise.all([handle({ url }), handle({ url })]); });
    expect(await screen.findByText("Home")).toBeVisible(); expect(mock.setSession).toHaveBeenCalledOnce();
  });
  it("does not replay the cold-launch code after Face ID remounts the routes", async () => {
    mock.getLaunchUrl.mockResolvedValue({ url });
    const view = mount(); await screen.findByText("Home"); view.unmount();
    mount(); await waitFor(() => expect(mock.getLaunchUrl).toHaveBeenCalledTimes(2));
    expect(mock.setSession).toHaveBeenCalledOnce(); expect(mock.toast).not.toHaveBeenCalled();
  });
  it("stays at login if session verification fails, closing the browser", async () => {
    mock.setSession.mockResolvedValue({ data: { session: null }, error: new Error("invalid") });
    mock.getLaunchUrl.mockResolvedValue({ url }); mount();
    await waitFor(() => expect(mock.toast).toHaveBeenCalledOnce());
    expect(screen.getByText("Login")).toBeVisible(); expect(mock.close).toHaveBeenCalledOnce();
  });
  it("does not subscribe on the web", async () => {
    mock.native = false; mount(); await act(async () => {}); expect(mock.addListener).not.toHaveBeenCalled();
  });
  it("removes a listener even if setup completes after unmount", async () => {
    let finish!: (value: { remove: typeof mock.remove }) => void;
    mock.addListener.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = mount(); await waitFor(() => expect(mock.addListener).toHaveBeenCalledOnce()); view.unmount();
    await act(async () => { finish({ remove: mock.remove }); });
    expect(mock.remove).toHaveBeenCalledOnce(); expect(mock.getLaunchUrl).not.toHaveBeenCalled();
  });
});
