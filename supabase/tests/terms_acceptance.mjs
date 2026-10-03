// Aceite dos Termos de Uso e da Política de Privacidade: colunas, RPC e proteção.
// Roda num PostgreSQL em memória (PGlite), nunca na produção:
//   PGLITE_MODULE=/caminho/@electric-sql/pglite/dist/index.js node supabase/tests/terms_acceptance.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();

const ana = '40000000-0000-4000-8000-000000000001';
const bruno = '40000000-0000-4000-8000-000000000002';
const semPerfil = '40000000-0000-4000-8000-000000000003';
const carla = '40000000-0000-4000-8000-000000000004';
const anaProfile = '50000000-0000-4000-8000-000000000001';
const brunoProfile = '50000000-0000-4000-8000-000000000002';
const VERSION = '2026-10-03';

let checks = 0;
const check = (actual, expected, label = 'valor diferente') => { assert.deepEqual(actual, expected, label); checks++; };
const ok = (value, label = 'condição falsa') => { assert.ok(value, label); checks++; };
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const fails = async (sql, code, params) => {
  await assert.rejects(db.query(sql, params), (error) => {
    assert.equal(error.code, code, `${sql} -> ${error.message}`);
    return true;
  });
  checks++;
};
const as = (uid) => db.exec(`RESET ROLE; SELECT set_config('test.uid', '${uid}', false); SET ROLE authenticated`);
const asAnon = () => db.exec(`RESET ROLE; SELECT set_config('test.uid', '', false); SET ROLE anon`);
const asService = () => db.exec(`RESET ROLE; SELECT set_config('test.uid', '', false); SET ROLE service_role`);
const asOwner = () => db.exec(`RESET ROLE; SELECT set_config('test.uid', '', false)`);
const accept = (terms = VERSION, privacy = VERSION) =>
  one('SELECT public.accept_terms($1, $2) AS r', [terms, privacy]).then((row) => row.r);
const profileOf = (id) =>
  one('SELECT full_name, terms_accepted_at, terms_version, privacy_version FROM public.profiles WHERE id = $1', [id]);

