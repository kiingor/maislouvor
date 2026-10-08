import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  platform: "ios",
  rpc: vi.fn().mockResolvedValue({ error: null }),
  addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  checkPermissions: vi.fn().mockResolvedValue({ receive: "prompt" }),
  requestPermissions: vi.fn().mockResolvedValue({ receive: "granted" }),
  register: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => mocks.platform,
    isNativePlatform: () => mocks.platform !== "web",
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    addListener: mocks.addListener,
    checkPermissions: mocks.checkPermissions,
    requestPermissions: mocks.requestPermissions,
    register: mocks.register,
  },
}));
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: { addListener: vi.fn(), schedule: vi.fn() },
}));

describe("registro de push nativo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(["ios", "web"])("não pede permissão nem envia tokens nativos em %s", async (platform) => {
    mocks.platform = platform;
    const { registerNativePush } = await import("./push");
    await registerNativePush();

    expect(mocks.addListener).not.toHaveBeenCalled();
    expect(mocks.checkPermissions).not.toHaveBeenCalled();
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("mantém o registro e o envio do token FCM no Android", async () => {
    mocks.platform = "android";
    const { registerNativePush } = await import("./push");
    await registerNativePush();

    expect(mocks.requestPermissions).toHaveBeenCalledOnce();
    expect(mocks.register).toHaveBeenCalledOnce();
    const registration = mocks.addListener.mock.calls.find(([event]) => event === "registration");
    expect(registration).toBeDefined();
    await registration![1]({ value: "android-fcm-token" });
    expect(mocks.rpc).toHaveBeenCalledWith("save_device_token", {
      p_token: "android-fcm-token",
      p_platform: "android",
    });
  });
});
