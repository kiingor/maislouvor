-- Denúncias de música/IA: fila privada, acesso por RPC e auditoria administrativa.
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  song_id uuid references public.songs(id) on delete set null,
  kind text not null check(kind in ('song','ai')),
  reason text not null check(reason in ('copyright','offensive','harassment','hate','sexual','spam','other')),
  evidence text not null check(length(evidence) between 1 and 10000),
  details text not null default '' check(length(details)<=2000),
  status text not null default 'open' check(status in ('open','resolved','dismissed')),
  resolution text,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), resolved_at timestamptz
);
create index if not exists content_reports_queue_idx on public.content_reports(status,created_at);
create index if not exists content_reports_reporter_idx on public.content_reports(reporter_id,created_at);
alter table public.content_reports enable row level security;
revoke all on public.content_reports from public,anon,authenticated;
grant select on public.content_reports to authenticated;
grant all on public.content_reports to service_role;
drop policy if exists "Platform can read content reports" on public.content_reports;
create policy "Platform can read content reports" on public.content_reports for select to authenticated using ((select public.is_platform_admin()));

create or replace function public.report_content(p_kind text,p_song_id uuid,p_reason text,p_details text,p_evidence text default '')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_profile uuid; v_song public.songs; v_id uuid; v_evidence text;
begin
  select id into v_profile from public.profiles where user_id=auth.uid();
  if v_profile is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('song','ai') or p_reason is null or p_reason not in ('copyright','offensive','harassment','hate','sexual','spam','other') then raise exception 'Motivo inválido.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_profile::text,127));
  if (select count(*) from public.content_reports where reporter_id=v_profile and created_at>now()-interval '1 hour')>=10 then raise exception 'Limite de denúncias atingido. Tente mais tarde.'; end if;
  if p_kind='song' then
    select * into v_song from public.songs where id=p_song_id;
    if not found or not public.member_can(auth.uid(),v_song.team_id,'musicas','ver') then raise exception 'Música indisponível.' using errcode='42501'; end if;
    v_evidence:=left(concat_ws(E'\n',v_song.title,v_song.artist,v_song.media_url,v_song.lyrics_text,v_song.cifra_text),10000);
  else
    if p_song_id is not null then raise exception 'Referência inválida.'; end if;
    v_evidence:=left(btrim(coalesce(p_evidence,'')),10000);
    if v_evidence='' then raise exception 'Informe a resposta que deseja denunciar.'; end if;
  end if;
  insert into public.content_reports(reporter_id,song_id,kind,reason,evidence,details)
    values(v_profile,p_song_id,p_kind,p_reason,v_evidence,left(coalesce(p_details,''),2000)) returning id into v_id;
  insert into public.notifications(profile_id,type,title,body,link)
    select p.id,'content_report','Nova denúncia de conteúdo','Uma música ou resposta de IA precisa de análise.','/admin/denuncias'
    from public.platform_admins a join public.profiles p on p.user_id=a.user_id where p.id<>v_profile;
  return v_id;
end $$;
revoke all on function public.report_content(text,uuid,text,text,text) from public,anon;
grant execute on function public.report_content(text,uuid,text,text,text) to authenticated;