try {
  // Mínimo do Supabase: papéis, auth.uid() e os default privileges que dão tudo
  // a anon/authenticated (a migração precisa revogar o que não for público).
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  `);
  await db.exec(await readFile(new URL('./fixtures/core_schema_20260927.sql', import.meta.url), 'utf8'));
  // Políticas de produção do perfil (migração inicial) e o gatilho de updated_at.
  await db.exec(`
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
    CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS
      $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
    CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    INSERT INTO public.profiles(id, user_id, full_name) VALUES
      ('${anaProfile}', '${ana}', 'Ana'),
      ('${brunoProfile}', '${bruno}', 'Bruno');
  `);

  const migration = await readFile(new URL('../migrations/20261003131000_terms_acceptance.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // idempotente: pode ser reaplicada sem erro
  checks++;

  // Colunas novas, vazias para quem já existia (verá o pedido de aceite uma vez).
  const cols = await rows(`SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name IN ('terms_accepted_at', 'terms_version', 'privacy_version')
    ORDER BY column_name`);
  check(cols, [
    { column_name: 'privacy_version', data_type: 'text' },
    { column_name: 'terms_accepted_at', data_type: 'timestamp with time zone' },
    { column_name: 'terms_version', data_type: 'text' },
  ]);
  check(await profileOf(anaProfile), { full_name: 'Ana', terms_accepted_at: null, terms_version: null, privacy_version: null });

  // Permissões: só authenticated executa a RPC; a função é SECURITY DEFINER com search_path fixo.
  const fn = await one(`SELECT p.prosecdef, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth
    FROM pg_proc p WHERE p.oid = 'public.accept_terms(text, text)'::regprocedure`);
  check([fn.prosecdef, fn.proconfig, fn.anon, fn.auth], [true, ['search_path=""'], false, true]);
  const guard = await one(`SELECT has_function_privilege('authenticated', 'public.profiles_guard_terms_acceptance()', 'EXECUTE') AS auth,
      has_function_privilege('anon', 'public.profiles_guard_terms_acceptance()', 'EXECUTE') AS anon`);
  check([guard.auth, guard.anon], [false, false]);

  // Versões vigentes no servidor: públicas (não são segredo), as mesmas de src/lib/legal.ts.
  const versionsFn = await one(`SELECT p.provolatile, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon
    FROM pg_proc p WHERE p.oid = 'public.legal_current_versions()'::regprocedure`);
  check([versionsFn.provolatile, versionsFn.proconfig, versionsFn.anon], ['s', ['search_path=""'], true]);
  await asAnon();
  check((await one('SELECT public.legal_current_versions() AS v')).v, { terms: VERSION, privacy: VERSION });

  // Sem login: anon não executa; authenticated sem uid é recusado.
  await asAnon();
  await fails(`SELECT public.accept_terms('${VERSION}', '${VERSION}')`, '42501');
  await as('');
  await fails(`SELECT public.accept_terms('${VERSION}', '${VERSION}')`, '42501');

  // Validação das versões.
  await as(ana);
  await fails("SELECT public.accept_terms('', '2026-10-03')", '22023');
  await fails("SELECT public.accept_terms('2026-10-03', '   ')", '22023');
  await fails('SELECT public.accept_terms(NULL, NULL)', '22023');
  await fails("SELECT public.accept_terms('2026 10 03', '2026-10-03')", '22023');
  await fails(`SELECT public.accept_terms('${'9'.repeat(33)}', '2026-10-03')`, '22023');
  await asOwner();
  check((await profileOf(anaProfile)).terms_version, null, 'validação não grava nada');

  // Aceite grava só o perfil de quem chamou, com a data do servidor.
  await as(ana);
  const before = Date.now();
  const result = await accept(` ${VERSION} `, VERSION);
  check([result.terms_version, result.privacy_version], [VERSION, VERSION]);
  ok(Math.abs(new Date(result.terms_accepted_at).getTime() - before) < 60_000, 'data do aceite vem do servidor');
  const own = await one('SELECT terms_version, privacy_version, terms_accepted_at FROM public.profiles WHERE user_id = $1', [ana]);
  check([own.terms_version, own.privacy_version], [VERSION, VERSION]);
  ok(own.terms_accepted_at instanceof Date, 'terms_accepted_at preenchido');
  await asOwner();
  check(await profileOf(brunoProfile), { full_name: 'Bruno', terms_accepted_at: null, terms_version: null, privacy_version: null }, 'outro perfil intocado');

  // Só a versão vigente: nem uma futura (ainda não publicada) nem uma antiga.
  await as(ana);
  await fails("SELECT public.accept_terms('2027-01-15', '2027-01-15')", '22023');
  await fails(`SELECT public.accept_terms('${VERSION}', '2025-01-01')`, '22023');
  await fails(`SELECT public.accept_terms('2025-01-01', '${VERSION}')`, '22023');
  await assert.rejects(db.query("SELECT public.accept_terms('2027-01-15', '2027-01-15')"), /outdated_version/, 'o app reconhece o erro');
  checks++;
  await asOwner();
  const anaAfterWrong = await profileOf(anaProfile);
  check([anaAfterWrong.terms_version, anaAfterWrong.privacy_version], [VERSION, VERSION], 'versão errada não grava');
  check(anaAfterWrong.terms_accepted_at.getTime(), new Date(result.terms_accepted_at).getTime());

  // Bruno não consegue aceitar "por" Ana nem ver o perfil dela.
  await as(bruno);
  await accept();
  check((await rows('SELECT user_id FROM public.profiles')).map((r) => r.user_id), [bruno], 'RLS: só o próprio perfil');
  await asOwner();
  check((await profileOf(anaProfile)).terms_accepted_at.getTime(), new Date(result.terms_accepted_at).getTime(), 'aceite de Bruno não muda Ana');

  // Sem perfil: erro claro, nada é criado.
  await as(semPerfil);
  await fails(`SELECT public.accept_terms('${VERSION}', '${VERSION}')`, 'P0002');
  await asOwner();
  check((await one('SELECT count(*)::int AS n FROM public.profiles')).n, 2);

  // Cliente não forja o aceite com UPDATE direto (mantém o valor anterior)...
  await as(bruno);
  const brunoBefore = await one('SELECT terms_accepted_at FROM public.profiles WHERE user_id = $1', [bruno]);
  await db.query(`UPDATE public.profiles SET terms_accepted_at = '2000-01-01', terms_version = 'falsa', privacy_version = 'falsa', full_name = 'Bruno Lima' WHERE user_id = $1`, [bruno]);
  await asOwner();
  const brunoAfter = await profileOf(brunoProfile);
  check([brunoAfter.full_name, brunoAfter.terms_version, brunoAfter.privacy_version], ['Bruno Lima', VERSION, VERSION], 'demais campos salvam; aceite não');
  check(brunoAfter.terms_accepted_at.getTime(), brunoBefore.terms_accepted_at.getTime());

  // ...nem limpa o aceite com UPDATE direto.
  await as(bruno);
  await db.query('UPDATE public.profiles SET terms_version = NULL, terms_accepted_at = NULL WHERE user_id = $1', [bruno]);
  await asOwner();
  check((await profileOf(brunoProfile)).terms_version, VERSION);

  // ...nem cria um perfil já "aceito".
  await as(carla);
  await db.query(`INSERT INTO public.profiles(user_id, full_name, terms_accepted_at, terms_version, privacy_version)
    VALUES ($1, 'Carla', '2000-01-01', 'falsa', 'falsa')`, [carla]);
  await asOwner();
  check(await one('SELECT full_name, terms_accepted_at, terms_version, privacy_version FROM public.profiles WHERE user_id = $1', [carla]),
    { full_name: 'Carla', terms_accepted_at: null, terms_version: null, privacy_version: null });

  // Cliente anônimo continua sem acesso ao perfil.
  await asAnon();
  check((await rows('SELECT id FROM public.profiles')).length, 0);
  await db.query("UPDATE public.profiles SET terms_version = 'falsa'");
  await asOwner();
  check((await rows("SELECT id FROM public.profiles WHERE terms_version = 'falsa'")).length, 0);

  // O backend (service_role) pode ajustar o aceite (ex.: conta de demonstração).
  await asService();
  await db.query(`UPDATE public.profiles SET terms_version = $1, privacy_version = $1, terms_accepted_at = now() WHERE user_id = $2`, [VERSION, carla]);
  await asOwner();
  check((await profileOf((await one('SELECT id FROM public.profiles WHERE user_id = $1', [carla])).id)).terms_version, VERSION);

  // Nova versão dos documentos, publicada por uma migração que redefine a função:
  // a versão anterior deixa de ser aceita e a nova grava versão e data.
  await asOwner();
  await db.exec(`CREATE OR REPLACE FUNCTION public.legal_current_versions() RETURNS jsonb LANGUAGE sql STABLE SET search_path = ''
    AS $$ SELECT jsonb_build_object('terms', '2027-01-15', 'privacy', '2027-01-15') $$;`);
  await as(ana);
  await fails(`SELECT public.accept_terms('${VERSION}', '${VERSION}')`, '22023');
  await db.query("SELECT pg_sleep(0.01)");
  const updated = await accept('2027-01-15', '2027-01-15');
  check([updated.terms_version, updated.privacy_version], ['2027-01-15', '2027-01-15']);
  ok(new Date(updated.terms_accepted_at) > new Date(result.terms_accepted_at), 'novo aceite tem nova data');

  console.log(`terms_acceptance: ${checks} verificações ok`);
} finally {
  await db.close();
}
