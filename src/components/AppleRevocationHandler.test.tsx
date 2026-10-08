import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppleRevocationHandler } from "./AppleRevocationHandler";
const mock=vi.hoisted(()=>({listener:null as (()=>void)|null,clear:vi.fn(),getSession:vi.fn(),signOut:vi.fn(),local:vi.fn()}));
vi.mock("@/lib/appleSignIn",()=>({isAppleSignInAvailable:()=>true,AppleSignIn:{addListener:async (_event:string,listener:()=>void)=>{mock.listener=listener;return {remove:async()=>{}};}}}));
vi.mock("@/lib/biometricStorage",()=>({BiometricSession:{clear:mock.clear},sessionStorageKey:"session"}));
vi.mock("@/lib/accountDeletion",()=>({clearLocalAccountData:mock.local}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{auth:{getSession:mock.getSession,signOut:mock.signOut}}}));
beforeEach(()=>{mock.listener=null;mock.clear.mockResolvedValue(undefined);mock.signOut.mockResolvedValue({error:null});});
afterEach(()=>{cleanup();vi.clearAllMocks();});
function mount(){return render(<QueryClientProvider client={new QueryClient()}><AppleRevocationHandler/></QueryClientProvider>);}
describe("Apple credential revocation",()=>{
 it.each([null,{user:{id:"u1",identities:[{provider:"apple"}]}}])("clears the secure credential even when Face ID hides the session",async session=>{
  mock.getSession.mockResolvedValue({data:{session}});mount();await waitFor(()=>expect(mock.listener).not.toBeNull());
  act(()=>mock.listener?.());await waitFor(()=>expect(mock.signOut).toHaveBeenCalledWith({scope:"local"}));
  expect(mock.clear).toHaveBeenCalledWith({key:"session"});
 });
 it("does not sign out an unrelated Google session",async()=>{
  mock.getSession.mockResolvedValue({data:{session:{user:{id:"u2",identities:[{provider:"google"}]}}}});mount();await waitFor(()=>expect(mock.listener).not.toBeNull());
  await act(async()=>{mock.listener?.();await Promise.resolve();});expect(mock.clear).not.toHaveBeenCalled();expect(mock.signOut).not.toHaveBeenCalled();
 });
});
