-- ============================================================================
-- Asafe: aviso de IA de terceiros (OpenAI, Estados Unidos) e consentimento
--
-- App Store 5.1.2(i): mostrar com clareza que dados pessoais vão para uma IA de
-- terceiros e pedir permissão explícita antes. LGPD: o consentimento também
-- cobre a transferência internacional (OpenAI nos EUA).
--
-- Dois consentimentos, sempre com a versão do texto mostrado no app:
--   team_activation ... um líder aceita o aviso antes de gerar o código de
--                        ativação (vale para a equipe; o grupo só ativa com ele);
--   member_link ....... a pessoa permite que o assistente use os dados dela
--                        (reconhecer pelo telefone/WhatsApp, marcar, listar);
--                        também exigido antes de vincular o WhatsApp por código.
--
-- Por pessoa vale o opt-in: sem member_link o assistente não reconhece ninguém.
-- A única exceção é a tolerância de quem já usava: quem estava numa equipe com
-- o Asafe ativo quando esta migração rodou (assistant_ai_legacy_members, foto
-- única) ou aceitou um texto anterior continua reconhecido até decidir no app.
-- Quem desliga (profiles.assistant_ai_opt_out) é tratado como desconhecido, não
-- é marcado nos avisos e some das listas de disponibilidade que vão para a IA.
-- O nome continua nas escalas e no roteiro, que é o que a equipe já vê no app.
--
-- Equipes que já usavam o Asafe (grupos ativos sem consentimento da versão
-- atual) ficam "pendentes": o assistente continua funcionando e os líderes
-- recebem no app um aviso que só sai com "concordo" ou "desativar". Para
-- encerrar as tolerâncias, preencha assistant_config.ai_consent_required_from:
-- a partir dessa data as equipes pendentes ficam "bloqueadas" (o assistente não
-- chama a IA e pede a confirmação no app) e quem ainda não permitiu deixa de ser
-- reconhecido.
--
-- As RPCs alteradas abaixo são cópias fiéis das definições mais recentes
-- (20260928120000_whatsapp_assistant.sql e, para assistant_notice_mentions,
-- 20260929120000_assistant_notifications.sql), mudando só o necessário.
--
-- Idempotente: seguro rodar mais de uma vez. Os ALTER TABLE pedem um lock
-- exclusivo rápido em profiles e assistant_config: com lock_timeout, se alguma
-- transação longa (backup, relatório) segurar a tabela, a migração desiste em
-- 3 s em vez de enfileirar todo o app atrás dela. Deu timeout? Rode de novo.
-- ============================================================================

set lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1) Versão do texto, tabela de consentimentos e opção por pessoa
-- ----------------------------------------------------------------------------

-- Igual a ASSISTANT_AI_CONSENT_VERSION (src/lib/assistantAiConsent.ts). Mudou o
-- texto do aviso? Nova migração com a nova data: quem aceitou a anterior volta
-- a ver o aviso (equipes ativas ficam pendentes, sem parar).
create or replace function public.assistant_ai_consent_version()
returns text
language sql
immutable
as $$
  select '2026-10-03'::text
$$;

create table if not exists public.assistant_ai_consents (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid references public.teams(id) on delete cascade,
  -- Conta excluída: o registro da equipe continua valendo, sem dado pessoal.
  profile_id   uuid references public.profiles(id) on delete set null,
  scope        text not null check (scope in ('team_activation', 'member_link')),
  text_version text not null check (char_length(text_version) between 1 and 40),
  accepted_at  timestamptz not null default now(),
  -- Revogado pela pessoa/líder ou substituído por uma versão nova do texto.
  revoked_at   timestamptz,
  check ((scope = 'team_activation') = (team_id is not null)),
  check (revoked_at is null or revoked_at >= accepted_at)
);
-- No máximo um consentimento ativo por equipe e por pessoa.
create unique index if not exists assistant_ai_consents_team_active_idx
  on public.assistant_ai_consents(team_id) where scope = 'team_activation' and revoked_at is null;
create unique index if not exists assistant_ai_consents_member_active_idx
  on public.assistant_ai_consents(profile_id) where scope = 'member_link' and revoked_at is null;
