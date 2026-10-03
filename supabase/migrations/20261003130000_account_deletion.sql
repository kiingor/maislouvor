-- ============================================================================
-- Exclusão de conta pelo próprio usuário
-- (App Store 5.1.1(v) e política de exclusão de conta do Google Play)
--
-- Quem chama: a edge function delete-account (service_role), depois de
-- autenticar o usuário pelo JWT, conferir a confirmação digitada e apagar os
-- arquivos pessoais do storage. O app só usa as duas RPCs de usuário:
-- get_account_deletion_preview() e transfer_team_ownership().
--
-- Plano de exclusão (o que acontece com cada referência ao perfil):
--
--   APAGADO (dado pessoal)
--     profiles (nome, foto, telefone, notification_prefs) ... DELETE explícito
--     team_members, member_availability, culto_lineup,
--       culto_song_voices ........................... CASCADE (via team_members)
--     messages do chat enviadas pela pessoa ......... CASCADE (sender_profile_id)
--       e os anexos (bucket chat) ................... removidos pela edge function
--     notifications recebidas ....................... CASCADE (profile_id)
--     device_tokens, push_subscriptions ............. CASCADE
--     song_loop_points (loops de ensaio da pessoa) .. CASCADE
--     team_join_requests feitas pela pessoa ......... CASCADE
--     assistant_wa_identities, assistant_link_codes,
--       assistant_member_usage_daily ................ CASCADE
--     assistant_messages (conversas com o Asafe) .... DELETE explícito (a FK é
--                                                     SET NULL e manteria o texto)
--     support_tickets da pessoa (+ mensagens) ....... CASCADE
--     team_invites para o e-mail da pessoa .......... DELETE explícito (sem FK)
--     equipes em que a pessoa é o ÚNICO membro ...... DELETE explícito da equipe
--       (músicas, cultos, repertórios, chat e arquivos da equipe vão junto)
--     auth.users (sessões, identidades) ............. auth.admin.deleteUser()
--
--   ANONIMIZADO (conteúdo da equipe, continua com a equipe)
--     songs/repertorios/cultos/channels.created_by .. SET NULL (antes: sem ação,
--                                                     a exclusão falhava)
--     culto_songs.notes_author_id ................... SET NULL
--     notifications.sender_profile_id (avisos que a
--       pessoa mandou para outros) .................. SET NULL
--     team_join_requests.decided_by ................. SET NULL
--     assistant_* .activated_by/created_by/... ...... SET NULL (já era)
--     support_ticket_messages.author_profile_id ..... SET NULL (já era)
--     platform_audit_log.actor_user_id e
--       *.updated_by (auth.users) ................... SET NULL (já era)
--     storage.objects.owner dos arquivos que ficam
--       com a equipe (áudios, capas) ................ NULL (dono desvinculado)
--
--   PROPRIEDADE DA EQUIPE (teams.owner_id)
--     Antes: ON DELETE CASCADE — apagar o dono apagava a equipe inteira, com
--     todos os outros membros dentro. Agora: ON DELETE RESTRICT. A exclusão
--     só segue quando nenhuma equipe com outros membros depende da pessoa:
--       * dono de equipe com outros membros -> transferir a propriedade antes
--         (transfer_team_ownership, que também promove o novo dono a líder);
--       * único líder (sem ser dono) com outros membros -> promover outro
--         membro a líder antes (o app usa o mesmo update de papel da aba Membros);
--       * único membro -> a equipe é excluída junto com a conta.
--
-- Idempotente: seguro rodar mais de uma vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) FKs para profiles: conteúdo da equipe sobrevive sem o autor; a equipe
--    nunca é apagada em cascata pelo dono.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v record;
  v_con record;
  v_found boolean;
