# Asafe: dados pessoais, IA de terceiros e consentimento

Resumo técnico de como o assistente no WhatsApp (Asafe) trata dados pessoais e
de como funciona o aviso/consentimento exigido pela App Store (5.1.2(i): avisar
com clareza e pedir permissão explícita antes de compartilhar dados com IA de
terceiros) e pela LGPD (consentimento e transferência internacional).

Código: `supabase/functions/whatsapp-assistant/*`, migrações
`20260928120000_whatsapp_assistant.sql`, `20260929120000_assistant_notifications.sql`,
`20260930120000_assistant_missions.sql` e `20261003133000_assistant_ai_consent.sql`.

## Quem participa

| Peça | Onde roda | Papel |
| --- | --- | --- |
| WhatsApp (Meta) | — | os grupos do ministério |
| Evolution API | VPS própria (instância `maislouvor`) | recebe/manda mensagens do número do assistente |
| Edge function `whatsapp-assistant` | Supabase self-hosted | decide se responde, monta o pedido à IA, envia avisos |
| Postgres (Supabase) | VPS própria | equipes, escalas, identidades, histórico curto |
| **OpenAI (Estados Unidos)** | terceiro | Responses API: gera as respostas e escolhe as ferramentas |

## Fluxo

1. **Ativação da equipe.** Um líder gera um código no app
   (`assistant_create_activation_code`, 24 h, uso único) e manda
   `@Asafe ativar CÓDIGO` no grupo. A edge function chama
   `assistant_activate_group`, que liga o grupo (`group_jid`) à equipe.
   Desde 03/10/2026 as duas RPCs exigem o aceite do aviso de IA pela equipe
   (`team_activation`, versão atual).
2. **Quem está falando.** `assistant_resolve_sender` compara os ids do
   remetente (telefone e/ou `@lid`) com `profiles.phone` dos membros **daquela
   equipe** e guarda o par em `assistant_wa_identities` (fonte `phone`). Quando o
   WhatsApp esconde o número, a pessoa gera um código em Ajustes › Meu usuário
   (`assistant_create_link_code`) e manda `vincular CÓDIGO` no privado do
   assistente (`assistant_link_identity`, fonte `code`). Desde 03/10/2026 só é
   reconhecido quem permite o uso dos dados (`member_link`, ver abaixo), e o
   vínculo por código exige esse aceite.
3. **Pergunta.** Só mensagens que marcam o assistente (ou respondem a ele) são
   tratadas; o resto do grupo é ignorado sem gravar nada. Com limite diário
   disponível, a edge function chama a OpenAI (`openai.ts`).
4. **Resposta.** O texto volta ao grupo pela Evolution, citando a pergunta.

## O que vai para a OpenAI

Responses API com `store: false` (a conversa não é guardada para continuação na
OpenAI; o histórico curto mora no nosso banco), `safety_identifier` = hash
SHA-256 do id do perfil (nunca o nome ou telefone) e `prompt_cache_key` fixo.

- **Instruções**: regras fixas do assistente + data/hora, nome da equipe,
  **nome completo, papel e funções de quem pergunta** e o texto livre que o
  líder escreveu em "Instruções do ministério".
- **Histórico**: até `history_turns` (padrão 4) trocas da mesma pessoa no mesmo
  grupo, das últimas `history_minutes` (padrão 180).
- **Mensagem**: o texto da pessoa, sem a menção ao assistente e com menções a
  outras pessoas trocadas por `@pessoa` (nenhum número vai). Se ela responder a
  uma mensagem de outra pessoa, o texto citado (até 500 caracteres) só vai,
  marcado como contexto, quando o autor é exatamente um membro da equipe que
  permite o uso dos dados (`assistant_quote_author_allowed`, sem gravar nada;
  `@lid` sem vínculo é resolvido pela lista do grupo). Senão vai só uma nota de
  que há uma citação não compartilhada. Erro na consulta = não vai.
