export type NativeBillingStage = 'context' | 'sdk' | 'configure' | 'offerings' | 'customer-info';
export type NativeBillingPlatform = 'ios' | 'android';

// Public error codes from purchases-capacitor 13.7.0. Never include arbitrary
// SDK messages, identifiers, userInfo or underlying errors in support details.
const sdkCodes = new Set([
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13',
  '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26',
  '28', '29', '30', '31', '32', '33', '34', '35', '42',
]);
const messages: Record<NativeBillingStage, string> = {
  context: 'Não foi possível conferir os dados da assinatura. Tente novamente.',
  sdk: 'Não foi possível conectar à loja. Tente novamente.',
  configure: 'Não foi possível conectar à loja. Tente novamente.',
  offerings: 'Não foi possível consultar os planos na loja. Tente novamente em instantes.',
  'customer-info': 'Não foi possível conferir suas compras na loja. Tente novamente.',
};

export class NativeBillingError extends Error {
  readonly supportCode: string;

  constructor(stage: NativeBillingStage, platform: NativeBillingPlatform, error: unknown, storefront?: unknown) {
    super(messages[stage]);
    this.name = 'NativeBillingError';
    const rawCode = stage !== 'context' && error !== null && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
    const code = (typeof rawCode === 'string' || typeof rawCode === 'number') && sdkCodes.has(String(rawCode)) ? String(rawCode) : 'NA';
    const country = typeof storefront === 'string' && /^[A-Z]{3}$/.test(storefront) ? storefront : undefined;
    this.supportCode = ['ML', platform.toUpperCase(), stage.toUpperCase(), code, country].filter(Boolean).join('-');
  }
}

// Storefront is diagnostic only. A failed or stalled lookup must not replace or
// indefinitely delay the original offerings error. It does not permit a sale.
export async function diagnosticStorefront(getStorefront: () => Promise<{ countryCode: string }>): Promise<string | undefined> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(getStorefront).then((value) => value.countryCode).catch(() => undefined),
      new Promise<undefined>((resolve) => { timer = window.setTimeout(resolve, 1200); }),
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}
