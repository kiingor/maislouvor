// Ferramentas de missões: o modelo interpreta o pedido, o banco guarda a agenda.
// Grupo e identidade são do webhook autenticado; nunca são argumentos da IA.
import { nullable, tool, type Rpc } from "./tools.ts";
import { fold } from "./triggers.ts";

const schedule = {
  titulo: nullable("string", "Nome curto da missão (até 80 caracteres)."),
  mensagem: nullable("string", "Texto que o líder quer enviar ao grupo (até 1600 caracteres). Não invente informações."),
  frequencia: nullable("string", "Envio único, todos os dias ou dias da semana.", { enum: ["unica", "diaria", "semanal", null] }),
  dias_semana: { type: ["array", "null"], items: { type: "integer", minimum: 1, maximum: 7 },
    description: "Para semanal: 1=segunda, 2=terça, 3=quarta, 4=quinta, 5=sexta, 6=sábado, 7=domingo." },
  horario_envio: nullable("string", "HH:MM em Brasília. Só o horário em que o líder pediu para ENVIAR. Horário do ensaio/culto não é horário de envio. Se faltar, use null e pergunte."),
  data: nullable("string", "AAAA-MM-DD para envio único; null nas recorrências."),
};
export const MISSION_READ_TOOLS = [
  tool("listar_missoes", "Lista missões e códigos deste grupo, com agenda, estado e última entrega. Somente líderes."),
];
export const MISSION_WRITE_TOOLS = [
  tool("criar_missao", "AÇÃO de líder: agenda um aviso neste grupo. Só com pedido explícito. Confirme criação apenas se ok=true; se faltar horário de ENVIO, pergunte.", schedule),
  tool("alterar_missao", "AÇÃO de líder: muda uma missão deste grupo. Use código de listar_missoes; null preserva cada campo. Não muda uma missão pausada para ativa.", {
    codigo: { type: "string", description: "Código exato da missão, obtido da ferramenta. Se houver mais de uma possível, pergunte." }, ...schedule,
  }),
  tool("gerenciar_missao", "AÇÃO de líder: pausa, retoma ou cancela uma missão deste grupo. Antes consulte listar_missoes e resolva ambiguidades.", {
    codigo: { type: "string", description: "Código exato da missão." },
    acao: { type: "string", enum: ["pausar", "retomar", "cancelar"] },
  }),
];
export const MISSION_TOOL_NAMES = new Set([...MISSION_READ_TOOLS, ...MISSION_WRITE_TOOLS].map(t => t.name));
export const MISSION_ACTION_NAMES = new Set(MISSION_WRITE_TOOLS.map(t => t.name));
type Turn = { role: string; content: string };

// O histórico pode conter uma citação de terceiro acrescentada pelo handler.
const ownText = (text: string) => text.split("\n\n(Contexto:")[0];
const missionTopic = /\b(missao|missoes|avisos?|lembretes?|agendamentos?|todas?|todos?|diari\w*|seman\w*|amanha|hoje|segundas?|tercas?|quartas?|quintas?|sextas?|sabados?|domingos?)\b/;
const negativeOrRead = /^(?:nao\b|nunca\b|como\b|o que\b|quais\b|qual\b|liste\b|listar\b|mostr\w*\b|consulte\b)/;
const deniedIntent = /\bnao\s+(?:(?:me|nos|quero|precisa|preciso|e|para|va|deve|de|que)\s+)*(?:agend|cri|avis|envi|mand|paus|cancel|retom|lemb|program)|\bsem (?:agendar|criar|avisar)|^(?:obrigad\w*|valeu|deixa pra|depois|esquece)\b/;

