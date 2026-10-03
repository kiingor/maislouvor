# Conta de revisão das lojas

Script que cria (e recria) a conta usada por quem revisa o app na App Store
(Diretriz 2.1, "Sign-in required") e no Google Play ("App access"). O revisor
entra como **líder** de uma equipe fictícia já populada, sem nenhum dado real e
com o Asafe desligado.

> **Atenção:** `--apply` e `--reset` gravam em **produção** com a chave
> `service_role`. Quem roda é você, na sua máquina. O agente que preparou o
> script nunca o executou contra um servidor.

## O que é criado

| Item | Conteúdo |
| --- | --- |
| Líder | `revisao@maislouvor.com` · "Líder Demonstração" · admin e dono da equipe · senha aleatória |
| Membros | `membro1.revisao@` a `membro4.revisao@maislouvor.com` (Ana, Bruno, Carla e Davi Exemplo) · editor/viewer · **sem senha** (não fazem login), sem telefone, sem push, sem WhatsApp |
| Equipe | "Igreja Demonstração (App Review)" · Asafe não ativado (sem grupo), suspenso na equipe (`assistant_team_settings.enabled = false`) e com os avisos automáticos desligados |
| Músicas | 5 originais da "Equipe Demonstração" (letra, cifra e guia de áudio sintetizado, escritos para esta demonstração) + **Baby Bird (demo)**, multitrack de Admiral Bob (CC BY 3.0) com 5 faixas no mixer. Todas com os seis campos do cadastro (nome, artista, tom, tema, cifra e áudio), então aparecem no catálogo |
| Repertório | "Repertório da Demonstração" com as 6 músicas |
| Cultos | Dois domingos futuros (o primeiro a pelo menos 3 dias da execução), com roteiro, escala (confirmados e pendentes), tom por culto, vozes e uma observação |
| Disponibilidade | 7 registros dos membros nas datas dos cultos (inclui uma indisponibilidade com motivo) |
| Chat | 8 mensagens em "Geral" e 3 no canal "Ensaios", enviadas pelos membros fictícios (servem para testar denunciar/bloquear) |
| Loops | 2 loops públicos com anotação na Baby Bird |
| Avisos | 2 notificações no sino do líder |

Arquivos no bucket `audio` (11, ~10 MB): os guias em WAV são gerados na hora a
partir de `data.mjs`; a Baby Bird usa os arquivos de `assets/baby-bird/`
(mesmos da landing, conferidos pelo `sha256` de `credits.json`, mais a mixagem
`mix.m4a` — ver `assets/baby-bird/NOTICE.txt`). As faixas ficam em
`<equipe>/<música>/stems/`, o mesmo caminho das faixas separadas pelo app: se o
revisor pedir uma nova separação, ela substitui estas em vez de duplicar.

Nenhum e-mail é enviado: as contas são criadas com
`auth.admin.createUser({ email_confirm: true })`. Todas levam
`app_metadata.review_demo = true` (só a `service_role` altera esse campo). Não há
migração nova: a equipe é identificada pelo dono (uma conta marcada) e pelo nome.

## Como rodar

Da raiz do repositório, com o `node_modules` já instalado:

```sh
# 1. Simulação (padrão): imprime o plano completo. Não usa a rede nem grava nada.
node scripts/review-demo/seed.mjs

# 2. Criar a conta (produção)
SUPABASE_URL=https://api.maislouvor.com \
SUPABASE_SERVICE_ROLE_KEY=<chave service_role> \
node scripts/review-demo/seed.mjs --apply --yes

# 3. Recriar do zero (apaga a equipe e as contas de revisão e cria de novo)
SUPABASE_URL=https://api.maislouvor.com \
SUPABASE_SERVICE_ROLE_KEY=<chave service_role> \
node scripts/review-demo/seed.mjs --reset --yes
```

Opções: `--new-password` (gera outra senha em vez de reaproveitar a do arquivo) e
`--credentials <caminho>` (outro arquivo de credenciais, nunca dentro do
repositório).

Dica: para a chave não ficar no histórico do shell, use `read -s` e `export`:

```sh
read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY
```

O script recusa `--apply`/`--reset` sem `--yes`, sem `https://` em
`SUPABASE_URL` ou sem a chave — antes de qualquer acesso à rede.

## Onde fica a senha

Somente em `~/.local/share/maislouvor-review/credentials.json` (diretório `700`,
arquivo `600`). O terminal mostra só o caminho; a senha e a chave são mascaradas
em qualquer mensagem. O arquivo guarda também o id da equipe, para o `--reset`
limpar o Storage dela.

```sh
cat ~/.local/share/maislouvor-review/credentials.json
```

Copie e-mail e senha para o App Store Connect (App Review Information → Sign-in
required) e para o Play Console (Conteúdo do app → Acesso ao app). Os textos em
inglês estão em `docs/lojas/notas-revisao.md`.

O `--reset` **reaproveita a mesma senha** do arquivo, para as credenciais
cadastradas nas lojas continuarem válidas. Use `--new-password` só se quiser
trocá-la (e atualize as duas lojas depois).

## Depois de cada revisão

Rode `--reset --yes` antes de cada envio para revisão e depois de cada resposta
das lojas — **nunca enquanto uma revisão está em andamento** (o reset apaga e
recria a conta, e a sessão do revisor cairia):

- as datas dos cultos são relativas ao dia da execução e envelhecem;
- o revisor pode ter apagado, editado ou enviado coisas (inclusive excluído a
  conta pelo app — o reset recria tudo, e limpa o Storage da equipe antiga pelo id
  guardado no arquivo).

## Idempotência e segurança

- `--apply` com tudo já criado não faz nada. Se só parte existir (execução
  interrompida), ele para e pede `--reset`.
- A senha é gravada no arquivo **antes** de a conta ser criada; se algo falhar no
  meio, ela não se perde.
- O reset só apaga contas com os e-mails fixos **e** a marca `review_demo`, e só
  equipes cujo dono é uma dessas contas. Se um desses e-mails pertencer a uma
  conta sem a marca, nada é apagado.
- A equipe é apagada antes das contas: na base atual, apagar o dono direto esbarra
  nas FKs sem `ON DELETE` (`songs.created_by`, `culto_songs.notes_author_id`…).
- Storage limpo no reset: `audio/`, `covers/` e `chat/` da equipe e `avatars/` das
  contas de revisão.

## Testes

```sh
node --test scripts/review-demo/seed.test.mjs
PGLITE_MODULE=/caminho/@electric-sql/pglite/dist/index.js node supabase/tests/review_demo_seed.mjs
```

O primeiro confere os dados (nada de telefone, CPF, e-mail fora da lista ou link do
YouTube; músicas completas; datas futuras em qualquer dia da semana; WAV válido),
a CLI (recusas, simulação sem rede) e o fluxo apply/reset num store em memória,
com o console capturado para garantir que a senha e a chave nunca aparecem. O
segundo roda o mesmo fluxo contra o schema de produção em memória (PGlite): FKs,
CHECKs, catálogo (`search_song_catalog`), Asafe suspenso e reset sem tocar em
dados de outras pessoas.
