import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AssistantMissions } from "@/components/AssistantMissions";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
const mission = {
  codigo: "ABCD1234", titulo: "Ensaio", mensagem: "Equipe, ensaio às 19h!", grupo: "Louvor",
  frequencia: "semanal", dias_semana: [5], horario_envio: "17:00", data: null,
  status: "active", proximo_envio_local: "02/10/2026 17:00", ultima_entrega: null, motivo_pausa: null,
};
const renderMissions = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AssistantMissions teamId="team-a" name="Asafe" disabled={false} />
  </QueryClientProvider>,
);
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Missões no app", () => {
  it("shows the group and Brasília send time separately from the event, then pauses and resumes", async () => {
    let saved = { ...mission };
    mocks.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "assistant_missions_overview") return { data: [saved], error: null };
      saved = { ...saved, status: args.p_action === "pausar" ? "paused" : "active" };
      return { data: { ok: true }, error: null };
    });
    renderMissions();
    expect(await screen.findByText("Equipe, ensaio às 19h!")).toBeInTheDocument();
    expect(screen.getByText("sexta às 17:00 · Brasília")).toBeInTheDocument();
    expect(screen.getByText("Próximo envio: 02/10/2026 17:00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pausar missão Ensaio" }));
    const resume = await screen.findByRole("button", { name: "Retomar missão Ensaio" });
    expect(mocks.rpc).toHaveBeenCalledWith("assistant_set_mission_state", {
      p_team_id: "team-a", p_code: "ABCD1234", p_action: "pausar",
    });
    fireEvent.click(resume);
    await screen.findByRole("button", { name: "Pausar missão Ensaio" });
    expect(mocks.rpc).toHaveBeenCalledWith("assistant_set_mission_state", {
      p_team_id: "team-a", p_code: "ABCD1234", p_action: "retomar",
    });
  });

  it("keeps a mission active when the server refuses a change", async () => {
    mocks.rpc.mockImplementation(async (fn: string) => ({
      data: fn === "assistant_missions_overview" ? [mission] : { erro: "somente_lider" }, error: null,
    }));
    renderMissions();
    fireEvent.click(await screen.findByRole("button", { name: "Pausar missão Ensaio" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Não foi possível atualizar a missão" })));
    expect(screen.getByRole("button", { name: "Pausar missão Ensaio" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Retomar missão Ensaio" })).not.toBeInTheDocument();
  });

  it("cancels only after the dialog and shows uncertain delivery without a resend action", async () => {
    let saved = { ...mission, ultima_entrega: "uncertain" };
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "assistant_missions_overview") return { data: [saved], error: null };
      saved = { ...saved, status: "cancelled" };
      return { data: { ok: true }, error: null };
    });
    renderMissions();
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar missão Ensaio" }));
    expect(mocks.rpc).not.toHaveBeenCalledWith("assistant_set_mission_state", expect.anything());
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar missão" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("assistant_set_mission_state", {
      p_team_id: "team-a", p_code: "ABCD1234", p_action: "cancelar",
    }));
    expect(await screen.findByText(/Louvor · Cancelada/)).toBeInTheDocument();
    expect(screen.getByText(/Ela pode ter chegado/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reenviar/i })).not.toBeInTheDocument();
  });

  it("gives an actionable example before the first mission", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    renderMissions();
    expect(await screen.findByText(/Nenhuma missão por enquanto/)).toBeInTheDocument();
    expect(screen.getByText(/toda sexta às 17h avisa que tem ensaio às 19h/)).toBeInTheDocument();
  });
});
