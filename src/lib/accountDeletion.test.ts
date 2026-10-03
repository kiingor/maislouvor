import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isCallerAlreadyDeleted,
  isDeletionConfirmed,
  isMissingUserError,
  jwtSubject,
  runAccountDeletion,
  storageBatches,
  type DeleteDataResult,
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
  personal: { chat_messages: 0, support_tickets: 0, draft_songs: 0 },
  ...overrides,
});

const dataResult = (overrides: Partial<DeleteDataResult> = {}): DeleteDataResult => ({
  deleted: true, already_deleted: false, deleted_team_ids: ["team-c"], left_team_count: 1, storage_objects: [], ...overrides,
});

function deps(overrides: Partial<DeletionDeps> = {}) {
  const calls: string[] = [];
  const base: DeletionDeps = {
    preview: vi.fn(async () => { calls.push("preview"); return preview(); }),
    deleteData: vi.fn(async () => { calls.push("db"); return dataResult(); }),
    removeStorage: vi.fn(async (bucket: string, paths: string[]) => { calls.push(`remove:${bucket}:${paths.length}`); }),
    storageDone: vi.fn(async (_userId: string, objects: unknown[]) => { calls.push(`done:${objects.length}`); }),
    deleteAuthUser: vi.fn(async () => { calls.push("auth"); }),
    ...overrides,
  };
  return { deps: base, calls };
}
const jwt = (payload: unknown) => `Bearer h.${btoa(JSON.stringify(payload)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}.sig`;

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

  it("runs preview, database, storage (from the database's list) and auth in this order", async () => {
    const objects = [{ bucket: "avatars", path: "u/a.webp" }, { bucket: "chat", path: "t/1.jpg" }];
    const { deps: d, calls } = deps({
      deleteData: vi.fn(async () => { calls.push("db"); return dataResult({ storage_objects: objects }); }),
    });
    const outcome = await runAccountDeletion("user-1", d);
    expect(outcome).toEqual({ status: 200, body: { ok: true, already_deleted: false, deleted_team_ids: ["team-c"] } });
    expect(calls).toEqual(["preview", "db", "remove:avatars:1", "remove:chat:1", "done:2", "auth"]);
    expect(d.deleteData).toHaveBeenCalledWith("user-1");
    expect(d.storageDone).toHaveBeenCalledWith("user-1", objects);
    expect(d.deleteAuthUser).toHaveBeenCalledWith("user-1");
  });

  it("never touches files when the database part fails", async () => {
    const { deps: d, calls } = deps({ deleteData: vi.fn(async () => { calls.push("db"); throw { code: "23503", message: "fk" }; }) });
    const outcome = await runAccountDeletion("user-1", d);
    expect(outcome).toMatchObject({ status: 500, body: { error: "database_failed", message: expect.stringContaining("Nada foi apagado") } });
    expect(calls).toEqual(["preview", "db"]);
    expect(d.removeStorage).not.toHaveBeenCalled();
    expect(d.deleteAuthUser).not.toHaveBeenCalled();
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
    expect(d.deleteData).not.toHaveBeenCalled();
    expect(d.removeStorage).not.toHaveBeenCalled();
  });

  it("keeps the login and the queue when the storage cleanup fails, so a retry finishes it", async () => {
    const { deps: d } = deps({
      deleteData: vi.fn(async () => dataResult({ storage_objects: [{ bucket: "chat", path: "t/1.jpg" }] })),
      removeStorage: vi.fn(async () => { throw new Error("storage offline"); }),
    });
    const log = vi.fn();
    const outcome = await runAccountDeletion("user-1", { ...d, log });
    expect(outcome.status).toBe(502);
    expect(outcome.body).toMatchObject({ ok: false, error: "storage_failed", message: expect.stringContaining("Tente novamente") });
    expect(d.storageDone).not.toHaveBeenCalled();
    expect(d.deleteAuthUser).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("storage", expect.any(Error));

    // Nova tentativa: o banco já foi, devolve o que ficou na fila, e a conta termina de sair.
    const retry = deps({
      preview: vi.fn(async () => preview({ has_profile: false })),
      deleteData: vi.fn(async () => dataResult({
        deleted: false, already_deleted: true, deleted_team_ids: [], left_team_count: 0,
        storage_objects: [{ bucket: "chat", path: "t/1.jpg" }],
      })),
    });
    expect(await runAccountDeletion("user-1", retry.deps)).toEqual({
      status: 200, body: { ok: true, already_deleted: true, deleted_team_ids: [] },
    });
    expect(retry.deps.deleteData).toHaveBeenCalledWith("user-1");
    expect(retry.calls).toEqual(["remove:chat:1", "done:1", "auth"]);
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

  it("reports an auth failure so the person can retry", async () => {
    const auth = deps({ deleteAuthUser: vi.fn(async () => { throw new Error("gotrue down"); }) });
    const outcome = await runAccountDeletion("user-1", auth.deps);
    expect(outcome.status).toBe(502);
    expect(outcome.body).toMatchObject({ error: "auth_failed" });
  });

  it("is harmless to repeat after the database part already ran", async () => {
    const { deps: d } = deps({
      preview: vi.fn(async () => preview({ has_profile: false })),
      deleteData: vi.fn(async () => dataResult({ deleted: false, already_deleted: true, deleted_team_ids: [], left_team_count: 0 })),
    });
    expect(await runAccountDeletion("user-1", d)).toEqual({
      status: 200, body: { ok: true, already_deleted: true, deleted_team_ids: [] },
    });
    expect(d.removeStorage).not.toHaveBeenCalled();
    expect(d.storageDone).not.toHaveBeenCalled();
    expect(d.deleteAuthUser).toHaveBeenCalledTimes(1);
  });

  it("only reports an already deleted account when GoTrue and the Admin API agree", async () => {
    const gone = vi.fn(async () => false);
    const missing = { code: "user_not_found", message: "User from sub claim in JWT does not exist", status: 403 };
    const token = jwt({ sub: "user-1", session_id: "s-1" });
    expect(await isCallerAlreadyDeleted(missing, token, gone)).toBe(true);
    expect(gone).toHaveBeenCalledWith("user-1");
    // GoTrue antigo, sem código: só a mensagem do usuário inexistente.
    expect(await isCallerAlreadyDeleted({ message: "User from sub claim in JWT does not exist" }, token, gone)).toBe(true);

    // Sessão revogada (logout global, reuso de refresh token): a conta existe, pede para entrar de novo.
    const revoked = { code: "session_not_found", message: "Session from session_id claim in JWT does not exist", status: 403 };
    expect(isMissingUserError(revoked)).toBe(false);
    expect(await isCallerAlreadyDeleted(revoked, token, gone)).toBe(false);
    expect(await isCallerAlreadyDeleted({ message: "invalid JWT: not found" }, token, gone)).toBe(false);
    // O Admin API ainda encontra o usuário, não sabe responder, ou o token não tem sub.
    expect(await isCallerAlreadyDeleted(missing, token, async () => true)).toBe(false);
    expect(await isCallerAlreadyDeleted(missing, token, async () => { throw new Error("offline"); })).toBe(false);
    expect(await isCallerAlreadyDeleted(missing, "Bearer lixo", gone)).toBe(false);
  });

  it("reads the subject of a base64url JWT", () => {
    // "-" e "_" no lugar de "+" e "/", sem o "=" do fim.
    for (const sub of ["?~~>", ">>>?", "u", "user-1", "6b1f2c3d-0000-4000-8000-000000000001"]) {
      expect(jwtSubject(jwt({ sub }))).toBe(sub);
    }
    expect(jwtSubject(jwt({ role: "anon" }))).toBeNull();
    expect(jwtSubject(null)).toBeNull();
    expect(jwtSubject("Bearer a.%%%.c")).toBeNull();
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
    expect(parsed.personal).toEqual({ chat_messages: 4, support_tickets: 0, draft_songs: 0 });
    expect(parseDeletionPreview({ personal: { draft_songs: 2 } }).personal.draft_songs).toBe(2);
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
