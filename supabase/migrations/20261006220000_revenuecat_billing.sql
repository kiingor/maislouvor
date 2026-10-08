-- Depends on 20260930010000_platform_admin_and_support.sql.
BEGIN;

ALTER TABLE public.account_subscriptions DROP CONSTRAINT account_subscriptions_plan_check;
ALTER TABLE public.account_subscriptions ADD CONSTRAINT account_subscriptions_plan_check
  CHECK (plan IN ('free', 'pro', 'custom', 'essencial', 'estudio', 'asafe', 'completo'));
ALTER TABLE public.account_subscriptions DROP CONSTRAINT account_subscriptions_provider_check;
ALTER TABLE public.account_subscriptions ADD CONSTRAINT account_subscriptions_provider_check
  CHECK (provider IN ('manual', 'app_store', 'google_play', 'stripe', 'abacatepay', 'revenuecat'));
ALTER TABLE public.account_subscriptions
  ADD COLUMN product_id text,
  ADD COLUMN store text,
  ADD COLUMN member_limit integer CHECK (member_limit > 0),
  ADD COLUMN access_expires_at timestamptz,
  ADD COLUMN will_renew boolean NOT NULL DEFAULT false,
  ADD COLUMN revenuecat_environment text CHECK (revenuecat_environment IN ('PRODUCTION', 'SANDBOX')),
  ADD COLUMN revenuecat_request_ms bigint,
  ADD COLUMN entitlement_ids text[] NOT NULL DEFAULT '{}';

-- No prices are duplicated here: checkout always displays the store/RevenueCat price.
-- Seed real product IDs only after configuring the catalog in RevenueCat and stores.
CREATE TABLE public.revenuecat_products (
  product_id text PRIMARY KEY CHECK (length(product_id) BETWEEN 1 AND 255),
  entitlement_id text NOT NULL CHECK (length(entitlement_id) BETWEEN 1 AND 255),
  plan text NOT NULL CHECK (plan IN ('essencial', 'estudio', 'asafe', 'completo')),
  member_limit integer NOT NULL CHECK (member_limit BETWEEN 1 AND 10000),
  billing_period text NOT NULL CHECK (billing_period IN ('monthly', 'annual')),
  enabled boolean NOT NULL DEFAULT true
);

-- Opaque ID per team, never an email, user-supplied attribute or predictable team ID.
-- Only the team's owner can retrieve it, through the authorized RPC below.
CREATE TABLE public.revenuecat_customers (
  team_id uuid PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  app_user_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.revenuecat_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  environment text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.revenuecat_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenuecat_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenuecat_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.revenuecat_products, public.revenuecat_customers, public.revenuecat_webhook_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.revenuecat_products, public.revenuecat_customers, public.revenuecat_webhook_events TO service_role;

CREATE FUNCTION public.get_team_billing_context(p_team_id uuid) RETURNS jsonb
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
    'member_limit', s.member_limit, 'current_period_end', s.current_period_end,
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
    'products', v_products, 'subscription', COALESCE(v_subscription,
      jsonb_build_object('plan', 'free', 'status', 'free', 'provider', 'manual', 'is_active', false,
        'will_renew', false, 'entitlement_ids', '[]'::jsonb))
  );
END;
$$;

