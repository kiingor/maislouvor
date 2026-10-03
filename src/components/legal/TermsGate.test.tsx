import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { TermsGate } from "./TermsGate";
import { PRIVACY_VERSION, TERMS_VERSION, rememberPendingAcceptance } from "@/lib/legal";
import { memoryStorage } from "@/test/memoryStorage";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  toast: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange, signOut: mocks.signOut },
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

const USER = "user-1";
const session = (metadata: Record<string, unknown> = {}) => ({ user: { id: USER, user_metadata: metadata } });
const current = { terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION, terms_accepted_at: "2026-10-03T12:00:00Z" };
const outdated = { terms_version: null, privacy_version: null, terms_accepted_at: null };

function profileReturns(result: { data: unknown; error: unknown }) {
  mocks.maybeSingle.mockResolvedValue(result);
  const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), maybeSingle: mocks.maybeSingle };
  mocks.from.mockReturnValue(chain);
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <TermsGate />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  mocks.getSession.mockResolvedValue({ data: { session: session() } });
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  mocks.signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TermsGate", () => {
  it("blocks the app with a non-dismissible dialog when the accepted versions are outdated", async () => {
    profileReturns({ data: outdated, error: null });
    renderAt("/app/home");

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Termos de Uso e Privacidade");
    expect(screen.getByRole("link", { name: "Termos de Uso" })).toHaveAttribute("href", "/termos");
    expect(screen.getByRole("link", { name: "Política de Privacidade" })).toHaveAttribute("href", "/privacidade");
    expect(mocks.from).toHaveBeenCalledWith("profiles");

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("says the terms were updated when an older version was accepted", async () => {
    profileReturns({ data: { ...current, terms_version: "2025-01-01" }, error: null });
    renderAt("/admin");
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Atualizamos nossos termos");
  });

  it("stays hidden when the current versions were accepted", async () => {
    profileReturns({ data: current, error: null });
    renderAt("/app/home");
    await waitFor(() => expect(mocks.maybeSingle).toHaveBeenCalled());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it.each(["/privacidade", "/termos", "/suporte", "/excluir-conta", "/login", "/signup", "/invite/abc", "/playlist/abc", "/culto/abc", "/reset-password", "/auth/callback", "/baixar", "/application"])(
    "never blocks the public route %s",
    async (path) => {
      profileReturns({ data: outdated, error: null });
      renderAt(path);
      await waitFor(() => expect(mocks.getSession).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mocks.from).not.toHaveBeenCalled();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    },
  );

  it("does nothing without a session", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    profileReturns({ data: outdated, error: null });
    renderAt("/app/home");
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalled());
    expect(mocks.from).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("lets the app through when the acceptance cannot be read (fails open)", async () => {
    profileReturns({ data: null, error: { message: "column profiles.terms_version does not exist" } });
    renderAt("/app/home");
    await waitFor(() => expect(mocks.maybeSingle).toHaveBeenCalled());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("records the acceptance and unblocks when the person accepts", async () => {
    profileReturns({ data: outdated, error: null });
    mocks.rpc.mockResolvedValue({ data: current, error: null });
    renderAt("/app/home");

    fireEvent.click(await screen.findByRole("button", { name: "Aceitar e continuar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.rpc).toHaveBeenCalledWith("accept_terms", { p_terms_version: TERMS_VERSION, p_privacy_version: PRIVACY_VERSION });
  });

  it("keeps the dialog and warns when saving the acceptance fails", async () => {
    profileReturns({ data: outdated, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
    renderAt("/app/home");

    fireEvent.click(await screen.findByRole("button", { name: "Aceitar e continuar" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Não foi possível registrar o aceite" })));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("signs out from the dialog", async () => {
    profileReturns({ data: outdated, error: null });
    renderAt("/app/home");

    fireEvent.click(await screen.findByRole("button", { name: "Sair" }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/login"));
  });

  it("records an acceptance given at sign-up without asking again", async () => {
    rememberPendingAcceptance();
    profileReturns({ data: outdated, error: null });
    mocks.rpc.mockResolvedValue({ data: current, error: null });
    renderAt("/app/home");

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("accept_terms", { p_terms_version: TERMS_VERSION, p_privacy_version: PRIVACY_VERSION }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("louvor-legal-pending-acceptance")).toBeNull();
  });

  it("uses the acceptance stored in the account metadata (e-mail confirmation flow)", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: session({ legal_acceptance: { terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION } }) },
    });
    profileReturns({ data: outdated, error: null });
    mocks.rpc.mockResolvedValue({ data: current, error: null });
    renderAt("/app/home");

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("falls back to the dialog when the automatic acceptance fails", async () => {
    rememberPendingAcceptance();
    profileReturns({ data: outdated, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
    renderAt("/app/home");
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });
});
