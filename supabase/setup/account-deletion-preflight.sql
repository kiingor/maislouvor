-- Conferência somente leitura antes de aplicar 20261003130000_account_deletion.sql.
-- Rode na base de produção (psql ou SQL editor). Não altera nada: só lista o que
-- a migração vai mudar e o que a faria FALHAR (FKs que precisam de decisão).
--
-- Depois de aplicar esta e todas as migrações seguintes, a conferência é:
--   SELECT * FROM public.account_deletion_blocking_references();  -- tem de voltar vazio
DO $$
DECLARE v record; v_relation text; v_fixed integer := 0; v_failing integer := 0;
BEGIN
  FOREACH v_relation IN ARRAY ARRAY['auth.users', 'public.profiles', 'public.teams', 'public.team_members',
    'public.messages', 'public.team_invites', 'public.notifications', 'public.support_tickets',
    'public.assistant_groups', 'public.assistant_messages', 'public.platform_audit_log', 'storage.objects'] LOOP
    IF to_regclass(v_relation) IS NULL THEN RAISE EXCEPTION 'Tabela necessária ausente: %', v_relation; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'attachment_path') THEN
    RAISE EXCEPTION 'Coluna necessária ausente: public.messages.attachment_path';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'team_members' AND column_name = 'permissions') THEN
    RAISE EXCEPTION 'Coluna necessária ausente: public.team_members.permissions';
  END IF;

  -- Mesma regra de public.account_deletion_blocking_references() (criada pela
  -- migração): parte do que a exclusão apaga e segue as cascatas.
  FOR v IN
    WITH RECURSIVE removed(rel) AS (
      SELECT r::oid FROM unnest(ARRAY[
        to_regclass('auth.users'), to_regclass('public.profiles'), to_regclass('public.teams'),
        to_regclass('public.songs'), to_regclass('public.assistant_groups'),
        to_regclass('public.assistant_messages'), to_regclass('public.team_invites')]) AS r
      WHERE r IS NOT NULL
      UNION
      SELECT c.conrelid FROM pg_constraint c JOIN removed ON c.confrelid = removed.rel
      WHERE c.contype = 'f' AND c.confdeltype = 'c'
    )
    SELECT c.conname, c.conrelid::regclass AS tbl, c.confrelid::regclass AS ref, cols.names, cols.not_null,
           CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
             WHEN 'n' THEN 'SET NULL' ELSE 'SET DEFAULT' END AS on_delete,
           c.confdeltype IN ('a', 'r') AND NOT cols.not_null AND cardinality(c.conkey) = 1
             AND c.connamespace = 'public'::regnamespace
             AND c.confrelid IN (to_regclass('public.profiles'), to_regclass('auth.users')) AS can_set_null
    FROM pg_constraint c
    CROSS JOIN LATERAL (
      SELECT string_agg(a.attname::text, ', ' ORDER BY a.attnum) AS names, bool_or(a.attnotnull) AS not_null
      FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    ) cols
    WHERE c.contype = 'f'
      AND c.confrelid IN (SELECT rel FROM removed)
      AND c.connamespace NOT IN (SELECT n.oid FROM pg_namespace n WHERE n.nspname IN ('auth', 'storage'))
      AND (c.confdeltype IN ('a', 'r') OR (c.confdeltype IN ('n', 'd') AND cols.not_null))
      AND NOT (c.conrelid = 'public.teams'::regclass AND c.confrelid = 'public.profiles'::regclass)
    ORDER BY 2, 1
  LOOP
    IF v.can_set_null THEN
      v_fixed := v_fixed + 1;
      RAISE NOTICE 'Corrigida pela migração (vira SET NULL): % em % (%) -> %', v.conname, v.tbl, v.names, v.ref;
    ELSE
      v_failing := v_failing + 1;
      RAISE WARNING 'FAZ A MIGRAÇÃO FALHAR: % em % (%) -> % [%]', v.conname, v.tbl, v.names, v.ref,
        v.on_delete || CASE WHEN v.not_null THEN ', NOT NULL' ELSE '' END;
    END IF;
  END LOOP;
  -- Esperado antes da migração: songs/repertorios/cultos/channels.created_by,
  -- culto_songs.notes_author_id, notifications.sender_profile_id e
  -- team_join_requests.decided_by entre as corrigidas. Cada uma das que fazem a
  -- migração falhar (tabelas só de produção, por exemplo) precisa de decisão
  -- antes: ON DELETE CASCADE, SET NULL, ou apagar as linhas em delete_account_data.
  RAISE NOTICE '% FK(s) corrigidas pela migração; % FK(s) que a fariam falhar. teams.owner_id hoje: %', v_fixed, v_failing,
    (SELECT CASE confdeltype WHEN 'c' THEN 'CASCADE (apaga a equipe junto com o dono!)' WHEN 'r' THEN 'RESTRICT'
      WHEN 'a' THEN 'NO ACTION' ELSE confdeltype::text END
     FROM pg_constraint WHERE conrelid = 'public.teams'::regclass AND contype = 'f'
       AND confrelid = 'public.profiles'::regclass LIMIT 1);
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'storage.objects'::regclass AND contype = 'f'
             AND confrelid = 'auth.users'::regclass) THEN
    RAISE NOTICE 'storage.objects ainda tem FK de owner para auth.users: a migração desvincula o dono antes de excluir.';
  END IF;
END $$;
