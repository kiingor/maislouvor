# Contas de revisão das lojas

Script que cria (e recria) as contas usadas por quem revisa o app na App Store
(Diretriz 2.1, "Sign-in required") e no Google Play ("App access"). O revisor
entra como **líder** de uma equipe fictícia já populada, sem nenhum dado real e
com o Asafe disponível para ativação manual, sem grupo conectado e sem avisos automáticos.

São **duas contas independentes, uma por loja**. Apple e Google costumam revisar
ao mesmo tempo, e as notas convidam o revisor a testar a exclusão de conta: com uma
conta só, a exclusão feita pela Apple derrubaria o login do Google (e vice-versa).

> **Atenção:** `--apply` e `--reset` gravam em **produção** com a chave
> `service_role`. Quem roda é você, na sua máquina. O agente que preparou o
> script nunca o executou contra um servidor.

## O que é criado

| Loja | `--store` | Líder (login) | Membros | Equipe |
| --- | --- | --- | --- | --- |
| App Store | `apple` | `revisao@maislouvor.com` | `membro1.revisao@` a `membro4.revisao@maislouvor.com` | "Igreja Demonstração (App Review)" |
| Google Play | `google` | `revisao.google@maislouvor.com` | `membro1.revisao.google@` a `membro4.revisao.google@maislouvor.com` | "Igreja Demonstração (Play Review)" |

Cada equipe recebe o mesmo conteúdo:

| Item | Conteúdo |
| --- | --- |
| Líder | "Líder Demonstração" · admin e dono da equipe · senha aleatória (uma por loja) |
| Membros | Ana, Bruno, Carla e Davi Exemplo · Ana é editora, os outros são membros (viewer) · **sem senha** (não fazem login), sem telefone, sem push, sem WhatsApp |
| Asafe | Disponível para ativação manual (`assistant_team_settings.enabled = true`), sem grupo conectado e com os avisos automáticos desligados |
| Músicas | 5 originais da "Equipe Demonstração" (letra, cifra e guia de áudio sintetizado, escritos para esta demonstração) + **Baby Bird (demo)**, multitrack de Admiral Bob (CC BY 3.0) com 5 faixas no mixer. Todas com os seis campos do cadastro (nome, artista, tom, tema, cifra e áudio), então aparecem no catálogo |
| Repertório | "Repertório da Demonstração" com as 6 músicas |
| Cultos | Dois domingos futuros (o primeiro a pelo menos 3 dias da execução), com roteiro, escala (confirmados e pendentes), tom por culto, vozes e uma observação |
| Disponibilidade | 7 registros dos membros nas datas dos cultos (inclui uma indisponibilidade com motivo) |
| Chat | 8 mensagens em "Geral" e 3 no canal "Ensaios", enviadas pelos membros fictícios (servem para testar denunciar/bloquear) |
| Loops | 2 loops públicos com anotação na Baby Bird |
| Avisos | 2 notificações no sino do líder |

Arquivos no bucket `audio` (11 por equipe, ~10 MB): os guias em WAV são gerados na
hora a partir de `data.mjs`; a Baby Bird usa os arquivos de `assets/baby-bird/`
(mesmos da landing, conferidos pelo `sha256` de `credits.json`, mais a mixagem
`mix.m4a` — ver `assets/baby-bird/NOTICE.txt`). As faixas ficam em
`<equipe>/<música>/stems/`, o mesmo caminho das faixas separadas pelo app: se o
revisor pedir uma nova separação, ela substitui estas em vez de duplicar.

Nenhum e-mail é enviado: as contas são criadas com
`auth.admin.createUser({ email_confirm: true })`. Todas levam
`app_metadata.review_demo = true` (só a `service_role` altera esse campo). Não há
migração nova: a equipe é identificada pelo dono (uma conta marcada) e pelo nome.

## Pré-requisitos

Rode o script **depois** de publicar no banco de produção:

