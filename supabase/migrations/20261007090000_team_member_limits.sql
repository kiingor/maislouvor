-- Existing teams keep permanent unlimited access. Only teams created after this
-- transaction starts the policy receive the Essential/free 5-person allowance.
-- Requires platform administration, RevenueCat billing and invite hardening.
BEGIN;
LOCK TABLE public.teams IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.account_subscriptions
  ADD COLUMN is_unlimited boolean NOT NULL DEFAULT false,
  ADD COLUMN unlimited_reason text CHECK (unlimited_reason IN ('legacy', 'admin')),
  ADD CONSTRAINT unlimited_reason_consistent CHECK (is_unlimited = (unlimited_reason IS NOT NULL));

-- Preserve contracts, provider fields, notes and all existing team data.
INSERT INTO public.account_subscriptions(team_id, member_limit, is_unlimited, unlimited_reason)
SELECT id, 5, true, 'legacy' FROM public.teams
ON CONFLICT (team_id) DO UPDATE SET is_unlimited = true, unlimited_reason = 'legacy';

CREATE FUNCTION public.initialize_team_subscription() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.account_subscriptions(team_id, member_limit) VALUES (NEW.id, 5) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER initialize_team_subscription AFTER INSERT ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.initialize_team_subscription();

-- Internal helper; callable only through authorized RPCs/triggers. Read-time
-- expiry means a late webhook can never leave an expired capacity available.
CREATE FUNCTION public.team_member_capacity(p_team_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_subscription public.account_subscriptions%ROWTYPE;
  v_limit integer := 5;
  v_count integer;
  v_paid boolean := false;
BEGIN
  SELECT * INTO v_subscription FROM public.account_subscriptions WHERE team_id = p_team_id;
  SELECT count(*) INTO v_count FROM public.team_members WHERE team_id = p_team_id;
  v_paid := COALESCE(CASE WHEN v_subscription.provider = 'revenuecat' THEN
    v_subscription.access_expires_at > now() AND cardinality(v_subscription.entitlement_ids) > 0
  ELSE v_subscription.plan <> 'free' AND v_subscription.status IN ('active', 'trialing') AND
    (v_subscription.current_period_end IS NULL OR v_subscription.current_period_end > now()) END, false);
  IF v_subscription.is_unlimited THEN v_limit := NULL;
  ELSIF v_paid THEN v_limit := COALESCE(v_subscription.member_limit, 5);
  END IF;
  RETURN jsonb_build_object('member_count', v_count, 'member_limit', v_limit,
    'is_unlimited', COALESCE(v_subscription.is_unlimited, false),
    'unlimited_reason', v_subscription.unlimited_reason,
    'effective_plan', CASE WHEN v_subscription.is_unlimited THEN 'unlimited' WHEN v_paid THEN v_subscription.plan ELSE 'essencial' END,
    'can_add_member', v_limit IS NULL OR v_count < v_limit);
END;
$$;

CREATE FUNCTION public.get_team_member_capacity(p_team_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb; v_owner boolean;
BEGIN
  SELECT owner_id = public.get_my_profile_id() INTO v_owner FROM public.teams WHERE id = p_team_id;
  IF auth.uid() IS NULL OR v_owner IS NULL OR (NOT v_owner AND NOT EXISTS (
    SELECT 1 FROM public.team_members WHERE team_id = p_team_id AND profile_id = public.get_my_profile_id()
  )) THEN RAISE EXCEPTION 'Sem acesso à equipe.' USING ERRCODE = '42501'; END IF;
  v_result := public.team_member_capacity(p_team_id);
  RETURN v_result || jsonb_build_object('can_manage', v_owner);
END;
$$;

-- Shared lock with subscription synchronization and administrative changes.
-- Invitations do not reserve seats: accepting each one rechecks atomically.
CREATE FUNCTION public.enforce_team_member_capacity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_capacity jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('subscription:' || NEW.team_id::text, 0));
  IF TG_TABLE_NAME = 'team_members' THEN
    IF TG_OP = 'UPDATE' AND NEW.team_id = OLD.team_id THEN RETURN NEW; END IF;
    -- Accepting another invite for somebody already in the team uses no seat.
    IF EXISTS (SELECT 1 FROM public.team_members WHERE team_id = NEW.team_id AND profile_id = NEW.profile_id) THEN RETURN NEW; END IF;
  ELSE
    IF NEW.accepted OR NEW.expires_at <= now() THEN RETURN NEW; END IF;
  END IF;
  v_capacity := public.team_member_capacity(NEW.team_id);
  IF NOT (v_capacity->>'can_add_member')::boolean THEN
    RAISE EXCEPTION 'A equipe atingiu o limite de integrantes. O líder responsável precisa contratar mais vagas.'
      USING ERRCODE = 'P0001', HINT = 'TEAM_MEMBER_LIMIT_REACHED', DETAIL = v_capacity::text;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_team_member_capacity BEFORE INSERT OR UPDATE OF team_id ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_team_member_capacity();
CREATE TRIGGER enforce_team_invite_capacity BEFORE INSERT OR UPDATE ON public.team_invites
FOR EACH ROW EXECUTE FUNCTION public.enforce_team_member_capacity();

CREATE OR REPLACE FUNCTION public.get_team_billing_context(p_team_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_owner boolean;
  v_customer uuid;
  v_subscription jsonb;
  v_products jsonb;
BEGIN
  SELECT t.owner_id = public.get_my_profile_id() INTO v_owner FROM public.teams t WHERE t.id = p_team_id;
  IF auth.uid() IS NULL OR v_owner IS NULL OR (NOT v_owner AND NOT EXISTS (
    SELECT 1 FROM public.team_members m WHERE m.team_id = p_team_id AND m.profile_id = public.get_my_profile_id()
  )) THEN RAISE EXCEPTION 'Sem acesso à assinatura desta equipe.' USING ERRCODE = '42501'; END IF;

  IF v_owner THEN
    INSERT INTO public.revenuecat_customers(team_id) VALUES (p_team_id) ON CONFLICT DO NOTHING;
    SELECT app_user_id INTO v_customer FROM public.revenuecat_customers WHERE team_id = p_team_id;
  END IF;

  -- Exclude internal notes, billing identities and personal data from member access.
  SELECT jsonb_build_object(
    'plan', s.plan, 'status', CASE WHEN s.provider = 'revenuecat' AND
      (s.access_expires_at IS NULL OR s.access_expires_at <= now()) THEN 'expired' ELSE s.status END,
    'provider', s.provider, 'product_id', s.product_id, 'store', s.store,
    'member_limit', s.member_limit, 'is_unlimited', s.is_unlimited, 'unlimited_reason', s.unlimited_reason, 'current_period_end', s.current_period_end,
    'access_expires_at', s.access_expires_at, 'will_renew', s.will_renew,
    'is_active', s.provider = 'revenuecat' AND s.access_expires_at > now() AND cardinality(s.entitlement_ids) > 0,
    'entitlement_ids', CASE WHEN s.access_expires_at > now() THEN s.entitlement_ids ELSE '{}'::text[] END,
    'environment', s.revenuecat_environment, 'updated_at', s.updated_at
  ) INTO v_subscription FROM public.account_subscriptions s WHERE s.team_id = p_team_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.plan, p.member_limit, p.billing_period), '[]'::jsonb)
    INTO v_products FROM public.revenuecat_products p WHERE p.enabled;
  RETURN jsonb_build_object(
    'team_id', p_team_id, 'can_manage', v_owner, 'app_user_id', v_customer,
    'member_count', (SELECT count(*) FROM public.team_members WHERE team_id = p_team_id),
    'capacity', public.team_member_capacity(p_team_id) || jsonb_build_object('can_manage', v_owner), 'products', v_products, 'subscription', COALESCE(v_subscription,
      jsonb_build_object('plan', 'free', 'status', 'free', 'provider', 'manual', 'is_active', false,
        'will_renew', false, 'entitlement_ids', '[]'::jsonb))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_accounts(p_search text DEFAULT '', p_plan text DEFAULT '', p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.platform_require_admin();
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 OR length(p_search) > 200 THEN
    RAISE EXCEPTION 'Filtros inválidos.' USING ERRCODE = '22023';
  END IF;
  WITH filtered AS (
    SELECT t.id, t.name, t.created_at, t.owner_id, p.full_name AS owner_name, u.email AS owner_email,
      COALESCE(s.is_unlimited, false) AS is_unlimited, s.unlimited_reason, COALESCE(s.plan, 'free') AS plan, COALESCE(s.status, 'free') AS subscription_status,
      (SELECT count(*) FROM public.team_members m WHERE m.team_id = t.id) AS member_count,
      (SELECT count(*) FROM public.songs x WHERE x.team_id = t.id) AS song_count,
      (SELECT count(*) FROM public.repertorios x WHERE x.team_id = t.id) AS repertorio_count,
      (SELECT count(*) FROM public.cultos x WHERE x.team_id = t.id) AS culto_count,
      (SELECT max(mu.last_sign_in_at) FROM public.team_members m JOIN public.profiles mp ON mp.id = m.profile_id JOIN auth.users mu ON mu.id = mp.user_id WHERE m.team_id = t.id) AS last_activity_at
    FROM public.teams t JOIN public.profiles p ON p.id = t.owner_id JOIN auth.users u ON u.id = p.user_id
    LEFT JOIN public.account_subscriptions s ON s.team_id = t.id
    WHERE (p_plan = '' OR (p_plan = 'unlimited' AND s.is_unlimited) OR (NOT COALESCE(s.is_unlimited, false) AND COALESCE(s.plan, 'free') = p_plan))
      AND (p_search = '' OR strpos(lower(t.name || ' ' || COALESCE(p.full_name, '') || ' ' || COALESCE(u.email, '')), lower(btrim(p_search))) > 0)
  ), paged AS (SELECT * FROM filtered ORDER BY created_at DESC, id DESC LIMIT p_page_size OFFSET (p_page - 1) * p_page_size)
  SELECT jsonb_build_object('items', COALESCE((SELECT jsonb_agg(to_jsonb(paged)) FROM paged), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered), 'page', p_page, 'page_size', p_page_size) INTO v_result;
  RETURN v_result;
END;
$$;

DROP FUNCTION public.admin_update_subscription(uuid, text, text, numeric, timestamptz, text);
CREATE FUNCTION public.admin_update_subscription(p_team_id uuid, p_plan text, p_status text, p_monthly_amount numeric DEFAULT NULL,
  p_current_period_end timestamptz DEFAULT NULL, p_notes text DEFAULT '', p_member_limit integer DEFAULT 5, p_is_unlimited boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_previous jsonb; v_result jsonb;
BEGIN
  PERFORM public.platform_require_admin();
  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = p_team_id) THEN RAISE EXCEPTION 'Conta não encontrada.' USING ERRCODE = 'P0002'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('subscription:' || p_team_id::text, 0));
  SELECT to_jsonb(s) INTO v_previous FROM public.account_subscriptions s WHERE team_id = p_team_id;
  IF p_member_limit IS NULL OR p_member_limit NOT BETWEEN 1 AND 10000 OR p_is_unlimited IS NULL THEN
    RAISE EXCEPTION 'Informe uma capacidade entre 1 e 10.000 integrantes.' USING ERRCODE = '22023';
  END IF;
  IF v_previous->>'unlimited_reason' = 'legacy' AND NOT p_is_unlimited THEN
    RAISE EXCEPTION 'O acesso ilimitado das contas anteriores deve ser preservado.' USING ERRCODE = '22023';
  END IF;
  -- Store subscriptions remain provider-controlled; manual grants never charge a card.
  IF COALESCE(v_previous->>'provider', 'manual') <> 'manual' THEN
    RAISE EXCEPTION 'Esta assinatura é sincronizada pelo provedor e não pode ser alterada manualmente.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.account_subscriptions(team_id, plan, status, monthly_amount, current_period_end, notes, updated_by, member_limit, is_unlimited, unlimited_reason)
  VALUES (p_team_id, p_plan, p_status, p_monthly_amount, p_current_period_end, btrim(p_notes), auth.uid(), CASE WHEN p_plan = 'free' THEN 5 ELSE p_member_limit END, p_is_unlimited,
    CASE WHEN p_is_unlimited THEN COALESCE(v_previous->>'unlimited_reason', 'admin') END)
  ON CONFLICT (team_id) DO UPDATE SET plan = EXCLUDED.plan, status = EXCLUDED.status, monthly_amount = EXCLUDED.monthly_amount,
    current_period_end = EXCLUDED.current_period_end, notes = EXCLUDED.notes, member_limit = EXCLUDED.member_limit, is_unlimited = EXCLUDED.is_unlimited,
    unlimited_reason = EXCLUDED.unlimited_reason, updated_at = now(), updated_by = auth.uid();
  SELECT to_jsonb(s) INTO v_result FROM public.account_subscriptions s WHERE team_id = p_team_id;
  INSERT INTO public.platform_audit_log(actor_user_id, action, entity_id, details)
  VALUES (auth.uid(), 'subscription_update', p_team_id::text, jsonb_build_object('previous', v_previous - 'notes', 'current', v_result - 'notes'));
  RETURN v_result;
END;
$$;


REVOKE ALL ON FUNCTION public.initialize_team_subscription(), public.team_member_capacity(uuid),
  public.get_team_member_capacity(uuid), public.enforce_team_member_capacity(),
  public.admin_update_subscription(uuid, text, text, numeric, timestamptz, text, integer, boolean)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_member_capacity(uuid),
  public.admin_update_subscription(uuid, text, text, numeric, timestamptz, text, integer, boolean) TO authenticated;
COMMIT;
