# Assistente do +Louvor no WhatsApp (Asafe)

Um número da plataforma entra nos grupos de WhatsApp dos ministérios e responde **só quando é chamado**: menção (`@Asafe`), resposta a uma mensagem dele ou `@Asafe` digitado sem escolher o contato. Ele consulta o app (escala, repertório, tons, disponibilidade) e faz duas ações da própria pessoa: confirmar ou recusar a escala e marcar disponibilidade.

- **Nome padrão:** Asafe, o músico-chefe do rei Davi (1 Cr 16:5). Muda em `assistant_config.assistant_name`, sem deploy. O nome do perfil do WhatsApp é configurado no próprio celular.
- **Personalidade:** levemente engraçado, cômico e caricato. É um "maestro" teatral que leva a escala a sério demais. Faz no máximo uma piada por resposta, a informação vem sempre primeiro e ele não faz humor com a pessoa, a fé, doença ou luto. Texto em `supabase/functions/whatsapp-assistant/persona.ts`.
- **Instruções do ministério:** o líder escreve em Ajustes › Equipe (até 2.000 caracteres). O texto entra no fim do prompt como **fatos da equipe** (ensaio, local, combinados) e não muda as regras do assistente.

## Fluxo

```
grupo do WhatsApp
  -> Evolution API (instância "maislouvor", na stack talitha-cume da VPS)
  -> webhook: edge function whatsapp-assistant (responde 202 e processa em segundo plano)
       1. foi chamado? (menção, resposta ou @Nome) — se não, descarta sem gravar nada
       2. grupo -> equipe (assistant_groups)
       3. quem escreveu -> perfil, pelo telefone do cadastro (entre os membros da equipe)
       4. limite do dia (equipe e pessoa)
       5. OpenAI Responses API com 9 ferramentas (RPCs assistant_tool_*)
       6. resposta citando a mensagem, no formato do WhatsApp
```

As ferramentas são funções SQL presas à equipe do grupo e a quem perguntou; o modelo não escolhe equipe nem pessoa. Elas checam as mesmas permissões do app (`member_can`): quem tem "cultos: ver" desligado não vê escalas nem nomes de culto e não responde escala pelo assistente. Nenhuma ferramenta devolve telefone, e-mail ou motivo de indisponibilidade. As ações só valem para a própria pessoa e só para datas de hoje em diante. A marcação de disponibilidade respeita o modo da equipe (`teams.availability_mode`), como o app.

As duas ferramentas de ação só são oferecidas ao modelo quando a mensagem da própria pessoa pede uma ação ("confirmo", "não posso dia 20"…), ou quando ela responde "sim" a uma pergunta do assistente. Um pedido escondido numa mensagem citada de outra pessoa ou numa observação de culto não dispara ação.

### Funções listadas na ativação

Fonte única: `capabilities.ts`, usada pela mensagem de boas-vindas, pelo `@Asafe ajuda` e pela tela de Ajustes.

| Função | Exemplo | Ferramenta |
|---|---|---|
| Minha escala / Próximo culto | "qual minha escala?" | `minha_escala` |
| Meus instrumentos | "quais são meus instrumentos?" | `meus_instrumentos` |
| Escala do culto / Repertório | "quem toca domingo?", "qual o repertório?" | `detalhes_culto` |
| Tom de uma música | "qual o tom de Bondade de Deus?" | `buscar_musica` |
| Próximos cultos | "quais são os próximos cultos?" | `proximos_cultos` |
| Quem pode no dia | "quem está disponível dia 12?" | `disponibilidade_equipe` |
| Confirmar ou recusar (ação) | "confirmo a escala de domingo" | `responder_escala` |
| Avisar indisponibilidade (ação) | "não posso dia 20" | `marcar_disponibilidade`, `minha_disponibilidade` |
| Avisos do ministério | "que horas é o ensaio?" | instruções do líder |

Comandos que não passam pela IA nem gastam o limite: `ativar CÓDIGO`, `desativar` (só líder), `ajuda` e, **no privado**, `vincular CÓDIGO`. Toda resposta automática tem limite de frequência (ajuda a cada 3 min por grupo, avisos a pessoas desconhecidas a cada 6 h), para o número não virar spam.

## Ativação num grupo

