-- ============================================================================
-- Convite por CÓDIGO da equipe + fila de aprovação pelo líder  (+Louvor)
--
-- Novo fluxo:
--   1. A pessoa se cadastra sozinha (e-mail/senha OU Google).
--   2. Entra com o CÓDIGO da equipe -> cria uma SOLICITAÇÃO pendente.
--   3. O líder aprova em Membros -> só então vira team_members (membro ativo).
--
-- Mantém team_members == "membro ativo" (não mexe nas RLS já existentes que
-- dependem disso). A fila de pendentes mora numa tabela separada.
-- Também atualiza handle_new_user para capturar nome/avatar vindos do Google.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Código de convite por equipe
-- ----------------------------------------------------------------------------

-- Gerador de código curto e legível (sem 0/O/1/I pra não confundir ao digitar).
create or replace function public.gen_team_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result   text := '';
  i        int;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

alter table public.teams
  add column if not exists join_code text unique;

-- Atribui um código único a cada equipe nova (com retry em caso de colisão).
create or replace function public.assign_team_code()
returns trigger
language plpgsql
as $$
declare
  code  text;
  tries int := 0;
begin
  if new.join_code is not null then
    return new;
  end if;
  loop
    code := public.gen_team_code();
    if not exists (select 1 from public.teams where join_code = code) then
      new.join_code := code;
      return new;
    end if;
    tries := tries + 1;
    if tries > 20 then
      new.join_code := code || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
      return new;
    end if;
  end loop;
end;
$$;

drop trigger if exists before_team_insert_assign_code on public.teams;
create trigger before_team_insert_assign_code
  before insert on public.teams
  for each row execute function public.assign_team_code();

-- Backfill: gera código pras equipes que já existem.
do $$
declare
  t    record;
  code text;
begin
  for t in select id from public.teams where join_code is null loop
    loop
      code := public.gen_team_code();
      begin
        update public.teams set join_code = code where id = t.id;
        exit;
      exception when unique_violation then
        -- colidiu, tenta de novo
      end;
    end loop;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Fila de solicitações de entrada (pendente -> aprovada/rejeitada)
-- ----------------------------------------------------------------------------
create table if not exists public.team_join_requests (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references public.profiles(id),
  unique (team_id, profile_id)
);

alter table public.team_join_requests enable row level security;

-- O solicitante vê as próprias solicitações (pra mostrar "aguardando aprovação").
drop policy if exists "Requester sees own join requests" on public.team_join_requests;
create policy "Requester sees own join requests"
  on public.team_join_requests for select to authenticated
  using (profile_id = (select id from public.profiles where user_id = auth.uid() limit 1));

-- Quem gerencia membros vê as solicitações da equipe.
drop policy if exists "Managers see team join requests" on public.team_join_requests;
create policy "Managers see team join requests"
  on public.team_join_requests for select to authenticated
  using (public.member_can(auth.uid(), team_id, 'membros', 'editar'));

-- O solicitante pode cancelar o próprio pedido enquanto está pendente.
drop policy if exists "Requester cancels own pending request" on public.team_join_requests;
create policy "Requester cancels own pending request"
  on public.team_join_requests for delete to authenticated
  using (
    profile_id = (select id from public.profiles where user_id = auth.uid() limit 1)
    and status = 'pending'
  );
-- (Sem policy de INSERT/UPDATE p/ authenticated: criação/decisão só via RPCs abaixo.)

-- Deixa o solicitante pendente enxergar o NOME da equipe que pediu pra entrar.
drop policy if exists "Pending requesters can view team" on public.teams;
create policy "Pending requesters can view team"
  on public.teams for select to authenticated
  using (exists (
    select 1 from public.team_join_requests r
    where r.team_id = teams.id
      and r.profile_id = (select id from public.profiles where user_id = auth.uid() limit 1)
      and r.status = 'pending'
  ));

