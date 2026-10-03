# Moderação do chat

Exigência das lojas para conteúdo gerado por usuários (App Store 1.2; Google Play,
política de UGC): filtrar conteúdo ofensivo, permitir denunciar e bloquear, e agir
sobre as denúncias em até 24 horas.

Migration: `supabase/migrations/20261003132000_chat_moderation.sql`
(depende de `20260930010000_platform_admin_and_support.sql`).
Teste: `supabase/tests/chat_moderation.mjs` (PGlite).

## O que a pessoa vê no chat

- **Toque longo** na mensagem (celular), clique direito ou botão **…** ao passar o
  mouse (computador): *Copiar texto*, *Denunciar*, *Bloquear {nome}* e *Apagar*.
- *Apagar* aparece nas próprias mensagens e, para líderes, em qualquer mensagem da equipe.
- Denúncia: motivo (7 opções), detalhes opcionais e, se quiser, bloquear junto.
  Confirmação: "Recebemos sua denúncia. A liderança e a equipe do +Louvor vão
  analisar em até 24 horas." Quem foi denunciado não é avisado.
- Mensagens de quem a pessoa bloqueou aparecem recolhidas ("Mensagem de usuário
  bloqueado"), com *Mostrar* e *Desbloquear*, e somem da "Atividade da equipe" no
  Início. Lista completa em Usuário › Meu usuário › **Usuários bloqueados**.
- Mensagens de texto têm no máximo 4.000 caracteres (o compositor e o banco limitam).

## Quem analisa

| Quem | Onde | Recebe aviso |
|---|---|---|
| Liderança da equipe (papel `admin`) | Usuário › Membros › **Denúncias do chat** | Notificação no app + push |
| Administradores da plataforma | Gerenciador › **Denúncias** (`/admin/denuncias`) | Notificação no app + push (texto fixo, também nas denúncias sobre a liderança) |

- O aviso traz o nome da equipe, e o link (`/app/settings?aba=membros&equipe=<id>`)
  troca para a equipe da denúncia antes de abrir a aba Membros.
- Denúncias sobre alguém da liderança (papel `admin` ou responsável pela equipe, no
  momento da denúncia: `chat_reports.platform_only`) ficam **só com a plataforma**:
  nenhum líder vê, é avisado ou fecha — líderes não julgam uns aos outros.
- Ações: *Em análise*, *Resolver* (anotação interna e, opcionalmente, remover o autor
  da equipe — nunca o responsável pela equipe), *Descartar* e *Apagar mensagem*.
- Só a plataforma: **Suspender conta** / *Reativar conta* (na denúncia e em
  Contas › equipe › Membros), pela edge function `platform-suspend-account`: banimento
  no GoTrue (não entra nem renova a sessão; o token aberto vale até 1 hora), registro
  em `platform_account_suspensions` e no histórico (`account_suspend`,
  `account_reactivate`). Para afastar um **responsável** que abusa: suspender e, em
  Contas › equipe › Membros, **Tornar responsável** outro membro
  (`platform_transfer_team_ownership`); depois a moderação pode removê-lo da equipe.
- Push para a plataforma: o app manda `chat_report_id` ao `send-push`, que pergunta ao
  banco (`chat_report_platform_push_targets`: só a denúncia de quem chama, recente e
  uma vez) quem administra. O app não sabe quem são os administradores.
- Ao encerrar, quem denunciou recebe "Sua denúncia foi analisada", sem detalhes. Pela
  tabela, quem denunciou só lê o status das próprias denúncias: anotação, quem resolveu
  e a cópia da mensagem só saem por `list_chat_reports`, para quem modera.
- Ações da plataforma ficam em `platform_audit_log`
  (`chat_report_update`, `chat_message_delete`, `account_suspend`, `account_reactivate`,
  `team_ownership_transfer` com `by_platform`).
- Denúncias abertas há mais de 24 horas aparecem como **Prazo vencido**.

## Provas

A denúncia guarda uma cópia da mensagem (texto, tipo e caminho do anexo). Enquanto a
denúncia estiver aberta ou em análise, o anexo não pode ser apagado nem movido pelo
Storage — nem pelo autor, nem pela liderança, nem pela plataforma (policy RESTRICTIVE
em `storage.objects`). Ao resolver ou descartar, o app apaga o arquivo que não for mais
prova de nada.

As funções dessas policies (`chat_media_team_id`, `chat_media_is_reported`,
`chat_media_has_open_report`) ficam no schema `private`, fora da API do PostgREST:
ninguém pergunta por RPC se existe denúncia sobre um arquivo. Quem apaga a própria
mensagem denunciada recebe a mesma resposta de uma mensagem sem anexo (o arquivo fica
para a moderação); `keep_attachment` só vai para a liderança e a plataforma.

O caminho do anexo (`messages.attachment_path`) é gravado pelo cliente, então o banco
(gatilho `chat_guard_attachment_path`) exige a pasta da equipe da mensagem e um
arquivo por mensagem: ninguém aponta uma mensagem para o arquivo de um colega — que
seria apagado como se fosse dele (exclusão de conta, Apagar) ou ficaria preso como
"prova".

Exclusão de conta (`20261003130000_account_deletion.sql`): as denúncias continuam,
sem a ligação com a conta (`reporter_profile_id`/`reported_profile_id` viram NULL) e
com a cópia da mensagem; a mensagem sai em cascata (`message_deleted_role =
'sistema'`). O anexo que é prova de denúncia em aberto **não** entra na fila de
arquivos da exclusão (`account_deletion_storage_objects`): fica até a denúncia ser
encerrada, e então `moderate_chat_report` devolve `attachment_to_remove` como em
qualquer mensagem apagada. Os bloqueios da pessoa (feitos por ela ou contra ela)
saem em cascata. Teste: `supabase/tests/lojas_all_migrations.mjs`.

## Filtro de palavras

Trigger em `messages` troca por asteriscos palavras inteiras da tabela
`chat_blocked_terms` (sem diferenciar maiúsculas e acentos; pega plural, letras
repetidas e números no lugar de letras). Palavras que só contêm o termo
(*computador*, *disputa*, *cuidado*) não são afetadas. Termos ambíguos ficaram de fora
(*veado*, *macaco*, *bicha*, *retardado* — "efeito retardado"...). Acentos digitados
separados (combinantes) também são reconhecidos.

O mesmo filtro vale para os avisos escritos por alguém (`notifications` com
remetente, como "Enviar aviso ao time"); os do sistema não passam por ele. Avisos de
quem você bloqueou não aparecem no sino.

Para incluir um termo (sem acento, minúsculo; vale para mensagens novas):

```sql
INSERT INTO public.chat_blocked_terms(term) VALUES ('novotermo');
```

## Limites

- 10 denúncias por pessoa por hora; denunciar de novo a mesma mensagem não duplica.
- Só dá para bloquear quem está em alguma equipe em comum.
- O responsável pela equipe não é removido dela por uma denúncia: a plataforma
  suspende a conta e passa a propriedade a outro membro (ver "Quem analisa").
- Avisos ("Enviar aviso ao time") ainda não têm "Denunciar" no sino; o filtro (no
  aviso e no push, que o `send-push` também mascara) e o bloqueio valem para eles.