create index if not exists assistant_ai_consents_profile_id_idx on public.assistant_ai_consents(profile_id);

alter table public.assistant_ai_consents enable row level security;
revoke all on public.assistant_ai_consents from public, anon, authenticated;
-- Só leitura no app; gravação apenas pelas RPCs (security definer) abaixo.
grant select on public.assistant_ai_consents to authenticated;
grant all on public.assistant_ai_consents to service_role;

drop policy if exists "assistant_ai_consents_select_own" on public.assistant_ai_consents;
create policy "assistant_ai_consents_select_own" on public.assistant_ai_consents
  for select to authenticated
  using (profile_id = public.get_my_profile_id());

drop policy if exists "assistant_ai_consents_select_team_admin" on public.assistant_ai_consents;
create policy "assistant_ai_consents_select_team_admin" on public.assistant_ai_consents
  for select to authenticated
  using (team_id is not null and public.has_team_role(auth.uid(), team_id, 'admin'));

-- "Permitir que o Asafe use meus dados" desligado.
alter table public.profiles add column if not exists assistant_ai_opt_out boolean not null default false;

-- Alavancas da plataforma (sem tela por enquanto; mudar direto no banco):
--   ai_consent_required_from ... fim das tolerâncias (null = sem prazo): equipes
--                                ativas sem consentimento param de usar a IA e
--                                quem já usava e não permitiu deixa de ser reconhecido;
--   ai_member_consent_required . true = acaba já a tolerância de quem já usava
--                                (só reconhece quem permitiu no app).
alter table public.assistant_config add column if not exists ai_consent_required_from timestamptz;
alter table public.assistant_config add column if not exists ai_member_consent_required boolean not null default false;

-- Tolerância de quem já usava: membros das equipes com grupo ativo no momento
-- em que esta migração rodou pela primeira vez. A foto é tirada uma única vez
-- (rodar de novo não acrescenta ninguém); quem entra numa equipe depois precisa
-- permitir no app. Sai daqui ao decidir (permitir ou não) ou quando um líder
-- desativa o Asafe da equipe pelo app.
do $$
begin
  if to_regclass('public.assistant_ai_legacy_members') is null then
    create table public.assistant_ai_legacy_members (
      team_id     uuid not null references public.teams(id) on delete cascade,
      profile_id  uuid not null references public.profiles(id) on delete cascade,
      captured_at timestamptz not null default now(),
      primary key (team_id, profile_id)
    );
    insert into public.assistant_ai_legacy_members (team_id, profile_id)
    select distinct tm.team_id, tm.profile_id
      from public.team_members tm
     where exists (select 1 from public.assistant_groups g where g.team_id = tm.team_id and g.active);
  end if;
end $$;
create index if not exists assistant_ai_legacy_members_profile_id_idx on public.assistant_ai_legacy_members(profile_id);
alter table public.assistant_ai_legacy_members enable row level security;
revoke all on public.assistant_ai_legacy_members from public, anon, authenticated;
grant all on public.assistant_ai_legacy_members to service_role;

-- ----------------------------------------------------------------------------
-- 2) Estado do consentimento
-- ----------------------------------------------------------------------------

create or replace function public.assistant_team_consent_valid(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.assistant_ai_consents c
     where c.team_id = p_team_id
       and c.scope = 'team_activation'
       and c.revoked_at is null
       and c.text_version = public.assistant_ai_consent_version())
$$;