1. Líder: Ajustes › Equipe › **Assistente no WhatsApp** mostra o número. Ele salva o contato e o adiciona ao grupo.
2. **Gerar código de ativação**. O código tem 6 caracteres, vale por 24 h, é de uso único e só existe um válido por equipe.
3. No grupo: `@Asafe ativar K7Q2PD`. O assistente se apresenta e lista as funções.

O código é a prova de que um líder autorizou aquele grupo. Um grupo ativo de outra equipe não é tomado (`group_taken`). Para desligar: `@Asafe desativar` (só líder) ou **Desconectar** no app. Tirar o número do grupo também desliga.

## Identificação pelo telefone do cadastro

`profiles.phone` é texto livre. A comparação (`assistant_phone_matches`) funciona assim:

- **Brasil:** DDD + últimos 8 dígitos. Assim, "(11) 98765-4321", "+55 11 98765-4321" e "011 98765-4321" casam com o WhatsApp `5511987654321` e também com o formato antigo, sem o nono dígito (`551187654321`).
- Cadastro sem DDD casa pelos 8 finais.
- **Outros países:** número completo, com ou sem o código do país.
- A busca é **só entre os membros da equipe do grupo**. Se duas pessoas baterem, o assistente não chuta (`ambiguous`).

Nos grupos novos, o WhatsApp identifica as pessoas por `@lid`. Na Evolution 2.3.7, o telefone vem em `key.participant` ou em `key.participantAlt`, em ordem variável. O assistente guarda o par @lid ↔ perfil em `assistant_wa_identities`: depois da primeira mensagem com telefone, basta o @lid. Se o telefone não vier, ele consulta os participantes do grupo na Evolution. O vínculo só vale para membros da equipe do grupo, então o mesmo WhatsApp pode ter perfis em equipes diferentes.

Se ainda assim o número estiver escondido (privacidade ou usernames), a pessoa toca em Ajustes › Meu usuário › **O WhatsApp esconde meu número**. O app gera um código (vale 1 h) e abre a **conversa privada** com o assistente com `vincular CÓDIGO` pronto. O código nunca deve ir para um grupo: qualquer mensagem de grupo que contenha um código válido o invalida na hora, e o assistente avisa. Quando o vínculo é feito, a pessoa recebe uma notificação no app. Em **Desvincular meu WhatsApp** ela desfaz tudo.

O @lid do próprio assistente só é aprendido quando confirmado: pela lista de participantes (o participante que tem o telefone dele), pelo eco das mensagens que ele mesmo envia ou pelo `sender` dos webhooks. Nunca pela menção de alguém, que poderia ser uma pessoa com o mesmo nome. Se precisar, dá para cadastrar à mão em `assistant_config.bot_ids`.

Se o telefone do perfil mudar, o vínculo feito pelo telefone antigo é refeito.

O telefone do cadastro não é verificado. Quem cadastra o número de outra pessoa dá a ela acesso às próprias escalas pelo assistente, mas não consegue se passar por ninguém: quem manda a mensagem é autenticado pelo WhatsApp, e as ações valem só para o perfil identificado.

## Limites e custo

- **Padrão** (`assistant_config`): 100 perguntas por dia por equipe e 20 por pessoa. O dia segue o fuso de Brasília.
- **Por equipe** (`assistant_team_settings`): `team_daily_limit`, `member_daily_limit`, `unlimited` e `enabled` (suspender).
- Só as perguntas que passam pela IA contam. Se a IA ou o envio falhar, a pergunta é devolvida ao limite do mesmo dia. Se a falha vier depois de uma ação já feita, a resposta avisa que a alteração valeu. O aviso de limite sai uma vez por dia; depois o assistente fica quieto.
- **Custo:** o modelo `gpt-6-luna` custa US$ 0,10 por milhão de tokens de entrada, US$ 0,01 em cache e US$ 0,50 na saída (preços de 27/09/2026). Usamos raciocínio `none`, e a parte fixa do prompt vem primeiro para aproveitar o cache. Uma pergunta com duas rodadas de ferramentas usa uns 5 mil tokens de entrada e 200 de saída, o que dá menos de US$ 0,001. Mesmo com 100 perguntas por dia, a equipe custa menos de US$ 3 por mês.

Hoje a configuração é interna, por SQL (o painel da plataforma virá depois):

