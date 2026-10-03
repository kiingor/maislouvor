import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isDeletionConfirmed,
  runAccountDeletion,
  storageBatches,
  type DeletionDeps,
  type DeletionPreview,
} from "../../supabase/functions/delete-account/flow";
import { AccountDeletionError, parseDeletionPreview, requestAccountDeletion } from "./accountDeletion";
import { safeAppRedirect } from "./authRedirect";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke }, rpc: mocks.rpc },
}));

const preview = (overrides: Partial<DeletionPreview> = {}): DeletionPreview => ({
  has_profile: true,
  can_delete: true,
  teams: [],
  personal: { chat_messages: 0, support_tickets: 0 },
  ...overrides,
});

function deps(overrides: Partial<DeletionDeps> = {}) {
  const calls: string[] = [];
  const base: DeletionDeps = {
    preview: vi.fn(async () => { calls.push("preview"); return preview(); }),
    listStorage: vi.fn(async () => { calls.push("list"); return []; }),
    removeStorage: vi.fn(async (bucket: string, paths: string[]) => { calls.push(`remove:${bucket}:${paths.length}`); }),
    deleteData: vi.fn(async () => {
      calls.push("db");
      return { deleted: true, already_deleted: false, deleted_team_ids: ["team-c"], left_team_count: 1 };
    }),
    deleteAuthUser: vi.fn(async () => { calls.push("auth"); }),
    ...overrides,
  };
  return { deps: base, calls };
}

beforeEach(() => vi.clearAllMocks());