-- granted ... consentimento da versão atual;
-- pending ... grupo ativo sem ele (equipe que já usava o Asafe, ou texto novo);
-- blocked ... pending depois de assistant_config.ai_consent_required_from;
-- none ...... sem grupo ativo e sem consentimento.
create or replace function public.assistant_team_consent_state(p_team_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.assistant_team_consent_valid(p_team_id) then 'granted'
    when exists (select 1 from public.assistant_groups g where g.team_id = p_team_id and g.active) then
      case when (select c.ai_consent_required_from from public.assistant_config c where c.id) <= now()
           then 'blocked' else 'pending' end
    else 'none'
  end
$$;

create or replace function public.assistant_member_consent_valid(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.assistant_ai_consents c
     where c.profile_id = p_profile_id
       and c.scope = 'member_link'
       and c.revoked_at is null
       and c.text_version = public.assistant_ai_consent_version())
$$;

-- O assistente pode usar os dados desta pessoa nesta equipe (reconhecer, marcar,
-- listar)? Sim com o aceite da versão atual. Sem ele, só na tolerância de quem já
-- usava: estava na equipe quando o aviso chegou (assistant_ai_legacy_members) ou
-- aceitou um texto anterior e não revogou; vale até ai_consent_required_from e
-- some com ai_member_consent_required. Quem desligou: nunca.
-- p_team_id null = em alguma equipe (Ajustes > Meu usuário).
create or replace function public.assistant_member_ai_allowed(p_team_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select not p.assistant_ai_opt_out
           and (public.assistant_member_consent_valid(p.id)
                or (not coalesce(c.ai_member_consent_required, false)
                    and (c.ai_consent_required_from is null or c.ai_consent_required_from > now())
                    and (exists (select 1 from public.assistant_ai_legacy_members l
                                  where l.profile_id = p.id and (p_team_id is null or l.team_id = p_team_id))
                         or exists (select 1 from public.assistant_ai_consents x
                                     where x.profile_id = p.id and x.scope = 'member_link' and x.revoked_at is null))))
      from public.profiles p
      left join public.assistant_config c on c.id
     where p.id = p_profile_id), false)
$$;

-- Em alguma equipe (sem equipe definida: Ajustes > Meu usuário, outra equipe).
create or replace function public.assistant_profile_ai_allowed(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.assistant_member_ai_allowed(null, p_profile_id)
$$;

-- Autor de uma mensagem citada ao chamar o assistente: o texto só vai para a IA
-- se for exatamente um membro desta equipe que permite o uso dos dados. Mesma
-- busca do assistant_resolve_sender (vínculo nesta equipe, senão telefone do
-- cadastro), mas sem gravar nada.
create or replace function public.assistant_quote_author_allowed(p_team_id uuid, p_wa_ids text[])
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ids        text[] := array(select distinct x from unnest(coalesce(p_wa_ids, '{}'::text[])) x where coalesce(x, '') <> '');
  v_phones     text[];
  v_candidates uuid[];
begin
  v_phones := array(select split_part(x, '@', 1) from unnest(v_ids) x where x like '%@s.whatsapp.net');
  select array_agg(distinct i.profile_id) into v_candidates
    from public.assistant_wa_identities i
    join public.team_members tm on tm.profile_id = i.profile_id and tm.team_id = p_team_id
   where i.wa_id = any(v_ids);
  if coalesce(cardinality(v_candidates), 0) = 0 and cardinality(v_phones) > 0 then
    select array_agg(distinct tm.profile_id) into v_candidates
      from public.team_members tm
      join public.profiles p on p.id = tm.profile_id
     where tm.team_id = p_team_id
       and exists (select 1 from unnest(v_phones) ph where public.assistant_phone_matches(p.phone, ph));
  end if;
  return coalesce(cardinality(v_candidates), 0) = 1
     and public.assistant_member_ai_allowed(p_team_id, v_candidates[1]);
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) RPCs do app: dar e revogar o consentimento
-- ----------------------------------------------------------------------------

