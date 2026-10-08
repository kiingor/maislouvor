import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { aiDisclosure, requireAiConsent } from "./aiConsent.ts";
Deno.test("AI endpoint requires identity and the current explicit disclosure before sending data", async () => {
  const priorFetch=globalThis.fetch;
  const env={ SUPABASE_URL:"https://test.supabase.co", SUPABASE_ANON_KEY:"test", AI_PROVIDER_NAME:"Test operator", AI_PROVIDER_PRIVACY_URL:"https://example.org/privacy", AI_PROVIDER_COUNTRY:"Brasil", AI_PROVIDER_RETENTION:"Somente durante a consulta" };
  const previous=Object.fromEntries(Object.keys(env).map(key=>[key,Deno.env.get(key)]));
  for (const [key,value] of Object.entries(env)) Deno.env.set(key,value);
  globalThis.fetch=()=>Promise.resolve(new Response(JSON.stringify({id:"00000000-0000-4000-8000-000000000001",aud:"authenticated",role:"authenticated"}),{headers:{"Content-Type":"application/json"}}));
  const req=new Request("https://example.org/request",{method:"POST",headers:{Authorization:"Bearer test"}});
  try {
    assertEquals((await requireAiConsent(new Request(req.url,{method:"POST"}),{},{}))?.status,401);
    assertEquals((await requireAiConsent(req,{},{}))?.status,428);
    const disclosure=await aiDisclosure();
    assertEquals((await requireAiConsent(req,{aiConsent:{accepted:false,version:disclosure.version}},{}))?.status,428);
    assertEquals(await requireAiConsent(req,{aiConsent:{accepted:true,version:disclosure.version}},{}),null);
    Deno.env.set("AI_PROVIDER_NAME","Another operator");
    assertEquals((await requireAiConsent(req,{aiConsent:{accepted:true,version:disclosure.version}},{}))?.status,428);
    Deno.env.delete("AI_PROVIDER_PRIVACY_URL");
    assertEquals((await requireAiConsent(req,{aiConsent:{accepted:true,version:disclosure.version}},{}))?.status,503);
  } finally {
    globalThis.fetch=priorFetch;
    for (const key of Object.keys(env)) { const value=previous[key]; if(value===undefined) Deno.env.delete(key); else Deno.env.set(key,value); }
  }
});
