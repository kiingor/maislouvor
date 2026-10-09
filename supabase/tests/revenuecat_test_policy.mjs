import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite(); let checks = 0;
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const denied = async (sql, args = []) => { await assert.rejects(db.query(sql, args)); checks++; };
const policy = customer => one('SELECT public.revenuecat_customer_policy($1) AS value', [customer]);
const snapshot = { request_date_ms: Date.now(), environment: 'SANDBOX', product_id: 'apple_fixture', store: 'app_store',
  is_active: true, status: 'active', access_expires_at: new Date(Date.now() + 86400000).toISOString(),
  current_period_end: new Date(Date.now() + 86400000).toISOString(), will_renew: true, entitlement_ids: ['completo'] };
const apply = (customer, data = snapshot) => one('SELECT public.apply_revenuecat_snapshot($1,$2) AS value', [customer, JSON.stringify(data)]);
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY);
    CREATE FUNCTION public.get_my_profile_id() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
    CREATE TABLE public.teams(id uuid PRIMARY KEY,owner_id uuid REFERENCES public.profiles);
    CREATE TABLE public.team_members(team_id uuid,profile_id uuid);
    CREATE TABLE public.account_subscriptions(team_id uuid PRIMARY KEY REFERENCES public.teams,
      plan text DEFAULT 'free' CONSTRAINT account_subscriptions_plan_check CHECK(plan IN ('free','pro','custom')),
      provider text DEFAULT 'manual' CONSTRAINT account_subscriptions_provider_check CHECK(provider IN ('manual','stripe')),
      status text DEFAULT 'free',current_period_end timestamptz,monthly_amount numeric,updated_at timestamptz,
      updated_by uuid,notes text,is_unlimited boolean NOT NULL DEFAULT false);
    CREATE TABLE public.platform_audit_log(action text,entity_id text,details jsonb);
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    INSERT INTO public.profiles VALUES ('${id(1)}'),('${id(2)}');
    INSERT INTO public.teams VALUES ('${id(10)}','${id(1)}'),('${id(11)}','${id(1)}'),('${id(12)}','${id(1)}'),('${id(13)}','${id(1)}');
    INSERT INTO public.account_subscriptions(team_id) SELECT id FROM public.teams;`);
  await db.exec(await readFile(new URL('../migrations/20261006220000_revenuecat_billing.sql', import.meta.url), 'utf8'));
  const migration = await readFile(new URL('../migrations/20261009010000_revenuecat_apple_test_policy.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration); checks++;
  await db.exec(`INSERT INTO public.revenuecat_products VALUES ('apple_fixture','completo','completo',20,'monthly',true);
    INSERT INTO public.revenuecat_customers(team_id,app_user_id) VALUES
      ('${id(10)}','${id(20)}'),('${id(11)}','${id(21)}'),('${id(12)}','${id(22)}'),('${id(13)}','${id(23)}');
    SET ROLE authenticated;`);
  await denied('SELECT * FROM public.revenuecat_test_customers');
  await denied('SELECT public.revenuecat_customer_policy($1)', [id(20)]);
  await denied('SELECT private.apply_revenuecat_snapshot_base($1,$2)', [id(20), '{}']);
  await db.exec('RESET ROLE; SET ROLE service_role');
  await denied('SELECT private.apply_revenuecat_snapshot_base($1,$2)', [id(20), '{}']);
  check((await policy(id(20))).environment, 'PRODUCTION');
  check((await policy(id(99))).known, false);
  await assert.rejects(apply(id(20)), /Ambiente não autorizado/); checks++;
  await denied('INSERT INTO public.revenuecat_test_customers(app_user_id,owner_profile_id,expires_at) VALUES($1,$2,now()+interval \'1 day\')', [id(20), id(2)]);
  await db.query('INSERT INTO public.revenuecat_test_customers(app_user_id,owner_profile_id,expires_at) VALUES($1,$2,now()+interval \'14 days\')', [id(20), id(1)]);
  check(await one('SELECT plan AS value FROM public.account_subscriptions WHERE team_id=$1', [id(10)]), 'free');
  check((await policy(id(20))).environment, 'SANDBOX');
  await assert.rejects(apply(id(20), { ...snapshot, store: 'stripe' }), /apenas pela App Store/); checks++;
  await assert.rejects(apply(id(20), { ...snapshot, store: null }), /apenas pela App Store/); checks++;
  check(await apply(id(20)), true);
  check(await one('SELECT revenuecat_environment AS value FROM public.account_subscriptions WHERE team_id=$1', [id(10)]), 'SANDBOX');
  check(await apply(id(20), { ...snapshot, request_date_ms: snapshot.request_date_ms+10, is_active: false,
    store: null, product_id: null, entitlement_ids: [], access_expires_at: null }), true);
  check(await one('SELECT store AS value FROM public.account_subscriptions WHERE team_id=$1', [id(10)]), 'app_store');
  check((await policy(id(20))).may_sync, true);
  check(await apply(id(20), { ...snapshot, request_date_ms: snapshot.request_date_ms+20 }), true);
  await assert.rejects(apply(id(20), { ...snapshot, environment: 'PRODUCTION', request_date_ms: snapshot.request_date_ms + 1 }), /Ambiente/); checks++;
  // Production contracts cannot be enrolled and cannot be replaced by sandbox.
  check(await apply(id(21), { ...snapshot, environment: 'PRODUCTION' }), true);
  await denied('INSERT INTO public.revenuecat_test_customers(app_user_id,owner_profile_id,expires_at) VALUES($1,$2,now()+interval \'1 day\')', [id(21), id(1)]);
  await assert.rejects(apply(id(21), { ...snapshot, request_date_ms: snapshot.request_date_ms + 1 }), /Ambiente/); checks++;
  check(await one('SELECT revenuecat_environment AS value FROM public.account_subscriptions WHERE team_id=$1', [id(11)]), 'PRODUCTION');
  // Revocation and ownership changes stop new grants, preserving the paid-until cache.
  await db.query('UPDATE public.teams SET owner_id=$1 WHERE id=$2', [id(2), id(10)]);
  check((await policy(id(20))).may_sync, false);
  await assert.rejects(apply(id(20), { ...snapshot, request_date_ms: snapshot.request_date_ms + 2 }), /Teste encerrado/); checks++;
  check(await one('SELECT access_expires_at IS NOT NULL AS value FROM public.account_subscriptions WHERE team_id=$1', [id(10)]), true);
  await db.query('UPDATE public.revenuecat_test_customers SET revoked_at=now() WHERE app_user_id=$1', [id(20)]);
  check((await policy(id(20))).requires_test_reset, true);
  // An expired exception cannot grant access. A cached sandbox contract requires controlled reset.
  await db.query(`INSERT INTO public.revenuecat_test_customers(app_user_id,owner_profile_id,created_at,expires_at)
    VALUES($1,$2,now()-interval '2 days',now()-interval '1 day')`, [id(22), id(1)]);
  check((await policy(id(22))).environment, 'PRODUCTION');
  await assert.rejects(apply(id(22)), /Ambiente/); checks++;
  await db.query(`UPDATE public.account_subscriptions SET provider='revenuecat',store='app_store',revenuecat_environment='SANDBOX',
    access_expires_at=now()+interval '1 hour' WHERE team_id=$1`, [id(12)]);
  check((await policy(id(22))).may_sync, false);
  await assert.rejects(apply(id(22), { ...snapshot, environment: 'PRODUCTION' }), /Teste encerrado/); checks++;
  await denied(`INSERT INTO public.revenuecat_test_customers(app_user_id,owner_profile_id,expires_at)
    VALUES($1,$2,now()+interval '15 days')`, [id(23), id(1)]);
  console.log(JSON.stringify({ passed: true, checks }));
} finally { await db.close(); }
