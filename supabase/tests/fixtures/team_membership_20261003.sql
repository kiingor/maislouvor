-- Recorte do schema public de produção (pg_dump --schema-only e
-- pg_get_functiondef de 03/10/2026, só leitura), complementando
-- core_schema_20260927.sql com o que controla quem entra e com que papel numa
-- equipe: convites, pedidos por código, as RLS de teams/team_members/profiles,
-- os gatilhos de teams e as RPCs de entrada. Carregue depois do core.
-- Gerado a partir da produção; não edite à mão sem conferir com ela.

CREATE TABLE public.team_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    email text NOT NULL,
    role public.team_role DEFAULT 'viewer'::public.team_role NOT NULL,
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    accepted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.team_join_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    decided_by uuid,
    CONSTRAINT team_join_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);

ALTER TABLE ONLY public.team_invites ADD CONSTRAINT team_invites_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.team_invites ADD CONSTRAINT team_invites_token_key UNIQUE (token);
ALTER TABLE ONLY public.team_join_requests ADD CONSTRAINT team_join_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.team_join_requests ADD CONSTRAINT team_join_requests_team_id_profile_id_key UNIQUE (team_id, profile_id);
ALTER TABLE ONLY public.team_invites ADD CONSTRAINT team_invites_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_join_requests ADD CONSTRAINT team_join_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.team_join_requests ADD CONSTRAINT team_join_requests_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.team_join_requests ADD CONSTRAINT team_join_requests_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.assign_team_code()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_team()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.team_members (team_id, profile_id, role)
  VALUES (NEW.id, NEW.owner_id, 'admin');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_team_join(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.approve_join_request(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.reject_join_request(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.regenerate_team_code(p_team_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE TRIGGER before_team_insert_assign_code BEFORE INSERT ON public.teams FOR EACH ROW EXECUTE FUNCTION public.assign_team_code();
CREATE TRIGGER on_team_created AFTER INSERT ON public.teams FOR EACH ROW EXECUTE FUNCTION public.handle_new_team();

CREATE POLICY "Admins can add team members" ON public.team_members FOR INSERT TO authenticated WITH CHECK (public.member_can(auth.uid(), team_id, 'membros'::text, 'editar'::text));
CREATE POLICY "Admins can create invites" ON public.team_invites FOR INSERT TO authenticated WITH CHECK (public.has_team_role(auth.uid(), team_id, 'admin'::public.team_role));
CREATE POLICY "Admins can delete invites" ON public.team_invites FOR DELETE TO authenticated USING (public.has_team_role(auth.uid(), team_id, 'admin'::public.team_role));
CREATE POLICY "Admins can delete teams" ON public.teams FOR DELETE TO authenticated USING (public.has_team_role(auth.uid(), id, 'admin'::public.team_role));
CREATE POLICY "Admins can remove team members" ON public.team_members FOR DELETE TO authenticated USING (public.member_can(auth.uid(), team_id, 'membros'::text, 'editar'::text));
CREATE POLICY "Admins can update invites" ON public.team_invites FOR UPDATE TO authenticated USING (public.has_team_role(auth.uid(), team_id, 'admin'::public.team_role));
CREATE POLICY "Admins can update team members" ON public.team_members FOR UPDATE TO authenticated USING (public.member_can(auth.uid(), team_id, 'membros'::text, 'editar'::text));
CREATE POLICY "Admins can update teams" ON public.teams FOR UPDATE TO authenticated USING (public.has_team_role(auth.uid(), id, 'admin'::public.team_role));
CREATE POLICY "Admins can view invites" ON public.team_invites FOR SELECT TO authenticated USING (public.has_team_role(auth.uid(), team_id, 'admin'::public.team_role));
CREATE POLICY "Authenticated users can create teams" ON public.teams FOR INSERT TO authenticated WITH CHECK ((owner_id = ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));
CREATE POLICY "Managers see team join requests" ON public.team_join_requests FOR SELECT TO authenticated USING (public.member_can(auth.uid(), team_id, 'membros'::text, 'editar'::text));
CREATE POLICY "Members can view team members" ON public.team_members FOR SELECT TO authenticated USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Members can view their teams" ON public.teams FOR SELECT TO authenticated USING (public.is_team_member(auth.uid(), id));
CREATE POLICY "Pending requesters can view team" ON public.teams FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.team_join_requests r
  WHERE ((r.team_id = teams.id) AND (r.profile_id = ( SELECT profiles.id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1)) AND (r.status = 'pending'::text)))));
CREATE POLICY "Requester cancels own pending request" ON public.team_join_requests FOR DELETE TO authenticated USING (((profile_id = ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)) AND (status = 'pending'::text)));
CREATE POLICY "Requester sees own join requests" ON public.team_join_requests FOR SELECT TO authenticated USING ((profile_id = ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));
CREATE POLICY "Team members can view teammate profiles" ON public.profiles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.team_members tm1
     JOIN public.team_members tm2 ON ((tm1.team_id = tm2.team_id)))
  WHERE ((tm1.profile_id = profiles.id) AND (tm2.profile_id = public.get_my_profile_id())))));
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = user_id));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
