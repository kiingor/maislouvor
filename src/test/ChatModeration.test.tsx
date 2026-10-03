import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ReportMessageDialog } from "@/components/chat/ReportMessageDialog";
import { ModeratedMessage, type ModeratedMessageProps } from "@/components/chat/ModeratedMessage";
import { useChatModeration } from "@/components/chat/useChatModeration";
import { REPORT_RECEIVED_DESCRIPTION, REPORT_RECEIVED_TITLE, chatModerationError } from "@/lib/chatModeration";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn(), toast: vi.fn(), firePush: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    storage: { from: () => ({ remove: mocks.remove, createSignedUrl: vi.fn() }) },
  },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/push", () => ({ firePush: mocks.firePush }));

beforeAll(() => {
  // JSDOM não tem DOMRect.fromRect (âncora virtual do menu de contexto do Radix).
  if (typeof DOMRect === "undefined" || !("fromRect" in DOMRect)) {
    const rect = (r: { x?: number; y?: number; width?: number; height?: number } = {}) => {
      const { x = 0, y = 0, width = 0, height = 0 } = r;
      return { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height, toJSON: () => ({}) };
    };
    vi.stubGlobal("DOMRect", Object.assign(function DOMRect() { return rect(); }, { fromRect: rect }));
  }
  // Nem PointerEvent: sem ele, pointerType e coordenadas não chegam ao handler.
  if (typeof window.PointerEvent === "undefined") {
    class TestPointerEvent extends MouseEvent {
      pointerType: string;
      isPrimary: boolean;
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? "mouse";
        this.isPrimary = init.isPrimary ?? true;
        this.pointerId = init.pointerId ?? 1;
      }
    }
    vi.stubGlobal("PointerEvent", TestPointerEvent);
  }
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function withQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const message = {
  id: "msg-1",
  sender_profile_id: "profile-ana",
  senderName: "Ana Souza",
  message_type: "text",
  content: "Mensagem ofensiva",
};

describe("ReportMessageDialog", () => {
  it("sends the reason and details, confirms with the 24-hour notice and pushes to the leaders", async () => {
    mocks.rpc.mockResolvedValue({
      data: { id: "rep-1", already_reported: false, notify_profile_ids: ["leader-1"], team_name: "Louvor Alfa" },
      error: null,
    });
    const onOpenChange = vi.fn();
    withQuery(<ReportMessageDialog open onOpenChange={onOpenChange} message={message} teamId="team-1" />);

    const send = screen.getByRole("button", { name: "Enviar" });
    expect(send).toBeDisabled();
    expect(screen.getByText("Mensagem ofensiva")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(7);

    fireEvent.click(screen.getByRole("radio", { name: /Assédio ou intimidação/ }));
    fireEvent.change(screen.getByLabelText("Detalhes (opcional)"), { target: { value: "  Me ofendeu no ensaio.  " } });
    expect(send).toBeEnabled();
    fireEvent.click(send);

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("report_chat_message", {
      p_message_id: "msg-1",
      p_reason: "assedio",
      p_details: "Me ofendeu no ensaio.",
    });
    expect(mocks.toast).toHaveBeenCalledWith({ title: REPORT_RECEIVED_TITLE, description: REPORT_RECEIVED_DESCRIPTION });
    expect(`${REPORT_RECEIVED_TITLE} ${REPORT_RECEIVED_DESCRIPTION}`).toBe(
      "Recebemos sua denúncia. A liderança e a equipe do +Louvor vão analisar em até 24 horas.",
    );
    expect(mocks.firePush).toHaveBeenCalledWith("team-1", [
      // Com a equipe no texto e no link: quem lidera duas equipes abre a certa.
      expect.objectContaining({
        profile_id: "leader-1",
        title: "Nova denúncia no chat",
        body: "Louvor Alfa · Analise em até 24 horas.",
        link: "/app/settings?aba=membros&equipe=team-1",
      }),
    ]);
    // O push não leva o conteúdo denunciado.
    expect(JSON.stringify(mocks.firePush.mock.calls)).not.toContain("Mensagem ofensiva");
  });

  it("also blocks the sender when asked", async () => {
    mocks.rpc.mockImplementation(async (fn: string) =>
      fn === "report_chat_message"
        ? { data: { id: "rep-1", already_reported: true, notify_profile_ids: [] }, error: null }
        : { data: { blocked: true }, error: null },
    );
    const onBlocked = vi.fn();
    withQuery(<ReportMessageDialog open onOpenChange={vi.fn()} message={message} teamId="team-1" onBlocked={onBlocked} />);

    fireEvent.click(screen.getByRole("radio", { name: /Spam ou golpe/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Bloquear Ana/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(onBlocked).toHaveBeenCalled());
    expect(mocks.rpc).toHaveBeenCalledWith("block_user", { p_profile_id: "profile-ana" });
    // Denúncia repetida: confirma de novo, mas não manda outro push.
    expect(mocks.firePush).not.toHaveBeenCalled();
  });

  it("keeps the sheet open and shows the server message when the report fails", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "Você enviou muitas denúncias em pouco tempo. Tente novamente em uma hora." },
    });
    const onOpenChange = vi.fn();
    withQuery(<ReportMessageDialog open onOpenChange={onOpenChange} message={message} teamId="team-1" alreadyBlocked />);

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Outro motivo/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Não foi possível enviar a denúncia",
          description: "Você enviou muitas denúncias em pouco tempo. Tente novamente em uma hora.",
          variant: "destructive",
        }),
      ),
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("ModeratedMessage", () => {
  const baseProps = (overrides: Partial<ModeratedMessageProps> = {}): ModeratedMessageProps => ({
    isMe: false,
    senderName: "Ana Souza",
    type: "text",
    content: "Olá, equipe",
    blocked: false,
    canDelete: false,
    onReport: vi.fn(),
    onBlock: vi.fn(),
    onUnblock: vi.fn(),
    onDelete: vi.fn(),
    children: <p>Olá, equipe</p>,
    ...overrides,
  });

  it("collapses messages from a blocked user and lets the viewer show or unblock", () => {
    const props = baseProps({ blocked: true });
    render(<ModeratedMessage {...props} />);

    expect(screen.getByText("Mensagem de usuário bloqueado")).toBeInTheDocument();
    expect(screen.queryByText("Olá, equipe")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Desbloquear" }));
    expect(props.onUnblock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));
    expect(screen.getByText("Olá, equipe")).toBeInTheDocument();
    expect(screen.queryByText("Mensagem de usuário bloqueado")).not.toBeInTheDocument();
  });

  it("offers report and block on someone else's message (no delete for members)", async () => {
    const props = baseProps();
    render(<ModeratedMessage {...props} />);

    fireEvent.contextMenu(screen.getByText("Olá, equipe"));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Copiar texto" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Bloquear Ana" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "Apagar" })).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Denunciar" }));
    expect(props.onReport).toHaveBeenCalledTimes(1);
  });

  it("opens the same menu from the actions button and lets leaders delete", async () => {
    const props = baseProps({ canDelete: true });
    render(<ModeratedMessage {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Ações da mensagem" }));
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Apagar" }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it("only offers delete (not report or block) on my own message", async () => {
    render(<ModeratedMessage {...baseProps({ isMe: true, canDelete: true, type: "image", content: null })} />);

    fireEvent.contextMenu(screen.getByText("Olá, equipe"));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Apagar"]);
  });

  it("opens the menu on a long press that tolerates a small finger tremor", async () => {
    vi.useFakeTimers();
    try {
      render(<ModeratedMessage {...baseProps()} />);
      const bubble = screen.getByText("Olá, equipe");
      fireEvent.pointerDown(bubble, { pointerType: "touch", isPrimary: true, clientX: 50, clientY: 50 });
      fireEvent.pointerMove(bubble, { pointerType: "touch", clientX: 53, clientY: 52 });
      act(() => void vi.advanceTimersByTime(600));
      expect(screen.getByRole("menu")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not open the menu when the finger is scrolling", () => {
    vi.useFakeTimers();
    try {
      render(<ModeratedMessage {...baseProps()} />);
      const bubble = screen.getByText("Olá, equipe");
      fireEvent.pointerDown(bubble, { pointerType: "touch", isPrimary: true, clientX: 50, clientY: 50 });
      fireEvent.pointerMove(bubble, { pointerType: "touch", clientX: 50, clientY: 80 });
      act(() => void vi.advanceTimersByTime(1000));
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useChatModeration", () => {
  function Conversation() {
    const moderation = useChatModeration({ teamId: "team-1", profileId: "me", isTeamAdmin: false, onDeleted: vi.fn() });
    const messages = [
      { id: "m1", sender_profile_id: "profile-ana", message_type: "text", content: "Mensagem da Ana" },
      { id: "m2", sender_profile_id: "profile-bia", message_type: "text", content: "Mensagem da Bia" },
    ];
    return (
      <>
        {messages.map((msg) => (
          <ModeratedMessage key={msg.id} {...moderation.messageProps(msg, false, msg.id === "m1" ? "Ana" : "Bia")}>
            <p>{msg.content}</p>
          </ModeratedMessage>
        ))}
        {moderation.dialogs}
      </>
    );
  }

  it("hides only the messages of people I blocked", async () => {
    mocks.rpc.mockImplementation(async (fn: string) =>
      fn === "list_blocked_users"
        ? { data: [{ profile_id: "profile-ana", full_name: "Ana", avatar_url: null, created_at: "2026-10-03T12:00:00Z" }], error: null }
        : { data: null, error: null },
    );
    withQuery(<Conversation />);

    expect(await screen.findByText("Mensagem de usuário bloqueado")).toBeInTheDocument();
    expect(screen.queryByText("Mensagem da Ana")).not.toBeInTheDocument();
    expect(screen.getByText("Mensagem da Bia")).toBeInTheDocument();
  });
});

describe("chatModerationError", () => {
  it("passes server messages through and hides unknown errors", () => {
    expect(chatModerationError({ code: "42501", message: "Mensagem não encontrada." })).toBe("Mensagem não encontrada.");
    expect(chatModerationError({ code: "PGRST202", message: "Could not find the function" })).toMatch(/ainda não está disponível/);
    expect(chatModerationError(new Error("boom"))).toMatch(/Confira sua conexão/);
  });
});
