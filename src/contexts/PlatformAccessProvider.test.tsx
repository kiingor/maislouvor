import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { memoryStorage } from "@/test/memoryStorage";
import { consumeAuthRedirect, rememberAuthRedirect } from "@/lib/authRedirect";
const mocks = vi.hoisted(() => ({ onAuthStateChange: vi.fn(), getSession: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: mocks } }));
vi.mock("@/lib/platform", () => ({ platformRpc: vi.fn().mockResolvedValue(false) }));
import { PlatformAccessProvider } from "./PlatformAccessProvider";
beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage()); vi.stubGlobal("sessionStorage", memoryStorage());
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  mocks.getSession.mockResolvedValue({ data: { session: null } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("clears pending web and native authentication destinations when the account signs out", async () => {
  const invite = "/invite/911021fb-bdbf-4300-8f22-4f602f61673c";
  rememberAuthRedirect(invite); rememberAuthRedirect(invite, true);
  render(<QueryClientProvider client={new QueryClient()}><PlatformAccessProvider><p>App</p></PlatformAccessProvider></QueryClientProvider>);
  await waitFor(() => expect(mocks.onAuthStateChange).toHaveBeenCalledOnce());
  await act(async () => mocks.onAuthStateChange.mock.calls[0][0]("SIGNED_OUT", null));
  expect(consumeAuthRedirect()).toBe("/app/home");
  expect(consumeAuthRedirect(null, true)).toBe("/app/home");
});
