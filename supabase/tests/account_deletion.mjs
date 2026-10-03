// Exclusão de conta: FKs, prévia, transferência de propriedade, exclusão atômica e permissões.
// Roda num PostgreSQL em memória (PGlite), nunca na produção:
//   PGLITE_MODULE=/caminho/@electric-sql/pglite/dist/index.js node supabase/tests/account_deletion.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const file = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const MIGRATION = await file('../migrations/20261003130000_account_deletion.sql');

const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// Pessoas: dono da equipe A (Olga), líder sem ser dono da equipe B (Lia), dono rebaixado
// da equipe B (Xavier), membros, a Sara (único membro da equipe C e editora da A) e alguém de fora.
const names = ['olga', 'mario', 'mel', 'sara', 'lia', 'xavier', 'vera', 'ulisses', 'semperfil'];
const user = Object.fromEntries(names.map((n, i) => [n, id(1, i + 1)]));
const prof = Object.fromEntries(names.map((n, i) => [n, id(2, i + 1)]));
const team = { a: id(3, 1), b: id(3, 2), c: id(3, 3) };
const song = { aBySara: id(4, 1), cBySara: id(4, 2), aByOlga: id(4, 3) };
const culto = { a: id(5, 1), c: id(5, 2) };
const rep = { a: id(6, 1) };
const sharedSong = id(7, 1);

let checks = 0;
const check = (actual, expected, label = 'valor diferente') => { assert.deepEqual(actual, expected, label); checks++; };
const ok = (value, label = 'condição falsa') => { assert.ok(value, label); checks++; };
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const count = async (sql, params) => Number((await one(sql, params)).n);

