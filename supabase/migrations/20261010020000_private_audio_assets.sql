-- Audio is private to its team. Physical deduplication is a service-only task;
-- knowing a hash never authorizes a client to attach or read another team's file.
create schema if not exists private;
-- Existing songs (including their current recordings and stems) are excluded.
-- The activation boundary is immutable across redeploys.
create table if not exists private.audio_asset_activation (
  singleton boolean primary key default true check(singleton),
  activated_at timestamptz not null default clock_timestamp()
);
insert into private.audio_asset_activation(singleton) values(true) on conflict do nothing;
revoke all on private.audio_asset_activation from public,anon,authenticated;

create table if not exists private.audio_assets (
  sha256 text primary key check (sha256 ~ '^[a-f0-9]{64}$'),
  path text not null unique,
  byte_size bigint not null check (byte_size > 0),
  created_at timestamptz not null default now(),
  check (path = '_audio/' || sha256)
);
create table if not exists private.retired_audio_paths (
  path text primary key,
  object_version text not null,
  retired_at timestamptz not null default now(),
  removed_at timestamptz
);
revoke all on private.audio_assets, private.retired_audio_paths from public,anon,authenticated;
grant usage on schema private to service_role;
grant all on private.audio_assets, private.retired_audio_paths to service_role;

create index if not exists songs_audio_path_idx on public.songs(audio_path) where audio_path is not null;
create index if not exists song_tracks_audio_path_idx on public.song_tracks(audio_path);

-- Keep the processing origin after moving a stem to a shared physical object.
alter table public.song_tracks add column if not exists generated_stem boolean not null default false;

create or replace function private.audio_path_retired(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.retired_audio_paths where path=p_path)
$$;
revoke all on function private.audio_path_retired(text) from public,anon,authenticated;

create or replace function public.guard_private_audio_reference()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_team uuid; v_song uuid; changed boolean; old_path text;
begin
  if tg_table_name='songs' then
    v_team:=new.team_id; v_song:=new.id;
    if tg_op='UPDATE' then
      old_path:=old.audio_path;
      if auth.uid() is not null and (new.team_id is distinct from old.team_id
          or new.created_at is distinct from old.created_at) then
        raise exception 'A equipe e a data de criação da música devem ser preservadas.' using errcode='42501';
      end if;
    end if;
  else
    v_song:=new.song_id;
    select team_id into v_team from public.songs where id=v_song;
    if tg_op='UPDATE' then
      old_path:=old.audio_path;
      if auth.uid() is not null and (new.song_id is distinct from old.song_id
          or new.generated_stem is distinct from old.generated_stem) then
        raise exception 'A faixa pertence à sua música de origem.' using errcode='42501';
      end if;
    end if;
    if tg_op='INSERT' then
      new.generated_stem:=coalesce(new.audio_path like v_team::text||'/'||v_song::text||'/stems/%',false);
    end if;
  end if;
  changed:=tg_op='INSERT' or new.audio_path is distinct from old_path;
  if changed and new.audio_path is not null then
    if private.audio_path_retired(new.audio_path) then
      raise exception 'Envie o arquivo em um novo endereço.' using errcode='22023';
    end if;
    if starts_with(new.audio_path,'_audio/') then
      if auth.uid() is not null or not exists(select 1 from private.audio_assets where path=new.audio_path) then
        raise exception 'Arquivo compartilhado somente pelo servidor.' using errcode='42501';
      end if;
    elsif auth.uid() is not null and (v_team is null or new.audio_path ~ '(^|/)\.\.(/|$)'
        or not (new.audio_path like v_team::text||'/'||v_song::text||'/%'
          or new.audio_path like v_team::text||'/'||v_song::text||'.%')) then
      raise exception 'O áudio deve pertencer a esta música.' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_private_audio_reference() from public,anon,authenticated;
drop trigger if exists guard_private_audio_reference on public.songs;
create trigger guard_private_audio_reference before insert or update on public.songs
  for each row execute function public.guard_private_audio_reference();
drop trigger if exists guard_private_audio_reference on public.song_tracks;
create trigger guard_private_audio_reference before insert or update on public.song_tracks
  for each row execute function public.guard_private_audio_reference();

