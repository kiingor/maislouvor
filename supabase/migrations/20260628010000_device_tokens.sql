-- ============================================================================
-- Tokens FCM (push nativo Android via Firebase Cloud Messaging).  (+Louvor)
-- Complementa push_subscriptions (Web Push). A edge function send-push envia
-- pros dois: navegador/PWA (web-push/VAPID) e app nativo (FCM HTTP v1).
-- ============================================================================

create table if not exists public.device_tokens (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  token       text not null unique,
  platform    text not null default 'android',
  created_at  timestamptz not null default now()
);

alter table public.device_tokens enable row level security;

drop policy if exists "own device tokens - select" on public.device_tokens;
create policy "own device tokens - select" on public.device_tokens for select to authenticated
  using (profile_id = (select id from public.profiles where user_id = auth.uid() limit 1));

drop policy if exists "own device tokens - delete" on public.device_tokens;
create policy "own device tokens - delete" on public.device_tokens for delete to authenticated
  using (profile_id = (select id from public.profiles where user_id = auth.uid() limit 1));

grant select, delete on public.device_tokens to authenticated;
grant select, insert, update, delete on public.device_tokens to service_role;

-- Salva/atualiza token via RPC (resolve troca de usuário no mesmo aparelho).
create or replace function public.save_device_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid;
begin
  v_profile := (select id from public.profiles where user_id = auth.uid() limit 1);
  if v_profile is null or p_token is null or length(p_token) < 10 then
    return;
  end if;
  insert into public.device_tokens (profile_id, token, platform)
  values (v_profile, p_token, coalesce(p_platform, 'android'))
  on conflict (token) do update
    set profile_id = excluded.profile_id, platform = excluded.platform;
end;
$$;

grant execute on function public.save_device_token(text, text) to authenticated;

notify pgrst, 'reload schema';