/** Executa fn numa transação com o papel e o auth.uid() só dela (rollback se falhar). */
const as = (role, uid, fn) => db.transaction(async (tx) => {
  await tx.exec(`SET LOCAL ROLE ${role}`);
  await tx.query(`SELECT set_config('test.uid', $1, true)`, [uid ?? '']);
  return fn(tx);
});
const call = (role, uid, sql, params) => as(role, uid, async (tx) => (await tx.query(sql, params)).rows[0]?.r);
const service = (sql, params) => call('service_role', null, sql, params);
const preview = (uid) => service('SELECT public.account_deletion_preview_for($1) AS r', [uid]);
const fails = async (promise, code, label) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `${label}: ${error.message}`);
    return true;
  });
  checks++;
};
const fkAction = async (table, column) => (await one(`
  SELECT c.confdeltype AS action FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  WHERE c.contype = 'f' AND c.conrelid = $1::regclass AND a.attname = $2`, [table, column]))?.action;

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, created_at timestamptz DEFAULT now(),
      last_sign_in_at timestamptz, email_confirmed_at timestamptz, raw_user_meta_data jsonb DEFAULT '{}');
    -- Storage antigo: owner ainda com FK para auth.users (versões novas não têm).
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL,
      name text NOT NULL, owner uuid REFERENCES auth.users(id), owner_id text, UNIQUE (bucket_id, name));
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  `);
  await db.exec(await file('fixtures/core_schema_20260927.sql'));
  // O que a produção tem e o recorte não traz (mesmas FKs das migrations).
  await db.exec(`
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    CREATE TABLE public.repertorios (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE, name text NOT NULL,
      created_by uuid REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.repertorio_songs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      repertorio_id uuid NOT NULL REFERENCES public.repertorios(id) ON DELETE CASCADE,
      song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE, sort_order integer NOT NULL DEFAULT 0);
    CREATE TABLE public.team_invites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE, email text NOT NULL,
      role public.team_role NOT NULL DEFAULT 'viewer', token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
      accepted boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.channels (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE, name text NOT NULL,
      created_by uuid REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
      culto_id uuid REFERENCES public.cultos(id) ON DELETE CASCADE,
      sender_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, content text,
      created_at timestamptz NOT NULL DEFAULT now(), channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE,
      message_type text NOT NULL DEFAULT 'text', attachment_path text);
    CREATE TABLE public.song_loop_points (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
      profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      start_time real NOT NULL, end_time real NOT NULL, is_public boolean NOT NULL DEFAULT false);
    CREATE TABLE public.device_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, token text NOT NULL UNIQUE);
    CREATE TABLE public.push_subscriptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, endpoint text NOT NULL UNIQUE);
    CREATE TABLE public.team_join_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
      profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'pending', decided_by uuid REFERENCES public.profiles(id), UNIQUE (team_id, profile_id));
    -- Deriva simulada: tabela só de produção com FKs sem ação de exclusão.
    CREATE TABLE public.legacy_song_reviews (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      song_id uuid REFERENCES public.songs(id) ON DELETE CASCADE,
      reviewer uuid REFERENCES public.profiles(id), reviewer_user uuid REFERENCES auth.users(id));
  `);
  for (const name of ['20260928120000_whatsapp_assistant.sql', '20260929120000_assistant_notifications.sql',
    '20260930010000_platform_admin_and_support.sql', '20260930120000_assistant_missions.sql']) {
    await db.exec(await file(`../migrations/${name}`));
  }

  // Antes da migração: apagar o autor de uma música falha e apagar o dono apaga a equipe.
  check(await fkAction('public.songs', 'created_by'), 'a', 'songs.created_by sem ação antes');
  check(await fkAction('public.teams', 'owner_id'), 'c', 'teams.owner_id em cascata antes');

  // Conferência somente leitura (rodada na produção antes de aplicar): antes e depois.
  const preflight = await file('../setup/account-deletion-preflight.sql');
  const snapshot = () => rows(`SELECT conname, confdeltype FROM pg_constraint WHERE contype = 'f' ORDER BY conname`);
  const before = await snapshot();
  await db.exec(preflight);
  check(await snapshot(), before, 'preflight não altera nada');

  await db.exec(MIGRATION);
  await db.exec(MIGRATION); // idempotente
  await db.exec(preflight); checks++;
  for (const [table, column] of [['songs', 'created_by'], ['repertorios', 'created_by'], ['cultos', 'created_by'],
    ['channels', 'created_by'], ['culto_songs', 'notes_author_id'], ['notifications', 'sender_profile_id'],
    ['team_join_requests', 'decided_by'], ['legacy_song_reviews', 'reviewer'], ['legacy_song_reviews', 'reviewer_user']]) {
    check(await fkAction(`public.${table}`, column), 'n', `${table}.${column} -> SET NULL`);
  }
  check(await fkAction('public.teams', 'owner_id'), 'r', 'teams.owner_id -> RESTRICT');
  check(await count(`SELECT count(*) AS n FROM pg_constraint WHERE conrelid = 'public.teams'::regclass AND contype = 'f'`), 1, 'uma FK só em teams');

  // ----- dados -----
  await db.exec(`
    INSERT INTO auth.users(id, email) VALUES ${names.map((n) => `('${user[n]}', '${n}@example.test')`).join(', ')};
    UPDATE auth.users SET email = 'Sara@Example.test' WHERE id = '${user.sara}';
    INSERT INTO public.profiles(id, user_id, full_name, phone, avatar_url) VALUES
      ${names.filter((n) => n !== 'semperfil').map((n) => `('${prof[n]}', '${user[n]}', '${n[0].toUpperCase()}${n.slice(1)}', '1199999000${names.indexOf(n)}', NULL)`).join(', ')};
    UPDATE public.profiles SET avatar_url = 'https://api.example.test/storage/v1/object/public/avatars/legado/sara.png?t=1'
      WHERE id = '${prof.sara}';
    INSERT INTO public.teams(id, name, owner_id) VALUES
      ('${team.a}', 'Louvor Sede', '${prof.olga}'), ('${team.b}', 'Louvor Jovem', '${prof.xavier}'),
      ('${team.c}', 'Projeto da Sara', '${prof.sara}');
    INSERT INTO public.team_members(team_id, profile_id, role, permissions) VALUES
      ('${team.a}', '${prof.olga}', 'admin', '{}'), ('${team.a}', '${prof.mario}', 'editor', '{"membros":{"editar":true}}'),
      ('${team.a}', '${prof.mel}', 'viewer', '{}'), ('${team.a}', '${prof.sara}', 'editor', '{}'),
      ('${team.b}', '${prof.lia}', 'admin', '{}'), ('${team.b}', '${prof.xavier}', 'viewer', '{}'),
      ('${team.b}', '${prof.vera}', 'editor', '{}'),
      ('${team.c}', '${prof.sara}', 'admin', '{}');
    INSERT INTO public.songs(id, team_id, title, created_by) VALUES
      ('${song.aBySara}', '${team.a}', 'Bondade de Deus', '${prof.sara}'),
      ('${song.aByOlga}', '${team.a}', 'Grande é o Senhor', '${prof.olga}'),
      ('${song.cBySara}', '${team.c}', 'Rascunho da Sara', '${prof.sara}');
    INSERT INTO public.cultos(id, team_id, name, date, created_by) VALUES
      ('${culto.a}', '${team.a}', 'Culto de domingo', current_date + 3, '${prof.sara}'),
      ('${culto.c}', '${team.c}', 'Ensaio solo', current_date + 3, '${prof.sara}');
    INSERT INTO public.repertorios(id, team_id, name, created_by) VALUES ('${rep.a}', '${team.a}', 'Domingo', '${prof.sara}');
    INSERT INTO public.repertorio_songs(repertorio_id, song_id) VALUES ('${rep.a}', '${song.aBySara}');
    INSERT INTO public.culto_songs(id, culto_id, song_id, notes, notes_author_id) VALUES
      ('${sharedSong}', '${culto.a}', '${song.aBySara}', 'Entrar só no refrão', '${prof.sara}');
    INSERT INTO public.culto_lineup(culto_id, team_member_id, instrument)
      SELECT '${culto.a}', id, 'Voz' FROM public.team_members WHERE team_id = '${team.a}' AND profile_id IN ('${prof.sara}', '${prof.mel}');
    INSERT INTO public.member_availability(team_member_id, available_date)
      SELECT id, current_date + 3 FROM public.team_members WHERE profile_id IN ('${prof.sara}', '${prof.mel}');
    INSERT INTO public.channels(team_id, name, created_by) VALUES ('${team.a}', 'Avisos', '${prof.sara}');
    INSERT INTO public.messages(team_id, sender_profile_id, content, message_type, attachment_path) VALUES
      ('${team.a}', '${prof.sara}', 'Bom dia!', 'text', NULL),
      ('${team.a}', '${prof.sara}', NULL, 'audio', '${team.a}/1-voz.webm'),
      ('${team.a}', '${prof.sara}', NULL, 'image', '${team.a}/2-cifra.jpg'),
      ('${team.a}', '${prof.mel}', 'Amém', 'text', NULL),
      ('${team.a}', '${prof.mel}', NULL, 'image', '${team.a}/3-mel.jpg'),
      ('${team.c}', '${prof.sara}', 'Lembrete', 'text', NULL);
    INSERT INTO public.notifications(profile_id, type, title, team_id, sender_profile_id) VALUES
      ('${prof.sara}', 'lineup', 'Você foi escalada', '${team.a}', '${prof.olga}'),
      ('${prof.mel}', 'chat', 'Sara mandou mensagem', '${team.a}', '${prof.sara}');
    INSERT INTO public.device_tokens(profile_id, token) VALUES ('${prof.sara}', 'fcm-token-da-sara-123');
    INSERT INTO public.push_subscriptions(profile_id, endpoint) VALUES ('${prof.sara}', 'https://push.example.test/sara');
    INSERT INTO public.song_loop_points(song_id, profile_id, start_time, end_time, is_public) VALUES
      ('${song.aBySara}', '${prof.sara}', 1, 2, true), ('${song.aBySara}', '${prof.mel}', 3, 4, false);
    INSERT INTO public.team_join_requests(team_id, profile_id, status, decided_by) VALUES
      ('${team.b}', '${prof.sara}', 'pending', NULL), ('${team.c}', '${prof.ulisses}', 'rejected', '${prof.sara}'),
      ('${team.a}', '${prof.ulisses}', 'rejected', '${prof.sara}');
    INSERT INTO public.team_invites(team_id, email, accepted) VALUES
      ('${team.b}', 'sara@example.TEST', false), ('${team.a}', 'sara@example.test', true),
      ('${team.b}', 'novo@example.test', false);
    INSERT INTO public.legacy_song_reviews(song_id, reviewer, reviewer_user) VALUES ('${song.aByOlga}', '${prof.sara}', '${user.sara}');
    INSERT INTO public.assistant_groups(id, group_jid, team_id, activated_by) VALUES
      ('${id(8, 1)}', '120363000000000001@g.us', '${team.a}', '${prof.sara}');
    INSERT INTO public.assistant_wa_identities(wa_id, profile_id, source) VALUES ('5511999990003', '${prof.sara}', 'phone');
    INSERT INTO public.assistant_link_codes(code, profile_id, expires_at) VALUES ('K7Q2PD', '${prof.sara}', now() + interval '1 hour');
    INSERT INTO public.assistant_member_usage_daily(team_id, profile_id, day, requests) VALUES ('${team.a}', '${prof.sara}', current_date, 3);
    INSERT INTO public.assistant_messages(group_jid, team_id, profile_id, direction, body) VALUES
      ('120363000000000001@g.us', '${team.a}', '${prof.sara}', 'in', 'qual o repertório de domingo?'),
      ('120363000000000001@g.us', '${team.a}', '${prof.sara}', 'out', 'Domingo: Bondade de Deus.'),
      ('120363000000000001@g.us', '${team.a}', '${prof.mel}', 'in', 'quem toca bateria?');
    INSERT INTO public.support_tickets(requester_profile_id, team_id, category, title, description) VALUES
      ('${prof.sara}', '${team.a}', 'bug', 'Áudio não toca', 'O áudio da música não toca no celular da equipe.');
    INSERT INTO storage.objects(bucket_id, name, owner) VALUES
      ('avatars', '${user.sara}/avatar.webp', '${user.olga}'),
      ('avatars', 'legado/sara.png', NULL),
      ('avatars', '${user.mel}/avatar.webp', '${user.sara}'),
      ('chat', '${team.a}/1-voz.webm', '${user.sara}'),
      ('chat', '${team.a}/2-cifra.jpg', NULL),
      ('chat', '${team.a}/3-mel.jpg', '${user.mel}'),
      ('chat', '${team.b}/9-avulso.jpg', '${user.sara}'),
      ('chat', '${team.c}/4-solo.jpg', '${user.sara}'),
      ('audio', '${team.a}/${song.aBySara}.mp3', '${user.sara}'),
      ('audio', '${team.c}/${song.cBySara}.mp3', '${user.sara}'),
      ('audio', '${team.c}/${song.cBySara}/tracks/voz.mp3', NULL),
      ('audio', '_ytcache/abc123.mp3', NULL),
      ('covers', '${team.c}/${song.cBySara}.jpg', '${user.sara}'),
      ('covers', '${team.a}/${song.aBySara}.jpg', '${user.sara}');
  `);

  // ----- permissões -----
  const allFns = ['get_account_deletion_preview()', `transfer_team_ownership('${team.a}', '${prof.mel}')`,
    `account_deletion_preview_for('${user.sara}')`, `account_deletion_storage_objects('${user.sara}')`,
    `delete_account_data('${user.sara}')`, `account_deletion_release_storage_owner('${user.sara}')`];
  for (const fn of allFns) await fails(call('anon', null, `SELECT public.${fn} AS r`), '42501', `anon ${fn}`);
  for (const fn of allFns.slice(2)) await fails(call('authenticated', user.sara, `SELECT public.${fn} AS r`), '42501', `authenticated ${fn}`);
  await fails(call('service_role', null, `SELECT public.account_deletion_release_storage_owner('${user.sara}') AS r`), '42501', 'release só interno');
  await fails(call('authenticated', null, 'SELECT public.get_account_deletion_preview() AS r'), '42501', 'sem sessão');

  // ----- prévia -----
  const mine = await call('authenticated', user.sara, 'SELECT public.get_account_deletion_preview() AS r');
  check(mine, await preview(user.sara), 'a RPC do app devolve a prévia da própria pessoa');
  check(mine.has_profile, true);
  check(mine.can_delete, true, 'Sara pode excluir');
  check(mine.teams.map((t) => [t.team_name, t.action, t.role, t.is_owner, t.member_count]),
    [['Louvor Sede', 'leave', 'editor', false, 4], ['Projeto da Sara', 'delete_team', 'admin', true, 1]]);
  check(mine.teams.every((t) => t.candidates.length === 0), true, 'sem candidatos quando não bloqueia');
  check(mine.personal, { chat_messages: 4, support_tickets: 1 });

  const olga = await preview(user.olga);
  check([olga.can_delete, olga.teams.length, olga.teams[0].action], [false, 1, 'transfer_required']);
  check(olga.teams[0].candidates.map((c) => [c.full_name, c.role]), [['Mario', 'editor'], ['Sara', 'editor'], ['Mel', 'viewer']],
    'candidatos: líderes, editores e membros');

  const lia = await preview(user.lia);
  check([lia.can_delete, lia.teams[0].action, lia.teams[0].candidates.length], [false, 'promote_required', 2]);
  const xavier = await preview(user.xavier);
  check([xavier.can_delete, xavier.teams[0].action, xavier.teams[0].is_owner, xavier.teams[0].role],
    [false, 'transfer_required', true, 'viewer'], 'dono rebaixado ainda precisa transferir');
  check((await preview(user.vera)).teams.map((t) => t.action), ['leave']);
  check(await preview(user.semperfil), { has_profile: false, can_delete: true, teams: [],
    personal: { chat_messages: 0, support_tickets: 0 } }, 'sem perfil');
  check((await preview(user.ulisses)).teams, [], 'sem equipe');

  // ----- transferência de propriedade -----
  const transfer = (uid, teamId, target) => call('authenticated', uid,
    'SELECT public.transfer_team_ownership($1, $2) AS r', [teamId, target]);
  await fails(transfer(user.mario, team.a, prof.mario), '42501', 'quem não é dono não transfere');
  await fails(transfer(user.lia, team.b, prof.vera), '42501', 'líder que não é dono não transfere');
  await fails(transfer(user.olga, team.a, prof.ulisses), '22023', 'destino fora da equipe');
  await fails(transfer(user.olga, team.a, prof.olga), '22023', 'para si mesma');
  await fails(transfer(user.olga, id(3, 9), prof.mel), '42501', 'equipe inexistente');
  await fails(transfer(user.semperfil, team.a, prof.mel), '42501', 'sem perfil');
  check(await transfer(user.olga, team.a, prof.mario), { team_id: team.a, owner_profile_id: prof.mario });
  check(await one(`SELECT t.owner_id, m.role, m.permissions FROM public.teams t
    JOIN public.team_members m ON m.team_id = t.id AND m.profile_id = t.owner_id WHERE t.id = $1`, [team.a]),
    { owner_id: prof.mario, role: 'admin', permissions: {} }, 'novo dono é líder, sem exceções');
  check((await one(`SELECT role FROM public.team_members WHERE team_id = $1 AND profile_id = $2`, [team.a, prof.olga])).role,
    'admin', 'antigo dono continua líder');
  check(await one(`SELECT actor_user_id, action, entity_id, details FROM public.platform_audit_log WHERE action = 'team_ownership_transfer'`),
    { actor_user_id: user.olga, action: 'team_ownership_transfer', entity_id: team.a,
      details: { from_profile_id: prof.olga, to_profile_id: prof.mario, previous_role: 'editor' } });
  check(await count(`SELECT count(*) AS n FROM public.notifications WHERE profile_id = $1 AND type = 'team_ownership'`, [prof.mario]), 1);
  await fails(transfer(user.olga, team.a, prof.mel), '42501', 'quem transferiu deixa de ser dono');
  check((await preview(user.olga)).teams.map((t) => t.action), ['leave'], 'Olga já pode sair');

  // ----- bloqueios -----
  await fails(service('SELECT public.delete_account_data($1) AS r', [user.lia]), '55000', 'único líder bloqueado');
  await fails(service('SELECT public.delete_account_data($1) AS r', [user.xavier]), '55000', 'dono bloqueado');
  check(await count('SELECT count(*) AS n FROM public.profiles WHERE id IN ($1, $2)', [prof.lia, prof.xavier]), 2, 'nada apagado');
  // A FK sozinha também protege a equipe: apagar o usuário dono direto no auth falha.
  await fails(db.query('DELETE FROM auth.users WHERE id = $1', [user.xavier]), '23503', 'RESTRICT no dono');
  check(await count('SELECT count(*) AS n FROM public.team_members WHERE team_id = $1', [team.b]), 3, 'equipe B intacta');

  // ----- arquivos a remover (o que a edge function apaga antes) -----
  const objects = await service('SELECT public.account_deletion_storage_objects($1) AS r', [user.sara]);
  check(objects, [
    { bucket: 'audio', path: `${team.c}/${song.cBySara}.mp3` },
    { bucket: 'audio', path: `${team.c}/${song.cBySara}/tracks/voz.mp3` },
    { bucket: 'avatars', path: `${user.sara}/avatar.webp` },
    { bucket: 'avatars', path: 'legado/sara.png' },
    { bucket: 'chat', path: `${team.a}/1-voz.webm` },
    { bucket: 'chat', path: `${team.a}/2-cifra.jpg` },
    { bucket: 'chat', path: `${team.b}/9-avulso.jpg` },
    { bucket: 'chat', path: `${team.c}/4-solo.jpg` },
    { bucket: 'covers', path: `${team.c}/${song.cBySara}.jpg` },
  ].sort((x, y) => (x.bucket + x.path < y.bucket + y.path ? -1 : 1)), 'só arquivos pessoais e da equipe que some');
  await db.exec('ALTER TABLE storage.objects DROP COLUMN owner_id');
  check(await service('SELECT public.account_deletion_storage_objects($1) AS r', [user.sara]), objects, 'Storage sem owner_id');
  // A edge function remove pela Storage API; aqui, direto na tabela.
  for (const o of objects) await db.query('DELETE FROM storage.objects WHERE bucket_id = $1 AND name = $2', [o.bucket, o.path]);

  // ----- exclusão da Sara -----
  const result = await service('SELECT public.delete_account_data($1) AS r', [user.sara]);
  check(result, { deleted: true, already_deleted: false, deleted_team_ids: [team.c], left_team_count: 1 });
  check(await count('SELECT count(*) AS n FROM public.profiles WHERE id = $1', [prof.sara]), 0, 'perfil apagado');
  check(await count('SELECT count(*) AS n FROM public.teams WHERE id = $1', [team.c]), 0, 'equipe de membro único apagada');
  check(await count('SELECT count(*) AS n FROM public.songs WHERE team_id = $1', [team.c]), 0, 'músicas dela junto');
  check(await count('SELECT count(*) AS n FROM public.messages WHERE team_id = $1', [team.c]), 0, 'chat dela junto');
  check(await rows(`SELECT id, created_by FROM public.songs WHERE team_id = $1 ORDER BY id`, [team.a]),
    [{ id: song.aBySara, created_by: null }, { id: song.aByOlga, created_by: prof.olga }], 'músicas da equipe ficam, sem autora');
  check((await one('SELECT created_by FROM public.cultos WHERE id = $1', [culto.a])).created_by, null);
  check((await one('SELECT created_by FROM public.repertorios WHERE id = $1', [rep.a])).created_by, null);
  check(await count('SELECT count(*) AS n FROM public.repertorio_songs WHERE repertorio_id = $1', [rep.a]), 1, 'repertório intacto');
  check(await one('SELECT notes, notes_author_id FROM public.culto_songs WHERE id = $1', [sharedSong]),
    { notes: 'Entrar só no refrão', notes_author_id: null });
  check((await one(`SELECT created_by FROM public.channels WHERE name = 'Avisos'`)).created_by, null);
  check(await rows('SELECT sender_profile_id, content FROM public.messages ORDER BY content'),
    [{ sender_profile_id: prof.mel, content: 'Amém' }, { sender_profile_id: prof.mel, content: null }], 'só as mensagens dos outros');
  check(await rows('SELECT profile_id, sender_profile_id FROM public.notifications WHERE type <> $1 ORDER BY title', ['team_ownership']),
    [{ profile_id: prof.mel, sender_profile_id: null }], 'aviso que ela mandou fica, sem remetente');
  for (const table of ['device_tokens', 'push_subscriptions', 'assistant_wa_identities', 'assistant_link_codes',
    'assistant_member_usage_daily', 'support_tickets']) {
    check(await count(`SELECT count(*) AS n FROM public.${table}`), 0, `${table} apagado`);
  }
  check(await count('SELECT count(*) AS n FROM public.song_loop_points'), 1, 'só o loop da Mel');
  check(await count('SELECT count(*) AS n FROM public.culto_lineup'), 1, 'escala só da Mel');
  check(await count('SELECT count(*) AS n FROM public.member_availability'), 1, 'disponibilidade só da Mel');
  check(await count('SELECT count(*) AS n FROM public.team_members WHERE team_id = $1', [team.a]), 3, 'saiu da equipe A');
  check(await rows('SELECT body FROM public.assistant_messages'), [{ body: 'quem toca bateria?' }], 'conversas com o Asafe apagadas');
  check((await one('SELECT activated_by FROM public.assistant_groups')).activated_by, null);
  check(await rows('SELECT team_id, decided_by FROM public.team_join_requests ORDER BY team_id'),
    [{ team_id: team.a, decided_by: null }], 'pedido dela some; decisão dela fica sem nome');
  check(await rows('SELECT email FROM public.team_invites'), [{ email: 'novo@example.test' }], 'convites para o e-mail dela');
  check(await one('SELECT reviewer, reviewer_user FROM public.legacy_song_reviews'), { reviewer: null, reviewer_user: user.sara });
  check(await rows(`SELECT bucket_id, name, owner FROM storage.objects ORDER BY bucket_id, name`), [
    { bucket_id: 'audio', name: `${team.a}/${song.aBySara}.mp3`, owner: null },
    { bucket_id: 'audio', name: '_ytcache/abc123.mp3', owner: null },
    { bucket_id: 'avatars', name: `${user.mel}/avatar.webp`, owner: null },
    { bucket_id: 'chat', name: `${team.a}/3-mel.jpg`, owner: user.mel },
    { bucket_id: 'covers', name: `${team.a}/${song.aBySara}.jpg`, owner: null },
  ], 'arquivos da equipe ficam, sem dono');
  check(await one(`SELECT actor_user_id, entity_id, details FROM public.platform_audit_log WHERE action = 'account_deleted'`),
    { actor_user_id: null, entity_id: user.sara, details: { deleted_teams: 1, left_teams: 1 } }, 'registro sem dados pessoais');

  // auth.admin.deleteUser(): com o perfil e o dono do storage desvinculados, não há FK no caminho.
  await db.query('DELETE FROM auth.users WHERE id = $1', [user.sara]);
  check(await one('SELECT reviewer_user FROM public.legacy_song_reviews'), { reviewer_user: null });
  // Repetir é inofensivo (resposta perdida, novo clique).
  check(await service('SELECT public.delete_account_data($1) AS r', [user.sara]),
    { deleted: false, already_deleted: true, deleted_team_ids: [], left_team_count: 0 });
  check(await service('SELECT public.account_deletion_storage_objects($1) AS r', [user.sara]), []);

  // ----- quem estava bloqueado resolve e exclui -----
  // Lia promove a Vera a líder (mesmo update da aba Membros, pela RLS do app) e já pode sair.
  await db.query(`UPDATE public.team_members SET role = 'admin', permissions = '{}' WHERE team_id = $1 AND profile_id = $2`, [team.b, prof.vera]);
  check((await preview(user.lia)).teams.map((t) => t.action), ['leave']);
  check((await service('SELECT public.delete_account_data($1) AS r', [user.lia])).left_team_count, 1);
  // Olga, depois de transferir, sai e a equipe A continua com o Mario.
  check((await service('SELECT public.delete_account_data($1) AS r', [user.olga])).deleted_team_ids, []);
  await db.query('DELETE FROM auth.users WHERE id IN ($1, $2)', [user.lia, user.olga]);
  check(await one('SELECT owner_id FROM public.teams WHERE id = $1', [team.a]), { owner_id: prof.mario });
  check((await one('SELECT created_by FROM public.songs WHERE id = $1', [song.aByOlga])).created_by, null);
  check(await count('SELECT count(*) AS n FROM public.teams'), 2, 'equipes A e B continuam');

  console.log(`${checks} PostgreSQL checks passed: FKs, idempotência, prévia, transferência, bloqueios, arquivos, exclusão atômica, retry e permissões.`);
} finally {
  await db.close();
}