1. As migrações das quais as linhas dependem (além do schema de 27/09):
   - `20260927120000_song_loop_notes.sql` (anotação dos loops);
   - `20260928120000_whatsapp_assistant.sql` e
     `20260929120000_assistant_notifications.sql` (Asafe disponível, sem grupo e com avisos desligados);
   - `20260930200000_song_registration_catalog.sql` (cadastro de músicas:
     `is_draft`, `recording_source_url`, `audio_revision`, `draft_repertorio_ids`).
2. As entregas de conformidade das lojas (exclusão de conta, páginas legais e
   aceite dos termos, moderação do chat, consentimento do Asafe) — no banco, nas
   edge functions, no site e nos apps enviados. O seed não depende delas, mas as
   notas de revisão descrevem essas telas.

O script confere o item 1 sozinho: antes de criar qualquer conta ele lê (sem
trazer linhas) cada coluna que vai gravar. Se faltar alguma, para com uma lista
como esta e **não grava nada**:

```text
Falhou: O banco ainda não tem o schema que o seed grava:
  - songs: colunas audio_revision, draft_repertorio_ids, is_draft, recording_source_url → 20260930200000_song_registration_catalog.sql
```

Se a migração acabou de ser aplicada e a gravação falhar com "schema cache",
recarregue o cache do PostgREST (`NOTIFY pgrst, 'reload schema';`) e rode
`--reset --yes --store <loja>`.

## Como rodar

Da raiz do repositório, com o `node_modules` já instalado:

```sh
# 1. Simulação (padrão): imprime o plano completo. Não usa a rede nem grava nada.
node scripts/review-demo/seed.mjs

# 2. Criar as contas que faltam (produção): as duas lojas, ou só uma com --store
SUPABASE_URL=https://api.maislouvor.com \
SUPABASE_SERVICE_ROLE_KEY=<chave service_role> \
node scripts/review-demo/seed.mjs --apply --yes

# 3. Recriar do zero a conta de UMA loja (apaga a equipe e as contas dela e cria de novo)
SUPABASE_URL=https://api.maislouvor.com \
SUPABASE_SERVICE_ROLE_KEY=<chave service_role> \
node scripts/review-demo/seed.mjs --reset --yes --store google
```

Opções: `--store apple|google|all` (no `--apply` o padrão é `all`; no `--reset` é
obrigatório), `--new-password` (gera outra senha em vez de reaproveitar a do
arquivo) e `--credentials <caminho>` (outro arquivo de credenciais, nunca dentro do
repositório).

Dica: para a chave não ficar no histórico do shell, use `read -s` e `export`:

```sh
read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY
```

O script recusa `--apply`/`--reset` sem `--yes`, sem `https://` em
`SUPABASE_URL`, sem a chave ou (no reset) sem `--store` — antes de qualquer acesso
à rede.

## Onde ficam as senhas

Somente em `~/.local/share/maislouvor-review/credentials.json` (diretório `700`,
arquivo `600`), uma entrada por loja:

```sh
cat ~/.local/share/maislouvor-review/credentials.json
# { "accounts": { "apple": { "email": ..., "password": ..., "team_id": ... }, "google": { ... } } }
```

O terminal mostra só o caminho; as senhas e a chave são mascaradas em qualquer
mensagem. Cada entrada guarda também o id da equipe, para o `--reset` limpar o
Storage dela.

Copie e-mail e senha de `accounts.apple` para o App Store Connect (App Review
Information → Sign-in required) e de `accounts.google` para o Play Console
(Conteúdo do app → Acesso ao app). Os textos em inglês estão em
`docs/lojas/notas-revisao.md`.

> **Nunca** cole a senha em `docs/lojas/notas-revisao.md` nem em outro arquivo do
> repositório: preencha os marcadores direto nos formulários das lojas. Uma senha
> commitada fica no histórico do git.

O `--reset` **reaproveita a mesma senha** da loja, para as credenciais cadastradas
continuarem válidas. Use `--new-password` só se quiser trocá-la (e atualize a loja
depois).

