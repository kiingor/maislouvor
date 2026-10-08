import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { TermsGate } from "./TermsGate";
import { useTermsAccepted } from "./useTermsAcceptance";
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
const PENDING_KEY = "louvor-legal-pending-acceptance";
// Conta recém-criada por padrão (o aceite anotado no cadastro vale para ela).
const session = (metadata: Record<string, unknown> = {}, createdAt = new Date().toISOString()) => ({
  user: { id: USER, user_metadata: metadata, created_at: createdAt },
});
const current = { terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION, terms_accepted_at: "2026-10-07T12:00:00Z" };
const outdated = { terms_version: null, privacy_version: null, terms_accepted_at: null };

function profileReturns(result: { data: unknown; error: unknown }) {
  mocks.maybeSingle.mockResolvedValue(result);
  const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), maybeSingle: mocks.maybeSingle };
  mocks.from.mockReturnValue(chain);
}

function Where() {
  const { pathname, hash } = useLocation();
  return <p data-testid="where">{pathname + hash}</p>;
}

/** Outro aviso do app logado (ex.: o do Asafe) consultando se pode abrir. */
function AcceptedProbe() {
  return <p data-testid="terms-accepted">{String(useTermsAccepted())}</p>;
}

function renderAt(path: string, { probe = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <TermsGate />
        {probe && <AcceptedProbe />}
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

  it("never blocks the in-app account deletion section", async () => {
    profileReturns({ data: outdated, error: null });
    renderAt("/app/settings#excluir-conta");
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("offers account deletion to whoever does not agree, without accepting", async () => {
    profileReturns({ data: outdated, error: null });
    renderAt("/app/home");

    const link = await screen.findByRole("link", { name: "Excluir minha conta" });
    expect(link).toHaveAttribute("href", "/app/settings#excluir-conta");
    fireEvent.click(link);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("where")).toHaveTextContent("/app/settings#excluir-conta");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

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
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("does not hand an acceptance remembered on this device to an older account", async () => {
    // Alguém tocou em "Criar conta com Google" e desistiu; outra pessoa entra com a conta dela.
    rememberPendingAcceptance();
    mocks.getSession.mockResolvedValue({ data: { session: session({}, "2026-05-10T10:00:00Z") } });
    profileReturns({ data: outdated, error: null });
    renderAt("/app/home");

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("forgets the remembered acceptance when the person signs out", async () => {
    profileReturns({ data: current, error: null });
    renderAt("/login");
    await waitFor(() => expect(mocks.onAuthStateChange).toHaveBeenCalled());
    rememberPendingAcceptance();

    const listener = mocks.onAuthStateChange.mock.calls[0][0] as (event: string, next: unknown) => void;
    act(() => listener("SIGNED_OUT", null));
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("forgets the remembered acceptance when the current versions are already accepted", async () => {
    rememberPendingAcceptance();
    profileReturns({ data: current, error: null });
    renderAt("/app/home");
    await waitFor(() => expect(localStorage.getItem(PENDING_KEY)).toBeNull());
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("asks to update the app when the server already has newer documents", async () => {
    profileReturns({ data: outdated, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "outdated_version: os Termos de Uso mudaram." } });
    renderAt("/app/home");

    fireEvent.click(await screen.findByRole("button", { name: "Aceitar e continuar" }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringMatching(/Atualize o app/) })),
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
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

describe("useTermsAccepted (other blocking notices wait for the terms)", () => {
  it("stays false while the terms dialog is open and turns true after accepting", async () => {
    profileReturns({ data: outdated, error: null });
    mocks.rpc.mockResolvedValue({ data: current, error: null });
    renderAt("/app/home", { probe: true });

    await screen.findByRole("alertdialog");
    expect(screen.getByTestId("terms-accepted")).toHaveTextContent("false");
    fireEvent.click(screen.getByRole("button", { name: "Aceitar e continuar" }));
    await waitFor(() => expect(screen.getByTestId("terms-accepted")).toHaveTextContent("true"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1); // uma consulta só para o gate e o hook
  });

  it("is true when the current versions were accepted", async () => {
    profileReturns({ data: current, error: null });
    renderAt("/app/home", { probe: true });
    await waitFor(() => expect(screen.getByTestId("terms-accepted")).toHaveTextContent("true"));
  });

  it("is true when the acceptance cannot be read, like the gate (fails open)", async () => {
    profileReturns({ data: null, error: { message: "offline" } });
    renderAt("/app/home", { probe: true });
    await waitFor(() => expect(screen.getByTestId("terms-accepted")).toHaveTextContent("true"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("is false without a session", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    renderAt("/app/home", { probe: true });
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalled());
    expect(screen.getByTestId("terms-accepted")).toHaveTextContent("false");
  });
});
