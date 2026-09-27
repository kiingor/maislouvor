# Assistente no WhatsApp (Asafe) publicado — 27/09/2026

Autorização do usuário: «ok, como conecto o whatsapp agora? já tô com o número e a chave tá conectada» (backend e número), depois «show, deu certo, pode subir pra produção» (site). Roteiro e funcionamento em `docs/assistente-whatsapp.md`.

## Fonte
- Branch `feat/assistente-whatsapp`, a partir de `redesign/ios27` (`d38ee53`, que contém a produção `d67d6bd`).
- Commits: `58d274a` (feature), `1cd4ad5` (origem do CORS da Evolution), `f3e922e` (caracteres invisíveis nas menções). O site foi gerado de **`f3e922e`**.
- No site, a diferença para `d67d6bd` são só os 4 arquivos do assistente (`AssistantSettings.tsx`, `whatsappAssistant.ts`, `TeamSettings.tsx` e o teste).
- Sem push para o GitHub.

## Gates
Vitest 143/143 · PGlite 148 (banco) + 74 (fluxo ponta a ponta) + 87 unitárias · migração aplicada 2x sobre o schema **completo** de produção, com permissões conferidas · `deno check` e `deno lint` limpos · typecheck com os 9 erros preexistentes · build ok. Antes da publicação, simulador local com a OpenAI real: escala, repertório, tons, disponibilidade, ações, recusas e vínculo por código.

## 1. Backend (antes do site)
- Backup em `/var/backups/maislouvor/20260927-whatsapp-assistant-backend`: `schema-before.sql` (public), `compose-before.yml`, `env-before`, `applied-migration.sql` (sha256 `04165801b831b993…`) e `applied-at.txt`.
- Migração `20260928120000_whatsapp_assistant.sql`: ensaio em transação revertida e depois aplicação em `--single-transaction` com `lock_timeout` de 5 s às **2026-09-27T20:40:56Z**. Resultado: 11 tabelas com RLS, 46 funções, anon sem EXECUTE em nenhuma, authenticated só nas 7 RPCs do app e nenhuma tabela legível pelo app. Nenhuma tabela existente foi alterada.
- Edge function `whatsapp-assistant` em `/opt/supabase/volumes/functions/whatsapp-assistant` (9 arquivos, hashes iguais aos do repositório).
- Variáveis no `.env` e no serviço `functions` do compose do Supabase: `ASSISTANT_OPENAI_API_KEY`, `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_EVOLUTION_URL`, `WHATSAPP_EVOLUTION_INSTANCE`, `WHATSAPP_EVOLUTION_APIKEY` e `WHATSAPP_EVOLUTION_ORIGIN`. Container recriado com `--no-deps`: saudável de novo em 7,8 s e as outras funções respondendo.
- Rede privada `maislouvor-whatsapp` mantida pelo serviço systemd `maislouvor-whatsapp-network` (`/opt/stacks/maislouvor-whatsapp/network-keeper.sh`). **Nenhum arquivo do Talitha Cume foi editado**: ele é publicado por releases e perderia a edição. O serviço religou sozinho o container recriado.
- Evolution (container `talitha-cume-evolution-1`, v2.3.7): instância `maislouvor`, com token e segredo do webhook em `/opt/stacks/maislouvor-whatsapp` (600).
  - Ajustes: grupos ligados, recusa ligações, não marca lido.
  - Webhook interno com os eventos `MESSAGES_UPSERT`, `SEND_MESSAGE`, `GROUP_PARTICIPANTS_UPDATE` e `CONNECTION_UPDATE`.
  - A Evolution exige o `Origin` do `CORS_ORIGIN` até entre servidores; corrigido em `1cd4ad5`.
- Número **+55 83 95278-7819** (JID `5583952787819@s.whatsapp.net`, com o 9).
  - O pareamento por código falhou duas vezes (Baileys: "Invalid buffer"). Conectado por **QR code**.
  - Perfil "Asafe" com recado. O @lid do número (`273804936880260@lid`) foi aprendido sozinho pela lista do grupo.
- Ligado: `assistant_config.enabled = true`, `bot_phone = 5583952787819`.
- Teste real: grupo "Teste a safe" ativado às 18:11 na equipe **Teste**, com código gerado no banco. "quais os próximos cultos?" e "qual a minha escala?" foram respondidas reconhecendo o Filipe pelo telefone.

## 2. Site
- Release em `/var/www/maislouvor-releases/20260927-whatsapp-assistant` (172 arquivos, `SHA256SUMS` conferido no servidor).
- `publish.sh` igual ao da release anterior; mudaram só o ID e os hashes esperados. A primeira execução parou na checagem prévia, sem mexer em nada, porque o diretório de backup já existia (era o do banco). Ele foi renomeado para `…-backend` e a publicação rodou.
- Backup do site anterior em `/var/backups/maislouvor/20260927-whatsapp-assistant/site`, com `release.json`, o fonte sem credenciais e o script.
- Index `79208a63…` → **`88fdfc9e29818e2bf78fb18005b5dd0d4af9dadf4be5c193c642019b6a77f327`**; service worker `3b44001d…` → **`d69b1f980d80023a6c19e1bdf31120527091875c8c219c844e0c037bc6f04c55`**.

## Verificação pós-publicação
- HTTPS: 172/172 arquivos iguais ao `SHA256SUMS`. `/login`, `/app/home`, `/app/cultos`, `/app/settings` e `/baixar` servem o novo index. APKs preservados: `LouvorMais.apk` e 1.0.2 (`b951bc08…`), 1.0.3 (`9c30375f…`).
- Chrome headless no site publicado (`/login` em 390 e 1366 px, `/baixar`): sem erros no console.

## Limitações
- O APK Android usa bundle local: as telas de Ajustes do assistente só chegam lá num APK novo (1.0.5), que exige pedido próprio. O assistente no WhatsApp funciona para todos.
- A conta `lipssantos20@gmail.com` e a `filipesantoslourenco@outlook.com` têm o mesmo telefone e estão ambas no **Louvor Metodista**. Lá o Asafe acha duas pessoas e não identifica ninguém, até que uma delas fique sem esse telefone.
- A instância do Talitha Cume (`talitha-cume-prod`) está desconectada desde pelo menos 22/09/2026. É anterior a este trabalho; não foi mexida.
- A Evolution reinicia todo dia às 03:17 (backup do Talitha); a sessão do Asafe volta sozinha. O celular do número precisa abrir o WhatsApp a cada 14 dias.
- A chave da OpenAI foi colada na conversa; recomendado limite de gasto no projeto e trocar a chave quando possível (`ASSISTANT_OPENAI_API_KEY` no `.env` do Supabase + recriar `functions`).

## Reversão
- **Desligar o assistente** (sem deploy): `update assistant_config set enabled = false;` Ele para de responder na hora (cache de até 30 s).
- **Site**: restaurar `index.html`, `sw.js`, `registerSW.js` e `manifest.webmanifest` de `/var/backups/maislouvor/20260927-whatsapp-assistant/site/` (troca atômica, service worker por último). Sem a RPC, as seções novas nem aparecem.
- **Backend**: restaurar `compose-before.yml` e `env-before` e recriar `functions`; `systemctl disable --now maislouvor-whatsapp-network`; `evolution-instance.sh` com `DELETE /instance/logout` e `delete`. As tabelas novas podem ficar, porque o app anterior não as usa.
