-- Pull worker protocol v2. Apply only after stopping/draining every old worker.
-- Legacy jobs remain auditable; they are never silently adopted without an actor/revision.
-- The deploy wrapper must execute the whole migration in one transaction.
lock table public.songs in share row exclusive mode;
create table if not exists public.stem_jobs (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  team_id uuid not null, audio_path text not null,
  status text not null default 'queued', claimed_by text, claimed_at timestamptz,
  attempts integer not null default 0, error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
lock table public.stem_jobs in access exclusive mode;
do $$ begin
  if exists(select 1 from public.stem_jobs where status='processing') then
    raise exception 'Drain all stem workers before applying this migration';
  end if;
end $$;
alter table public.stem_jobs add column if not exists audio_revision uuid;
alter table public.stem_jobs add column if not exists requested_by uuid;
alter table public.stem_jobs enable row level security;
revoke all on public.stem_jobs from public,anon,authenticated;
grant all on public.stem_jobs to service_role;

-- After all old workers are drained, retire only unfinished unbound legacy jobs.
-- Keep usable tracks and explain that a new authorized request is needed.
update public.songs s set stems_status='error',stems_error='Solicite a separação novamente após a atualização.'
  from public.stem_jobs j where s.stems_job_id::text=j.id::text and j.requested_by is null
    and j.status in ('queued','processing');
update public.stem_jobs set status='cancelled',error='Legacy protocol retired',updated_at=now()
  where requested_by is null and status in ('queued','processing');

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
      or s.audio_path like s.team_id::text||'/'||s.id::text||'.%')
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

-- An old claim function already running when the migration starts cannot claim
-- a new protected job after its table lock is released. Only the v2 RPC sets this
-- transaction-local fence. This also rejects a legacy direct-table claimant.
create or replace function public.guard_stem_job_claim() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='processing' and old.status is distinct from 'processing'
    and (new.requested_by is null or current_setting('maislouvor.stem_claim_id',true) is distinct from new.id::text) then
    raise exception 'Versioned stem claim required' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_stem_job_claim() from public,anon,authenticated;
drop trigger if exists guard_stem_job_claim on public.stem_jobs;
create trigger guard_stem_job_claim before update of status on public.stem_jobs
  for each row execute function public.guard_stem_job_claim();

-- Retire the unversioned claimant: otherwise an older GPU can bypass finalization.
create or replace function public.claim_stem_job(p_worker text,p_min_age_seconds integer default 0)
returns public.stem_jobs language sql security definer set search_path='' as $$
  select null::public.stem_jobs
$$;
revoke all on function public.claim_stem_job(text,integer) from public,anon,authenticated;
grant execute on function public.claim_stem_job(text,integer) to service_role;

create or replace function public.claim_stem_job_v2(p_worker text,p_min_age_seconds integer default 0)
returns public.stem_jobs language plpgsql security definer set search_path='' as $$
declare candidate record; s public.songs; j public.stem_jobs;
begin
  if nullif(btrim(p_worker),'') is null then raise exception 'Worker required'; end if;
  for candidate in select id,song_id from public.stem_jobs where status='queued'
      and requested_by is not null and created_at<=now()-make_interval(secs=>greatest(0,least(coalesce(p_min_age_seconds,0),3600)))
      order by created_at limit 50 loop
    select * into s from public.songs where id=candidate.song_id for update skip locked;
    if not found then continue; end if;
    select * into j from public.stem_jobs where id=candidate.id and status='queued' for update skip locked;
    if not found then continue; end if;
    if s.stems_job_id::text is distinct from j.id::text or s.audio_path is distinct from j.audio_path
      or s.audio_revision is distinct from j.audio_revision or s.team_id<>j.team_id or s.moderation_blocked
      or public.member_can(j.requested_by,j.team_id,'musicas','editar') is not true then
      update public.stem_jobs set status='cancelled',error='Source or authorization changed',updated_at=now() where id=j.id;
      if s.stems_job_id::text=j.id::text then
        update public.songs set stems_status='error',stems_error='A gravação ou a permissão mudou. Solicite a separação novamente.' where id=s.id;
      end if;
      continue;
    end if;
    perform set_config('maislouvor.stem_claim_id',j.id::text,true);
    update public.stem_jobs set status='processing',claimed_by=p_worker,claimed_at=now(),attempts=attempts+1,updated_at=now()
      where id=j.id returning * into j;
    return j;
  end loop;
  return null;
end $$;
revoke all on function public.claim_stem_job_v2(text,integer) from public,anon,authenticated;
grant execute on function public.claim_stem_job_v2(text,integer) to service_role;

-- Re-check just before expensive work and at the atomic commit boundary.
create or replace function public.stem_job_context(p_job_id uuid,p_worker text)
returns jsonb language sql stable security definer set search_path='' as $$
  select case when j.status='processing' and j.claimed_by=p_worker
    and s.stems_job_id::text=j.id::text and s.team_id=j.team_id
    and s.audio_path=j.audio_path and s.audio_revision is not distinct from j.audio_revision
    and not s.moderation_blocked and j.requested_by is not null
    and public.member_can(j.requested_by,j.team_id,'musicas','editar') is true
    then jsonb_build_object('allowed',true,'job_id',j.id,'song_id',j.song_id,'team_id',j.team_id,
      'audio_path',j.audio_path,'audio_revision',j.audio_revision)
    else jsonb_build_object('allowed',false) end
  from public.stem_jobs j join public.songs s on s.id=j.song_id where j.id=p_job_id
$$;
revoke all on function public.stem_job_context(uuid,text) from public,anon,authenticated;
grant execute on function public.stem_job_context(uuid,text) to service_role;

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
  delete from public.song_tracks where song_id=s.id and audio_path like j.team_id::text||'/'||s.id::text||'/stems/%';
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

create or replace function public.invalidate_song_audio_tracks()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.audio_path is distinct from old.audio_path or new.audio_revision is distinct from old.audio_revision then
    delete from public.song_tracks where song_id=new.id;
    new.stems_status:='idle'; new.stems_error:=null; new.stems_job_id:=null;
  end if;
  return new;
end $$;