## Antes e depois de cada revisão

Trate as duas lojas separadamente:

- **Antes de enviar** para uma loja: `--reset --yes --store <loja>`. As datas dos
  cultos são relativas ao dia da execução e envelhecem.
- **Durante a revisão** de uma loja, **não** rode o reset dela (a sessão do
  revisor cairia e os dados que ele está vendo sumiriam). O reset da outra loja
  pode rodar à vontade: nada é compartilhado.
- **Depois de cada resposta** da loja (aprovação, rejeição ou pergunta): rode o
  reset dela antes de responder ou reenviar. O revisor pode ter apagado, editado ou
  enviado coisas — inclusive excluído a conta pelo app, depois de transferir a
  equipe para a Ana. O reset também cobre esse caso: apaga a equipe transferida
  (a dona é uma conta de revisão), as contas restantes e o Storage da equipe antiga
  pelo id guardado no arquivo, e recria tudo com a mesma senha.
- **Denúncias** que o revisor fizer no chat chegam à plataforma (Gerenciador →
  Denúncias, `/admin/denuncias`) e ao sino dos administradores. Resolva ou descarte
  como qualquer outra; o reset apaga as denúncias junto com a equipe.

## Idempotência e segurança

- `--apply` com tudo já criado não faz nada. Se só parte existir (execução
  interrompida ou conta excluída pelo revisor), ele para e pede `--reset`.
- O schema é conferido antes de qualquer gravação (ver Pré-requisitos).
- A senha é gravada no arquivo **antes** de a conta ser criada; se algo falhar no
  meio, ela não se perde.
- O reset só apaga contas com os e-mails fixos da loja **e** a marca
  `review_demo`, e só equipes cujo dono é uma dessas contas. Se um desses e-mails
  pertencer a uma conta sem a marca, nada é apagado.
- A equipe é apagada antes das contas: com a exclusão de conta
  (`20261003130000_account_deletion.sql`), `teams.owner_id` é `RESTRICT` e apagar
  o dono direto falha (antes, esbarrava nas FKs sem `ON DELETE`, como
  `songs.created_by`).
- Storage limpo no reset: `audio/`, `covers/` e `chat/` da equipe e `avatars/` das
  contas de revisão.

## Testes

```sh
node --test scripts/review-demo/seed.test.mjs
PGLITE_MODULE=/caminho/@electric-sql/pglite/dist/index.js node supabase/tests/review_demo_seed.mjs
```

O primeiro confere os dados (nada de telefone, CPF, e-mail fora da lista ou link do
YouTube; músicas completas; datas futuras em qualquer dia da semana; WAV válido),
a CLI (recusas, simulação sem rede, `--store`) e o fluxo apply/reset num store em
memória — inclusive o preflight de schema e a exclusão da conta da Apple sem afetar
a do Google —, com o console capturado para garantir que as senhas e a chave nunca
aparecem. O segundo roda o mesmo fluxo contra o schema de produção em memória
(PGlite), já com as migrações da conformidade (`20261003*`): preflight recusando
o schema sem o cadastro de músicas, FKs, CHECKs, catálogo (`search_song_catalog`),
Asafe disponível sem grupo, a exclusão como o revisor faz (transferir para a Ana e excluir
pela RPC) e reset sem tocar em dados de outras pessoas nem da outra loja.


### Atualização da conformidade (07/10/2026)

A demo não suspende mais o Asafe na equipe: o revisor pode abrir o aviso, consentir e gerar o código pelo fluxo real. O seed não registra consentimento por ele, não conecta grupos e não envia mensagens. Para demonstrar o WhatsApp de ponta a ponta, ainda são necessários um grupo de teste controlado e a configuração real do bot; isso deve constar nas notas de revisão. Antes de executar o seed, aplique também as migrações de conformidade de 07/10 e configure os provedores. O roteiro completo está em `docs/lojas/correcoes-conformidade-20261007.md`.
