// Ferramentas que o modelo pode chamar. Cada uma vira a RPC
// assistant_tool_<nome>(p_team_id, p_member_id, p_args): o banco prende a
// consulta à equipe do grupo e a quem perguntou, e checa as permissões do app.

export interface FunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict: true;
}

type Schema = Record<string, unknown>;

// Modo strict: todos os campos obrigatórios; opcional = aceita null.
const nullable = (type: string, description: string, extra: Schema = {}): Schema => ({
  type: [type, "null"],
  description,
  ...extra,
});

function tool(name: string, description: string, properties: Record<string, Schema> = {}): FunctionTool {
  return {
    type: "function",
    name,
    description,
    parameters: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
    strict: true,
  };
}

const DATE = "Data no formato AAAA-MM-DD.";

export const ASSISTANT_TOOLS: FunctionTool[] = [
  tool("minha_escala", "Próximas escalas de quem perguntou: culto, data, funções e se já confirmou.", {
    limite: nullable("integer", "Quantas escalas trazer (1 a 10). Padrão 5."),
  }),
  tool("meus_instrumentos", "Funções (vozes e instrumentos) cadastradas de quem perguntou, com o nível em cada uma e o papel na equipe."),
  tool("proximos_cultos", "Agenda de cultos da equipe a partir de hoje (ou de uma data), dizendo se quem perguntou está escalado.", {
    de: nullable("string", `Início do período. ${DATE} Padrão: hoje.`),
    ate: nullable("string", `Fim do período. ${DATE}`),
    limite: nullable("integer", "Quantos cultos trazer (1 a 10). Padrão 5."),
  }),
  tool(
    "detalhes_culto",
    "Escala completa (quem em cada função e se confirmou) e roteiro do culto em ordem: músicas com tom, tom original, BPM, link, observações e vozes, e os momentos. Sem culto_id nem data, traz o próximo culto.",
    {
      culto_id: nullable("string", "Id do culto, quando veio de outra ferramenta."),
      data: nullable("string", `Data do culto. ${DATE} Traz todos os cultos do dia.`),
    },
  ),
  tool("buscar_musica", "Procura músicas da equipe por título ou artista: tom, tom original, BPM, tema, link, última vez tocada e próximo culto em que está no repertório.", {
    termo: { type: "string", description: "Parte do título ou do artista." },
  }),
  tool("disponibilidade_equipe", "Quem está disponível, indisponível ou sem resposta num dia (sem motivos), e os cultos daquele dia.", {
    data: { type: "string", description: DATE },
  }),
  tool("minha_disponibilidade", "Dias que quem perguntou marcou como disponível ou indisponível.", {
    de: nullable("string", `Início. ${DATE} Padrão: hoje.`),
    ate: nullable("string", `Fim. ${DATE} Padrão: 60 dias depois do início.`),
  }),
  tool(
    "responder_escala",
    "AÇÃO: confirma ou recusa a escala de quem perguntou num culto (todas as funções dela naquele culto). Use só quando a pessoa pedir claramente, com o culto_id vindo de outra ferramenta.",
    {
      culto_id: { type: "string", description: "Id do culto." },
      resposta: { type: "string", enum: ["confirmar", "recusar"], description: "confirmar ou recusar." },
    },
  ),
  tool(
    "marcar_disponibilidade",
    "AÇÃO: marca um dia de quem perguntou como disponível ou indisponível, ou remove a marcação, respeitando a regra da equipe. Use só quando a pessoa pedir claramente.",
    {
      data: { type: "string", description: DATE },
      status: { type: "string", enum: ["disponivel", "indisponivel", "remover"], description: "O que marcar no dia." },
      motivo: nullable("string", "Motivo da indisponibilidade, se a pessoa disser (fica só no app, nunca repita no grupo)."),
    },
  ),
];

const TOOL_NAMES = new Set(ASSISTANT_TOOLS.map((t) => t.name));

/** Ferramentas que mudam dados (só entram quando a própria pessoa pede uma ação). */
export const ACTION_TOOL_NAMES: ReadonlySet<string> = new Set(["responder_escala", "marcar_disponibilidade"]);
export const READ_ONLY_TOOLS = ASSISTANT_TOOLS.filter((t) => !ACTION_TOOL_NAMES.has(t.name));

export type Rpc = <T = unknown>(fn: string, args: Record<string, unknown>) => Promise<T>;

const MAX_TOOL_OUTPUT = 12_000;

/** Executa a ferramenta pedida pelo modelo e devolve o JSON (texto) para ele. */
export async function runTool(rpc: Rpc, teamId: string, memberId: string, name: string, rawArgs: string): Promise<string> {
  if (!TOOL_NAMES.has(name)) return JSON.stringify({ erro: "ferramenta_desconhecida" });

  let args: unknown;
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return JSON.stringify({ erro: "argumentos_invalidos" });
  }
  if (typeof args !== "object" || args === null || Array.isArray(args)) args = {};

  try {
    const result = await rpc(`assistant_tool_${name}`, { p_team_id: teamId, p_member_id: memberId, p_args: args });
    const json = JSON.stringify(result ?? null);
    return json.length > MAX_TOOL_OUTPUT ? json.slice(0, MAX_TOOL_OUTPUT) + "…(cortado)" : json;
  } catch (error) {
    console.error(`[whatsapp-assistant] tool ${name} failed:`, error);
    return JSON.stringify({ erro: "falha_ao_consultar" });
  }
}
