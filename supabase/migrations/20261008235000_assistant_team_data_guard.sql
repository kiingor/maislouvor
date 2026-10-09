-- As RPCs do app são SECURITY DEFINER e não passam pela RLS das equipes.
-- Exigir a escolha individual também nestas operações, sem mudar has_team_role
-- nem os caminhos de exclusão, revogação, desvínculo e desativação.
-- Desligar avisos e pausar/cancelar missões continuam possíveis após a retirada.


-- Base: 20261003133000_assistant_ai_consent.sql
create or replace function public.assistant_team_overview(p_team_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.my_team_data_allowed() then
    raise exception 'Autorize sua participação no +Louvor antes de usar este recurso do Asafe.'
      using errcode = '42501', hint = 'TEAM_DATA_CONSENT_REQUIRED';
  end if;
  if not public.has_team_role(auth.uid(), p_team_id, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'platform_enabled', c.enabled,
    'team_enabled', coalesce(s.enabled, true),
    'assistant_name', c.assistant_name,
    'bot_phone', c.bot_phone,
    'instructions', coalesce(s.instructions, ''),
    'instructions_max', 2000,
    'usage', jsonb_build_object(
      'today', coalesce(u.requests, 0),
      'team_limit', case when coalesce(s.unlimited, false) then null
                         else coalesce(s.team_daily_limit, c.team_daily_limit) end,
      'member_limit', case when coalesce(s.unlimited, false) then null
                           else coalesce(s.member_daily_limit, c.member_daily_limit) end
    ),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id,
               'name', g.group_name,
               'activated_at', g.activated_at,
               'activated_by', p.full_name)
               order by g.activated_at desc)
        from public.assistant_groups g
        left join public.profiles p on p.id = g.activated_by and private.team_data_allowed(p.id)
       where g.team_id = p_team_id and g.active
    ), '[]'::jsonb),
    'pending_code', (
      select jsonb_build_object('code', a.code, 'expires_at', a.expires_at)
        from public.assistant_activation_codes a
       where a.team_id = p_team_id and a.used_at is null and a.expires_at > now()
       order by a.created_at desc
       limit 1),
    'ai_consent', jsonb_build_object(
      'state', public.assistant_team_consent_state(p_team_id),
      'current_version', public.assistant_ai_consent_version(),
      'version', ac.text_version,
      'accepted_at', ac.accepted_at,
      'accepted_by', ap.full_name)
  ) into v_result
  from public.assistant_config c
  left join public.assistant_team_settings s on s.team_id = p_team_id
  left join public.assistant_usage_daily u on u.team_id = p_team_id and u.day = public.assistant_today()
  left join lateral (
    select x.text_version, x.accepted_at, x.profile_id
      from public.assistant_ai_consents x
     where x.team_id = p_team_id and x.scope = 'team_activation' and x.revoked_at is null
     order by x.accepted_at desc
     limit 1
  ) ac on true
  left join public.profiles ap on ap.id = ac.profile_id and private.team_data_allowed(ap.id)
  where c.id;

  return v_result;
end;
$$;

