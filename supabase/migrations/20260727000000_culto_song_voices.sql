-- ============================================================================
-- Vozes por canção (+Louvor)
--
-- A escala do culto diz QUEM canta (culto_lineup.instrument = naipe). Esta
-- tabela diz, canção a canção, QUAL VOZ da música cada vocalista faz
-- (1ª, 2ª, 3ª...) — coisa diferente de naipe.
--
--   * várias pessoas podem estar na mesma voz;
--   * a mesma pessoa faz no máximo uma voz por canção (unique abaixo);
--   * voice_part guarda o naipe SÓ quando difere do naipe da escala naquela
--     canção (null = herda de culto_lineup.instrument).
--
-- Idempotente: seguro rodar mais de uma vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tabela
-- ----------------------------------------------------------------------------
create table if not exists public.culto_song_voices (
  id             uuid primary key default gen_random_uuid(),
  culto_song_id  uuid not null references public.culto_songs(id)  on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  voice          integer not null default 1,
  voice_part     text,
  created_at     timestamptz not null default now(),
  unique (culto_song_id, team_member_id)
);

-- CHECK sempre drop-then-add (add constraint puro quebra na reaplicação).
alter table public.culto_song_voices drop constraint if exists culto_song_voices_voice_check;
alter table public.culto_song_voices add constraint culto_song_voices_voice_check
  check (voice between 1 and 8);

comment on column public.culto_song_voices.voice is
  'Voz da canção: 1 = 1a voz, 2 = 2a voz, ... Nao e naipe.';
comment on column public.culto_song_voices.voice_part is
  'Naipe nesta cancao quando difere do naipe da escala. null = herda de culto_lineup.instrument. Espelha VOICE_PARTS em src/data/instruments.ts.';

-- ----------------------------------------------------------------------------
-- 2) Índices
-- ----------------------------------------------------------------------------
create index if not exists culto_song_voices_culto_song_id_idx
  on public.culto_song_voices(culto_song_id);
create index if not exists culto_song_voices_team_member_id_idx
  on public.culto_song_voices(team_member_id);

-- ----------------------------------------------------------------------------
-- 3) RLS + grants  (mesmo recurso das demais tabelas do culto: 'cultos')
-- ----------------------------------------------------------------------------
alter table public.culto_song_voices enable row level security;

grant select, insert, update, delete, references, trigger, truncate
  on public.culto_song_voices to anon, authenticated, postgres, service_role;

drop policy if exists "Members can view culto song voices" on public.culto_song_voices;
create policy "Members can view culto song voices" on public.culto_song_voices for select
  using (member_can(
    auth.uid(),
    (select c.team_id from public.cultos c
       join public.culto_songs cs on cs.culto_id = c.id
      where cs.id = culto_song_voices.culto_song_id),
    'cultos', 'ver'));

drop policy if exists "Editors can insert culto song voices" on public.culto_song_voices;
create policy "Editors can insert culto song voices" on public.culto_song_voices for insert
  with check (member_can(
    auth.uid(),
    (select c.team_id from public.cultos c
       join public.culto_songs cs on cs.culto_id = c.id
      where cs.id = culto_song_voices.culto_song_id),
    'cultos', 'editar'));

drop policy if exists "Editors can update culto song voices" on public.culto_song_voices;
create policy "Editors can update culto song voices" on public.culto_song_voices for update
  using (member_can(
    auth.uid(),
    (select c.team_id from public.cultos c
       join public.culto_songs cs on cs.culto_id = c.id
      where cs.id = culto_song_voices.culto_song_id),
    'cultos', 'editar'));

drop policy if exists "Editors can delete culto song voices" on public.culto_song_voices;
create policy "Editors can delete culto song voices" on public.culto_song_voices for delete
  using (member_can(
    auth.uid(),
    (select c.team_id from public.cultos c
       join public.culto_songs cs on cs.culto_id = c.id
      where cs.id = culto_song_voices.culto_song_id),
    'cultos', 'editar'));

-- ----------------------------------------------------------------------------
-- 4) Recarrega o schema cache do PostgREST  (SEMPRE por último)
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';
