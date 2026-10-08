-- Apenas service_role. AES-GCM com chave externa ao banco e vínculo ao UUID.
create table if not exists public.apple_auth_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted jsonb not null,
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.apple_auth_tokens enable row level security;
revoke all on public.apple_auth_tokens from public, anon, authenticated;
grant all on public.apple_auth_tokens to service_role;
notify pgrst, 'reload schema';
