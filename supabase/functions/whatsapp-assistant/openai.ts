// OpenAI Responses API com chamada de ferramentas.
//
// store: false — a conversa não fica guardada na OpenAI; o histórico curto mora
// em assistant_messages. Por isso cada rodada reenvia tudo: a entrada original,
// todos os itens de saída anteriores (inclusive raciocínio, que vem criptografado)
// e os resultados das ferramentas.

import type { FunctionTool } from "./tools.ts";

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface AiRequest {
  /** Vem de assistant_config: dá para trocar sem novo deploy. */
  model: string;
  reasoningEffort: string;
  instructions: string;
  history: { role: "user" | "assistant"; content: string }[];
  message: string;
  tools: FunctionTool[];
  runTool: (name: string, args: string) => Promise<string>;
  /** Id estável e anônimo de quem perguntou (recomendação de segurança da OpenAI). */
  safetyIdentifier?: string;
}

export interface AiResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  toolCalls: string[];
}

export class AiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "AiError";
    this.status = status;
  }
}

type Item = Record<string, unknown>;

const MAX_ROUNDS = 5;
const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504]);

function outputText(output: Item[]): string {
  return output
    .filter((item) => item.type === "message")
    .flatMap((item) => (Array.isArray(item.content) ? item.content as Item[] : []))
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n")
    .trim();
}

export function createOpenAi(config: AiConfig, fetchImpl: typeof fetch = fetch) {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/responses`;

  async function post(body: Item): Promise<Item> {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(config.timeoutMs ?? 25_000),
        });
      } catch (error) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 1_200));
          continue;
        }
        throw new AiError(`OpenAI inacessível: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (response.ok) return await response.json() as Item;

      const detail = (await response.text()).slice(0, 500);
      if (attempt === 0 && RETRYABLE.has(response.status)) {
        await new Promise((r) => setTimeout(r, 1_200));
        continue;
      }
      throw new AiError(`OpenAI HTTP ${response.status}: ${detail}`, response.status);
    }
  }

  return async function ask(request: AiRequest): Promise<AiResult> {
    const input: Item[] = [
      ...request.history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: request.message },
    ];
    const result: AiResult = { text: "", inputTokens: 0, outputTokens: 0, cachedTokens: 0, toolCalls: [] };

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const last = round === MAX_ROUNDS - 1;
      const response = await post({
        model: request.model,
        instructions: request.instructions,
        input,
        tools: request.tools,
        // Na última rodada o modelo tem de responder com o que já tem.
        tool_choice: last ? "none" : "auto",
        parallel_tool_calls: true,
        // "default" = sem o parâmetro (modelos sem raciocínio não o aceitam).
        ...(request.reasoningEffort !== "default" ? { reasoning: { effort: request.reasoningEffort } } : {}),
        // Sem guardar na OpenAI, o raciocínio só volta nas rodadas seguintes se vier criptografado.
        ...(!["default", "none"].includes(request.reasoningEffort) ? { include: ["reasoning.encrypted_content"] } : {}),
        max_output_tokens: config.maxOutputTokens ?? 1_500,
        store: false,
        prompt_cache_key: "maislouvor-whatsapp-assistant",
        ...(request.safetyIdentifier ? { safety_identifier: request.safetyIdentifier } : {}),
      });

      const usage = (response.usage ?? {}) as Item;
      result.inputTokens += Number(usage.input_tokens ?? 0);
      result.outputTokens += Number(usage.output_tokens ?? 0);
      result.cachedTokens += Number((usage.input_tokens_details as Item | undefined)?.cached_tokens ?? 0);

      const output = Array.isArray(response.output) ? response.output as Item[] : [];
      const calls = output.filter((item) => item.type === "function_call");
      if (calls.length === 0 || last) {
        result.text = outputText(output);
        if (!result.text) {
          throw new AiError(`Resposta sem texto (status ${String(response.status)})`);
        }
        return result;
      }

      input.push(...output);
      for (const call of calls) {
        const name = String(call.name ?? "");
        result.toolCalls.push(name);
        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: await request.runTool(name, String(call.arguments ?? "{}")),
        });
      }
    }
    throw new AiError("Rodadas de ferramenta esgotadas");
  };
}
