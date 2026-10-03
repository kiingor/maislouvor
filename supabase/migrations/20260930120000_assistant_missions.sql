-- Missões definidas pelo líder no grupo. Horários sempre em Brasília.
-- O mesmo timer dos avisos consulta a agenda; nenhuma chamada HTTP no banco.
create table if not exists public.assistant_missions (
  id uuid primary key default gen_random_uuid(),
  code text generated always as (upper(substr(replace(id::text, '-', ''), 1, 8))) stored unique,
  team_id uuid not null references public.teams(id) on delete cascade,
  group_id uuid not null references public.assistant_groups(id) on delete cascade,
  group_activated_at timestamptz not null,
  authorized_by uuid references public.team_members(id) on delete set null,
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 1600),
  frequency text not null check (frequency in ('once','daily','weekly')),
  weekdays integer[] not null default '{}',
  send_time time not null,
  run_date date,
  timezone text not null default 'America/Sao_Paulo' check (timezone = 'America/Sao_Paulo'),
  status text not null default 'active' check (status in ('active','paused','cancelled','completed','expired')),
  revision integer not null default 1,
  next_run_at timestamptz,
  last_delivery_status text,
  last_delivery_at timestamptz,
  pause_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((frequency = 'once') = (run_date is not null)),
  check ((frequency = 'weekly' and cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7])
    or (frequency <> 'weekly' and cardinality(weekdays) = 0))
);
create index if not exists assistant_missions_due_idx on public.assistant_missions(next_run_at) where status = 'active';
create index if not exists assistant_missions_group_idx on public.assistant_missions(team_id, group_id);

create table if not exists public.assistant_mission_requests (
  group_id uuid not null references public.assistant_groups(id) on delete cascade,
  request_id text not null,
  member_id uuid,
  action text not null,
  args jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (group_id, request_id)
);
alter table public.assistant_missions enable row level security;
alter table public.assistant_mission_requests enable row level security;
revoke all on public.assistant_missions, public.assistant_mission_requests from public, anon, authenticated;
grant all on public.assistant_missions, public.assistant_mission_requests to service_role;

alter table public.assistant_outbox drop constraint if exists assistant_outbox_kind_check;
alter table public.assistant_outbox add constraint assistant_outbox_kind_check check (kind in ('culto','manual','reminder','mission'));
alter table public.assistant_outbox add column if not exists mission_id uuid references public.assistant_missions(id) on delete cascade;
alter table public.assistant_outbox add column if not exists mission_revision integer;
alter table public.assistant_outbox add column if not exists scheduled_for timestamptz;
create unique index if not exists assistant_outbox_mission_idx
  on public.assistant_outbox(mission_id, mission_revision, scheduled_for) where kind = 'mission';