- **Resultados das ferramentas** (JSON, sempre presos à equipe do grupo e às
  permissões do app): escalas e funções de quem pergunta; agenda de cultos;
  escala completa do culto **com nomes e confirmação**, roteiro, músicas, tons,
  BPM, links, observações e vozes **com nomes**; busca de músicas;
  disponibilidade da equipe num dia **com nomes** (sem motivo); a própria
  disponibilidade (sem motivo); missões do grupo (líderes); resultado das ações
  (confirmar/recusar escala, marcar disponibilidade, missões).
- **Nunca vão**: telefone, e-mail, ids do WhatsApp, motivo de indisponibilidade.

Avisos automáticos (cultos, escalas, repertório, avisos do líder, lembrete da
véspera) e missões agendadas **não usam IA**: o texto é montado no código
(`notifications.ts`) e sai direto pela Evolution. As menções (@) usam o
telefone/`@lid` conhecido.

## O que fica gravado no +Louvor

| Tabela | Conteúdo | Prazo |
| --- | --- | --- |
| `assistant_messages` | pergunta (até 2000 caracteres, **sem** o texto citado de outra pessoa) e resposta (até 4000), perfil, grupo, tokens | 30 dias (`assistant_purge`, roda em ~1% das mensagens novas — a limpeza pode atrasar em grupos com pouco uso) |
| `assistant_inbound_seen` | só ids de mensagens (deduplicação) | 3 dias |
| `assistant_activation_codes` / `assistant_link_codes` | códigos | 7 dias após uso/vencimento |
| `assistant_wa_identities` | id do WhatsApp → perfil | até desvincular, desligar o uso dos dados ou mudar o telefone |
| `assistant_usage_daily` / `assistant_member_usage_daily` | contadores e tokens (sem conteúdo) | sem prazo |
| `assistant_outbox` | avisos a enviar (nomes e funções da escala) | 30 dias após concluir |
| `assistant_mission_requests` / `assistant_missions` | pedidos e textos das missões | 90 dias / até cancelar |
| `assistant_ai_consents` | aceites e revogações (versão do texto, datas) | histórico permanente; sem dado pessoal após excluir a conta (`profile_id` vira null) |
| `assistant_ai_legacy_members` | equipe + perfil de quem já usava o Asafe quando o aviso chegou (tolerância) | até a pessoa decidir, o líder desativar pelo app ou a conta/equipe ser excluída |

Logs da edge function: erros sem payload; "chamado em grupo não ativado"
registra até 80 caracteres do texto da mensagem.

## Consentimento (20261003133000)

- **Versão do texto**: `assistant_ai_consent_version()` no banco e
  `ASSISTANT_AI_CONSENT_VERSION` em `src/lib/assistantAiConsent.ts` (hoje
  `2026-10-03`). O banco recusa aceite de outra versão (`outdated_version`).
  Para mudar o texto: nova data nos dois lugares, numa migração nova.
- **`team_activation`** (líder, por equipe): aceito no diálogo antes do primeiro
  código. Sem ele não se gera código nem se ativa grupo (`consent_required`).
  Revogar (`revoke_assistant_consent('team_activation', equipe)`) desliga o
  assistente em todos os grupos da equipe (missões pausam, avisos param).
- **`member_link`** (pessoa, **opt-in**): o interruptor "Permitir que o Asafe
  use meus dados" só aparece ligado com esse aceite, que também é exigido antes
  de vincular por código. Sem ele o assistente não reconhece a pessoa (fica
  "desconhecida", sem IA), não a marca (@) nos avisos e a tira das listas de
  disponibilidade enviadas à IA (a ferramenta informa só quantas pessoas ficaram
  de fora). Nas escalas e nas vozes do roteiro que vão para a IA
  (`assistant_culto_details`), a pessoa aparece **sem nome** (função, confirmação
  e voz ficam), com um aviso para a IA não adivinhar. No app e nos avisos
  automáticos do grupo (que não passam pela IA), o nome continua. Dois perfis com o mesmo número continuam "ambíguos": o
  assistente nunca troca uma pessoa pela outra. Regra única no banco:
  `assistant_member_ai_allowed(equipe, perfil)`.
