-- ============================================================================
-- Chat overhaul: team channels + message attachments (text/audio/image) + bucket
-- Idempotent.
-- ============================================================================

-- 1. channels: leader-managed chat channels per team
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid references public.profiles(id),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists channels_team_id_idx on public.channels(team_id);

alter table public.channels enable row level security;
grant select, insert, update, delete, references, trigger, truncate
  on public.channels to anon, authenticated, postgres, service_role;

drop policy if exists "Members can view channels" on public.channels;
create policy "Members can view channels" on public.channels for select
  using (is_team_member(auth.uid(), team_id));
drop policy if exists "Editors can add channels" on public.channels;
create policy "Editors can add channels" on public.channels for insert
  with check (can_edit_team(auth.uid(), team_id));
drop policy if exists "Editors can update channels" on public.channels;
create policy "Editors can update channels" on public.channels for update
  using (can_edit_team(auth.uid(), team_id));
drop policy if exists "Editors can delete channels" on public.channels;
create policy "Editors can delete channels" on public.channels for delete
  using (can_edit_team(auth.uid(), team_id));

-- 2. messages: channel + attachment support
alter table public.messages add column if not exists channel_id uuid references public.channels(id) on delete cascade;
alter table public.messages add column if not exists message_type text not null default 'text';
alter table public.messages add column if not exists attachment_path text;
alter table public.messages alter column content drop not null;

-- 3. realtime: channels list updates live (messages already published)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'channels'
  ) then
    alter publication supabase_realtime add table public.channels;
  end if;
end $$;

-- 4. storage bucket for chat attachments (public, like avatars)
insert into storage.buckets (id, name, public)
  values ('chat', 'chat', true)
  on conflict (id) do nothing;

drop policy if exists "Anyone can view chat media" on storage.objects;
create policy "Anyone can view chat media" on storage.objects for select
  using (bucket_id = 'chat');
drop policy if exists "Authenticated can upload chat media" on storage.objects;
create policy "Authenticated can upload chat media" on storage.objects for insert
  to authenticated with check (bucket_id = 'chat');
drop policy if exists "Authenticated can delete own chat media" on storage.objects;
create policy "Authenticated can delete own chat media" on storage.objects for delete
  to authenticated using (bucket_id = 'chat' and owner = auth.uid());

notify pgrst, 'reload schema';
