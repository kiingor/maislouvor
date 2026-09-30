import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MyAssistantSettings, TeamAssistantSettings } from "@/components/AssistantSettings";
import { activationMessage, formatWhatsAppNumber, linkMessage, whatsAppLink } from "@/lib/whatsappAssistant";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const overview = (overrides = {}) => ({
  platform_enabled: true,
  team_enabled: true,
  assistant_name: "Asafe",
  bot_phone: "5511955554444",
  instructions: "Ensaio quinta 20h.",
  instructions_max: 2000,
  usage: { today: 12, team_limit: 100, member_limit: 20 },
  groups: [{ id: "g1", name: "Louvor 🎸", activated_at: "2026-09-27T12:00:00Z", activated_by: "Ana Souza" }],
  pending_code: null,
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("whatsappAssistant helpers", () => {
  it("formats the platform number and the group messages", () => {
    expect(formatWhatsAppNumber("5511955554444")).toBe("+55 (11) 95555-4444");
    expect(formatWhatsAppNumber("551155554444")).toBe("+55 (11) 5555-4444");
    expect(formatWhatsAppNumber("14155550100")).toBe("+14155550100");
    expect(formatWhatsAppNumber(null)).toBe("");
    expect(activationMessage("Asafe", "K7Q2PD")).toBe("@Asafe ativar K7Q2PD");
    expect(linkMessage("K7Q2PD")).toBe("vincular K7Q2PD");
    expect(whatsAppLink("+55 (11) 95555-4444", "vincular K7Q2PD")).toBe("https://wa.me/5511955554444?text=vincular%20K7Q2PD");
    expect(whatsAppLink(null)).toBeNull();
  });
});

describe("TeamAssistantSettings", () => {
  it("saves one automatic notice option without changing the others", async () => {
    const prefs = { cultos: true, escala: true, repertorio: true, avisos: true, lembretes: true };
    mocks.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "assistant_team_overview") return { data: overview(), error: null };
      if (fn === "assistant_notification_settings") return { data: prefs, error: null };
      if (fn === "assistant_set_notification") return { data: { ...prefs, [args.p_kind as string]: args.p_enabled }, error: null };
      return { data: null, error: null };
    });
    renderWithQuery(<TeamAssistantSettings teamId="team-1" />);
    const option = await screen.findByRole("switch", { name: "Escalas" });
    expect(option).toBeChecked();
    fireEvent.click(option);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("assistant_set_notification", {
      p_team_id: "team-1", p_kind: "escala", p_enabled: false,
    }));
    await waitFor(() => expect(option).not.toBeChecked());
    expect(screen.getByRole("switch", { name: "Repertório" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Lembrete na véspera" })).toBeChecked();
  });

  it("keeps the saved setting visible when changing it fails", async () => {
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "assistant_team_overview") return { data: overview(), error: null };
      if (fn === "assistant_notification_settings") return { data: { cultos:true,escala:true,repertorio:true,avisos:true,lembretes:true }, error: null };
      return { data: null, error: { message: "offline" } };
    });
    renderWithQuery(<TeamAssistantSettings teamId="team-1" />);
    const option = await screen.findByRole("switch", { name: "Lembrete na véspera" });
    fireEvent.click(option);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Não foi possível salvar" })));
    expect(option).toBeChecked();
    expect(option).toBeEnabled();
  });

  it("shows the number, usage and connected groups, and generates an activation code", async () => {
    let current = overview();
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "assistant_team_overview") return { data: current, error: null };
      if (fn === "assistant_create_activation_code") {
        current = overview({ pending_code: { code: "K7Q2PD", expires_at: "2026-09-28T12:00:00Z" } });
        return { data: current.pending_code, error: null };
      }
      return { data: null, error: null };
    });

    renderWithQuery(<TeamAssistantSettings teamId="team-1" />);

    expect(await screen.findByText("+55 (11) 95555-4444")).toBeInTheDocument();
    expect(screen.getByText("12 de 100")).toBeInTheDocument();
    expect(screen.getByText("Louvor 🎸")).toBeInTheDocument();
    expect(screen.getByText(/Cada pessoa pode fazer até 20 perguntas por dia/)).toBeInTheDocument();
    expect(screen.getByText("Minha escala")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gerar código de ativação" }));
    expect(await screen.findByText("@Asafe ativar K7Q2PD")).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("assistant_create_activation_code", { p_team_id: "team-1" });
  });

  it("saves the ministry instructions trimmed", async () => {
    mocks.rpc.mockImplementation(async (fn: string) =>
      fn === "assistant_team_overview" ? { data: overview(), error: null } : { data: { ok: true }, error: null },
    );
    renderWithQuery(<TeamAssistantSettings teamId="team-1" />);

    const field = await screen.findByLabelText("Instruções do ministério para o Asafe");
    const save = screen.getByRole("button", { name: "Salvar instruções" });
    expect(field).toHaveValue("Ensaio quinta 20h.");
    expect(save).toBeDisabled();

    fireEvent.change(field, { target: { value: "  Ensaio quinta 20h, no templo sede.  " } });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("assistant_update_instructions", {
        p_team_id: "team-1",
        p_instructions: "Ensaio quinta 20h, no templo sede.",
      }),
    );
    await waitFor(() => expect(field).toHaveValue("Ensaio quinta 20h, no templo sede."));
    expect(save).toBeDisabled();
  });

  it("shows 'em breve' before the platform number is ready, keeping the instructions editable", async () => {
    mocks.rpc.mockResolvedValue({ data: overview({ platform_enabled: false }), error: null });
    renderWithQuery(<TeamAssistantSettings teamId="team-1" />);

    expect(await screen.findByText("Em breve")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gerar código de ativação" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Instruções do ministério para o Asafe")).toBeInTheDocument();
  });

  it("renders nothing when the backend does not have the assistant yet", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "function assistant_team_overview does not exist" } });
    const { container } = renderWithQuery(<TeamAssistantSettings teamId="team-1" />);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe("MyAssistantSettings", () => {
  const status = (overrides = {}) => ({
    enabled: true, assistant_name: "Asafe", bot_phone: "5511955554444", has_phone: false, linked: false, ...overrides,
  });

  it("asks for a phone when there is none and opens the private chat with the link code", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    mocks.rpc.mockImplementation(async (fn: string) =>
      fn === "assistant_my_status"
        ? { data: status(), error: null }
        : { data: { code: "K7Q2PD", expires_at: "2026-09-27T13:00:00Z" }, error: null },
    );
    renderWithQuery(<MyAssistantSettings />);

    expect(await screen.findByText("Cadastre seu telefone")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "O WhatsApp esconde meu número" }));
    expect(await screen.findByText("vincular K7Q2PD")).toBeInTheDocument();
    expect(screen.getByText(/Mande no privado do Asafe, não no grupo/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Abrir conversa" }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith("https://wa.me/5511955554444?text=vincular%20K7Q2PD", "_blank", "noopener"),
    );
    open.mockRestore();
  });

  it("lets the person undo the link", async () => {
    let linked = true;
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "assistant_my_status") return { data: status({ has_phone: true, linked }), error: null };
      if (fn === "assistant_unlink_me") { linked = false; return { data: { ok: true, removed: 2 }, error: null }; }
      return { data: null, error: null };
    });
    renderWithQuery(<MyAssistantSettings />);

    expect(await screen.findByText("Reconhece você")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vincular outro WhatsApp" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Desvincular meu WhatsApp" }));
    fireEvent.click(await screen.findByRole("button", { name: "Desvincular" }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("assistant_unlink_me", undefined));
    expect(await screen.findByText("Pelo seu telefone")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desvincular meu WhatsApp" })).not.toBeInTheDocument();
  });

  it("stays hidden while the assistant is off", async () => {
    mocks.rpc.mockResolvedValue({ data: status({ enabled: false, has_phone: true }), error: null });
    const { container } = renderWithQuery(<MyAssistantSettings />);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("assistant_my_status", undefined));
    expect(container).toBeEmptyDOMElement();
  });
});
