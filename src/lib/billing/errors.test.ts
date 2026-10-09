import { afterEach, describe, expect, it, vi } from 'vitest';
import { diagnosticStorefront, NativeBillingError } from './errors';

afterEach(() => vi.useRealTimers());

describe('safe native billing diagnostics', () => {
  it.each([
    { code: 'private-customer', country: 'private-key' },
    { code: 99999, country: 'BRA?token=private' },
    { code: '27', country: 'BR' },
  ])('rejects values outside the support-code allowlist: $code', ({ code, country }) => {
    const error = new NativeBillingError('sdk', 'ios', { code, message: 'private-key', userInfo: { email: 'private@example.test' } }, country);
    expect(error.supportCode).toBe('ML-IOS-SDK-NA');
    expect(error.message).toBe('Não foi possível conectar à loja. Tente novamente.');
    expect(JSON.stringify(error)).not.toMatch(/private|99999/);
    expect(error).not.toHaveProperty('cause');
  });
  it('limits a stalled storefront lookup to 1.2 seconds', async () => {
    vi.useFakeTimers();
    const lookup = diagnosticStorefront(() => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(1200);
    await expect(lookup).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('clears the timeout after a successful lookup and ignores other storefront fields', async () => {
    vi.useFakeTimers();
    await expect(diagnosticStorefront(async () => ({ countryCode: 'USA', identifier: 'private' }))).resolves.toBe('USA');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('ignores thrown or malformed storefront diagnostics', async () => {
    await expect(diagnosticStorefront(() => { throw new Error('private'); })).resolves.toBeUndefined();
    await expect(diagnosticStorefront(async () => null!)).resolves.toBeUndefined();
  });
});
