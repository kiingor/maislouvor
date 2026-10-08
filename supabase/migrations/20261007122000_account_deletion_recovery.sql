-- Recuperação limitada ao dono legado, via backend autenticado. Sem alterar os
-- guardas de privilégios nem permitir que membros promovam a si próprios.
CREATE OR REPLACE FUNCTION public.account_deletion_preview_for(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile uuid; v_teams jsonb;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não informado.' USING ERRCODE = '22023'; END IF;
  SELECT id INTO v_profile FROM public.profiles WHERE user_id = p_user_id;
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('has_profile', false, 'can_delete', true, 'teams', '[]'::jsonb,
      'personal', jsonb_build_object('chat_messages', 0, 'support_tickets', 0, 'draft_songs', 0));
  END IF;

  WITH mine AS (
    SELECT t.id, t.name, t.owner_id = v_profile AS is_owner, me.role AS my_role
    FROM public.teams t
    LEFT JOIN public.team_members me ON me.team_id = t.id AND me.profile_id = v_profile
    WHERE t.owner_id = v_profile OR me.id IS NOT NULL
  ), classified AS (
    -- Só o dono apaga a equipe junto. Último membro que não é o dono (um líder
    -- tirou o dono de team_members) só sai: a equipe continua de quem é dona.
    -- Dono que já não é líder: transfer_team_ownership (20261003120000) promove o
    -- novo dono com o JWT dele, e o guarda só deixa um líder promover. Ele passa a
    -- equipe só para quem já é líder; sem outro líder, só o suporte resolve.
    SELECT m.*, s.others, CASE
        WHEN s.others = 0 AND m.is_owner THEN 'delete_team'
        WHEN s.others = 0 THEN 'leave'
        WHEN m.is_owner AND m.my_role IS DISTINCT FROM 'admin' AND s.other_admins = 0 THEN 'support_required'
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
      -- Quem pode assumir: líderes primeiro. Só para as equipes que bloqueiam e
      -- que a própria pessoa resolve; o dono que não é líder só vê os líderes.
      'candidates', CASE WHEN c.action IN ('transfer_required', 'promote_required', 'support_required') THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object('profile_id', o.profile_id, 'full_name', p.full_name, 'role', o.role)
          ORDER BY CASE o.role WHEN 'admin' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, lower(COALESCE(p.full_name, '')), o.profile_id)
        FROM public.team_members o JOIN public.profiles p ON p.id = o.profile_id
        WHERE o.team_id = c.id AND o.profile_id <> v_profile
          AND (o.role = 'admin' OR NOT c.is_owner OR c.my_role = 'admin' OR c.action = 'support_required')), '[]'::jsonb) ELSE '[]'::jsonb END
    ) ORDER BY (c.action IN ('transfer_required', 'promote_required', 'support_required')) DESC, lower(c.name), c.id), '[]'::jsonb)
  INTO v_teams FROM classified c;

  RETURN jsonb_build_object(
    'has_profile', true,
    'can_delete', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_teams) e
      WHERE e->>'action' IN ('transfer_required', 'promote_required', 'support_required')),
    'teams', v_teams,
    'personal', jsonb_build_object(
      'chat_messages', (SELECT count(*) FROM public.messages WHERE sender_profile_id = v_profile),
      'support_tickets', (SELECT count(*) FROM public.support_tickets WHERE requester_profile_id = v_profile),
      'draft_songs', cardinality(public.account_deletion_draft_song_ids(v_profile))));
END;
$$;


create or replace function public.account_deletion_recover_team(p_user_id uuid, p_team_id uuid, p_new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_caller uuid;
begin
  -- Chamada somente com service_role, sem JWT de usuário nos triggers.
  if auth.uid() is not null then raise exception 'service_only' using errcode='42501'; end if;
  select id into v_caller from public.profiles where user_id = p_user_id;
  select owner_id into v_owner from public.teams where id = p_team_id for update;
  if v_caller is null or v_owner is distinct from v_caller or p_new_owner = v_caller then
    raise exception 'forbidden' using errcode='42501';
  end if;
  perform 1 from public.team_members where team_id = p_team_id for update;
  if exists (select 1 from public.team_members where team_id=p_team_id and role='admin') then
    raise exception 'use_normal_transfer' using errcode='55000';
  end if;
  if not exists (select 1 from public.team_members where team_id=p_team_id and profile_id=p_new_owner) then
    raise exception 'not_member' using errcode='42501';
  end if;
  update public.team_members set role='admin', permissions='{}'::jsonb where team_id=p_team_id and profile_id=p_new_owner;
  update public.teams set owner_id=p_new_owner where id=p_team_id;
  insert into public.platform_audit_log(actor_user_id,action,entity_id,details)
    values(p_user_id,'account_deletion_recover_team',p_team_id,jsonb_build_object('new_owner',p_new_owner));
end $$;
revoke all on function public.account_deletion_recover_team(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.account_deletion_recover_team(uuid,uuid,uuid) to service_role;
notify pgrst, 'reload schema';
