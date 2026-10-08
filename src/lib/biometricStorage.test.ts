import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBiometricStorage, type BiometricPlugin } from "./biometricStorage";
const key = "test-session";
const plugin = () => ({
  status: vi.fn().mockResolvedValue({ available: true, enabled: true, locked: false }),
  read: vi.fn().mockResolvedValue({ value: "protected-session" }),
  write: vi.fn().mockResolvedValue(undefined), clear: vi.fn().mockResolvedValue(undefined),
  enable: vi.fn(), unlock: vi.fn(), lock: vi.fn(),
} satisfies BiometricPlugin);
beforeEach(() => { const memory = new Map<string, string>(); vi.stubGlobal("localStorage", { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k), clear: () => memory.clear() }); });
describe("Face ID session storage", () => {
  it("removes the legacy copy and reads only the unlocked keychain session", async () => {
    const native = plugin(); localStorage.setItem(key, "legacy-token");
    expect(await createBiometricStorage(key, native, localStorage).getItem(key)).toBe("protected-session");
    expect(localStorage.getItem(key)).toBeNull();
  });
  it("never falls back to a legacy token while locked", async () => {
    const native = plugin(); native.status.mockResolvedValue({ enabled: true, available: false, locked: true });
    localStorage.setItem(key, "legacy-token");
    expect(await createBiometricStorage(key, native, localStorage).getItem(key)).toBeNull();
    expect(native.read).not.toHaveBeenCalled(); expect(localStorage.getItem(key)).toBeNull();
  });
  it("fails closed if the native security status cannot be read", async () => {
    const native = plugin(); native.status.mockRejectedValue(new Error("native failed")); localStorage.setItem(key, "legacy-token");
    await expect(createBiometricStorage(key, native, localStorage).getItem(key)).rejects.toThrow();
    expect(native.read).not.toHaveBeenCalled();
  });
  it("preserves ordinary login before Face ID opt-in", async () => {
    const native = plugin(); native.status.mockResolvedValue({ enabled: false, available: true, locked: false });
    const storage = createBiometricStorage(key, native, localStorage);
    await storage.setItem(key, "normal-session"); expect(await storage.getItem(key)).toBe("normal-session");
    expect(native.write).not.toHaveBeenCalled();
  });
  it("persists refreshed credentials in keychain only", async () => {
    const native = plugin(); const storage = createBiometricStorage(key, native, localStorage);
    await storage.setItem(key, "refreshed-session");
    expect(native.write).toHaveBeenCalledWith({ key, value: "refreshed-session" }); expect(localStorage.getItem(key)).toBeNull();
  });
  it("does not downgrade to localStorage when keychain writing fails", async () => {
    const native = plugin(); native.write.mockRejectedValue(new Error("locked"));
    await expect(createBiometricStorage(key, native, localStorage).setItem(key, "secret")).rejects.toThrow();
    expect(localStorage.getItem(key)).toBeNull();
  });
  it("removes credentials from both stores on sign-out", async () => {
    const native = plugin(); localStorage.setItem(key, "legacy-token");
    await createBiometricStorage(key, native, localStorage).removeItem(key);
    expect(native.clear).toHaveBeenCalledWith({ key }); expect(localStorage.getItem(key)).toBeNull();
  });
  it("keeps non-session keys independent from biometrics", async () => {
    const native = plugin(); const storage = createBiometricStorage(key, native, localStorage);
    await storage.setItem("code-verifier", "verifier"); expect(await storage.getItem("code-verifier")).toBe("verifier");
    await storage.removeItem("code-verifier"); expect(native.status).not.toHaveBeenCalled(); expect(native.clear).not.toHaveBeenCalled();
  });
});