-- ----------------------------------------------------------------------------
-- 3) RPC: pedir entrada por código (qualquer usuário logado)
--    Security definer pra contornar a RLS de teams sem expor a tabela inteira;
--    só age sobre o PRÓPRIO profile (auth.uid()) e só cria pedido PENDENTE.
-- ----------------------------------------------------------------------------
create or replace function public.request_team_join(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid;
  v_team    public.teams%rowtype;
  v_member  boolean;
begin
  v_profile := (select id from public.profiles where user_id = auth.uid() limit 1);
  if v_profile is null then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  select * into v_team from public.teams
   where upper(join_code) = upper(trim(p_code)) limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select exists (
    select 1 from public.team_members
     where team_id = v_team.id and profile_id = v_profile
  ) into v_member;
  if v_member then
    return jsonb_build_object('ok', true, 'status', 'member',
      'team_id', v_team.id, 'team_name', v_team.name);
  end if;

  insert into public.team_join_requests (team_id, profile_id, status, created_at, decided_at, decided_by)
  values (v_team.id, v_profile, 'pending', now(), null, null)
  on conflict (team_id, profile_id) do update
    set status = 'pending', created_at = now(), decided_at = null, decided_by = null;

  return jsonb_build_object('ok', true, 'status', 'pending',
    'team_id', v_team.id, 'team_name', v_team.name);
end;
$$;

grant execute on function public.request_team_join(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) RPC: listar pendentes da equipe (líder) — traz o nome via security definer
--    (o solicitante ainda não é membro, então a RLS de profiles não o mostraria).
-- ----------------------------------------------------------------------------
create or replace function public.list_join_requests(p_team_id uuid)
returns table (
  id uuid, profile_id uuid, full_name text, avatar_url text, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.member_can(auth.uid(), p_team_id, 'membros', 'editar') then
    return;
  end if;
  return query
    select r.id, r.profile_id, p.full_name, p.avatar_url, r.created_at
      from public.team_join_requests r
      join public.profiles p on p.id = r.profile_id
     where r.team_id = p_team_id and r.status = 'pending'
     order by r.created_at asc;
end;
$$;

grant execute on function public.list_join_requests(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) RPC: aprovar / rejeitar (líder)
-- ----------------------------------------------------------------------------
create or replace function public.approve_join_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req   public.team_join_requests%rowtype;
  v_admin uuid;
begin
  select * into v_req from public.team_join_requests where id = p_request_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not public.member_can(auth.uid(), v_req.team_id, 'membros', 'editar') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_admin := (select id from public.profiles where user_id = auth.uid() limit 1);

  insert into public.team_members (team_id, profile_id, role)
  values (v_req.team_id, v_req.profile_id, 'viewer')
  on conflict (team_id, profile_id) do nothing;

  update public.team_join_requests
     set status = 'approved', decided_at = now(), decided_by = v_admin
   where id = p_request_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.approve_join_request(uuid) to authenticated;

create or replace function public.reject_join_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req   public.team_join_requests%rowtype;
  v_admin uuid;
begin
  select * into v_req from public.team_join_requests where id = p_request_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not public.member_can(auth.uid(), v_req.team_id, 'membros', 'editar') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_admin := (select id from public.profiles where user_id = auth.uid() limit 1);

  update public.team_join_requests
     set status = 'rejected', decided_at = now(), decided_by = v_admin
   where id = p_request_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.reject_join_request(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6) RPC: gerar novo código (líder) — invalida o antigo
-- ----------------------------------------------------------------------------
create or replace function public.regenerate_team_code(p_team_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code  text;
  tries int := 0;
begin
  if not public.member_can(auth.uid(), p_team_id, 'membros', 'editar') then
    raise exception 'forbidden';
  end if;
  loop
    code := public.gen_team_code();
    if not exists (select 1 from public.teams where join_code = code) then
      update public.teams set join_code = code where id = p_team_id;
      return code;
    end if;
    tries := tries + 1;
    exit when tries > 20;
  end loop;
  raise exception 'could_not_generate';
end;
$$;

grant execute on function public.regenerate_team_code(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 7) handle_new_user: capturar nome/avatar do Google (name/picture)
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
  );
  return new;
end;
$$;

notify pgrst, 'reload schema';
