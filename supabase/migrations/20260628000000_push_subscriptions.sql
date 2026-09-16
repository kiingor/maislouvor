-- ============================================================================
-- Web Push (VAPID) — assinaturas de push do navegador/PWA.  (+Louvor)
-- O envio é feito pela edge function send-push (chave VAPID privada fica no
-- servidor). Aqui guardamos as assinaturas (endpoint + chaves) por profile.
-- ============================================================================

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- O usuário enxerga/remove apenas as próprias assinaturas.
drop policy if exists "own push subs - select" on public.push_subscriptions;
create policy "own push subs - select" on public.push_subscriptions for select to authenticated
  using (profile_id = (select id from public.profiles where user_id = auth.uid() limit 1));

drop policy if exists "own push subs - delete" on public.push_subscriptions;
create policy "own push subs - delete" on public.push_subscriptions for delete to authenticated
  using (profile_id = (select id from public.profiles where user_id = auth.uid() limit 1));

grant select, delete on public.push_subscriptions to authenticated;

-- Salvar/atualizar assinatura via RPC (security definer) — resolve o caso de
-- troca de usuário no MESMO navegador (mesmo endpoint, profile diferente),
-- que a RLS de update bloquearia.
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid;
begin
  v_profile := (select id from public.profiles where user_id = auth.uid() limit 1);
  if v_profile is null then
    return;
  end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (v_profile, p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id,
        p256dh     = excluded.p256dh,
        auth       = excluded.auth,
        user_agent = excluded.user_agent;
end;
$$;

grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- service_role (edge function send-push) gerencia tudo
grant select, insert, update, delete on public.push_subscriptions to service_role;

notify pgrst, 'reload schema';