BEGIN
  FOR v IN SELECT * FROM (VALUES
    ('songs', 'created_by', 'SET NULL'),
    ('repertorios', 'created_by', 'SET NULL'),
    ('cultos', 'created_by', 'SET NULL'),
    ('channels', 'created_by', 'SET NULL'),
    ('culto_songs', 'notes_author_id', 'SET NULL'),
    ('notifications', 'sender_profile_id', 'SET NULL'),
    ('team_join_requests', 'decided_by', 'SET NULL'),
    ('teams', 'owner_id', 'RESTRICT')
  ) AS t(table_name, column_name, on_delete) LOOP
    IF to_regclass('public.' || v.table_name) IS NULL THEN
      RAISE NOTICE 'Tabela public.% ausente; FK ignorada.', v.table_name;
      CONTINUE;
    END IF;
    IF v.on_delete = 'SET NULL' AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = ('public.' || v.table_name)::regclass AND a.attname = v.column_name AND a.attnotnull
    ) THEN
      RAISE EXCEPTION 'public.%.% é NOT NULL e não pode virar ON DELETE SET NULL.', v.table_name, v.column_name;
    END IF;

    v_found := false;
    FOR v_con IN
      SELECT c.conname
      FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND cardinality(c.conkey) = 1
        AND c.conrelid = ('public.' || v.table_name)::regclass
        AND c.confrelid = 'public.profiles'::regclass
        AND a.attname = v.column_name
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v.table_name, v_con.conname);
      v_found := true;
    END LOOP;

    -- Com a FK original os dados já são consistentes; sem ela (deriva), a nova
    -- entra NOT VALID para não travar a migração por linhas antigas órfãs.
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.profiles(id) ON DELETE %s%s',
      v.table_name, v.table_name || '_' || v.column_name || '_fkey', v.column_name, v.on_delete,
      CASE WHEN v_found THEN '' ELSE ' NOT VALID' END);
    IF NOT v_found THEN
      RAISE NOTICE 'FK de public.%.% não existia; criada NOT VALID.', v.table_name, v.column_name;
    END IF;
  END LOOP;
END $$;

-- Rede de segurança para deriva de produção: qualquer outra FK de public para
-- profiles ou auth.users sem ação de exclusão bloquearia a exclusão de contas.
-- Coluna anulável -> SET NULL (a linha fica, sem o vínculo com a pessoa).
-- Coluna NOT NULL -> só avisa: precisa de decisão (CASCADE ou exclusão explícita).
DO $$
DECLARE v record;
BEGIN
  FOR v IN
    SELECT c.conname, c.conrelid::regclass AS tbl, a.attname, a.attnotnull,
           c.confrelid::regclass AS ref, ra.attname AS ref_column
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    JOIN pg_catalog.pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1]
    WHERE c.contype = 'f' AND cardinality(c.conkey) = 1 AND c.confdeltype IN ('a', 'r')
      AND c.connamespace = 'public'::regnamespace
      AND (c.confrelid = 'public.profiles'::regclass OR c.confrelid = to_regclass('auth.users'))
      AND NOT (c.conrelid = 'public.teams'::regclass AND a.attname = 'owner_id')
  LOOP
    IF v.attnotnull THEN
      RAISE WARNING 'A FK % (%.%) bloqueia a exclusão de contas e é NOT NULL: revise manualmente.', v.conname, v.tbl, v.attname;
    ELSE
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(%I) ON DELETE SET NULL',
        v.tbl, v.conname, v.conname, v.attname, v.ref, v.ref_column);
      RAISE NOTICE 'FK % (%.%) passou a ON DELETE SET NULL.', v.conname, v.tbl, v.attname;
    END IF;
  END LOOP;

  -- Excluir uma equipe de membro único apaga tudo em cascata a partir dela.
  -- FKs sem ação para essas tabelas (filas que só existem em produção, por
  -- exemplo) fariam a exclusão falhar; aqui só avisamos.
  FOR v IN
    SELECT c.conname, c.conrelid::regclass AS tbl, c.confrelid::regclass AS ref
    FROM pg_catalog.pg_constraint c
    WHERE c.contype = 'f' AND c.confdeltype IN ('a', 'r')
      AND c.confrelid IN (SELECT to_regclass('public.' || t) FROM unnest(ARRAY[
        'teams', 'team_members', 'songs', 'cultos', 'culto_songs', 'repertorios', 'messages', 'channels'
      ]) AS t)
  LOOP
    RAISE WARNING 'A FK % (% -> %) não tem ação de exclusão: excluir uma equipe de membro único vai falhar.', v.conname, v.tbl, v.ref;
  END LOOP;
END $$;