-- Próxima ocorrência estritamente posterior ao instante informado. Usa dias
-- locais, não somas de 24h: continua correto em transições de fuso.
create or replace function public.assistant_mission_next(
  p_frequency text, p_weekdays integer[], p_time time, p_date date, p_after timestamptz
) returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare v_day date; v_candidate timestamptz; i integer;
begin
  if p_time is null or p_after is null then return null; end if;
  if p_frequency = 'once' then
    v_candidate := (p_date + p_time) at time zone 'America/Sao_Paulo';
    return case when v_candidate > p_after then v_candidate end;
  end if;
  if p_frequency not in ('daily','weekly') then return null; end if;
  for i in 0..7 loop
    v_day := (p_after at time zone 'America/Sao_Paulo')::date + i;
    if p_frequency = 'daily' or extract(isodow from v_day)::integer = any(p_weekdays) then
      v_candidate := (v_day + p_time) at time zone 'America/Sao_Paulo';
      if v_candidate > p_after then return v_candidate; end if;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.assistant_mission_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('codigo', m.code, 'titulo', m.title, 'mensagem', m.body,
    'frequencia', case m.frequency when 'once' then 'unica' when 'daily' then 'diaria' else 'semanal' end,
    'dias_semana', m.weekdays, 'horario_envio', to_char(m.send_time,'HH24:MI'), 'data', m.run_date,
    'fuso', 'America/Sao_Paulo', 'status', m.status, 'proximo_envio', m.next_run_at,
    'proximo_envio_local', to_char(m.next_run_at at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI'),
    'dia_semana', public.assistant_weekday((m.next_run_at at time zone 'America/Sao_Paulo')::date),
    'ultima_entrega', m.last_delivery_status, 'ultima_entrega_em', m.last_delivery_at,
    'motivo_pausa', m.pause_reason, 'grupo', g.group_name, 'grupo_id', m.group_id)
  from assistant_missions m left join assistant_groups g on g.id = m.group_id and g.team_id=m.team_id where m.id = p_id
$$;

-- A identidade do líder, grupo e request_id vêm do handler, nunca do modelo.
create or replace function public.assistant_mission_command(
  p_team_id uuid, p_group_id uuid, p_member_id uuid, p_request_id text, p_action text, p_args jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_group assistant_groups%rowtype; v_m assistant_missions%rowtype;
  v_request assistant_mission_requests%rowtype; v_result jsonb;
  v_title text; v_body text; v_freq text; v_days integer[]; v_time time; v_date date; v_next timestamptz;
begin
  if not exists (select 1 from team_members where id = p_member_id and team_id = p_team_id and role = 'admin') then
    return jsonb_build_object('erro','somente_lider');
  end if;
  select * into v_group from assistant_groups where id = p_group_id and team_id = p_team_id;
  -- Um líder ainda pode encerrar uma missão de sua equipe após o grupo ser transferido.
  if not found and p_action in ('pausar','cancelar') then
    select * into v_group from assistant_groups where id=p_group_id;
  end if;
  if not found then return jsonb_build_object('erro','grupo_invalido'); end if;
  if p_action = 'listar' then
    return jsonb_build_object('missoes', coalesce((select jsonb_agg(public.assistant_mission_json(x.id)) from (
      select id from assistant_missions where team_id = p_team_id and group_id = p_group_id
        order by (status in ('active','paused')) desc, created_at desc limit 30
    ) x), '[]'::jsonb), 'fuso','America/Sao_Paulo');
  end if;
  if p_action is null or p_action not in ('criar','alterar','pausar','retomar','cancelar')
    or p_request_id is null or char_length(p_request_id) not between 1 and 160
    or p_args is null or jsonb_typeof(p_args) <> 'object' then
    return jsonb_build_object('erro','argumentos_invalidos');
  end if;
  -- Serializa os comandos do grupo (incluindo limite e idempotência).
  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 30120000));
  select * into v_request from assistant_mission_requests where group_id = p_group_id and request_id = p_request_id;
  if found then
    if (v_request.member_id,v_request.action,v_request.args) is not distinct from (p_member_id,p_action,p_args) then return v_request.result; end if;
    return jsonb_build_object('erro','uma_alteracao_por_mensagem','orientacao','Envie outro pedido para fazer uma segunda alteração.');
  end if;
  if p_action <> 'criar' then
    select * into v_m from assistant_missions where team_id = p_team_id and group_id = p_group_id
      and code = upper(trim(p_args->>'codigo')) for update;
    if not found then return jsonb_build_object('erro','missao_nao_encontrada','orientacao','Liste as missões deste grupo e use o código exato.'); end if;
    if v_m.status = 'cancelled' then return jsonb_build_object('erro','missao_cancelada','orientacao','Crie uma nova missão.'); end if;
  end if;
  if p_action in ('criar','alterar','retomar') then
    if not v_group.active or not exists (select 1 from assistant_config where enabled)
      or exists (select 1 from assistant_team_settings where team_id = p_team_id and not enabled) then
      return jsonb_build_object('erro','assistente_desativado');
    end if;
    if (p_action='criar' or v_m.status not in ('active','paused')) and (select count(*) from assistant_missions where group_id = p_group_id and team_id=p_team_id
      and status in ('active','paused')) >= 20 then return jsonb_build_object('erro','limite_20_missoes','orientacao','Cancele uma missão antes de criar outra.'); end if;
    if p_action = 'retomar' then
      v_title := v_m.title; v_body := v_m.body; v_freq := v_m.frequency;
      v_time := v_m.send_time; v_days := v_m.weekdays; v_date := v_m.run_date;
    else
      if exists (select 1 from jsonb_each(p_args) e where e.key in ('titulo','mensagem')
        and jsonb_typeof(e.value) not in ('string','null')) then return jsonb_build_object('erro','texto_invalido'); end if;
      v_title := trim(coalesce(p_args->>'titulo', case when p_action = 'alterar' then v_m.title end));
      v_body := trim(coalesce(p_args->>'mensagem', case when p_action = 'alterar' then v_m.body end));
      v_freq := coalesce(case p_args->>'frequencia' when 'unica' then 'once' when 'diaria' then 'daily' when 'semanal' then 'weekly' end,
        case when p_action = 'alterar' and (p_args->>'frequencia') is null then v_m.frequency end);
      if v_title is null or char_length(v_title) not between 1 and 80 or v_body is null or char_length(v_body) not between 1 and 1600 then
        return jsonb_build_object('erro','texto_invalido','orientacao','Informe título (até 80 caracteres) e mensagem (até 1600).');
      end if;
      if v_freq is null then return jsonb_build_object('erro','frequencia_invalida'); end if;
      if p_args->>'horario_envio' is null then
        v_time := case when p_action = 'alterar' then v_m.send_time end;
      elsif p_args->>'horario_envio' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        v_time := (p_args->>'horario_envio')::time;
      else return jsonb_build_object('erro','horario_invalido'); end if;
      if v_time is null then return jsonb_build_object('erro','horario_envio_necessario','pergunta','Que horas devo mandar o aviso? O horário do ensaio pode ser diferente do horário de envio.'); end if;
      v_days := '{}';
      if v_freq<>'weekly' and p_args->>'dias_semana' is not null and p_args->'dias_semana'<>'[]'::jsonb then
        return jsonb_build_object('erro','dias_apenas_semanal');
      end if;
      if v_freq = 'weekly' then
        if p_args->>'dias_semana' is null and p_action = 'alterar' then v_days := v_m.weekdays;
        elsif jsonb_typeof(p_args->'dias_semana') = 'array' then
          if exists (select 1 from jsonb_array_elements_text(p_args->'dias_semana') d where d is null or d !~ '^[1-7]$') then
            return jsonb_build_object('erro','dias_invalidos');
          end if;
          select array_agg(distinct d::integer order by d::integer) into v_days from jsonb_array_elements_text(p_args->'dias_semana') d;
        end if;
        if coalesce(cardinality(v_days),0) = 0 then return jsonb_build_object('erro','dias_necessarios'); end if;
      end if;
      if v_freq = 'once' then
        v_date := coalesce(public.assistant_safe_date(p_args->>'data'),
          case when p_action = 'alterar' and p_args->>'data' is null then v_m.run_date end);
        if v_date is null then return jsonb_build_object('erro','data_necessaria'); end if;
      else
        if p_args->>'data' is not null then return jsonb_build_object('erro','data_apenas_envio_unico'); end if;
        v_date := null;
      end if;
    end if;
    if p_action='alterar' and (v_m.title,v_m.body,v_m.frequency,v_m.weekdays,v_m.send_time,v_m.run_date)
      is not distinct from (v_title,v_body,v_freq,v_days,v_time,v_date) then
      v_result := jsonb_build_object('ok',true,'acao','sem_alteracao','missao',public.assistant_mission_json(v_m.id),
        'avisos_habilitados',public.assistant_notice_options(p_team_id)->'avisos');
      insert into assistant_mission_requests(group_id,request_id,member_id,action,args,result)
        values(p_group_id,p_request_id,p_member_id,p_action,p_args,v_result);
      return v_result;
    end if;
    v_next := public.assistant_mission_next(v_freq,v_days,v_time,v_date,now());
    if v_next is null then return jsonb_build_object('erro','data_no_passado','orientacao','Escolha uma data e horário de envio futuros.'); end if;
    if p_action = 'criar' then
      insert into assistant_missions(team_id,group_id,group_activated_at,authorized_by,title,body,frequency,weekdays,send_time,run_date,next_run_at)
        values(p_team_id,p_group_id,v_group.activated_at,p_member_id,v_title,v_body,v_freq,v_days,v_time,v_date,v_next) returning * into v_m;
    else
      update assistant_missions set title=v_title,body=v_body,frequency=v_freq,weekdays=v_days,send_time=v_time,run_date=v_date,
        status=case when p_action='alterar' and status='paused' then 'paused' else 'active' end,
        next_run_at=case when p_action='alterar' and status='paused' then null else v_next end,
        authorized_by=p_member_id,group_activated_at=v_group.activated_at,revision=revision+1,pause_reason=null,updated_at=now()
        where id=v_m.id returning * into v_m;
    end if;
  else
    update assistant_missions set status=case when p_action='pausar' then 'paused' else 'cancelled' end,
      next_run_at=null,revision=revision+1,pause_reason=case when p_action='pausar' then 'leader' end,updated_at=now()
      where id=v_m.id returning * into v_m;
  end if;
  -- A revisão invalida a autorização da fila imediatamente (claim/begin).
  -- Não bloqueia a outbox aqui: seu recibo bloqueia outbox -> missão, e manter
  -- a mesma ordem evita deadlock com pausa/edição durante a entrega.
  v_result := jsonb_build_object('ok',true,'acao',p_action,'missao',public.assistant_mission_json(v_m.id),
    'avisos_habilitados',public.assistant_notice_options(p_team_id)->'avisos');
  insert into assistant_mission_requests(group_id,request_id,member_id,action,args,result)
    values(p_group_id,p_request_id,p_member_id,p_action,p_args,v_result);
  return v_result;
