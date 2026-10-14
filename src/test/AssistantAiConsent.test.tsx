import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MyAssistantSettings, TeamAssistantSettings } from "@/components/AssistantSettings";
import { AssistantAiConsentDialog } from "@/components/assistant/AssistantAiConsentDialog";
import { AssistantConsentGate } from "@/components/assistant/AssistantConsentGate";
import { ASSISTANT_AI_CONSENT_VERSION, consentErrorMessage, consentVersionLabel } from "@/lib/assistantAiConsent";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn(), profileId: "profile-1" as string | null, termsAccepted: true }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/contexts/TeamContext", () => ({ useTeam: () => ({ profileId: mocks.profileId }) }));
// O aviso do Asafe espera o aceite dos Termos (TermsGate); aqui o aceite já está em dia.
vi.mock("@/components/legal/useTermsAcceptance", () => ({ useTermsAccepted: () => mocks.termsAccepted }));

function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const overview = (consent: Record<string, unknown>, overrides = {}) => ({
  platform_enabled: true,
  team_enabled: true,
  assistant_name: "Asafe",
  bot_phone: "5511955554444",
  instructions: "",
  instructions_max: 2000,
  usage: { today: 0, team_limit: 100, member_limit: 20 },
  groups: [],
  pending_code: null,
  ai_consent: { current_version: ASSISTANT_AI_CONSENT_VERSION, version: null, accepted_at: null, accepted_by: null, ...consent },
  ...overrides,
});

const myStatus = (consent: Record<string, unknown>, overrides = {}) => ({
  enabled: true, assistant_name: "Asafe", bot_phone: "5511955554444", has_phone: true, linked: false,
  ai_consent: { accepted_at: null, current_version: ASSISTANT_AI_CONSENT_VERSION, ...consent },
  ...overrides,
});

// O Node recente expõe um localStorage próprio (vazio sem --localstorage-file) por cima do jsdom.
const storage = new Map<string, string>();
beforeAll(() => {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)); },
    removeItem: (key: string) => { storage.delete(key); },
    clear: () => storage.clear(),
  });
});
afterAll(() => vi.unstubAllGlobals());

