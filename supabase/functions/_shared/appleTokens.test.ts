import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { encryptAppleToken, decryptAppleToken } from "./appleTokens.ts";
Deno.test("Apple token encryption is randomized and bound to the authenticated user", async () => {
  Deno.env.set("APPLE_TOKEN_ENCRYPTION_KEY", btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))));
  const a = await encryptAppleToken("token-test", "user-a");
  const b = await encryptAppleToken("token-test", "user-a");
  assertEquals(a.token === b.token, false);
  assertEquals(await decryptAppleToken(a,"user-a"),"token-test");
  await assertRejects(() => decryptAppleToken(a,"user-b"));
  await assertRejects(() => decryptAppleToken({ ...a, token: a.token.slice(0,2)+"AA"+a.token.slice(4) },"user-a"));
  Deno.env.delete("APPLE_TOKEN_ENCRYPTION_KEY");
});
