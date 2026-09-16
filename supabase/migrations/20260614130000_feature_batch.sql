-- ============================================================================
-- +Louvor feature batch — schema additions for:
--   Meu Usuário (contact, notification prefs, instrument levels)
--   Culto (roteiro blocks, tom por culto, public share)
--   /present + Song (bpm, duration for metronome and running-time)
-- Idempotent: safe to run more than once.
-- ============================================================================

-- 1. songs: tempo + length (metronome / click track + running-time planning)
alter table public.songs add column if not exists bpm integer;
alter table public.songs add column if not exists duration_seconds integer;

-- 2. culto_songs: per-service key override ("tom por culto")
alter table public.culto_songs add column if not exists key_override text;

-- 3. profiles: contact + notification preferences
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

-- 4. team_members: skill level per instrument (e.g. {"violao":"avancado","teclado":"aprendendo"})
alter table public.team_members add column if not exists instrument_levels jsonb not null default '{}'::jsonb;

-- 5. cultos: public read-only share of the roteiro/escala (mirrors repertorios pattern)
alter table public.cultos add column if not exists is_public boolean not null default false;
alter table public.cultos add column if not exists public_token text;
create unique index if not exists cultos_public_token_key on public.cultos(public_token) where public_token is not null;

-- 6. culto_blocks: non-song moments in the service roteiro (Abertura, Oração, Palavra, Ministração...)
create table if not exists public.culto_blocks (
  id uuid primary key default gen_random_uuid(),
  culto_id uuid not null references public.cultos(id) on delete cascade,
  title text not null,
  kind text not null default 'moment',
  duration_min integer not null default 5,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists culto_blocks_culto_id_idx on public.culto_blocks(culto_id);

alter table public.culto_blocks enable row level security;

grant select, insert, update, delete, references, trigger, truncate
  on public.culto_blocks to anon, authenticated, postgres, service_role;

drop policy if exists "Members can view culto blocks" on public.culto_blocks;
create policy "Members can view culto blocks" on public.culto_blocks for select
  using (is_team_member(auth.uid(), (select cultos.team_id from cultos where cultos.id = culto_blocks.culto_id)));

drop policy if exists "Editors can add culto blocks" on public.culto_blocks;
create policy "Editors can add culto blocks" on public.culto_blocks for insert
  with check (can_edit_team(auth.uid(), (select cultos.team_id from cultos where cultos.id = culto_blocks.culto_id)));

drop policy if exists "Editors can update culto blocks" on public.culto_blocks;
create policy "Editors can update culto blocks" on public.culto_blocks for update
  using (can_edit_team(auth.uid(), (select cultos.team_id from cultos where cultos.id = culto_blocks.culto_id)));

drop policy if exists "Editors can delete culto blocks" on public.culto_blocks;
create policy "Editors can delete culto blocks" on public.culto_blocks for delete
  using (can_edit_team(auth.uid(), (select cultos.team_id from cultos where cultos.id = culto_blocks.culto_id)));

-- reload PostgREST schema cache so the new table/columns are exposed via the API
notify pgrst, 'reload schema';
