import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { TeamChatReports } from "@/components/TeamChatReports";
import { BlockedUsersSettings } from "@/components/BlockedUsersSettings";
import type { ChatReport } from "@/lib/chatModeration";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn(), toast: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    storage: { from: () => ({ remove: mocks.remove, createSignedUrl: vi.fn() }) },
  },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/contexts/TeamContext", () => ({ useTeam: () => ({ profileId: "me" }) }));

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function withQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const report = (overrides: Partial<ChatReport> = {}): ChatReport => ({
  id: "rep-1", team_id: "team-1", team_name: "Louvor Alfa", message_id: "msg-1", message_exists: true,
  message_type: "text", message_content: "Você é um *****", message_attachment_path: null,
  message_created_at: "2026-10-03T10:00:00Z", message_deleted_at: null, message_deleted_role: null, member_removed_at: null,
  reason: "assedio", details: "Aconteceu no ensaio.", status: "aberta",
  created_at: "2026-10-03T10:05:00Z", updated_at: "2026-10-03T10:05:00Z", resolved_at: null, resolution_note: null,
  resolved_by_name: null, reporter_profile_id: "p-bia", reporter_name: "Bia Lima", reported_profile_id: "p-ana",
  reported_name: "Ana Souza", reported_avatar_url: null, reported_is_member: true, reported_is_owner: false, overdue: true,
  ...overrides,
});

const page = (items: ChatReport[]) => ({ items, total: items.length, page: 1, page_size: 50, pending_total: items.length, overdue_total: 1 });

describe("TeamChatReports", () => {
  it("lists the team's open reports with the evidence and the 24-hour warning", async () => {
    mocks.rpc.mockImplementation(async (fn: string) =>
      fn === "list_chat_reports"
        ? { data: page([report()]), error: null }
        : { data: { status: "em_analise", attachment_to_remove: null, member_removed: false }, error: null },
    );
    withQuery(<TeamChatReports teamId="team-1" />);

    const item = await screen.findByRole("article", { name: "Denúncia: Assédio ou intimidação" });
    expect(within(item).getByText("Você é um *****")).toBeInTheDocument();
    expect(within(item).getByText("Prazo vencido")).toBeInTheDocument();
    expect(within(item).getByText(/Denunciada por Bia Lima/)).toBeInTheDocument();
    expect(screen.getByText(/1 passou do prazo de 24 horas/)).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("list_chat_reports", {
      p_team_id: "team-1", p_status: "pendentes", p_search: "", p_page: 1, p_page_size: 50,
    });

    fireEvent.click(within(item).getByRole("button", { name: "Em análise" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("moderate_chat_report", {
        p_report_id: "rep-1", p_status: "em_analise", p_note: null, p_remove_member: false,
      }),
    );
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Denúncia em análise" })));
  });

  it("resolves with a note, removes the author and cleans up evidence no longer needed", async () => {
    mocks.rpc.mockImplementation(async (fn: string) =>
      fn === "list_chat_reports"
        ? { data: page([report({ message_id: null, message_exists: false, message_type: "image", message_content: null, message_attachment_path: "team-1/1-foto.png", message_deleted_role: "autor" })]), error: null }
        : { data: { status: "resolvida", attachment_to_remove: "team-1/1-foto.png", member_removed: true }, error: null },
    );
    mocks.remove.mockResolvedValue({ data: [], error: null });
    withQuery(<TeamChatReports teamId="team-1" />);

    const item = await screen.findByRole("article", { name: "Denúncia: Assédio ou intimidação" });
    expect(within(item).getByText("Apagada por quem enviou")).toBeInTheDocument();
    expect(within(item).queryByRole("button", { name: "Apagar mensagem" })).not.toBeInTheDocument();
    fireEvent.click(within(item).getByRole("button", { name: "Resolver" }));

    fireEvent.change(await screen.findByLabelText("Anotação (opcional)"), { target: { value: "Conversamos com ela." } });
    fireEvent.click(screen.getByRole("switch", { name: /Remover Ana da equipe/ }));
    fireEvent.click(screen.getByRole("button", { name: "Resolver" }));

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("moderate_chat_report", {
        p_report_id: "rep-1", p_status: "resolvida", p_note: "Conversamos com ela.", p_remove_member: true,
      }),
    );
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(["team-1/1-foto.png"]));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Denúncia resolvida", description: "Quem enviou a mensagem foi removido da equipe." }));
  });

  it("does not offer removing the team owner", async () => {
    mocks.rpc.mockResolvedValue({ data: page([report({ reported_is_owner: true })]), error: null });
    withQuery(<TeamChatReports teamId="team-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Resolver" }));
    expect(await screen.findByText(/é o responsável pela equipe e não pode ser removido/)).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("pluralizes the overdue count", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ...page([report(), report({ id: "rep-2" }), report({ id: "rep-3" })]), overdue_total: 3 },
      error: null,
    });
    withQuery(<TeamChatReports teamId="team-1" />);
    expect(await screen.findByText(/3 passaram do prazo de 24 horas/)).toBeInTheDocument();
  });
});

describe("BlockedUsersSettings", () => {
  it("lists blocked people and unblocks them", async () => {
    let blocked = [{ profile_id: "p-ana", full_name: "Ana Souza", avatar_url: null, created_at: "2026-10-03T12:00:00Z" }];
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "list_blocked_users") return { data: blocked, error: null };
      blocked = [];
      return { data: { unblocked: true }, error: null };
    });
    withQuery(<BlockedUsersSettings />);

    expect(await screen.findByText("Ana Souza")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Desbloquear Ana Souza" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("unblock_user", { p_profile_id: "p-ana" }));
    expect(await screen.findByText("Você não bloqueou ninguém.")).toBeInTheDocument();
  });
});
