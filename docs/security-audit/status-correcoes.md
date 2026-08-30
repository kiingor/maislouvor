# Status das correções da auditoria de segurança

Data da implementação: 29/08/2026

Este documento acompanha o relatório `relatorio-auditoria-seguranca.pdf`. O PDF permanece como fotografia do estado auditado; a situação abaixo descreve o código corrigido ainda não implantado no ambiente Supabase/produção.

## Resultado

Os nove achados do relatório foram tratados no repositório. A correção crítica de convites também ganhou uma trava no banco, independente de RLS, para bloquear inserções diretas feitas por uma versão antiga da Edge Function com `service_role` durante o rollout.

| Achado | Severidade | Estado | Evidência principal da correção |
|---|---|---|---|
| F-01 — associação forçada e redefinição global de senha | Crítica | Implementado | `supabase/functions/create-invite/index.ts`, `accept-invite/index.ts`, `admin-update-user/index.ts` e a migration de hardening. O aceite agora é atômico, exige e-mail autenticado/verificado e a tabela rejeita membership sem convite. |
| F-02 — Storage sem isolamento | Alta | Implementado | Policies de `covers` validam o time; escritas de `avatars` validam a pasta de `auth.uid()`. |
| F-03 — funções pagas de IA públicas | Alta | Implementado | JWT ativado, autorização por time/objeto, payload limitado e rate limit atômico nas cinco funções. |
| F-04 — XSS armazenado em `media_url` | Alta | Implementado | Allowlist HTTPS compartilhada no frontend, abertura com `noopener,noreferrer`, constraint para novas gravações e testes unitários. |
| F-05 — relações cross-tenant/IDOR | Alta | Implementado | Policies dos dois lados da relação, triggers de consistência e revalidação na playlist pública. |
| F-06 — viewer iniciando separação de stems | Alta | Implementado | `separate-stems` exige editor, compara o caminho persistido, reserva job atomicamente e aplica rate limit. |
| F-07 — callback aceitando `Bearer undefined` | Média | Implementado | Configuração ausente/fraca falha fechada; callback valida token, job ativo, time, música e replay. |
| F-08 — notificações com remetente/destinatário arbitrários | Média | Implementado | Policy exige editor, time não nulo, remetente da sessão, destinatário do mesmo time e link interno. |
| F-09 — membro alterando toda a linha da escala | Média | Implementado | UPDATE amplo foi removido e substituído por `set_own_lineup_status`, que altera somente `status`. |

## Arquivos centrais

- `supabase/migrations/20260829220000_security_hardening.sql`
- `supabase/functions/_shared/security.ts`
- `src/lib/mediaUrl.ts` e `src/lib/mediaUrl.test.ts`
- `src/lib/safeRedirect.ts` e `src/lib/safeRedirect.test.ts`
- Edge Functions e telas listadas no `git diff` desta implementação

## Validações executadas

- `npm test -- --run`: 3 arquivos, 16 testes aprovados.
- `npm run build`: build de produção aprovado; permanece apenas o aviso existente de chunk acima de 500 kB.
- `npx tsc --noEmit -p tsconfig.app.json`: aprovado.
- `npx --yes deno check supabase/functions/*/index.ts`: 12 handlers aprovados.
- `npx --yes deno fmt --check supabase/functions`: 13 arquivos aprovados.
- As 22 migrations foram aplicadas, em ordem, em PostgreSQL 16 descartável com schemas Supabase simulados.
- Cenários SQL verificados: bloqueio de membership direto inclusive com privilégio elevado, criação automática do owner, aceite atômico por e-mail, rollback em e-mail divergente, bloqueio de replay, isolamento de relações/storage/notificações, RPC limitada da escala e rate limit atômico.

O lint do conjunto de telas modificado ainda não está verde: a configuração atual aponta 82 erros e 11 avisos, principalmente `no-explicit-any` e dependências de hooks em componentes grandes preexistentes. Os novos utilitários/testes de URL e redirect, os modais de convite/edição e as telas de login/cadastro não emitiram erro no lint direcionado. Essa dívida deve ser tratada separadamente para não misturar uma refatoração extensa com o patch de segurança.

## Ordem segura de implantação

1. Fazer backup e abrir uma janela curta de manutenção para convites e separação de stems.
2. Configurar `LOVABLE_API_KEY`, `WORKER_URL`, `WORKER_TOKEN` e `STEMS_CALLBACK_TOKEN`. Os dois tokens do worker precisam ter pelo menos 32 caracteres e `WORKER_URL` deve usar HTTPS.
3. Implantar primeiro `admin-update-user`; essa versão retorna `410` e elimina imediatamente a redefinição global de senha.
4. Aplicar `supabase/migrations/20260829220000_security_hardening.sql` (normalmente com `supabase db push`). A trava de `team_members` bloqueia o `create-invite` antigo mesmo com `service_role`.
5. Implantar imediatamente as versões novas de `create-invite`, `accept-invite`, `import-cifra`, `transpose`, `sync-lyrics`, `import-moises`, `suggest-culto-songs`, `separate-stems`, `stems-callback`, `public-playlist` e `transcribe-sync`.
6. Implantar o frontend e confirmar que a origem de produção usada em `emailRedirectTo` está permitida na configuração de redirects do Supabase Auth.
7. Executar smoke tests com dois times distintos: admin/editor/viewer, convite com e-mail correto/incorreto, playlist pública, URL de mídia inválida, stems e resposta `429` após exceder quota.
8. Monitorar respostas `401`, `403`, `409` e `429`, além de falhas do worker, nas primeiras horas.

Não implantar apenas o frontend: as proteções determinantes estão na migration e nas Edge Functions.

## Revisão de dados legados

A constraint de `media_url` foi criada como `NOT VALID` para não interromper o deploy por dados antigos. As novas gravações já são protegidas e o frontend trata valores legados inválidos como inertes. Antes de validar a constraint, revisar:

```sql
SELECT id, media_url
FROM public.songs
WHERE media_url IS NOT NULL
  AND NOT (
    char_length(media_url) <= 2048
    AND media_url ~* '^https://([a-z0-9-]+\.)*(youtube\.com|youtu\.be|spotify\.com|music\.apple\.com|deezer\.com|soundcloud\.com|vimeo\.com)(:[0-9]{1,5})?(/|$)'
  );

SELECT rs.id, r.team_id AS repertorio_team, s.team_id AS song_team
FROM public.repertorio_songs rs
JOIN public.repertorios r ON r.id = rs.repertorio_id
JOIN public.songs s ON s.id = rs.song_id
WHERE r.team_id <> s.team_id;

SELECT cs.id, c.team_id AS culto_team, s.team_id AS song_team
FROM public.culto_songs cs
JOIN public.cultos c ON c.id = cs.culto_id
JOIN public.songs s ON s.id = cs.song_id
WHERE c.team_id <> s.team_id;

SELECT cl.id, c.team_id AS culto_team, tm.team_id AS member_team
FROM public.culto_lineup cl
JOIN public.cultos c ON c.id = cl.culto_id
JOIN public.team_members tm ON tm.id = cl.team_member_id
WHERE c.team_id <> tm.team_id;
```

Depois de corrigir ou remover os registros confirmados, validar a constraint:

```sql
ALTER TABLE public.songs VALIDATE CONSTRAINT songs_media_url_allowed_check;
```

Também é recomendável auditar logs históricos de `create-invite` e `admin-update-user`. Se houver indício de uso abusivo, invalidar as sessões afetadas e acionar recuperação de senha para as contas envolvidas.