-- p_version = versão do texto que a pessoa leu (ASSISTANT_AI_CONSENT_VERSION).
-- App desatualizado (texto antigo) não registra consentimento.
create or replace function public.give_assistant_consent(p_scope text, p_team_id uuid default null, p_version text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := (select id from public.profiles where user_id = auth.uid() limit 1);
  v_version text := public.assistant_ai_consent_version();
begin
  if v_profile is null then
    raise exception 'no_profile' using errcode = '42501';
  elsif p_scope is null or p_scope not in ('team_activation', 'member_link') then
    raise exception 'invalid_scope' using errcode = '22023';
  elsif p_version is distinct from v_version then
    raise exception 'outdated_version' using errcode = '22023', hint = 'Atualize o app para ler o aviso atual.';
  end if;

  if p_scope = 'team_activation' then
    if p_team_id is null or not public.has_team_role(auth.uid(), p_team_id, 'admin') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    -- Aceite de um texto anterior deixa de valer (fica no histórico).
    update public.assistant_ai_consents
       set revoked_at = now()
     where team_id = p_team_id and scope = 'team_activation' and revoked_at is null and text_version <> v_version;
    insert into public.assistant_ai_consents (team_id, profile_id, scope, text_version)
    values (p_team_id, v_profile, 'team_activation', v_version)
    on conflict do nothing;
    return jsonb_build_object('ok', true, 'scope', p_scope, 'team_id', p_team_id,
      'state', public.assistant_team_consent_state(p_team_id), 'version', v_version);
  end if;

  if p_team_id is not null then
    raise exception 'invalid_scope' using errcode = '22023';
  end if;
  update public.assistant_ai_consents
     set revoked_at = now()
   where profile_id = v_profile and scope = 'member_link' and revoked_at is null and text_version <> v_version;
  insert into public.assistant_ai_consents (profile_id, scope, text_version)
  values (v_profile, 'member_link', v_version)
  on conflict do nothing;
  update public.profiles set assistant_ai_opt_out = false where id = v_profile and assistant_ai_opt_out;
  -- Decidiu: a tolerância de quem já usava deixa de importar.
  delete from public.assistant_ai_legacy_members where profile_id = v_profile;
  return jsonb_build_object('ok', true, 'scope', p_scope, 'state', 'granted', 'version', v_version);
end;
$$;

-- team_activation: o líder recusa/revoga pela equipe. O Asafe é desligado em
-- todos os grupos (missões pausam e a fila de avisos para sozinhas) e acaba a
-- tolerância dos membros: se a equipe voltar, cada um permite no app.
-- member_link: a pessoa desliga o uso dos próprios dados. Some o vínculo do
-- WhatsApp e o histórico de conversa dela com o assistente.
create or replace function public.revoke_assistant_consent(p_scope text, p_team_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := (select id from public.profiles where user_id = auth.uid() limit 1);
  v_groups  integer;
  v_links   integer;
begin
  if v_profile is null then
    raise exception 'no_profile' using errcode = '42501';
  elsif p_scope is null or p_scope not in ('team_activation', 'member_link') then
    raise exception 'invalid_scope' using errcode = '22023';
  end if;

  if p_scope = 'team_activation' then
    if p_team_id is null or not public.has_team_role(auth.uid(), p_team_id, 'admin') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    update public.assistant_ai_consents
       set revoked_at = now()
     where team_id = p_team_id and scope = 'team_activation' and revoked_at is null;
    update public.assistant_groups
       set active = false, deactivated_at = now(), deactivated_by = v_profile
     where team_id = p_team_id and active;
    get diagnostics v_groups = row_count;
    delete from public.assistant_activation_codes where team_id = p_team_id and used_at is null;
    delete from public.assistant_ai_legacy_members where team_id = p_team_id;
    return jsonb_build_object('ok', true, 'scope', p_scope, 'team_id', p_team_id,
      'groups_deactivated', v_groups, 'state', public.assistant_team_consent_state(p_team_id));
  end if;

  if p_team_id is not null then
    raise exception 'invalid_scope' using errcode = '22023';
  end if;
  update public.assistant_ai_consents
     set revoked_at = now()
   where profile_id = v_profile and scope = 'member_link' and revoked_at is null;
  update public.profiles set assistant_ai_opt_out = true where id = v_profile;
  delete from public.assistant_ai_legacy_members where profile_id = v_profile;
  delete from public.assistant_wa_identities where profile_id = v_profile;
  get diagnostics v_links = row_count;
  delete from public.assistant_link_codes where profile_id = v_profile and used_at is null;
  delete from public.assistant_messages where profile_id = v_profile;
  return jsonb_build_object('ok', true, 'scope', p_scope, 'state', 'opted_out', 'removed', v_links);
end;
$$;

-- Ao abrir o app: equipes em que sou líder com o Asafe ativo sem o aceite da
-- versão atual (aviso que só sai com uma decisão) e se devo ver o aviso de membro
-- (member_legacy: ainda sou reconhecido pela tolerância, até grace_until).
create or replace function public.assistant_consent_prompts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id, assistant_ai_opt_out from public.profiles where user_id = auth.uid() limit 1
  )
  select jsonb_build_object(
    'version', public.assistant_ai_consent_version(),
    'assistant_name', c.assistant_name,
    'teams', case when c.enabled then coalesce((
      select jsonb_agg(jsonb_build_object(
               'team_id', t.id,
               'team_name', t.name,
               'state', s.state,
               'groups', (select count(*) from public.assistant_groups g where g.team_id = t.id and g.active))
               order by t.name, t.id)
        from public.team_members tm
        join public.teams t on t.id = tm.team_id
        cross join lateral (select public.assistant_team_consent_state(t.id) as state) s
       where tm.profile_id = me.id and tm.role = 'admin' and s.state in ('pending', 'blocked')
    ), '[]'::jsonb) else '[]'::jsonb end,
    'member_notice', coalesce(c.enabled and me.id is not null
      and not me.assistant_ai_opt_out
      and not public.assistant_member_consent_valid(me.id)
      and (exists (select 1 from public.assistant_wa_identities i where i.profile_id = me.id)
           or exists (select 1 from public.team_members tm
                        join public.assistant_groups g on g.team_id = tm.team_id and g.active
                       where tm.profile_id = me.id)), false),
    'member_legacy', coalesce(public.assistant_profile_ai_allowed(me.id)
      and not public.assistant_member_consent_valid(me.id), false),
    'grace_until', case when public.assistant_profile_ai_allowed(me.id)
                         and not public.assistant_member_consent_valid(me.id)
                        then c.ai_consent_required_from end
  )
  from public.assistant_config c
  left join me on true
  where c.id
$$;

-- ----------------------------------------------------------------------------
-- 4) RPCs existentes, agora exigindo/respeitando o consentimento
-- ----------------------------------------------------------------------------

