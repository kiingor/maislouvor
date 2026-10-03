// Conta de revisão das lojas contra o schema real em memória (PGlite), nunca contra um servidor.
// Roda applyDemo/resetDemo de scripts/review-demo/seed.mjs com um store SQL que faz o papel do
// PostgREST (service_role) e do GoTrue (auth.users + trigger handle_new_user). Confere que as
// linhas respeitam FKs, CHECKs e únicos de produção, que as músicas entram no catálogo, que o
// preflight recusa o schema de produção sem o cadastro de músicas e que o reset só apaga o que é
// da conta de revisão daquela loja.
// PGLITE_MODULE=/caminho/@electric-sql/pglite/dist/index.js node supabase/tests/review_demo_seed.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createAssistantDb, withRole } from './helpers/assistant_db.mjs';
import { applyDemo, findSchemaGaps, preflightSchema, resetDemo } from '../../scripts/review-demo/seed.mjs';
import { ACCOUNTS, REVIEW_MARKER, localDateISO } from '../../scripts/review-demo/data.mjs';

const APPLE = ACCOUNTS.apple;
const GOOGLE = ACCOUNTS.google;
const { leader: LEADER, members: MEMBERS, people: PEOPLE } = APPLE;
const DEMO_TEAM_NAME = APPLE.teamName;

let checks = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const ok = (value, label) => { assert.ok(value, label); checks++; };
const migration = (name) => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');

const { db } = await createAssistantDb();
const sql = async (text, params) => (await db.query(text, params)).rows;

// Recorte do núcleo que falta na fixture (mesmas colunas, FKs e únicos das migrações).
await db.exec(`
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY, email text, encrypted_password text, email_confirmed_at timestamptz,
    raw_user_meta_data jsonb NOT NULL DEFAULT '{}', raw_app_meta_data jsonb NOT NULL DEFAULT '{}'
  );
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  CREATE FUNCTION public.handle_new_team() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public AS $$
  BEGIN
    INSERT INTO public.team_members (team_id, profile_id, role) VALUES (NEW.id, NEW.owner_id, 'admin');
    RETURN NEW;
  END; $$;
  CREATE TRIGGER on_team_created AFTER INSERT ON public.teams FOR EACH ROW EXECUTE FUNCTION public.handle_new_team();
  CREATE TABLE public.repertorios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    name text NOT NULL, created_by uuid REFERENCES public.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    public_token uuid UNIQUE, is_public boolean NOT NULL DEFAULT false
  );
  CREATE TABLE public.repertorio_songs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    repertorio_id uuid NOT NULL REFERENCES public.repertorios(id) ON DELETE CASCADE,
    song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
    sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (repertorio_id, song_id)
  );
  CREATE TABLE public.song_tracks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
    track_name text NOT NULL, audio_path text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.song_loop_points (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    label text NOT NULL DEFAULT 'Loop', start_time real NOT NULL, end_time real NOT NULL,
    is_public boolean NOT NULL DEFAULT false, repeat_count integer NOT NULL DEFAULT 0,
    sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.channels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    name text NOT NULL, description text, created_by uuid REFERENCES public.profiles(id),
    sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    culto_id uuid REFERENCES public.cultos(id) ON DELETE CASCADE,
    sender_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content text, created_at timestamptz NOT NULL DEFAULT now(),
    channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE,
    message_type text NOT NULL DEFAULT 'text', attachment_path text
  );
  -- Para as migrações da conformidade (exclusão de conta, chat): convites, aparelhos,
  -- pedidos de entrada e o Storage (os arquivos do seed ficam no store em memória).
  CREATE TABLE public.team_invites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE, email text NOT NULL,
    role public.team_role NOT NULL DEFAULT 'viewer', token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    accepted boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.device_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, token text NOT NULL UNIQUE);
  CREATE TABLE public.team_join_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending', decided_by uuid REFERENCES public.profiles(id), UNIQUE (team_id, profile_id));
  CREATE SCHEMA storage;
  GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL,
    name text NOT NULL, owner uuid, UNIQUE (bucket_id, name));
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
`);
// Migrações reais: código da equipe + handle_new_user, notas dos loops, avisos/missões do
// Asafe (triggers em cultos/escala/repertório) e o catálogo com os seis campos obrigatórios.
await db.exec(await migration('20260627020000_team_join_codes.sql'));
await db.exec('CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();');
await db.exec(await migration('20260927120000_song_loop_notes.sql'));
await db.exec(await migration('20260929120000_assistant_notifications.sql'));
await db.exec(await migration('20260930010000_platform_admin_and_support.sql'));
await db.exec(await migration('20260930120000_assistant_missions.sql'));

