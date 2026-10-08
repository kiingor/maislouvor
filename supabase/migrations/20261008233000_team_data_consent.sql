-- Consentimento individual, destacado e revogável; nunca herdado do líder/OAuth.
create schema if not exists private;
grant usage on schema private to authenticated,service_role;
create or replace function public.team_data_consent_version() returns text language sql immutable as $$ select '2026-10-08'::text $$;
create table if not exists public.team_data_consents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  text_version text not null,
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= accepted_at)
);
-- O seed usa apenas identidades fictícias marcadas; não confundir fixtures com
-- a manifestação de uma pessoa real. O cliente não pode gravar esta coluna.
alter table public.team_data_consents add column if not exists source text not null default 'app'
  check (source in ('app','review_fixture'));
create unique index if not exists team_data_consent_active on public.team_data_consents(profile_id) where revoked_at is null;
alter table public.team_data_consents enable row level security;
revoke all on public.team_data_consents from public, anon, authenticated;
grant select on public.team_data_consents to authenticated;
grant all on public.team_data_consents to service_role;
drop policy if exists own_team_data_consent on public.team_data_consents;
create policy own_team_data_consent on public.team_data_consents for select to authenticated using (profile_id=public.get_my_profile_id());

create or replace function private.team_data_allowed(p_profile_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.team_data_consents where profile_id=p_profile_id
    and text_version=public.team_data_consent_version() and revoked_at is null)
$$;
create or replace function public.my_team_data_allowed() returns boolean
language sql stable security definer set search_path=public as $$
  select private.team_data_allowed(public.get_my_profile_id())
$$;
create or replace function public.my_team_data_consent() returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('allowed',public.my_team_data_allowed(),'version',public.team_data_consent_version(),
    'accepted_at',(select accepted_at from public.team_data_consents where profile_id=public.get_my_profile_id()
      and revoked_at is null and text_version=public.team_data_consent_version()))