-- Base: 20261003133000_assistant_ai_consent.sql
create or replace function public.assistant_create_activation_code(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code    text;
  v_expires timestamptz := now() + interval '24 hours';
begin
  if not public.my_team_data_allowed() then
    raise exception 'Autorize sua participação no +Louvor antes de usar este recurso do Asafe.'
      using errcode = '42501', hint = 'TEAM_DATA_CONSENT_REQUIRED';
  end if;
  if not public.has_team_role(auth.uid(), p_team_id, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  elsif not public.assistant_team_consent_valid(p_team_id) then
    raise exception 'consent_required' using errcode = 'P0001', hint = 'Aceite o aviso de IA antes de ativar.';
  end if;

  -- Um código válido por equipe: gerar outro invalida o anterior.
  delete from public.assistant_activation_codes where team_id = p_team_id and used_at is null;
  v_code := public.assistant_new_code('assistant_activation_codes');
  insert into public.assistant_activation_codes (code, team_id, created_by, expires_at)
  values (v_code, p_team_id, (select id from public.profiles where user_id = auth.uid() limit 1), v_expires);

  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end;
$$;

-- Base: 20260928120000_whatsapp_assistant.sql
create or replace function public.assistant_update_instructions(p_team_id uuid, p_instructions text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text := nullif(btrim(coalesce(p_instructions, '')), '');
begin
  if not public.my_team_data_allowed() then
    raise exception 'Autorize sua participação no +Louvor antes de usar este recurso do Asafe.'
      using errcode = '42501', hint = 'TEAM_DATA_CONSENT_REQUIRED';
  end if;
  if not public.has_team_role(auth.uid(), p_team_id, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  elsif char_length(v_text) > 2000 then
    raise exception 'instructions_too_long' using errcode = '22001';
  end if;

  insert into public.assistant_team_settings as s (team_id, instructions, instructions_updated_by, updated_at)
  values (p_team_id, v_text, (select id from public.profiles where user_id = auth.uid() limit 1), now())
  on conflict (team_id) do update
    set instructions = excluded.instructions,
        instructions_updated_by = excluded.instructions_updated_by,
        updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

-- Base: 20260929120000_assistant_notifications.sql
create or replace function public.assistant_notification_settings(p_team_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.my_team_data_allowed() then
    raise exception 'Autorize sua participação no +Louvor antes de usar este recurso do Asafe.'
      using errcode = '42501', hint = 'TEAM_DATA_CONSENT_REQUIRED';
  end if;
  if not public.has_team_role(auth.uid(), p_team_id, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.assistant_notice_options(p_team_id);
end;
$$;

-- Base: 20260929120000_assistant_notifications.sql
create or replace function public.assistant_set_notification(p_team_id uuid, p_kind text, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_enabled and not public.my_team_data_allowed() then
    raise exception 'Autorize sua participação no +Louvor antes de usar este recurso do Asafe.'
      using errcode = '42501', hint = 'TEAM_DATA_CONSENT_REQUIRED';
  end if;
  if not public.has_team_role(auth.uid(), p_team_id, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('cultos','escala','repertorio','avisos','lembretes') or p_enabled is null then
    raise exception 'invalid_preference' using errcode = '22023';
  end if;
  insert into assistant_team_settings as s (team_id, notification_settings)
    values (p_team_id, jsonb_build_object(p_kind, p_enabled))
    on conflict (team_id) do update set notification_settings = s.notification_settings || excluded.notification_settings;
  -- Desligar e religar não ressuscita avisos antigos desta categoria.
  if not p_enabled then
    update assistant_outbox set payload = jsonb_set(payload, '{categories}', (payload->'categories') - p_kind)
      where team_id = p_team_id and status in ('pending','processing');
  end if;
  return public.assistant_notice_options(p_team_id);
end;
$$;

-- Base: 20260930120000_assistant_missions.sql
create or replace function public.assistant_missions_overview(p_team_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.my_team_data_allowed() then
    raise exception 'Autorize sua participação no +Louvor antes de usar este recurso do Asafe.'
      using errcode = '42501', hint = 'TEAM_DATA_CONSENT_REQUIRED';
  end if;
  if not public.has_team_role(auth.uid(),p_team_id,'admin') then raise exception 'forbidden' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(public.assistant_mission_json(x.id)) from (
    select id from assistant_missions where team_id=p_team_id order by (status in ('active','paused')) desc,created_at desc limit 100
  ) x),'[]'::jsonb);
end;
$$;

-- Base: 20260930120000_assistant_missions.sql
create or replace function public.assistant_set_mission_state(p_team_id uuid,p_code text,p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_member uuid; v_group uuid;
begin
  if p_action = 'retomar' and not public.my_team_data_allowed() then
    raise exception 'Autorize sua participação no +Louvor antes de usar este recurso do Asafe.'
      using errcode = '42501', hint = 'TEAM_DATA_CONSENT_REQUIRED';
  end if;
  select tm.id into v_member from team_members tm join profiles p on p.id=tm.profile_id
    where tm.team_id=p_team_id and tm.role='admin' and p.user_id=auth.uid();
  if v_member is null then raise exception 'forbidden' using errcode='42501'; end if;
  if p_action is null or p_action not in ('pausar','retomar','cancelar') then raise exception 'invalid_action' using errcode='22023'; end if;
  select group_id into v_group from assistant_missions where team_id=p_team_id and code=upper(trim(p_code));
  return public.assistant_mission_command(p_team_id,v_group,v_member,'app:'||gen_random_uuid(),p_action,jsonb_build_object('codigo',p_code));
end;
$$;

-- Base: 20261003133000_assistant_ai_consent.sql
create or replace function public.give_assistant_consent(p_scope text, p_team_id uuid default null, p_version text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := (select id from public.profiles where user_id = auth.uid() limit 1);
  v_version text := public.assistant_ai_consent_version();
begin
  if not public.my_team_data_allowed() then
    raise exception 'Autorize sua participação no +Louvor antes de usar este recurso do Asafe.'
      using errcode = '42501', hint = 'TEAM_DATA_CONSENT_REQUIRED';
  end if;
  if v_profile is null then
    raise exception 'no_profile' using errcode = '42501';
  elsif p_scope is null or p_scope not in ('team_activation', 'member_link') then
    raise exception 'invalid_scope' using errcode = '22023';
  elsif p_version is distinct from v_version then
    raise exception 'outdated_version' using errcode = '22023', hint = 'Atualize o app para ler o aviso atual.';
  end if;

  if p_scope = 'team_activation' then
    if p_team_id is null or not public.has_team_role(auth.uid(), p_team_id, 'admin') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    -- Aceite de um texto anterior deixa de valer (fica no histórico).
    update public.assistant_ai_consents
       set revoked_at = now()
     where team_id = p_team_id and scope = 'team_activation' and revoked_at is null and text_version <> v_version;
    insert into public.assistant_ai_consents (team_id, profile_id, scope, text_version)
    values (p_team_id, v_profile, 'team_activation', v_version)
    on conflict do nothing;
    return jsonb_build_object('ok', true, 'scope', p_scope, 'team_id', p_team_id,
      'state', public.assistant_team_consent_state(p_team_id), 'version', v_version);
  end if;

  if p_team_id is not null then
    raise exception 'invalid_scope' using errcode = '22023';
  end if;
  update public.assistant_ai_consents
     set revoked_at = now()
   where profile_id = v_profile and scope = 'member_link' and revoked_at is null and text_version <> v_version;
  insert into public.assistant_ai_consents (profile_id, scope, text_version)
  values (v_profile, 'member_link', v_version)
  on conflict do nothing;
  delete from public.assistant_ai_opt_outs where profile_id = v_profile;
  -- Decidiu: a tolerância de quem já usava deixa de importar.
  delete from public.assistant_ai_legacy_members where profile_id = v_profile;
  return jsonb_build_object('ok', true, 'scope', p_scope, 'state', 'granted', 'version', v_version);
end;
$$;

-- Base: 20261003133000_assistant_ai_consent.sql
create or replace function public.assistant_create_link_code()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := (select id from public.profiles where user_id = auth.uid() limit 1);
  v_code    text;
  v_expires timestamptz := now() + interval '1 hour';
begin
  if not public.my_team_data_allowed() then
    raise exception 'Autorize sua participação no +Louvor antes de usar este recurso do Asafe.'
      using errcode = '42501', hint = 'TEAM_DATA_CONSENT_REQUIRED';
  end if;
  if v_profile is null then
    raise exception 'no_profile' using errcode = '42501';
  elsif not public.assistant_member_consent_valid(v_profile) then
    raise exception 'consent_required' using errcode = 'P0001', hint = 'Aceite o aviso de IA antes de vincular.';
  end if;
  delete from public.assistant_link_codes where profile_id = v_profile and used_at is null;
  v_code := public.assistant_new_code('assistant_link_codes');
  insert into public.assistant_link_codes (code, profile_id, expires_at) values (v_code, v_profile, v_expires);
  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end;
$$;

revoke all on function public.assistant_team_overview(uuid), public.assistant_create_activation_code(uuid),
  public.assistant_update_instructions(uuid,text), public.assistant_notification_settings(uuid),
  public.assistant_set_notification(uuid,text,boolean), public.assistant_missions_overview(uuid),
  public.assistant_set_mission_state(uuid,text,text), public.give_assistant_consent(text,uuid,text),
  public.assistant_create_link_code() from public, anon;
grant execute on function public.assistant_team_overview(uuid), public.assistant_create_activation_code(uuid),
  public.assistant_update_instructions(uuid,text), public.assistant_notification_settings(uuid),
  public.assistant_set_notification(uuid,text,boolean), public.assistant_missions_overview(uuid),
  public.assistant_set_mission_state(uuid,text,text), public.give_assistant_consent(text,uuid,text),
  public.assistant_create_link_code() to authenticated, service_role;

notify pgrst, 'reload schema';
