-- Leadership and permission overrides can only be granted by a team leader.
--
-- 20260626_member_permissions.sql opened INSERT/UPDATE/DELETE on team_members
-- to member_can(..., 'membros', 'editar'). The UPDATE policy has no WITH CHECK
-- of its own and no column is protected, so a member who was given only the
-- "Membros: editar" exception could set their own role to 'admin', grant
-- themselves any permission, add someone straight in as leader or remove the
-- leaders, owner included. Policies cannot compare old and new values; the
-- trigger below does.
--
-- Members with "Membros: editar" keep everything the app offers them: approve
-- or reject join requests, add members as viewer or editor, edit instruments
-- and levels, switch other non-leaders between viewer and editor, and remove
-- non-leaders. They can no longer touch leader rows, change permissions or
-- change their own role.
--
-- Calls without a user JWT (auth.uid() IS NULL) are not restricted here:
-- create-invite and accept-invite run as service_role and check leadership
-- themselves; the database owner and cron jobs also land here.
--
-- teams.owner_id: the UPDATE policy lets any leader rewrite it. It now changes
-- only through transfer_team_ownership(), called by the current owner, and the
-- owner's membership can be neither demoted nor removed while they own the team
-- (deleting the team still cascades normally).

CREATE OR REPLACE FUNCTION public.guard_team_member_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF auth.uid() IS NULL THEN
      RETURN OLD;
    END IF;
    -- ON DELETE CASCADE from teams or profiles: the parent row is already gone.
    SELECT t.owner_id INTO v_owner FROM public.teams t WHERE t.id = OLD.team_id;
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = OLD.profile_id) THEN
      RETURN OLD;
    END IF;
    IF OLD.profile_id = v_owner THEN
      RAISE EXCEPTION 'O dono da equipe não pode ser removido. Transfira a equipe para outro líder antes.'
        USING ERRCODE = '42501';
    END IF;
    IF OLD.role = 'admin' AND NOT public.has_team_role(auth.uid(), OLD.team_id, 'admin') THEN
      RAISE EXCEPTION 'Só um líder pode remover outro líder.' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF public.has_team_role(auth.uid(), NEW.team_id, 'admin') THEN
      RETURN NEW;
    END IF;
    -- handle_new_team() runs with the creator's JWT: the owner joins their
    -- brand-new, still empty team as leader.
    IF NEW.role = 'admin'
       AND EXISTS (SELECT 1 FROM public.teams t WHERE t.id = NEW.team_id AND t.owner_id = NEW.profile_id)
       AND NOT EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = NEW.team_id) THEN
      RETURN NEW;
    END IF;
    IF NEW.role = 'admin' THEN
      RAISE EXCEPTION 'Só um líder pode adicionar alguém como líder.' USING ERRCODE = '42501';
    END IF;
    IF NEW.permissions IS DISTINCT FROM '{}'::jsonb THEN
      RAISE EXCEPTION 'Só um líder pode definir permissões.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
    RAISE EXCEPTION 'A equipe e a pessoa de um vínculo não podem ser trocadas.' USING ERRCODE = '42501';
  END IF;
  IF OLD.role = 'admin' AND NEW.role IS DISTINCT FROM 'admin'
     AND EXISTS (SELECT 1 FROM public.teams t WHERE t.id = OLD.team_id AND t.owner_id = OLD.profile_id) THEN
    RAISE EXCEPTION 'O dono da equipe continua líder. Transfira a equipe para outro líder antes.'
      USING ERRCODE = '42501';
  END IF;
  IF public.has_team_role(auth.uid(), OLD.team_id, 'admin') THEN
    RETURN NEW;
  END IF;
  IF OLD.role = 'admin' OR NEW.role = 'admin' THEN
    RAISE EXCEPTION 'Só um líder pode promover, rebaixar ou editar um líder.' USING ERRCODE = '42501';
  END IF;
  IF NEW.permissions IS DISTINCT FROM OLD.permissions THEN
    RAISE EXCEPTION 'Só um líder pode alterar permissões.' USING ERRCODE = '42501';
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     AND OLD.profile_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) THEN
    RAISE EXCEPTION 'Você não pode mudar o seu próprio papel na equipe.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_team_member_privileges() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_team_member_privileges ON public.team_members;
CREATE TRIGGER guard_team_member_privileges
BEFORE INSERT OR UPDATE OR DELETE ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.guard_team_member_privileges();

-- ---------------------------------------------------------------------------
-- Team ownership
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_team_owner_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     AND auth.uid() IS NOT NULL
     AND current_setting('app.transfer_team_ownership', true) IS DISTINCT FROM OLD.id::text THEN
    RAISE EXCEPTION 'O dono da equipe só muda pela transferência de equipe.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_team_owner_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_team_owner_change ON public.teams;
CREATE TRIGGER guard_team_owner_change
BEFORE UPDATE OF owner_id ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.guard_team_owner_change();

-- The current owner hands the team to another member, who becomes leader if
-- they were not one yet. The previous owner stays leader until the new owner
-- decides otherwise.
CREATE OR REPLACE FUNCTION public.transfer_team_ownership(p_team_id uuid, p_new_owner_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1);
  v_owner  uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND OR v_caller IS NULL OR v_caller IS DISTINCT FROM v_owner THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.team_members WHERE team_id = p_team_id AND profile_id = p_new_owner_profile_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_member');
  END IF;
  IF p_new_owner_profile_id = v_owner THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  UPDATE public.team_members
     SET role = 'admin', permissions = '{}'::jsonb
   WHERE team_id = p_team_id AND profile_id = p_new_owner_profile_id AND role <> 'admin';

  PERFORM set_config('app.transfer_team_ownership', p_team_id::text, true);
  UPDATE public.teams SET owner_id = p_new_owner_profile_id WHERE id = p_team_id;
  PERFORM set_config('app.transfer_team_ownership', '', true);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_team_ownership(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_team_ownership(uuid, uuid) TO authenticated, service_role;