describe("delete-account flow", () => {
  it("requires the typed confirmation, ignoring case and spaces", () => {
    expect(isDeletionConfirmed({ confirmation: " excluir " })).toBe(true);
    expect(isDeletionConfirmed({ confirmation: "EXCLUIR" })).toBe(true);
    expect(isDeletionConfirmed({ confirmation: "excluir conta" })).toBe(false);
    expect(isDeletionConfirmed({ confirmation: true })).toBe(false);
    expect(isDeletionConfirmed({ user_id: "someone-else" })).toBe(false);
    expect(isDeletionConfirmed(null)).toBe(false);
  });

  it("groups files by bucket, drops duplicates and invalid rows, and batches", () => {
    const objects = [
      ...Array.from({ length: 205 }, (_, i) => ({ bucket: "audio", path: `t/${i}.mp3` })),
      { bucket: "audio", path: "t/0.mp3" },
      { bucket: "avatars", path: "u/avatar.webp" },
      { bucket: "", path: "x" },
      { path: "sem-bucket" },
      null,
    ];
    expect(storageBatches(objects).map(([bucket, paths]) => [bucket, paths.length])).toEqual([
      ["audio", 100], ["audio", 100], ["audio", 5], ["avatars", 1],
    ]);
    expect(storageBatches("not a list")).toEqual([]);
  });

  it("runs preview, storage, database and auth in this order", async () => {
    const { deps: d, calls } = deps({
      listStorage: vi.fn(async () => {
        calls.push("list");
        return [{ bucket: "avatars", path: "u/a.webp" }, { bucket: "chat", path: "t/1.jpg" }];
      }),
    });
    const outcome = await runAccountDeletion("user-1", d);
    expect(outcome).toEqual({ status: 200, body: { ok: true, already_deleted: false, deleted_team_ids: ["team-c"] } });
    expect(calls).toEqual(["preview", "list", "remove:avatars:1", "remove:chat:1", "db", "auth"]);
    expect(d.deleteData).toHaveBeenCalledWith("user-1");
    expect(d.deleteAuthUser).toHaveBeenCalledWith("user-1");
  });

  it("stops before touching anything when a team still depends on the person", async () => {
    const { deps: d, calls } = deps({
      preview: vi.fn(async () => preview({
        can_delete: false,
        teams: [
          { team_id: "a", team_name: "Louvor Sede", role: "admin", is_owner: true, member_count: 3, action: "transfer_required", candidates: [] },
          { team_id: "c", team_name: "Solo", role: "admin", is_owner: true, member_count: 1, action: "delete_team", candidates: [] },
        ],
      })),
    });
    const outcome = await runAccountDeletion("user-1", d);
    expect(outcome.status).toBe(409);
    expect(outcome.body).toMatchObject({
      ok: false, error: "blocked",
      teams: [{ team_id: "a", team_name: "Louvor Sede", action: "transfer_required" }],
    });
    expect(calls).toEqual([]);
    expect(d.listStorage).not.toHaveBeenCalled();
    expect(d.deleteData).not.toHaveBeenCalled();
  });

  it("keeps the account when the storage cleanup fails", async () => {
    const { deps: d } = deps({
      listStorage: vi.fn(async () => [{ bucket: "chat", path: "t/1.jpg" }]),
      removeStorage: vi.fn(async () => { throw new Error("storage offline"); }),
    });
    const log = vi.fn();
    const outcome = await runAccountDeletion("user-1", { ...d, log });
    expect(outcome.status).toBe(502);
    expect(outcome.body).toMatchObject({ ok: false, error: "storage_failed" });
    expect(d.deleteData).not.toHaveBeenCalled();
    expect(d.deleteAuthUser).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("storage", expect.any(Error));
  });

  it("answers 409 when someone joins a sole-member team mid-way (database guard)", async () => {
    let call = 0;
    const { deps: d } = deps({
      preview: vi.fn(async () => (call++ === 0 ? preview() : preview({
        can_delete: false,
        teams: [{ team_id: "c", team_name: "Solo", role: "admin", is_owner: true, member_count: 2, action: "transfer_required", candidates: [] }],
      }))),
      deleteData: vi.fn(async () => { throw { code: "55000", message: "Transfira..." }; }),
    });
    const outcome = await runAccountDeletion("user-1", d);
    expect(outcome.status).toBe(409);
    expect(outcome.body.teams).toEqual([{ team_id: "c", team_name: "Solo", action: "transfer_required" }]);
    expect(d.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("reports database and auth failures so the person can retry", async () => {
    const db = deps({ deleteData: vi.fn(async () => { throw { code: "23503", message: "fk" }; }) });
    expect((await runAccountDeletion("user-1", db.deps)).body).toMatchObject({ error: "database_failed" });
    expect(db.deps.deleteAuthUser).not.toHaveBeenCalled();

    const auth = deps({ deleteAuthUser: vi.fn(async () => { throw new Error("gotrue down"); }) });
    const outcome = await runAccountDeletion("user-1", auth.deps);
    expect(outcome.status).toBe(502);
    expect(outcome.body).toMatchObject({ error: "auth_failed" });
  });

  it("is harmless to repeat after the database part already ran", async () => {
    const { deps: d } = deps({
      preview: vi.fn(async () => preview({ has_profile: false })),
      deleteData: vi.fn(async () => ({ deleted: false, already_deleted: true, deleted_team_ids: [], left_team_count: 0 })),
    });
    expect(await runAccountDeletion("user-1", d)).toEqual({
      status: 200, body: { ok: true, already_deleted: true, deleted_team_ids: [] },
    });
    expect(d.deleteAuthUser).toHaveBeenCalledTimes(1);
  });

  it("fails clearly when the preview cannot be loaded", async () => {
    const { deps: d } = deps({ preview: vi.fn(async () => { throw new Error("timeout"); }) });
    expect(await runAccountDeletion("user-1", d)).toMatchObject({ status: 500, body: { error: "preview_failed" } });
  });
});

describe("accountDeletion client helpers", () => {
  it("normalizes the preview and never trusts can_delete when a team blocks", () => {
    const parsed = parseDeletionPreview({
      can_delete: true,
      teams: [{ team_id: "a", team_name: "Sede", role: "owner?", action: "promote_required",
        candidates: [{ profile_id: "p", full_name: 3, role: "editor" }] }, { action: "weird" }],
      personal: { chat_messages: "4" },
    });
    expect(parsed.can_delete).toBe(false);
    expect(parsed.teams[0]).toMatchObject({ role: null, action: "promote_required",
      candidates: [{ profile_id: "p", full_name: null, role: "editor" }] });
    expect(parsed.teams[1]).toMatchObject({ team_name: "Equipe", action: "leave", candidates: [] });
    expect(parsed.personal).toEqual({ chat_messages: 4, support_tickets: 0 });
    expect(parseDeletionPreview(null)).toMatchObject({ has_profile: true, can_delete: false, teams: [] });
  });

  it("sends only the confirmation to the edge function", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true, already_deleted: false, deleted_team_ids: ["c"] }, error: null });
    await expect(requestAccountDeletion("EXCLUIR")).resolves.toEqual({ alreadyDeleted: false, deletedTeamIds: ["c"] });
    expect(mocks.invoke).toHaveBeenCalledWith("delete-account", { body: { confirmation: "EXCLUIR" } });
  });

  it("reads the JSON error body of a failed call", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { message: "Edge Function returned a non-2xx status code", context: {
        json: async () => ({ ok: false, error: "blocked", message: "Transfira antes.", teams: [{ team_id: "a", team_name: "Sede", action: "transfer_required" }] }),
      } },
    });
    const error = await requestAccountDeletion("EXCLUIR").catch((e) => e);
    expect(error).toBeInstanceOf(AccountDeletionError);
    expect(error).toMatchObject({ message: "Transfira antes.", code: "blocked", teams: [{ team_id: "a" }] });

    mocks.invoke.mockResolvedValue({ data: null, error: new Error("Failed to fetch") });
    await expect(requestAccountDeletion("EXCLUIR")).rejects.toMatchObject({ code: "unknown" });
  });

  it("only follows internal app paths after login", () => {
    expect(safeAppRedirect("/app/settings#excluir-conta")).toBe("/app/settings#excluir-conta");
    expect(safeAppRedirect(null)).toBe("/app/home");
    expect(safeAppRedirect("https://evil.example/app/")).toBe("/app/home");
    expect(safeAppRedirect("//evil.example/app/")).toBe("/app/home");
    expect(safeAppRedirect("/app/\\evil")).toBe("/app/home");
    expect(safeAppRedirect("/login")).toBe("/app/home");
  });
});