-- Also fence attachment paths before the delayed cleanup can run.
create or replace function public.guard_retired_attachment_audio()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (tg_op='INSERT' or new.audio_path is distinct from old.audio_path)
    and private.audio_path_retired(new.audio_path) then
    raise exception 'Envie o arquivo em um novo endereço.' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function public.guard_retired_attachment_audio() from public,anon,authenticated;
drop trigger if exists guard_retired_attachment_audio on public.song_audio_attachments;
create trigger guard_retired_attachment_audio before insert or update on public.song_audio_attachments
  for each row execute function public.guard_retired_attachment_audio();

-- A legitimate storage relink preserves revision, loops and already usable stems.
-- Only the service RPC sets this transaction-local fence; client JWTs never qualify.
create or replace function public.invalidate_song_audio_tracks()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.audio_path is distinct from old.audio_path or new.audio_revision is distinct from old.audio_revision then
    if auth.uid() is null and current_setting('maislouvor.audio_relink_song',true)=new.id::text
      and new.audio_revision is not distinct from old.audio_revision then return new; end if;
    delete from public.song_tracks where song_id=new.id;
    new.stems_status:='idle'; new.stems_error:=null; new.stems_job_id:=null;
  end if;
  return new;
end $$;

-- Existing permissive shares must not expose a different team's library.
drop policy if exists "Private team song fence" on public.songs;
create policy "Private team song fence" on public.songs as restrictive for select to authenticated
  using (public.member_can(auth.uid(),team_id,'musicas','ver') is true);

-- Stronger than hiding a search button: reject a cross-team song association.
create or replace function public.guard_song_team_link()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_team uuid; v_song_team uuid;
begin
  select team_id into v_song_team from public.songs where id=new.song_id;
  if tg_table_name='repertorio_songs' then
    select team_id into v_team from public.repertorios where id=new.repertorio_id;
  else
    select team_id into v_team from public.cultos where id=new.culto_id;
  end if;
  if v_team is null or v_song_team is distinct from v_team then
    raise exception 'Escolha uma música da biblioteca desta equipe.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_song_team_link() from public,anon,authenticated;
drop trigger if exists guard_song_team_link on public.repertorio_songs;
create trigger guard_song_team_link before insert or update on public.repertorio_songs
  for each row execute function public.guard_song_team_link();
drop trigger if exists guard_song_team_link on public.culto_songs;
create trigger guard_song_team_link before insert or update on public.culto_songs
  for each row execute function public.guard_song_team_link();

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
  return public.member_can(auth.uid(),v_team,'musicas','ver') is true
    and not public.moderated_song_file('audio',p_path);
end $$;
revoke all on function public.can_read_private_audio(text) from public,anon;
grant execute on function public.can_read_private_audio(text) to authenticated;

