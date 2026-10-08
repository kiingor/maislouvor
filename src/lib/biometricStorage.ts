import { Capacitor, registerPlugin } from "@capacitor/core";

export interface FaceIdStatus { available: boolean; enabled: boolean; locked: boolean }
export interface BiometricPlugin {
  status(): Promise<FaceIdStatus>;
  read(): Promise<{ value?: string }>;
  write(options: { key: string; value: string }): Promise<void>;
  enable(options: { key: string; value: string }): Promise<void>;
  unlock(options: { key: string }): Promise<void>;
  lock(): Promise<void>;
  clear(options: { key: string }): Promise<void>;
}
export const BiometricSession = registerPlugin<BiometricPlugin>("BiometricSession");
export const isFaceIdPlatform = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

export function createBiometricStorage(sessionKey: string, native: BiometricPlugin, legacy: Storage) {
  return {
    async getItem(key: string) {
      if (key !== sessionKey) return legacy.getItem(key);
      const status = await native.status();
      if (!status.enabled) return legacy.getItem(key);
      // No fallback to the web copy when locked, unavailable, or permission is denied.
      legacy.removeItem(key);
      return status.locked ? null : (await native.read()).value ?? null;
    },
    async setItem(key: string, value: string) {
      if (key !== sessionKey || !(await native.status()).enabled) { legacy.setItem(key, value); return; }
      await native.write({ key, value });
      legacy.removeItem(key);
    },
    async removeItem(key: string) {
      if (key === sessionKey) {
        await native.clear({ key });
        window.dispatchEvent(new Event("faceid-status-changed"));
      }
      legacy.removeItem(key);
    },
  };
}

// Matches Supabase's existing default key, preserving installed users' sessions.
export const sessionStorageKey = `sb-${new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
export const authStorage = isFaceIdPlatform() ? createBiometricStorage(sessionStorageKey, BiometricSession, localStorage) : localStorage;

export async function enableFaceId(session: object) {
  const before = localStorage.getItem(sessionStorageKey);
  await BiometricSession.enable({ key: sessionStorageKey, value: JSON.stringify(session) });
  // A refresh may finish while the Face ID consent sheet is on screen.
  const latest = localStorage.getItem(sessionStorageKey);
  if (latest && latest !== before) {
    try { await BiometricSession.write({ key: sessionStorageKey, value: latest }); }
    catch (error) { await BiometricSession.clear({ key: sessionStorageKey }); throw error; }
  }
  localStorage.removeItem(sessionStorageKey);
  window.dispatchEvent(new Event("faceid-status-changed"));
}
export async function disableFaceId() {
  const { value } = await BiometricSession.read();
  if (!value) throw new Error("Confirme o Face ID antes de desativar.");
  // Restore ordinary persistence only after an explicit choice in Settings.
  localStorage.setItem(sessionStorageKey, value);
  try { await BiometricSession.clear({ key: sessionStorageKey }); }
  catch (error) { localStorage.removeItem(sessionStorageKey); throw error; }
  window.dispatchEvent(new Event("faceid-status-changed"));
}
