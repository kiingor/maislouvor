-- ============================================================================
-- Assistente do +Louvor no WhatsApp
--
-- Um número da plataforma (instância própria na Evolution API da VPS) entra nos
-- grupos das equipes e só responde quando é mencionado — ou quando alguém
-- responde a uma mensagem dele. Quem pergunta é reconhecido pelo telefone do
-- cadastro (profiles.phone), sempre entre os membros da equipe dona do grupo.
--
-- Cria, sem alterar nenhuma tabela existente:
--   assistant_config ............... configuração interna: liga/desliga, nome,
--                                    número, modelo e limites diários padrão
--   assistant_team_settings ........ por equipe: exceções de limite (plataforma)
--                                    e as instruções do ministério (líder)
--   assistant_groups ............... grupo do WhatsApp -> equipe
--   assistant_activation_codes ..... código que o líder gera no app e manda no grupo
--   assistant_wa_identities ........ id do WhatsApp (telefone ou @lid) -> perfil
--   assistant_link_codes ........... código pessoal, para quando o WhatsApp
--                                    esconde o número de quem escreve (só vale
--                                    no privado; num grupo ele é invalidado)
--   assistant_usage_daily .......... uso por dia da equipe (e tokens)
--   assistant_member_usage_daily ... uso por dia de cada pessoa
--   assistant_messages ............. perguntas e respostas (30 dias): histórico
--                                    curto da conversa e auditoria
--   assistant_inbound_seen ......... deduplicação dos webhooks
--   assistant_notices .............. evita repetir avisos automáticos
--
-- Acesso:
--   * nenhuma tabela tem policy — o app só vê o que as RPCs devolvem;
--   * RPCs do app (security definer) checam o papel de quem chama;
--   * RPCs internas, usadas pela edge function whatsapp-assistant com a
--     service_role, têm EXECUTE revogado de anon/authenticated no fim do arquivo.
--
-- Os limites padrão ficam em assistant_config e as exceções em
-- assistant_team_settings; um painel da plataforma vai editá-los depois.
--
-- Idempotente: seguro rodar mais de uma vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tabelas
-- ----------------------------------------------------------------------------

create table if not exists public.assistant_config (
  id                 boolean primary key default true check (id),
  -- Só liga depois que o número estiver conectado na Evolution.
  enabled            boolean not null default false,
  assistant_name     text not null default 'Asafe'
                     check (char_length(btrim(assistant_name)) between 2 and 30),
  -- Número da plataforma só com dígitos (ex.: 5511999999999). Aparece no app.
  bot_phone          text,
  -- Ids do próprio número vistos nos grupos (telefone e @lid), sem ":device".
  bot_ids            text[] not null default '{}',
  model              text not null default 'gpt-6-luna',
  -- 'default' = não manda o parâmetro (modelos sem raciocínio, ex.: gpt-4.1-mini).
  reasoning_effort   text not null default 'none'
                     check (reasoning_effort in ('default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh')),
  team_daily_limit   integer not null default 100 check (team_daily_limit >= 0),
  member_daily_limit integer not null default 20 check (member_daily_limit >= 0),
  -- Histórico curto que acompanha a pergunta (pares pergunta/resposta).
  history_turns      integer not null default 4 check (history_turns between 0 and 20),
  history_minutes    integer not null default 180 check (history_minutes between 0 and 1440),
  -- Último webhook recebido: a Evolution 2.3.7 às vezes para de enviar em silêncio.
  last_event_at      timestamptz,
  updated_at         timestamptz not null default now()
);

insert into public.assistant_config (id) values (true) on conflict (id) do nothing;

create table if not exists public.assistant_team_settings (
  team_id                 uuid primary key references public.teams(id) on delete cascade,
  -- Plataforma: suspender a equipe e trocar os limites padrão.
  enabled                 boolean not null default true,
  team_daily_limit        integer check (team_daily_limit is null or team_daily_limit >= 0),
  member_daily_limit      integer check (member_daily_limit is null or member_daily_limit >= 0),
  unlimited               boolean not null default false,
  -- Líder: o que o assistente deve saber do ministério (ensaio, local...).
  instructions            text check (instructions is null or char_length(instructions) <= 2000),
  instructions_updated_by uuid references public.profiles(id) on delete set null,
  updated_at              timestamptz not null default now()
);

create table if not exists public.assistant_groups (
  id             uuid primary key default gen_random_uuid(),
  group_jid      text not null unique,
  team_id        uuid not null references public.teams(id) on delete cascade,
  group_name     text,
  active         boolean not null default true,
  activated_by   uuid references public.profiles(id) on delete set null,
  activated_at   timestamptz not null default now(),
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles(id) on delete set null
);
create index if not exists assistant_groups_team_id_idx on public.assistant_groups(team_id);

create table if not exists public.assistant_activation_codes (
  code           text primary key,
  team_id        uuid not null references public.teams(id) on delete cascade,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  used_at        timestamptz,
  used_group_jid text
);
create index if not exists assistant_activation_codes_team_id_idx on public.assistant_activation_codes(team_id);