create or replace function public.can_write_private_audio(p_path text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or p_path is null or p_path ~ '(^|/)\.\.(/|$)'
    or split_part(p_path,'/',1) !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    or private.audio_path_retired(p_path) then return false; end if;
  return public.member_can(auth.uid(),split_part(p_path,'/',1)::uuid,'musicas','editar') is true;
end $$;
revoke all on function public.can_write_private_audio(text) from public,anon;
grant execute on function public.can_write_private_audio(text) to authenticated;

update storage.buckets set public=false where id='audio';
drop policy if exists "Team members can view audio" on storage.objects;
drop policy if exists "Editors can upload audio" on storage.objects;
drop policy if exists "Editors can update audio" on storage.objects;
drop policy if exists "Editors can delete audio" on storage.objects;
drop policy if exists "Song readers can play additional audio files" on storage.objects;
drop policy if exists "Private team audio read" on storage.objects;
create policy "Private team audio read" on storage.objects for select to authenticated
  using (bucket_id='audio' and public.can_read_private_audio(name));
drop policy if exists "Private team audio read fence" on storage.objects;
create policy "Private team audio read fence" on storage.objects as restrictive for select to authenticated
  using (bucket_id<>'audio' or public.can_read_private_audio(name));
drop policy if exists "Private audio anonymous fence" on storage.objects;
create policy "Private audio anonymous fence" on storage.objects as restrictive for all to anon
  using (bucket_id<>'audio') with check (bucket_id<>'audio');
drop policy if exists "Private team audio insert" on storage.objects;
create policy "Private team audio insert" on storage.objects for insert to authenticated
  with check (bucket_id='audio' and public.can_write_private_audio(name));
drop policy if exists "Private team audio update" on storage.objects;
create policy "Private team audio update" on storage.objects for update to authenticated
  using (bucket_id='audio' and public.can_write_private_audio(name))
  with check (bucket_id='audio' and public.can_write_private_audio(name));
drop policy if exists "Private team audio delete" on storage.objects;
create policy "Private team audio delete" on storage.objects for delete to authenticated
  using (bucket_id='audio' and public.can_write_private_audio(name));
-- Broad policies on another bucket must not permit a shared object to be changed.
drop policy if exists "Private audio mutation fence" on storage.objects;
create policy "Private audio mutation fence" on storage.objects as restrictive for all to authenticated
  using (bucket_id<>'audio' or public.can_read_private_audio(name))
  with check (bucket_id<>'audio' or public.can_write_private_audio(name));
drop policy if exists "Private audio delete fence" on storage.objects;
create policy "Private audio delete fence" on storage.objects as restrictive for delete to authenticated
  using (bucket_id<>'audio' or public.can_write_private_audio(name));
drop policy if exists "Private audio update fence" on storage.objects;
create policy "Private audio update fence" on storage.objects as restrictive for update to authenticated
  using (bucket_id<>'audio' or public.can_write_private_audio(name));
-- A blocked song in another team must not block an independently authorized copy.
drop policy if exists "Hide moderated song files" on storage.objects;
create policy "Hide moderated song files" on storage.objects as restrictive for select to authenticated
  using (bucket_id='audio' or not public.moderated_song_file(bucket_id,name) or (select public.is_platform_admin()));

-- No front-end changes required: the existing signed-URL API checks these policies.
create or replace function public.audio_dedup_candidates(p_limit integer default 50)
returns table(kind text,entity_id uuid,song_id uuid,path text,revision uuid,object_version text)
language sql stable security definer set search_path='' as $$
  with candidates as (
    select 'song'::text kind,s.id entity_id,s.id song_id,s.audio_path path,s.audio_revision revision
      from public.songs s where not s.moderation_blocked
        and s.created_at >= (select activated_at from private.audio_asset_activation)
    union all
    select 'track',t.id,s.id,t.audio_path,s.audio_revision from public.song_tracks t join public.songs s on s.id=t.song_id
      where not s.moderation_blocked
        and s.created_at >= (select activated_at from private.audio_asset_activation)
  ) select c.*, coalesce(to_jsonb(o)->>'version',to_jsonb(o)->>'updated_at','legacy') object_version
    from candidates c join storage.objects o on o.bucket_id='audio' and o.name=c.path
    where c.path not like '\_%' escape '\' and not exists(select 1 from public.stem_jobs j
      where j.song_id=c.song_id and j.status in ('queued','processing'))
    order by c.song_id,c.kind,c.entity_id limit greatest(1,least(coalesce(p_limit,50),500))
$$;
revoke all on function public.audio_dedup_candidates(integer) from public,anon,authenticated;
grant execute on function public.audio_dedup_candidates(integer) to service_role;

