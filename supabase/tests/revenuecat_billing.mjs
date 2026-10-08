// Runs the real migrations in isolated PostgreSQL/WASM, with no network or real users.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
let checks = 0;
const owner = '10000000-0000-4000-8000-000000000001';
const member = '10000000-0000-4000-8000-000000000002';
const outsider = '10000000-0000-4000-8000-000000000003';
const team = '30000000-0000-4000-8000-000000000001';
const otherTeam = '30000000-0000-4000-8000-000000000002';
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const result = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.result;
const fails = async (sql, params = []) => { await assert.rejects(db.query(sql, params), (error) => error.code === '42501'); checks++; };
const asUser = async (id) => db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('test.uid', '${id}', false)`);
const context = () => result('SELECT public.get_team_billing_context($1) AS result', [team]);
const sync = (customer, snapshot) => result('SELECT public.apply_revenuecat_snapshot($1, $2) AS result', [customer, JSON.stringify(snapshot)]);
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth, public TO authenticated, anon, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, created_at timestamptz DEFAULT now(), last_sign_in_at timestamptz, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, user_id uuid UNIQUE REFERENCES auth.users, full_name text, avatar_url text);
    CREATE TYPE public.team_role AS ENUM ('admin', 'editor', 'viewer');
    CREATE TABLE public.teams(id uuid PRIMARY KEY, name text, owner_id uuid REFERENCES public.profiles, created_at timestamptz DEFAULT now());
    CREATE TABLE public.team_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid REFERENCES public.teams, profile_id uuid REFERENCES public.profiles, role public.team_role DEFAULT 'viewer', instruments text[], created_at timestamptz DEFAULT now());
    CREATE TABLE public.songs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid REFERENCES public.teams, title text, created_at timestamptz DEFAULT now());
    CREATE TABLE public.repertorios(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid REFERENCES public.teams, name text, created_at timestamptz DEFAULT now());
    CREATE TABLE public.cultos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid REFERENCES public.teams, name text, date date, created_at timestamptz DEFAULT now());
    CREATE TABLE public.team_invites(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid REFERENCES public.teams, accepted boolean DEFAULT false);
    CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid REFERENCES public.profiles, type text, title text, body text, link text, team_id uuid REFERENCES public.teams, read boolean DEFAULT false, created_at timestamptz DEFAULT now());
    CREATE FUNCTION public.get_my_profile_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$ SELECT id FROM public.profiles WHERE user_id = auth.uid() $$;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    INSERT INTO auth.users(id) VALUES ('${owner}'), ('${member}'), ('${outsider}');
    INSERT INTO public.profiles(id, user_id) VALUES ('${owner}', '${owner}'), ('${member}', '${member}'), ('${outsider}', '${outsider}');
    INSERT INTO public.teams(id, name, owner_id) VALUES ('${team}', 'Equipe de teste', '${owner}'), ('${otherTeam}', 'Outra equipe', '${outsider}');
    INSERT INTO public.team_members(team_id, profile_id, role) VALUES ('${team}', '${owner}', 'admin'), ('${team}', '${member}', 'admin');
  `);
  for (const file of ['20260930010000_platform_admin_and_support.sql', '20261006220000_revenuecat_billing.sql']) {
    await db.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')); checks++;
  }
  await db.exec(`INSERT INTO public.revenuecat_products VALUES ('completo_20_monthly', 'completo', 'completo', 20, 'monthly', true);
    INSERT INTO public.revenuecat_products VALUES ('legacy_product', 'completo', 'completo', 10, 'monthly', false);
    INSERT INTO public.account_subscriptions(team_id, plan, status, notes) VALUES ('${team}', 'pro', 'active', 'INTERNAL NOTE');`);
  await asUser(owner);
  const first = await context();
  const customer = first.app_user_id;
  check(first.can_manage, true);
  check(first.member_count, 2);
  check(first.products.length, 1);
  check(customer !== owner && customer !== team && typeof customer === 'string', true);
  check((await context()).app_user_id, customer);
  check(first.subscription.notes, undefined);
  for (const table of ['revenuecat_customers', 'revenuecat_products', 'revenuecat_webhook_events']) {
    await fails(`SELECT * FROM public.${table}`);
    await fails(`DELETE FROM public.${table}`);
  }
  await fails('SELECT public.apply_revenuecat_snapshot($1, $2)', [customer, '{}']);
  await fails('SELECT public.get_team_billing_context($1)', [otherTeam]);
  await fails(`UPDATE public.account_subscriptions SET provider = 'revenuecat' WHERE team_id = '${team}'`);
  await asUser(member);
  const memberView = await context();
  check(memberView.can_manage, false); // Team admin role is not billing ownership.
  check(memberView.app_user_id, null);
  check(memberView.subscription.notes, undefined);
  await asUser(outsider);
  await fails('SELECT public.get_team_billing_context($1)', [team]);
  await db.exec('RESET ROLE; SET ROLE anon');
  await fails('SELECT public.get_team_billing_context($1)', [team]);
  await fails('SELECT public.apply_revenuecat_snapshot($1, $2)', [customer, '{}']);

  await db.exec('RESET ROLE; SET ROLE service_role');
  const now = Date.now();
  const snapshot = { request_date_ms: now, environment: 'PRODUCTION', product_id: 'completo_20_monthly', store: 'app_store',
    is_active: true, status: 'active', current_period_end: new Date(now + 86400000).toISOString(),
    access_expires_at: new Date(now + 86400000).toISOString(), will_renew: true, entitlement_ids: ['completo'] };
  check(await sync(customer, { ...snapshot, is_active: false, product_id: null }), false);
  check(await result('SELECT plan AS result FROM public.account_subscriptions WHERE team_id = $1', [team]), 'pro');
  check(await sync(customer, snapshot), true);
  check(await result('SELECT plan AS result FROM public.account_subscriptions WHERE team_id = $1', [team]), 'completo');
  check(await result('SELECT notes AS result FROM public.account_subscriptions WHERE team_id = $1', [team]), 'INTERNAL NOTE');
  check(await sync(customer, snapshot), false); // Exact snapshot replay.
  check(await sync(customer, { ...snapshot, request_date_ms: now - 100, is_active: false }), false);
  check(await result('SELECT count(*)::integer AS result FROM public.platform_audit_log'), 1);
  await assert.rejects(sync(customer, { ...snapshot, request_date_ms: now + 1, environment: 'SANDBOX' }), /Ambientes/); checks++;
  await assert.rejects(sync(customer, { ...snapshot, request_date_ms: now + 1, product_id: 'forged' }), /inválido/); checks++;
  await assert.rejects(sync(customer, { ...snapshot, request_date_ms: now + 1, entitlement_ids: ['forged'] }), /inválido/); checks++;
  check(await sync(customer, { ...snapshot, request_date_ms: now + 1, will_renew: false }), true);
  await asUser(member);
  check((await context()).subscription.is_active, true);
  check((await context()).subscription.will_renew, false);
  check((await context()).subscription.member_limit, 20);
  // Expiration is enforced at read time even if the expiration webhook is late.
  await db.exec('RESET ROLE; SET ROLE service_role');
  await db.query('UPDATE public.account_subscriptions SET access_expires_at = now() - interval \'1 second\' WHERE team_id = $1', [team]);
  await asUser(owner);
  check((await context()).subscription.is_active, false);
  check((await context()).subscription.status, 'expired');
  check((await context()).subscription.entitlement_ids, []);
  await db.exec('RESET ROLE; SET ROLE service_role');
  check(await sync(customer, { ...snapshot, request_date_ms: now + 2, is_active: false, product_id: null, access_expires_at: null }), true);
  check(await result('SELECT status AS result FROM public.account_subscriptions WHERE team_id = $1', [team]), 'expired');
  check(await result('SELECT entitlement_ids AS result FROM public.account_subscriptions WHERE team_id = $1', [team]), []);
  // Provider records remain read-only in the existing administration RPC.
  await db.exec(`RESET ROLE; INSERT INTO public.platform_admins(user_id) VALUES ('${owner}')`);
  await asUser(owner);
  await assert.rejects(db.query('SELECT public.admin_update_subscription($1, $2, $3)', [team, 'free', 'free']), /sincronizada pelo provedor/); checks++;
  // Actual catalog is idempotent, retains older identities, and excludes draft annuals.
  await db.exec('RESET ROLE');
  const seed = await readFile(new URL('../setup/revenuecat_catalog.sql', import.meta.url), 'utf8');
  await db.exec(seed); await db.exec(seed);
  check(await result("SELECT count(*)::int AS result FROM public.revenuecat_products WHERE product_id LIKE 'com.maislouvor.app.%'"), 70);
  check(await result("SELECT count(*)::int AS result FROM public.revenuecat_products WHERE product_id LIKE 'com.maislouvor.app.%' AND enabled"), 66);
  check(await result("SELECT enabled AS result FROM public.revenuecat_products WHERE product_id = 'com.maislouvor.app.completo.150.annual'"), false);
  check(await result("SELECT enabled AS result FROM public.revenuecat_products WHERE product_id = 'legacy_product'"), false);
  await db.exec(await readFile(new URL('../migrations/20261007130000_stripe_billing_catalog.sql', import.meta.url), 'utf8'));
  check(await result("SELECT relrowsecurity AS result FROM pg_class WHERE oid = 'public.stripe_billing_products'::regclass"), true);
  await asUser(owner);
  await assert.rejects(db.query('SELECT * FROM public.stripe_billing_products'), /permission denied/); checks++;
  await db.exec('RESET ROLE; SET ROLE service_role');
  await db.query("INSERT INTO public.stripe_billing_products VALUES ('completo_20_monthly', 'prod_web', 'price_web', 'prodrcweb', 'bpc_web', 'SANDBOX')");
  check(await result('SELECT count(*)::int AS result FROM public.stripe_billing_products'), 1);
  console.log(`RevenueCat database: ${checks} checks passed.`);
} finally { await db.close(); }