```sql
update assistant_config set team_daily_limit = 150, member_daily_limit = 25;           -- padrão de todos
insert into assistant_team_settings (team_id, team_daily_limit) values ('<equipe>', 300)
  on conflict (team_id) do update set team_daily_limit = excluded.team_daily_limit;    -- uma equipe
update assistant_team_settings set unlimited = true where team_id = '<equipe>';        -- sem limite
update assistant_config set model = 'gpt-6-luna', reasoning_effort = 'low';             -- modelo (sem deploy)
select * from assistant_usage_daily order by day desc, requests desc limit 20;         -- uso e tokens
```

### Conta da OpenAI conectada (sem API key)

Verificado em 27/09/2026: **não existe caminho oficial**. O "Sign in with ChatGPT" (beta desde 29/07/2026, só para parceiros) serve apenas de login (nome, e-mail e foto): não cede uso de modelo nem cobrança do plano. Os proxies que reaproveitam o login do Codex CLI chamam um endpoint interno e, num bot que atende várias pessoas, violam os Termos da OpenAI. Os trechos que proíbem isso são "You may not share your account credentials or make your account available to anyone else" e "End User Accounts may only be… used by, a single End User". O risco seria a conta ser banida. Por isso o assistente usa **API key com limite diário**. Se um programa oficial surgir (o DevDay é em 29/09/2026), a equipe conectada pode receber `unlimited = true`.

## Privacidade

- A Evolution entrega todas as mensagens dos grupos. As que não chamam o assistente são descartadas na hora, sem gravar nada. A Evolution da VPS já roda com `DATABASE_SAVE_DATA_NEW_MESSAGE=false`.
- Perguntas e respostas ficam em `assistant_messages` por 30 dias (histórico curto e auditoria). A limpeza é automática, feita dentro de `assistant_claim_message`.
- A OpenAI recebe só o necessário (`store: false`). No lugar do id do perfil vai um hash (`safety_identifier`).
- Nenhuma tabela nova é lida pelo app diretamente: tudo passa por RPC com checagem de papel. As RPCs internas só executam com a `service_role`.

## Implantação

Nada disto foi aplicado ainda. Cada passo mexe em produção e precisa de autorização. A ordem importa: banco, rede, instância, função, número e, por último, o site.

**0. Pré-requisitos.** Um chip dedicado (não use número pessoal), com WhatsApp instalado e em uso normal alguns dias antes. No perfil, nome "Asafe · +Louvor" e foto. Uma API key da OpenAI num **projeto próprio**, com limite de gasto mensal no painel.

**1. Banco.** Aplicar `supabase/migrations/20260928120000_whatsapp_assistant.sql` como nas releases anteriores: backup do schema, ensaio em transação revertida, `--single-transaction` e `NOTIFY pgrst`. A migração é aditiva: não altera tabelas existentes e deixa o assistente **desligado** (`enabled = false`).

**2. Rede entre a Evolution e as edge functions.** A Evolution não tem porta publicada, e o Talitha Cume é publicado por releases (`app -> releases/<id>`): uma edição no compose dele se perderia no próximo deploy. Por isso nenhum compose é editado. Um serviço systemd liga os dois containers à rede privada `maislouvor-whatsapp` e religa sempre que um deles inicia ou é recriado:

```sh
install -d -m 700 /opt/stacks/maislouvor-whatsapp
install -m 755 scripts/whatsapp-assistant/network-keeper.sh /opt/stacks/maislouvor-whatsapp/
install -m 644 scripts/whatsapp-assistant/maislouvor-whatsapp-network.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now maislouvor-whatsapp-network
```

**3. Instância na Evolution** (na VPS, como root; a chave global nunca sai do container):

```sh
scripts/whatsapp-assistant/evolution-instance.sh create      # token e segredo em /opt/stacks/maislouvor-whatsapp (600)
scripts/whatsapp-assistant/evolution-instance.sh configure   # grupos ligados, recusa ligações, webhook interno
# eventos: MESSAGES_UPSERT, SEND_MESSAGE (eco do próprio número), GROUP_PARTICIPANTS_UPDATE, CONNECTION_UPDATE
```

**4. Edge function.** Copiar `supabase/functions/whatsapp-assistant/` para `/opt/supabase/volumes/functions/whatsapp-assistant/`. No serviço `functions` do compose, acrescentar:

