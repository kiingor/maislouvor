import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TeamBilling from './TeamBilling';
import { getBillingContext, getWebBillingPortal, requireBillingOwner, syncBilling } from '@/lib/billing/api';
import { billingPlatform, getBillingOffers, expandSubscription, openBillingManagement, purchaseSubscription, restoreSubscriptions } from '@/lib/billing/revenuecat';
import type { BillingContext } from '@/lib/billing/types';
import { NativeBillingError } from '@/lib/billing/errors';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/contexts/TeamContext', () => ({ useTeam: () => ({ currentTeam: { id: 'team', name: 'Louvor Central' }, profileId: 'profile' }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/lib/billing/api', () => ({ getBillingContext: vi.fn(), getWebBillingPortal: vi.fn(), requireBillingOwner: vi.fn(), syncBilling: vi.fn() }));
vi.mock('@/lib/billing/revenuecat', () => ({ billingPlatform: vi.fn(), isBillingConfigured: () => true,
  getBillingOffers: vi.fn(), expandSubscription: vi.fn(), purchaseSubscription: vi.fn(), restoreSubscriptions: vi.fn(), openBillingManagement: vi.fn(),
  isPurchaseCancelled: (error: { userCancelled?: boolean }) => Boolean(error?.userCancelled) }));

let context: BillingContext;
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/app/settings');
  vi.mocked(billingPlatform).mockReturnValue('ios');
  vi.mocked(getWebBillingPortal).mockResolvedValue('https://billing.stripe.com/p/session/test');
  context = { team_id: 'team', can_manage: true, app_user_id: 'customer', member_count: 12,
    products: [{ product_id: 'completo_20', entitlement_id: 'completo', plan: 'completo', member_limit: 20, billing_period: 'monthly', enabled: true }],
    subscription: { plan: 'free', status: 'free', provider: 'manual', is_active: false, will_renew: false, entitlement_ids: [] } };
  vi.mocked(getBillingContext).mockImplementation(async () => structuredClone(context));
  vi.mocked(requireBillingOwner).mockImplementation(async () => structuredClone(context));
  vi.mocked(getBillingOffers).mockResolvedValue({ active: false, offers: [{ key: 'monthly', product: context.products[0], title: 'Completo', price: 'R$ 61,90' }] });
  vi.mocked(syncBilling).mockResolvedValue({ is_active: true, management_url: null });
  vi.mocked(purchaseSubscription).mockResolvedValue(undefined);
  vi.mocked(restoreSubscriptions).mockResolvedValue(undefined);
  vi.mocked(expandSubscription).mockResolvedValue(undefined);
});
afterEach(cleanup);
function mount(initialSeats?: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><TeamBilling initialSeats={initialSeats} /></QueryClientProvider>);
}