-- [20260928] + ai_consent (o handler não chama a IA quando está 'blocked').
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
    'availability_mode', t.availability_mode,
    'ai_consent', public.assistant_team_consent_state(g.team_id)
  )
  from public.assistant_groups g
  join public.teams t on t.id = g.team_id
  left join public.assistant_team_settings s on s.team_id = g.team_id
  where g.group_jid = p_group_jid
$$;

-- [20260928] + o código só ativa se a equipe ainda tiver o consentimento.
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
  elsif not public.assistant_team_consent_valid(v_code.team_id) then
    -- O líder aceitou o aviso ao gerar o código; se revogou depois, não ativa.
    return jsonb_build_object('ok', false, 'error', 'consent_required');
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

-- [20260928] + só reconhece quem permite o uso dos dados nesta equipe
-- (assistant_member_ai_allowed): quem não permitiu ou desligou vira desconhecido.
-- A checagem de "mais de um perfil com o mesmo número" vem antes: nunca troca
-- uma pessoa por outra que divide o telefone.
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
     and public.assistant_member_ai_allowed(p_team_id, i.profile_id)
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
      if exists (select 1 from public.assistant_wa_identities i
                  where i.wa_id = any(v_ids) and public.assistant_profile_ai_allowed(i.profile_id)
                    and not exists (select 1 from public.team_members tm
                                     where tm.team_id = p_team_id and tm.profile_id = i.profile_id)) then
        return jsonb_build_object('ok', false, 'error', 'not_member');
      end if;
      return jsonb_build_object('ok', false,
        'error', case when cardinality(v_phones) = 0 then 'no_phone' else 'unknown' end);
    elsif cardinality(v_candidates) > 1 then
      return jsonb_build_object('ok', false, 'error', 'ambiguous');
    elsif not public.assistant_member_ai_allowed(p_team_id, v_candidates[1]) then
      -- Não permitiu (ou desligou) "Permitir que o Asafe use meus dados": desconhecido.
      return jsonb_build_object('ok', false, 'error', 'unknown');
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

