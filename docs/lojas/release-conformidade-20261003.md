# Release: conformidade com a App Store e o Google Play (03/10/2026)

Branch `feat/conformidade-lojas`, a partir de `44eb41b` (base de produção 30/09) e
`016eed9` (a release do Asafe `20260930-asafe-interacao`, que está no ar). **Nada
foi publicado**: este documento é o roteiro de deploy. Todos os testes passam
(ver [Verificação](#verificação)).

## O que muda

| Frente | Branch integrada | O que a pessoa vê |
| --- | --- | --- |
| Termos, privacidade e suporte | `feat/lojas-legal` | Páginas públicas `/privacidade`, `/termos` e `/suporte` (abrem sem login, também no app). Caixa obrigatória "Li e aceito…" no cadastro por e-mail e "Ao continuar…" no Google e no convite. Pedido de aceite que não fecha em `/app` e `/admin` enquanto a versão aceita não for a atual, com **Aceitar e continuar**, **Sair** e **Excluir minha conta**. Grupo **Sobre** em Usuário › Meu usuário (Termos, Privacidade, Suporte, Excluir conta, versão do app). |
| Exclusão de conta | `feat/lojas-exclusao-conta` | **Excluir minha conta** em Usuário › Meu usuário (resumo por equipe, transferir a propriedade ou promover um líder ali mesmo, digitar EXCLUIR). Página pública `/excluir-conta` (com **Voltar**, como as páginas legais) com o passo a passo, o que é apagado e o que fica, e o e-mail para quem não consegue entrar. O login aceita `?redirect=/app/...`; `/app/settings#excluir-conta` abre a exclusão direto. |
| Moderação do chat | `feat/lojas-chat` | Toque longo (ou botão direito/"…") na mensagem: Copiar texto, Denunciar, Bloquear, Apagar. Filtro que troca palavrões por asteriscos ao salvar (também nos avisos ao time e no push). Mensagens de quem você bloqueou recolhidas (Mostrar/Desbloquear) e fora do Início; avisos dela fora do sino. Lista **Usuários bloqueados**. Líderes: **Denúncias do chat** na aba Membros (prazo de 24 h). Plataforma: `/admin/denuncias` (com push a cada denúncia), **Suspender conta** e **Tornar responsável** outro membro em Contas › Membros. |
| Asafe: IA de terceiros | `feat/lojas-asafe` | O líder aceita o aviso sobre a OpenAI (EUA) antes do primeiro código; equipes que já usavam recebem o aviso (confirmar ou desativar, com confirmação). Cada pessoa permite ou não o uso dos próprios dados (**opt-in**; quem já usava fica reconhecido até decidir). Citações de outras pessoas só vão à IA se o autor permitir, e nomes de quem não permite não vão (escala sem nome). O bot avisa no boas-vindas, na ajuda e, uma vez, na primeira resposta nos grupos que já estavam ativos, que as respostas vêm da OpenAI. As tolerâncias acabam em 30 dias. |
| YouTube no build das lojas | (revisão final) | Build da App Store e do Play com `VITE_STORE_BUILD=1`: sem importar áudio do YouTube (editor da música e áudios adicionais); o link da gravação e o player continuam, o áudio entra por arquivo ou Moises. Site e APK de `/baixar` continuam com a importação. |
| Conta de revisão | `feat/lojas-demo` | Nada no app. Script `scripts/review-demo/seed.mjs` cria uma conta de líder **por loja** com equipe fictícia completa e o Asafe suspenso; textos para App Store Connect e Play Console em `docs/lojas/notas-revisao.md`. |

### Ajustes feitos na integração

- **Fonte única em `src/lib/legal.ts`**: o e-mail de privacidade (também o da
  exclusão por e-mail), os prazos (resposta por e-mail em 15 dias, backups, 24 h das
  denúncias), os caminhos da exclusão (`/excluir-conta`, `/app/settings#excluir-conta`)
  e o provedor/retenção do Asafe. `/excluir-conta`, a seção de exclusão, o aviso de IA
  e o chat não têm mais cópias próprias. O e-mail pendente aparece destacado e sem link.
- **Ninguém precisa aceitar os termos para excluir a conta**: o pedido de aceite não
  bloqueia `/app/settings#excluir-conta` e tem o link "Excluir minha conta". A página
  pública leva para lá depois do login.
- **Um aviso por vez**: o aviso de IA do Asafe espera o aceite dos termos.
- **Textos legais iguais ao que foi implementado**: opt-in por pessoa do Asafe (com a
  tolerância de quem já usava), citações, retenção de 30 dias; filtro, denúncias (quem
  vê, 24 h, denúncia sobre líder só para a plataforma) e bloqueios do chat; rascunhos
  apagados na exclusão e o que fica com a moderação (denúncias com a cópia da
  mensagem, sem ligação com a conta). Nova pergunta no suporte: "Não concordo com os
  Termos atualizados".
- **Prova de denúncia sobrevive à exclusão**: o anexo de uma denúncia em aberto não
  entra na fila de arquivos da exclusão; sai quando a moderação fecha a denúncia.
- **Asafe suspenso não ativa grupo** (`team_suspended`): o código ainda mostra o aviso
  de IA (a Apple quer ver o consentimento), mas não liga grupo nenhum — importante para
  a conta de revisão.
- Ordem em Usuário › Meu usuário (celular): … Assistente no WhatsApp, Minhas funções,
  Notificações, Disponibilidade, Estatísticas, **Usuários bloqueados**, **Sobre**,
  **Excluir minha conta**, **Sair**.
- Histórico do painel com rótulos para conta excluída, propriedade transferida,
  denúncia analisada e mensagem apagada.
- O teste de unidades do Asafe foi alinhado à release `asafe-interacao` (citar a
  resposta do próprio Asafe vai como contexto, sem consulta de autor, e não fica no
  histórico).

### Correções da revisão final

- **Arquivos de outra pessoa nunca entram na exclusão** (alta): a lista de arquivos
  de `delete-account` não usa mais `profiles.avatar_url` nem só o caminho gravado na
  mensagem (texto livre do cliente). Anexo do chat entra pelo dono no Storage ou, sem
  dono, pela mensagem dela na pasta da própria equipe e sem mensagem de outra pessoa
  no mesmo arquivo. O banco recusa `attachment_path` fora da pasta da equipe ou já
  usado por outra mensagem (`chat_guard_attachment_path`); `delete_chat_message` não
  manda apagar um arquivo compartilhado ou de outra pasta.
- **Só o dono apaga a equipe junto com a conta** (média): o último membro que não é
  o dono (um líder tirou o dono da equipe) só sai; a equipe fica com o dono.
- **Rascunho já usado pela equipe fica** (baixa): rascunho num repertório ou culto não
  é apagado na exclusão (fica sem autor); o gerador de repertório não usa rascunhos.
- **Quem é denunciado não descobre** (baixa): `keep_attachment` só vai para a
  moderação, e as funções das policies do Storage foram para o schema `private`.
- **Opt-out do Asafe é privado** (baixa): sai de `profiles` (que a equipe inteira lê)
  para `assistant_ai_opt_outs`, que só as RPCs leem.
- **`lock_timeout = 3s`** também nas migrações 1 e 3.
- **Valores pendentes não vão ao ar** (alta): `npm run build` e `npm run build:store`
  param enquanto houver `PREENCHER` (`prebuild`), e a ordem de deploy começa por eles.
- **YouTube** (alta): build das lojas sem a importação, decidido na compilação (ver
  [YouTube](#youtube-como-manter-o-serviço)).
- **Asafe**: prazo de 30 dias para as tolerâncias (ajustar no deploy); linha da OpenAI
  uma vez nos grupos antigos; quem não permite aparece sem nome nas escalas e vozes que
  vão à IA (a Política e as telas dizem isso); caminhos "Usuário › …" nas telas e no bot.
- **Denúncias**: push para a plataforma em toda denúncia nova (também sobre a liderança).
- **Suspensão de contas** (média): a plataforma suspende/reativa contas e passa a
  propriedade de uma equipe; os Termos prometem só o que existe.
- **LGPD, dado sensível** (média): seção "Dados pessoais sensíveis" na Política (a base
  legal do art. 11 é um valor a preencher) e dica no motivo da indisponibilidade.
- `/excluir-conta` com **Voltar**; `/app/settings#excluir-conta` abre a exclusão direto.

### Integração com a trava de líder e dono (`20261003120000`, já em produção)

A migração `20261003120000_team_member_privilege_guard.sql` (outra sessão, integrada em
`8b71a62`) **já está aplicada em produção** e não muda nesta branch. Ela traz
`transfer_team_ownership(p_team_id, p_new_owner_profile_id)` (só o dono atual; devolve
`{ok:true}` ou `{ok:false, error:'forbidden'|'not_member'}`; o novo dono vira líder e o
antigo continua líder) e os guardas `guard_team_member_privileges` (com JWT de usuário, só
um líder da equipe promove, rebaixa ou mexe em líderes e permissões; o dono não é
rebaixado nem removido) e `guard_team_owner_change` (`teams.owner_id` só muda dentro da
transferência). Sem JWT de usuário (service_role) os guardas não se aplicam.

- **A exclusão de conta não redefine mais `transfer_team_ownership`** (crítica): a versão
  anterior da `130000` trocava a função de produção por uma sem a configuração do guarda,
  e toda transferência de dono passaria a falhar. Agora a `130000` só cria o gatilho
  `teams_owner_change_effects` (`AFTER UPDATE OF owner_id` em `teams`), que registra
  `team_ownership_transfer` no histórico do painel e avisa o novo dono ("Você agora é
  dono(a) da equipe") em **toda** troca de dono, uma vez por troca. O app segue o
  contrato de produção (`{ok}`), com mensagens para `forbidden` e `not_member` e a prévia
  recarregada depois de uma recusa.
- **"Tornar responsável" (plataforma) vai pela edge function** (alta): com o JWT de quem
  administra a plataforma (sem ser líder da equipe), os guardas recusavam a promoção a
  líder e a troca do dono. `platform-suspend-account` ganhou a ação
  `transfer_ownership` (`team_id`, `new_owner_member_id`), e
  `platform_transfer_team_ownership(p_actor_user_id, p_team_id, p_new_owner_member_id)`
  ficou só para a service_role, conferindo de novo o administrador.
- **Remover um líder pela denúncia** (média): o guarda só deixa um líder da equipe remover
  outro líder. `moderate_chat_report` agora explica antes ("Quem enviou a mensagem é líder
  da equipe, e só outro líder da equipe pode removê-lo. Para afastar a pessoa, suspenda a
  conta."), `list_chat_reports` devolve `reported_is_leader` e o painel não oferece
  "Remover da equipe" nesse caso (ver [Limitações](#limitações-conhecidas)).
- Conferido contra os guardas e sem mudança: promover o novo líder na exclusão de conta
  (quem promove é o único líder), remover um membro comum pela denúncia (liderança ou
  plataforma), consentimento do Asafe e termos (não mexem em `team_members`/`teams`),
  `delete-account` e o seed da conta de revisão (service_role).

## Migrações

Aplicar **nesta ordem**, cada uma numa transação, com o papel dono do schema `public`
(o mesmo das migrações anteriores; a do chat cria policies em `storage.objects`):

| # | Arquivo | O que faz | Antes / depois |
| --- | --- | --- | --- |
| 0 | `supabase/migrations/20261003120000_team_member_privilege_guard.sql` | **Já aplicada em produção** (outra sessão; integrada aqui em `8b71a62`). **Não reaplicar nem alterar.** Traz `transfer_team_ownership` e os guardas de líder e dono. | Antes da 1: `SELECT pg_get_functiondef('public.transfer_team_ownership(uuid,uuid)'::regprocedure) LIKE '%app.transfer_team_ownership%';` deve dar `true` (repetir depois de todas). |
| 1 | `20261003130000_account_deletion.sql` | FKs para a exclusão (`teams.owner_id` vira RESTRICT; `created_by` & cia. viram SET NULL), fila de arquivos, prévia, `delete_account_data` e o gatilho `teams_owner_change_effects` (histórico + aviso ao novo dono em toda troca de dono). **Não toca em `transfer_team_ownership`** (nem a função, nem as permissões: são da 0). **Falha de propósito** se achar uma FK de produção que não sabe decidir. Usa `lock_timeout = 3s` (se der timeout, rodar de novo). | Antes: rodar `supabase/setup/account-deletion-preflight.sql` (só leitura) e decidir o que aparecer como "FAZ A MIGRAÇÃO FALHAR" (ex.: `stem_jobs`, `yt_import_jobs`). Ler os NOTICE/WARNING. Se uma versão anterior desta migração rodou em algum banco de teste, reaplique a 0 nele (aquela versão trocava a função). |
| 2 | `20261003131000_terms_acceptance.sql` | `profiles.terms_accepted_at/terms_version/privacy_version`, `accept_terms()`, `legal_current_versions()` e o gatilho que impede forjar o aceite. | — |
| 3 | `20261003132000_chat_moderation.sql` | Termos bloqueados, `chat_reports`, `user_blocks`, RPCs, gatilhos do filtro (mensagens e avisos), da prova e do caminho do anexo, schema `private` com as funções das 5 policies em `storage.objects` (bucket `chat`), push para a plataforma, suspensão de contas (`platform_account_suspensions`) e transferência pela plataforma (`platform_transfer_team_ownership(p_actor_user_id, p_team_id, p_new_owner_member_id)`, só service_role, pela edge function). `moderate_chat_report` recusa, com mensagem, a plataforma remover um líder (o guarda da 0 recusaria). Usa `lock_timeout = 3s`. | Depende de `20260930010000_platform_admin_and_support.sql` (já no ar), da 0 e da 1 (o gatilho registra e avisa a transferência pela plataforma). Conferir que `private` **não** está em `PGRST_DB_SCHEMAS` do PostgREST (padrão: `public,storage,graphql_public`). |
| 4 | `20261003133000_assistant_ai_consent.sql` | `assistant_ai_consents`, `assistant_ai_legacy_members` (foto única de quem já usava), `assistant_ai_opt_outs`, prazo das tolerâncias (30 dias), `assistant_groups.ai_disclosure_version`, RPCs de consentimento e as funções do Asafe com o opt-in (escala sem o nome de quem não permite). Usa `lock_timeout = 3s`: se der timeout, rodar de novo. | Logo depois: `SELECT assistant_team_consent_state(team_id) FROM assistant_groups WHERE active;` deve dar `pending` nas equipes que já usam. **Obrigatório:** ajustar o prazo (abaixo). |
| — | `…134000_review_demo.sql` | **Não existe** (a demo não precisou). | — |

Todas são idempotentes e terminam com `NOTIFY pgrst, 'reload schema'` (ou rodar à mão).
Depois de **todas**:

```sql
SELECT * FROM public.account_deletion_blocking_references();  -- tem de voltar vazio
SELECT pg_get_functiondef('public.transfer_team_ownership(uuid,uuid)'::regprocedure)
       LIKE '%app.transfer_team_ownership%';                    -- true: continua a da 0 (produção)
SELECT public.legal_current_versions();                         -- {"terms":"2026-10-03","privacy":"2026-10-03"}
SELECT public.assistant_ai_consent_version();                   -- 2026-10-03
SELECT ai_consent_required_from FROM public.assistant_config;   -- ~30 dias depois da migração
```

**Prazo do Asafe (passo obrigatório).** Até essa data, equipes que já usavam o Asafe
e quem já era reconhecido continuam mandando dados à OpenAI sem ter confirmado no
app; depois, a equipe pendente para de usar a IA até um líder confirmar, e quem não
permitiu deixa de ser reconhecido. A migração põe 30 dias; ajuste para a data em que
o APK novo estiver publicado + 14 dias (líderes no APK 1.0.5 só confirmam pelo site):

```sql
UPDATE public.assistant_config SET ai_consent_required_from = '2026-11-03 03:00+00';  -- exemplo
```

Exemplo (conexão administrativa já configurada, sem credenciais no código):

```sh
psql -X -v ON_ERROR_STOP=1 -f supabase/setup/account-deletion-preflight.sql
# 20261003120000 já está em produção: fica fora do laço.
for f in 20261003130000_account_deletion 20261003131000_terms_acceptance \
         20261003132000_chat_moderation 20261003133000_assistant_ai_consent; do
  psql -X -v ON_ERROR_STOP=1 --single-transaction -f "supabase/migrations/$f.sql" || break
done
```

## Edge functions

| Função | Mudança | Como publicar |
| --- | --- | --- |
| `delete-account` | **Nova** (`index.ts` + `flow.ts`). Usuário só pelo JWT, exige `{ "confirmation": "EXCLUIR" }`, banco primeiro (uma transação), arquivos depois, conta do GoTrue por último; repetir é inofensivo. | Copiar a pasta para `/opt/supabase/volumes/functions/delete-account/` e `docker compose up -d functions`. |
| `platform-suspend-account` | **Nova** (`index.ts` + `flow.ts`). Só administrador da plataforma (confere `is_platform_admin` com o token e o banco confere de novo): bane/desbane no GoTrue (`ban_duration`) e grava em `platform_account_suspensions` e no histórico. Também a ação `{"action":"transfer_ownership","team_id","new_owner_member_id"}` ("Tornar responsável" no painel): chama `platform_transfer_team_ownership` com a service_role e o usuário do token como ator — pelo navegador, os guardas da migração 0 recusariam. | Copiar a pasta para `/opt/supabase/volumes/functions/platform-suspend-account/` e `docker compose up -d functions` **antes do site** (o painel novo transfere por ela). |
| `send-push` | Alterada: com `chat_report_id`, avisa também os administradores da plataforma (o banco confere a denúncia de quem chama, uma vez); passa título e texto pelo filtro de palavras (`chat_mask_text`) antes de enviar. Sem a migração 3, manda como antes. | Copiar `supabase/functions/send-push/` para `/opt/supabase/volumes/functions/send-push/` e `docker compose up -d functions`. |
| `whatsapp-assistant` | Alterada: consentimento da equipe e da pessoa, citações filtradas (`assistant_quote_author_allowed`), linha de transparência (OpenAI) no boas-vindas/ajuda e, uma vez, na primeira resposta dos grupos que já estavam ativos (`assistant_claim_ai_disclosure`), caminhos "Usuário › …", mensagens `consent_required` e `team_suspended`. **Contém a release `asafe-interacao` que está no ar** (016eed9): publicar daqui não desfaz piadas, desafios nem a conversa por respostas citadas. | Copiar `supabase/functions/whatsapp-assistant/` para `/opt/supabase/volumes/functions/whatsapp-assistant/` e `docker compose up -d functions`. Conferir com o `curl` do `docs/assistente-whatsapp.md` (`{"ok":true,…}`). |

`supabase/config.toml` ganhou `[functions.delete-account]` e
`[functions.platform-suspend-account]` com `verify_jwt = true`. No self-hosted, quem
decide é o roteador `main` das functions; as duas também conferem o token sozinhas
(`auth.getUser`), então continuam seguras mesmo sem o `verify_jwt`. Deno não está instalado aqui: as functions não passaram por
`deno check` (a lógica está coberta pelos testes em Node).

## Variáveis e segredos

- **Nenhuma variável nova.** `delete-account` usa `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
  `SUPABASE_SERVICE_ROLE_KEY`, que o serviço `functions` já recebe. O
  `whatsapp-assistant` continua com as mesmas (`ASSISTANT_OPENAI_API_KEY`,
  `WHATSAPP_*`).
- **`VITE_STORE_BUILD=1`**: só no bundle das lojas (Play AAB e iOS), via
  `npm run build:store`. O site e o APK de `/baixar` usam `npm run build`, sem ela.
  Nada de segredo: só esconde a importação do YouTube na compilação.
- A conta de revisão roda **na sua máquina**, com `SUPABASE_URL` e
  `SUPABASE_SERVICE_ROLE_KEY` no ambiente (nunca em arquivo do repositório). As senhas
  ficam só em `~/.local/share/maislouvor-review/credentials.json`.
- Asafe, alavancas sem deploy (em `assistant_config`): `ai_consent_required_from`
  (fim das tolerâncias; a migração põe 30 dias, **ajustar** como acima) e
  `ai_member_consent_required` (encerra a tolerância das pessoas já; desligada).

## Valores a preencher antes do envio às lojas

```sh
node scripts/check-legal-placeholders.mjs   # sai com erro enquanto houver "PREENCHER"
```

**É trava de build:** `npm run build` (via `prebuild`) e `npm run build:store` rodam
esse script e param enquanto houver pendência — sem isso, o site novo pediria a todos
o aceite de Termos e de uma Política sem o responsável identificado (LGPD, art. 9º,
III), gravado como versão 2026-10-03, e ninguém seria chamado a aceitar de novo
quando os valores fossem preenchidos. Build local de teste: `npx vite build` (sem a
trava; nunca publicar esse bundle). O `publish.sh` de cada release deve gerar o
bundle com `npm run build` (ou rodar o script antes, na primeira linha).

Hoje acusa **10** valores, todos em `src/lib/legal.ts`: razão social/nome, CNPJ/CPF,
endereço, e-mail de privacidade (também usado na exclusão por e-mail), e-mail de
suporte, encarregado (DPO), hospedagem e país do datacenter, provedor de e-mail
(SMTP), prazo de rotação dos backups (escrever como texto: "30 dias") e a **base
legal do art. 11 para dados sensíveis** (`SENSITIVE_DATA_LEGAL_BASIS`: participar de
uma equipe de louvor revela convicção religiosa; se for consentimento específico, a
tela de cadastro precisa de uma caixa própria). Se o datacenter for fora do Brasil,
incluir o país na seção de transferência internacional (`src/content/legal/privacy.ts`).

Se o site precisar sair **antes** dos valores definitivos: não publique o texto com
`PREENCHER`. Ou publique sem o pedido de aceite (sem montar `<TermsGate />` e as rotas
legais), ou, quando o texto final existir, troque `TERMS_VERSION`/`PRIVACY_VERSION`
(`src/lib/legal.ts`) e `legal_current_versions()` (migração nova) para todos aceitarem
o texto real.

Fora do script:

- `docs/lojas/notas-revisao.md`: `{{CONTACT_EMAIL}}`, `{{APPLE_REVIEW_PASSWORD}}` e
  `{{GOOGLE_REVIEW_PASSWORD}}` — preencher **só nos formulários das lojas**, nunca no
  arquivo.
- Compromissos que os textos fazem e você precisa confirmar: suporte em 2 dias úteis,
  denúncias em 24 h, pedidos por e-mail em 15 dias, registros de acesso por 6 meses
  (nada no repositório mostra essa retenção hoje), histórico do Asafe por 30 dias e a
  frase sobre a retenção da OpenAI (`ASAFE_PROVIDER_RETENTION` em `src/lib/legal.ts`).
- Revisão jurídica de `src/content/legal/*.ts` (texto puro, sem mexer nas telas).

## Ordem de deploy

1. **Textos jurídicos**: preencher os 10 valores de `src/lib/legal.ts`, revisão
   jurídica de `src/content/legal/*.ts` e `node scripts/check-legal-placeholders.mjs`
   sem pendências. Sem isso o build não sai (e não deve sair).
2. **Backup** do banco (como de costume) e o preflight da exclusão.
3. **Migrações** 1 → 4 (a 0, `20261003120000`, já está em produção: não reaplicar; a 1
   não toca em `transfer_team_ownership`). Conferir as consultas acima e **ajustar o
   prazo do Asafe**.
4. **Edge functions**: `delete-account` e `platform-suspend-account` (novas),
   `send-push` e `whatsapp-assistant`.
5. **Site**: `louvor-vps/publish.sh` a partir desta branch, com o bundle de
   `npm run build`. Conferir que o fallback de SPA abre `/privacidade`, `/termos`,
   `/suporte` e `/excluir-conta` como já abre `/baixar`.
6. **App Android**: o app roda o bundle local, então **precisa de APK novo** (sem
   isso, nada das telas novas chega ao celular). Subir `versionCode`/`versionName` em
   `android/app/build.gradle` (hoje 6 / 1.0.5) e gerar **dois** bundles:
   - **APK de `/baixar`**: `npm run build`, `npx cap sync android`, assinar e publicar
     como hoje (com a importação do YouTube).
   - **AAB do Play**: `npm run build:store` (`VITE_STORE_BUILD=1`), `npx cap sync
     android`, `bundleRelease`. Mesmo `applicationId`: o Play só atualiza um app
     assinado com a chave registrada nele (Play App Signing) — quem instalou pelo
     `/baixar` com outra chave precisa desinstalar antes. Antes de contar com o
     `/baixar`, conferir se o pacote e a chave do APK estão registrados na
     verificação de desenvolvedor do Android, que o Google anunciou para o Brasil a
     partir de setembro de 2026 (sem isso, aparelhos certificados podem recusar a
     instalação fora da loja).
   - iOS: quando o projeto for criado, sempre com `npm run build:store`.
7. Ajustar `ai_consent_required_from` para a data do APK + 14 dias, se ainda não fez.
8. **Conta de revisão** (ver abaixo) e formulários das lojas: Política
   `https://maislouvor.com/privacidade`, Suporte `https://maislouvor.com/suporte`,
   Termos `https://maislouvor.com/termos` (App Store: EULA padrão + este link),
   exclusão de conta (Play) `https://maislouvor.com/excluir-conta`.

Janela de convivência (site novo, APK 1.0.5 ainda instalado):

- No APK 1.0.5 não há pedido de aceite nem exclusão no app; a página pública
  `/excluir-conta` funciona no navegador.
- Líderes no APK 1.0.5 recebem `consent_required` ao gerar código do Asafe (ativações
  existentes continuam); precisam usar o site até o APK novo — inclusive para
  confirmar o aviso da equipe antes do prazo.
- O APK 1.0.5 não manda `chat_report_id` (não tem denúncia); o `send-push` novo atende
  os dois apps.
- Com o opt-in, membros de equipes ativadas **depois** da migração só são reconhecidos
  pelo Asafe depois de permitir no app.

## Reversão

- **Site/APK**: republicar o bundle anterior (`ab88226`/release 30/09). Sem o site novo,
  ninguém vê o pedido de aceite nem a exclusão no app; o banco novo não atrapalha o app
  antigo.
- **`whatsapp-assistant`**: republicar a pasta de `016eed9` (a release no ar). Atenção: as
  funções do banco da migração 4 continuam exigindo o aceite da equipe para gerar código
  e ativar grupo, e o reconhecimento por pessoa continua opt-in.
- **Desligar o Asafe** inteiro, se preciso: `update assistant_config set enabled = false;`.
- **Filtro do chat**: `ALTER TABLE public.messages DISABLE TRIGGER chat_filter_message;`
  (sem perder denúncias nem bloqueios). Para incluir/retirar termos, ver
  `docs/moderacao-chat.md`.
- **`delete-account`**: remover a pasta da function e reiniciar `functions`; a seção do app
  mostra o erro e a página pública continua oferecendo o e-mail.
- **`send-push`**: republicar a pasta anterior (perde só o push à plataforma e o filtro
  no texto do push).
- **`platform-suspend-account`**: remover a pasta; quem já foi suspenso continua banido
  no GoTrue até reativar (`auth.admin.updateUserById(id, { ban_duration: "none" })` ou
  a função de volta). "Tornar responsável" no painel para de funcionar junto.
- **Gatilho da troca de dono** (`teams_owner_change_effects`): para parar o registro e o
  aviso sem mexer na transferência, `ALTER TABLE public.teams DISABLE TRIGGER
  teams_owner_change_effects;`. Nunca reverter com uma versão antiga da migração 1 (ela
  trocaria `transfer_team_ownership`).
- **Migrações**: são aditivas, exceto as FKs da migração 1. **Não** volte
  `teams.owner_id` para `ON DELETE CASCADE` (apagar um dono voltaria a apagar a equipe
  inteira). Colunas e tabelas novas podem ficar sem uso. Para apagar arquivos que
  ficaram na fila: `SELECT * FROM public.account_deletion_storage_queue;` (removê-los
  pelo Storage e apagar as linhas).

## Checklist de QA manual

Celular (Android e navegador estreito), claro e escuro, com contas de teste:

**Termos e documentos**
- [ ] `/privacidade`, `/termos`, `/suporte`, `/excluir-conta` deslogado (web e app): sumário, "Voltar", link de seção (`/privacidade#exclusao`), valores pendentes destacados.
- [ ] Cadastro por e-mail sem marcar a caixa: erro inline, nada criado; marcando: conta criada e aceite gravado (não pede de novo).
- [ ] Cadastro com Google pela tela de cadastro: aceite gravado no primeiro login. Login com Google pela tela de login (conta antiga): pedido de aceite aparece uma vez.
- [ ] Conta antiga em `/app/home`: pedido não fecha (Esc, toque fora); Aceitar → some; Sair → login.
- [ ] No pedido, **Excluir minha conta** → Usuário › Meu usuário na seção de exclusão, sem o pedido por cima; ir para Início → o pedido volta.
- [ ] Aviso do Asafe (membro de equipe ativa) só aparece **depois** do aceite dos termos.

**Exclusão de conta**
- [ ] Membro comum: resumo "Você sai da equipe", digitar EXCLUIR, conta excluída, volta ao login com aviso; login de novo falha.
- [ ] Único membro de uma equipe: "Será excluída com a conta"; músicas/cultos/chat da equipe somem.
- [ ] Dono com membros: "Transfira a propriedade" → escolher, Transferir → liberado; a pessoa vira dona e líder e recebe notificação (uma só); o painel mostra "Propriedade de equipe transferida" uma vez.
- [ ] Transferir para alguém que saiu da equipe enquanto a folha estava aberta: aviso "A pessoa escolhida não faz mais parte da equipe…" e o resumo recarrega.
- [ ] Único líder (não dono): "Escolha um novo líder" → Promover.
- [ ] `/excluir-conta` → "Entrar e excluir minha conta" → login → cai na seção de exclusão (também para quem ainda não aceitou os termos).
- [ ] Mensagem com foto denunciada e conta do autor excluída: a denúncia continua com a cópia e o anexo; ao resolver, o anexo some.
- [ ] Pedido de aceite → **Excluir minha conta** (e `/excluir-conta` → Entrar) abre a folha de exclusão direto; ao fechar, a seção fica à vista.
- [ ] `/excluir-conta` aberto pelo app (Como funciona): **Voltar** retorna à tela anterior.

**Chat**
- [ ] Toque longo (sem rolar), botão direito e "…": Copiar texto, Denunciar, Bloquear {nome}, Apagar (só nas próprias, ou líder).
- [ ] Denunciar: 7 motivos, detalhes, "Bloquear também"; confirmação com 24 horas. Líder recebe notificação e push (sem o texto).
- [ ] Denúncia sobre um líder: nenhum líder vê; aparece em `/admin/denuncias` como "Sobre a liderança".
- [ ] Bloquear: mensagens recolhidas com Mostrar/Desbloquear; somem da "Atividade da equipe"; lista em Usuários bloqueados.
- [ ] Palavrão vira asteriscos (e "computador", "disputa" não); mensagem acima de 4.000 caracteres é recusada.
- [ ] Usuário › Membros › Denúncias do chat: prazo vencido em vermelho; Em análise / Resolver / Descartar / Apagar mensagem / remover autor (nunca o dono).
- [ ] Administrador da plataforma recebe **push** a cada denúncia nova, também sobre a liderança.
- [ ] `/admin/denuncias` › **Suspender conta** (inclusive do dono): a pessoa não entra mais (sessão aberta cai em até 1 h); Contas › equipe › Membros › **Tornar responsável** outro membro — inclusive um membro comum (não líder): vira dono e líder, recebe o aviso da equipe de suporte; **Reativar** volta; Histórico mostra "Conta suspensa/reativada" e "Propriedade de equipe transferida".
- [ ] `/admin/denuncias` › Resolver denúncia sobre um **líder** (ex.: o antigo dono depois de "Tornar responsável"): sem "Remover da equipe", com o aviso de que só outro líder da equipe remove; a nova liderança remove pela aba Membros.
- [ ] Aviso ao time com palavrão chega mascarado (sino e push); aviso de quem você bloqueou não aparece no sino.

**Asafe**
- [ ] Líder de equipe que já usava: aviso ao abrir o app (Concordo e manter ativo / Desativar → confirmação com as consequências).
- [ ] Equipe nova: Gerar código → aviso → "Concordo e ativar" → código; ativar no grupo de teste → boas-vindas com a linha da OpenAI.
- [ ] Membro novo: não é reconhecido até permitir em Usuário › Meu usuário; permitindo, é reconhecido; "Não permitir" (com confirmação) apaga vínculo e histórico.
- [ ] Citar a mensagem de quem não permitiu: a resposta não usa o texto citado.
- [ ] Equipe suspensa: o código é gerado (aviso aparece), a tela avisa que não ativa grupo, e no grupo o bot responde que está suspenso.
- [ ] Grupo que já estava ativo: a primeira resposta depois do deploy traz a linha da OpenAI; as seguintes, não.
- [ ] "Quem toca domingo?" com alguém que não permitiu na escala: a resposta não traz o nome dela.

**Build das lojas (`npm run build:store`)**
- [ ] Editor da música (admin): "Cole o link da gravação…", sem "Importar áudio da gravação", sem a dica do YouTube; "Conferir versão" abre o player; enviar arquivo funciona; link alterado pede "Envie o áudio desta versão novamente".
- [ ] Áudios adicionais: só arquivo (sem aba YouTube); item importado no site aparece como "Importado", sem "Tentar novamente".
- [ ] APK de `/baixar` (`npm run build`): tudo como antes, com a importação.

**Painel e conta de revisão**
- [ ] `/admin/denuncias` carrega; Histórico mostra "Conta excluída pelo usuário" e "Denúncia do chat analisada".
- [ ] Seguir `docs/lojas/notas-revisao.md` com a conta de revisão de cada loja (aceite, mixer/loop na Baby Bird, denúncia/bloqueio da Ana, exclusão com transferência para a Ana) e rodar o reset depois.

## Conta de revisão

Depois do deploy (banco, functions, site e app), na sua máquina:

```sh
node scripts/review-demo/seed.mjs                      # simulação, sem rede
read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL=https://api.maislouvor.com node scripts/review-demo/seed.mjs --apply --yes
cat ~/.local/share/maislouvor-review/credentials.json  # accounts.apple / accounts.google
```

Antes de cada envio e depois de cada resposta de uma loja:
`node scripts/review-demo/seed.mjs --reset --yes --store apple` (ou `google`) — nunca
durante a revisão daquela loja. Detalhes e cuidados em `scripts/review-demo/README.md`;
textos das lojas em `docs/lojas/notas-revisao.md`.

## YouTube: como manter o serviço

O pedido foi achar um jeito de manter a importação do YouTube, que é importante.
**Implementado:** a importação continua no site e no APK de `/baixar`, e sai do bundle
das lojas.

- **O player do YouTube incorporado** (link da gravação, "Conferir versão", apresentação)
  é permitido nas duas lojas e já está coberto pelos Termos e pela Política.
- **A importação do áudio** (`import-youtube` no editor e `import-song-audio` nos áudios
  adicionais, baixando no servidor) é o motivo mais provável de recusa: Apple 5.2.3 e a
  política de propriedade intelectual do Play recusam apps que salvam mídia do YouTube
  sem autorização, mesmo quando quem baixa é o servidor. Esconder só durante a revisão
  (chave remota) viola a Apple 2.3.1.

Como ficou (`src/lib/storeBuild.ts`, decidido **na compilação**):

1. `npm run build:store` (`VITE_STORE_BUILD=1`) só para o AAB do Play e o iOS. Nesse
   bundle, `src/pages/SongEditor.tsx` não tem o botão "Importar áudio da gravação", a
   dica do YouTube, o aviso de cookie expirado nem o "importe de novo" (pede "Envie o
   áudio desta versão novamente"; enviar o arquivo resolve); o campo vira "Cole o link
   da gravação…". `src/components/SongAudioAttachments.tsx` aceita só arquivo: sem a
   aba YouTube, sem "Tentar novamente" (que pedia ao servidor para baixar de novo) e com
   status neutros ("Importado"). `importSongAudio` recusa sem chamar o servidor. O
   minificador tira o código da importação do bundle (conferido: nenhum
   `import-youtube` no `dist` das lojas).
2. **Site (maislouvor.com) e APK de `/baixar`** (`npm run build`): tudo como antes. O que
   é importado no site chega ao app pela mesma conta (áudio, faixas, loops).
3. Testes: `src/pages/SongEditor.registration.test.tsx`,
   `src/components/SongAudioAttachments.test.tsx` e `src/lib/songAudioAttachments.test.ts`
   (com `VITE_STORE_BUILD=1`, nenhum controle chama `import-youtube` nem `import-song-audio`).
4. **Risco que continua:** baixar do YouTube no servidor contraria os termos do próprio
   YouTube, mesmo no site, e os Termos do +Louvor já dizem para importar só quando a
   plataforma permite. A médio prazo, o caminho mais seguro é arquivo próprio, Moises e
   multitracks licenciados.

## Verificação

Rodado em `/Users/filipecardone/Projetos/Cofre/MaisLouvor-lojas` depois da integração com
a trava de líder e dono (`20261003120000`):

- `npx vitest run`: 34 arquivos, 308 testes, todos passando (base: 20/165).
- `npx tsc --noEmit -p tsconfig.app.json`: 9 erros, os mesmos 9 de antes.
- PGlite (`PGLITE_MODULE=…/pglite/dist/index.js node supabase/tests/<arquivo>.mjs`): todas
  as suítes passam, com a `20261003120000` aplicada **antes** da `130000`, como na
  produção — `account_deletion` 146 (transferência pela RPC de produção, um registro e um
  aviso, a função de produção intacta depois de todas as migrações), `chat_moderation` 239
  (transferência pela plataforma só com a service_role e um administrador, guardas
  recusando o caminho antigo, líder que só a equipe remove), `lojas_all_migrations` 112
  (todas as migrações de 03/10 juntas, em ordem, duas vezes, sobre o recorte de
  produção), `review_demo_seed` 89, `team_member_privileges` 73, `assistant_ai_consent`
  185 e as demais como antes. `whatsapp_notifications_schema.mjs` só roda com um dump de
  produção (como antes).
- `node --test scripts/review-demo/seed.test.mjs`: 22 testes passando.
- `npx vite build`: passa. `VITE_STORE_BUILD=1 npx vite build`: passa, sem `import-youtube`.
- `node scripts/check-legal-placeholders.mjs`: 10 pendências (esperado até o
  preenchimento; por isso `npm run build` ainda para).
- Edge functions (sem Deno aqui): sintaxe conferida com `esbuild`; a lógica de
  `platform-suspend-account` está em `flow.ts`, testada no vitest.

## Limitações conhecidas

- Suspender uma conta bane no GoTrue e apaga as sessões guardadas quando o banco
  permite (`sessions_revoked`); o token de acesso já emitido vale até expirar (até 1
  hora). Encerrar de vez uma conta abusiva continua sendo a exclusão manual
  (`delete_account_data` + `auth.admin.deleteUser`).
- O alerta de denúncia vencida (mais de 24 h) aparece no painel e no sino; não há
  lembrete agendado (cron) para a plataforma.
- Avisos ao time ("Enviar aviso ao time") passam pelo filtro e pelo bloqueio, mas ainda
  não têm "Denunciar" no sino (a denúncia segue pelo suporte).
- A exceção do pedido de aceite vale para `/app/settings#excluir-conta`: nessa tela a
  pessoa ainda pode mexer nas outras abas de Usuário sem aceitar; ao sair dela, o pedido
  volta.
- O login com Google não leva o `?redirect=` (depois do Google, a pessoa cai no Início).
- O filtro do chat mascara palavras soltas (frases e "p.o.r.r.a" passam) e só mensagens
  novas ou editadas.
- A data do aceite dos termos (`profiles.terms_*`) continua legível pela equipe, como o
  resto do perfil (não revela escolha nenhuma: todo mundo aceita para usar o app).
- iOS: falta o projeto, e o login com Google exige "Iniciar sessão com a Apple" (4.8).
- **A plataforma não remove um líder da equipe** pela denúncia: o guarda de
  `20261003120000` (já em produção) só deixa um líder da própria equipe remover outro
  líder, e `moderate_chat_report` recusa com "Quem enviou a mensagem é líder da equipe, e
  só outro líder da equipe pode removê-lo. Para afastar a pessoa, suspenda a conta." (o
  painel nem oferece a opção). Vale também para o antigo dono depois de "Tornar
  responsável", que continua líder. Caminho: suspender a conta e a nova liderança remove
  pela aba Membros. Administrador da plataforma que também é líder daquela equipe remove
  pelo app da equipe, não pelo painel.
- Troca de dono feita à mão pelo suporte (SQL sem JWT) entra no histórico **sem autor** e
  avisa o novo dono com o texto neutro. Para registrar como plataforma, na mesma
  transação: `SELECT set_config('app.ownership_change_source', 'platform', true),
  set_config('app.ownership_change_actor', '<auth.users.id>', true);`.
- O antigo dono continua líder depois de qualquer transferência (regra da
  `transfer_team_ownership` de produção, seguida também pela plataforma).
