import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStorage } from "@/test/memoryStorage";
import { authPageUrl, clearAuthRedirect, consumeAuthRedirect, rememberAuthRedirect, safeAppRedirect, RECOVER_ACCESS_PATH } from "./authRedirect";

const invite = "/invite/911021fb-bdbf-4300-8f22-4f602f61673c";
beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
  vi.useRealTimers();
});
describe("safe authentication destinations", () => {
  it.each([invite, "/app/home", "/app/settings#excluir-conta", RECOVER_ACCESS_PATH])("preserves %s", path => expect(safeAppRedirect(path)).toBe(path));
  it.each(["https://evil.test/app/home", "//evil.test/app/home", "/app/\\evil", "/app/../../login", "/app/%2e%2e/login", "/app/%5cevil", "/invite/abc", `${invite}/extra`, `${invite}?redirect=https://evil.test`, "/login", "/app/\n"])("rejects %s", path => expect(safeAppRedirect(path)).toBe("/app/home"));
  it("preserves the invitation across login/signup links", () => {
    expect(authPageUrl("/signup", invite)).toBe(`/signup?redirect=${encodeURIComponent(invite)}`);
    expect(authPageUrl("/login", "https://evil.test")).toBe("/login");
  });
  it("returns to recovery after password or OAuth login without allowing other download paths", () => {
    expect(authPageUrl("/login", RECOVER_ACCESS_PATH)).toBe(`/login?redirect=${encodeURIComponent(RECOVER_ACCESS_PATH)}`);
    for (const native of [false, true]) {
      rememberAuthRedirect(RECOVER_ACCESS_PATH, native);
      expect(consumeAuthRedirect(null, native)).toBe(RECOVER_ACCESS_PATH);
    }
    for (const path of ["/baixar", `${RECOVER_ACCESS_PATH}/extra`, `${RECOVER_ACCESS_PATH}?redirect=https://evil.test`, "/baixar/../login"])
      expect(safeAppRedirect(path)).toBe("/app/home");
  });
  it("consumes a web OAuth destination only once", () => {
    rememberAuthRedirect(invite);
    expect(localStorage.length).toBe(0);
    expect(consumeAuthRedirect()).toBe(invite);
    expect(consumeAuthRedirect()).toBe("/app/home");
  });
  it("keeps a native OAuth destination across the callback cold launch", () => {
    rememberAuthRedirect(invite, true);
    expect(sessionStorage.length).toBe(0);
    expect(consumeAuthRedirect(null, true)).toBe(invite);
    expect(localStorage.length).toBe(0);
  });
  it("expires a cancelled OAuth attempt after 30 minutes", () => {
    vi.useFakeTimers(); rememberAuthRedirect(invite);
    vi.advanceTimersByTime(30 * 60_000 + 1);
    expect(consumeAuthRedirect()).toBe("/app/home");
  });
  it("clears both destinations on sign-out", () => {
    rememberAuthRedirect(invite); rememberAuthRedirect(invite, true); clearAuthRedirect();
    expect(consumeAuthRedirect()).toBe("/app/home");
    expect(consumeAuthRedirect(null, true)).toBe("/app/home");
  });
  it("never trusts a callback or stored redirect to another host", () => {
    sessionStorage.setItem("maislouvor-auth-destination", JSON.stringify({ path: "https://evil.test", expiresAt: Date.now() + 1000 }));
    expect(consumeAuthRedirect()).toBe("/app/home");
    rememberAuthRedirect(invite);
    expect(consumeAuthRedirect("//evil.test")).toBe("/app/home");
  });
});
