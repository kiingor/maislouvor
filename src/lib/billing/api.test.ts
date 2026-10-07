import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMemberCapacity, getWebBillingPortal } from './api';
const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, functions: { invoke } } }));
beforeEach(() => { vi.resetAllMocks(); });
describe('web billing API', () => {
  it('does not contact billing for unlimited or available capacity', async () => {
    for (const capacity of [{ can_add_member: true }, { can_add_member: false, is_unlimited: true }]) {
      rpc.mockResolvedValue({ data: capacity, error: null });
      expect(await getMemberCapacity('team')).toEqual(capacity);
    }
    expect(invoke).not.toHaveBeenCalled();
  });
  it('rechecks authoritative capacity after refreshing a late renewal', async () => {
    rpc.mockResolvedValueOnce({ data: { can_add_member: false }, error: null })
      .mockResolvedValueOnce({ data: { can_add_member: true, member_limit: 20 }, error: null });
    invoke.mockResolvedValue({ data: { refreshed: true }, error: null });
    expect(await getMemberCapacity('team')).toEqual({ can_add_member: true, member_limit: 20 });
    expect(invoke).toHaveBeenCalledWith('revenuecat-sync', { body: { team_id: 'team', capacity_only: true } });
  });
  it('keeps free-team capacity when no renewal needs refreshing', async () => {
    rpc.mockResolvedValue({ data: { can_add_member: false, member_limit: 5 }, error: null });
    invoke.mockResolvedValue({ data: { refreshed: false }, error: null });
    expect(await getMemberCapacity('team')).toEqual({ can_add_member: false, member_limit: 5 });
    expect(rpc).toHaveBeenCalledOnce();
  });
  it('surfaces renewal outages instead of sending the owner to buy again', async () => {
    rpc.mockResolvedValue({ data: { can_add_member: false }, error: null });
    invoke.mockResolvedValue({ error: new Error('offline') });
    await expect(getMemberCapacity('team')).rejects.toThrow('renovação');
  });
  it('displays actionable provider rejection without using an unverified portal URL', async () => {
    invoke.mockResolvedValue({ error: { context: new Response(JSON.stringify({ error: 'O preço foi atualizado.' }), { status: 409 }) } });
    await expect(getWebBillingPortal('team')).rejects.toThrow('preço');
  });
});
