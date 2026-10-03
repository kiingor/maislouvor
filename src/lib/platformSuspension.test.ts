import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidRequestMessage,
  parseOwnershipTransferRequest,
  parsePlatformAccountRequest,
  parseSuspensionRequest,
  runOwnershipTransfer,
  runSuspension,
  SUSPENSION_BAN_DURATION,
  type SuspensionDeps,
} from "../../supabase/functions/platform-suspend-account/flow";
import { setAccountSuspension, teamsNeedingNewOwner, transferTeamOwnershipAsPlatform } from "./platformSuspension";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke }, rpc: mocks.rpc } }));

const profileId = "11111111-1111-4111-8111-111111111111";
const reportId = "22222222-2222-4222-8222-222222222222";
const teamId = "44444444-4444-4444-8444-444444444444";
const memberId = "55555555-5555-4555-8555-555555555555";
const target = { user_id: "33333333-3333-4333-8333-333333333333", profile_id: profileId, full_name: "Ana", suspended: false,
  owned_teams: [{ team_id: "t1", team_name: "Louvor Sede", other_members: 3 }, { team_id: "t2", team_name: "Só dela", other_members: 0 }] };

function deps(overrides: Partial<SuspensionDeps> = {}) {
  const calls: string[] = [];
  const d: SuspensionDeps = {
    target: vi.fn(async () => { calls.push("target"); return target; }),
    setBan: vi.fn(async (_id, banned) => { calls.push(banned ? "ban" : "unban"); }),
    record: vi.fn(async (_actor, r) => { calls.push("record"); return { suspended: r.action === "suspend", sessions_revoked: true, owned_teams: target.owned_teams }; }),
    log: vi.fn(),
    ...overrides,
  };
  return { d, calls };
}

beforeEach(() => vi.clearAllMocks());

describe("platform-suspend-account flow", () => {
  it("accepts only a profile, an action and short optional fields", () => {
    expect(parseSuspensionRequest({ profile_id: profileId, action: "suspend", reason: "  Ofensas  ", report_id: reportId }))
      .toEqual({ profileId, action: "suspend", reason: "Ofensas", reportId });
    expect(parseSuspensionRequest({ profile_id: profileId, action: "reactivate" })).toEqual({ profileId, action: "reactivate", reason: null, reportId: null });
    for (const body of [null, "x", {}, { profile_id: "abc", action: "suspend" }, { profile_id: profileId, action: "ban" },
      { profile_id: profileId, action: "suspend", reason: "x".repeat(501) }, { profile_id: profileId, action: "suspend", report_id: "1" }]) {
      expect(parseSuspensionRequest(body)).toBeNull();
    }
  });

  it("checks the target in the database, bans in the auth server and only then records", async () => {
    const { d, calls } = deps();
    const outcome = await runSuspension("actor", { profileId, action: "suspend", reason: "Ofensas", reportId }, d);
    expect(calls).toEqual(["target", "ban", "record"]);
    expect(d.setBan).toHaveBeenCalledWith(target.user_id, true);
    expect(outcome).toEqual({ status: 200, body: { ok: true, suspended: true, sessions_revoked: true, owned_teams: target.owned_teams } });
    expect(SUSPENSION_BAN_DURATION).toBe("876000h");
  });

  it("reactivates by lifting the ban", async () => {
    const { d, calls } = deps();
    expect((await runSuspension("actor", { profileId, action: "reactivate", reason: null, reportId: null }, d)).body.suspended).toBe(false);
    expect(calls).toEqual(["target", "unban", "record"]);
  });

  it("stops before the ban when the database refuses (not an admin, own account, another admin, missing)", async () => {
    for (const [code, status] of [["42501", 403], ["22023", 400], ["P0002", 404]] as const) {
      const { d, calls } = deps({ target: vi.fn(async () => { throw { code, message: "recusado" }; }) });
      const outcome = await runSuspension("actor", { profileId, action: "suspend", reason: null, reportId: null }, d);
      expect(outcome.status).toBe(status);
      expect(outcome.body).toMatchObject({ ok: false, message: "recusado" });
      expect(calls).toEqual([]);
    }
  });

  it("records nothing when the auth server fails, and asks for a retry when only the record fails", async () => {
    let { d, calls } = deps({ setBan: vi.fn(async () => { throw new Error("gotrue down"); }) });
    let outcome = await runSuspension("actor", { profileId, action: "suspend", reason: null, reportId: null }, d);
    expect([outcome.status, outcome.body.error]).toEqual([502, "auth_failed"]);
    expect(d.record).not.toHaveBeenCalled();
    ({ d, calls } = deps({ record: vi.fn(async () => { throw new Error("db"); }) }));
    outcome = await runSuspension("actor", { profileId, action: "suspend", reason: null, reportId: null }, d);
    expect([outcome.status, outcome.body.error]).toEqual([500, "record_failed"]);
    expect(String(outcome.body.message)).toMatch(/Tente de novo/);
    expect(calls).toEqual(["target", "ban"]);
  });
});

