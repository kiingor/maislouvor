import { describe, expect, it, vi } from "vitest";
import { completeNativeAuth, NATIVE_AUTH_CALLBACK as callback } from "./nativeAuth";

const auth = () => ({ setSession: vi.fn().mockResolvedValue({ data: { session: {} }, error: null }), exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: {} }, error: null }) });
describe("native authentication callback", () => {
  it.each(["https://evil.test/auth/callback#access_token=a&refresh_token=b", "other://auth/callback", "com.maislouvor.app://evil/auth/callback", "com.maislouvor.app://auth/callback/extra", "com.maislouvor.app://user@auth/callback", "invalid"])("ignores unrelated URLs: %s", async url => {
    const client = auth();
    expect(await completeNativeAuth(url, client)).toBe(false);
    expect(client.setSession).not.toHaveBeenCalled();
    expect(client.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it("rejects bearer tokens sent through the public custom URL scheme", async () => {
    const client = auth();
    await expect(completeNativeAuth(`${callback}#access_token=access&refresh_token=refresh`, client)).rejects.toThrow();
    expect(client.setSession).not.toHaveBeenCalled();
  });
  it("supports an authorization-code response", async () => {
    const client = auth();
    expect(await completeNativeAuth(`${callback}?code=sample`, client)).toBe(true);
    expect(client.exchangeCodeForSession).toHaveBeenCalledWith("sample");
  });
  it.each(["", "#access_token=only", "#error=access_denied", "?error=access_denied"])("rejects incomplete or denied login: %s", async suffix => {
    const client = auth();
    await expect(completeNativeAuth(callback + suffix, client)).rejects.toThrow();
    expect(client.setSession).not.toHaveBeenCalled();
  });
  it.each([{ data: { session: null }, error: null }, { data: { session: null }, error: new Error("expired") }])("rejects an invalid server session", async result => {
    const client = auth(); client.exchangeCodeForSession.mockResolvedValue(result);
    await expect(completeNativeAuth(`${callback}?code=sample`, client)).rejects.toThrow();
  });
});