// Produção hoje (cadastro de músicas aprovado, não publicado): o preflight recusa antes de
// gravar e diz exatamente o que falta.
const catalog = '20260930200000_song_registration_catalog.sql';
const gapsBefore = await findSchemaGaps({ store: pgliteStore() });
eq(gapsBefore.map((gap) => [gap.kind, `${gap.table}.${gap.column}`, gap.migration]),
  ['audio_revision', 'draft_repertorio_ids', 'is_draft', 'recording_source_url'].map((column) => ['column', `songs.${column}`, catalog]),
  'preflight aponta as colunas do cadastro de músicas');
await assert.rejects(preflightSchema({ store: pgliteStore() }), new RegExp(`songs: colunas .*is_draft.* → ${catalog}`)); checks++;
eq((await sql(`SELECT count(*)::int AS n FROM auth.users`))[0].n, 0, 'nada gravado pelo preflight');
await db.exec(await migration(catalog));
// E as migrações da conformidade com as lojas (20261003*), na ordem do deploy: a demo
// roda sobre o schema que vai para a produção junto com ela.
for (const name of (await readdir(new URL('../migrations/', import.meta.url))).filter((n) => n >= '20261003' && n.endsWith('.sql')).sort()) {
  await db.exec(await migration(name));
}

/** O que o supabase-js faria com a service_role, em SQL. Storage fica em memória. */
function pgliteStore() {
  const storage = new Map();
  const ident = (name) => { assert.match(name, /^[a-z_]+$/); return `"${name}"`; };
  const where = (filters = {}, params) => Object.entries(filters).map(([column, value]) => {
    params.push(Array.isArray(value) ? value.map(String) : String(value));
    return Array.isArray(value)
      ? `${ident(column)}::text = ANY($${params.length}::text[])`
      : `${ident(column)}::text = $${params.length}`;
  }).join(' AND ') || 'true';
  const service = (fn) => withRole(db, 'service_role', null, fn);
  const insertRow = (tx, table, row, conflict) => {
    const cols = Object.keys(row).map(ident).join(', ');
    let text = `INSERT INTO public.${ident(table)} (${cols}) SELECT ${cols} FROM json_populate_record(NULL::public.${ident(table)}, $1::json)`;
    if (conflict) {
      const keys = conflict.split(',');
      const updates = Object.keys(row).filter((col) => !keys.includes(col)).map((col) => `${ident(col)} = EXCLUDED.${ident(col)}`);
      text += ` ON CONFLICT (${keys.map(ident).join(', ')}) DO UPDATE SET ${updates.join(', ')}`;
    }
    return tx.query(text, [JSON.stringify(row)]);
  };
  return {
    storage,
    async listUsersByEmail(emails) {
      return sql(`SELECT id::text, lower(email) AS email, raw_app_meta_data AS app_metadata FROM auth.users
        WHERE lower(email) = ANY($1::text[])`, [emails.map((e) => e.toLowerCase())]);
    },
    async createUser({ email, password, email_confirm, user_metadata, app_metadata }) {
      eq(email_confirm, true, 'contas nascem confirmadas (sem e-mail)');
      const [row] = await sql(`INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data)
        VALUES (gen_random_uuid(), $1, $2, now(), $3::jsonb, $4::jsonb) RETURNING id::text`,
        [email, password ? `hash:${password.length}` : null, JSON.stringify(user_metadata), JSON.stringify(app_metadata)]);
      return { id: row.id };
    },
    async deleteUser(id) { await sql('DELETE FROM auth.users WHERE id = $1', [id]); },
    async select(table, columns, filters) {
      const params = [];
      const cols = columns.split(',').map((c) => ident(c.trim())).join(', ');
      return service(async (tx) => (await tx.query(`SELECT ${cols} FROM public.${ident(table)} WHERE ${where(filters, params)}`, params)).rows);
    },
    // Como o select(...).limit(0) do PostgREST: o Postgres confere as colunas sem trazer linhas.
    async probe(table, columns) {
      const cols = columns.length ? columns.map(ident).join(', ') : '*';
      try {
        await service((tx) => tx.query(`SELECT ${cols} FROM public.${ident(table)} LIMIT 0`));
        return null;
      } catch (error) {
        return error.message;
      }
    },
    async insert(table, rows) { await service(async (tx) => { for (const row of rows) await insertRow(tx, table, row); }); },
    async upsert(table, rows, onConflict) { await service(async (tx) => { for (const row of rows) await insertRow(tx, table, row, onConflict); }); },
    async remove(table, filters) {
      assert.ok(Object.keys(filters).length, 'delete sem filtro');
      const params = [];
      await service((tx) => tx.query(`DELETE FROM public.${ident(table)} WHERE ${where(filters, params)}`, params));
    },
    async upload(bucket, path, bytes, contentType) { storage.set(`${bucket}/${path}`, { size: bytes.length, contentType }); },
    async listFiles(bucket, prefix) {
      return [...storage.keys()].filter((key) => key.startsWith(`${bucket}/${prefix}/`)).map((key) => key.slice(bucket.length + 1));
    },
    async removeFiles(bucket, paths) { paths.forEach((path) => storage.delete(`${bucket}/${path}`)); },
  };
}