$$;
create or replace function public.set_my_team_data_consent(p_allow boolean,p_version text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_profile uuid;
begin
  select id into v_profile from public.profiles where user_id=auth.uid() for update;
  if v_profile is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
  if p_allow is null or p_version is distinct from public.team_data_consent_version() then
    raise exception 'Atualize o aviso de privacidade.' using errcode='22023'; end if;
  if p_allow then
    if not private.team_data_allowed(v_profile) then
      update public.team_data_consents set revoked_at=now() where profile_id=v_profile and revoked_at is null;
      insert into public.team_data_consents(profile_id,text_version) values(v_profile,p_version);
    end if;
  else
    update public.team_data_consents set revoked_at=now() where profile_id=v_profile and revoked_at is null;
    -- Voltar a participar não reativa automaticamente o Asafe.
    update public.assistant_ai_consents set revoked_at=now() where profile_id=v_profile and revoked_at is null;
    insert into public.assistant_ai_opt_outs(profile_id) values(v_profile) on conflict do nothing;
  end if;
  return public.my_team_data_consent();
end $$;
revoke all on function private.team_data_allowed(uuid),public.my_team_data_allowed(),public.my_team_data_consent(),public.set_my_team_data_consent(boolean,text) from public,anon;
grant execute on function private.team_data_allowed(uuid),public.my_team_data_allowed(),public.my_team_data_consent(),public.set_my_team_data_consent(boolean,text) to authenticated,service_role;

-- O servidor protege os acessos mesmo com um cliente antigo. Não alteramos os
-- guardas de propriedade/liderança nem as rotas de suporte, assinatura e exclusão.
do $$ declare t text; begin
  foreach t in array array['teams','team_members','songs','song_tracks','song_audio_attachments','repertorios','repertorio_songs',
    'cultos','culto_songs','culto_blocks','culto_lineup','culto_song_voices','channels','messages','notifications','member_availability','team_join_requests','song_loop_points'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists team_data_consent_required on public.%I',t);
      execute format('create policy team_data_consent_required on public.%I as restrictive for all to authenticated using (public.my_team_data_allowed()) with check (public.my_team_data_allowed())',t);
    end if;
  end loop;
end $$;
-- O próprio perfil fica disponível para direitos e gestão da conta.
drop policy if exists teammate_profile_consent on public.profiles;
create policy teammate_profile_consent on public.profiles as restrictive for select to authenticated
using (user_id=auth.uid() or (public.my_team_data_allowed() and private.team_data_allowed(id)));
drop policy if exists teammate_membership_consent on public.team_members;
create policy teammate_membership_consent on public.team_members as restrictive for select to authenticated
using (profile_id=public.get_my_profile_id() or private.team_data_allowed(profile_id));

create or replace function public.guard_team_data_subject() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_profile uuid;
begin
  if tg_table_name in ('team_members','team_join_requests') then v_profile:=new.profile_id;
  else select profile_id into v_profile from public.team_members where id=new.team_member_id; end if;
  if not private.team_data_allowed(v_profile) then
    raise exception 'A pessoa precisa autorizar sua participação no +Louvor antes de entrar em uma equipe ou escala.'
      using errcode='42501',hint='TEAM_DATA_CONSENT_REQUIRED';
  end if;
  return new;
end $$;
-- Só vínculos novos/mudança da pessoa. Mudanças de papel para exercer o direito
-- de exclusão continuam possíveis pelas RPCs autenticadas abaixo.
drop trigger if exists team_member_data_consent on public.team_members;
create trigger team_member_data_consent before insert or update of profile_id,team_id on public.team_members
for each row execute function public.guard_team_data_subject();
drop trigger if exists team_join_data_consent on public.team_join_requests;
create trigger team_join_data_consent before insert or update of profile_id,team_id on public.team_join_requests
for each row execute function public.guard_team_data_subject();
drop trigger if exists lineup_data_consent on public.culto_lineup;
create trigger lineup_data_consent before insert or update of team_member_id,culto_id on public.culto_lineup
for each row execute function public.guard_team_data_subject();
drop trigger if exists availability_data_consent on public.member_availability;
create trigger availability_data_consent before insert or update of team_member_id,available_date on public.member_availability
for each row execute function public.guard_team_data_subject();
do $$ begin
  if to_regclass('public.culto_song_voices') is not null then
    execute 'drop trigger if exists voice_data_consent on public.culto_song_voices';
    execute 'create trigger voice_data_consent before insert or update of team_member_id on public.culto_song_voices for each row execute function public.guard_team_data_subject()';
  end if;
end $$;

-- Liberações antigas do Asafe não substituem esta escolha.
create or replace function public.assistant_member_ai_allowed(p_team_id uuid,p_profile_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select private.team_data_allowed(p_profile_id) and public.assistant_member_consent_valid(p_profile_id)
    and not exists(select 1 from public.assistant_ai_opt_outs where profile_id=p_profile_id)
$$;

-- Uma pessoa pode preparar a exclusão mesmo depois de retirar o consentimento.
create or replace function public.account_deletion_promote_leader(p_team_id uuid,p_profile_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.get_my_profile_id();
begin
  perform 1 from public.teams where id=p_team_id for update;
  if v_me is null or v_me=p_profile_id or not public.has_team_role(auth.uid(),p_team_id,'admin')
    or exists(select 1 from public.team_members where team_id=p_team_id and role='admin' and profile_id<>v_me)
    or not exists(select 1 from public.team_members where team_id=p_team_id and profile_id=p_profile_id) then
      raise exception 'Operação disponível apenas ao único líder para preparar a exclusão.' using errcode='42501';
  end if;
  update public.team_members set role='admin',permissions='{}' where team_id=p_team_id and profile_id=p_profile_id;
end $$;
revoke all on function public.account_deletion_promote_leader(uuid,uuid) from public,anon;
grant execute on function public.account_deletion_promote_leader(uuid,uuid) to authenticated;

create or replace function public.team_data_allowed_profiles(p_profile_ids uuid[]) returns setof uuid
language sql stable security definer set search_path=public as $$
  select id from public.profiles where id=any(p_profile_ids) and private.team_data_allowed(id)
$$;
revoke all on function public.team_data_allowed_profiles(uuid[]) from public,anon,authenticated;
grant execute on function public.team_data_allowed_profiles(uuid[]) to service_role;
CREATE OR REPLACE FUNCTION public.member_can(
  _user_id uuid,
  _team_id uuid,
  _resource text,
  _action text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role     team_role;
  v_perms    jsonb;
  v_override jsonb;
BEGIN
  IF NOT private.team_data_allowed((SELECT id FROM public.profiles WHERE user_id=_user_id LIMIT 1)) THEN RETURN false; END IF;
  SELECT tm.role, COALESCE(tm.permissions, '{}'::jsonb)
    INTO v_role, v_perms
  FROM public.team_members tm
  WHERE tm.team_id = _team_id
    AND tm.profile_id = (SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1)
  LIMIT 1;

  -- não é membro da equipe
  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  -- líder = acesso total
  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  -- exceção explícita do membro?
  v_override := v_perms -> _resource -> _action;
  IF v_override IS NOT NULL THEN
    RETURN (v_override #>> '{}')::boolean;
  END IF;

  -- defaults do preset (devem casar com defaultFor() no frontend)
  IF _action = 'ver' THEN
    RETURN true;                                  -- editor e viewer enxergam tudo
  ELSIF _action = 'editar' THEN
    IF v_role = 'editor' THEN
      RETURN (_resource <> 'membros');            -- editor edita conteúdo, não gerencia membros
    ELSE
      RETURN false;                               -- viewer não edita nada
    END IF;
  END IF;

  RETURN false;
END;
$function$;
create or replace function public.is_team_member(_user_id uuid,_team_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.team_members m join public.profiles p on p.id=m.profile_id
    where p.user_id=_user_id and m.team_id=_team_id and private.team_data_allowed(p.id))
$$;
create or replace function public.can_edit_team(_user_id uuid,_team_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.team_members m join public.profiles p on p.id=m.profile_id
    where p.user_id=_user_id and m.team_id=_team_id and m.role in ('admin','editor') and private.team_data_allowed(p.id))
$$;
create or replace function public.guard_notification_data_consent() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.team_id is not null and not private.team_data_allowed(new.profile_id) then return null; end if;
  return new;
end $$;
drop trigger if exists notification_data_consent on public.notifications;
create trigger notification_data_consent before insert on public.notifications for each row execute function public.guard_notification_data_consent();
notify pgrst,'reload schema';
