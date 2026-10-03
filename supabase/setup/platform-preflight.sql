-- Read-only compatibility check before applying the new platform migration.
DO $$
DECLARE v_relation text; v_column record;
BEGIN
  FOREACH v_relation IN ARRAY ARRAY['auth.users', 'public.profiles', 'public.teams', 'public.team_members',
    'public.songs', 'public.repertorios', 'public.cultos', 'public.team_invites', 'public.notifications'] LOOP
    IF to_regclass(v_relation) IS NULL THEN RAISE EXCEPTION 'Tabela necessária ausente: %', v_relation; END IF;
  END LOOP;
  FOR v_column IN SELECT * FROM (VALUES
    ('auth', 'users', 'email'), ('auth', 'users', 'email_confirmed_at'), ('auth', 'users', 'last_sign_in_at'),
    ('public', 'profiles', 'user_id'), ('public', 'team_members', 'role'), ('public', 'team_members', 'instruments'),
    ('public', 'teams', 'owner_id'), ('public', 'team_invites', 'accepted'), ('public', 'cultos', 'date'),
    ('public', 'notifications', 'profile_id'), ('public', 'notifications', 'type'), ('public', 'notifications', 'title'),
    ('public', 'notifications', 'body'), ('public', 'notifications', 'link'), ('public', 'notifications', 'team_id')
  ) AS required(schema_name, table_name, column_name) LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = v_column.schema_name
      AND c.table_name = v_column.table_name AND c.column_name = v_column.column_name) THEN
      RAISE EXCEPTION 'Coluna necessária ausente: %.%.%', v_column.schema_name, v_column.table_name, v_column.column_name;
    END IF;
  END LOOP;
  IF to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('public.get_my_profile_id()') IS NULL THEN
    RAISE EXCEPTION 'Funções necessárias de identidade ausentes.';
  END IF;
  IF to_regclass('public.platform_admins') IS NOT NULL THEN
    RAISE EXCEPTION 'A estrutura do gerenciador já existe. Revise o histórico de migrations antes de aplicar novamente.';
  END IF;
  RAISE NOTICE 'Estrutura compatível. Confirme que esta é a base escolhida para o frontend antes de aplicar.';
END;
$$;