-- Only Edge Functions may apply snapshots fetched with the secret REST key.
-- Serializing with the admin RPC prevents a manual write racing with activation.
CREATE FUNCTION public.apply_revenuecat_snapshot(p_app_user_id uuid, p_snapshot jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_team uuid;
  v_request bigint := (p_snapshot->>'request_date_ms')::bigint;
  v_previous public.account_subscriptions%ROWTYPE;
  v_product public.revenuecat_products%ROWTYPE;
  v_active boolean := COALESCE((p_snapshot->>'is_active')::boolean, false);
BEGIN
  SELECT team_id INTO v_team FROM public.revenuecat_customers WHERE app_user_id = p_app_user_id;
  IF v_team IS NULL THEN RAISE EXCEPTION 'Cliente não vinculado.' USING ERRCODE = '22023'; END IF;
  IF v_request IS NULL OR v_request <= 0 OR p_snapshot->>'environment' IS NULL OR
     p_snapshot->>'environment' NOT IN ('PRODUCTION', 'SANDBOX') THEN
    RAISE EXCEPTION 'Snapshot inválido.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('subscription:' || v_team::text, 0));
  SELECT * INTO v_previous FROM public.account_subscriptions WHERE team_id = v_team;
  IF v_previous.revenuecat_request_ms IS NOT NULL AND v_request <= v_previous.revenuecat_request_ms THEN RETURN false; END IF;
  IF v_previous.revenuecat_environment IS NOT NULL AND v_previous.revenuecat_environment <> p_snapshot->>'environment' THEN
    RAISE EXCEPTION 'Ambientes de cobrança não podem ser misturados.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_product FROM public.revenuecat_products WHERE product_id = p_snapshot->>'product_id';
  IF v_active AND (v_product.product_id IS NULL OR (p_snapshot->>'access_expires_at')::timestamptz IS NULL OR
    NOT COALESCE(p_snapshot->'entitlement_ids' ? v_product.entitlement_id, false)) THEN
    RAISE EXCEPTION 'Produto ou acesso inválido.' USING ERRCODE = '22023';
  END IF;
  -- An empty lookup before the first purchase must not erase a manual contract.
  IF NOT v_active AND v_previous.provider IS DISTINCT FROM 'revenuecat' THEN RETURN false; END IF;
  IF v_previous.provider IS NOT NULL AND v_previous.provider NOT IN ('manual', 'revenuecat') THEN
    RAISE EXCEPTION 'A equipe já possui outro provedor de cobrança.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.account_subscriptions(team_id, plan, status, provider, product_id, store, member_limit,
    current_period_end, access_expires_at, will_renew, revenuecat_environment, revenuecat_request_ms, entitlement_ids)
  VALUES (v_team, COALESCE(v_product.plan, v_previous.plan),
    CASE WHEN v_active THEN p_snapshot->>'status' ELSE 'expired' END, 'revenuecat',
    COALESCE(v_product.product_id, v_previous.product_id), p_snapshot->>'store',
    COALESCE(v_product.member_limit, v_previous.member_limit),
    (p_snapshot->>'current_period_end')::timestamptz, (p_snapshot->>'access_expires_at')::timestamptz,
    COALESCE((p_snapshot->>'will_renew')::boolean, false), p_snapshot->>'environment', v_request,
    CASE WHEN v_active THEN ARRAY(SELECT jsonb_array_elements_text(p_snapshot->'entitlement_ids')) ELSE '{}'::text[] END)
  ON CONFLICT (team_id) DO UPDATE SET
    plan = EXCLUDED.plan, status = EXCLUDED.status, provider = EXCLUDED.provider,
    product_id = EXCLUDED.product_id, store = EXCLUDED.store, member_limit = EXCLUDED.member_limit,
    current_period_end = EXCLUDED.current_period_end, access_expires_at = EXCLUDED.access_expires_at,
    will_renew = EXCLUDED.will_renew, revenuecat_environment = EXCLUDED.revenuecat_environment,
    revenuecat_request_ms = EXCLUDED.revenuecat_request_ms, entitlement_ids = EXCLUDED.entitlement_ids,
    monthly_amount = NULL, updated_at = now(), updated_by = NULL;
  -- No raw receipt, customer ID, portal URL, email, or secret is written to audit.
  INSERT INTO public.platform_audit_log(action, entity_id, details) VALUES ('revenuecat_sync', v_team::text,
    jsonb_build_object('plan', COALESCE(v_product.plan, v_previous.plan), 'active', v_active,
      'environment', p_snapshot->>'environment', 'request_date_ms', v_request));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.get_team_billing_context(uuid), public.apply_revenuecat_snapshot(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_billing_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_revenuecat_snapshot(uuid, jsonb) TO service_role;

COMMIT;