beforeEach(() => {
  mocks.profileId = "profile-1";
  storage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("aviso de IA", () => {
  it("names the third-party provider, the data sent, purpose, retention, revocation and the privacy policy", () => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    render(<AssistantAiConsentDialog open variant="team-activate" onAccept={onAccept} onDecline={onDecline} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Ativar o Asafe com IA da OpenAI?" });
    const text = dialog.textContent ?? "";
    expect(text).toContain("OpenAI (Estados Unidos)");
    for (const item of ["Mensagens enviadas ao Asafe", "Nome e função na equipe", "Escalas e disponibilidade", "Repertório", "Telefone e WhatsApp"]) {
      expect(text).toContain(item);
    }
    expect(text).toContain("Não são enviados à OpenAI");
    expect(text).toContain("30 dias");
    expect(text).toContain("É opcional");
    expect(text).toContain("Usuário › Asafe");
    expect(text).toContain(`versão ${consentVersionLabel()}`);
    expect(within(dialog).getByRole("link", { name: /Política de Privacidade/ }).getAttribute("href")).toMatch(/\/privacidade$/);

    fireEvent.click(within(dialog).getByRole("button", { name: "Concordo e ativar" }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Agora não" }));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it("does not let a leader of a team already using the assistant close the prompt without a decision", () => {
    const onClose = vi.fn();
    render(<AssistantAiConsentDialog open variant="team-confirm" teamName="Louvor Sede" groups={2} onAccept={vi.fn()} onDecline={vi.fn()} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Confirme o uso de IA no Asafe" });
    expect(dialog.textContent).toContain("ativo em 2 grupos da equipe Louvor Sede");
    expect(within(dialog).queryByRole("button", { name: "Fechar" })).not.toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "Concordo e manter ativo" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Desativar o assistente" })).toBeEnabled();
  });

  it("tells a person who never agreed that declining keeps the assistant from recognizing them", () => {
    render(<AssistantAiConsentDialog open variant="member" onAccept={vi.fn()} onDecline={vi.fn()} onClose={vi.fn()} />);
    const text = screen.getByRole("dialog", { name: "Permitir que o Asafe use seus dados?" }).textContent ?? "";
    expect(text).toContain("Sem isso, o Asafe não reconhece você no grupo");
    expect(text).not.toContain("continua reconhecendo");
  });

  it("requires consent even for a grandfathered person", () => {
    render(
      <AssistantAiConsentDialog open variant="member-notice" legacy graceUntil="2026-11-02T15:00:00Z"
        onAccept={vi.fn()} onDecline={vi.fn()} onClose={vi.fn()} />,
    );
    const text = screen.getByRole("dialog", { name: "O Asafe usa IA da OpenAI" }).textContent ?? "";
    expect(text).toContain("Ele só reconhece você no grupo se você permitir");
    expect(text).not.toContain("Até você decidir, o Asafe continua");
    expect(text).toContain("Sem isso, o Asafe não reconhece você");
  });

  it("tells leaders that each person still chooses for their own data", () => {
    render(<AssistantAiConsentDialog open variant="team-activate" onAccept={vi.fn()} onDecline={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog").textContent).toContain("cada pessoa (inclusive você) escolhe em Usuário › Asafe");
  });

  it("explains the database errors", () => {
    expect(consentErrorMessage(new Error("outdated_version"))).toMatch(/Atualize o app/);
    expect(consentErrorMessage(new Error("consent_required"))).toMatch(/Aceite o aviso/);
    expect(consentErrorMessage(new Error("offline"))).toBe("offline");
  });
});

describe("TeamAssistantSettings com o aviso de IA", () => {
  it("asks for consent before the first activation code and only then generates it", async () => {
    let current = overview({ state: "none" });
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "assistant_team_overview") return { data: current, error: null };
      if (fn === "give_assistant_consent") {
        current = overview({ state: "granted", version: ASSISTANT_AI_CONSENT_VERSION, accepted_at: "2026-10-03T12:00:00Z", accepted_by: "Ana Souza" });
        return { data: { ok: true, state: "granted" }, error: null };
      }
      if (fn === "assistant_create_activation_code") {
        current = { ...current, pending_code: { code: "K7Q2PD", expires_at: "2026-10-04T12:00:00Z" } } as typeof current;
        return { data: current.pending_code, error: null };
      }
      return { data: null, error: null };
    });
    renderWithQuery(<TeamAssistantSettings teamId="team-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Gerar código de ativação" }));
    const dialog = await screen.findByRole("dialog", { name: "Ativar o Asafe com IA da OpenAI?" });
    expect(mocks.rpc).not.toHaveBeenCalledWith("assistant_create_activation_code", expect.anything());

    fireEvent.click(within(dialog).getByRole("button", { name: "Agora não" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.rpc).not.toHaveBeenCalledWith("give_assistant_consent", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Gerar código de ativação" }));
    fireEvent.click(await screen.findByRole("button", { name: "Concordo e ativar" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("give_assistant_consent", {
      p_scope: "team_activation", p_team_id: "team-1", p_version: ASSISTANT_AI_CONSENT_VERSION,
    }));
    expect(await screen.findByText("@Asafe ativar K7Q2PD")).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("assistant_create_activation_code", { p_team_id: "team-1" });
    expect(await screen.findByText(/Autorizada em 03\/10\/2026 por Ana/)).toBeInTheDocument();
  });

  it("blocks the settings of a team already using the assistant until a leader confirms or deactivates", async () => {
    let current = overview({ state: "pending" }, {
      groups: [{ id: "g1", name: "Louvor 🎸", activated_at: "2026-09-27T12:00:00Z", activated_by: "Ana Souza" }],
    });
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "assistant_team_overview") return { data: current, error: null };
      if (fn === "assistant_notification_settings") return { data: { cultos: true, escala: true, repertorio: true, avisos: true, lembretes: true }, error: null };
      if (fn === "revoke_assistant_consent") {
        current = overview({ state: "none" });
        return { data: { ok: true, state: "none", groups_deactivated: 1 }, error: null };
      }
      return { data: { ok: true }, error: null };
    });
    renderWithQuery(<TeamAssistantSettings teamId="team-1" />);

    expect(await screen.findByText("Confirme o uso de IA da OpenAI")).toBeInTheDocument();
    expect(screen.getByText(/está ativo em 1 grupo desta equipe/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gerar/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Avisos automáticos")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revisar e confirmar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Concordo e manter ativo" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("give_assistant_consent", {
      p_scope: "team_activation", p_team_id: "team-1", p_version: ASSISTANT_AI_CONSENT_VERSION,
    }));

    fireEvent.click(screen.getByRole("button", { name: "Revisar e confirmar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Desativar o assistente" }));
    let confirm = await screen.findByRole("alertdialog", { name: "Desativar o Asafe?" });
    expect(confirm.textContent).toContain("todos os grupos desta equipe (1 grupo)");
    expect(confirm.textContent).toContain("as missões agendadas ficam pausadas");
    expect(confirm.textContent).toContain("“@Asafe ativar CÓDIGO” em cada grupo");
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.rpc).not.toHaveBeenCalledWith("revoke_assistant_consent", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Desativar o Asafe" }));
    confirm = await screen.findByRole("alertdialog", { name: "Desativar o Asafe?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Desativar" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("revoke_assistant_consent", {
      p_scope: "team_activation", p_team_id: "team-1",
    }));
    expect(await screen.findByRole("button", { name: "Gerar código de ativação" })).toBeInTheDocument();
  });
});

describe("MyAssistantSettings com o aviso de IA", () => {
  it("never shows the switch on for a person who has not agreed", async () => {
    mocks.rpc.mockImplementation(async (fn: string) =>
      fn === "assistant_my_status"
        ? { data: myStatus({ state: "pending", allowed: false, legacy: false }), error: null }
        : { data: null, error: null });
    renderWithQuery(<MyAssistantSettings />);

    const toggle = await screen.findByRole("switch", { name: "Permitir que o Asafe use meus dados" });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText("Falta autorizar")).toBeInTheDocument();
    expect(screen.getByText(/Não autorizado\. O Asafe só reconhece você no grupo depois que você permitir/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Não permitir" })).toBeInTheDocument();

    fireEvent.click(toggle);
    const dialog = await screen.findByRole("dialog", { name: "Permitir que o Asafe use seus dados?" });
    expect(dialog.textContent).toContain("Sem isso, o Asafe não reconhece você no grupo");
    fireEvent.click(within(dialog).getByRole("button", { name: "Agora não" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.rpc.mock.calls.map(([fn]) => fn)).toEqual(["assistant_my_status"]);
  });

  it("shows a grandfathered person as undecided (switch off) and lets them refuse after a confirmation", async () => {
    let consent: Record<string, unknown> = { state: "pending", allowed: true, legacy: true, grace_until: "2026-11-02T15:00:00Z" };
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "assistant_my_status") return { data: myStatus(consent), error: null };
      if (fn === "revoke_assistant_consent") { consent = { state: "opted_out", allowed: false }; return { data: { ok: true }, error: null }; }
      return { data: null, error: null };
    });
    renderWithQuery(<MyAssistantSettings />);

    const toggle = await screen.findByRole("switch", { name: "Permitir que o Asafe use meus dados" });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText("Falta autorizar")).toBeInTheDocument();
    expect(screen.getByText(/Não autorizado/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Não permitir" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Não permitir o uso dos seus dados?" });
    expect(confirm.textContent).toContain("apaga o histórico das suas conversas com ele");
    expect(mocks.rpc).not.toHaveBeenCalledWith("revoke_assistant_consent", expect.anything());
    fireEvent.click(within(confirm).getByRole("button", { name: "Não permitir" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("revoke_assistant_consent", { p_scope: "member_link", p_team_id: null }));
    expect(await screen.findByText("Desligado")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Permitir que o Asafe use meus dados" })).not.toBeChecked();
  });

  it("asks for confirmation before turning off a granted permission", async () => {
    let consent: Record<string, unknown> = { state: "granted", allowed: true, accepted_at: "2026-10-03T12:00:00Z" };
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "assistant_my_status") return { data: myStatus(consent), error: null };
      if (fn === "revoke_assistant_consent") { consent = { state: "opted_out", allowed: false }; return { data: { ok: true }, error: null }; }
      return { data: null, error: null };
    });
    renderWithQuery(<MyAssistantSettings />);

    const toggle = await screen.findByRole("switch", { name: "Permitir que o Asafe use meus dados" });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    const confirm = await screen.findByRole("alertdialog", { name: "Desligar o uso dos seus dados?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Desligar" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("revoke_assistant_consent", { p_scope: "member_link", p_team_id: null }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Permitir que o Asafe use meus dados" })).not.toBeChecked());
    expect(screen.getByText("Desligado")).toBeInTheDocument();
  });

  it("shows the disclosure before turning it back on", async () => {
    let consent: Record<string, unknown> = { state: "opted_out", allowed: false };
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "assistant_my_status") return { data: myStatus(consent), error: null };
      if (fn === "give_assistant_consent") {
        consent = { state: "granted", allowed: true, accepted_at: "2026-10-03T12:00:00Z" };
        return { data: { ok: true }, error: null };
      }
      return { data: null, error: null };
    });
    renderWithQuery(<MyAssistantSettings />);

    fireEvent.click(await screen.findByRole("switch", { name: "Permitir que o Asafe use meus dados" }));
    const dialog = await screen.findByRole("dialog", { name: "Permitir que o Asafe use seus dados?" });
    expect(dialog.textContent).toContain("seu nome não vai para a IA");
    expect(dialog.textContent).toContain("seu nome continua nas escalas da equipe");
    fireEvent.click(within(dialog).getByRole("button", { name: "Concordo e permitir" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("give_assistant_consent", {
      p_scope: "member_link", p_team_id: null, p_version: ASSISTANT_AI_CONSENT_VERSION,
    }));
    expect(await screen.findByText(/Autorizado em 03\/10\/2026/)).toBeInTheDocument();
  });

  it("asks for consent before generating a WhatsApp link code", async () => {
    let consent: Record<string, unknown> = { state: "pending", allowed: false };
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "assistant_my_status") return { data: myStatus(consent, { has_phone: false }), error: null };
      if (fn === "give_assistant_consent") { consent = { state: "granted", allowed: true }; return { data: { ok: true }, error: null }; }
      if (fn === "assistant_create_link_code") return { data: { code: "K7Q2PD", expires_at: "2026-10-03T13:00:00Z" }, error: null };
      return { data: null, error: null };
    });
    renderWithQuery(<MyAssistantSettings />);

    fireEvent.click(await screen.findByRole("button", { name: "O WhatsApp esconde meu número" }));
    fireEvent.click(await screen.findByRole("button", { name: "Concordo e vincular" }));
    expect(await screen.findByText("vincular K7Q2PD")).toBeInTheDocument();
    const order = mocks.rpc.mock.calls.map(([fn]) => fn).filter((fn) => fn !== "assistant_my_status");
    expect(order).toEqual(["give_assistant_consent", "assistant_create_link_code"]);
  });
});

describe("AssistantConsentGate", () => {
  it("shows the pending team prompt to its leaders when the app opens", async () => {
    let teams = [{ team_id: "team-1", team_name: "Louvor Sede", state: "pending", groups: 1 }];
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "assistant_consent_prompts") return { data: { version: ASSISTANT_AI_CONSENT_VERSION, assistant_name: "Asafe", teams, member_notice: false }, error: null };
      if (fn === "give_assistant_consent") { teams = []; return { data: { ok: true }, error: null }; }
      return { data: null, error: null };
    });
    renderWithQuery(<AssistantConsentGate />);

    const dialog = await screen.findByRole("dialog", { name: "Confirme o uso de IA no Asafe" });
    expect(dialog.textContent).toContain("ativo em 1 grupo da equipe Louvor Sede");
    fireEvent.click(within(dialog).getByRole("button", { name: "Concordo e manter ativo" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("give_assistant_consent", {
      p_scope: "team_activation", p_team_id: "team-1", p_version: ASSISTANT_AI_CONSENT_VERSION,
    }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("asks the leader to confirm before deactivating from the prompt", async () => {
    let teams = [{ team_id: "team-1", team_name: "Louvor Sede", state: "pending", groups: 2 }];
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "assistant_consent_prompts") return { data: { version: ASSISTANT_AI_CONSENT_VERSION, assistant_name: "Asafe", teams, member_notice: false }, error: null };
      if (fn === "revoke_assistant_consent") { teams = []; return { data: { ok: true }, error: null }; }
      return { data: null, error: null };
    });
    renderWithQuery(<AssistantConsentGate />);

    fireEvent.click(await screen.findByRole("button", { name: "Desativar o assistente" }));
    let confirm = await screen.findByRole("alertdialog", { name: "Desativar o Asafe?" });
    expect(confirm.textContent).toContain("todos os grupos desta equipe (2 grupos)");
    expect(confirm.textContent).toContain("as missões agendadas ficam pausadas");
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancelar" }));
    expect(await screen.findByRole("dialog", { name: "Confirme o uso de IA no Asafe" })).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalledWith("revoke_assistant_consent", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Desativar o assistente" }));
    confirm = await screen.findByRole("alertdialog", { name: "Desativar o Asafe?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Desativar" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("revoke_assistant_consent", { p_scope: "team_activation", p_team_id: "team-1" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("brings the member notice back on the next app open until the person decides", async () => {
    mocks.rpc.mockResolvedValue({ data: { version: ASSISTANT_AI_CONSENT_VERSION, assistant_name: "Asafe", teams: [], member_notice: true }, error: null });
    const first = renderWithQuery(<AssistantConsentGate />);
    const dialog = await screen.findByRole("dialog", { name: "O Asafe usa IA da OpenAI" });
    expect(dialog.textContent).toContain("Ele só reconhece você no grupo se você permitir");
    expect(within(dialog).getByRole("button", { name: "Permitir" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Não permitir" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(storage.size).toBe(0);
    first.unmount();

    renderWithQuery(<AssistantConsentGate />);
    expect(await screen.findByRole("dialog", { name: "O Asafe usa IA da OpenAI" })).toBeInTheDocument();
    expect(mocks.rpc.mock.calls.map(([fn]) => fn)).toEqual(["assistant_consent_prompts", "assistant_consent_prompts"]);
  });

  it("records the member's refusal only after a confirmation", async () => {
    let notice = true;
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "assistant_consent_prompts") {
        return { data: { version: ASSISTANT_AI_CONSENT_VERSION, assistant_name: "Asafe", teams: [], member_notice: notice, member_legacy: true }, error: null };
      }
      if (fn === "revoke_assistant_consent") { notice = false; return { data: { ok: true }, error: null }; }
      return { data: null, error: null };
    });
    renderWithQuery(<AssistantConsentGate />);
    const dialog = await screen.findByRole("dialog", { name: "O Asafe usa IA da OpenAI" });
    expect(dialog.textContent).toContain("Ele só reconhece você no grupo se você permitir");
    fireEvent.click(within(dialog).getByRole("button", { name: "Não permitir" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Não permitir o uso dos seus dados?" });
    expect(mocks.rpc).not.toHaveBeenCalledWith("revoke_assistant_consent", expect.anything());
    fireEvent.click(within(confirm).getByRole("button", { name: "Não permitir" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("revoke_assistant_consent", { p_scope: "member_link", p_team_id: null }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("waits for the Terms acceptance before asking anything", async () => {
    mocks.termsAccepted = false;
    try {
      mocks.rpc.mockResolvedValue({ data: { version: ASSISTANT_AI_CONSENT_VERSION, assistant_name: "Asafe", teams: [], member_notice: true }, error: null });
      const { container } = renderWithQuery(<AssistantConsentGate />);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();
    } finally {
      mocks.termsAccepted = true;
    }
  });

  it("stays quiet when the backend does not have the consent migration yet", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "function assistant_consent_prompts does not exist" } });
    const { container } = renderWithQuery(<AssistantConsentGate />);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