end;
$$;

-- Agenda transacional: uma ocorrência por missão/revisão/instante. Não acumula
-- disparos atrasados; depois de 15 minutos registra a perda e segue a agenda.
create or replace function public.assistant_mission_tick(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare v_m assistant_missions%rowtype; v_count integer := 0; v_due timestamptz; v_enabled boolean;
begin
  if not pg_try_advisory_xact_lock(30120000,1) then return 0; end if;
  delete from assistant_mission_requests where created_at < p_now - interval '90 days';
  for v_m in select m.* from assistant_missions m where m.status='active' order by m.next_run_at nulls last
    for update skip locked loop
    if not exists (select 1 from team_members where id=v_m.authorized_by and team_id=v_m.team_id and role='admin')
      or not exists (select 1 from assistant_groups where id=v_m.group_id and team_id=v_m.team_id and active
        and activated_at=v_m.group_activated_at) then
      update assistant_missions set status='paused',next_run_at=null,revision=revision+1,
        pause_reason='permission_or_group_changed',updated_at=p_now where id=v_m.id;
      continue;
    end if;
    if v_m.next_run_at is null or v_m.next_run_at > p_now then continue; end if;
    v_due := v_m.next_run_at;
    v_enabled := exists (select 1 from assistant_config where enabled)
      and not exists (select 1 from assistant_team_settings where team_id=v_m.team_id and not enabled)
      and public.assistant_notice_options(v_m.team_id)->'avisos'='true'::jsonb;
    if v_due >= p_now - interval '15 minutes' and v_enabled then
      insert into assistant_outbox(team_id,group_id,group_activated_at,topic,kind,payload,
        mission_id,mission_revision,scheduled_for,available_at)
        values(v_m.team_id,v_m.group_id,v_m.group_activated_at,'mission:'||v_m.id||':'||v_m.revision||':'||v_due,'mission',
          jsonb_build_object('categories',jsonb_build_array('avisos'),'title',v_m.title,'body',v_m.body,'code',v_m.code),
          v_m.id,v_m.revision,v_due,p_now) on conflict do nothing;
      v_count := v_count+1;
    else
      update assistant_missions set last_delivery_status=case when v_enabled then 'missed' else 'disabled' end,
        last_delivery_at=p_now,status=case when frequency='once' then 'expired' else status end where id=v_m.id;
    end if;
    update assistant_missions set next_run_at=case when frequency='once' then null else
      public.assistant_mission_next(frequency,weekdays,send_time,run_date,p_now) end,updated_at=p_now where id=v_m.id;
  end loop;
  return v_count;
end;
$$;

-- Mesmas autorizações de grupo, mais revisão, líder atual e janela do agendamento.
create or replace function public.assistant_notice_allowed(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from assistant_outbox q join assistant_groups g on g.id=q.group_id
    join assistant_config c on c.id
    where q.id=p_id and g.team_id=q.team_id and g.active and c.enabled and g.activated_at=q.group_activated_at
      and not exists (select 1 from assistant_team_settings s where s.team_id=q.team_id and not s.enabled)
      and (q.kind<>'mission' or exists (select 1 from assistant_missions m join team_members tm on tm.id=m.authorized_by
        where m.id=q.mission_id and m.team_id=q.team_id and m.group_id=q.group_id and m.group_activated_at=q.group_activated_at
          and m.revision=q.mission_revision and m.status='active' and tm.team_id=m.team_id and tm.role='admin'
          and q.scheduled_for between now()-interval '15 minutes' and now())))
$$;

-- Retém o resultado resumido após a limpeza da fila (30 dias).
create or replace function public.assistant_mission_delivery_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind='mission' and new.status in ('sent','skipped','failed','uncertain') and old.status is distinct from new.status then
    update assistant_missions set last_delivery_status=new.status,last_delivery_at=now(),
      status=case when frequency='once' then 'completed' else status end,updated_at=now()
      where id=new.mission_id and revision=new.mission_revision and status='active';
  end if;
  return new;
end;
$$;
drop trigger if exists assistant_mission_delivery on public.assistant_outbox;
create trigger assistant_mission_delivery after update of status on public.assistant_outbox
  for each row execute function public.assistant_mission_delivery_trigger();

-- Visibilidade e controle no app. Nunca aceita member_id do navegador.
create or replace function public.assistant_missions_overview(p_team_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_team_role(auth.uid(),p_team_id,'admin') then raise exception 'forbidden' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(public.assistant_mission_json(x.id)) from (
    select id from assistant_missions where team_id=p_team_id order by (status in ('active','paused')) desc,created_at desc limit 100
  ) x),'[]'::jsonb);
