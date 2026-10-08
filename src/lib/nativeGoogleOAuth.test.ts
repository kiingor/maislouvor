import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ exchange: vi.fn(), save: vi.fn(), create: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: m.create }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { setSession: m.save } } }));
import { exchangeNativeGoogleCode, getNativeGoogleOAuth, nativeOAuthStorage } from "./nativeGoogleOAuth";
beforeEach(() => {
  vi.clearAllMocks();
  const memory = new Map<string, string>(); vi.stubGlobal("localStorage", { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) });
  m.create.mockReturnValue({ auth: { exchangeCodeForSession: m.exchange } });
  m.save.mockResolvedValue({ data: { session: {} }, error: null });
});
describe("native Google PKCE", () => {
  it("uses PKCE separately from the email and password-reset client", () => {
    getNativeGoogleOAuth();
    expect(m.create).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.objectContaining({ auth: expect.objectContaining({ flowType: "pkce", autoRefreshToken: false, detectSessionInUrl: false }) }));
  });
  it("persists only the verifier, never a second unprotected session", () => {
    nativeOAuthStorage.setItem("maislouvor-native-google-oauth-code-verifier", "verifier");
    nativeOAuthStorage.setItem("maislouvor-native-google-oauth", "access-and-refresh-token");
    expect(nativeOAuthStorage.getItem("maislouvor-native-google-oauth-code-verifier")).toBe("verifier");
    expect(localStorage.getItem("maislouvor-native-google-oauth")).toBeNull();
    nativeOAuthStorage.removeItem("maislouvor-native-google-oauth-code-verifier");
    expect(nativeOAuthStorage.getItem("maislouvor-native-google-oauth-code-verifier")).toBeNull();
  });
  it("moves only a successfully exchanged session into the main protected storage", async () => {
    m.exchange.mockResolvedValue({ data: { session: { access_token: "access", refresh_token: "refresh" } }, error: null });
    await exchangeNativeGoogleCode("code");
    expect(m.exchange).toHaveBeenCalledWith("code"); expect(m.save).toHaveBeenCalledWith({ access_token: "access", refresh_token: "refresh" });
  });
  it("rejects a failed exchange or missing verifier without saving a session", async () => {
    m.exchange.mockResolvedValue({ data: { session: null }, error: new Error("invalid verifier") });
    const result = await exchangeNativeGoogleCode("intercepted-code");
    expect(result.error).toBeTruthy(); expect(m.save).not.toHaveBeenCalled();
  });
});