-- As exclusões em cascata/SET NULL procuram pelo autor; sem índice viram varreduras.
CREATE INDEX IF NOT EXISTS songs_created_by_idx ON public.songs(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS repertorios_created_by_idx ON public.repertorios(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS cultos_created_by_idx ON public.cultos(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_sender_profile_id_idx ON public.messages(sender_profile_id);
CREATE INDEX IF NOT EXISTS notifications_sender_profile_id_idx ON public.notifications(sender_profile_id) WHERE sender_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS team_invites_email_lower_idx ON public.team_invites(lower(email));

-- ----------------------------------------------------------------------------
-- 2) Prévia: o que acontece com cada equipe da pessoa.
--    action: delete_team (único membro) | leave | transfer_required (dono com
--    outros membros) | promote_required (único líder, sem ser dono).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.account_deletion_preview_for(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile uuid; v_teams jsonb;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não informado.' USING ERRCODE = '22023'; END IF;
  SELECT id INTO v_profile FROM public.profiles WHERE user_id = p_user_id;
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('has_profile', false, 'can_delete', true, 'teams', '[]'::jsonb,
      'personal', jsonb_build_object('chat_messages', 0, 'support_tickets', 0));
  END IF;

  WITH mine AS (
    SELECT t.id, t.name, t.owner_id = v_profile AS is_owner, me.role AS my_role
    FROM public.teams t
    LEFT JOIN public.team_members me ON me.team_id = t.id AND me.profile_id = v_profile
    WHERE t.owner_id = v_profile OR me.id IS NOT NULL
  ), classified AS (
    SELECT m.*, s.others, CASE
        WHEN s.others = 0 THEN 'delete_team'
        WHEN m.is_owner THEN 'transfer_required'
        WHEN m.my_role = 'admin' AND s.other_admins = 0 THEN 'promote_required'
        ELSE 'leave' END AS action
    FROM mine m
    CROSS JOIN LATERAL (
      SELECT count(*) AS others, count(*) FILTER (WHERE o.role = 'admin') AS other_admins
      FROM public.team_members o WHERE o.team_id = m.id AND o.profile_id <> v_profile
    ) s
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'team_id', c.id, 'team_name', c.name, 'role', c.my_role, 'is_owner', c.is_owner,
      'member_count', c.others + CASE WHEN c.my_role IS NULL THEN 0 ELSE 1 END,
      'action', c.action,
      -- Quem pode assumir: líderes primeiro. Só para as equipes que bloqueiam.
      'candidates', CASE WHEN c.action IN ('transfer_required', 'promote_required') THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object('profile_id', o.profile_id, 'full_name', p.full_name, 'role', o.role)
          ORDER BY CASE o.role WHEN 'admin' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, lower(COALESCE(p.full_name, '')), o.profile_id)
        FROM public.team_members o JOIN public.profiles p ON p.id = o.profile_id
        WHERE o.team_id = c.id AND o.profile_id <> v_profile), '[]'::jsonb) ELSE '[]'::jsonb END
    ) ORDER BY (c.action IN ('transfer_required', 'promote_required')) DESC, lower(c.name), c.id), '[]'::jsonb)
  INTO v_teams FROM classified c;

  RETURN jsonb_build_object(
    'has_profile', true,
    'can_delete', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_teams) e
      WHERE e->>'action' IN ('transfer_required', 'promote_required')),
    'teams', v_teams,
    'personal', jsonb_build_object(
      'chat_messages', (SELECT count(*) FROM public.messages WHERE sender_profile_id = v_profile),
      'support_tickets', (SELECT count(*) FROM public.support_tickets WHERE requester_profile_id = v_profile)));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_account_deletion_preview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre para continuar.' USING ERRCODE = '42501'; END IF;
  RETURN public.account_deletion_preview_for(auth.uid());
END;
$$;