-- Origem é uma declaração do usuário, nunca uma aprovação automática de licença.
create table if not exists public.song_provenance (
  song_id uuid primary key references public.songs(id) on delete cascade,
  source_url text not null default '' check(length(source_url)<=2000),
  rights_basis text not null check(rights_basis in ('unknown','original','permission','licensed','public_domain')),
  rights_details text not null default '' check(length(rights_details)<=2000),
  declared_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.song_provenance enable row level security;
revoke all on public.song_provenance from public,anon,authenticated;
grant select on public.song_provenance to authenticated;
grant all on public.song_provenance to service_role;
drop policy if exists "Song provenance readers" on public.song_provenance;
create policy "Song provenance readers" on public.song_provenance for select to authenticated using (
  (select public.is_platform_admin()) or exists(select 1 from public.songs s where s.id=song_id and public.member_can(auth.uid(),s.team_id,'musicas','ver')));
create or replace function public.set_song_provenance(p_song_id uuid,p_source_url text,p_rights_basis text,p_rights_details text)
returns void language plpgsql security definer set search_path=public as $$
declare v_team uuid; v_profile uuid;
begin
  select team_id into v_team from public.songs where id=p_song_id;
  select id into v_profile from public.profiles where user_id=auth.uid();
  if v_profile is null or v_team is null or not public.member_can(auth.uid(),v_team,'musicas','editar') then raise exception 'Sem permissão.' using errcode='42501'; end if;
  if p_source_url<>'' and p_source_url !~ '^https?://[^[:space:]]+$' then raise exception 'Informe um endereço HTTP ou HTTPS válido.'; end if;
  if p_rights_basis<>'unknown' and nullif(btrim(p_rights_details),'') is null then raise exception 'Descreva a autoria, licença ou autorização.'; end if;
  insert into public.song_provenance(song_id,source_url,rights_basis,rights_details,declared_by)
    values(p_song_id,btrim(p_source_url),p_rights_basis,btrim(p_rights_details),v_profile)
    on conflict(song_id) do update set source_url=excluded.source_url,rights_basis=excluded.rights_basis,rights_details=excluded.rights_details,declared_by=excluded.declared_by,updated_at=now();
  insert into public.platform_audit_log(actor_user_id,action,entity_id,details) values(auth.uid(),'song_provenance_updated',p_song_id::text,jsonb_build_object('rights_basis',p_rights_basis));
end $$;
revoke all on function public.set_song_provenance(uuid,text,text,text) from public,anon;
grant execute on function public.set_song_provenance(uuid,text,text,text) to authenticated;

alter table public.songs add column if not exists moderation_blocked boolean not null default false;
drop policy if exists "Hide moderated songs" on public.songs;
create policy "Hide moderated songs" on public.songs as restrictive for select to authenticated using (not moderation_blocked or (select public.is_platform_admin()));
create or replace function public.guard_song_moderation() returns trigger language plpgsql set search_path=public as $$
begin
  if (tg_op='INSERT' and new.moderation_blocked) or (tg_op='UPDATE' and new.moderation_blocked is distinct from old.moderation_blocked) then
    if auth.uid() is not null and not public.is_platform_admin() then raise exception 'Somente a moderação altera este campo.' using errcode='42501'; end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_song_moderation on public.songs;
create trigger guard_song_moderation before insert or update on public.songs for each row execute function public.guard_song_moderation();
revoke all on function public.guard_song_moderation() from public,anon,authenticated;
create or replace function public.resolve_content_report(p_id uuid,p_status text,p_resolution text,p_block_song boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare v_report public.content_reports;
begin
  if not public.is_platform_admin() then raise exception 'Sem permissão.' using errcode='42501'; end if;
  if p_status is null or p_status not in ('resolved','dismissed') or nullif(btrim(p_resolution),'') is null then raise exception 'Registre o resultado da análise.'; end if;
  select * into v_report from public.content_reports where id=p_id and status='open' for update;
  if not found then raise exception 'Denúncia já encerrada ou indisponível.'; end if;
  if p_block_song then
    if v_report.kind<>'song' or v_report.song_id is null or p_status<>'resolved' then raise exception 'Ação inválida.'; end if;
    update public.songs set moderation_blocked=true where id=v_report.song_id;
  end if;
  update public.content_reports set status=p_status,resolution=left(p_resolution,2000),resolved_by=auth.uid(),resolved_at=now() where id=p_id;
  insert into public.platform_audit_log(actor_user_id,action,entity_id,details) values(auth.uid(),'content_report_resolved',p_id::text,jsonb_build_object('status',p_status,'blocked_song',p_block_song));
end $$;
revoke all on function public.resolve_content_report(uuid,text,text,boolean) from public,anon;
grant execute on function public.resolve_content_report(uuid,text,text,boolean) to authenticated;
notify pgrst,'reload schema';

-- Bloqueia novas URLs assinadas dos arquivos de músicas moderadas. URLs já
-- emitidas e downloads existentes só expiram conforme o TTL (até uma hora).
create or replace function public.moderated_song_file(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path=public as $$
  select p_bucket in ('audio','covers') and exists(select 1 from public.songs s where s.moderation_blocked and
    (s.audio_path=p_path or s.cover_path=p_path or p_path like s.team_id::text||'/'||s.id::text||'/%'
     or exists(select 1 from public.song_tracks t where t.song_id=s.id and t.audio_path=p_path)))
$$;
revoke all on function public.moderated_song_file(text,text) from public,anon;
grant execute on function public.moderated_song_file(text,text) to authenticated;
drop policy if exists "Hide moderated song files" on storage.objects;
create policy "Hide moderated song files" on storage.objects as restrictive for select to authenticated
  using (not public.moderated_song_file(bucket_id,name) or (select public.is_platform_admin()));