-- [20260928] + o vínculo exige o consentimento atual da dona do código.
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
  elsif not public.assistant_member_consent_valid(v_code.profile_id)
        or exists (select 1 from public.profiles where id = v_code.profile_id and assistant_ai_opt_out) then
    -- Código gerado antes do aviso (ou a pessoa desligou depois): não vincula e não vale mais.
    update public.assistant_link_codes set used_at = now() where code = v_code.code;
    return jsonb_build_object('ok', false, 'error', 'consent_required');
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

-- [20260928] + quem não permite o uso dos dados fica fora das listas (só a contagem).
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
  v_hidden     integer;
  v_result     jsonb;
begin
  if v_user is null then
    return jsonb_build_object('erro', 'membro_invalido');
  elsif v_date is null then
    return jsonb_build_object('erro', 'data_invalida', 'detalhe', 'Use AAAA-MM-DD.');
  end if;
  select availability_mode into v_mode from public.teams where id = p_team_id;
  v_see_cultos := public.member_can(v_user, p_team_id, 'cultos', 'ver');

  v_result := jsonb_build_object(
    'data', v_date,
    'dia_semana', public.assistant_weekday(v_date),
    'modo_da_equipe', v_mode,
    'disponiveis', case when v_mode <> 'unavailable_only' then coalesce((
      select jsonb_agg(jsonb_build_object('nome', p.full_name, 'funcoes', to_jsonb(ma.instruments)) order by p.full_name)
        from public.member_availability ma
        join public.team_members tm on tm.id = ma.team_member_id
        join public.profiles p on p.id = tm.profile_id
       where tm.team_id = p_team_id and ma.available_date = v_date and ma.status = 'available'
         and public.assistant_member_ai_allowed(p_team_id, p.id)
    ), '[]'::jsonb) end,
    'indisponiveis', case when v_mode <> 'available_only' then coalesce((
      select jsonb_agg(p.full_name order by p.full_name)
        from public.member_availability ma
        join public.team_members tm on tm.id = ma.team_member_id
        join public.profiles p on p.id = tm.profile_id
       where tm.team_id = p_team_id and ma.available_date = v_date and ma.status = 'unavailable'
         and public.assistant_member_ai_allowed(p_team_id, p.id)
    ), '[]'::jsonb) end,
    -- Sem resposta só existe quando a equipe pede confirmação de disponibilidade.
    'sem_resposta', case when v_mode <> 'unavailable_only' then coalesce((
      select jsonb_agg(p.full_name order by p.full_name)
        from public.team_members tm
        join public.profiles p on p.id = tm.profile_id
       where tm.team_id = p_team_id
         and public.assistant_member_ai_allowed(p_team_id, p.id)
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

  select count(*) into v_hidden
    from public.team_members tm
   where tm.team_id = p_team_id and not public.assistant_member_ai_allowed(p_team_id, tm.profile_id);
  if v_hidden > 0 then
    v_result := v_result || jsonb_build_object(
      'nao_compartilham', v_hidden,
      'aviso', 'Algumas pessoas da equipe não compartilham dados com o assistente e não aparecem nestas listas. Para a lista completa, veja no app.');
  end if;
  return v_result;
end;
$$;

-- [20260929] + não marca (@) quem não permite o uso dos dados: o nome sai em texto.
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
    if cardinality(v_candidates) = 1 and v_candidates[1] = any(p_profile_ids)
      and public.assistant_member_ai_allowed(p_team_id, v_candidates[1]) then
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

-- [20260928] + estado do consentimento da equipe (Ajustes > Equipe).
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
       limit 1),
    'ai_consent', jsonb_build_object(
      'state', public.assistant_team_consent_state(p_team_id),
      'current_version', public.assistant_ai_consent_version(),
      'version', ac.text_version,
      'accepted_at', ac.accepted_at,
      'accepted_by', ap.full_name)
  ) into v_result
  from public.assistant_config c
  left join public.assistant_team_settings s on s.team_id = p_team_id
  left join public.assistant_usage_daily u on u.team_id = p_team_id and u.day = public.assistant_today()
  left join lateral (
    select x.text_version, x.accepted_at, x.profile_id
      from public.assistant_ai_consents x
     where x.team_id = p_team_id and x.scope = 'team_activation' and x.revoked_at is null
     order by x.accepted_at desc
     limit 1
  ) ac on true
  left join public.profiles ap on ap.id = ac.profile_id
  where c.id;

  return v_result;
end;
$$;

-- [20260928] + só gera código com o aviso aceito na versão atual.
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
  elsif not public.assistant_team_consent_valid(p_team_id) then
    raise exception 'consent_required' using errcode = 'P0001', hint = 'Aceite o aviso de IA antes de ativar.';
  end if;

  -- Um código válido por equipe: gerar outro invalida o anterior.
  delete from public.assistant_activation_codes where team_id = p_team_id and used_at is null;
  v_code := public.assistant_new_code('assistant_activation_codes');
  insert into public.assistant_activation_codes (code, team_id, created_by, expires_at)
  values (v_code, p_team_id, (select id from public.profiles where user_id = auth.uid() limit 1), v_expires);

  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end;
$$;

-- [20260928] + estado do consentimento da pessoa (Ajustes > Meu usuário).
-- legacy = reconhecida hoje só pela tolerância de quem já usava (até grace_until).
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
    'linked', exists (select 1 from public.assistant_wa_identities i where i.profile_id = p.id),
    'ai_consent', jsonb_build_object(
      'state', case when coalesce(p.assistant_ai_opt_out, false) then 'opted_out'
                    when public.assistant_member_consent_valid(p.id) then 'granted'
                    else 'pending' end,
      'allowed', public.assistant_profile_ai_allowed(p.id),
      'legacy', l.legacy,
      'grace_until', case when l.legacy then c.ai_consent_required_from end,
      'accepted_at', (select max(x.accepted_at) from public.assistant_ai_consents x
                       where x.profile_id = p.id and x.scope = 'member_link' and x.revoked_at is null),
      'current_version', public.assistant_ai_consent_version())
  )
  from public.assistant_config c
  left join public.profiles p on p.user_id = auth.uid()
  cross join lateral (
    select coalesce(public.assistant_profile_ai_allowed(p.id)
                    and not public.assistant_member_consent_valid(p.id), false) as legacy
  ) l
  where c.id