```yaml
      ASSISTANT_OPENAI_API_KEY: ${ASSISTANT_OPENAI_API_KEY:-}
      WHATSAPP_WEBHOOK_SECRET: ${WHATSAPP_WEBHOOK_SECRET:-}
      WHATSAPP_EVOLUTION_URL: ${WHATSAPP_EVOLUTION_URL:-http://talitha-cume-evolution-1:8080}
      WHATSAPP_EVOLUTION_INSTANCE: ${WHATSAPP_EVOLUTION_INSTANCE:-maislouvor}
      WHATSAPP_EVOLUTION_APIKEY: ${WHATSAPP_EVOLUTION_APIKEY:-}
```

Os valores vão em `/opt/supabase/.env`: o token e o segredo saem dos arquivos do passo 3. A `OPENAI_API_KEY` que já existe nesse `.env` (a do Studio) **não** é usada. Depois, `docker compose up -d functions`: as funções ficam indisponíveis por alguns segundos. Para conferir, mande o segredo no cabeçalho, e não no caminho, para ele não ir parar no log do Caddy:

```sh
curl -s -H "x-webhook-secret: $(cat /opt/stacks/maislouvor-whatsapp/webhook-secret)" \
  https://api.maislouvor.com/functions/v1/whatsapp-assistant     # {"ok":true,"evolution":true,"openai":true}
```

**5. Conectar o número:** `evolution-instance.sh pair 55DDNNNNNNNNN`. No celular, abra WhatsApp › Aparelhos conectados › Conectar com número de telefone e digite o código. A alternativa é `qr`. Confira com `status` (`open`).

**6. Ligar:** `update assistant_config set enabled = true, bot_phone = '55DDNNNNNNNNN';`

**7. Site:** publicar o frontend (seções novas em Ajustes) pelo `publish.sh` de sempre. Se o site sair antes do banco, as seções simplesmente não aparecem.

**8. Teste:** num grupo de teste, ative com um código, pergunte "qual minha escala?", teste `ajuda`, um número de fora da equipe e `desativar`.

## Operação

- **O webhook parou?** A Evolution 2.3.7 às vezes para de enviar `MESSAGES_UPSERT` em silêncio (issues #2647 e #2714). Veja `select last_event_at from assistant_config;`, que é atualizado a cada minuto com tráfego. Se estiver velho, rode `evolution-instance.sh restart` e depois `configure`.
- **Logs:** `docker logs supabase-edge-functions 2>&1 | grep whatsapp-assistant`.
- **Segredo do webhook:** é a única prova de que o evento veio da Evolution. Quem o tiver consegue forjar qualquer remetente. Por isso a Evolution chama pela rede interna, e o segredo fica só em `/opt/stacks/maislouvor-whatsapp` (600) e no `.env` do Supabase. Se vazar, gere outro e rode `configure` de novo.
- O celular do número precisa abrir o WhatsApp pelo menos a cada 14 dias; senão os aparelhos conectados caem.
- **Risco de banimento:** a conexão não é oficial. Para reduzir o risco, o assistente só responde quando chamado, nunca inicia conversa, avisa uma vez por período e o número é dedicado e "aquecido".
- **Convivência com o Talitha Cume:** mesma Evolution, instância separada. O backend do Talitha filtra por nome de instância e os webhooks são por instância. O rótulo do aparelho conectado aparece como "Talitha Cume" (`CONFIG_SESSION_PHONE_CLIENT` do container). O backup e o restore do Talitha incluem a sessão do +Louvor. Não atualize a Evolution sem testar os dois.

## Testes

```sh
npm test                                                   # inclui src/test/AssistantSettings.test.tsx
node supabase/tests/whatsapp_assistant_units.mjs           # webhook, menções, formatação, loop da OpenAI
PGLITE_MODULE=/caminho/@electric-sql/pglite/dist/index.js node supabase/tests/whatsapp_assistant.mjs       # banco
PGLITE_MODULE=/caminho/@electric-sql/pglite/dist/index.js node supabase/tests/whatsapp_assistant_flow.mjs  # ponta a ponta
deno check supabase/functions/whatsapp-assistant/index.ts
```

O teste de ponta a ponta roda o handler real contra o banco em memória, com WhatsApp e OpenAI simulados.
