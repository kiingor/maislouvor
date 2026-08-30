import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  enforceRateLimit,
  errorResponse,
  HttpError,
  json,
  readJsonBody,
  requireAuthenticated,
  requireCultoEditor,
  requiredEnv,
  requirePost,
  requireString,
} from "../_shared/security.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requirePost(req);
    const context = await requireAuthenticated(req);
    const body = await readJsonBody(req, 16_384);
    const culto = await requireCultoEditor(context, body.culto_id);
    await enforceRateLimit(
      context,
      "suggest-culto-songs",
      culto.team_id,
      10,
      600,
    );

    const liturgy = requireString(body.liturgy, "liturgy", { max: 500 });
    const songCount = body.songCount;
    if (
      typeof songCount !== "number" || !Number.isInteger(songCount) ||
      songCount < 1 || songCount > 20
    ) {
      throw new HttpError(400, "songCount deve ser um inteiro entre 1 e 20");
    }

    const { data: repertorios, error: repertorioError } = await context.admin
      .from("repertorios")
      .select("id")
      .eq("team_id", culto.team_id);
    if (repertorioError) {
      throw new HttpError(503, "Não foi possível carregar os repertórios");
    }

    const repertorioIds = (repertorios ?? []).map((item: { id: string }) =>
      item.id
    );
    if (repertorioIds.length === 0) return json({ suggestions: [] });

    const { data: repertorioSongs, error: relationError } = await context.admin
      .from("repertorio_songs")
      .select("song_id")
      .in("repertorio_id", repertorioIds);
    if (relationError) {
      throw new HttpError(503, "Não foi possível carregar as músicas");
    }

    const songIds = [
      ...new Set(
        (repertorioSongs ?? []).map((item: { song_id: string }) =>
          item.song_id
        ),
      ),
    ].slice(0, 100);
    if (songIds.length === 0) return json({ suggestions: [] });

    const { data: songs, error: songsError } = await context.admin
      .from("songs")
      .select("id, title, artist, key_current, theme, tags, lyrics_text")
      .eq("team_id", culto.team_id)
      .in("id", songIds)
      .limit(100);
    if (songsError) {
      throw new HttpError(503, "Não foi possível carregar as músicas");
    }
    if (!songs?.length) return json({ suggestions: [] });

    const LOVABLE_API_KEY = requiredEnv("LOVABLE_API_KEY");

    const songList = songs.map((s: any, i: number) => {
      const lyrics = typeof s.lyrics_text === "string"
        ? s.lyrics_text.slice(0, 6_000)
        : "(sem letra)";
      return `${i + 1}. ID: ${s.id} | "${s.title}" - ${
        s.artist || "Desconhecido"
      } | Tom: ${s.key_current || "?"} | Tema: ${s.theme || "?"} | Tags: ${
        (s.tags || []).join(", ") || "nenhuma"
      }\nLetra completa:\n${lyrics}\n---`;
    }).join("\n").slice(0, 150_000);

    const systemPrompt =
      `Você é um diretor de louvor experiente. Sua tarefa é analisar uma lista de músicas disponíveis e sugerir a melhor sequência para um culto/evento com o tema litúrgico informado.

REGRAS CRÍTICAS:
1. ANALISE A LETRA COMPLETA de cada música para entender o conteúdo e mensagem
2. SELECIONE APENAS músicas cujas LETRAS se conectem com o tema litúrgico solicitado
3. Se o tema é "Natal", escolha SOMENTE músicas que falem sobre nascimento de Jesus, manjedoura, estrela, anjos anunciando, etc. NÃO inclua músicas genéricas de louvor.
4. Se o tema é "Ceia/Santa Ceia", escolha SOMENTE músicas sobre sacrifício, sangue, corpo, aliança, mesa do Senhor, etc.
5. Se o tema pede "calma" ou "adoração", NÃO inclua músicas agitadas ou de celebração intensa.
6. Se o tema pede "celebração" ou "agitada", NÃO inclua músicas lentas e contemplativas.
7. Se NENHUMA música da lista se encaixa no tema, retorne um array VAZIO. É melhor não sugerir nada do que sugerir músicas erradas.
8. Retorne NO MÁXIMO ${songCount} músicas, mas pode retornar MENOS se poucas se encaixam no tema.
9. Use SOMENTE músicas da lista fornecida
10. NÃO REPITA a mesma música
11. Considere o fluxo litúrgico quando houver múltiplas músicas

Responda usando a tool suggest_songs.`;

    const userPrompt = `Tema/liturgia do culto: "${liturgy}"
Quantidade máxima de músicas desejada: ${songCount}

IMPORTANTE: Analise a LETRA de cada música abaixo e selecione APENAS as que se encaixam no tema "${liturgy}". Se nenhuma se encaixar, retorne lista vazia.

Músicas disponíveis:
${songList}`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          temperature: 0.9,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "suggest_songs",
                description:
                  "Return an ordered list of suggested songs for the culto.",
                parameters: {
                  type: "object",
                  properties: {
                    suggestions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          songId: {
                            type: "string",
                            description: "The ID of the song from the list",
                          },
                          reason: {
                            type: "string",
                            description:
                              "Brief reason why this song fits at this position (in Portuguese)",
                          },
                        },
                        required: ["songId", "reason"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["suggestions"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "suggest_songs" },
          },
        }),
      },
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error:
              "Limite de requisições excedido. Tente novamente em alguns instantes.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro ao consultar IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(result));
      return new Response(
        JSON.stringify({ error: "IA não retornou sugestões válidas" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    // Enrich suggestions with song metadata
    const songMap = new Map<string, any>(
      songs.map((song: any) => [song.id, song]),
    );
    const seenIds = new Set<string>();
    const enriched = parsed.suggestions
      .filter((s: any) => {
        if (!songMap.has(s.songId) || seenIds.has(s.songId)) return false;
        seenIds.add(s.songId);
        return true;
      })
      .map((s: any) => {
        const song = songMap.get(s.songId);
        return {
          songId: s.songId,
          title: song.title,
          artist: song.artist,
          key: song.key_current,
          theme: song.theme,
          tags: song.tags,
          reason: s.reason,
        };
      });

    return json({ suggestions: enriched });
  } catch (e) {
    console.error("suggest-culto-songs error:", e);
    return errorResponse(e);
  }
});
