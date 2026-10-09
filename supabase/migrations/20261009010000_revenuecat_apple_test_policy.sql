-- Backend-only Apple sandbox exception. This migration authorizes no customer.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS public.revenuecat_test_customers (
  app_user_id uuid PRIMARY KEY REFERENCES public.revenuecat_customers(app_user_id) ON DELETE CASCADE,
  owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  store text NOT NULL DEFAULT 'app_store' CHECK (store='app_store'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at>created_at AND expires_at<=created_at+interval '14 days')
);
ALTER TABLE public.revenuecat_test_customers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.revenuecat_test_customers FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.revenuecat_test_customers TO service_role;

CREATE OR REPLACE FUNCTION private.guard_revenuecat_test_customer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_owner uuid; v_team uuid; v_subscription public.account_subscriptions%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF new.app_user_id<>old.app_user_id OR new.owner_profile_id<>old.owner_profile_id
       OR new.created_at<>old.created_at OR new.store<>old.store THEN
      RAISE EXCEPTION 'Vínculo de teste imutável.' USING ERRCODE='22023';
    END IF;
    -- Revocation must remain possible after ownership or contract changes.
    IF new.revoked_at IS NOT NULL THEN RETURN new; END IF;
  END IF;
  SELECT team_id INTO v_team FROM public.revenuecat_customers WHERE app_user_id=new.app_user_id;
  IF v_team IS NULL THEN RAISE EXCEPTION 'Cliente não vinculado.' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('subscription:' || v_team::text,0));
  SELECT t.owner_id INTO v_owner FROM public.revenuecat_customers c
    JOIN public.teams t ON t.id=c.team_id WHERE c.app_user_id=new.app_user_id FOR UPDATE OF c,t;
  IF v_owner IS DISTINCT FROM new.owner_profile_id THEN
    RAISE EXCEPTION 'Responsável de teste não corresponde à equipe.' USING ERRCODE='42501';
  END IF;
  SELECT s.* INTO v_subscription FROM public.account_subscriptions s
    JOIN public.revenuecat_customers c ON c.team_id=s.team_id WHERE c.app_user_id=new.app_user_id;
  IF v_subscription.team_id IS NOT NULL AND NOT (
    NOT v_subscription.is_unlimited AND v_subscription.provider='manual' AND v_subscription.plan='free'
    AND v_subscription.product_id IS NULL AND v_subscription.revenuecat_environment IS NULL
    AND cardinality(v_subscription.entitlement_ids)=0
  ) THEN
    RAISE EXCEPTION 'Teste só pode ser autorizado antes de qualquer contrato.' USING ERRCODE='42501';
  END IF;
  RETURN new;
