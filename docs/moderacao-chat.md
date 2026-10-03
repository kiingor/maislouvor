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
| Administradores da plataforma | Gerenciador › **Denúncias** (`/admin/denuncias`) | Notificação no app |

- O aviso traz o nome da equipe, e o link (`/app/settings?aba=membros&equipe=<id>`)
  troca para a equipe da denúncia antes de abrir a aba Membros.
- Denúncias sobre alguém da liderança (papel `admin` ou responsável pela equipe, no
  momento da denúncia: `chat_reports.platform_only`) ficam **só com a plataforma**:
  nenhum líder vê, é avisado ou fecha — líderes não julgam uns aos outros.
- Ações: *Em análise*, *Resolver* (anotação interna e, opcionalmente, remover o autor
  da equipe — nunca o responsável pela equipe), *Descartar* e *Apagar mensagem*.
- Ao encerrar, quem denunciou recebe "Sua denúncia foi analisada", sem detalhes. Pela
  tabela, quem denunciou só lê o status das próprias denúncias: anotação, quem resolveu
  e a cópia da mensagem só saem por `list_chat_reports`, para quem modera.
- Ações da plataforma ficam em `platform_audit_log`
  (`chat_report_update`, `chat_message_delete`).
- Denúncias abertas há mais de 24 horas aparecem como **Prazo vencido**.

## Provas

A denúncia guarda uma cópia da mensagem (texto, tipo e caminho do anexo). Enquanto a
denúncia estiver aberta ou em análise, o anexo não pode ser apagado nem movido pelo
Storage — nem pelo autor, nem pela liderança, nem pela plataforma (policy RESTRICTIVE
em `storage.objects`). Ao resolver ou descartar, o app apaga o arquivo que não for mais
prova de nada.

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

Para incluir um termo (sem acento, minúsculo; vale para mensagens novas):

```sql
INSERT INTO public.chat_blocked_terms(term) VALUES ('novotermo');
```

## Limites

- 10 denúncias por pessoa por hora; denunciar de novo a mesma mensagem não duplica.
- Só dá para bloquear quem está em alguma equipe em comum.
- O responsável pela equipe não pode ser removido dela por uma denúncia (nem pela
  plataforma): a mensagem pode ser apagada, mas suspender a conta ainda não existe.