end;
$$;

create or replace function public.assistant_set_mission_state(p_team_id uuid,p_code text,p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_member uuid; v_group uuid;
begin
  select tm.id into v_member from team_members tm join profiles p on p.id=tm.profile_id
    where tm.team_id=p_team_id and tm.role='admin' and p.user_id=auth.uid();
  if v_member is null then raise exception 'forbidden' using errcode='42501'; end if;
  if p_action is null or p_action not in ('pausar','retomar','cancelar') then raise exception 'invalid_action' using errcode='22023'; end if;
  select group_id into v_group from assistant_missions where team_id=p_team_id and code=upper(trim(p_code));
  return public.assistant_mission_command(p_team_id,v_group,v_member,'app:'||gen_random_uuid(),p_action,jsonb_build_object('codigo',p_code));
end;
$$;

do $$ declare f record;
begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'assistant_mission%' or p.proname='assistant_set_mission_state'
      or p.proname='assistant_notice_allowed') loop
    execute format('revoke all on function %s from public, anon, authenticated',f.sig);
    execute format('grant execute on function %s to service_role',f.sig);
  end loop;
end $$;
grant execute on function public.assistant_missions_overview(uuid) to authenticated;
grant execute on function public.assistant_set_mission_state(uuid,text,text) to authenticated;
notify pgrst, 'reload schema';
