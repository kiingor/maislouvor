import { renderHook, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import { useMusicManagement } from "./useMusicManagement";
import { youtubeImportEnabled } from "@/lib/storeBuild";

const team = vi.hoisted(() => ({ leader: true, permission: true }));
vi.mock("@/contexts/TeamContext", () => ({
  useTeam: () => ({ isAdmin: team.leader, can: () => team.permission }),
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("web leader authoring", () => {
  it.each([
    ["web leader", false, "0", true, true, true],
    ["web editor", false, "0", false, true, false],
    ["web denied resource", false, "0", true, false, false],
    ["native leader, including APK", true, "0", true, true, false],
    ["store bundle preview", false, "1", true, true, false],
    ["native viewer", true, "1", false, false, false],
  ])("%s", (_, native, flag, leader, permission, allowed) => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(native);
    vi.stubEnv("VITE_STORE_BUILD", flag);
    team.leader = leader;
    team.permission = permission;
    const { result } = renderHook(useMusicManagement);
    expect(result.current).toEqual({ canAuthorSongs: allowed, canCreateRepertoire: allowed,
      canShowSongWebNotice: (native || flag === "1") && leader && permission,
      canShowRepertoireWebNotice: (native || flag === "1") && leader && permission,
    });
    expect(youtubeImportEnabled()).toBe(!native && flag !== "1");
  });
});
