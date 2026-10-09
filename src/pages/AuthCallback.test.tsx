import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { memoryStorage } from "@/test/memoryStorage";
import { rememberAuthRedirect } from "@/lib/authRedirect";
const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("./Login", () => ({ AuthAppIcon: () => null, AuthScreen: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
import AuthCallback from "./AuthCallback";
const invite = "/invite/911021fb-bdbf-4300-8f22-4f602f61673c";
function mount(entry = "/auth/callback") {
  render(<StrictMode><MemoryRouter initialEntries={[entry]}><Routes>
    <Route path="/auth/callback" element={<AuthCallback />} />
    <Route path="/invite/:token" element={<p>Convite recuperado</p>} />
    <Route path="/app/home" element={<p>Início</p>} />
  </Routes></MemoryRouter></StrictMode>);
}
beforeEach(() => {
  vi.stubGlobal("sessionStorage", memoryStorage());
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: "qa" } } } });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("OAuth and email confirmation destinations", () => {
  it("returns Google OAuth to its saved invitation even under StrictMode", async () => {
    rememberAuthRedirect(invite); mount();
    expect(await screen.findByText("Convite recuperado")).toBeVisible();
    expect(sessionStorage.length).toBe(0);
  });
  it("returns cross-device email confirmation to the invitation from the URL", async () => {
    mount(`/auth/callback?redirect=${encodeURIComponent(invite)}`);
    expect(await screen.findByText("Convite recuperado")).toBeVisible();
  });
  it("rejects an external destination in the callback", async () => {
    mount("/auth/callback?redirect=https%3A%2F%2Fevil.test");
    expect(await screen.findByText("Início")).toBeVisible();
  });
});
