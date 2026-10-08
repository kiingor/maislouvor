import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { displayDate, planLabels, platformError, platformRpc, providerLabels, subscriptionStatusLabels, type Plan, type Subscription, type SubscriptionStatus } from "@/lib/platform";

export function SubscriptionForm({ subscription, accountName }: { subscription: Subscription; accountName: string }) {
  const [plan, setPlan] = useState<Plan>(subscription.plan);
  const [status, setStatus] = useState<SubscriptionStatus>(subscription.status);
  const [amount, setAmount] = useState(subscription.monthly_amount?.toString() ?? "");
  const [periodEnd, setPeriodEnd] = useState(subscription.current_period_end?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(subscription.notes);
  const [memberLimit, setMemberLimit] = useState(String(subscription.member_limit ?? 5));
  const [unlimited, setUnlimited] = useState(Boolean(subscription.is_unlimited));
  const legacy = subscription.unlimited_reason === 'legacy';
  const queryClient = useQueryClient(); const { toast } = useToast();
  const readonly = subscription.provider !== "manual";
  const save = useMutation({
    mutationFn: () => platformRpc<Subscription>("admin_update_subscription", {
      p_team_id: subscription.team_id, p_plan: plan, p_status: status,
      p_monthly_amount: plan === "free" || amount === "" ? null : Number(amount),
      p_current_period_end: periodEnd ? new Date(`${periodEnd}T23:59:59`).toISOString() : null, p_notes: notes,
      p_member_limit: plan === 'free' ? 5 : unlimited ? subscription.member_limit ?? 5 : Number(memberLimit), p_is_unlimited: unlimited,
    }),
    onSuccess: () => { toast({ className: "platform-toast", title: "Assinatura registrada", description: `Os dados de ${accountName} foram salvos.` }); void queryClient.invalidateQueries({ queryKey: ["platform"] }); void queryClient.invalidateQueries({ queryKey: ['team-capacity', subscription.team_id] }); void queryClient.invalidateQueries({ queryKey: ['billing', subscription.team_id] }); },
    onError: (error) => toast({ className: "platform-toast", title: "Não foi possível salvar", description: platformError(error), variant: "destructive" }),
  });
  const changePlan = (value: Plan) => {
    setPlan(value);
    if (value === "free") { setStatus("free"); setAmount(""); setMemberLimit('5'); }
    else if (status === "free") setStatus("trialing");
  };
  return <form onSubmit={(event) => { event.preventDefault(); if (!readonly) save.mutate(); }} className="p-5 sm:p-6">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><span className="admin-badge admin-badge-neutral">{providerLabels[subscription.provider] || subscription.provider}</span>{subscription.updated_at && <p className="text-[10px] text-muted-foreground">Atualizado em {displayDate(subscription.updated_at, true)}</p>}</div>
    {readonly && <p className="mb-5 rounded-lg bg-muted p-4 text-xs leading-relaxed text-muted-foreground">Esta assinatura é sincronizada pelo provedor. As alterações devem ser feitas na origem da cobrança.</p>}
    {legacy && <p className="mb-5 rounded-lg bg-muted p-4 text-sm">Ilimitado · conta anterior à cobrança. O acesso existente está preservado e não pode ser removido por este formulário.</p>}
    {subscription.product_id && <p className="mb-5 text-xs break-all text-muted-foreground">Produto da loja: {subscription.product_id}</p>}
    <fieldset disabled={readonly || save.isPending}><div className="admin-form-grid">
      <div className="sm:col-span-2"><label className="flex items-center gap-2" htmlFor="subscription-unlimited"><input id="subscription-unlimited" type="checkbox" checked={unlimited} disabled={legacy || readonly} onChange={(event) => setUnlimited(event.target.checked)} />Acesso ilimitado, sem limite de integrantes</label><p>{legacy ? 'Condição permanente para as equipes que já existiam.' : 'Concessão administrativa. Não realiza cobrança e fica registrada no histórico.'}</p></div>
      <div><label htmlFor="subscription-members">Capacidade de integrantes</label><Input id="subscription-members" type="number" min="1" max="10000" step="1" required value={plan === 'free' ? '5' : memberLimit} disabled={unlimited || plan === 'free'} onChange={(event) => setMemberLimit(event.target.value)} /><p>{unlimited ? 'Sem limite enquanto o acesso ilimitado estiver concedido.' : 'Inclui o líder. Essencial gratuito: 5 integrantes.'}</p></div>
      <div><label htmlFor="subscription-plan">Plano</label><Select value={plan} onValueChange={(value: Plan) => changePlan(value)} disabled={readonly || save.isPending}><SelectTrigger id="subscription-plan"><SelectValue /></SelectTrigger><SelectContent className="platform-popover">{Object.entries(planLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div><label htmlFor="subscription-status">Status</label><Select value={status} onValueChange={(value: SubscriptionStatus) => setStatus(value)} disabled={plan === "free" || readonly || save.isPending}><SelectTrigger id="subscription-status"><SelectValue /></SelectTrigger><SelectContent className="platform-popover">{Object.entries(subscriptionStatusLabels).filter(([value]) => plan === "free" ? value === "free" : value !== "free").map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div><label htmlFor="subscription-amount">Valor mensal (R$)</label><Input id="subscription-amount" type="number" min="0" max="99999999.99" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" disabled={plan === "free"} /><p>Valor informado para acompanhamento; os valores RevenueCat ficam no provedor.</p></div>
      <div><label htmlFor="subscription-end">Fim do período</label><Input id="subscription-end" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /><p>Deixe em branco se não houver uma data definida.</p></div>
      <div className="sm:col-span-2"><label htmlFor="subscription-notes">Observações internas</label><Textarea id="subscription-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={4} placeholder="Condições combinadas, histórico ou informações da conta." /><p>Visíveis somente no gerenciador · {notes.length}/2.000 caracteres.</p></div>
    </div></fieldset>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t pt-5"><p className="max-w-md text-[11px] leading-relaxed text-muted-foreground">{readonly ? "A assinatura é atualizada automaticamente pelo provedor de cobrança." : "Salvar atualiza o acesso, a capacidade e o histórico administrativo; não realiza uma cobrança. Contratos manuais ativos liberam a capacidade até o fim do período."}</p>
      {!readonly && <Button type="submit" disabled={save.isPending}><Save size={15} className="mr-2" />{save.isPending ? "Salvando…" : "Salvar assinatura"}</Button>}</div>
  </form>;
}
