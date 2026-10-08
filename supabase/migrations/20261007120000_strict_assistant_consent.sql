-- Sem tolerância: dados pessoais só chegam à IA após consentimento atual.
-- Mantém as migrações anteriores como histórico e funciona em bancos já migrados.
create or replace function public.assistant_team_consent_state(p_team_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when public.assistant_team_consent_valid(p_team_id) then 'granted'
    when exists (select 1 from public.assistant_groups where team_id = p_team_id and active) then 'blocked'
    else 'none' end
$$;
create or replace function public.assistant_member_ai_allowed(p_team_id uuid, p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = p_profile_id
    and public.assistant_member_consent_valid(p.id)
    and not exists (select 1 from public.assistant_ai_opt_outs o where o.profile_id = p.id))
$$;
update public.assistant_config set ai_member_consent_required = true, ai_consent_required_from = now() where id;
revoke all on function public.assistant_team_consent_state(uuid), public.assistant_member_ai_allowed(uuid, uuid) from public, anon, authenticated;
grant execute on function public.assistant_team_consent_state(uuid), public.assistant_member_ai_allowed(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
