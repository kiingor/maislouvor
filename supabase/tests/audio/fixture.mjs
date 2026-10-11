import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
export async function createAudioDb() {
const db = new PGlite();
const migration = n => readFile(new URL(`../../migrations/${n}`, import.meta.url), 'utf8');
const consent = await migration('20261008233000_team_data_consent.sql');
const memberCan = consent.slice(consent.indexOf('CREATE OR REPLACE FUNCTION public.member_can('), consent.indexOf('create or replace function public.is_team_member'));
const moderation = await migration('20261007123000_content_reports_and_provenance.sql');
const moderatedFile = moderation.slice(moderation.indexOf('create or replace function public.moderated_song_file'), moderation.indexOf('drop policy if exists "Hide moderated song files"'));
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private; create schema storage;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('fixture.actor',true),'')::uuid$$;
create type team_role as enum('admin','editor','viewer');
create table profiles(id uuid primary key,user_id uuid);
create table team_members(team_id uuid,profile_id uuid,role team_role,permissions jsonb default '{}');
create table consents(profile_id uuid,allowed boolean);
create function private.team_data_allowed(p uuid) returns boolean language sql stable as $$select coalesce((select allowed from consents where profile_id=p),false)$$;
create function is_platform_admin() returns boolean language sql stable as $$select false$$;
create table songs(id uuid primary key,title text,created_at timestamptz default clock_timestamp(),team_id uuid,audio_path text,cover_path text,audio_revision uuid,stems_job_id text,stems_status text,stems_error text,moderation_blocked boolean default false);
create table song_tracks(id uuid primary key default gen_random_uuid(),song_id uuid references songs on delete cascade,audio_path text,track_name text,sort_order integer);
create table song_audio_attachments(id uuid primary key default gen_random_uuid(),song_id uuid,audio_path text);
create table yt_audio_cache(storage_path text);
create table repertorios(id uuid primary key,team_id uuid);
create table cultos(id uuid primary key,team_id uuid);
create table repertorio_songs(id uuid default gen_random_uuid(),repertorio_id uuid,song_id uuid,sort_order integer default 0,created_at timestamptz default now());
create table culto_songs(id uuid default gen_random_uuid(),culto_id uuid,song_id uuid,sort_order integer default 0,notes text,key_override text,created_at timestamptz default now());
create table storage.buckets(id text primary key,public boolean);
insert into storage.buckets values('audio',true);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{"size":4}',version text default 'v1',unique(bucket_id,name));
alter table storage.objects enable row level security;
grant all on storage.objects to anon,authenticated,service_role;
-- Simulates an accidentally permissive old policy. Restrictive fences still win.
create policy "legacy broad grant" on storage.objects for all using(true) with check(true);
alter table songs enable row level security;
create policy "legacy shared catalogue" on songs for all using(true) with check(true);
${memberCan}
-- Other bucket policies still contain UUID casts (as in production).
create policy "other bucket UUID cast" on storage.objects for select to authenticated
 using(bucket_id='chat' and public.member_can(auth.uid(),split_part(name,'/',1)::uuid,'chat','ver'));
${moderatedFile}
${await migration('20261010010000_stem_job_fencing.sql')}
create trigger invalidate_song_audio_tracks before update of audio_path,audio_revision on songs for each row execute function invalidate_song_audio_tracks();
${await migration('20261010020000_private_audio_assets.sql')}`);
return db;
}