create table if not exists public.assistant_wa_identities (
  wa_id        text primary key,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  source       text not null check (source in ('phone', 'code')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists assistant_wa_identities_profile_id_idx on public.assistant_wa_identities(profile_id);

create table if not exists public.assistant_link_codes (
  code       text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);
create index if not exists assistant_link_codes_profile_id_idx on public.assistant_link_codes(profile_id);

create table if not exists public.assistant_usage_daily (
  team_id        uuid not null references public.teams(id) on delete cascade,
  day            date not null,
  requests       integer not null default 0,
  tokens_in      bigint not null default 0,
  tokens_out     bigint not null default 0,
  limit_notified boolean not null default false,
  primary key (team_id, day)
);

create table if not exists public.assistant_member_usage_daily (
  team_id        uuid not null references public.teams(id) on delete cascade,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  day            date not null,
  requests       integer not null default 0,
  limit_notified boolean not null default false,
  primary key (team_id, profile_id, day)
);

create table if not exists public.assistant_messages (
  id            uuid primary key default gen_random_uuid(),
  -- Ordem de gravação (desempata perguntas e respostas gravadas no mesmo instante).
  seq           bigint generated always as identity,
  wa_message_id text,
  group_jid     text not null,
  team_id       uuid references public.teams(id) on delete cascade,
  profile_id    uuid references public.profiles(id) on delete set null,
  direction     text not null check (direction in ('in', 'out')),
  body          text not null,
  tokens_in     integer,
  tokens_out    integer,
  model         text,
  error         text,
  created_at    timestamptz not null default now()
);
create index if not exists assistant_messages_history_idx
  on public.assistant_messages(group_jid, profile_id, seq desc);
create index if not exists assistant_messages_created_at_idx on public.assistant_messages(created_at);

create table if not exists public.assistant_inbound_seen (
  wa_message_id text primary key,
  seen_at       timestamptz not null default now()
);

create table if not exists public.assistant_notices (
  key     text primary key,
  sent_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array[
    'assistant_config', 'assistant_team_settings', 'assistant_groups',
    'assistant_activation_codes', 'assistant_wa_identities', 'assistant_link_codes',
    'assistant_usage_daily', 'assistant_member_usage_daily', 'assistant_messages',
    'assistant_inbound_seen', 'assistant_notices'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    -- Os default privileges do Supabase dão tudo a anon/authenticated; aqui não.
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on table public.%I from authenticated', t);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Utilitários
-- ----------------------------------------------------------------------------

-- "Hoje" no fuso das igrejas (cultos.date é date, sem hora).
create or replace function public.assistant_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- Dia da semana já pronto: o modelo não precisa calcular (e errar) datas.
create or replace function public.assistant_weekday(p_date date)
returns text
language sql
immutable
as $$
  select (array['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
                'quinta-feira', 'sexta-feira', 'sábado'])[extract(dow from p_date)::int + 1]
$$;

-- Minúsculas sem acento, para buscas ("Oração" casa com "oracao").
create or replace function public.assistant_fold(p text)
returns text
language sql
immutable
as $$
  select lower(translate(coalesce(p, ''),
    'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))
$$;

-- Os argumentos das ferramentas vêm do modelo: nada de cast que estoure.
create or replace function public.assistant_safe_date(p text)
returns date
language plpgsql
immutable
as $$
begin
  if p is null or btrim(p) !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return btrim(p)::date;
exception when others then
  return null;
end;
$$;

create or replace function public.assistant_safe_uuid(p text)
returns uuid
language plpgsql
immutable
as $$
begin
  if p is null or btrim(p) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return btrim(p)::uuid;
end;
$$;

create or replace function public.assistant_safe_int(p text, p_default integer, p_min integer, p_max integer)
returns integer
language plpgsql
immutable
as $$
begin
  if p is null or btrim(p) !~ '^-?\d{1,9}$' then
    return p_default;
  end if;
  return greatest(p_min, least(p_max, btrim(p)::integer));
end;
$$;

-- Mesma ordem de src/data/instruments.ts (vozes, legados, instrumentos).
create or replace function public.assistant_instrument_order(p text)
returns integer
language sql
immutable
as $$
  select coalesce(array_position(array[
    'Ministrante', 'Soprano', 'Mezo', 'Contralto', 'Tenor', 'Barítono', 'Baixo (voz)',
    'Back 1', 'Back 2', 'Back 3', 'Back 4',
    'Violão', 'Guitarra', 'Baixo', 'Bateria', 'Teclado', 'Cajon', 'Mesa de Som'
  ], p), 999)
$$;

create or replace function public.assistant_lineup_label(p public.lineup_status)
returns text
language sql
immutable
as $$
  select case p when 'accepted' then 'confirmado' when 'declined' then 'recusado' else 'pendente' end
$$;

create or replace function public.assistant_role_label(p public.team_role)
returns text
language sql
immutable
as $$
  select case p when 'admin' then 'líder' when 'editor' then 'editor' else 'membro' end
$$;

-- Dígitos de um telefone, sem zeros à esquerda ("(011) 98765-4321" -> "11987654321").
create or replace function public.assistant_phone_digits(p text)
returns text
language sql
immutable
as $$
  select nullif(ltrim(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '0'), '')
$$;

-- O telefone do cadastro é o mesmo número que escreveu no WhatsApp?
--
-- Brasil: compara DDD + últimos 8 dígitos, porque o WhatsApp guarda muitos
-- celulares antigos sem o nono dígito (55 11 8765-4321). Cadastro sem DDD
-- compara só os 8 finais (a busca é sempre dentro de uma única equipe).
-- Outros países: número completo, com ou sem o código do país.
create or replace function public.assistant_phone_matches(p_profile_phone text, p_sender text)
returns boolean
language plpgsql
immutable
as $$
declare
  m     text := public.assistant_phone_digits(p_profile_phone);
  s     text := public.assistant_phone_digits(p_sender);
  m_ddd text;
begin
  if m is null or s is null or length(m) < 8 or length(s) < 8 then
    return false;
  end if;

  if left(s, 2) = '55' and length(s) in (12, 13) then
    if left(m, 2) = '55' and length(m) in (12, 13) then
      m_ddd := substr(m, 3, 2);
    elsif length(m) in (10, 11) then
      m_ddd := left(m, 2);
    elsif length(m) in (8, 9) then
      m_ddd := null;
    else
      return false;
    end if;
    return right(m, 8) = right(s, 8) and (m_ddd is null or m_ddd = substr(s, 3, 2));
  end if;

  return s = m or right(s, length(m)) = m;
end;
$$;

-- user_id do membro, garantindo que ele é da equipe (null se não for).
create or replace function public.assistant_member_user(p_team_id uuid, p_member_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id
    from public.team_members tm
    join public.profiles p on p.id = tm.profile_id
   where tm.id = p_member_id
     and tm.team_id = p_team_id
$$;

-- Novo código curto (mesmo alfabeto do código da equipe), com nova tentativa em colisão.
create or replace function public.assistant_new_code(p_table text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code  text;
  v_taken boolean;
begin
  if p_table not in ('assistant_activation_codes', 'assistant_link_codes') then
    raise exception 'invalid table %', p_table;
  end if;
  for i in 1..30 loop
    v_code := public.gen_team_code();
    execute format('select exists (select 1 from public.%I where code = $1)', p_table)
      into v_taken using v_code;
    if not v_taken then
      return v_code;
    end if;
  end loop;
  raise exception 'could_not_generate';
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) RPCs internas (edge function whatsapp-assistant, service_role)
-- ----------------------------------------------------------------------------

create or replace function public.assistant_runtime_config()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'enabled', c.enabled,
    'assistant_name', c.assistant_name,
    'bot_phone', c.bot_phone,
    'bot_ids', to_jsonb(c.bot_ids),
    'model', c.model,
    'reasoning_effort', c.reasoning_effort,
    'history_turns', c.history_turns,
    'history_minutes', c.history_minutes
  )
  from public.assistant_config c
  where c.id
$$;

-- Marca que a Evolution continua mandando eventos (no máximo 1 escrita por minuto).
create or replace function public.assistant_touch_event()
returns void
language sql
security definer
set search_path = public
as $$
  update public.assistant_config
     set last_event_at = now()
   where id
     and (last_event_at is null or last_event_at < now() - interval '1 minute')
$$;

-- Guarda ids do próprio número (telefone e @lid) para reconhecer menções.
create or replace function public.assistant_note_bot_ids(p_ids text[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.assistant_config c
     set bot_ids = (
           select coalesce(array_agg(distinct x order by x), '{}')
             from unnest(c.bot_ids || coalesce(p_ids, '{}')) x
            where coalesce(x, '') <> ''
         ),
         updated_at = now()
   where c.id
     and not (coalesce(p_ids, '{}') <@ c.bot_ids)
$$;

create or replace function public.assistant_purge()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.assistant_inbound_seen where seen_at < now() - interval '3 days';
  delete from public.assistant_notices where sent_at < now() - interval '7 days';
  delete from public.assistant_messages where created_at < now() - interval '30 days';
  delete from public.assistant_activation_codes where coalesce(used_at, expires_at) < now() - interval '7 days';
  delete from public.assistant_link_codes where coalesce(used_at, expires_at) < now() - interval '7 days';
$$;

-- true só na primeira vez que a mensagem chega (webhook repetido é ignorado).
create or replace function public.assistant_claim_message(p_wa_message_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  if coalesce(p_wa_message_id, '') = '' then
    return true;
  end if;
  insert into public.assistant_inbound_seen (wa_message_id)
  values (p_wa_message_id)
  on conflict (wa_message_id) do nothing;
  get diagnostics v_rows = row_count;

  -- Limpeza ocasional, sem depender de cron.
  if v_rows > 0 and random() < 0.01 then
    perform public.assistant_purge();
  end if;
  return v_rows > 0;
end;
$$;

-- true se o aviso identificado por p_key pode sair agora (um a cada p_minutes).
create or replace function public.assistant_should_notify(p_key text, p_minutes integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  insert into public.assistant_notices as n (key, sent_at)
  values (p_key, now())
  on conflict (key) do update
    set sent_at = excluded.sent_at
    where n.sent_at <= now() - make_interval(mins => greatest(p_minutes, 0));
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create or replace function public.assistant_group_context(p_group_jid text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'group_id', g.id,
    'team_id', g.team_id,
    'team_name', t.name,
    'group_name', g.group_name,
    'active', g.active,
    'team_enabled', coalesce(s.enabled, true),
    'instructions', s.instructions,
    'availability_mode', t.availability_mode
  )
  from public.assistant_groups g
  join public.teams t on t.id = g.team_id
  left join public.assistant_team_settings s on s.team_id = g.team_id
  where g.group_jid = p_group_jid
$$;

-- "@Asafe ativar CÓDIGO" no grupo. O código (uso único, 24 h) é a prova de que
-- um líder da equipe autorizou este grupo.
create or replace function public.assistant_activate_group(p_code text, p_group_jid text, p_group_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code  public.assistant_activation_codes%rowtype;
  v_group public.assistant_groups%rowtype;
  v_team  text;
begin
  select * into v_code
    from public.assistant_activation_codes
   where code = upper(btrim(coalesce(p_code, '')))
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  elsif v_code.used_at is not null then
    return jsonb_build_object('ok', false, 'error', 'used_code');
  elsif v_code.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired_code');
  end if;

  select * into v_group from public.assistant_groups where group_jid = p_group_jid for update;
  if found and v_group.active and v_group.team_id <> v_code.team_id then
    return jsonb_build_object('ok', false, 'error', 'group_taken');
  end if;

  insert into public.assistant_groups as g
    (group_jid, team_id, group_name, active, activated_by, activated_at, deactivated_at, deactivated_by)
  values
    (p_group_jid, v_code.team_id, nullif(btrim(coalesce(p_group_name, '')), ''), true, v_code.created_by, now(), null, null)
  on conflict (group_jid) do update
    set team_id = excluded.team_id,
        group_name = coalesce(excluded.group_name, g.group_name),
        active = true,
        activated_by = excluded.activated_by,
        activated_at = now(),
        deactivated_at = null,
        deactivated_by = null;

  update public.assistant_activation_codes
     set used_at = now(), used_group_jid = p_group_jid
   where code = v_code.code;

  select name into v_team from public.teams where id = v_code.team_id;
  return jsonb_build_object('ok', true, 'team_id', v_code.team_id, 'team_name', v_team);
end;
$$;

-- Desliga o grupo: p_profile_id = líder que pediu no grupo; null = o número saiu do grupo.
create or replace function public.assistant_deactivate_group_jid(p_group_jid text, p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.assistant_groups%rowtype;
begin
  select * into v_group from public.assistant_groups where group_jid = p_group_jid for update;
  if not found or not v_group.active then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;
  if p_profile_id is not null and not exists (
    select 1 from public.team_members
     where team_id = v_group.team_id and profile_id = p_profile_id and role = 'admin'
  ) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update public.assistant_groups
     set active = false, deactivated_at = now(), deactivated_by = p_profile_id
   where id = v_group.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Quem mandou a mensagem? p_wa_ids = ids vistos (telefone@s.whatsapp.net e/ou
-- @lid); p_phones = números do remetente, quando o WhatsApp mostra.
create or replace function public.assistant_resolve_sender(p_team_id uuid, p_wa_ids text[], p_phones text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids        text[] := array(select distinct x from unnest(coalesce(p_wa_ids, '{}'::text[])) x where coalesce(x, '') <> '');
  v_phones     text[] := array(select distinct x from unnest(coalesce(p_phones, '{}'::text[])) x where coalesce(x, '') <> '');
  v_profile    uuid;
  v_source     text;
  v_candidates uuid[];
  v_member     public.team_members%rowtype;
  v_name       text;
begin
  -- 1) Id já ligado a um membro DESTA equipe (vínculo por código vale mais que
  --    o feito pelo telefone). O mesmo WhatsApp pode ter perfis em equipes diferentes.
  select i.profile_id, i.source into v_profile, v_source
    from public.assistant_wa_identities i
    join public.team_members tm on tm.profile_id = i.profile_id and tm.team_id = p_team_id
   where i.wa_id = any(v_ids)
   order by (i.source = 'code') desc, i.last_seen_at desc
   limit 1;

  -- O telefone do perfil mudou desde o vínculo: refaz pelo número atual.
  if v_profile is not null and v_source = 'phone' and cardinality(v_phones) > 0
     and not exists (
       select 1
         from public.profiles p, unnest(v_phones) ph
        where p.id = v_profile and public.assistant_phone_matches(p.phone, ph)
     ) then
    delete from public.assistant_wa_identities where wa_id = any(v_ids) and source = 'phone';
    v_profile := null;
  end if;

  -- 2) Telefone do cadastro, só entre os membros desta equipe.
  if v_profile is null then
    select array_agg(distinct tm.profile_id) into v_candidates
      from public.team_members tm
      join public.profiles p on p.id = tm.profile_id
     where tm.team_id = p_team_id
       and exists (select 1 from unnest(v_phones) ph where public.assistant_phone_matches(p.phone, ph));

    if coalesce(cardinality(v_candidates), 0) = 0 then
      -- Conhecido pelo assistente, mas de outra equipe (ainda não entrou nesta).
      if exists (select 1 from public.assistant_wa_identities i where i.wa_id = any(v_ids)) then
        return jsonb_build_object('ok', false, 'error', 'not_member');
      end if;
      return jsonb_build_object('ok', false,
        'error', case when cardinality(v_phones) = 0 then 'no_phone' else 'unknown' end);
    elsif cardinality(v_candidates) > 1 then
      return jsonb_build_object('ok', false, 'error', 'ambiguous');
    end if;
    v_profile := v_candidates[1];
    v_source := 'phone';
  end if;

  -- Lembra todos os ids vistos (ex.: o @lid que chegou junto com o telefone).
  insert into public.assistant_wa_identities as i (wa_id, profile_id, source)
  select x, v_profile, v_source from unnest(v_ids) x
  on conflict (wa_id) do update
    set last_seen_at = now()
    where i.profile_id = excluded.profile_id;

  select * into v_member from public.team_members where team_id = p_team_id and profile_id = v_profile;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;

  select full_name into v_name from public.profiles where id = v_profile;
  return jsonb_build_object(
    'ok', true,
    'member_id', v_member.id,
    'profile_id', v_profile,
    'full_name', coalesce(nullif(btrim(v_name), ''), 'Membro'),
    'role', v_member.role,
    'instruments', coalesce(to_jsonb(v_member.instruments), '[]'::jsonb),
    'source', v_source
  );
end;
$$;

-- "vincular CÓDIGO" no PRIVADO do assistente: liga os ids deste WhatsApp ao
-- perfil que gerou o código, e avisa o dono no app (sino de notificações).
create or replace function public.assistant_link_identity(p_code text, p_wa_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.assistant_link_codes%rowtype;
  v_ids  text[] := array(select distinct x from unnest(coalesce(p_wa_ids, '{}'::text[])) x where coalesce(x, '') <> '');
  v_name text;
begin
  select * into v_code
    from public.assistant_link_codes
   where code = upper(btrim(coalesce(p_code, '')))
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  elsif v_code.used_at is not null then
    return jsonb_build_object('ok', false, 'error', 'used_code');
  elsif v_code.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired_code');
  elsif cardinality(v_ids) = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_sender');
  end if;

  insert into public.assistant_wa_identities as i (wa_id, profile_id, source)
  select x, v_code.profile_id, 'code' from unnest(v_ids) x
  on conflict (wa_id) do update
    set profile_id = excluded.profile_id, source = 'code', last_seen_at = now();

  update public.assistant_link_codes set used_at = now() where code = v_code.code;

  insert into public.notifications (profile_id, type, title, body, link)
  values (v_code.profile_id, 'assistant', 'WhatsApp vinculado ao assistente',
          'Um WhatsApp foi vinculado ao seu perfil com o seu código. Se não foi você, desvincule em Ajustes › Meu usuário.',
          '/app/settings');

  select full_name into v_name from public.profiles where id = v_code.profile_id;
  return jsonb_build_object('ok', true, 'full_name', coalesce(nullif(btrim(v_name), ''), 'Membro'));
end;
$$;

-- Código de vínculo que apareceu num grupo ficou público: invalida sem vincular.
create or replace function public.assistant_burn_link_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  update public.assistant_link_codes
     set used_at = now()
   where code = upper(btrim(coalesce(p_code, ''))) and used_at is null;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- Reserva 1 pergunta no limite do dia (equipe e pessoa). Atômico.
create or replace function public.assistant_consume_quota(p_team_id uuid, p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day          date := public.assistant_today();
  v_cfg          public.assistant_config%rowtype;
  v_set          public.assistant_team_settings%rowtype;
  v_unlimited    boolean;
  v_team_limit   integer;
  v_member_limit integer;
  v_team         public.assistant_usage_daily%rowtype;
  v_member       public.assistant_member_usage_daily%rowtype;
begin
  select * into v_cfg from public.assistant_config where id;
  select * into v_set from public.assistant_team_settings where team_id = p_team_id;
  if not coalesce(v_cfg.enabled, false) or not coalesce(v_set.enabled, true) then
    return jsonb_build_object('allowed', false, 'reason', 'disabled');
  end if;

  v_unlimited := coalesce(v_set.unlimited, false);
  v_team_limit := coalesce(v_set.team_daily_limit, v_cfg.team_daily_limit);
  v_member_limit := coalesce(v_set.member_daily_limit, v_cfg.member_daily_limit);

  insert into public.assistant_usage_daily (team_id, day) values (p_team_id, v_day)
  on conflict do nothing;
  insert into public.assistant_member_usage_daily (team_id, profile_id, day) values (p_team_id, p_profile_id, v_day)
  on conflict do nothing;
  select * into v_team from public.assistant_usage_daily
   where team_id = p_team_id and day = v_day for update;
  select * into v_member from public.assistant_member_usage_daily
   where team_id = p_team_id and profile_id = p_profile_id and day = v_day for update;

  if not v_unlimited and v_team.requests >= v_team_limit then
    update public.assistant_usage_daily set limit_notified = true
     where team_id = p_team_id and day = v_day;
    return jsonb_build_object('allowed', false, 'reason', 'team_limit',
      'notify', not v_team.limit_notified, 'limit', v_team_limit);
  end if;
  if not v_unlimited and v_member.requests >= v_member_limit then
    update public.assistant_member_usage_daily set limit_notified = true
     where team_id = p_team_id and profile_id = p_profile_id and day = v_day;
    return jsonb_build_object('allowed', false, 'reason', 'member_limit',
      'notify', not v_member.limit_notified, 'limit', v_member_limit);
  end if;

  update public.assistant_usage_daily set requests = requests + 1
   where team_id = p_team_id and day = v_day;
  update public.assistant_member_usage_daily set requests = requests + 1
   where team_id = p_team_id and profile_id = p_profile_id and day = v_day;

  return jsonb_build_object(
    'allowed', true,
    'day', v_day,
    'team_used', v_team.requests + 1,
    'team_limit', case when v_unlimited then null else v_team_limit end,
    'member_used', v_member.requests + 1,
    'member_limit', case when v_unlimited then null else v_member_limit end
  );
end;
$$;

-- Devolve a pergunta reservada quando a IA falhou (a pessoa não recebeu resposta).
-- p_day = o dia devolvido por assistant_consume_quota (a falha pode cruzar a meia-noite).
create or replace function public.assistant_refund_quota(p_team_id uuid, p_profile_id uuid, p_day date default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.assistant_usage_daily set requests = greatest(requests - 1, 0)
   where team_id = p_team_id and day = coalesce(p_day, public.assistant_today());
  update public.assistant_member_usage_daily set requests = greatest(requests - 1, 0)
   where team_id = p_team_id and profile_id = p_profile_id and day = coalesce(p_day, public.assistant_today());
$$;

create or replace function public.assistant_log_exchange(
  p_group_jid     text,
  p_team_id       uuid,
  p_profile_id    uuid,
  p_wa_message_id text,
  p_question      text,
  p_answer        text,
  p_tokens_in     integer,
  p_tokens_out    integer,
  p_model         text,
  p_error         text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.assistant_messages
    (wa_message_id, group_jid, team_id, profile_id, direction, body, error, created_at)
  values
    (p_wa_message_id, p_group_jid, p_team_id, p_profile_id, 'in',
     left(coalesce(p_question, ''), 2000), left(p_error, 500), now());

  if p_answer is not null then
    insert into public.assistant_messages
      (group_jid, team_id, profile_id, direction, body, tokens_in, tokens_out, model, created_at)
    values
      (p_group_jid, p_team_id, p_profile_id, 'out', left(p_answer, 4000),
       p_tokens_in, p_tokens_out, p_model, now());
  end if;

  if p_team_id is not null and (coalesce(p_tokens_in, 0) > 0 or coalesce(p_tokens_out, 0) > 0) then
    update public.assistant_usage_daily
       set tokens_in = tokens_in + coalesce(p_tokens_in, 0),
           tokens_out = tokens_out + coalesce(p_tokens_out, 0)
     where team_id = p_team_id and day = public.assistant_today();
  end if;
end;
$$;

-- Últimas trocas da pessoa neste grupo, para perguntas de continuação ("e no outro domingo?").
create or replace function public.assistant_history(p_group_jid text, p_profile_id uuid, p_turns integer, p_minutes integer)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
           jsonb_build_object('role', case s.direction when 'in' then 'user' else 'assistant' end,
                              'content', s.body)
           order by s.seq), '[]'::jsonb)
    from (
      select m.direction, m.body, m.seq
        from public.assistant_messages m
       where m.group_jid = p_group_jid
         and m.profile_id = p_profile_id
         and m.error is null
         and m.created_at > now() - make_interval(mins => greatest(p_minutes, 0))
       order by m.seq desc
       limit greatest(p_turns, 0) * 2
    ) s
$$;

-- ----------------------------------------------------------------------------
-- 4) Ferramentas do assistente (sempre presas à equipe do grupo e a quem perguntou)
-- ----------------------------------------------------------------------------

create or replace function public.assistant_tool_minha_escala(p_team_id uuid, p_member_id uuid, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user  uuid := public.assistant_member_user(p_team_id, p_member_id);
  v_today date := public.assistant_today();
  v_limit integer := public.assistant_safe_int(p_args->>'limite', 5, 1, 10);
  v_items jsonb;
begin
  if v_user is null then
    return jsonb_build_object('erro', 'membro_invalido');
  elsif not public.member_can(v_user, p_team_id, 'cultos', 'ver') then
    return jsonb_build_object('erro', 'sem_permissao', 'detalhe', 'O acesso desta pessoa aos cultos está bloqueado na equipe.');
  end if;

  select coalesce(jsonb_agg(s.item order by s.d, s.n), '[]'::jsonb) into v_items
    from (
      select c.date as d, c.name as n, jsonb_build_object(
               'culto_id', c.id,
               'culto', c.name,
               'data', c.date,
               'dia_semana', public.assistant_weekday(c.date),
               'funcoes', jsonb_agg(l.instrument order by public.assistant_instrument_order(l.instrument), l.instrument),
               'confirmacao', case
                 when bool_and(l.status = 'accepted') then 'confirmado'
                 when bool_or(l.status = 'declined') then 'recusado'
                 else 'pendente' end
             ) as item
        from public.culto_lineup l
        join public.cultos c on c.id = l.culto_id
       where l.team_member_id = p_member_id
         and c.team_id = p_team_id
         and c.date >= v_today
       group by c.id, c.date, c.name
       order by c.date, c.name
       limit v_limit
    ) s;

  return jsonb_build_object('hoje', v_today, 'escalas', v_items);
end;
$$;

create or replace function public.assistant_tool_meus_instrumentos(p_team_id uuid, p_member_id uuid, p_args jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object(
              'funcoes', coalesce(to_jsonb(tm.instruments), '[]'::jsonb),
              'niveis', coalesce(tm.instrument_levels, '{}'::jsonb),
              'papel', public.assistant_role_label(tm.role))
       from public.team_members tm
      where tm.id = p_member_id and tm.team_id = p_team_id),
    jsonb_build_object('erro', 'membro_invalido'))
$$;

create or replace function public.assistant_tool_proximos_cultos(p_team_id uuid, p_member_id uuid, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user  uuid := public.assistant_member_user(p_team_id, p_member_id);
  v_today date := public.assistant_today();
  v_from  date := coalesce(public.assistant_safe_date(p_args->>'de'), public.assistant_today());
  v_to    date := public.assistant_safe_date(p_args->>'ate');
  v_limit integer := public.assistant_safe_int(p_args->>'limite', 5, 1, 10);
  v_items jsonb;
begin
  if v_user is null then
    return jsonb_build_object('erro', 'membro_invalido');
  elsif not public.member_can(v_user, p_team_id, 'cultos', 'ver') then
    return jsonb_build_object('erro', 'sem_permissao', 'detalhe', 'O acesso desta pessoa aos cultos está bloqueado na equipe.');
  end if;

  select coalesce(jsonb_agg(s.item order by s.d, s.n), '[]'::jsonb) into v_items
    from (
      select c.date as d, c.name as n, jsonb_build_object(
               'culto_id', c.id,
               'culto', c.name,
               'data', c.date,
               'dia_semana', public.assistant_weekday(c.date),
               'descricao', nullif(btrim(coalesce(c.description, '')), ''),
               'minhas_funcoes', (
                 select coalesce(jsonb_agg(l.instrument order by public.assistant_instrument_order(l.instrument)), '[]'::jsonb)
                   from public.culto_lineup l
                  where l.culto_id = c.id and l.team_member_id = p_member_id),
               'pessoas_escaladas', (
                 select count(distinct l.team_member_id) from public.culto_lineup l where l.culto_id = c.id),
               'musicas', (select count(*) from public.culto_songs cs where cs.culto_id = c.id)
             ) as item
        from public.cultos c
       where c.team_id = p_team_id
         and c.date >= v_from
         and (v_to is null or c.date <= v_to)
       order by c.date, c.name
       limit v_limit
    ) s;

  return jsonb_build_object('hoje', v_today, 'cultos', v_items);
end;
$$;

-- Escala, roteiro (músicas e momentos em ordem), tons, BPM, links e vozes de um culto.
create or replace function public.assistant_culto_details(p_culto_id uuid, p_member_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'culto_id', c.id,
    'culto', c.name,
    'data', c.date,
    'dia_semana', public.assistant_weekday(c.date),
    'descricao', nullif(btrim(coalesce(c.description, '')), ''),
    'minhas_funcoes', (
      select coalesce(jsonb_agg(l.instrument order by public.assistant_instrument_order(l.instrument)), '[]'::jsonb)
        from public.culto_lineup l
       where l.culto_id = c.id and l.team_member_id = p_member_id),
    'escala', coalesce((
      select jsonb_agg(jsonb_build_object('funcao', e.instrument, 'pessoas', e.pessoas)
                       order by public.assistant_instrument_order(e.instrument), e.instrument)
        from (
          select l.instrument,
                 jsonb_agg(jsonb_build_object(
                   'nome', coalesce(nullif(btrim(p.full_name), ''), 'Sem nome'),
                   'confirmacao', public.assistant_lineup_label(l.status))
                   order by p.full_name) as pessoas
            from public.culto_lineup l
            join public.team_members tm on tm.id = l.team_member_id
            join public.profiles p on p.id = tm.profile_id
           where l.culto_id = c.id
           group by l.instrument
        ) e), '[]'::jsonb),
    'roteiro', coalesce((
      select jsonb_agg(r.item order by r.sort_order, r.k)
        from (
          select cs.sort_order, 0 as k, jsonb_build_object(
                   'tipo', 'musica',
                   'titulo', s.title,
                   'artista', s.artist,
                   'tom', coalesce(nullif(cs.key_override, ''), nullif(s.key_current, ''), s.key_original),
                   'tom_original', s.key_original,
                   'bpm', s.bpm,
                   'link', s.media_url,
                   'observacao', nullif(btrim(coalesce(cs.notes, '')), ''),
                   'vozes', (
                     select jsonb_agg(jsonb_build_object('nome', p.full_name, 'voz', v.voice, 'naipe', v.voice_part)
                                      order by v.voice, p.full_name)
                       from public.culto_song_voices v
                       join public.team_members tm on tm.id = v.team_member_id
                       join public.profiles p on p.id = tm.profile_id
                      where v.culto_song_id = cs.id)
                 ) as item
            from public.culto_songs cs
            join public.songs s on s.id = cs.song_id
           where cs.culto_id = c.id
          union all
          select b.sort_order, 1, jsonb_build_object(
                   'tipo', 'momento',
                   'titulo', b.title,
                   'duracao_min', b.duration_min,
                   'observacao', nullif(btrim(coalesce(b.notes, '')), ''))
            from public.culto_blocks b
           where b.culto_id = c.id
        ) r), '[]'::jsonb)
  )
  from public.cultos c
  where c.id = p_culto_id
$$;

create or replace function public.assistant_tool_detalhes_culto(p_team_id uuid, p_member_id uuid, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user  uuid := public.assistant_member_user(p_team_id, p_member_id);
  v_today date := public.assistant_today();
  v_id    uuid := public.assistant_safe_uuid(p_args->>'culto_id');
  v_date  date := public.assistant_safe_date(p_args->>'data');
  v_ids   uuid[];
begin
  if v_user is null then
    return jsonb_build_object('erro', 'membro_invalido');
  elsif not public.member_can(v_user, p_team_id, 'cultos', 'ver') then
    return jsonb_build_object('erro', 'sem_permissao', 'detalhe', 'O acesso desta pessoa aos cultos está bloqueado na equipe.');
  end if;

  if v_id is not null then
    select array_agg(c.id) into v_ids from public.cultos c where c.id = v_id and c.team_id = p_team_id;
  elsif v_date is not null then
    select array_agg(s.id order by s.name) into v_ids
      from (select c.id, c.name from public.cultos c
             where c.team_id = p_team_id and c.date = v_date
             order by c.name limit 3) s;
  else
    select array_agg(s.id) into v_ids
      from (select c.id from public.cultos c
             where c.team_id = p_team_id and c.date >= v_today
             order by c.date, c.name limit 1) s;
  end if;

  if v_ids is null then
    return jsonb_build_object('hoje', v_today, 'cultos', '[]'::jsonb, 'aviso', 'nenhum culto encontrado');
  end if;

  return jsonb_build_object(
    'hoje', v_today,
    'cultos', (select jsonb_agg(public.assistant_culto_details(x.id, p_member_id) order by x.ord)
                 from unnest(v_ids) with ordinality as x(id, ord))
  );
end;
$$;

create or replace function public.assistant_tool_buscar_musica(p_team_id uuid, p_member_id uuid, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user  uuid := public.assistant_member_user(p_team_id, p_member_id);
  v_today date := public.assistant_today();
  v_term  text := public.assistant_fold(btrim(coalesce(p_args->>'termo', '')));
  v_like  text;
  v_items jsonb;
begin
  if v_user is null then
    return jsonb_build_object('erro', 'membro_invalido');
  elsif char_length(v_term) < 2 then
    return jsonb_build_object('erro', 'termo_curto');
  elsif not public.member_can(v_user, p_team_id, 'musicas', 'ver') then
    return jsonb_build_object('erro', 'sem_permissao', 'detalhe', 'O acesso desta pessoa às músicas está bloqueado na equipe.');
  end if;

  v_like := '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with found as (
    select s.*,
           case when public.assistant_fold(s.title) = v_term then 0
                when public.assistant_fold(s.title) like v_term || '%' then 1
                else 2 end as rank
      from public.songs s
     where s.team_id = p_team_id
       and (public.assistant_fold(s.title) like v_like escape '\'
            or public.assistant_fold(s.artist) like v_like escape '\')
  )
  select coalesce(jsonb_agg(f.item order by f.rank, f.title), '[]'::jsonb) into v_items
    from (
      select found.rank, found.title, jsonb_build_object(
               'titulo', found.title,
               'artista', found.artist,
               'tom', coalesce(nullif(found.key_current, ''), found.key_original),
               'tom_original', found.key_original,
               'bpm', found.bpm,
               'tema', found.theme,
               'link', found.media_url,
               'ultima_vez', (
                 select jsonb_build_object('data', c.date, 'culto', c.name)
                   from public.culto_songs cs
                   join public.cultos c on c.id = cs.culto_id
                  where cs.song_id = found.id and c.team_id = p_team_id and c.date < v_today
                  order by c.date desc limit 1),
               'proxima_vez', (
                 select jsonb_build_object(
                          'data', c.date,
                          'dia_semana', public.assistant_weekday(c.date),
                          'culto', c.name,
                          'tom', coalesce(nullif(cs.key_override, ''), nullif(found.key_current, ''), found.key_original))
                   from public.culto_songs cs
                   join public.cultos c on c.id = cs.culto_id
                  where cs.song_id = found.id and c.team_id = p_team_id and c.date >= v_today
                  order by c.date limit 1)
             ) as item
        from found
       order by found.rank, found.title
       limit 5
    ) f;

  return jsonb_build_object('musicas', v_items);
end;
$$;

create or replace function public.assistant_tool_disponibilidade_equipe(p_team_id uuid, p_member_id uuid, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user       uuid := public.assistant_member_user(p_team_id, p_member_id);
  v_date       date := public.assistant_safe_date(p_args->>'data');
  v_mode       text;
  v_see_cultos boolean;
begin
  if v_user is null then
    return jsonb_build_object('erro', 'membro_invalido');
  elsif v_date is null then
    return jsonb_build_object('erro', 'data_invalida', 'detalhe', 'Use AAAA-MM-DD.');
  end if;
  select availability_mode into v_mode from public.teams where id = p_team_id;
  v_see_cultos := public.member_can(v_user, p_team_id, 'cultos', 'ver');

  return jsonb_build_object(
    'data', v_date,
    'dia_semana', public.assistant_weekday(v_date),
    'modo_da_equipe', v_mode,
    'disponiveis', case when v_mode <> 'unavailable_only' then coalesce((
      select jsonb_agg(jsonb_build_object('nome', p.full_name, 'funcoes', to_jsonb(ma.instruments)) order by p.full_name)
        from public.member_availability ma
        join public.team_members tm on tm.id = ma.team_member_id
        join public.profiles p on p.id = tm.profile_id
       where tm.team_id = p_team_id and ma.available_date = v_date and ma.status = 'available'
    ), '[]'::jsonb) end,
    'indisponiveis', case when v_mode <> 'available_only' then coalesce((
      select jsonb_agg(p.full_name order by p.full_name)
        from public.member_availability ma
        join public.team_members tm on tm.id = ma.team_member_id
        join public.profiles p on p.id = tm.profile_id
       where tm.team_id = p_team_id and ma.available_date = v_date and ma.status = 'unavailable'
    ), '[]'::jsonb) end,
    -- Sem resposta só existe quando a equipe pede confirmação de disponibilidade.
    'sem_resposta', case when v_mode <> 'unavailable_only' then coalesce((
      select jsonb_agg(p.full_name order by p.full_name)
        from public.team_members tm
        join public.profiles p on p.id = tm.profile_id
       where tm.team_id = p_team_id
         and not exists (
           select 1 from public.member_availability ma
            where ma.team_member_id = tm.id
              and ma.available_date = v_date
              and (v_mode = 'both' or ma.status = 'available'))
    ), '[]'::jsonb) end,
    -- Nomes de culto só para quem pode ver cultos no app.
    'cultos_no_dia', case when v_see_cultos then coalesce((
      select jsonb_agg(jsonb_build_object('culto_id', c.id, 'culto', c.name) order by c.name)
        from public.cultos c
       where c.team_id = p_team_id and c.date = v_date
    ), '[]'::jsonb) end
  );
end;
$$;

create or replace function public.assistant_tool_minha_disponibilidade(p_team_id uuid, p_member_id uuid, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assistant_member_user(p_team_id, p_member_id);
  v_from date := coalesce(public.assistant_safe_date(p_args->>'de'), public.assistant_today());
  v_to   date := public.assistant_safe_date(p_args->>'ate');
  v_mode text;
begin
  if v_user is null then
    return jsonb_build_object('erro', 'membro_invalido');
  end if;
  v_to := least(coalesce(v_to, v_from + 60), v_from + 120);
  select availability_mode into v_mode from public.teams where id = p_team_id;

  -- Sem o motivo: a resposta aparece para o grupo inteiro.
  return jsonb_build_object(
    'modo_da_equipe', v_mode,
    'de', v_from,
    'ate', v_to,
    'marcacoes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'data', ma.available_date,
               'dia_semana', public.assistant_weekday(ma.available_date),
               'status', case ma.status when 'available' then 'disponível' else 'indisponível' end)
               order by ma.available_date)
        from public.member_availability ma
       where ma.team_member_id = p_member_id
         and ma.available_date between v_from and v_to
         and (v_mode = 'both'
              or (v_mode = 'available_only' and ma.status = 'available')
              or (v_mode = 'unavailable_only' and ma.status = 'unavailable'))
    ), '[]'::jsonb)
  );
end;
$$;

-- Ação: confirmar ou recusar a PRÓPRIA escala num culto de hoje em diante.
create or replace function public.assistant_tool_responder_escala(p_team_id uuid, p_member_id uuid, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := public.assistant_member_user(p_team_id, p_member_id);
  v_id     uuid := public.assistant_safe_uuid(p_args->>'culto_id');
  v_answer text := lower(btrim(coalesce(p_args->>'resposta', '')));
  v_culto  public.cultos%rowtype;
  v_funcs  text[];
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'erro', 'membro_invalido');
  elsif not public.member_can(v_user, p_team_id, 'cultos', 'ver') then
    return jsonb_build_object('ok', false, 'erro', 'sem_permissao', 'detalhe', 'O acesso desta pessoa aos cultos está bloqueado na equipe.');
  elsif v_answer not in ('confirmar', 'recusar') then
    return jsonb_build_object('ok', false, 'erro', 'resposta_invalida', 'detalhe', 'Use "confirmar" ou "recusar".');
  end if;

  select * into v_culto from public.cultos where id = v_id and team_id = p_team_id;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'culto_nao_encontrado');
  elsif v_culto.date < public.assistant_today() then
    return jsonb_build_object('ok', false, 'erro', 'culto_passado');
  end if;

  with changed as (
    update public.culto_lineup
       set status = case v_answer when 'confirmar' then 'accepted'::public.lineup_status
                                  else 'declined'::public.lineup_status end
     where culto_id = v_culto.id and team_member_id = p_member_id
    returning instrument
  )
  select array_agg(instrument order by public.assistant_instrument_order(instrument)) into v_funcs from changed;

  if v_funcs is null then
    return jsonb_build_object('ok', false, 'erro', 'nao_escalado',
      'culto', v_culto.name, 'data', v_culto.date, 'dia_semana', public.assistant_weekday(v_culto.date));
  end if;

  return jsonb_build_object(
    'ok', true,
    'culto', v_culto.name,
    'data', v_culto.date,
    'dia_semana', public.assistant_weekday(v_culto.date),
    'funcoes', to_jsonb(v_funcs),
    'confirmacao', case v_answer when 'confirmar' then 'confirmado' else 'recusado' end
  );
end;
$$;

-- Ação: marcar (ou remover) a PRÓPRIA disponibilidade num dia, respeitando o
-- modo da equipe (teams.availability_mode), como o app faz.
create or replace function public.assistant_tool_marcar_disponibilidade(p_team_id uuid, p_member_id uuid, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := public.assistant_member_user(p_team_id, p_member_id);
  v_today  date := public.assistant_today();
  v_date   date := public.assistant_safe_date(p_args->>'data');
  v_kind   text := public.assistant_fold(btrim(coalesce(p_args->>'status', '')));
  v_reason text := left(nullif(btrim(coalesce(p_args->>'motivo', '')), ''), 200);
  v_mode   text;
  v_status text;
  v_rows   integer;
  v_cultos jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'erro', 'membro_invalido');
  elsif v_date is null or v_date < v_today or v_date > v_today + 400 then
    return jsonb_build_object('ok', false, 'erro', 'data_invalida', 'detalhe', 'Use uma data de hoje em diante (AAAA-MM-DD).');
  end if;
  select availability_mode into v_mode from public.teams where id = p_team_id;

  if v_kind = 'remover' then
    delete from public.member_availability
     where team_member_id = p_member_id and available_date = v_date;
    get diagnostics v_rows = row_count;
    return jsonb_build_object('ok', true, 'data', v_date, 'dia_semana', public.assistant_weekday(v_date),
      'removido', v_rows > 0);
  end if;

  v_status := case v_kind when 'disponivel' then 'available' when 'indisponivel' then 'unavailable' end;
  if v_status is null then
    return jsonb_build_object('ok', false, 'erro', 'status_invalido', 'detalhe', 'Use "disponivel", "indisponivel" ou "remover".');
  elsif not (v_mode = 'both'
             or (v_mode = 'available_only' and v_status = 'available')
             or (v_mode = 'unavailable_only' and v_status = 'unavailable')) then
    return jsonb_build_object('ok', false, 'erro', 'modo_da_equipe', 'modo_da_equipe', v_mode);
  end if;

  insert into public.member_availability as ma (team_member_id, available_date, status, instruments, reason)
  values (
    p_member_id, v_date, v_status,
    case when v_status = 'available'
         then coalesce((select instruments from public.team_members where id = p_member_id), '{}')
         else '{}' end,
    case when v_status = 'unavailable' then v_reason end
  )
  on conflict (team_member_id, available_date) do update
    set status = excluded.status, instruments = excluded.instruments, reason = excluded.reason;

  -- Indisponível num dia em que já está escalado: o assistente oferece recusar a escala.
  if v_status = 'unavailable' and public.member_can(v_user, p_team_id, 'cultos', 'ver') then
    select jsonb_agg(jsonb_build_object('culto_id', c.id, 'culto', c.name) order by c.name) into v_cultos
      from public.cultos c
     where c.team_id = p_team_id and c.date = v_date
       and exists (select 1 from public.culto_lineup l
                    where l.culto_id = c.id and l.team_member_id = p_member_id and l.status <> 'declined');
  end if;

  return jsonb_build_object(
    'ok', true,
    'data', v_date,
    'dia_semana', public.assistant_weekday(v_date),
    'status', case v_status when 'available' then 'disponível' else 'indisponível' end,
    'escalado_neste_dia', coalesce(v_cultos, '[]'::jsonb)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 5) RPCs do app
-- ----------------------------------------------------------------------------

-- Ajustes > Equipe > Assistente (só líder).
create or replace function public.assistant_team_overview(p_team_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.has_team_role(auth.uid(), p_team_id, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'platform_enabled', c.enabled,
    'team_enabled', coalesce(s.enabled, true),
    'assistant_name', c.assistant_name,
    'bot_phone', c.bot_phone,
    'instructions', coalesce(s.instructions, ''),
    'instructions_max', 2000,
    'usage', jsonb_build_object(
      'today', coalesce(u.requests, 0),
      'team_limit', case when coalesce(s.unlimited, false) then null
                         else coalesce(s.team_daily_limit, c.team_daily_limit) end,
      'member_limit', case when coalesce(s.unlimited, false) then null
                           else coalesce(s.member_daily_limit, c.member_daily_limit) end
    ),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id,
               'name', g.group_name,
               'activated_at', g.activated_at,
               'activated_by', p.full_name)
               order by g.activated_at desc)
        from public.assistant_groups g
        left join public.profiles p on p.id = g.activated_by
       where g.team_id = p_team_id and g.active
    ), '[]'::jsonb),
    'pending_code', (
      select jsonb_build_object('code', a.code, 'expires_at', a.expires_at)
        from public.assistant_activation_codes a
       where a.team_id = p_team_id and a.used_at is null and a.expires_at > now()
       order by a.created_at desc
       limit 1)
  ) into v_result
  from public.assistant_config c
  left join public.assistant_team_settings s on s.team_id = p_team_id
  left join public.assistant_usage_daily u on u.team_id = p_team_id and u.day = public.assistant_today()
  where c.id;

  return v_result;
end;
$$;

create or replace function public.assistant_create_activation_code(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code    text;
  v_expires timestamptz := now() + interval '24 hours';
begin
  if not public.has_team_role(auth.uid(), p_team_id, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Um código válido por equipe: gerar outro invalida o anterior.
  delete from public.assistant_activation_codes where team_id = p_team_id and used_at is null;
  v_code := public.assistant_new_code('assistant_activation_codes');
  insert into public.assistant_activation_codes (code, team_id, created_by, expires_at)
  values (v_code, p_team_id, (select id from public.profiles where user_id = auth.uid() limit 1), v_expires);

  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end;
$$;

create or replace function public.assistant_deactivate_group(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.assistant_groups where id = p_group_id;
  if v_team is null or not public.has_team_role(auth.uid(), v_team, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.assistant_groups
     set active = false,
         deactivated_at = now(),
         deactivated_by = (select id from public.profiles where user_id = auth.uid() limit 1)
   where id = p_group_id and active;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.assistant_update_instructions(p_team_id uuid, p_instructions text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text := nullif(btrim(coalesce(p_instructions, '')), '');
begin
  if not public.has_team_role(auth.uid(), p_team_id, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  elsif char_length(v_text) > 2000 then
    raise exception 'instructions_too_long' using errcode = '22001';
  end if;

  insert into public.assistant_team_settings as s (team_id, instructions, instructions_updated_by, updated_at)
  values (p_team_id, v_text, (select id from public.profiles where user_id = auth.uid() limit 1), now())
  on conflict (team_id) do update
    set instructions = excluded.instructions,
        instructions_updated_by = excluded.instructions_updated_by,
        updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

-- Ajustes > Meu usuário: o assistente me reconhece?
create or replace function public.assistant_my_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'enabled', c.enabled,
    'assistant_name', c.assistant_name,
    'bot_phone', c.bot_phone,
    'has_phone', coalesce(length(public.assistant_phone_digits(p.phone)) >= 10, false),
    'linked', exists (select 1 from public.assistant_wa_identities i where i.profile_id = p.id)
  )
  from public.assistant_config c
  left join public.profiles p on p.user_id = auth.uid()
  where c.id
$$;

-- Plano B quando o WhatsApp esconde o número: "vincular CÓDIGO" no privado do assistente.
create or replace function public.assistant_create_link_code()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := (select id from public.profiles where user_id = auth.uid() limit 1);
  v_code    text;
  v_expires timestamptz := now() + interval '1 hour';
begin
  if v_profile is null then
    raise exception 'no_profile' using errcode = '42501';
  end if;
  delete from public.assistant_link_codes where profile_id = v_profile and used_at is null;
  v_code := public.assistant_new_code('assistant_link_codes');
  insert into public.assistant_link_codes (code, profile_id, expires_at) values (v_code, v_profile, v_expires);
  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end;
$$;

-- Desfaz os vínculos do WhatsApp da pessoa (ex.: alguém usou o código dela).
-- Depois disso ela volta a ser reconhecida só pelo telefone do cadastro.
create or replace function public.assistant_unlink_me()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := (select id from public.profiles where user_id = auth.uid() limit 1);
  v_rows    integer;
begin
  if v_profile is null then
    raise exception 'no_profile' using errcode = '42501';
  end if;
  delete from public.assistant_wa_identities where profile_id = v_profile;
  get diagnostics v_rows = row_count;
  delete from public.assistant_link_codes where profile_id = v_profile and used_at is null;
  return jsonb_build_object('ok', true, 'removed', v_rows);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6) Permissões
-- ----------------------------------------------------------------------------

-- Tudo que começa com assistant_ sai de anon/authenticated (os default
-- privileges do Supabase dão EXECUTE a todos) e fica só com a service_role...
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'assistant\_%'
  loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f.sig);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f.sig);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;

-- ...menos as RPCs do app, que checam o papel de quem chama.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.assistant_team_overview(uuid) to authenticated;
    grant execute on function public.assistant_create_activation_code(uuid) to authenticated;
    grant execute on function public.assistant_deactivate_group(uuid) to authenticated;
    grant execute on function public.assistant_update_instructions(uuid, text) to authenticated;
    grant execute on function public.assistant_my_status() to authenticated;
    grant execute on function public.assistant_create_link_code() to authenticated;
    grant execute on function public.assistant_unlink_me() to authenticated;
  end if;
end $$;

notify pgrst, 'reload schema';
