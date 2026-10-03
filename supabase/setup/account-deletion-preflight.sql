-- Conferência somente leitura antes de aplicar 20261003130000_account_deletion.sql.
-- Rode na base de produção (psql ou SQL editor). Não altera nada: só lista o que
-- a migração vai mudar e o que ainda impediria uma exclusão de conta.
DO $$
DECLARE v record; v_relation text; v_blocking integer := 0;
BEGIN
  FOREACH v_relation IN ARRAY ARRAY['auth.users', 'public.profiles', 'public.teams', 'public.team_members',
    'public.messages', 'public.team_invites', 'public.notifications', 'public.support_tickets',
    'public.assistant_messages', 'public.platform_audit_log', 'storage.objects'] LOOP
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

  -- FKs (fora do schema auth) sem ação de exclusão para o perfil, o usuário ou
  -- o que é apagado em cascata quando uma equipe de membro único é excluída.
  FOR v IN
    SELECT c.conname, c.conrelid::regclass AS tbl, c.confrelid::regclass AS ref,
           (SELECT string_agg(a.attname, ', ') FROM pg_attribute a
            WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) AS cols
    FROM pg_constraint c
    WHERE c.contype = 'f' AND c.confdeltype IN ('a', 'r')
      AND c.connamespace <> 'auth'::regnamespace
      AND c.confrelid IN (SELECT to_regclass(r) FROM unnest(ARRAY['public.profiles', 'auth.users',
        'public.teams', 'public.team_members', 'public.songs', 'public.cultos', 'public.culto_songs',
        'public.repertorios', 'public.messages', 'public.channels']) AS r)
    ORDER BY 2, 1
  LOOP
    v_blocking := v_blocking + 1;
    RAISE NOTICE 'Sem ação de exclusão: % em % (%) -> %', v.conname, v.tbl, v.cols, v.ref;
  END LOOP;
  -- Esperado antes da migração: songs/repertorios/cultos/channels.created_by,
  -- culto_songs.notes_author_id, notifications.sender_profile_id e
  -- team_join_requests.decided_by (a migração corrige). Qualquer outra linha é
  -- deriva de produção: anulável vira SET NULL; NOT NULL precisa de decisão.
  RAISE NOTICE '% FK(s) sem ação de exclusão encontradas. teams.owner_id hoje: %', v_blocking,
    (SELECT CASE confdeltype WHEN 'c' THEN 'CASCADE (apaga a equipe junto com o dono!)' WHEN 'r' THEN 'RESTRICT'
      WHEN 'a' THEN 'NO ACTION' ELSE confdeltype::text END
     FROM pg_constraint WHERE conrelid = 'public.teams'::regclass AND contype = 'f'
       AND confrelid = 'public.profiles'::regclass LIMIT 1);
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'storage.objects'::regclass AND contype = 'f'
             AND confrelid = 'auth.users'::regclass) THEN
    RAISE NOTICE 'storage.objects ainda tem FK de owner para auth.users: a migração desvincula o dono antes de excluir.';
  END IF;
END $$;