END $$;
DROP TRIGGER IF EXISTS guard_revenuecat_test_customer ON public.revenuecat_test_customers;
CREATE TRIGGER guard_revenuecat_test_customer BEFORE INSERT OR UPDATE ON public.revenuecat_test_customers
FOR EACH ROW EXECUTE FUNCTION private.guard_revenuecat_test_customer();
REVOKE ALL ON FUNCTION private.guard_revenuecat_test_customer() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.revenuecat_customer_policy(p_app_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH customer AS (
    SELECT c.app_user_id,t.owner_id,s.provider,s.plan,s.store,s.revenuecat_environment,s.product_id,
      COALESCE(s.is_unlimited,false) AS is_unlimited,COALESCE(cardinality(s.entitlement_ids),0) AS grants
    FROM public.revenuecat_customers c JOIN public.teams t ON t.id=c.team_id
    LEFT JOIN public.account_subscriptions s ON s.team_id=t.id WHERE c.app_user_id=p_app_user_id
  ), decision AS (
    SELECT c.*,EXISTS(SELECT 1 FROM public.revenuecat_test_customers a
      WHERE a.app_user_id=c.app_user_id AND a.owner_profile_id=c.owner_id AND a.store='app_store'
      AND a.revoked_at IS NULL AND a.created_at<=now() AND a.expires_at>now())
      AND NOT c.is_unlimited AND (
        c.provider IS NULL OR (c.provider='manual' AND c.plan='free' AND c.product_id IS NULL
          AND c.revenuecat_environment IS NULL AND c.grants=0)
        OR (c.provider='revenuecat' AND c.revenuecat_environment='SANDBOX' AND c.store='app_store')
      ) AS test_allowed
    FROM customer c
  ) SELECT COALESCE((SELECT jsonb_build_object('known',true,
    'environment',CASE WHEN test_allowed THEN 'SANDBOX' ELSE 'PRODUCTION' END,
    'store',CASE WHEN test_allowed THEN 'app_store' ELSE NULL END,
    'may_sync',test_allowed OR revenuecat_environment IS DISTINCT FROM 'SANDBOX',
    'requires_test_reset',COALESCE(NOT test_allowed AND revenuecat_environment='SANDBOX',false)) FROM decision),
    jsonb_build_object('known',false,'environment','PRODUCTION','store',NULL,'may_sync',false,'requires_test_reset',false))
$$;
REVOKE ALL ON FUNCTION public.revenuecat_customer_policy(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.revenuecat_customer_policy(uuid) TO service_role;

-- Keep the deployed snapshot implementation intact behind the mandatory guard.
-- Remove direct service-role execution of the old body, preventing bypass.
DO $$ BEGIN
  IF to_regprocedure('private.apply_revenuecat_snapshot_base(uuid,jsonb)') IS NULL THEN
    ALTER FUNCTION public.apply_revenuecat_snapshot(uuid,jsonb) RENAME TO apply_revenuecat_snapshot_base;
    ALTER FUNCTION public.apply_revenuecat_snapshot_base(uuid,jsonb) SET SCHEMA private;
  END IF;
END $$;
REVOKE ALL ON FUNCTION private.apply_revenuecat_snapshot_base(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.apply_revenuecat_snapshot(p_app_user_id uuid,p_snapshot jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_team uuid; v_policy jsonb; v_environment text:=p_snapshot->>'environment'; v_snapshot jsonb:=p_snapshot;
BEGIN
  SELECT team_id INTO v_team FROM public.revenuecat_customers WHERE app_user_id=p_app_user_id;
  IF v_team IS NULL THEN RAISE EXCEPTION 'Cliente não vinculado.' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('subscription:' || v_team::text,0));
  -- Match the subscription writer lock order. Authorization is evaluated in
  -- this statement; do not take a reverse lock on an allowlist row being edited.
  PERFORM 1 FROM public.revenuecat_customers c JOIN public.teams t ON t.id=c.team_id
    WHERE c.app_user_id=p_app_user_id FOR UPDATE OF c,t;
  v_policy:=public.revenuecat_customer_policy(p_app_user_id);
  IF NOT (v_policy->>'may_sync')::boolean THEN
    RAISE EXCEPTION 'Teste encerrado. A migração para produção exige encerramento controlado.' USING ERRCODE='42501';
  END IF;
  IF v_environment IS DISTINCT FROM v_policy->>'environment' THEN
    RAISE EXCEPTION 'Ambiente não autorizado para este cliente.' USING ERRCODE='42501';
  END IF;
  IF v_environment='SANDBOX' AND p_snapshot->>'store' IS DISTINCT FROM 'app_store'
    AND (p_snapshot->>'store' IS NOT NULL OR COALESCE((p_snapshot->>'is_active')::boolean,false))
  THEN RAISE EXCEPTION 'Teste permitido apenas pela App Store.' USING ERRCODE='42501'; END IF;
  IF v_environment='SANDBOX' THEN
    -- Empty REST state after expiration/transfer must retain the authorized
    -- store identity, otherwise a later legitimate test renewal cannot sync.
    v_snapshot:=jsonb_set(v_snapshot,'{store}','"app_store"'::jsonb);
  END IF;
  RETURN private.apply_revenuecat_snapshot_base(p_app_user_id,v_snapshot);
END $$;
REVOKE ALL ON FUNCTION public.apply_revenuecat_snapshot(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_revenuecat_snapshot(uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
