import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, ChevronDown, LoaderCircle, MessageCircle, Minus, Music2, Plus, SlidersHorizontal, Users } from 'lucide-react';
import { PLAN_DETAILS, annualSaving, offerDifference, offerForCapacity, type PlanId } from '@/lib/billing/catalog';
import type { BillingContext, BillingOffer } from '@/lib/billing/types';
import { useBillingDock } from './useBillingDock';
import './billing.css';

const icons = { essencial: Music2, estudio: SlidersHorizontal, asafe: MessageCircle, completo: Plus };
const planOrder: PlanId[] = ['completo', 'essencial', 'estudio', 'asafe'];
const captions = { essencial: 'Escalas, repertórios e ensaio', estudio: 'Ensaio com faixas separadas por IA', asafe: 'Sua equipe conectada ao WhatsApp', completo: 'Essencial, Estúdio e Asafe juntos' };

interface Props {
  context: BillingContext;
  offers: BillingOffer[];
  loading: boolean;
  busy: boolean;
  platform: 'ios' | 'android' | 'web';
  placement?: 'app' | 'standalone';
  initialSeats?: number;
  onPurchase: (offer: BillingOffer) => void;
  onExpand: (offer: BillingOffer) => void;
  onManage: () => void;
}

export default function PlanBuilder({ context, offers, loading, busy, platform, placement = 'app', initialSeats, onPurchase, onExpand, onManage }: Props) {
  const id = useId();
  const container = useRef<HTMLElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  useBillingDock(container, dock);
  const subscription = context.subscription;
  const currentOffer = offers.find(({ product }) => product.product_id === subscription.product_id);
  const initialPlan = subscription.plan in PLAN_DETAILS ? subscription.plan as PlanId : 'completo';
  const [plan, setPlan] = useState<PlanId>(initialPlan);
  const [period, setPeriod] = useState<'monthly' | 'annual'>(currentOffer?.product.billing_period ?? 'monthly');
  const minimum = Math.max(1, context.member_count);
  const startingSeats = Math.max(minimum, Math.min(200, initialSeats ?? minimum));
  const [requestedSeats, setRequestedSeats] = useState(startingSeats);
  const seats = Math.max(minimum, requestedSeats);
  const [editingSeats, setEditingSeats] = useState(false);
  const [seatDraft, setSeatDraft] = useState(String(startingSeats));
  const maximum = Math.max(200, minimum);
  const draftNumber = Number(seatDraft);
  const invalidQuantity = editingSeats && (seatDraft.trim() === '' || !Number.isInteger(draftNumber) || draftNumber < minimum || draftNumber > maximum);
  const requestedOffer = offerForCapacity(offers, plan, seats, period);
  const sameContract = subscription.is_active && plan === subscription.plan && period === currentOffer?.product.billing_period;
  const selected = sameContract && seats <= (subscription.member_limit ?? 0) ? currentOffer : requestedOffer;
  const isFree = plan === 'essencial' && seats <= 5 && !subscription.is_active;
  const selectedLimit = isFree ? 5 : selected?.product.member_limit;
  const difference = offerDifference(currentOffer, selected);
  const expanding = subscription.is_active && selected && selected.product.plan === subscription.plan &&
    currentOffer?.product.billing_period === period && selected.product.member_limit > (subscription.member_limit ?? 0);
  const canExpand = expanding && (platform === 'ios' && subscription.store === 'app_store' || platform === 'web' && subscription.store === 'stripe');
  const hasCurrentSelection = subscription.is_active && selected?.product.product_id === subscription.product_id;
  const saving = isFree ? null : annualSaving(offerForCapacity(offers, plan, selectedLimit ?? seats, 'monthly'), offerForCapacity(offers, plan, selectedLimit ?? seats, 'annual'));
  const interval = period === 'annual' ? 'ano' : 'mês';
  const unavailable = !selected && !isFree && !loading;
  const action = invalidQuantity ? 'Confira a quantidade' : loading ? 'Carregando planos…' : busy ? 'Aguarde…' : isFree ? 'Seu plano gratuito' : hasCurrentSelection ? 'Seu plano atual' : unavailable ? 'Combinação indisponível' : subscription.is_active ? canExpand ? 'Confirmar novas vagas' : 'Gerenciar alteração' : 'Continuar com este plano';

  function purchase() {
    if (!selected) return;
    if (subscription.is_active) { if (canExpand) onExpand(selected); else onManage(); }
    else onPurchase(selected);
  }

  const checkout = <div ref={dock} className="billing-design billing-checkout" data-placement={placement} data-testid="billing-checkout">
    <div className="billing-checkout-panel" aria-label="Resumo do plano">
      <div className="billing-checkout-summary" aria-live="polite" aria-atomic="true">
        <div className="billing-checkout-choice"><strong>{PLAN_DETAILS[plan].name}</strong><span>{selectedLimit ? `Até ${selectedLimit} integrantes` : `${seats} integrantes`}</span></div>
        <div className="billing-checkout-price"><strong>{isFree ? 'Grátis' : loading ? '…' : selected?.price ?? '—'}</strong><span>{!isFree && (period === 'annual' ? 'por ano, em uma cobrança' : 'por mês, para toda a equipe')}</span></div>
      </div>
      <button type="button" className="billing-continue" disabled={busy || loading || invalidQuantity || isFree || !selected || hasCurrentSelection}
        onClick={purchase} aria-label={hasCurrentSelection ? 'Plano atual' : `${action}: ${PLAN_DETAILS[plan].name} para até ${selectedLimit ?? seats} integrantes`}>
        <span>{action}</span>{busy ? <LoaderCircle className="billing-spinner" aria-hidden /> : !isFree && !hasCurrentSelection && !unavailable && <ArrowRight aria-hidden />}
      </button>
      <p className="billing-checkout-caption">{isFree ? 'Sem assinatura paga para até 5 integrantes.' : 'Renovação automática · Cancele a renovação quando quiser.'}</p>
    </div>
  </div>;

  return <section ref={container} aria-labelledby={`${id}-title`} className="billing-design billing-builder">
    <header className="billing-heading">
      <p className="billing-eyebrow">PLANOS +LOUVOR</p>
      <h3 id={`${id}-title`}>Um plano para<br />a equipe toda.</h3>
      <p>Mais organização. Mais tempo para o louvor.</p>
    </header>

    <div className="billing-customize">
      <div className="billing-members">
        <div className="billing-members-label"><label htmlFor={`${id}-seats`}><Users aria-hidden />Integrantes</label><p id={`${id}-seats-help`}>{context.member_count} na equipe hoje</p></div>
        <div className="billing-stepper">
          <button type="button" aria-label="Remover uma vaga" disabled={busy || seats <= minimum} onClick={() => setRequestedSeats(seats - 1)}><Minus aria-hidden /></button>
          <input id={`${id}-seats`} aria-describedby={`${id}-seats-help`} type="number" inputMode="numeric" min={minimum} max={maximum} value={editingSeats ? seatDraft : seats}
            disabled={busy} onFocus={() => { setSeatDraft(String(seats)); setEditingSeats(true); }}
            onChange={(event) => { setSeatDraft(event.target.value); const n = event.target.valueAsNumber; if (Number.isInteger(n) && n >= minimum && n <= maximum) setRequestedSeats(n); }}
            onBlur={() => { if (Number.isInteger(draftNumber) && seatDraft.trim() !== '') setRequestedSeats(Math.min(maximum, Math.max(minimum, draftNumber))); setEditingSeats(false); }}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
          <button type="button" aria-label="Adicionar mais um integrante" disabled={busy || seats >= 200} onClick={() => setRequestedSeats(seats + 1)}><Plus aria-hidden /></button>
        </div>
      </div>
      <fieldset disabled={busy} className="billing-cycle">
        <legend className="sr-only">Como prefere pagar?</legend>
        <div className="billing-cycle-track" data-period={period}>
          <span className="billing-cycle-lens" aria-hidden />
          {(['monthly', 'annual'] as const).map((value) => <label key={value}>
            <input type="radio" name={`${id}-period`} checked={period === value} onChange={() => setPeriod(value)} className="sr-only" />
            <span>{value === 'monthly' ? 'Mensal' : 'Anual'}{value === 'annual' && saving?.twoMonths && <small>2 meses de desconto</small>}</span>
          </label>)}
        </div>
      </fieldset>
    </div>

    <fieldset disabled={busy} className="billing-plans">
      <legend>Escolha o seu plano</legend>
      <div className="billing-plan-list">
        {planOrder.map((key) => {
          const detail = PLAN_DETAILS[key];
          const Icon = icons[key];
          const offer = key === plan ? selected : offerForCapacity(offers, key, seats, period);
          const free = key === 'essencial' && seats <= 5 && !subscription.is_active;
          return <label key={key} className="billing-plan" data-selected={plan === key} data-unavailable={!offer && !free && !loading}>
            <input type="radio" name={`${id}-plan`} value={key} checked={plan === key} onChange={() => setPlan(key)} className="sr-only"
              aria-labelledby={`${id}-${key}-name`} aria-describedby={`${id}-${key}-description ${id}-${key}-price`} />
            <span className="billing-plan-icon"><Icon aria-hidden /></span>
            <span className="billing-plan-copy"><span className="billing-plan-name" id={`${id}-${key}-name`}>{detail.name}{key === 'completo' && <span className="billing-bundle">Tudo incluído</span>}</span><span className="billing-plan-description" id={`${id}-${key}-description`}>{captions[key]}</span></span>
            <span className="billing-plan-price" id={`${id}-${key}-price`}><strong>{free ? 'Grátis' : loading ? '…' : offer?.price ?? 'Indisponível'}</strong>{!free && offer && <small>/{interval}</small>}</span>
            <span className="billing-plan-check" aria-hidden>{plan === key && <Check />}</span>
          </label>;
        })}
      </div>
    </fieldset>

    <div className="billing-selection-note" aria-live="polite">
      {!isFree && selected && selectedLimit !== seats && <p>Para {seats} integrantes, esta opção inclui <strong>{selectedLimit} vagas</strong>. O valor é da equipe inteira.</p>}
      {sameContract && seats <= (subscription.member_limit ?? 0) && <p>Esta quantidade cabe no seu plano atual, <strong>sem aumentar a cobrança.</strong></p>}
      {difference && expanding && <p>Diferença para seu plano atual: <strong>{difference} por {interval}</strong>. {platform === 'web' ? 'Você confere o ajuste do período antes de confirmar o pagamento.' : 'A loja mostra o ajuste do período antes de confirmar.'}</p>}
      {period === 'annual' && saving && !isFree && <p>Você economiza <strong>{saving.formatted} por ano</strong> em relação a 12 mensalidades.</p>}
      {unavailable && <p role="status">{seats > 200 ? 'Para equipes com mais de 200 integrantes, entre em contato com o suporte.' : 'Esta combinação ainda não está disponível. Escolha outro período ou plano.'}</p>}
    </div>

    <details className="billing-included">
      <summary>O que inclui o {PLAN_DETAILS[plan].name}<ChevronDown aria-hidden /></summary>
      <ul>{PLAN_DETAILS[plan].features.map((feature) => <li key={feature}><Check aria-hidden />{feature}</li>)}</ul>
    </details>
    <p className="billing-renewal">{isFree ? 'O Essencial é gratuito para equipes de até 5 integrantes.' : `Renovação automática ${period === 'annual' ? 'anual' : 'mensal'}. Você pode cancelar a renovação a qualquer momento no gerenciamento da assinatura.`}</p>
    {createPortal(checkout, document.body)}
  </section>;
}