const store = pgliteStore();
const log = { info() {}, warn() {}, error() {}, addSecret() {} };
const saved = [];
const run = (fn, account = APPLE) => fn({ store, account, log, now: new Date(), uuid: () => crypto.randomUUID(),
  password: 'Abcd-Efgh-2345-Jkmn', saveCredentials: async (state) => { saved.push(state); }, loadBytes: async () => new Uint8Array(32) });

try {
  // Com todas as migrações, nenhuma coluna do plano falta.
  eq(await findSchemaGaps({ store }), [], 'preflight passa no schema completo');

  // Uma pessoa e uma equipe reais que o reset não pode tocar.
  const [outsider] = await sql(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (gen_random_uuid(), 'pessoa@example.test', '{"full_name":"Pessoa Real"}') RETURNING id::text`);
  const [outsiderProfile] = await sql('SELECT id::text FROM public.profiles WHERE user_id = $1', [outsider.id]);
  const [realTeam] = await sql(`INSERT INTO public.teams (name, owner_id) VALUES ($1, $2) RETURNING id::text`, [DEMO_TEAM_NAME, outsiderProfile.id]);
  await sql(`INSERT INTO public.songs (team_id, title, created_by) VALUES ($1, 'Música real', $2)`, [realTeam.id, outsiderProfile.id]);

  const created = await run(applyDemo);
  eq(created.status, 'created');
  const team = created.teamId;
  eq(saved.at(-1), { status: 'ready', team_id: team }, 'credenciais marcadas como prontas');
  eq(saved[0], { status: 'pending', team_id: null }, 'senha gravada antes de criar a conta');

  // Contas, perfis e equipe.
  const users = await sql(`SELECT email, raw_app_meta_data->>'${REVIEW_MARKER}' AS marker, encrypted_password IS NOT NULL AS has_password,
    email_confirmed_at IS NOT NULL AS confirmed FROM auth.users WHERE email LIKE '%revisao@maislouvor.com' ORDER BY email`);
  eq(users.length, PEOPLE.length);
  ok(users.every((u) => u.marker === 'true' && u.confirmed), 'marca e e-mail confirmado');
  eq(users.filter((u) => u.has_password).map((u) => u.email), [LEADER.email], 'só o líder faz login');
  eq((await sql('SELECT count(*)::int AS n FROM public.profiles WHERE phone IS NOT NULL AND user_id IN (SELECT id FROM auth.users WHERE email LIKE $1)', ['%revisao@maislouvor.com']))[0].n, 0);
  const members = await sql(`SELECT p.full_name, tm.role::text, tm.instruments FROM public.team_members tm
    JOIN public.profiles p ON p.id = tm.profile_id WHERE tm.team_id = $1 ORDER BY tm.role, p.full_name`, [team]);
  eq(members.length, PEOPLE.length);
  eq(members.filter((m) => m.role === 'admin').map((m) => m.full_name), [LEADER.fullName]);
  eq(members.find((m) => m.full_name === LEADER.fullName).instruments, LEADER.instruments, 'upsert completa o admin do trigger');
  const [teamRow] = await sql('SELECT t.name, t.join_code IS NOT NULL AS code, u.email FROM public.teams t JOIN public.profiles p ON p.id = t.owner_id JOIN auth.users u ON u.id = p.user_id WHERE t.id = $1', [team]);
  eq(teamRow, { name: DEMO_TEAM_NAME, code: true, email: LEADER.email });

  // Asafe: sem grupo, equipe suspensa, avisos desligados e nada na fila.
  const [leaderUser] = await sql('SELECT id::text FROM auth.users WHERE email = $1', [LEADER.email]);
  const [anaUser] = await sql('SELECT id::text FROM auth.users WHERE email = $1', [MEMBERS[0].email]);
  const overview = await withRole(db, 'authenticated', leaderUser.id, async (tx) =>
    (await tx.query('SELECT public.assistant_team_overview($1) AS r', [team])).rows[0].r);
  eq([overview.team_enabled, overview.groups], [false, []]);
  eq(Object.values((await sql('SELECT public.assistant_notice_options($1) AS r', [team]))[0].r), [false, false, false, false, false]);
  eq((await sql('SELECT count(*)::int AS n FROM public.assistant_outbox WHERE team_id = $1', [team]))[0].n, 0);
  eq((await sql('SELECT count(*)::int AS n FROM public.assistant_wa_identities'))[0].n, 0);

  // Catálogo: as seis músicas passam na regra de cadastro completo, para o líder e para o editor.
  const songs = await sql(`SELECT title, public.song_registration_complete(title, artist, coalesce(nullif(btrim(key_current), ''), key_original),
    theme, audio_path, cifra_text, is_draft) AS complete FROM public.songs WHERE team_id = $1`, [team]);
  eq(songs.length, 6);
  ok(songs.every((s) => s.complete), 'todas completas');
  for (const user of [leaderUser.id, anaUser.id]) {
    const page = await withRole(db, 'authenticated', user, async (tx) =>
      (await tx.query(`SELECT public.search_song_catalog($1, NULL, '', '', '', '', 'title', 1, 24) AS r`, [team])).rows[0].r);
    eq(page.total, 6, 'catálogo da equipe');
  }
  const artists = await withRole(db, 'authenticated', leaderUser.id, async (tx) =>
    (await tx.query(`SELECT value FROM public.song_catalog_facets($1, 'artist', '')`, [team])).rows.map((r) => r.value));
  eq(artists, ['Admiral Bob', 'Equipe Demonstração']);
  const [rep] = await sql('INSERT INTO public.repertorios (team_id, name) VALUES ($1, $2) RETURNING id::text', [team, 'Teste do revisor']);
  const added = await withRole(db, 'authenticated', leaderUser.id, async (tx) =>
    (await tx.query(`SELECT public.add_complete_songs_to_repertorio($1, (SELECT array_agg(id) FROM public.songs WHERE team_id = $2)) AS n`, [rep.id, team])).rows[0].n);
  eq(added, 6, 'o líder consegue montar um repertório com todas');

  // Conteúdo.
  const count = async (table, column = 'team_id', value = team) => (await sql(`SELECT count(*)::int AS n FROM public.${table} WHERE ${column} = $1`, [value]))[0].n;
  const [baby] = await sql(`SELECT id::text, audio_path, stems_status, media_url FROM public.songs WHERE team_id = $1 AND title = 'Baby Bird (demo)'`, [team]);
  eq(baby.stems_status, 'done');
  eq((await sql('SELECT track_name FROM public.song_tracks WHERE song_id = $1 ORDER BY sort_order', [baby.id])).map((r) => r.track_name),
    ['Vocais', 'Bateria', 'Baixo', 'Violão', 'Teclado']);
  eq(await count('song_loop_points', 'song_id', baby.id), 2);
  ok((await sql('SELECT bool_and(notes IS NOT NULL) AS ok FROM public.song_loop_points WHERE song_id = $1', [baby.id]))[0].ok, 'loops com anotação');
  eq(await count('repertorios'), 2);
  const today = localDateISO(new Date());
  const cultos = await sql(`SELECT c.name, c.date::text AS date, (SELECT count(*)::int FROM public.culto_lineup l WHERE l.culto_id = c.id) AS lineup,
    (SELECT count(*)::int FROM public.culto_songs s WHERE s.culto_id = c.id) AS songs FROM public.cultos c WHERE c.team_id = $1 ORDER BY c.date`, [team]);
  eq(cultos.map((c) => [c.name, c.lineup, c.songs]), [['Culto de Domingo', 5, 4], ['Culto de Celebração', 4, 3]]);
  ok(cultos.every((c) => c.date > today), 'cultos no futuro');
  eq((await sql(`SELECT count(*)::int AS n FROM public.member_availability a JOIN public.team_members tm ON tm.id = a.team_member_id
    WHERE tm.team_id = $1 AND a.available_date > $2::date`, [team, today]))[0].n, 7);
  eq((await sql('SELECT count(*)::int AS n FROM public.messages WHERE team_id = $1 AND channel_id IS NULL AND culto_id IS NULL', [team]))[0].n, 8);
  eq(await count('channels'), 1);
  eq(await count('notifications'), 2);
  eq(store.storage.size, 11);
  ok((await sql('SELECT audio_path FROM public.songs WHERE team_id = $1', [team])).every((s) => store.storage.has(`audio/${s.audio_path}`)), 'áudio de cada música no Storage');

  // Rodar de novo não duplica.
  eq((await run(applyDemo)).status, 'exists');
  eq((await sql('SELECT count(*)::int AS n FROM public.songs WHERE team_id = $1', [team]))[0].n, 6);

  // Apagar o dono direto falha: teams.owner_id é RESTRICT desde a exclusão de conta
  // (antes, apagava a equipe inteira). Por isso o reset apaga a equipe antes das contas.
  await assert.rejects(sql('DELETE FROM auth.users WHERE email = $1', [LEADER.email]), (error) => error.code === '23503'); checks++;

  // O revisor exclui a conta pelo app, como as notas de revisão pedem: passa a equipe
  // para a Ana (transfer_team_ownership) e exclui (delete_account_data + GoTrue). A
  // equipe continua com a Ana, a conta de revisão fica pela metade e o reset limpa.
  const [anaProfile] = await sql('SELECT id::text FROM public.profiles WHERE user_id = $1', [anaUser.id]);
  await withRole(db, 'authenticated', leaderUser.id, (tx) => tx.query('SELECT public.transfer_team_ownership($1, $2)', [team, anaProfile.id]));
  const removed = await withRole(db, 'service_role', null, async (tx) =>
    (await tx.query('SELECT public.delete_account_data($1) AS r', [leaderUser.id])).rows[0].r);
  eq([removed.deleted, removed.left_team_count], [true, 1], 'exclusão pelo app: sai da equipe');
  await sql('DELETE FROM auth.users WHERE id = $1', [leaderUser.id]);
  eq(await count('songs'), 6, 'a equipe continua com a nova dona');
  await assert.rejects(run(applyDemo), /--reset/); checks++;
  const reset = await run(resetDemo);
  eq(reset.users.length, MEMBERS.length);
  eq(await count('songs'), 0, 'o reset apaga a equipe que ficou com a Ana');
  eq((await sql(`SELECT count(*)::int AS n FROM auth.users WHERE email LIKE '%revisao@maislouvor.com'`))[0].n, 0);
  const recreated = await run(applyDemo);
  eq(recreated.status, 'created');
  ok(recreated.teamId !== team, 'equipe nova');

  // Reset completo com tudo no lugar (equipe primeiro, depois as contas: sem violar FKs NO ACTION).
  store.storage.set(`chat/${recreated.teamId}/foto.jpg`, { size: 1 });
  await run(resetDemo);
  eq((await sql('SELECT count(*)::int AS n FROM public.teams WHERE id = $1', [recreated.teamId]))[0].n, 0);
  ok(![...store.storage.keys()].some((key) => key.includes(recreated.teamId)), 'Storage da equipe limpo');
  eq((await sql('SELECT count(*)::int AS n FROM public.profiles p JOIN auth.users u ON u.id = p.user_id WHERE u.email LIKE $1', ['%revisao@maislouvor.com']))[0].n, 0);

  // A pessoa real, a equipe dela (mesmo nome) e a música continuam lá.
  eq((await sql('SELECT count(*)::int AS n FROM public.teams WHERE id = $1', [realTeam.id]))[0].n, 1);
  eq(await count('songs', 'team_id', realTeam.id), 1);
  eq((await sql('SELECT count(*)::int AS n FROM auth.users WHERE id = $1', [outsider.id]))[0].n, 1);

  // Uma conta por loja: o reset da Apple não toca na conta nem na equipe do Google.
  const google = await run(applyDemo, GOOGLE);
  eq(google.status, 'created');
  const apple = await run(applyDemo, APPLE);
  const googleUsers = await sql('SELECT id::text FROM auth.users WHERE email = ANY($1) ORDER BY id', [GOOGLE.emails]);
  eq(googleUsers.length, GOOGLE.people.length);
  eq((await sql('SELECT name FROM public.teams WHERE id = $1', [google.teamId]))[0].name, GOOGLE.teamName);
  eq((await run(resetDemo, APPLE)).teams, [apple.teamId]);
  eq(await sql('SELECT id::text FROM auth.users WHERE email = ANY($1) ORDER BY id', [GOOGLE.emails]), googleUsers, 'contas do Google intactas');
  eq(await count('songs', 'team_id', google.teamId), 6, 'equipe do Google intacta');
  eq((await sql('SELECT count(*)::int AS n FROM auth.users WHERE email = ANY($1)', [APPLE.emails]))[0].n, 0);
  await run(resetDemo, GOOGLE);

  // Conta com e-mail de revisão sem a marca: nada é apagado.
  await sql(`INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), $1)`, [MEMBERS[1].email]);
  await assert.rejects(run(resetDemo), /sem a marca/); checks++;
  await assert.rejects(run(applyDemo), /sem a marca/); checks++;
  eq((await sql('SELECT count(*)::int AS n FROM auth.users WHERE email = $1', [MEMBERS[1].email]))[0].n, 1);

  console.log(`review_demo_seed: ${checks} verificações ok`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.close();
}