-- ----------------------------------------------------------------------------
-- 3) Transferência de propriedade: só o dono atual; o novo dono precisa ser
--    membro e vira líder. Fica registrada no log da plataforma e avisa o novo dono.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_team_ownership(p_team_id uuid, p_new_owner_profile_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile uuid; v_team public.teams; v_member public.team_members;
BEGIN
  SELECT id INTO v_profile FROM public.profiles WHERE user_id = auth.uid();
  IF auth.uid() IS NULL OR v_profile IS NULL THEN RAISE EXCEPTION 'Entre para continuar.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF v_team.id IS NULL OR v_team.owner_id IS DISTINCT FROM v_profile THEN
    RAISE EXCEPTION 'Só o dono da equipe pode transferir a propriedade.' USING ERRCODE = '42501';
  END IF;
  IF p_new_owner_profile_id IS NULL OR p_new_owner_profile_id = v_profile THEN
    RAISE EXCEPTION 'Escolha outra pessoa da equipe.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_member FROM public.team_members
  WHERE team_id = p_team_id AND profile_id = p_new_owner_profile_id FOR UPDATE;
  IF v_member.id IS NULL THEN
    RAISE EXCEPTION 'A pessoa escolhida não faz parte desta equipe.' USING ERRCODE = '22023';
  END IF;

  -- Líder tem acesso total: exceções de permissão deixam de valer (como no MemberEditModal).
  UPDATE public.team_members SET role = 'admin', permissions = '{}'::jsonb WHERE id = v_member.id;
  UPDATE public.teams SET owner_id = p_new_owner_profile_id WHERE id = p_team_id;

  INSERT INTO public.platform_audit_log(actor_user_id, action, entity_id, details)
  VALUES (auth.uid(), 'team_ownership_transfer', p_team_id::text, jsonb_build_object(
    'from_profile_id', v_profile, 'to_profile_id', p_new_owner_profile_id, 'previous_role', v_member.role));
  INSERT INTO public.notifications(profile_id, type, title, body, link, team_id, sender_profile_id)
  VALUES (p_new_owner_profile_id, 'team_ownership', 'Você agora é dono(a) da equipe',
    'A propriedade de ' || v_team.name || ' foi transferida para você, que agora também é líder.',
    '/app/settings', p_team_id, v_profile);

  RETURN jsonb_build_object('team_id', p_team_id, 'owner_profile_id', p_new_owner_profile_id);
END;
$$;

-- ----------------------------------------------------------------------------
-- 4) Arquivos pessoais a remover pela edge function (Storage API, service_role).
--    avatars/<user_id>/... (o líder também pode ter enviado a foto); anexos do
--    chat enviados pela pessoa; e todos os arquivos das equipes que serão
--    excluídas (audio, covers e chat usam <team_id>/ como primeira pasta).
--    Áudios e capas das equipes que continuam NÃO entram: são da equipe.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.account_deletion_storage_objects(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile uuid; v_avatar text; v_teams text[]; v_owner_id text := ''; v_result jsonb;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não informado.' USING ERRCODE = '22023'; END IF;
  IF to_regclass('storage.objects') IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT id, substring(avatar_url FROM '/storage/v1/object/public/avatars/([^?#]+)')
    INTO v_profile, v_avatar FROM public.profiles WHERE user_id = p_user_id;
  SELECT COALESCE(array_agg(e->>'team_id'), '{}') INTO v_teams
  FROM jsonb_array_elements(public.account_deletion_preview_for(p_user_id)->'teams') e
  WHERE e->>'action' = 'delete_team';
  -- Versões novas do Storage gravam o dono também em owner_id (texto).
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'storage.objects'::regclass
             AND attname = 'owner_id' AND NOT attisdropped) THEN
    v_owner_id := ' OR o.owner_id = $1::text';
  END IF;
  EXECUTE format($q$
    SELECT COALESCE(jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'path', o.name) ORDER BY o.bucket_id, o.name), '[]'::jsonb)
    FROM storage.objects o
    WHERE (o.bucket_id = 'avatars' AND (split_part(o.name, '/', 1) = $1::text OR o.name = $4))
       OR (o.bucket_id = 'chat' AND (o.owner = $1%s OR o.name IN (
             SELECT m.attachment_path FROM public.messages m
             WHERE m.sender_profile_id = $2 AND m.attachment_path IS NOT NULL)))
       OR (o.bucket_id IN ('audio', 'covers', 'chat') AND split_part(o.name, '/', 1) = ANY ($3))
  $q$, v_owner_id) INTO v_result USING p_user_id, v_profile, v_teams, v_avatar;
  RETURN v_result;
END;
$$;

-- O que fica com a equipe deixa de apontar para a pessoa (e não trava o
-- auth.admin.deleteUser em Storages antigos, que tinham FK de owner para auth.users).
CREATE OR REPLACE FUNCTION public.account_deletion_release_storage_owner(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
  BEGIN
    EXECUTE 'UPDATE storage.objects SET owner = NULL WHERE owner = $1' USING p_user_id;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'storage.objects'::regclass
               AND attname = 'owner_id' AND NOT attisdropped) THEN
      EXECUTE 'UPDATE storage.objects SET owner_id = NULL WHERE owner_id = $1' USING p_user_id::text;
    END IF;
  EXCEPTION WHEN insufficient_privilege OR undefined_column THEN
    RAISE WARNING 'Não foi possível desvincular os arquivos do usuário %: %', p_user_id, SQLERRM;
  END;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5) Parte do banco da exclusão, numa transação só. Repetir é inofensivo:
