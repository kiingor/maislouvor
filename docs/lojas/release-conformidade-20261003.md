# Release: conformidade com a App Store e o Google Play (03/10/2026)

Branch `feat/conformidade-lojas`, a partir de `44eb41b` (base de produção 30/09) e
`016eed9` (a release do Asafe `20260930-asafe-interacao`, que está no ar). **Nada
foi publicado**: este documento é o roteiro de deploy. Todos os testes passam
(ver [Verificação](#verificação)).

## O que muda

| Frente | Branch integrada | O que a pessoa vê |
| --- | --- | --- |
| Termos, privacidade e suporte | `feat/lojas-legal` | Páginas públicas `/privacidade`, `/termos` e `/suporte` (abrem sem login, também no app). Caixa obrigatória "Li e aceito…" no cadastro por e-mail e "Ao continuar…" no Google e no convite. Pedido de aceite que não fecha em `/app` e `/admin` enquanto a versão aceita não for a atual, com **Aceitar e continuar**, **Sair** e **Excluir minha conta**. Grupo **Sobre** em Usuário › Meu usuário (Termos, Privacidade, Suporte, Excluir conta, versão do app). |
| Exclusão de conta | `feat/lojas-exclusao-conta` | **Excluir minha conta** em Usuário › Meu usuário (resumo por equipe, transferir a propriedade ou promover um líder ali mesmo, digitar EXCLUIR). Página pública `/excluir-conta` com o passo a passo, o que é apagado e o que fica, e o e-mail para quem não consegue entrar. O login aceita `?redirect=/app/...`. |
| Moderação do chat | `feat/lojas-chat` | Toque longo (ou botão direito/"…") na mensagem: Copiar texto, Denunciar, Bloquear, Apagar. Filtro que troca palavrões por asteriscos ao salvar. Mensagens de quem você bloqueou recolhidas (Mostrar/Desbloquear) e fora do Início. Lista **Usuários bloqueados**. Líderes: **Denúncias do chat** na aba Membros (prazo de 24 h). Plataforma: `/admin/denuncias`. |
| Asafe: IA de terceiros | `feat/lojas-asafe` | O líder aceita o aviso sobre a OpenAI (EUA) antes do primeiro código; equipes que já usavam recebem o aviso (confirmar ou desativar, com confirmação). Cada pessoa permite ou não o uso dos próprios dados (**opt-in**; quem já usava fica reconhecido até decidir). Citações de outras pessoas só vão à IA se o autor permitir. O bot avisa no boas-vindas e na ajuda que as respostas vêm da OpenAI. |
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

## Migrações

Aplicar **nesta ordem**, cada uma numa transação, com o papel dono do schema `public`
(o mesmo das migrações anteriores; a do chat cria policies em `storage.objects`):

| # | Arquivo | O que faz | Antes / depois |
| --- | --- | --- | --- |
| 0 | `supabase/migrations/20261003120000_team_member_privilege_guard.sql` | **De outra sessão, não está nesta branch.** Se for publicada, vai antes. | Conferir que ela não bloqueia `transfer_team_ownership`, a promoção a líder (update de `team_members.role` pela aba Membros) nem a remoção do autor em `moderate_chat_report`. |
| 1 | `20261003130000_account_deletion.sql` | FKs para a exclusão (`teams.owner_id` vira RESTRICT; `created_by` & cia. viram SET NULL), fila de arquivos, prévia, transferência e `delete_account_data`. **Falha de propósito** se achar uma FK de produção que não sabe decidir. | Antes: rodar `supabase/setup/account-deletion-preflight.sql` (só leitura) e decidir o que aparecer como "FAZ A MIGRAÇÃO FALHAR" (ex.: `stem_jobs`, `yt_import_jobs`). Ler os NOTICE/WARNING. |
| 2 | `20261003131000_terms_acceptance.sql` | `profiles.terms_accepted_at/terms_version/privacy_version`, `accept_terms()`, `legal_current_versions()` e o gatilho que impede forjar o aceite. | — |
| 3 | `20261003132000_chat_moderation.sql` | Termos bloqueados, `chat_reports`, `user_blocks`, RPCs, gatilhos do filtro e da prova, 5 policies em `storage.objects` (bucket `chat`). | Depende de `20260930010000_platform_admin_and_support.sql` (já no ar). |
| 4 | `20261003133000_assistant_ai_consent.sql` | `assistant_ai_consents`, `assistant_ai_legacy_members` (foto única de quem já usava), `profiles.assistant_ai_opt_out`, RPCs de consentimento e as funções do Asafe com o opt-in. Usa `lock_timeout = 3s`: se der timeout, rodar de novo. | Logo depois: `SELECT assistant_team_consent_state(team_id) FROM assistant_groups WHERE active;` deve dar `pending` nas equipes que já usam. |
| — | `…134000_review_demo.sql` | **Não existe** (a demo não precisou). | — |

Todas são idempotentes e terminam com `NOTIFY pgrst, 'reload schema'` (ou rodar à mão).
Depois de **todas**:

```sql
SELECT * FROM public.account_deletion_blocking_references();  -- tem de voltar vazio
SELECT public.legal_current_versions();                         -- {"terms":"2026-10-03","privacy":"2026-10-03"}
SELECT public.assistant_ai_consent_version();                   -- 2026-10-03
```

Exemplo (conexão administrativa já configurada, sem credenciais no código):

```sh
psql -X -v ON_ERROR_STOP=1 -f supabase/setup/account-deletion-preflight.sql
for f in 20261003130000_account_deletion 20261003131000_terms_acceptance \
         20261003132000_chat_moderation 20261003133000_assistant_ai_consent; do
  psql -X -v ON_ERROR_STOP=1 --single-transaction -f "supabase/migrations/$f.sql" || break
done
```

## Edge functions

| Função | Mudança | Como publicar |
| --- | --- | --- |
| `delete-account` | **Nova** (`index.ts` + `flow.ts`). Usuário só pelo JWT, exige `{ "confirmation": "EXCLUIR" }`, banco primeiro (uma transação), arquivos depois, conta do GoTrue por último; repetir é inofensivo. | Copiar a pasta para `/opt/supabase/volumes/functions/delete-account/` e `docker compose up -d functions`. |
| `whatsapp-assistant` | Alterada: consentimento da equipe e da pessoa, citações filtradas (`assistant_quote_author_allowed`), linha de transparência (OpenAI) no boas-vindas/ajuda, mensagens `consent_required` e `team_suspended`. **Contém a release `asafe-interacao` que está no ar** (016eed9): publicar daqui não desfaz piadas, desafios nem a conversa por respostas citadas. | Copiar `supabase/functions/whatsapp-assistant/` para `/opt/supabase/volumes/functions/whatsapp-assistant/` e `docker compose up -d functions`. Conferir com o `curl` do `docs/assistente-whatsapp.md` (`{"ok":true,…}`). |

`supabase/config.toml` ganhou `[functions.delete-account] verify_jwt = true`. No
self-hosted, quem decide é o roteador `main` das functions; a `delete-account` também
confere o token sozinha (`auth.getUser`), então continua segura mesmo sem o
`verify_jwt`. Deno não está instalado aqui: as functions não passaram por
`deno check` (a lógica está coberta pelos testes em Node).

## Variáveis e segredos

- **Nenhuma variável nova.** `delete-account` usa `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
  `SUPABASE_SERVICE_ROLE_KEY`, que o serviço `functions` já recebe. O
  `whatsapp-assistant` continua com as mesmas (`ASSISTANT_OPENAI_API_KEY`,
  `WHATSAPP_*`).
- O site não tem `VITE_*` novo.
- A conta de revisão roda **na sua máquina**, com `SUPABASE_URL` e
  `SUPABASE_SERVICE_ROLE_KEY` no ambiente (nunca em arquivo do repositório). As senhas
  ficam só em `~/.local/share/maislouvor-review/credentials.json`.
- Asafe, alavancas sem deploy (em `assistant_config`), ambas desligadas por padrão:
  `ai_consent_required_from` (fim da tolerância de quem já usava; sugestão: ~30 dias
  depois do deploy) e `ai_member_consent_required` (encerra a tolerância já).

## Valores a preencher antes do envio às lojas

```sh
node scripts/check-legal-placeholders.mjs   # sai com erro enquanto houver "PREENCHER"
```

Hoje acusa **9** valores, todos em `src/lib/legal.ts`: razão social/nome, CNPJ/CPF,
endereço, e-mail de privacidade (também usado na exclusão por e-mail), e-mail de
suporte, encarregado (DPO), hospedagem e país do datacenter, provedor de e-mail
(SMTP) e prazo de rotação dos backups (escrever como texto: "30 dias"). Se o
datacenter for fora do Brasil, incluir o país na seção de transferência
internacional (`src/content/legal/privacy.ts`).

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

1. **Backup** do banco (como de costume) e o preflight da exclusão.
2. **Migrações** 1 → 4 (e a 0, se a outra sessão publicar antes). Conferir as três
   consultas acima.
3. **Edge functions**: `delete-account` (nova) e `whatsapp-assistant`.
4. **Site**: `louvor-vps/publish.sh` a partir desta branch. Conferir que o fallback de
   SPA abre `/privacidade`, `/termos`, `/suporte` e `/excluir-conta` como já abre
   `/baixar`.
5. **App Android**: o app roda o bundle local, então **precisa de APK novo** (sem
   isso, nada das telas novas chega ao celular). Subir `versionCode`/`versionName` em
   `android/app/build.gradle` (hoje 6 / 1.0.5), `npx cap sync android`, gerar e
   publicar o APK em `/baixar` e, para o Play, o AAB. iOS: quando o projeto for criado.
6. **Conta de revisão** (ver abaixo) e formulários das lojas: Política
   `https://maislouvor.com/privacidade`, Suporte `https://maislouvor.com/suporte`,
   Termos `https://maislouvor.com/termos` (App Store: EULA padrão + este link),
   exclusão de conta (Play) `https://maislouvor.com/excluir-conta`.

Janela de convivência (site novo, APK 1.0.5 ainda instalado):

- No APK 1.0.5 não há pedido de aceite nem exclusão no app; a página pública
  `/excluir-conta` funciona no navegador.
- Líderes no APK 1.0.5 recebem `consent_required` ao gerar código do Asafe (ativações
  existentes continuam); precisam usar o site até o APK novo.
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
- [ ] Dono com membros: "Transfira a propriedade" → escolher, Transferir → liberado; a pessoa vira dona e líder e recebe notificação.
- [ ] Único líder (não dono): "Escolha um novo líder" → Promover.
- [ ] `/excluir-conta` → "Entrar e excluir minha conta" → login → cai na seção de exclusão (também para quem ainda não aceitou os termos).
- [ ] Mensagem com foto denunciada e conta do autor excluída: a denúncia continua com a cópia e o anexo; ao resolver, o anexo some.

**Chat**
- [ ] Toque longo (sem rolar), botão direito e "…": Copiar texto, Denunciar, Bloquear {nome}, Apagar (só nas próprias, ou líder).
- [ ] Denunciar: 7 motivos, detalhes, "Bloquear também"; confirmação com 24 horas. Líder recebe notificação e push (sem o texto).
- [ ] Denúncia sobre um líder: nenhum líder vê; aparece em `/admin/denuncias` como "Sobre a liderança".
- [ ] Bloquear: mensagens recolhidas com Mostrar/Desbloquear; somem da "Atividade da equipe"; lista em Usuários bloqueados.
- [ ] Palavrão vira asteriscos (e "computador", "disputa" não); mensagem acima de 4.000 caracteres é recusada.
- [ ] Usuário › Membros › Denúncias do chat: prazo vencido em vermelho; Em análise / Resolver / Descartar / Apagar mensagem / remover autor (nunca o dono).

**Asafe**
- [ ] Líder de equipe que já usava: aviso ao abrir o app (Concordo e manter ativo / Desativar → confirmação com as consequências).
- [ ] Equipe nova: Gerar código → aviso → "Concordo e ativar" → código; ativar no grupo de teste → boas-vindas com a linha da OpenAI.
- [ ] Membro novo: não é reconhecido até permitir em Usuário › Meu usuário; permitindo, é reconhecido; "Não permitir" (com confirmação) apaga vínculo e histórico.
- [ ] Citar a mensagem de quem não permitiu: a resposta não usa o texto citado.
- [ ] Equipe suspensa: o código é gerado (aviso aparece), a tela avisa que não ativa grupo, e no grupo o bot responde que está suspenso.

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

O pedido foi achar um jeito de manter a importação do YouTube, que é importante. O que
está em jogo:

- **O player do YouTube incorporado** (link da gravação, "Conferir versão", apresentação)
  é permitido nas duas lojas e já está coberto pelos Termos e pela Política.
- **A importação do áudio** (`import-youtube` no editor e `import-song-audio` nos áudios
  adicionais, baixando no servidor) é o motivo mais provável de recusa: Apple 5.2.3 e a
  política de propriedade intelectual do Play recusam apps que salvam mídia do YouTube
  sem autorização, mesmo quando quem baixa é o servidor. Esconder só durante a revisão
  (chave remota) viola a Apple 2.3.1. Texto jurídico não resolve.

Proposta que mantém o serviço para quem usa hoje e deixa os binários das lojas limpos:

1. **Build das lojas sem a importação, decidido na compilação.** Uma variável de build
   (ex.: `VITE_STORE_BUILD=1`) só no bundle enviado à App Store e ao Play esconde o botão
   "Importar áudio da gravação" (e a dica "Use o YouTube para importar") em
   `src/pages/SongEditor.tsx` e a aba "YouTube" em `src/components/SongAudioAttachments.tsx`.
   O campo "Link da gravação" e o player continuam; o áudio entra pelo arquivo da pessoa
   ou pelo Moises.
2. **Site (maislouvor.com) e APK de `/baixar` continuam com tudo.** Quem importa no site
   vê o áudio, as faixas e os loops no app pela mesma conta.
3. No build das lojas, um link de gravação alterado numa música importada pede "Importe
   esta gravação novamente": ali o caminho é enviar o arquivo (que limpa a origem). Vale
   ajustar essa frase no build das lojas.
4. **Risco que continua:** baixar do YouTube no servidor contraria os termos do próprio
   YouTube, mesmo no site. A médio prazo, o caminho mais seguro é arquivo próprio, Moises
   e multitracks licenciados.

Isso não foi implementado nesta branch: muda o que os usuários do app veem e precisa da
sua decisão (seguir com o build das lojas sem a importação, tirar dos apps de vez ou
manter e arriscar a recusa).

## Verificação

Rodado em `/Users/filipecardone/Projetos/Cofre/MaisLouvor-lojas` depois da integração:

- `npx vitest run`: 32 arquivos, 285 testes, todos passando (base: 20/165).
- `npx tsc --noEmit -p tsconfig.app.json`: 9 erros, os mesmos 9 de antes.
- PGlite (`PGLITE_MODULE=…/pglite/dist/index.js node supabase/tests/<arquivo>.mjs`): todas
  as suítes passam, inclusive a nova `lojas_all_migrations.mjs` (as quatro migrações
  juntas, em ordem, duas vezes, sobre o recorte de produção). `whatsapp_notifications_schema.mjs`
  só roda com um dump de produção (como antes).
- `node --test scripts/review-demo/seed.test.mjs`: 22 testes passando.
- `npx vite build`: passa.
- `node scripts/check-legal-placeholders.mjs`: 9 pendências (esperado até o preenchimento).

## Limitações conhecidas

- Ninguém consegue remover o **dono** de uma equipe por denúncia (nem a plataforma) e não
  existe suspensão de conta: a plataforma apaga as mensagens dele e os membros podem
  bloqueá-lo.
- A exceção do pedido de aceite vale para `/app/settings#excluir-conta`: nessa tela a
  pessoa ainda pode mexer nas outras abas de Usuário sem aceitar; ao sair dela, o pedido
  volta.
- O login com Google não leva o `?redirect=` (depois do Google, a pessoa cai no Início).
- O filtro do chat mascara palavras soltas (frases e "p.o.r.r.a" passam) e só mensagens
  novas ou editadas.
- Nomes de quem não permitiu o Asafe continuam nas escalas que a IA recebe quando um
  colega pergunta (dito na Política).
- O app usa "Usuário" nas abas e "Ajustes" em textos antigos (inclusive nas mensagens do
  bot); as páginas legais e `/excluir-conta` usam "Usuário › Meu usuário", que é o que
  aparece na tela.
- iOS: falta o projeto, e o login com Google exige "Iniciar sessão com a Apple" (4.8).
