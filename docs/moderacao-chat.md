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
  bloqueado"), com *Mostrar* e *Desbloquear*. Lista completa em
  Ajustes › Meu usuário › **Usuários bloqueados**.

## Quem analisa

| Quem | Onde | Recebe aviso |
|---|---|---|
| Liderança da equipe (papel `admin`) | Ajustes › Membros › **Denúncias do chat** | Notificação no app + push |
| Administradores da plataforma | Gerenciador › **Denúncias** (`/admin/denuncias`) | Notificação no app |

- Denúncias sobre um líder não aparecem para ele: ficam com o outro líder (se houver)
  e com a plataforma.
- Ações: *Em análise*, *Resolver* (anotação interna e, opcionalmente, remover o autor
  da equipe — nunca o responsável pela equipe), *Descartar* e *Apagar mensagem*.
- Ao encerrar, quem denunciou recebe "Sua denúncia foi analisada", sem detalhes.
- Ações da plataforma ficam em `platform_audit_log`
  (`chat_report_update`, `chat_message_delete`).
- Denúncias abertas há mais de 24 horas aparecem como **Prazo vencido**.

## Provas

A denúncia guarda uma cópia da mensagem (texto, tipo e caminho do anexo). Se a
mensagem for apagada enquanto a denúncia estiver aberta, o anexo continua no Storage;
ao resolver ou descartar, o app apaga o arquivo que não for mais prova de nada.

## Filtro de palavras

Trigger em `messages` troca por asteriscos palavras inteiras da tabela
`chat_blocked_terms` (sem diferenciar maiúsculas e acentos; pega plural, letras
repetidas e números no lugar de letras). Palavras que só contêm o termo
(*computador*, *disputa*, *cuidado*) não são afetadas. Termos ambíguos ficaram de fora.

Para incluir um termo (sem acento, minúsculo; vale para mensagens novas):

```sql
INSERT INTO public.chat_blocked_terms(term) VALUES ('novotermo');
```

## Limites

- 10 denúncias por pessoa por hora; denunciar de novo a mesma mensagem não duplica.
- Só dá para bloquear quem está em alguma equipe em comum.
