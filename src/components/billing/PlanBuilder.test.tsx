import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlanBuilder from './PlanBuilder';
import type { BillingContext, BillingOffer } from '@/lib/billing/types';

const products: BillingContext['products'] = ['essencial', 'completo'].flatMap((plan) => [20, 40].map((member_limit) => ({
  product_id: `${plan}_${member_limit}`, plan: plan as 'essencial' | 'completo', entitlement_id: plan, member_limit, billing_period: 'monthly', enabled: true,
})));
const offers: BillingOffer[] = products.map((product) => {
  const value = product.plan === 'essencial' ? product.member_limit === 20 ? 26.9 : 39.9 : product.member_limit === 20 ? 61.9 : 89.9;
  return { product, key: product.product_id, title: product.plan, price: `R$ ${value.toFixed(2).replace('.', ',')}`, priceAmount: value, currency: 'BRL' };
});
function mount(active = false, memberCount = 20) {
  const context: BillingContext = { team_id: 'team', can_manage: true, app_user_id: 'customer', member_count: memberCount, products,
    subscription: { plan: active ? 'completo' : 'free', provider: active ? 'revenuecat' : 'manual', status: active ? 'active' : 'free',
      is_active: active, will_renew: active, entitlement_ids: active ? ['completo'] : [], store: active ? 'app_store' : null,
      product_id: active ? 'completo_20' : null, member_limit: active ? 20 : null } };
  const onPurchase = vi.fn(), onExpand = vi.fn(), onManage = vi.fn();
  render(<PlanBuilder context={context} offers={offers} loading={false} busy={false} platform="ios" onPurchase={onPurchase} onExpand={onExpand} onManage={onManage} />);
  return { onPurchase, onExpand, onManage };
}
afterEach(cleanup);
describe('Team plan builder', () => {
  it('uses the actual price of the next capacity and recalculates it for the chosen plan', () => {
    const { onPurchase } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar mais um integrante' }));
    const summary = within(screen.getByLabelText('Resumo do plano'));
    expect(summary.getByText('Até 40 integrantes')).toBeInTheDocument();
    expect(summary.getByText('R$ 89,90')).toBeInTheDocument();
    expect(screen.getByText(/Para 21 integrantes, esta opção inclui/)).toHaveTextContent('40 vagas');
    fireEvent.click(screen.getByRole('radio', { name: /^Essencial/ }));
    expect(summary.getByText('R$ 39,90')).toBeInTheDocument();
    expect(onPurchase).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Continuar com este plano: Essencial/ }));
    expect(onPurchase.mock.calls[0][0].product.product_id).toBe('essencial_40');
  });
  it('adding a member within the paid capacity does not initiate a paid change', () => {
    const { onExpand, onPurchase } = mount(true, 12);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar mais um integrante' }));
    expect(screen.getByRole('spinbutton')).toHaveValue(13);
    expect(screen.getByText(/sem aumentar a cobrança/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plano atual' })).toBeDisabled();
    expect(onExpand).not.toHaveBeenCalled(); expect(onPurchase).not.toHaveBeenCalled();
  });
  it('shows the price difference at a capacity boundary and only expands on confirmation', () => {
    const { onExpand } = mount(true);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar mais um integrante' }));
    expect(screen.getByText(/Diferença para seu plano atual/)).toHaveTextContent(/28,00/);
    expect(onExpand).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Confirmar novas vagas:/ }));
    expect(onExpand.mock.calls[0][0].product.product_id).toBe('completo_40');
  });
  it('cannot sell below the existing team size or offer an unavailable annual', () => {
    const { onPurchase } = mount();
    expect(screen.getByRole('button', { name: 'Remover uma vaga' })).toBeDisabled();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
    expect(screen.getByRole('spinbutton')).toHaveValue(20);
    fireEvent.click(screen.getByRole('radio', { name: /Anual/ }));
    expect(screen.getByRole('button', { name: /Combinação indisponível: Completo/ })).toBeDisabled();
    expect(screen.getByText(/Esta combinação ainda não está disponível/)).toBeInTheDocument();
    expect(onPurchase).not.toHaveBeenCalled();
  });
  it('allows typing a complete quantity without clamping intermediate digits', () => {
    mount();
    const input = screen.getByRole('spinbutton');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByRole('button', { name: /Confira a quantidade/ })).toBeDisabled();
    fireEvent.change(input, { target: { value: '4' } });
    expect(input).toHaveValue(4);
    fireEvent.change(input, { target: { value: '40' } });
    fireEvent.blur(input);
    expect(input).toHaveValue(40);
    expect(screen.getByRole('button', { name: /Continuar com este plano: Completo para até 40/ })).toBeEnabled();
  });
  it('renders one checkout outside the scrollable and animated content', () => {
    mount();
    const dock = screen.getByTestId('billing-checkout');
    expect(dock.parentElement).toBe(document.body);
    expect(within(dock).getAllByRole('button')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Continuar com este plano/ })).toHaveLength(1);
  });

});
