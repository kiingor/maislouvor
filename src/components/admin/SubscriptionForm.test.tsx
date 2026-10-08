import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionForm } from './SubscriptionForm';
import { platformRpc, type Subscription } from '@/lib/platform';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/platform', async (original) => ({ ...await original<typeof import('@/lib/platform')>(), platformRpc: vi.fn() }));
const base: Subscription = { team_id: 'team', plan: 'essencial', status: 'active', provider: 'manual', member_limit: 10, monthly_amount: null, current_period_end: null, notes: '' };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(platformRpc).mockResolvedValue(base); });
afterEach(cleanup);
function mount(subscription = base) {
  render(<QueryClientProvider client={new QueryClient()}><SubscriptionForm subscription={subscription} accountName="Equipe" /></QueryClientProvider>);
}
describe('Subscription administration capacity', () => {
  it('saves manual capacity and audit inputs through the authorized RPC', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Capacidade de integrantes'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar assinatura' }));
    await waitFor(() => expect(platformRpc).toHaveBeenCalledWith('admin_update_subscription', expect.objectContaining({ p_member_limit: 20, p_is_unlimited: false, p_team_id: 'team' })));
  });
  it('keeps legacy unlimited access checked, protected and included when saving notes', async () => {
    mount({ ...base, is_unlimited: true, unlimited_reason: 'legacy' });
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByLabelText('Capacidade de integrantes')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar assinatura' }));
    await waitFor(() => expect(platformRpc).toHaveBeenCalledWith('admin_update_subscription', expect.objectContaining({ p_is_unlimited: true })));
  });
  it('allows an explicit internal grant and never increases the free capacity', async () => {
    mount({ ...base, plan: 'free', status: 'free', member_limit: 5 });
    expect(screen.getByLabelText('Capacidade de integrantes')).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar assinatura' }));
    await waitFor(() => expect(platformRpc).toHaveBeenCalledWith('admin_update_subscription', expect.objectContaining({ p_plan: 'free', p_member_limit: 5, p_is_unlimited: true })));
  });
  it('keeps store subscriptions and capacity read-only', () => {
    mount({ ...base, provider: 'revenuecat', product_id: 'essencial10' });
    expect(screen.getByLabelText('Capacidade de integrantes')).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Salvar assinatura' })).not.toBeInTheDocument();
    expect(screen.getByText(/Produto da loja: essencial10/)).toBeInTheDocument();
    expect(platformRpc).not.toHaveBeenCalled();
  });
});