function directive(text: string): "criar_missao" | "alterar_missao" | "gerenciar_missao" | null {
  const t = fold(ownText(text)).trim();
  if (negativeOrRead.test(t) || deniedIntent.test(t)) return null;
  // Apenas a instrução: o texto a enviar pode conter "cancelar" sem cancelar uma missão.
  const prefix = t.replace(/^(?:eu )?quero que\s+/, "").split(/\bque\b|:\s+(?!\d)/)[0];
  if (!missionTopic.test(t) && !/\b[0-9a-f]{8}\b/.test(t)) return null;
  if (/\b(paus\w*|cancel\w*|retom\w*|reativ\w*|suspend\w*|pare|parar)\b/.test(prefix)) return "gerenciar_missao";
  if (/\b(alter\w*|mud\w*|troc\w*|edit\w*)\b/.test(prefix)) return "alterar_missao";
  if (/\b(agend\w*|program\w*|cri[ae]\w*|defin\w*|registr\w*|avis[ae]\w*|lembre\w*|lembr[ae]\w*|envi[ae]\w*|mand[ae]\w*)\b/.test(prefix)) return "criar_missao";
  return null;
}

function clarification(history: Turn[]) {
  const last = history.at(-1);
  if (last?.role !== "assistant" || !last.content.includes("?") ||
    !/(missao|aviso|agendamento|lembrete|horario de envio)/.test(fold(last.content))) return null;
  const user = [...history].reverse().find(t => t.role === "user" && directive(t.content));
  return user ? { action: directive(user.content)!, original: ownText(user.content), question: last.content } : null;
}

export function missionWriteIntent(text: string, history: Turn[]) {
  const direct = directive(text);
  if (direct) return direct;
  const t = fold(text).trim();
  if (negativeOrRead.test(t) || deniedIntent.test(t) || t.length > 1600) return null;
  const pending = clarification(history);
  if (!pending) return null;
  // Apenas respostas compatíveis com a pergunta, não qualquer conversa posterior.
  const question = fold(pending.question);
  const answersSchedule = clockTimes(t).length > 0 || /\b(sim|isso|pode|ok|confirmo|segunda|terca|quarta|quinta|sexta|sabado|domingo|amanha|hoje)\b|\b[0-9a-f]{8}\b|\d{1,4}[-/]\d{1,2}|^\d{1,2}$/.test(t);
  return answersSchedule || /\b(texto|mensagem|titulo|nome)\b/.test(question) ? pending.action : null;
}

/** Horário ancorado no pedido, nunca copiado do texto de um evento citado. */
function clockTimes(text: string): string[] {
  const t = fold(text);
  const result: string[] = [];
  const re = /(?:\b(?:as|pelas)\s+)?\b(\d{1,2})(?::([0-5]\d)|h([0-5]\d)?|\s+horas?)(?:\s*(?:da |de )?(manha|tarde|noite))?\b|\b(?:as|pelas)\s+(\d{1,2})(?:\s*(?:da |de )?(manha|tarde|noite))?\b/g;
  for (const m of t.matchAll(re)) {
    let h = Number(m[1] ?? m[5]);
    const period = m[4] ?? m[6];
    if ((period === "tarde" || period === "noite") && h < 12) h += 12;
    if (period === "manha" && h === 12) h = 0;
    if (h < 24) result.push(`${String(h).padStart(2,"0")}:${m[2] ?? m[3] ?? "00"}`);
  }
  return result;
}
function instructionTimes(text: string) {
  // "avisa ... que tem ensaio às 19h" contém só a hora do evento.
  const input = fold(ownText(text)).replace(/^(?:eu )?quero que\s+/, "");
  const boundary = directive(text) === "alterar_missao" ? /\b(?:que|mensagem|texto)\b|:\s+(?!\d)/
    : /\b(?:que|ensaio|culto|reuniao)\b|:\s+(?!\d)/;
  const prefix = input.split(boundary)[0];
  return clockTimes(prefix);
}
export function hasExplicitSendTime(value: unknown, text: string, history: Turn[]): boolean {
  if (value === null || value === undefined) return true; // o banco pede o que falta
  if (typeof value !== "string") return false;
  if (instructionTimes(text).includes(value)) return true;
  const pending = clarification(history);
  if (!pending || directive(text)) return false;
  // Resposta à pergunta de horário, ou confirmação explícita de um horário proposto.
  if (/^(sim|isso|pode|ok|confirmo)\b/.test(fold(text).trim())) return clockTimes(pending.question).includes(value);
  if (/^\d{1,2}$/.test(text.trim()) && /(horas|horario)/.test(fold(pending.question))) {
    return value === `${text.trim().padStart(2,"0")}:00`;
  }
  return clockTimes(text).includes(value) || instructionTimes(pending.original).includes(value);
}