--    sem perfil, só desvincula o storage e devolve already_deleted.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_account_data(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile uuid; v_email text; v_preview jsonb; v_delete_teams uuid[]; v_left integer;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não informado.' USING ERRCODE = '22023'; END IF;
  -- Duas chamadas simultâneas da mesma pessoa rodam uma depois da outra.
  PERFORM pg_advisory_xact_lock(hashtextextended('account-delete:' || p_user_id::text, 0));
  SELECT id INTO v_profile FROM public.profiles WHERE user_id = p_user_id FOR UPDATE;
  IF v_profile IS NULL THEN
    PERFORM public.account_deletion_release_storage_owner(p_user_id);
    RETURN jsonb_build_object('deleted', false, 'already_deleted', true, 'deleted_team_ids', '[]'::jsonb, 'left_team_count', 0);
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;

  -- Trava as equipes envolvidas: entradas e transferências em andamento esperam
  -- (a FK de team_members precisa da linha da equipe) e a prévia abaixo vale até o fim.
  PERFORM 1 FROM public.teams t
  WHERE t.owner_id = v_profile
     OR EXISTS (SELECT 1 FROM public.team_members m WHERE m.team_id = t.id AND m.profile_id = v_profile)
  ORDER BY t.id FOR UPDATE;

  v_preview := public.account_deletion_preview_for(p_user_id);
  IF NOT (v_preview->>'can_delete')::boolean THEN
    RAISE EXCEPTION 'Transfira a propriedade ou a liderança das suas equipes antes de excluir a conta.'
      USING ERRCODE = '55000', HINT = 'account_deletion_blocked';
  END IF;
  SELECT COALESCE(array_agg((e->>'team_id')::uuid) FILTER (WHERE e->>'action' = 'delete_team'), '{}'),
         count(*) FILTER (WHERE e->>'action' = 'leave')
    INTO v_delete_teams, v_left
  FROM jsonb_array_elements(v_preview->'teams') e;

  -- Equipes de membro único: vão junto (cascata leva músicas, cultos, chat...).
  DELETE FROM public.teams WHERE id = ANY (v_delete_teams);
  -- Conversas com o Asafe: a FK é SET NULL (estatística), aqui o texto sai.
  DELETE FROM public.assistant_messages WHERE profile_id = v_profile;
  -- Convites para o e-mail da pessoa (aceitos ou não) guardam o endereço.
  IF v_email IS NOT NULL THEN
    DELETE FROM public.team_invites WHERE lower(email) = lower(v_email);
  END IF;
  PERFORM public.account_deletion_release_storage_owner(p_user_id);
  -- O resto sai em cascata a partir do perfil (ver o plano no topo do arquivo).
  -- teams.owner_id é RESTRICT: se sobrar equipe da pessoa, tudo volta atrás.
  DELETE FROM public.profiles WHERE id = v_profile;

  -- Registro de que a exclusão aconteceu, sem dados pessoais.
  INSERT INTO public.platform_audit_log(actor_user_id, action, entity_id, details)
  VALUES (NULL, 'account_deleted', p_user_id::text,
    jsonb_build_object('deleted_teams', cardinality(v_delete_teams), 'left_teams', v_left));

  RETURN jsonb_build_object('deleted', true, 'already_deleted', false,
    'deleted_team_ids', to_jsonb(v_delete_teams), 'left_team_count', v_left);
END;
$$;

-- ----------------------------------------------------------------------------
-- 6) Permissões. Explícitas também para sobrepor os default privileges do
--    Supabase, que dão EXECUTE a anon/authenticated.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.account_deletion_preview_for(uuid), public.account_deletion_storage_objects(uuid),
  public.account_deletion_release_storage_owner(uuid), public.delete_account_data(uuid),
  public.get_account_deletion_preview(), public.transfer_team_ownership(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
-- Só usada de dentro de delete_account_data (roda como dono da função).
REVOKE ALL ON FUNCTION public.account_deletion_release_storage_owner(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_account_deletion_preview(), public.transfer_team_ownership(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_preview_for(uuid), public.account_deletion_storage_objects(uuid),
  public.delete_account_data(uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