- **Não permitir / desligar** grava a pessoa em `assistant_ai_opt_outs` (fora de
  `profiles`, que a equipe inteira lê; só as RPCs leem a tabela),
  apaga os vínculos do WhatsApp, os códigos pendentes e o histórico da pessoa
  em `assistant_messages`. No app, sempre depois de uma confirmação que diz isso.
- **Tolerância de quem já usava**: quem estava numa equipe com grupo ativo
  quando a migração rodou pela primeira vez (`assistant_ai_legacy_members`, foto
  única) — ou aceitou um texto anterior e não revogou — continua reconhecido até
  decidir. O app mostra o interruptor **desligado** com "Você ainda não
  decidiu… ainda reconhece você pelo telefone" e os botões para permitir ou "Não
  permitir". Quem entra numa equipe depois, ou numa equipe ativada depois,
  precisa permitir. Desativar o Asafe pelo app (revogar a equipe) encerra a
  tolerância daquela equipe.
- **Equipes que já usavam o Asafe** (grupo ativo sem aceite da versão atual):
  estado `pending`. O assistente continua funcionando; os líderes veem, ao abrir
  o app e em Ajustes › Equipe, um aviso que só sai com "Concordo e manter
  ativo" ou "Desativar" (com confirmação que lista as consequências: todos os
  grupos, missões pausadas, reativar com código em cada grupo). Membros de
  equipes ativas que ainda não decidiram veem o aviso de membro ao abrir o app
  (permitir / não permitir); fechar só adia até a próxima abertura.
- **Equipe suspensa pela plataforma** (`assistant_team_settings.enabled = false`,
  ex.: as equipes de revisão das lojas): o líder ainda gera o código (e vê o
  aviso de IA), mas `assistant_activate_group` responde `team_suspended` e nenhum
  grupo é ligado; o bot responde que está suspenso e a tela avisa embaixo do botão.
- **Alavancas da plataforma** (em `assistant_config`, sem tela):
  - `ai_consent_required_from`: fim das tolerâncias. A partir dessa data as
    equipes `pending` ficam `blocked` — o assistente não chama a IA e responde
    pedindo a confirmação do líder no app — e quem só tinha a tolerância deixa
    de ser reconhecido. A migração põe **30 dias depois da primeira aplicação**
    (rodar de novo não muda uma data definida); no deploy, ajustar para a data do
    APK novo + 14 dias. `null` = sem prazo (não usar em produção).
  - `ai_member_consent_required`: `true` = encerra já a tolerância das pessoas
    (só reconhece quem permitiu no app). `false` (padrão) = tolerância até
    decidir ou até `ai_consent_required_from`.

- **Linha de transparência** (OpenAI) nos grupos: vai no boas-vindas da ativação e
  na ajuda. Grupos que já estavam ativos antes do aviso recebem a linha **uma vez**,
  junto com a primeira resposta depois do deploy (`assistant_groups.ai_disclosure_version`,
  marcada por `assistant_claim_ai_disclosure`; não entra no histórico da conversa).

Aplicar a migração: ela usa `lock_timeout = 3s` para os `ALTER TABLE` em
`assistant_config` e `assistant_groups`. Se der timeout (uma transação longa segurando a
tabela), basta rodar de novo; é idempotente e a foto da tolerância só é tirada
na primeira execução completa.

## Limitações conhecidas

- Num banco ainda sem esta migração (edge function publicada antes), a citação
  vai como antes: não há consentimento algum para conferir.
- Nomes de quem não permitiu ou desligou continuam nas escalas/roteiros enviados à IA quando
  alguém pergunta pela escala de um culto (necessários para responder).
- A frase sobre a retenção na OpenAI (até 30 dias para segurança, sem
  treinamento) segue a política pública da API e precisa ser conferida pelo
  jurídico a cada versão do aviso.