export async function runMissionTool(rpc: Rpc, context: {
  teamId: string; groupId: string; memberId: string; requestId: string; text: string; history: Turn[];
}, name: string, rawArgs: string): Promise<string> {
  if (!MISSION_TOOL_NAMES.has(name)) return JSON.stringify({ erro: "ferramenta_desconhecida" });
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs || "{}");
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("args");
  } catch { return JSON.stringify({ erro: "argumentos_invalidos" }); }
  if (name === "criar_missao" || name === "alterar_missao") {
    const source = fold(directive(context.text) ? context.text : clarification(context.history)?.original ?? context.text)
      .replace(/^(?:eu )?quero que\s+/, "").split(/\bque\b|:\s+(?!\d)/)[0];
    if (/\b(mensal|mensais|mes|meses|quinzenal|quinzenais|anual|anuais)\b|\ba cada\s+\d+|\bde \d+ em \d+|\ba partir\b|\bate\b/.test(source)) {
      return JSON.stringify({ erro: "recorrencia_nao_suportada", orientacao: "Ofereça envio único, diário ou semanal, começando na próxima ocorrência. Não substitua a frequência ou os limites pedidos sem o líder escolher." });
    }
  }
  if ((name === "criar_missao" || name === "alterar_missao") && !hasExplicitSendTime(args.horario_envio, context.text, context.history)) {
    return JSON.stringify({ erro: "horario_envio_necessario", pergunta: "Que horas devo mandar o aviso? Confirme o horário de envio; a hora do ensaio/culto não basta." });
  }
  const action = name === "listar_missoes" ? "listar" : name === "criar_missao" ? "criar" : name === "alterar_missao" ? "alterar" : args.acao;
  if (name === "gerenciar_missao" && !["pausar","retomar","cancelar"].includes(String(action))) {
    return JSON.stringify({ erro: "argumentos_invalidos" });
  }
  if (name === "gerenciar_missao") {
    const source = fold(directive(context.text) ? context.text : clarification(context.history)?.original ?? "");
    const requested = /\bcancel\w*/.test(source) ? "cancelar" : /\b(retom|reativ)\w*/.test(source) ? "retomar"
      : /\b(paus\w*|suspend\w*|pare|parar)\b/.test(source) ? "pausar" : null;
    if (action !== requested) return JSON.stringify({ erro: "acao_diferente_do_pedido" });
  }
  try {
    const result = await rpc<Record<string, unknown>>("assistant_mission_command", {
      p_team_id: context.teamId, p_group_id: context.groupId, p_member_id: context.memberId,
      p_request_id: context.requestId, p_action: action, p_args: args,
    });
    // Lista compacta, sem cortar JSON ou códigos; texto completo segue guardado no banco/app.
    if (Array.isArray(result?.missoes)) result.missoes = result.missoes.map(m => ({
      codigo: m.codigo, titulo: m.titulo, mensagem: String(m.mensagem).slice(0, 180),
      frequencia: m.frequencia, dias_semana: m.dias_semana, horario_envio: m.horario_envio,
      data: m.data, status: m.status, proximo_envio_local: m.proximo_envio_local,
      dia_semana: m.dia_semana, ultima_entrega: m.ultima_entrega, motivo_pausa: m.motivo_pausa,
    }));
    return JSON.stringify(result);
  } catch {
    return JSON.stringify({ erro: "falha_na_missao", orientacao: "Não confirme a alteração. Consulte as missões antes de tentar novamente." });
  }
}
