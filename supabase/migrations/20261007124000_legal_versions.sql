create or replace function public.legal_current_versions()
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('terms','2026-10-07','privacy','2026-10-07')
$$;
revoke all on function public.legal_current_versions() from public;
grant execute on function public.legal_current_versions() to anon,authenticated,service_role;
notify pgrst,'reload schema';