describe('Team subscription UI', () => {
  it('shows the current subscription first and opens changes only when requested', async () => {
    context.subscription = { ...context.subscription, plan: 'completo', provider: 'revenuecat', status: 'active',
      is_active: true, store: 'app_store', product_id: 'completo_20', member_limit: 20 };
    mount();
    const edit = await screen.findByRole('button', { name: 'Alterar plano' });
    expect(edit).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('billing-checkout')).not.toBeInTheDocument();
    const actions = within(screen.getByRole('group', { name: 'Ações da assinatura' }));
    expect(actions.getByRole('button', { name: 'Atualizar' })).toBeEnabled();
    expect(actions.getByRole('button', { name: 'Restaurar compras' })).toBeEnabled();
    expect(actions.getByRole('button', { name: 'Gerenciar assinatura' })).toBeEnabled();
    fireEvent.click(edit);
    expect(await screen.findByRole('heading', { name: 'Ajuste seu plano' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plano atual' })).toBeDisabled();
    expect(screen.getByLabelText('Resumo da alteração')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar alteração' }));
    expect(screen.queryByTestId('billing-checkout')).not.toBeInTheDocument();
    expect(purchaseSubscription).not.toHaveBeenCalled();
    expect(expandSubscription).not.toHaveBeenCalled();
    expect(openBillingManagement).not.toHaveBeenCalled();
  });
  it('opens a requested capacity change directly but still lets the owner cancel', async () => {
    context.subscription = { ...context.subscription, plan: 'completo', provider: 'revenuecat', status: 'active',
      is_active: true, store: 'app_store', product_id: 'completo_20', member_limit: 20 };
    mount(21);
    expect(await screen.findByRole('spinbutton', { name: 'Integrantes' })).toHaveValue(21);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar alteração' }));
    expect(screen.queryByTestId('billing-checkout')).not.toBeInTheDocument();
    expect(purchaseSubscription).not.toHaveBeenCalled();
  });
  it('shows safe native support details and can reload the plans', async () => {
    vi.mocked(getBillingOffers).mockRejectedValueOnce(new NativeBillingError('offerings', 'ios', { code: 23, message: 'private-customer' }, 'BRA'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar os planos na loja.');
    expect(screen.getByText('ML-IOS-OFFERINGS-23-BRA')).toHaveClass('select-all');
    expect(screen.queryByText(/private-customer/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar planos' }));
    expect((await screen.findAllByText('R$ 61,90')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Código de suporte:/)).not.toBeInTheDocument();
  });
  it('uses the generic fallback for external errors even if they contain diagnostic-looking fields', async () => {
    vi.mocked(getBillingOffers).mockRejectedValueOnce(Object.assign(new Error('private-key customer-id'), { supportCode: 'private-user-info' }));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os planos.');
    expect(screen.queryByText(/private|Código de suporte:/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recarregar planos' })).toBeEnabled();
  });
  it('preserves actionable business errors in checkout while keeping typed native errors safe', async () => {
    vi.mocked(purchaseSubscription).mockRejectedValueOnce(new Error('O preço foi atualizado. Confira o novo valor antes de assinar.'));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Continuar com este plano: Completo/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'O preço foi atualizado. Confira o novo valor antes de assinar.' })));
    await waitFor(() => expect(screen.getByRole('button', { name: /Continuar com este plano: Completo/ })).toBeEnabled());
    vi.mocked(purchaseSubscription).mockRejectedValueOnce(new NativeBillingError('customer-info', 'ios', { code: 29, message: 'private receipt' }));
    fireEvent.click(screen.getByRole('button', { name: /Continuar com este plano: Completo/ }));
    await waitFor(() => expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'Não foi possível conferir suas compras na loja. Tente novamente. Código de suporte: ML-IOS-CUSTOMER-INFO-29' })));
    expect(JSON.stringify(toast.mock.calls)).not.toContain('private receipt');
  });
  it('opens a web capacity confirmation without treating the portal session as a purchase', async () => {
    vi.mocked(billingPlatform).mockReturnValue('web');
    context.member_count = 20;
    context.subscription = { ...context.subscription, plan: 'completo', provider: 'revenuecat', status: 'active', is_active: true, store: 'stripe', product_id: 'completo_20', member_limit: 20 };
    context.products.push({ ...context.products[0], product_id: 'completo_40', member_limit: 40 });
    const offers = context.products.map((product, i) => ({ key: product.product_id, product, title: 'Completo', price: i ? 'R$ 89,90' : 'R$ 61,90', priceAmount: i ? 89.9 : 61.9, currency: 'BRL' }));
    vi.mocked(getBillingOffers).mockResolvedValue({ active: true, offers });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Alterar plano' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar mais um integrante' }));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar novas vagas:/ }));
    await waitFor(() => expect(getWebBillingPortal).toHaveBeenCalledWith('team', offers[1]));
    expect(openBillingManagement).toHaveBeenCalledWith('https://billing.stripe.com/p/session/test');
    expect(purchaseSubscription).not.toHaveBeenCalled(); expect(expandSubscription).not.toHaveBeenCalled();
    expect(screen.queryByText(/A compra está aguardando confirmação/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restaurar compras' })).not.toBeInTheDocument();
  });
  it('web management uses the team-authorized portal and does not start checkout', async () => {
    vi.mocked(billingPlatform).mockReturnValue('web');
    context.subscription = { ...context.subscription, provider: 'revenuecat', store: 'stripe', is_active: true };
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Gerenciar assinatura' }));
    await waitFor(() => expect(getWebBillingPortal).toHaveBeenCalledWith('team', undefined));
    expect(purchaseSubscription).not.toHaveBeenCalled();
  });
  it.each(['team', 'other-team'])('portal return reconciles only its team (%s), never trusts the URL as payment', async (returnTeam) => {
    vi.mocked(billingPlatform).mockReturnValue('web');
    window.history.replaceState({}, '', `/app/settings?billing=return&billing_team=${returnTeam}`);
    mount();
    await screen.findByText('Assinatura da equipe');
    if (returnTeam === 'team') await waitFor(() => expect(syncBilling).toHaveBeenCalledOnce());
    else expect(syncBilling).not.toHaveBeenCalled();
    expect(context.subscription.is_active).toBe(false);
    expect(purchaseSubscription).not.toHaveBeenCalled();
  });
  it('preserves unlimited accounts without opening the store or showing purchase actions', async () => {
    context.member_count = 40;
    context.subscription.is_unlimited = true;
    context.subscription.unlimited_reason = 'legacy';
    mount();
    expect(await screen.findByText('Ilimitado')).toBeInTheDocument();
    expect(screen.getByText(/Sua equipe mantém as condições anteriores/)).toBeInTheDocument();
    expect(getBillingOffers).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Continuar com este plano/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restaurar compras' })).not.toBeInTheDocument();
  });
  it('shows provider prices and seats before checkout', async () => {
    mount();
    expect((await screen.findAllByText('R$ 61,90')).length).toBeGreaterThan(0);
    expect(screen.getByText('Até 20 integrantes')).toBeInTheDocument();
    expect(purchaseSubscription).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Continuar com este plano: Completo/ }));
    await waitFor(() => expect(purchaseSubscription).toHaveBeenCalledOnce());
    await waitFor(() => expect(syncBilling).toHaveBeenCalledWith('team'));
  });
  it('members see the team plan without loading the purchasing SDK', async () => {
    context.can_manage = false; context.app_user_id = null;
    mount();
    expect(await screen.findByText('O líder responsável pela equipe gerencia a assinatura.')).toBeInTheDocument();
    expect(getBillingOffers).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Restaurar compras' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continuar com este plano:/ })).not.toBeInTheDocument();
  });
  it('a confirmed purchase with failed synchronization cannot be purchased twice', async () => {
    vi.mocked(syncBilling).mockRejectedValue(new Error('offline'));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Continuar com este plano: Completo/ }));
    expect(await screen.findByText(/A compra está aguardando confirmação/)).toBeInTheDocument();
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Compra recebida; confirmação pendente' })));
    expect(screen.queryByRole('button', { name: /Continuar com este plano: Completo/ })).not.toBeInTheDocument();
    expect(purchaseSubscription).toHaveBeenCalledOnce();
  });
  it('keeps an expansion pending until the purchased capacity is confirmed', async () => {
    context.member_count = 20;
    context.subscription = { ...context.subscription, plan: 'completo', provider: 'revenuecat', status: 'active',
      is_active: true, store: 'app_store', product_id: 'completo_20', member_limit: 20 };
    context.products.push({ ...context.products[0], product_id: 'completo_40', member_limit: 40 });
    vi.mocked(getBillingOffers).mockResolvedValue({ active: true, offers: context.products.map((product, i) => ({
      key: product.product_id, product, title: 'Completo', price: i ? 'R$ 89,90' : 'R$ 61,90', priceAmount: i ? 89.9 : 61.9, currency: 'BRL',
    })) });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Alterar plano' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar mais um integrante' }));
    expect(screen.getByText(/Diferença para seu plano atual/)).toHaveTextContent(/28,00/);
    fireEvent.click(screen.getByRole('button', { name: /Confirmar novas vagas:/ }));
    await waitFor(() => expect(expandSubscription).toHaveBeenCalledOnce());
    expect(await screen.findByText(/A compra está aguardando confirmação/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(syncBilling).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button', { name: /Confirmar novas vagas:/ })).not.toBeInTheDocument();
    context.subscription.product_id = 'completo_40'; context.subscription.member_limit = 40;
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(screen.queryByText(/A compra está aguardando confirmação/)).not.toBeInTheDocument());
    expect(purchaseSubscription).not.toHaveBeenCalled();
  });
  it('cancelled checkout does not show an error or trigger sync', async () => {
    vi.mocked(purchaseSubscription).mockRejectedValue({ userCancelled: true });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Continuar com este plano: Completo/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Continuar com este plano: Completo/ })).not.toBeDisabled());
    expect(toast).not.toHaveBeenCalled(); expect(syncBilling).not.toHaveBeenCalled();
  });
  it('restores only after the owner requests it', async () => {
    mount();
    const button = await screen.findByRole('button', { name: 'Restaurar compras' });
    expect(restoreSubscriptions).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(restoreSubscriptions).toHaveBeenCalledWith('team'));
    await waitFor(() => expect(syncBilling).toHaveBeenCalledWith('team'));
  });
  it('preserves visible access when renewal was cancelled', async () => {
    context.subscription = { ...context.subscription, provider: 'revenuecat', plan: 'completo', status: 'active',
      is_active: true, will_renew: false, access_expires_at: '2099-11-06T12:00:00Z' };
    mount();
    expect(await screen.findByText(/Acesso até/)).toBeInTheDocument();
    expect(screen.getByText('A renovação automática está desativada.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continuar com este plano: Completo/ })).not.toBeInTheDocument();
  });
});
