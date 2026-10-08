import type { BillingOffer, BillingProduct } from './types';

export const TEAM_CAPACITIES = [5, 10, 20, 40, 50, 75, 100, 150, 200] as const;
export const PLAN_DETAILS = {
  essencial: { name: 'Essencial', description: 'A rotina do ministério organizada.', features: ['Escalas e disponibilidade', 'Repertórios, letras e cifras', 'Ensaio, loops e chat'] },
  estudio: { name: 'Estúdio', description: 'Cada instrumento no seu lugar.', features: ['Tudo do Essencial', 'Separação de faixas com IA', 'Mais espaço para os áudios'] },
  asafe: { name: 'Asafe', description: 'Uma ajuda no dia a dia da equipe.', features: ['Tudo do Essencial', 'Assistente no WhatsApp', 'Consultas sobre o ministério'] },
  completo: { name: 'Completo', description: 'Organização, ensaio e assistência.', features: ['Tudo do Essencial', 'Todos os recursos do Estúdio', 'Asafe no WhatsApp'] },
} as const;
export type PlanId = keyof typeof PLAN_DETAILS;

// Only offer products that the SDK actually returned, using their real prices.
export function offerForCapacity(offers: BillingOffer[], plan: PlanId, seats: number, period: BillingProduct['billing_period']): BillingOffer | undefined {
  if (!Number.isInteger(seats) || seats < 1) return;
  return offers.filter(({ product }) => product.enabled && product.plan === plan && product.billing_period === period && product.member_limit >= seats)
    .sort((a, b) => a.product.member_limit - b.product.member_limit)[0];
}

export function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
}

export function offerDifference(from: BillingOffer | undefined, to: BillingOffer | undefined): string | null {
  if (!from || !to || from.product.billing_period !== to.product.billing_period ||
    !from.currency || !/^[A-Z]{3}$/.test(from.currency) || from.currency !== to.currency || !Number.isFinite(from.priceAmount) || !Number.isFinite(to.priceAmount)) return null;
  const difference = Math.round((to.priceAmount! - from.priceAmount!) * 100) / 100;
  return difference > 0 ? formatMoney(difference, to.currency) : null;
}

export function annualSaving(monthly: BillingOffer | undefined, annual: BillingOffer | undefined): { formatted: string; twoMonths: boolean } | null {
  if (!monthly || !annual || monthly.product.plan !== annual.product.plan || monthly.product.member_limit !== annual.product.member_limit ||
    monthly.product.billing_period !== 'monthly' || annual.product.billing_period !== 'annual' ||
    !monthly.currency || !/^[A-Z]{3}$/.test(monthly.currency) || monthly.currency !== annual.currency ||
    !Number.isFinite(monthly.priceAmount) || !Number.isFinite(annual.priceAmount) || monthly.priceAmount! <= 0 || annual.priceAmount! <= 0) return null;
  const monthlyCents = Math.round(monthly.priceAmount! * 100);
  const annualCents = Math.round(annual.priceAmount! * 100);
  if (annualCents >= monthlyCents * 12) return null;
  return { formatted: formatMoney((monthlyCents * 12 - annualCents) / 100, monthly.currency), twoMonths: annualCents === monthlyCents * 10 };
}