describe("platform-suspend-account: ownership transfer", () => {
  const body = { action: "transfer_ownership", team_id: ` ${teamId} `, new_owner_member_id: memberId };

  it("accepts only a team and a member id, and keeps the suspension actions apart", () => {
    expect(parseOwnershipTransferRequest(body)).toEqual({ teamId, newOwnerMemberId: memberId });
    expect(parsePlatformAccountRequest(body)).toEqual({ kind: "transfer", request: { teamId, newOwnerMemberId: memberId } });
    expect(parsePlatformAccountRequest({ profile_id: profileId, action: "suspend" }))
      .toEqual({ kind: "suspension", request: { profileId, action: "suspend", reason: null, reportId: null } });
    for (const bad of [null, {}, { ...body, team_id: "x" }, { ...body, new_owner_member_id: 7 }, { ...body, action: "transfer" },
      { team_id: teamId, new_owner_member_id: memberId }, { action: "transfer_ownership", profile_id: profileId }]) {
      expect(parseOwnershipTransferRequest(bad)).toBeNull();
    }
    // A transferência não vira suspensão (nem o contrário) por um campo a mais.
    expect(parseSuspensionRequest({ ...body, profile_id: profileId })).toBeNull();
    expect(parsePlatformAccountRequest({ action: "transfer_ownership", profile_id: profileId })).toBeNull();
    expect(invalidRequestMessage({ action: "transfer_ownership" })).toBe("Pedido inválido: informe a equipe e o novo responsável.");
    expect(invalidRequestMessage({ action: "suspend" })).toMatch(/suspender ou reativar/);
    expect(invalidRequestMessage(null)).toMatch(/suspender ou reativar/);
  });

  it("asks the database (as the service role) with the caller as actor", async () => {
    const transfer = vi.fn(async () => ({ team_id: teamId, owner_profile_id: profileId }));
    const outcome = await runOwnershipTransfer("actor", { teamId, newOwnerMemberId: memberId }, { transfer });
    expect(transfer).toHaveBeenCalledWith("actor", { teamId, newOwnerMemberId: memberId });
    expect(outcome).toEqual({ status: 200, body: { ok: true, team_id: teamId, owner_profile_id: profileId } });
  });

  it("returns the database refusals (not an admin, missing team, suspended or current owner) and hides the rest", async () => {
    for (const [code, status, error] of [["42501", 403, "forbidden"], ["P0002", 404, "not_found"], ["22023", 400, "invalid"]] as const) {
      const outcome = await runOwnershipTransfer("actor", { teamId, newOwnerMemberId: memberId }, {
        transfer: vi.fn(async () => { throw { code, message: "Essa conta está suspensa. Escolha outra pessoa." }; }),
      });
      expect(outcome).toEqual({ status, body: { ok: false, error, message: "Essa conta está suspensa. Escolha outra pessoa." } });
    }
    const log = vi.fn();
    const outcome = await runOwnershipTransfer("actor", { teamId, newOwnerMemberId: memberId }, {
      transfer: vi.fn(async () => { throw new Error("connection reset"); }),
      log,
    });
    expect([outcome.status, outcome.body.error]).toEqual([500, "unexpected"]);
    expect(String(outcome.body.message)).not.toMatch(/connection/);
    expect(log).toHaveBeenCalledWith("transfer", expect.any(Error));
  });
});

describe("platform suspension client", () => {
  it("transfers ownership through the edge function, never through a browser RPC", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true, team_id: teamId, owner_profile_id: profileId }, error: null });
    await expect(transferTeamOwnershipAsPlatform(teamId, memberId)).resolves.toEqual({ team_id: teamId, owner_profile_id: profileId });
    expect(mocks.invoke).toHaveBeenCalledWith("platform-suspend-account", {
      body: { action: "transfer_ownership", team_id: teamId, new_owner_member_id: memberId },
    });
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.invoke.mockResolvedValue({ data: null, error: { context: { json: async () => ({ ok: false, message: "Essa pessoa já é a dona da equipe." }) } } });
    await expect(transferTeamOwnershipAsPlatform(teamId, memberId)).rejects.toThrow("Essa pessoa já é a dona da equipe.");
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("Failed to send a request to the Edge Function") });
    await expect(transferTeamOwnershipAsPlatform(teamId, memberId)).rejects.toThrow("Não foi possível transferir a propriedade agora. Tente novamente.");
  });

  it("calls the edge function with the profile, action, reason and report", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true, suspended: true, sessions_revoked: false, owned_teams: target.owned_teams }, error: null });
    const result = await setAccountSuspension(profileId, "suspend", { reason: "  Ofensas ", reportId });
    expect(mocks.invoke).toHaveBeenCalledWith("platform-suspend-account", {
      body: { profile_id: profileId, action: "suspend", reason: "Ofensas", report_id: reportId },
    });
    expect(result).toEqual({ suspended: true, sessionsRevoked: false, ownedTeams: target.owned_teams });
    expect(teamsNeedingNewOwner(result.ownedTeams).map((t) => t.team_name)).toEqual(["Louvor Sede"]);
  });

  it("shows the server message when the function refuses", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: { json: async () => ({ ok: false, message: "Acesso restrito." }) } } });
    await expect(setAccountSuspension(profileId, "reactivate")).rejects.toThrow("Acesso restrito.");
  });
});