create or replace function public.commit_audio_dedup(p_kind text,p_entity_id uuid,p_song_id uuid,
  p_expected_path text,p_expected_revision uuid,p_object_version text,p_sha256 text,p_byte_size bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare s public.songs; v_path text; v_version text; target text:='_audio/'||p_sha256;
begin
  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or coalesce(p_byte_size,0)<=0
    or p_kind not in ('song','track') or p_kind is null then raise exception 'Invalid asset'; end if;
  select * into s from public.songs where id=p_song_id for update;
  if not found or s.moderation_blocked or s.created_at < (select activated_at from private.audio_asset_activation)
    or s.created_at is null or s.audio_revision is distinct from p_expected_revision
    or exists(select 1 from public.stem_jobs where song_id=s.id and status in ('queued','processing')) then return false; end if;
  if p_kind='song' then
    if p_entity_id<>s.id then return false; end if;
    v_path:=s.audio_path;
  else
    select audio_path into v_path from public.song_tracks where id=p_entity_id and song_id=s.id for update;
  end if;
  if v_path is null or v_path is distinct from p_expected_path or v_path like '\_%' escape '\' then return false; end if;
  select coalesce(to_jsonb(o)->>'version',to_jsonb(o)->>'updated_at','legacy') into v_version
    from storage.objects o where o.bucket_id='audio' and o.name=v_path for update;
  if not found or v_version is distinct from p_object_version then return false; end if;
  if not exists(select 1 from storage.objects where bucket_id='audio' and name=target
      and (metadata->>'size')::bigint=p_byte_size) then raise exception 'Asset not uploaded'; end if;
  insert into private.audio_assets(sha256,path,byte_size) values(p_sha256,target,p_byte_size)
    on conflict(sha256) do nothing;
  if not exists(select 1 from private.audio_assets where sha256=p_sha256 and byte_size=p_byte_size) then raise exception 'Asset conflict'; end if;
  if p_kind='song' then
    perform set_config('maislouvor.audio_relink_song',s.id::text,true);
    update public.songs set audio_path=target where id=s.id;
    perform set_config('maislouvor.audio_relink_song','',true);
  else
    update public.song_tracks set audio_path=target where id=p_entity_id;
  end if;
  insert into private.retired_audio_paths(path,object_version) values(v_path,v_version) on conflict(path) do nothing;
  return true;
end $$;
revoke all on function public.commit_audio_dedup(text,uuid,uuid,text,uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.commit_audio_dedup(text,uuid,uuid,text,uuid,text,text,bigint) to service_role;

-- Delayed cleanup only of replaced team paths; never collect shared assets here.
-- A retired path cannot be newly attached/reuploaded by an authenticated client.
create or replace function public.audio_dedup_cleanup_candidates(p_limit integer default 50)
returns table(path text,object_version text) language sql stable security definer set search_path='' as $$
  select r.path,r.object_version from private.retired_audio_paths r
  join storage.objects o on o.bucket_id='audio' and o.name=r.path
  where r.removed_at is null and r.retired_at<now()-interval '24 hours'
    and r.object_version=coalesce(to_jsonb(o)->>'version',to_jsonb(o)->>'updated_at','legacy')
    and not exists(select 1 from public.songs where audio_path=r.path)
    and not exists(select 1 from public.song_tracks where audio_path=r.path)
    and not exists(select 1 from public.song_audio_attachments where audio_path=r.path)
    and not exists(select 1 from public.stem_jobs where audio_path=r.path and status in ('queued','processing'))
    and not exists(select 1 from public.yt_audio_cache where storage_path=r.path)
  order by r.retired_at limit greatest(1,least(coalesce(p_limit,50),500))
$$;
revoke all on function public.audio_dedup_cleanup_candidates(integer) from public,anon,authenticated;
grant execute on function public.audio_dedup_cleanup_candidates(integer) to service_role;
-- The same stem-job protocol works with a server-consolidated source.
create or replace function public.enqueue_stem_job(p_song_id uuid,p_audio_path text)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.songs; j public.stem_jobs; v_actor uuid:=auth.uid();
begin
  -- All operations lock song before job; audio edits already lock the song.
  select * into s from public.songs where id=p_song_id for update;
  if not found or v_actor is null or s.moderation_blocked
    or public.member_can(v_actor,s.team_id,'musicas','editar') is not true then
    raise exception 'Sem permissão para separar esta música.' using errcode='42501';
  end if;
  if p_audio_path is null or p_audio_path is distinct from s.audio_path
    or not (s.audio_path like s.team_id::text||'/'||s.id::text||'/%'
      or s.audio_path like s.team_id::text||'/'||s.id::text||'.%'
      or exists(select 1 from private.audio_assets where path=s.audio_path))
    or s.audio_path ~ '(^|/)\.\.(/|$)' then
    raise exception 'A gravação mudou. Atualize a música antes de separar.' using errcode='22023';
  end if;
  select * into j from public.stem_jobs where id::text=s.stems_job_id::text for update;
  if found and j.status in ('queued','processing') and j.audio_path=s.audio_path
    and j.audio_revision is not distinct from s.audio_revision and j.requested_by=v_actor then
    return j.id;
  end if;
  update public.stem_jobs set status='cancelled',error='Superseded',updated_at=now()
    where song_id=s.id and status in ('queued','processing');
  insert into public.stem_jobs(song_id,team_id,audio_path,audio_revision,requested_by)
    values(s.id,s.team_id,s.audio_path,s.audio_revision,v_actor) returning * into j;
  update public.songs set stems_job_id=j.id,stems_status='processing',stems_error=null where id=s.id;
  return j.id;
end $$;
revoke all on function public.enqueue_stem_job(uuid,text) from public,anon,service_role;
grant execute on function public.enqueue_stem_job(uuid,text) to authenticated;

create or replace function public.finish_stem_job(p_job_id uuid,p_worker text,p_tracks jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.songs; j public.stem_jobs; v_song uuid; t jsonb; n integer; v_prefix text; v_run text;
begin
  select song_id into v_song from public.stem_jobs where id=p_job_id;
  select * into s from public.songs where id=v_song for update;
  if not found then return jsonb_build_object('applied',false,'reason','missing'); end if;
  select * into j from public.stem_jobs where id=p_job_id for update;
  if not found or j.status<>'processing' or j.claimed_by is distinct from p_worker then
    return jsonb_build_object('applied',false,'reason','not_current');
  end if;
  if s.stems_job_id::text is distinct from j.id::text or s.team_id<>j.team_id
    or s.audio_path is distinct from j.audio_path or s.audio_revision is distinct from j.audio_revision
    or s.moderation_blocked or j.requested_by is null
    or public.member_can(j.requested_by,j.team_id,'musicas','editar') is not true then
    update public.stem_jobs set status='cancelled',error='Source or authorization changed',updated_at=now() where id=j.id;
    if s.stems_job_id::text=j.id::text then
      update public.songs set stems_status='error',stems_error='A gravação ou a permissão mudou. Solicite a separação novamente.' where id=s.id;
    end if;
    return jsonb_build_object('applied',false,'reason','stale');
  end if;
  if p_tracks is null then
    -- Failures never remove previously usable tracks; do not expose provider secrets.
    update public.stem_jobs set status='error',error='Separation failed',updated_at=now() where id=j.id;
    update public.songs set stems_status='error',stems_error='Não foi possível separar as faixas. Tente novamente.' where id=s.id;
    return jsonb_build_object('applied',true,'status','error');
  end if;
  if jsonb_typeof(p_tracks)<>'array' then raise exception 'Invalid tracks'; end if;
  n:=jsonb_array_length(p_tracks);
  if n<1 or n>6 or (select count(distinct value->>'key') from jsonb_array_elements(p_tracks))<>n then
    raise exception 'Invalid tracks';
  end if;
  v_prefix:=j.team_id::text||'/'||j.song_id::text||'/stems/'||j.id::text||'/';
  v_run:=split_part(p_tracks->0->>'audio_path','/',5);
  if v_run is null or v_run !~ '^[a-f0-9]{32}$' then raise exception 'Invalid run'; end if;
  for t in select value from jsonb_array_elements(p_tracks) loop
    if t->>'key' is null or t->>'key' not in ('vocals','drums','bass','guitar','piano','other')
      or t->>'audio_path' is distinct from v_prefix||v_run||'/'||(t->>'key')||'.mp3' then
      raise exception 'Invalid track path';
    end if;
  end loop;
  -- Files were staged under immutable run paths; one transaction replaces metadata.
  delete from public.song_tracks where song_id=s.id and (generated_stem or audio_path like j.team_id::text||'/'||s.id::text||'/stems/%');
  insert into public.song_tracks(song_id,track_name,audio_path,sort_order)
    select s.id,case value->>'key' when 'vocals' then 'Vocais' when 'drums' then 'Bateria' when 'bass' then 'Baixo'
      when 'guitar' then 'Guitarra' when 'piano' then 'Teclado' else 'Outros' end,value->>'audio_path',ordinality-1
    from jsonb_array_elements(p_tracks) with ordinality;
  update public.stem_jobs set status='done',error=null,updated_at=now() where id=j.id;
  update public.songs set stems_status='done',stems_error=null where id=s.id;
  return jsonb_build_object('applied',true,'status','done','tracks',n);
end $$;
revoke all on function public.finish_stem_job(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.finish_stem_job(uuid,text,jsonb) to service_role;

notify pgrst,'reload schema';
