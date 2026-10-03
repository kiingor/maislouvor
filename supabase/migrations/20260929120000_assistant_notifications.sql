-- Avisos do app -> grupos ativados pelo líder. Nenhum envio HTTP em triggers.
-- O timer chama a edge function, que consome esta fila usando a service_role.
-- Sem retroativo: apenas alterações posteriores à instalação e lembretes futuros.

alter table public.assistant_team_settings add column if not exists notification_settings jsonb
  not null default '{"cultos":true,"escala":true,"repertorio":true,"avisos":true,"lembretes":true}'::jsonb;

create table if not exists public.assistant_outbox (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  group_id uuid not null references public.assistant_groups(id) on delete cascade,
  group_activated_at timestamptz not null,
  topic text not null,
  kind text not null check (kind in ('culto', 'manual', 'reminder')),
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sending', 'sent', 'skipped', 'failed', 'uncertain')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lock_token uuid,
  locked_until timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Só um rascunho por culto/grupo. Uma alteração durante o envio cria outro evento.
create unique index if not exists assistant_outbox_draft_idx
  on public.assistant_outbox(group_id, topic) where status = 'pending' and attempts = 0;
create unique index if not exists assistant_outbox_reminder_idx
  on public.assistant_outbox(group_id, group_activated_at, topic) where kind = 'reminder';
create index if not exists assistant_outbox_due_idx on public.assistant_outbox(available_at)
  where status in ('pending', 'processing', 'sending');
alter table public.assistant_outbox enable row level security;
revoke all on public.assistant_outbox from public, anon, authenticated;
grant all on public.assistant_outbox to service_role;

create or replace function public.assistant_notice_options(p_team_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select '{"cultos":true,"escala":true,"repertorio":true,"avisos":true,"lembretes":true}'::jsonb
    || coalesce((select notification_settings from assistant_team_settings where team_id = p_team_id), '{}'::jsonb)
$$;

create or replace function public.assistant_notification_settings(p_team_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_team_role(auth.uid(), p_team_id, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.assistant_notice_options(p_team_id);
end;
$$;

create or replace function public.assistant_set_notification(p_team_id uuid, p_kind text, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.has_team_role(auth.uid(), p_team_id, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('cultos','escala','repertorio','avisos','lembretes') or p_enabled is null then
    raise exception 'invalid_preference' using errcode = '22023';
  end if;
  insert into assistant_team_settings as s (team_id, notification_settings)
    values (p_team_id, jsonb_build_object(p_kind, p_enabled))
    on conflict (team_id) do update set notification_settings = s.notification_settings || excluded.notification_settings;
  -- Desligar e religar não ressuscita avisos antigos desta categoria.
  if not p_enabled then
    update assistant_outbox set payload = jsonb_set(payload, '{categories}', (payload->'categories') - p_kind)
      where team_id = p_team_id and status in ('pending','processing');
  end if;
  return public.assistant_notice_options(p_team_id);
end;
$$;

-- Somente os dados que podem sair no grupo; sem telefone, motivo de falta ou disponibilidade.
create or replace function public.assistant_notice_snapshot(p_culto_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'date', c.date, 'description', c.description,
    'members', coalesce((select jsonb_agg(m.obj order by m.profile_id) from (
      select p.id profile_id, jsonb_build_object('profile_id', p.id, 'name', p.full_name,
        'roles', jsonb_agg(jsonb_build_object('instrument', l.instrument, 'status', l.status)
          order by public.assistant_instrument_order(l.instrument), l.instrument)) obj
      from culto_lineup l join team_members tm on tm.id = l.team_member_id and tm.team_id = c.team_id
        join profiles p on p.id = tm.profile_id
      where l.culto_id = c.id group by p.id
    ) m), '[]'::jsonb),
    'songs', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title,
      'key', coalesce(cs.key_override, s.key_current, s.key_original)) order by cs.sort_order, cs.id)
      from culto_songs cs join songs s on s.id = cs.song_id where cs.culto_id = c.id), '[]'::jsonb)
  ) from cultos c where c.id = p_culto_id
$$;

create or replace function public.assistant_notice_enqueue(p_team_id uuid, p_topic text, p_kind text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_categories jsonb;
begin
  if not exists (select 1 from assistant_config where enabled)
    or exists (select 1 from assistant_team_settings where team_id = p_team_id and not enabled) then return; end if;
  select coalesce(jsonb_agg(value), '[]'::jsonb) into v_categories
    from jsonb_array_elements_text(p_payload->'categories')
    where public.assistant_notice_options(p_team_id)->value = 'true'::jsonb;
  if v_categories = '[]'::jsonb then return; end if;
  insert into assistant_outbox as q (team_id, group_id, group_activated_at, topic, kind, payload, available_at)
    select p_team_id, g.id, g.activated_at, p_topic, p_kind,
      jsonb_set(p_payload, '{categories}', v_categories), now() + interval '45 seconds'
    from assistant_groups g where g.team_id = p_team_id and g.active
  on conflict (group_id, topic) where status = 'pending' and attempts = 0 do update
    -- Preserva o estado ANTES da primeira mudança; compara com o final do lote.
    set payload = case when (q.team_id,q.group_activated_at) is distinct from (excluded.team_id,excluded.group_activated_at)
      then excluded.payload else jsonb_set(q.payload, '{categories}',
      (select jsonb_agg(distinct value) from jsonb_array_elements((q.payload->'categories') || (excluded.payload->'categories')))) end,
      team_id = excluded.team_id, group_activated_at = excluded.group_activated_at,
      created_at = case when (q.team_id,q.group_activated_at) is distinct from (excluded.team_id,excluded.group_activated_at)
        then now() else q.created_at end,
      available_at = case when (q.team_id,q.group_activated_at) is distinct from (excluded.team_id,excluded.group_activated_at)
        then now() + interval '45 seconds' else least(now() + interval '45 seconds', q.created_at + interval '5 minutes') end,
      updated_at = now();
end;
$$;

create or replace function public.assistant_notice_culto(p_id uuid, p_team_id uuid, p_category text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assistant_notice_enqueue(p_team_id, 'culto:' || p_id, 'culto',
    jsonb_build_object('culto_id', p_id, 'categories', jsonb_build_array(p_category),
      'before', case when exists (select 1 from cultos where id = p_id and team_id = p_team_id)
        then public.assistant_notice_snapshot(p_id) else null end));
end;
$$;

create or replace function public.assistant_notice_culto_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (old.team_id, old.name, old.date, old.description) is not distinct from (new.team_id, new.name, new.date, new.description) then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.team_id <> new.team_id and old.date >= public.assistant_today() then
    perform public.assistant_notice_culto(old.id, old.team_id, 'cultos');
  end if;
  if tg_op = 'DELETE' then
    if old.date >= public.assistant_today() then perform public.assistant_notice_culto(old.id, old.team_id, 'cultos'); end if;
    return old;
  end if;
  if new.date >= public.assistant_today() or (tg_op = 'UPDATE' and old.date >= public.assistant_today()) then
    perform public.assistant_notice_culto(new.id, new.team_id, 'cultos');
  end if;
  return new;
end;
$$;

create or replace function public.assistant_notice_content_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[] := '{}'; v_id uuid; v_team uuid; v_category text;
begin
  v_category := case when tg_table_name = 'culto_lineup' then 'escala' else 'repertorio' end;
  if tg_op = 'UPDATE' then
    -- Confirmar/recusar escala não anuncia a escala novamente.
    if tg_table_name = 'culto_lineup' then
      if (old.culto_id,old.team_member_id,old.instrument) is not distinct from (new.culto_id,new.team_member_id,new.instrument) then return new; end if;
    else
      if (old.culto_id,old.song_id,old.sort_order,old.key_override) is not distinct from (new.culto_id,new.song_id,new.sort_order,new.key_override) then return new; end if;
    end if;
  end if;
  if tg_op <> 'INSERT' then v_ids := array_append(v_ids, old.culto_id); end if;
  if tg_op <> 'DELETE' then v_ids := array_append(v_ids, new.culto_id); end if;
  for v_id in select distinct unnest(v_ids) loop
    select team_id into v_team from cultos where id = v_id and date >= public.assistant_today();
    if found then perform public.assistant_notice_culto(v_id, v_team, v_category); end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.assistant_notice_song_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if (old.title,old.key_current,old.key_original) is distinct from (new.title,new.key_current,new.key_original) then
    for v in select distinct c.id,c.team_id from cultos c join culto_songs cs on cs.culto_id = c.id
      where cs.song_id = new.id and c.date >= public.assistant_today() loop
      perform public.assistant_notice_culto(v.id, v.team_id, 'repertorio');
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.assistant_notice_manual_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Um aviso do líder gera N notificações individuais no mesmo INSERT: uma só no grupo.
  if new.type = 'manual' and new.team_id is not null and new.sender_profile_id is not null
    and exists (select 1 from team_members where team_id = new.team_id and profile_id = new.sender_profile_id and role = 'admin') then
    perform public.assistant_notice_enqueue(new.team_id,
      'manual:' || txid_current() || ':' || md5(jsonb_build_array(new.title,new.body,new.sender_profile_id)::text), 'manual',
      jsonb_build_object('categories', jsonb_build_array('avisos'), 'title', new.title, 'body', new.body));
  end if;
  return new;
end;
$$;

drop trigger if exists assistant_notice_culto on public.cultos;
create trigger assistant_notice_culto before insert or update or delete on public.cultos
  for each row execute function public.assistant_notice_culto_trigger();
drop trigger if exists assistant_notice_lineup on public.culto_lineup;
create trigger assistant_notice_lineup before insert or update or delete on public.culto_lineup
  for each row execute function public.assistant_notice_content_trigger();
drop trigger if exists assistant_notice_repertoire on public.culto_songs;
create trigger assistant_notice_repertoire before insert or update or delete on public.culto_songs
  for each row execute function public.assistant_notice_content_trigger();
drop trigger if exists assistant_notice_song on public.songs;
create trigger assistant_notice_song before update on public.songs
  for each row execute function public.assistant_notice_song_trigger();
drop trigger if exists assistant_notice_manual on public.notifications;
create trigger assistant_notice_manual after insert on public.notifications
  for each row execute function public.assistant_notice_manual_trigger();

-- Invalida também o @lid aprendido pelo telefone anterior, mesmo quando ele vem sem PN.
create or replace function public.assistant_notice_phone_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.phone is distinct from new.phone then
    delete from assistant_wa_identities where profile_id = new.id and source = 'phone';
  end if;
  return new;
end;
$$;
drop trigger if exists assistant_notice_phone on public.profiles;
create trigger assistant_notice_phone after update of phone on public.profiles
  for each row execute function public.assistant_notice_phone_trigger();

-- Agenda da véspera: 18h até 21h em Brasília, uma vez por culto/data/grupo/ativação.
create or replace function public.assistant_notice_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if (p_now at time zone 'America/Sao_Paulo')::time < time '18:00'
    or (p_now at time zone 'America/Sao_Paulo')::time >= time '21:00' then return 0; end if;
  insert into assistant_outbox (team_id, group_id, group_activated_at, topic, kind, payload)
  select c.team_id, g.id, g.activated_at, 'reminder:' || c.id || ':' || c.date, 'reminder',
    jsonb_build_object('culto_id', c.id, 'date', c.date, 'categories', jsonb_build_array('lembretes'))
  from cultos c join assistant_groups g on g.team_id = c.team_id and g.active
  where c.date = (p_now at time zone 'America/Sao_Paulo')::date + 1
    and exists (select 1 from assistant_config where enabled)
    and not exists (select 1 from assistant_team_settings where team_id = c.team_id and not enabled)
    and public.assistant_notice_options(c.team_id)->'lembretes' = 'true'::jsonb
    and exists (select 1 from culto_lineup where culto_id = c.id and status <> 'declined')
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Verifica a mesma ativação: um grupo reutilizado por outra equipe nunca recebe dados antigos.
create or replace function public.assistant_notice_allowed(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from assistant_outbox q join assistant_groups g on g.id = q.group_id
    join assistant_config c on c.id
    where q.id = p_id and g.team_id = q.team_id and g.active and c.enabled
      and g.activated_at = q.group_activated_at
      and not exists (select 1 from assistant_team_settings s where s.team_id = q.team_id and not s.enabled))
$$;

create or replace function public.assistant_notice_claim()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_q assistant_outbox%rowtype; v_after jsonb; v_categories jsonb; v_result jsonb;
begin
  -- Serializa apenas a pequena transação de reserva; envios de grupos distintos podem coexistir.
  if not pg_try_advisory_xact_lock(29120000, 1) then return null; end if;
  -- Se o processo morreu DEPOIS de começar o envio, não é seguro repetir.
  update assistant_outbox set status = 'uncertain', error_code = 'delivery_timeout', updated_at = now()
    where status = 'sending' and locked_until < now();
  update assistant_outbox set status = case when attempts >= 5 then 'failed' else 'pending' end,
    available_at = now() + interval '1 minute', error_code = 'worker_timeout', updated_at = now()
    where status = 'processing' and locked_until < now();
  update assistant_outbox set status = 'skipped', error_code = 'expired_or_disconnected', updated_at = now()
    where status = 'pending' and (created_at < now() - interval '24 hours' or not public.assistant_notice_allowed(id));
  delete from assistant_outbox where status in ('sent','skipped','failed','uncertain') and updated_at < now() - interval '30 days';

  select q.* into v_q from assistant_outbox q
    where q.status = 'pending' and q.available_at <= now()
      and not exists (select 1 from assistant_outbox other where other.group_id = q.group_id
        and (other.status in ('processing','sending') or
          (other.status = 'pending' and (other.created_at,other.id) < (q.created_at,q.id))))
    order by q.available_at, q.created_at, q.id limit 1 for update skip locked;
  if not found then return null; end if;

  select coalesce(jsonb_agg(value), '[]'::jsonb) into v_categories from jsonb_array_elements_text(v_q.payload->'categories')
    where public.assistant_notice_options(v_q.team_id)->value = 'true'::jsonb;
  -- O culto pode ter sido removido ou transferido desde o evento: nunca lê o
  -- estado de uma equipe diferente para uma entrega já presa a este grupo.
  if exists (select 1 from cultos where id = (v_q.payload->>'culto_id')::uuid and team_id = v_q.team_id) then
    v_after := public.assistant_notice_snapshot((v_q.payload->>'culto_id')::uuid);
  end if;
  if v_categories = '[]'::jsonb
    or (v_q.kind <> 'manual' and v_after is not null and (v_after->>'date')::date < public.assistant_today())
    or (v_q.kind = 'reminder' and (v_after is null or v_after->>'date' <> v_q.payload->>'date'
      or (v_after->>'date')::date <> public.assistant_today()+1
      or (now() at time zone 'America/Sao_Paulo')::time >= time '21:00')) then
    update assistant_outbox set status = 'skipped', error_code = 'obsolete', updated_at = now() where id = v_q.id;
    return jsonb_build_object('skipped', true);
  end if;
  update assistant_outbox set status = 'processing', attempts = attempts+1, lock_token = gen_random_uuid(),
    locked_until = now() + interval '2 minutes', updated_at = now(),
    payload = jsonb_set(jsonb_set(payload, '{after}', coalesce(v_after, 'null'::jsonb)), '{categories}', v_categories)
    where id = v_q.id returning * into v_q;
  select jsonb_build_object('id', v_q.id, 'lock_token', v_q.lock_token, 'team_id', v_q.team_id,
    'kind', v_q.kind, 'payload', v_q.payload, 'group_jid', g.group_jid,
    'assistant_name', c.assistant_name, 'bot_ids', c.bot_ids ||
      case when c.bot_phone is null then '{}'::text[] else array[c.bot_phone || '@s.whatsapp.net'] end)
    into v_result from assistant_groups g cross join assistant_config c where g.id = v_q.group_id and c.id;
  return v_result;
end;
$$;

create or replace function public.assistant_notice_begin(p_id uuid, p_token uuid, p_categories text[])
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update assistant_outbox q set status = 'sending', locked_until = now() + interval '2 minutes', updated_at = now(),
    payload = jsonb_set(payload, '{sent_categories}', to_jsonb(p_categories))
    where q.id = p_id and q.lock_token = p_token and q.status in ('processing','sending') and q.locked_until > now()
      and public.assistant_notice_allowed(q.id)
      and cardinality(p_categories) > 0
      and not exists (select 1 from unnest(p_categories) k where
        public.assistant_notice_options(q.team_id)->k is distinct from 'true'::jsonb
        or not (q.payload->'categories' ? k))
      and (q.kind = 'manual' or q.payload->'after' = 'null'::jsonb or exists (
        select 1 from cultos c where c.id = (q.payload->>'culto_id')::uuid and c.team_id = q.team_id
          and c.date >= public.assistant_today()));
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function public.assistant_notice_finish(p_id uuid, p_token uuid, p_result text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count integer; v_q assistant_outbox%rowtype; v_fields jsonb := '{}'::jsonb;
begin
  if p_result not in ('sent','skipped','retry','uncertain') then raise exception 'invalid_result'; end if;
  update assistant_outbox set
    status = case when p_result = 'retry' then case when attempts >= 5 then 'failed' else 'pending' end else p_result end,
    available_at = now() + (least(30, attempts*attempts) * interval '1 minute'),
    error_code = case when p_result in ('retry','uncertain') then p_result else null end,
    locked_until = null, updated_at = now()
    where id = p_id and lock_token = p_token
      and ((status = 'processing' and p_result in ('retry','skipped')) or (status = 'sending' and p_result in ('sent','uncertain')))
      returning * into v_q;
  get diagnostics v_count = row_count;
  if v_count = 1 and p_result = 'sent' and v_q.kind = 'culto' and v_q.payload->'after' <> 'null'::jsonb then
    -- Um retry pode ter incorporado mudanças de uma fila posterior. Atualiza
    -- a base somente das categorias efetivamente enviadas para não repetir menções.
    if v_q.payload->'sent_categories' ? 'cultos' then
      v_fields := v_fields || jsonb_build_object('name',v_q.payload->'after'->'name',
        'date',v_q.payload->'after'->'date','description',v_q.payload->'after'->'description');
    end if;
    if v_q.payload->'sent_categories' ? 'escala' then
      v_fields := v_fields || jsonb_build_object('members',v_q.payload->'after'->'members');
    end if;
    if v_q.payload->'sent_categories' ? 'repertorio' then
      v_fields := v_fields || jsonb_build_object('songs',v_q.payload->'after'->'songs');
    end if;
    update assistant_outbox set payload = jsonb_set(payload,'{before}',(payload->'before') || v_fields)
      where group_id = v_q.group_id and group_activated_at = v_q.group_activated_at
        and team_id = v_q.team_id and topic = v_q.topic and status = 'pending'
        and jsonb_typeof(payload->'before') = 'object';
  end if;
  return v_count = 1;
end;
$$;

-- Os participantes vêm da Evolution, nunca do navegador. Resolve sem gravar identidades.
create or replace function public.assistant_notice_mentions(p_team_id uuid, p_profile_ids uuid[], p_participants jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_part jsonb; v_ids text[]; v_candidates uuid[]; v_profile uuid; v_jid text;
  v_found jsonb := '{}'::jsonb; v_ambiguous uuid[] := '{}';
begin
  for v_part in select value from jsonb_array_elements(p_participants) limit 1024 loop
    select array_agg(value) into v_ids from jsonb_array_elements_text(v_part->'ids')
      where value ~ '^[0-9]+@(s.whatsapp.net|lid)$';
    -- Código pessoal explícito tem precedência sobre um telefone livre no cadastro.
    select array_agg(distinct i.profile_id) into v_candidates from assistant_wa_identities i
      join team_members tm on tm.profile_id = i.profile_id and tm.team_id = p_team_id
      where i.wa_id = any(v_ids) and i.source = 'code';
    if coalesce(cardinality(v_candidates),0) = 0 then
      select array_agg(distinct p.id) into v_candidates from profiles p
        join team_members tm on tm.profile_id = p.id and tm.team_id = p_team_id
        where exists (select 1 from unnest(v_ids) jid where jid like '%@s.whatsapp.net'
          and public.assistant_phone_matches(p.phone, split_part(jid,'@',1)))
          or (not exists (select 1 from unnest(v_ids) jid where jid like '%@s.whatsapp.net') and
            exists (select 1 from assistant_wa_identities i where i.profile_id = p.id and i.wa_id = any(v_ids)));
    end if;
    if cardinality(v_candidates) = 1 and v_candidates[1] = any(p_profile_ids) then
      v_profile := v_candidates[1];
      select jid into v_jid from unnest(v_ids) jid order by (jid like '%@lid') desc, jid limit 1;
      if v_found ? v_profile::text then v_ambiguous := array_append(v_ambiguous, v_profile); end if;
      v_found := v_found || jsonb_build_object(v_profile::text, v_jid);
    end if;
  end loop;
  foreach v_profile in array v_ambiguous loop v_found := v_found - v_profile::text; end loop;
  return v_found;
end;
$$;

-- Não mexe nos grants das RPCs anteriores. As internas novas só aceitam service_role.
do $$ declare f record;
begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'assistant_notice_%'
      or p.proname in ('assistant_notification_settings','assistant_set_notification')) loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
grant execute on function public.assistant_notification_settings(uuid) to authenticated;
grant execute on function public.assistant_set_notification(uuid,text,boolean) to authenticated;

notify pgrst, 'reload schema';