$$;

-- [20260928] + vincular por código exige o aceite do aviso de membro.
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
  elsif not public.assistant_member_consent_valid(v_profile) then
    raise exception 'consent_required' using errcode = 'P0001', hint = 'Aceite o aviso de IA antes de vincular.';
  end if;
  delete from public.assistant_link_codes where profile_id = v_profile and used_at is null;
  v_code := public.assistant_new_code('assistant_link_codes');
  insert into public.assistant_link_codes (code, profile_id, expires_at) values (v_code, v_profile, v_expires);
  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5) Permissões
-- ----------------------------------------------------------------------------

-- Novas e alteradas: nada para anon/authenticated (os default privileges do
-- Supabase dão EXECUTE a todos), tudo para a service_role...
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'assistant_ai_consent_version', 'assistant_team_consent_valid', 'assistant_team_consent_state',
         'assistant_member_consent_valid', 'assistant_member_ai_allowed', 'assistant_profile_ai_allowed',
         'assistant_quote_author_allowed', 'give_assistant_consent', 'revoke_assistant_consent', 'assistant_consent_prompts',
         'assistant_group_context', 'assistant_activate_group', 'assistant_resolve_sender',
         'assistant_link_identity', 'assistant_tool_disponibilidade_equipe', 'assistant_notice_mentions',
         'assistant_team_overview', 'assistant_create_activation_code', 'assistant_my_status',
         'assistant_create_link_code')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ...menos as RPCs do app, que checam quem chama.
grant execute on function public.give_assistant_consent(text, uuid, text) to authenticated;
grant execute on function public.revoke_assistant_consent(text, uuid) to authenticated;
grant execute on function public.assistant_consent_prompts() to authenticated;
grant execute on function public.assistant_team_overview(uuid) to authenticated;
grant execute on function public.assistant_create_activation_code(uuid) to authenticated;
grant execute on function public.assistant_my_status() to authenticated;
grant execute on function public.assistant_create_link_code() to authenticated;

reset lock_timeout;

notify pgrst, 'reload schema';
