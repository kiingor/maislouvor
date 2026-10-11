-- Preserve explicitly shared songs already used before the private-library rollout.
-- This is a closed snapshot of existing associations, not a new shared catalogue.
create table if not exists private.legacy_song_links (
  kind text not null check (kind in ('culto','repertorio')),
  link_id uuid not null,
  container_id uuid not null,
  song_id uuid not null references public.songs(id) on delete cascade,
  team_id uuid not null,
  source_team_id uuid not null,
  primary key (kind,link_id)
);
create index if not exists legacy_song_links_song_idx on private.legacy_song_links(song_id);
create table if not exists private.legacy_song_links_snapshot (
  singleton boolean primary key default true check(singleton)
);
revoke all on private.legacy_song_links,private.legacy_song_links_snapshot from public,anon,authenticated;

do $$ begin
  if not exists(select 1 from private.legacy_song_links_snapshot) then
    -- Some installations never had the old sharing feature. They get no grants.
    if to_regclass('public.song_read_shares') is not null then
      execute $snapshot$
        insert into private.legacy_song_links(kind,link_id,container_id,song_id,team_id,source_team_id)
        select 'repertorio',rs.id,r.id,s.id,r.team_id,s.team_id
          from public.repertorio_songs rs join public.repertorios r on r.id=rs.repertorio_id
          join public.songs s on s.id=rs.song_id
          join public.song_read_shares sh on sh.song_id=s.id and sh.team_id=r.team_id
          cross join private.audio_asset_activation a
          where s.team_id<>r.team_id and sh.created_at<a.activated_at and rs.created_at<a.activated_at
        union all
        select 'culto',cs.id,c.id,s.id,c.team_id,s.team_id
          from public.culto_songs cs join public.cultos c on c.id=cs.culto_id
          join public.songs s on s.id=cs.song_id
          join public.song_read_shares sh on sh.song_id=s.id and sh.team_id=c.team_id
          cross join private.audio_asset_activation a
          where s.team_id<>c.team_id and sh.created_at<a.activated_at and cs.created_at<a.activated_at
        on conflict do nothing
      $snapshot$;
    end if;
    insert into private.legacy_song_links_snapshot values(true);
  end if;
end $$;

create or replace function public.can_read_legacy_team_song(p_song_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from private.legacy_song_links l
      join public.songs s on s.id=l.song_id and s.team_id=l.source_team_id
    where l.song_id=p_song_id and not s.moderation_blocked and (
      (l.kind='culto' and public.member_can(auth.uid(),l.team_id,'cultos','ver') is true
        and exists(select 1 from public.culto_songs cs join public.cultos c on c.id=cs.culto_id
          where cs.id=l.link_id and cs.song_id=l.song_id and c.id=l.container_id and c.team_id=l.team_id))
      or (l.kind='repertorio' and public.member_can(auth.uid(),l.team_id,'repertorios','ver') is true
        and exists(select 1 from public.repertorio_songs rs join public.repertorios r on r.id=rs.repertorio_id
          where rs.id=l.link_id and rs.song_id=l.song_id and r.id=l.container_id and r.team_id=l.team_id))
    )
  )
$$;
revoke all on function public.can_read_legacy_team_song(uuid) from public,anon;
grant execute on function public.can_read_legacy_team_song(uuid) to authenticated;

-- Existing permissive sharing policies use the same closed set.
create or replace function public.can_read_shared_song(_song_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.can_read_legacy_team_song(_song_id)
$$;
revoke all on function public.can_read_shared_song(uuid) from public,anon;
grant execute on function public.can_read_shared_song(uuid) to authenticated;
drop policy if exists "Private team song fence" on public.songs;
create policy "Private team song fence" on public.songs as restrictive for select to authenticated
  using (public.member_can(auth.uid(),team_id,'musicas','ver') is true or public.can_read_legacy_team_song(id));
drop policy if exists "Existing team song links" on public.songs;
create policy "Existing team song links" on public.songs for select to authenticated
  using (public.can_read_legacy_team_song(id));
drop policy if exists "Existing team stem links" on public.song_tracks;
create policy "Existing team stem links" on public.song_tracks for select to authenticated
  using (public.can_read_legacy_team_song(song_id));

create or replace function public.revoke_legacy_song_links()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from private.legacy_song_links where song_id=old.song_id and team_id=old.team_id;
  return old;
end $$;
revoke all on function public.revoke_legacy_song_links() from public,anon,authenticated;
do $$ begin
  if to_regclass('public.song_read_shares') is not null then
    execute 'drop trigger if exists revoke_legacy_song_links on public.song_read_shares';
    execute 'create trigger revoke_legacy_song_links after delete or update on public.song_read_shares
      for each row execute function public.revoke_legacy_song_links()';
  end if;
end $$;

-- Notes, key overrides and ordering may change without replacing an old song.
-- New cross-team links (including changing a link's song/container/id) stay blocked.
create or replace function public.guard_song_team_link()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_team uuid; v_song_team uuid; v_container uuid; v_kind text; v_unchanged boolean:=false;
begin
  select team_id into v_song_team from public.songs where id=new.song_id;
  if tg_table_name='repertorio_songs' then
    v_kind:='repertorio'; v_container:=new.repertorio_id;
    select team_id into v_team from public.repertorios where id=v_container;
    if tg_op='UPDATE' then v_unchanged:=new.repertorio_id=old.repertorio_id; end if;
  else
    v_kind:='culto'; v_container:=new.culto_id;
    select team_id into v_team from public.cultos where id=v_container;
    if tg_op='UPDATE' then v_unchanged:=new.culto_id=old.culto_id; end if;
  end if;
  if v_team is not null and v_song_team=v_team then return new; end if;
  if tg_op='UPDATE' and v_unchanged then
    if new.id=old.id and new.song_id=old.song_id and exists (
      select 1 from private.legacy_song_links where kind=v_kind and link_id=old.id
        and container_id=v_container and song_id=new.song_id and team_id=v_team and source_team_id=v_song_team
    ) then return new; end if;
  end if;
  raise exception 'Escolha uma música da biblioteca desta equipe.' using errcode='42501';
end $$;

create or replace function public.can_read_private_audio(p_path text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_team uuid;
begin
  if auth.uid() is null or p_path is null or p_path ~ '(^|/)\.\.(/|$)' then return false; end if;
  if starts_with(p_path,'_audio/') then
    return exists(select 1 from public.songs s where not s.moderation_blocked
      and s.created_at >= (select activated_at from private.audio_asset_activation)
      and public.member_can(auth.uid(),s.team_id,'musicas','ver') is true
      and (s.audio_path=p_path or exists(select 1 from public.song_tracks t where t.song_id=s.id and t.audio_path=p_path)));
  end if;
  if split_part(p_path,'/',1) !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then return false; end if;
  v_team:=split_part(p_path,'/',1)::uuid;
  if public.moderated_song_file('audio',p_path) then return false; end if;
  if public.member_can(auth.uid(),v_team,'musicas','ver') is true then return true; end if;
  -- Exact referenced objects only: a shared song never exposes its source folder.
  return exists(select 1 from public.songs s where s.team_id=v_team and not s.moderation_blocked
    and public.can_read_legacy_team_song(s.id)
    and (s.audio_path=p_path or exists(select 1 from public.song_tracks t where t.song_id=s.id and t.audio_path=p_path)));
end $$;

notify pgrst,'reload schema';
