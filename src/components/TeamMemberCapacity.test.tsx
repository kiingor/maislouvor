import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemberCapacity } from '@/lib/billing/types';
import { TeamMemberCapacity } from './TeamMemberCapacity';
const mocks = vi.hoisted(() => ({ get: vi.fn(), view: vi.fn() }));
vi.mock('@/lib/billing/api', () => ({ getMemberCapacity: mocks.get }));
const paid: MemberCapacity = { member_count: 3, member_limit: 10, effective_plan: 'completo', is_unlimited: false, unlimited_reason: null, can_add_member: true, can_manage: true };
function mount(teamId = 'team-a', memberCountHint = 3) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (team: string, count: number) => <QueryClientProvider client={client}><TeamMemberCapacity teamId={team} profileId="profile" memberCountHint={count} onViewPlan={mocks.view} /></QueryClientProvider>;
  const result = render(ui(teamId, memberCountHint));
  return { change: (team: string, count: number) => result.rerender(ui(team, count)) };
}
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue(paid); });
describe('capacidade na aba Membros', () => {
  it('mostra vagas reais do plano e abre o gerenciamento existente', async () => {
    mount();
    expect(await screen.findByText('3 de 10 vagas')).toBeVisible();
    expect(screen.getByText('Completo')).toBeVisible();
    expect(screen.getByText(/7 vagas disponíveis/)).toBeVisible();
    expect(screen.getByText('A contagem inclui o líder.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Ver plano' }));
    expect(mocks.view).toHaveBeenCalledOnce();
  });
  it('mostra o limite gratuito e avisa quando as vagas acabaram', async () => {
    mocks.get.mockResolvedValue({ ...paid, member_count: 5, member_limit: 5, effective_plan: 'free', can_add_member: false });
    mount();
    expect(await screen.findByText('5 de 5 vagas')).toBeVisible();
    expect(screen.getByText(/Todas as vagas estão ocupadas/)).toBeVisible();
  });
  it('preserva equipes ilimitadas sem inventar um teto de integrantes', async () => {
    mocks.get.mockResolvedValue({ ...paid, member_count: 28, member_limit: null, is_unlimited: true, unlimited_reason: 'legacy' });
    mount();
    expect(await screen.findByText('28 integrantes')).toBeVisible();
    expect(screen.getByText(/Sem limite de integrantes/)).toBeVisible();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
  it('não mostra limite de outra equipe ao trocar de contexto e atualiza após mudança de membros', async () => {
    const view = mount();
    await screen.findByText('3 de 10 vagas');
    mocks.get.mockResolvedValue({ ...paid, member_count: 6, member_limit: 20 });
    view.change('team-b', 6);
    expect(screen.queryByText('3 de 10 vagas')).not.toBeInTheDocument();
    expect(await screen.findByText('6 de 20 vagas')).toBeVisible();
    mocks.get.mockResolvedValue({ ...paid, member_count: 7, member_limit: 20 });
    view.change('team-b', 7);
    expect(await screen.findByText('7 de 20 vagas')).toBeVisible();
    expect(mocks.get).toHaveBeenLastCalledWith('team-b');
  });
  it('permite repetir uma falha sem apresentar limite presumido', async () => {
    mocks.get.mockRejectedValueOnce(new Error('offline'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar o limite');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(screen.getByText('3 de 10 vagas')).toBeVisible());
  });
});
