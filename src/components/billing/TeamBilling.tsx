import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, RefreshCw } from 'lucide-react';
import { useTeam } from '@/contexts/TeamContext';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getBillingContext, getWebBillingPortal, requireBillingOwner, syncBilling } from '@/lib/billing/api';
import { billingPlatform, getBillingOffers, isBillingConfigured, isPurchaseCancelled, openBillingManagement, expandSubscription, purchaseSubscription, restoreSubscriptions } from '@/lib/billing/revenuecat';
import { canStartSubscription, type BillingOffer } from '@/lib/billing/types';
import PlanBuilder from './PlanBuilder';
import { displayDate, planLabels, subscriptionStatusLabels } from '@/lib/platform';

export default function TeamBilling({ initialSeats }: { initialSeats?: number }) {
  const { currentTeam, profileId } = useTeam();
  const teamId = currentTeam?.id;
  const client = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<string | null>(null);
  const awaitingConfirmation = pendingProduct !== null;
  const configured = isBillingConfigured();
  const portalReturnHandled = useRef(false);
  const billing = useQuery({
    queryKey: ['billing', teamId, profileId], queryFn: () => getBillingContext(teamId!),
    enabled: Boolean(teamId && profileId), retry: false, staleTime: 0,
  });
  const offers = useQuery({
    queryKey: ['billing-offers', teamId, profileId], queryFn: () => getBillingOffers(teamId!),
    enabled: Boolean(configured && billing.data?.can_manage && !billing.data.subscription.is_unlimited), retry: false, staleTime: 0,
  });

  // The return URL only triggers reconciliation; it never grants paid access.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (portalReturnHandled.current || billingPlatform() !== 'web' || !billing.data?.can_manage ||
      params.get('billing') !== 'return' || params.get('billing_team') !== teamId) return;
    portalReturnHandled.current = true;
    void act('sync');
    const url = new URL(window.location.href);
    url.searchParams.delete('billing'); url.searchParams.delete('billing_team');
    window.history.replaceState(window.history.state, '', url);
    // act reads this render's team; retries remain an explicit user action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billing.data?.can_manage, teamId]);

  async function refresh() {
    await client.invalidateQueries({ queryKey: ['billing', teamId] });
    await client.invalidateQueries({ queryKey: ['billing-offers', teamId] });
    await client.invalidateQueries({ queryKey: ['platform'] });
    await client.invalidateQueries({ queryKey: ['team-capacity'] });
  }

  async function act(action: 'purchase' | 'expand' | 'restore' | 'sync' | 'manage', offer?: BillingOffer) {
    if (!teamId || busy) return;
    setBusy(true);
    let purchased = false;
    let targetProduct = pendingProduct;
    try {
      const authorized = await requireBillingOwner(teamId);
      if (billingPlatform() === 'web' && authorized.subscription.store === 'stripe' && (action === 'manage' || action === 'expand')) {
        const url = await getWebBillingPortal(teamId, action === 'expand' ? offer : undefined);
        await openBillingManagement(url);
        return; // A portal session is not a completed purchase.
      }
      if ((action === 'purchase' || action === 'expand') && offer) {
        if (action === 'expand') await expandSubscription(teamId, offer);
        else await purchaseSubscription(teamId, offer);
        purchased = true; targetProduct = offer.product.product_id; setPendingProduct(targetProduct);
      }
      if (action === 'restore') await restoreSubscriptions(teamId);
      const result = await syncBilling(teamId);
      const confirmed = await getBillingContext(teamId);
      const stillPending = targetProduct !== null && (!confirmed.subscription.is_active || confirmed.subscription.product_id !== targetProduct);
      await refresh();
      setPendingProduct(stillPending ? targetProduct : null);
      if (action === 'manage') {
        if (!result.management_url) throw new Error('Não há um endereço de gerenciamento disponível. Consulte a loja em que assinou.');
        await openBillingManagement(result.management_url);
      } else toast({ title: stillPending ? 'Compra recebida' : result.is_active ? 'Assinatura confirmada' : 'Assinatura atualizada',
        description: stillPending ? 'A confirmação está em processamento. Use Atualizar em alguns instantes.' : undefined });
    } catch (error) {
      if (!isPurchaseCancelled(error)) toast({ title: purchased ? 'Compra recebida; confirmação pendente' : 'Não foi possível concluir',
        description: purchased ? 'Não compre novamente. Use Atualizar para confirmar a assinatura.' : error instanceof Error ? error.message : 'Confira sua conexão e tente novamente.',
        variant: purchased ? 'default' : 'destructive' });
      // A checkout error may still leave a pending store purchase. Reload SDK state.
      void refresh();
    } finally { setBusy(false); }
  }

  if (!teamId) return <p className="text-sm text-muted-foreground">Selecione uma equipe para ver a assinatura.</p>;
  if (billing.isLoading) return <p role="status" className="text-sm text-muted-foreground">Carregando assinatura…</p>;
  if (!billing.data) return <GlassCard className="p-5 space-y-3"><p role="alert">As informações de assinatura estão indisponíveis.</p><Button variant="outline" onClick={() => void billing.refetch()}>Tentar novamente</Button></GlassCard>;
  const context = billing.data;
  const subscription = context.subscription;
  const canBuy = configured && canStartSubscription(context) && !offers.data?.active && !awaitingConfirmation;
  const canBuild = !subscription.is_unlimited && (canBuy || configured && context.can_manage && subscription.is_active && subscription.provider === 'revenuecat' && !awaitingConfirmation);
  const native = billingPlatform() !== 'web';
  const accountDetails = <GlassCard className="billing-account p-5 space-y-4">
      <div className="flex items-start gap-3"><CreditCard className="mt-1 h-5 w-5 shrink-0" /><div>
        <h2 className="billing-account-heading font-semibold">Assinatura da equipe</h2>
        <p className="text-sm text-muted-foreground">{currentTeam.name} · {context.member_count} integrantes</p>
      </div></div>
      <div><p className="font-medium">{subscription.is_unlimited ? 'Ilimitado' : planLabels[subscription.plan as keyof typeof planLabels] ?? subscription.plan}</p>
        {subscription.is_unlimited ? <p className="text-sm text-muted-foreground">Acesso liberado, sem limite de integrantes.{subscription.unlimited_reason === 'legacy' && ' Sua equipe mantém as condições anteriores.'}</p> : <>
        <p className="text-sm text-muted-foreground">{subscriptionStatusLabels[subscription.status as keyof typeof subscriptionStatusLabels] ?? subscription.status}</p>
        {(context.capacity?.member_limit ?? subscription.member_limit) && <p className="text-sm mt-1">Até {context.capacity?.member_limit ?? subscription.member_limit} integrantes, incluindo o líder.</p>}
        {subscription.is_active && subscription.access_expires_at && <p className="text-sm mt-1">{subscription.will_renew ? 'Próxima renovação' : 'Acesso até'} {displayDate(subscription.access_expires_at)}.</p>}
        {subscription.is_active && !subscription.will_renew && subscription.status !== 'past_due' && <p className="text-sm text-muted-foreground">A renovação automática está desativada.</p>}
        {subscription.status === 'past_due' && <p role="status" className="text-sm mt-2">Há uma pendência no pagamento. Confira os dados na origem da cobrança.</p>}
        {subscription.environment === 'SANDBOX' && <p className="text-sm mt-2">Assinatura de teste.</p>}
        </>}
      </div>
      {!context.can_manage ? <p className="text-sm text-muted-foreground">O líder responsável pela equipe gerencia a assinatura.</p> : (!subscription.is_unlimited || subscription.provider === 'revenuecat') && <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void act('sync')}><RefreshCw className="h-4 w-4 mr-2" />Atualizar</Button>
        {configured && native && !subscription.is_unlimited && <Button variant="outline" disabled={busy} onClick={() => void act('restore')}>Restaurar compras</Button>}
        {subscription.provider === 'revenuecat' && <Button variant="outline" disabled={busy} onClick={() => void act('manage')}>Gerenciar assinatura</Button>}
      </div>}
      {awaitingConfirmation && <p role="status" className="text-sm">A compra está aguardando confirmação. Use Atualizar em alguns instantes.</p>}
    </GlassCard>;
  return <div className="billing-design billing-team" data-new-plan={canBuild && !subscription.is_active} aria-busy={busy}>
    {(!canBuild || subscription.is_active) && accountDetails}
    {context.can_manage && !subscription.is_unlimited && !configured && <p className="text-sm text-muted-foreground">Novas assinaturas estarão disponíveis em breve.</p>}
    {context.can_manage && configured && offers.isError && <GlassCard className="p-5 space-y-3"><p role="alert">Não foi possível carregar os planos.</p><Button variant="outline" disabled={busy} onClick={() => void offers.refetch()}>Recarregar planos</Button></GlassCard>}
    {canBuild && !offers.isError && (offers.isLoading ? <p role="status">Carregando planos…</p> :
      <PlanBuilder key={`${teamId}:${subscription.product_id ?? 'new'}`} context={context} offers={offers.data?.offers ?? []}
        loading={offers.isLoading} busy={busy} platform={billingPlatform()} initialSeats={initialSeats}
        onPurchase={(offer) => void act('purchase', offer)} onExpand={(offer) => void act('expand', offer)} onManage={() => void act('manage')} />)}
    {canBuild && !subscription.is_active && accountDetails}
    {offers.data?.active && !subscription.is_active && <p role="status" className="text-sm">Encontramos uma compra ativa. Use Atualizar para confirmar o acesso da equipe.</p>}
  </div>;
}
