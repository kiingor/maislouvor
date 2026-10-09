import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BillingContext } from "@/lib/billing/types";
import { HomeSubscriptionPrompt } from "./HomeSubscriptionPrompt";

const mocks = vi.hoisted(() => ({
  getBillingContext: vi.fn(),
  team: { currentTeam: { id: "team", name: "Equipe", owner_id: "profile" }, profileId: "profile" },
}));
vi.mock("@/contexts/TeamContext", () => ({ useTeam: () => mocks.team }));
vi.mock("@/lib/billing/api", () => ({ getBillingContext: mocks.getBillingContext }));
let context: BillingContext;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.team.currentTeam = { id: "team", name: "Equipe", owner_id: "profile" };
  mocks.team.profileId = "profile";
  context = {
    team_id: "team", can_manage: true, app_user_id: "customer", member_count: 1, products: [],
    subscription: { plan: "free", status: "free", provider: "manual", is_active: false, will_renew: false, entitlement_ids: [] },
  };
  mocks.getBillingContext.mockImplementation(async () => structuredClone(context));
});
afterEach(cleanup);
function Destination() {
  const location = useLocation();
  return <p>Destino: {location.pathname}{location.search}</p>;
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/app/home"]}>
    <Routes><Route path="/app/home" element={<HomeSubscriptionPrompt />} /><Route path="/app/settings" element={<Destination />} /></Routes>
  </MemoryRouter></QueryClientProvider>);
  return { ...view, client };
}
describe("Home subscription prompt", () => {
  it("shows a quiet invitation for a new free team and links to its subscription tab", async () => {
    mount();
    const link = await screen.findByRole("link", { name: "Ver planos" });
    expect(screen.getByText("Amplie quando precisar.")).toBeVisible();
    expect(link).toHaveAttribute("href", "/app/settings?aba=assinatura&equipe=team");
    fireEvent.click(link);
    expect(await screen.findByText("Destino: /app/settings?aba=assinatura&equipe=team")).toBeVisible();
    expect(mocks.getBillingContext).toHaveBeenCalledExactlyOnceWith("team");
  });
  it("does not promote plans before the current subscription is known", async () => {
    let resolve!: (value: BillingContext) => void;
    mocks.getBillingContext.mockReturnValue(new Promise<BillingContext>(done => { resolve = done; }));
    const { container } = mount();
    expect(container).toBeEmptyDOMElement();
    await act(async () => { resolve(context); });
    expect(await screen.findByRole("link", { name: "Ver planos" })).toBeVisible();
  });
  it("does not query billing or offer checkout to a leader or member who is not the owner", () => {
    mocks.team.currentTeam.owner_id = "other-owner";
    const { container } = mount();
    expect(container).toBeEmptyDOMElement();
    expect(mocks.getBillingContext).not.toHaveBeenCalled();
  });
  it.each([
    ["server denies management", (c: BillingContext) => { c.can_manage = false; }],
    ["paid access", (c: BillingContext) => { c.subscription.plan = "completo"; c.subscription.is_active = true; c.subscription.provider = "revenuecat"; }],
    ["renewal already scheduled", (c: BillingContext) => { c.subscription.will_renew = true; }],
    ["cancelled renewal with remaining access", (c: BillingContext) => { c.subscription.plan = "estudio"; c.subscription.is_active = true; c.subscription.will_renew = false; }],
    ["expired paid plan", (c: BillingContext) => { c.subscription.plan = "asafe"; c.subscription.provider = "revenuecat"; c.subscription.status = "expired"; }],
    ["manual paid grant", (c: BillingContext) => { c.subscription.plan = "completo"; }],
    ["grandfathered team", (c: BillingContext) => { c.subscription.is_unlimited = true; c.subscription.unlimited_reason = "legacy"; }],
    ["different team's context", (c: BillingContext) => { c.team_id = "another-team"; }],
  ] as const)("keeps Home without an upsell when %s", async (_label, modify) => {
    modify(context);
    const { container, client } = mount();
    await waitFor(() => expect(client.getQueryState(["billing", "team", "profile"])?.status).toBe("success"));
    expect(container).toBeEmptyDOMElement();
  });
  it("does not mistake a failed subscription lookup for a free team", async () => {
    mocks.getBillingContext.mockRejectedValue(new Error("unavailable"));
    const { container, client } = mount();
    await waitFor(() => expect(client.getQueryState(["billing", "team", "profile"])?.status).toBe("error"));
    expect(container).toBeEmptyDOMElement();
  });
});
