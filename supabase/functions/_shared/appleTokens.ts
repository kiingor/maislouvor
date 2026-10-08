// Segredos só no servidor. Tokens Apple nunca são gravados em logs nem no cliente.
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "https://esm.sh/jose@5.9.6";
const appleKeys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
const required = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error("apple_configuration_missing");
  return value;
};
const clientId = () => required("APPLE_CLIENT_ID");
async function clientSecret() {
  const key = await importPKCS8(required("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n"), "ES256");
  return new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: required("APPLE_KEY_ID") })
    .setIssuer(required("APPLE_TEAM_ID")).setSubject(clientId()).setAudience("https://appleid.apple.com")
    .setIssuedAt().setExpirationTime("5m").sign(key);
}
const bytes = (str: string) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
async function encryptionKey() {
  const raw = bytes(required("APPLE_TOKEN_ENCRYPTION_KEY"));
  if (raw.length !== 32) throw new Error("apple_configuration_missing");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptAppleToken(token: string, userId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const value = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) },
    await encryptionKey(), new TextEncoder().encode(token));
  return { iv: btoa(String.fromCharCode(...iv)), token: btoa(String.fromCharCode(...new Uint8Array(value))) };
}
export async function decryptAppleToken(envelope: { iv: string; token: string }, userId: string) {
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(envelope.iv), additionalData: new TextEncoder().encode(userId) },
    await encryptionKey(), bytes(envelope.token));
  return new TextDecoder().decode(data);
}
export async function exchangeAppleCode(code: string, expectedSubjects: string[]) {
  if (!code || code.length > 4096 || !expectedSubjects.length) throw new Error("invalid_apple_credential");
  const response = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST", signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ client_id: clientId(), client_secret: await clientSecret(), grant_type: "authorization_code", code }),
  });
  if (!response.ok) throw new Error("apple_exchange_failed");
  const data = await response.json();
  const { payload } = await jwtVerify(data.id_token, appleKeys, { issuer: "https://appleid.apple.com", audience: clientId(), algorithms: ["RS256"] });
  if (!payload.sub || !expectedSubjects.includes(payload.sub) || typeof data.refresh_token !== "string") throw new Error("invalid_apple_credential");
  return data.refresh_token as string;
}
export async function revokeAppleToken(token: string) {
  const response = await fetch("https://appleid.apple.com/auth/revoke", {
    method: "POST", signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ client_id: clientId(), client_secret: await clientSecret(), token, token_type_hint: "refresh_token" }),
  });
  if (!response.ok) throw new Error("apple_revocation_failed");
}
