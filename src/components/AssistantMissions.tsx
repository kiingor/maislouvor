import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Mission {
  codigo: string;
  titulo: string;
  mensagem: string;
  grupo: string | null;
  frequencia: "unica" | "diaria" | "semanal";
  dias_semana: number[];
  horario_envio: string;
  data: string | null;
  status: "active" | "paused" | "cancelled" | "completed" | "expired";
  proximo_envio_local: string | null;
  ultima_entrega: string | null;
  motivo_pausa: string | null;
}
type Action = "pausar" | "retomar" | "cancelar";
type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase as unknown as Rpc).rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
const days = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const schedule = (m: Mission) => `${m.frequencia === "diaria" ? "Todos os dias" : m.frequencia === "semanal"
  ? m.dias_semana.map(d => days[d]).join(", ") : m.data?.split("-").reverse().join("/")} às ${m.horario_envio}`;
function stateLabel(m: Mission) {
  if (m.status === "paused") return "Pausada";
  if (m.status === "cancelled") return "Cancelada";
  if (m.status === "expired") return "Horário perdido";
  if (m.status === "completed") return m.ultima_entrega === "sent" ? "Enviada" : "Encerrada";
  return m.proximo_envio_local ? "Ativa" : "Aguardando envio";
}

/** Gestão das missões criadas na conversa; criação/edição ficam no grupo de destino. */
export function AssistantMissions({ teamId, name, disabled }: { teamId: string; name: string; disabled: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const queryKey = ["assistant-missions", teamId];
  const [busy, setBusy] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey,
    queryFn: () => call<Mission[]>("assistant_missions_overview", { p_team_id: teamId }),
    retry: false,
    refetchInterval: 30_000,
  });
  // O app pode ser publicado antes da migração, como os outros controles do Asafe.
  if (!Array.isArray(data)) return null;
  const change = async (code: string, action: Action) => {
    setBusy(code);
    try {
      const result = await call<{ ok?: boolean; erro?: string; avisos_habilitados?: boolean }>("assistant_set_mission_state", {
        p_team_id: teamId, p_code: code, p_action: action,
      });
      if (!result.ok) {
        const messages: Record<string, string> = {
          data_no_passado: "Esse horário já passou. Peça um novo agendamento ao Asafe no grupo.",
          assistente_desativado: "Ative o assistente no grupo antes de retomar a missão.",
          grupo_invalido: "O grupo mudou de equipe. Confira o vínculo antes de continuar.",
          missao_cancelada: "Essa missão foi cancelada. Crie outra no grupo.",
        };
        throw new Error(messages[result.erro ?? ""] ?? "Atualize a lista e tente novamente.");
      }
      await qc.invalidateQueries({ queryKey });
      toast({
        title: action === "pausar" ? "Missão pausada" : action === "retomar" ? "Missão retomada" : "Missão cancelada",
        description: action === "retomar" && result.avisos_habilitados === false
          ? "Ligue Avisos do líder para receber os envios agendados." : undefined,
      });
    } catch (error) {
      toast({ title: "Não foi possível atualizar a missão", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally { setBusy(null); }
  };
  return (
    <section aria-labelledby="assistant-missions-title" className="space-y-2">
      <h3 id="assistant-missions-title" className="mx-4 text-footnote text-muted-foreground">Missões agendadas</h3>
      <div className="overflow-hidden rounded-card bg-card">
        {data.length === 0 ? (
          <p className="p-4 text-subhead text-muted-foreground">Nenhuma missão por enquanto. Crie a primeira falando com o {name} no grupo.</p>
        ) : (
          <ul className="divide-y divide-separator">
            {data.map(m => (
              <li key={m.codigo} className="space-y-2 p-4">
                <div className="flex items-start gap-2">
                  <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-body font-medium">{m.titulo}</p>
                    <p className="text-footnote text-muted-foreground">{m.grupo || "Grupo do ministério"} · {stateLabel(m)} · {m.codigo}</p>
                  </div>
                </div>
                <p className="whitespace-pre-wrap break-words text-subhead">{m.mensagem}</p>
                <p className="text-footnote text-muted-foreground">{schedule(m)} · Brasília</p>
                {m.proximo_envio_local && <p className="text-footnote">Próximo envio: {m.proximo_envio_local}</p>}
                {m.motivo_pausa === "permission_or_group_changed" && (
                  <p className="text-footnote text-muted-foreground">Pausada porque o vínculo do grupo ou a liderança mudou. Um líder pode retomar após conferir o vínculo.</p>
                )}
                {m.ultima_entrega === "uncertain" && (
                  <p className="text-footnote text-muted-foreground">Não foi possível confirmar a última entrega. Ela pode ter chegado; o Asafe não repete esse envio.</p>
                )}
                {["failed", "skipped", "missed", "disabled"].includes(m.ultima_entrega ?? "") && (
                  <p className="text-footnote text-muted-foreground">O último aviso não foi enviado. Confira se o grupo e os Avisos do líder estão ativos.</p>
                )}
                {(m.status === "active" || m.status === "paused") && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" disabled={busy !== null || (disabled && m.status === "paused")}
                      aria-label={`${m.status === "active" ? "Pausar" : "Retomar"} missão ${m.titulo}`}
                      onClick={() => change(m.codigo, m.status === "active" ? "pausar" : "retomar")}>
                      {busy === m.codigo && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
                      {m.status === "active" ? "Pausar" : "Retomar"}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" disabled={busy !== null} aria-label={`Cancelar missão ${m.titulo}`}>Cancelar</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancelar “{m.titulo}”?</AlertDialogTitle>
                          <AlertDialogDescription>Os próximos avisos dessa missão deixam de ser enviados. Para interromper temporariamente, use Pausar.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Voltar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => change(m.codigo, "cancelar")}>Cancelar missão</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mx-4 text-footnote text-muted-foreground">
        No grupo: “@{name} toda sexta às 17h avisa que tem ensaio às 19h”.
        Para editar, peça ao {name} usando o código da missão. O horário é de envio, em Brasília.
        As missões também respeitam a opção Avisos do líder.
      </p>
    </section>
  );
}
