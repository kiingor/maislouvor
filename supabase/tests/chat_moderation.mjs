// Moderação do chat (20261003132000_chat_moderation.sql) num PostgreSQL em memória.
// Nunca conecte este teste a um servidor.
// PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/chat_moderation.mjs
//
// O recorte de produção (fixtures/core_schema_20260927.sql) não tem o chat: messages,
// channels e o bucket 'chat' são recriados aqui como as migrations os deixaram
// (20260224230359, 20260614140000, 20260626_member_permissions, 20260816120000).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// Usuários (auth.users) e perfis.
const U = { platform: id(1, 1), leader: id(1, 2), leader2: id(1, 3), author: id(1, 4), reporter: id(1, 5), editor: id(1, 6), other: id(1, 7), member2: id(1, 8), outsider: id(1, 9) };
const P = { platform: id(2, 1), leader: id(2, 2), leader2: id(2, 3), author: id(2, 4), reporter: id(2, 5), editor: id(2, 6), other: id(2, 7), member2: id(2, 8), outsider: id(2, 9) };
const team = id(3, 1);
const otherTeam = id(3, 2);

let checks = 0;
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const value = async (sql, params = []) => (await rows(sql, params))[0]?.result;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, ...(message ? [message] : [])); checks++; };
const fails = async (sql, code, params = []) => {
  await assert.rejects(db.query(sql, params), (error) => {
    if (error.code !== code) throw new Error(`esperava ${code}, veio ${error.code}: ${error.message} — ${sql}`);
    return true;
  });
  checks++;
};
const asUser = (uid) => db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('test.uid', '${uid}', false)`);
const asAnon = () => db.exec(`RESET ROLE; SET ROLE anon; SELECT set_config('test.uid', '', false)`);
const asSystem = () => db.exec(`RESET ROLE; SELECT set_config('test.uid', '', false)`);
const sorted = (list) => [...list].sort();

const send = async (uid, content, extra = {}) => {
  await asUser(uid);
  const sender = Object.entries(U).find(([, v]) => v === uid)[0];
  const r = await rows(
    `INSERT INTO public.messages(team_id, sender_profile_id, content, message_type, attachment_path)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, content`,
    [extra.team ?? team, P[sender], content, extra.type ?? 'text', extra.attachment ?? null],
  );
  return r[0];
};
const report = (messageId, reason = 'ofensivo', details = null) =>
  value('SELECT public.report_chat_message($1, $2, $3) AS result', [messageId, reason, details]);
const notificationsFor = async (type) => {
  await asSystem();
  return rows('SELECT profile_id, link, team_id, title, body FROM public.notifications WHERE type = $1 ORDER BY created_at, profile_id', [type]);
};

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, created_at timestamptz DEFAULT now(),
      last_sign_in_at timestamptz, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
    -- Supabase: os default privileges dão tudo aos papéis do cliente; a migration precisa revogar.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  `);
  await db.exec(await read('./fixtures/core_schema_20260927.sql'));
  await db.exec(await read('../migrations/20260930010000_platform_admin_and_support.sql'));

  // Chat como as migrations deixaram (sem UPDATE; DELETE só do próprio autor).
  await db.exec(`
    CREATE TABLE public.channels (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
      name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.messages (
      id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
      culto_id uuid REFERENCES public.cultos(id) ON DELETE CASCADE,
      sender_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      content text,
      created_at timestamptz NOT NULL DEFAULT now(),
      channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE,
      message_type text NOT NULL DEFAULT 'text',
      attachment_path text
    );
    ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Members can view team messages" ON public.messages FOR SELECT
      USING (member_can(auth.uid(), team_id, 'chat', 'ver'));
    CREATE POLICY "Members can send team messages" ON public.messages FOR INSERT
      WITH CHECK (member_can(auth.uid(), team_id, 'chat', 'ver')
        AND sender_profile_id = (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid() LIMIT 1));
    CREATE POLICY "Users can delete own messages" ON public.messages FOR DELETE
      USING (sender_profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1));

    ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_notifications ON public.notifications FOR SELECT TO authenticated
      USING (profile_id = public.get_my_profile_id());

    -- Storage mínimo (bucket privado 'chat', pasta = equipe).
    CREATE SCHEMA storage;
    GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
    CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
      $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    GRANT EXECUTE ON FUNCTION storage.foldername(text) TO authenticated;
    CREATE POLICY "Team members can view chat media" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'chat' AND public.is_team_member(auth.uid(), ((storage.foldername(name))[1])::uuid));
    CREATE POLICY "Team members can upload chat media" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'chat' AND public.is_team_member(auth.uid(), ((storage.foldername(name))[1])::uuid));
    CREATE POLICY "Authenticated can delete own chat media" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'chat' AND owner = auth.uid());
  `);

  const users = Object.keys(U);
  await db.exec(`
    INSERT INTO auth.users(id, email) VALUES ${users.map((k) => `('${U[k]}', '${k}@example.test')`).join(', ')};
    INSERT INTO public.profiles(id, user_id, full_name) VALUES ${users.map((k) => `('${P[k]}', '${U[k]}', 'Pessoa ${k}')`).join(', ')};
    INSERT INTO public.teams(id, name, owner_id) VALUES ('${team}', 'Louvor Alfa', '${P.leader}'), ('${otherTeam}', 'Louvor Beta', '${P.other}');
    INSERT INTO public.team_members(team_id, profile_id, role) VALUES
      ('${team}', '${P.leader}', 'admin'), ('${team}', '${P.leader2}', 'admin'), ('${team}', '${P.author}', 'viewer'),
      ('${team}', '${P.reporter}', 'viewer'), ('${team}', '${P.editor}', 'editor'),
      ('${otherTeam}', '${P.other}', 'admin'), ('${otherTeam}', '${P.member2}', 'viewer');
    INSERT INTO public.platform_admins(user_id) VALUES ('${U.platform}');
  `);

  await db.exec(await read('../migrations/20261003132000_chat_moderation.sql'));
  // Idempotente: reaplicar não duplica termos nem quebra policies e triggers.
  await db.exec(await read('../migrations/20261003132000_chat_moderation.sql'));
  await asSystem();
  check(await value('SELECT count(*)::int AS result FROM public.chat_blocked_terms') > 40, true);

  // ---------------------------------------------------------------- privilégios
  await asUser(U.reporter);
  await fails(`INSERT INTO public.chat_reports(team_id, reason) VALUES ('${team}', 'spam')`, '42501');
  await fails(`UPDATE public.chat_reports SET status = 'resolvida'`, '42501');
  await fails('DELETE FROM public.chat_reports', '42501');
  await fails('SELECT * FROM public.chat_blocked_terms', '42501');
  await fails(`INSERT INTO public.chat_blocked_terms(term) VALUES ('louvor')`, '42501');
  await fails(`INSERT INTO public.user_blocks(blocker_profile_id, blocked_profile_id) VALUES ('${P.reporter}', '${P.author}')`, '42501');
  await fails(`DELETE FROM public.user_blocks`, '42501');
  await fails(`SELECT public.chat_mask_text('porra')`, '42501');
  await fails(`SELECT public.chat_can_moderate('${team}', NULL)`, '42501');
  await asAnon();
  await fails(`SELECT public.report_chat_message('${team}', 'spam')`, '42501');
  await fails('SELECT public.list_chat_reports()', '42501');
  await fails(`SELECT public.block_user('${P.author}')`, '42501');
  await fails('SELECT * FROM public.chat_reports', '42501');
  await fails('SELECT * FROM public.user_blocks', '42501');

  // ---------------------------------------------------------------- filtro
  const filtered = [
    ['Que porra é essa, seu VIADO!', 'Que ***** é essa, seu *****!'],
    ['Puta merda, que caralhô', '**** *****, que *******'],
    ['p0rra porrrraaa PÓRRAS', '***** ********* ******'],
    ['foda-se', '****-se'],
    ['Cúmulo, cume, cuíca, cu', 'Cúmulo, cume, cuíca, **'],
    ['vai tnc fdp', 'vai *** ***'],
    ['Tragam a partitura e o computador, cuidado com a disputa e a reputação.', null],
    ['Vamos louvar 🙌 hoje às 19h30, Glória a Deus!', null],
    ['O veado e o macaco do zoológico; a bicha de pessoas; a piranha do rio.', null],
    ['Ensaio puxado: Disputa, computação, escuta, cutucar, picolé.', null],
  ];
  for (const [input, expected] of filtered) {
    check((await send(U.author, input)).content, expected ?? input, input);
  }
  check((await send(U.author, null, { type: 'image', attachment: `${team}/1-foto.png` })).content, null);
  await asSystem();
  const updated = await rows(`UPDATE public.messages SET content = 'que merda' WHERE content = 'foda-se' OR content = '****-se' RETURNING content`);
  check(updated.map((r) => r.content), ['que *****']);
  await db.exec(`INSERT INTO public.chat_blocked_terms(term) VALUES ('tosco')`);
  check((await send(U.author, 'que tosco')).content, 'que *****');
  await asSystem();
  await db.exec(`DELETE FROM public.chat_blocked_terms WHERE term = 'tosco'`);
  check((await send(U.author, 'que tosco')).content, 'que tosco');

  // ---------------------------------------------------------------- denúncias
  const m1 = await send(U.author, 'Você é um idiota, porra');
  await asUser(U.reporter);
  const r1 = await report(m1.id, 'assedio', '  Isso me ofendeu.  ');
  check(r1.already_reported, false);
  check(sorted(r1.notify_profile_ids), sorted([P.leader, P.leader2]));
  await asSystem();
  const snapshot = (await rows('SELECT * FROM public.chat_reports WHERE id = $1', [r1.id]))[0];
  check([snapshot.team_id, snapshot.message_id, snapshot.reported_profile_id, snapshot.reporter_profile_id, snapshot.status],
    [team, m1.id, P.author, P.reporter, 'aberta']);
  check([snapshot.message_content, snapshot.message_type, snapshot.details], ['Você é um idiota, *****', 'text', 'Isso me ofendeu.']);
  let notified = await notificationsFor('chat_report');
  check(sorted(notified.map((n) => n.profile_id)), sorted([P.leader, P.leader2, P.platform]));
  check(notified.some((n) => n.profile_id === P.author || n.profile_id === P.reporter), false);
  const platformNotice = notified.find((n) => n.profile_id === P.platform);
  check([platformNotice.link, platformNotice.team_id], ['/admin/denuncias', null]);
  check(platformNotice.body.startsWith('Louvor Alfa · Assédio ou intimidação'), true);
  check(notified.filter((n) => n.profile_id !== P.platform).every((n) => n.link === '/app/settings?aba=membros' && n.team_id === team), true);
  // Quem foi denunciado não vê nada, nem pela própria caixa de notificações.
  await asUser(U.author);
  check((await rows(`SELECT * FROM public.notifications WHERE type = 'chat_report'`)).length, 0);

  await asUser(U.reporter);
  const again = await report(m1.id, 'spam');
  check([again.id, again.already_reported], [r1.id, true]);
  check((await notificationsFor('chat_report')).length, 3);

  await asUser(U.author);
  await fails('SELECT public.report_chat_message($1, $2)', '22023', [m1.id, 'ofensivo']);
  await asUser(U.member2);
  await fails('SELECT public.report_chat_message($1, $2)', '42501', [m1.id, 'ofensivo']);
  await asUser(U.outsider);
  await fails('SELECT public.report_chat_message($1, $2)', '42501', [m1.id, 'ofensivo']);
  await asUser(U.reporter);
  await fails('SELECT public.report_chat_message($1, $2)', '22023', [m1.id, 'chato']);
  await fails('SELECT public.report_chat_message($1, $2)', '22023', [m1.id, null]);
  await fails('SELECT public.report_chat_message($1, $2, $3)', '22023', [m1.id, 'outro', 'x'.repeat(501)]);
  await fails('SELECT public.report_chat_message($1, $2)', '42501', [id(9, 9), 'outro']);

  // A liderança denunciando: o próprio líder não é avisado, o outro é.
  const m2 = await send(U.author, 'segunda mensagem');
  await asUser(U.leader);
  const r2 = await report(m2.id, 'spam');
  check(r2.notify_profile_ids, [P.leader2]);
  // Denúncia sobre um líder: só o outro líder e a plataforma sabem.
  const m3 = await send(U.leader2, 'mensagem do líder 2');
  await asUser(U.reporter);
  const r3 = await report(m3.id, 'odio');
  check(r3.notify_profile_ids, [P.leader]);
  await asSystem();
  check((await rows(`SELECT 1 FROM public.notifications WHERE type = 'chat_report' AND profile_id = '${P.leader2}' AND created_at >= (SELECT created_at FROM public.chat_reports WHERE id = '${r3.id}')`)).length, 0);
  const leader2Notices = await value(`SELECT count(*)::int AS result FROM public.notifications WHERE type = 'chat_report' AND profile_id = '${P.leader2}'`);
  check(leader2Notices, 2); // r1 e r2, nunca r3

  // Limite: 10 denúncias por hora por pessoa (r1 e r3 já contam).
  const extra = [];
  for (let i = 0; i < 9; i++) extra.push(await send(U.author, `mensagem extra ${i}`));
  await asUser(U.reporter);
  for (let i = 0; i < 8; i++) await report(extra[i].id, 'spam');
  await fails('SELECT public.report_chat_message($1, $2)', 'P0001', [extra[8].id, 'spam']);
  // Uma denúncia repetida não esbarra no limite (devolve a existente).
  check((await report(m1.id, 'spam')).already_reported, true);
  await asSystem();
  await db.exec(`UPDATE public.chat_reports SET created_at = now() - interval '25 hours' WHERE reporter_profile_id = '${P.reporter}'`);
  await asUser(U.reporter);
  const r4 = await report(extra[8].id, 'spam');
  check(r4.already_reported, false);

  // ---------------------------------------------------------------- leitura (RLS)
  const visible = async (uid) => { await asUser(uid); return (await rows('SELECT id FROM public.chat_reports')).map((r) => r.id); };
  const allTeamReports = await (async () => { await asSystem(); return (await rows(`SELECT id FROM public.chat_reports WHERE team_id = '${team}'`)).map((r) => r.id); })();
  check(allTeamReports.length, 12);
  check((await visible(U.reporter)).length, 11);
  check((await visible(U.reporter)).includes(r2.id), false);
  check(await visible(U.editor), []);
  check(await visible(U.author), []);
  check(sorted(await visible(U.leader)), sorted(allTeamReports));
  check(sorted(await visible(U.leader2)), sorted(allTeamReports.filter((x) => x !== r3.id)));
  check(await visible(U.other), []);
  check(await visible(U.member2), []);
  check((await visible(U.platform)).length, 12);

  await asUser(U.leader);
  let list = await value(`SELECT public.list_chat_reports('${team}') AS result`);
  check([list.total, list.pending_total, list.overdue_total], [12, 12, 10]);
  check(list.items[0].team_name, 'Louvor Alfa');
  const listed = list.items.find((item) => item.id === r1.id) ?? (await value(`SELECT public.list_chat_reports('${team}', '', '', 1, 100) AS result`)).items.find((item) => item.id === r1.id);
  check([listed.reporter_name, listed.reported_name, listed.message_exists, listed.reported_is_member, listed.reported_is_owner],
    ['Pessoa reporter', 'Pessoa author', true, true, false]);
  await fails(`SELECT public.list_chat_reports('${otherTeam}')`, '42501');
  await fails('SELECT public.list_chat_reports()', '42501');
  await fails(`SELECT public.list_chat_reports('${team}', 'qualquer')`, '22023');
  await fails(`SELECT public.list_chat_reports('${team}', '', '', 1, 101)`, '22023');
  await asUser(U.leader2);
  check((await value(`SELECT public.list_chat_reports('${team}', '', '', 1, 100) AS result`)).items.some((item) => item.id === r3.id), false);
  await asUser(U.editor);
  await fails(`SELECT public.list_chat_reports('${team}')`, '42501');
  await asUser(U.platform);
  list = await value(`SELECT public.list_chat_reports(NULL, '', 'alfa', 1, 5) AS result`);
  check([list.total, list.items.length], [12, 5]);
  check((await value(`SELECT public.list_chat_reports(NULL, '', 'beta') AS result`)).total, 0);

  // ---------------------------------------------------------------- moderação
  const moderate = (reportId, status, note = null, remove = false) =>
    value('SELECT public.moderate_chat_report($1, $2, $3, $4) AS result', [reportId, status, note, remove]);
  await asUser(U.reporter);
  await fails('SELECT public.moderate_chat_report($1, $2)', '42501', [r1.id, 'resolvida']);
  await asUser(U.other);
  await fails('SELECT public.moderate_chat_report($1, $2)', '42501', [r1.id, 'resolvida']);
  await asUser(U.leader2);
  await fails('SELECT public.moderate_chat_report($1, $2)', '42501', [r3.id, 'descartada']);
  await asUser(U.leader);
  await fails('SELECT public.moderate_chat_report($1, $2)', '22023', [r1.id, 'aberta']);
  await fails('SELECT public.moderate_chat_report($1, $2, $3)', '22023', [r1.id, 'resolvida', 'x'.repeat(1001)]);
  await fails('SELECT public.moderate_chat_report($1, $2, $3, $4)', '22023', [r1.id, 'em_analise', null, true]);
  let moderated = await moderate(r1.id, 'em_analise');
  check([moderated.status, moderated.resolved_at, moderated.resolved_by], ['em_analise', null, null]);
  check((await notificationsFor('chat_report_update')).length, 0);
  await asUser(U.leader);
  moderated = await moderate(r1.id, 'resolvida', 'Conversei com a pessoa.');
  check([moderated.status, moderated.resolved_by, moderated.resolution_note, moderated.member_removed],
    ['resolvida', P.leader, 'Conversei com a pessoa.', false]);
  check(moderated.resolved_at !== null, true);
  moderated = await moderate(r1.id, 'descartada');
  check(moderated.resolution_note, 'Conversei com a pessoa.');
  let feedback = await notificationsFor('chat_report_update');
  check(feedback.map((n) => [n.profile_id, n.link]), [[P.reporter, '/app/chat']]);
  // Ação da plataforma fica no histórico administrativo.
  await asUser(U.platform);
  check((await moderate(r3.id, 'descartada', 'Sem violação.')).status, 'descartada');
  await asSystem();
  check(await value(`SELECT count(*)::int AS result FROM public.platform_audit_log WHERE action = 'chat_report_update' AND entity_id = '${r3.id}'`), 1);
  check(await value(`SELECT count(*)::int AS result FROM public.platform_audit_log WHERE action = 'chat_report_update' AND entity_id = '${r1.id}'`), 0);
  // Responsável pela equipe não sai por aqui.
  const ownerMessage = await send(U.leader, 'mensagem do responsável');
  await asUser(U.reporter);
  const r5 = await report(ownerMessage.id, 'ofensivo');
  await asUser(U.leader2);
  await fails('SELECT public.moderate_chat_report($1, $2, $3, $4)', '22023', [r5.id, 'resolvida', null, true]);

  // ---------------------------------------------------------------- bloqueios
  await asUser(U.reporter);
  check(await value(`SELECT public.block_user('${P.author}') AS result`), { blocked: true });
  check(await value(`SELECT public.block_user('${P.author}') AS result`), { blocked: true });
  check((await rows('SELECT blocked_profile_id FROM public.user_blocks')).map((r) => r.blocked_profile_id), [P.author]);
  const blockedList = await value('SELECT public.list_blocked_users() AS result');
  check(blockedList.map((b) => [b.profile_id, b.full_name]), [[P.author, 'Pessoa author']]);
  await fails(`SELECT public.block_user('${P.reporter}')`, '22023');
  await fails(`SELECT public.block_user('${P.member2}')`, '42501');
  await fails(`INSERT INTO public.user_blocks VALUES ('${P.reporter}', '${P.editor}')`, '42501');
  await asUser(U.author);
  check((await rows('SELECT * FROM public.user_blocks')).length, 0);
  check(await value('SELECT public.list_blocked_users() AS result'), []);
  await asUser(U.editor);
  check((await rows('SELECT * FROM public.user_blocks')).length, 0);
  await asUser(U.leader);
  check((await rows('SELECT * FROM public.user_blocks')).length, 0);
  await asUser(U.platform);
  check((await rows('SELECT * FROM public.user_blocks')).length, 0);
  await asUser(U.reporter);
  check(await value(`SELECT public.unblock_user('${P.author}') AS result`), { unblocked: true });
  check(await value(`SELECT public.unblock_user('${P.author}') AS result`), { unblocked: false });
  check(await value(`SELECT public.block_user('${P.author}') AS result`), { blocked: true });

  // ---------------------------------------------------------------- apagar
  const del = (messageId) => value('SELECT public.delete_chat_message($1) AS result', [messageId]);
  const exists = async (messageId) => { await asSystem(); return (await rows('SELECT 1 FROM public.messages WHERE id = $1', [messageId])).length === 1; };
  await asUser(U.editor);
  await fails('SELECT public.delete_chat_message($1)', '42501', [m2.id]);
  await db.query('DELETE FROM public.messages WHERE id = $1', [m2.id]); // policy antiga: só o autor
  check(await exists(m2.id), true);
  await asUser(U.other);
  await fails('SELECT public.delete_chat_message($1)', '42501', [m2.id]);
  await asUser(U.outsider);
  await fails('SELECT public.delete_chat_message($1)', '42501', [m2.id]);

  const own = await send(U.author, 'vou apagar esta');
  await asUser(U.author);
  check(await del(own.id), { deleted: true, attachment_path: null, keep_attachment: false });
  check(await exists(own.id), false);

  await asUser(U.leader);
  check((await del(m2.id)).deleted, true);
  await asSystem();
  let after = (await rows('SELECT * FROM public.chat_reports WHERE id = $1', [r2.id]))[0];
  check([after.message_id, after.message_content, after.message_deleted_role], [null, 'segunda mensagem', 'lideranca']);
  check(after.message_deleted_at !== null, true);

  // Autor apaga a própria mensagem denunciada pela policy antiga: a denúncia registra.
  await asUser(U.author);
  await db.query('DELETE FROM public.messages WHERE id = $1', [extra[0].id]);
  await asSystem();
  check((await rows('SELECT message_deleted_role FROM public.chat_reports WHERE message_content = $1', ['mensagem extra 0']))[0].message_deleted_role, 'autor');

  await asUser(U.platform);
  check((await del(extra[1].id)).deleted, true);
  await asSystem();
  check((await rows('SELECT message_deleted_role FROM public.chat_reports WHERE message_content = $1', ['mensagem extra 1']))[0].message_deleted_role, 'plataforma');
  check(await value(`SELECT count(*)::int AS result FROM public.platform_audit_log WHERE action = 'chat_message_delete' AND entity_id = '${extra[1].id}'`), 1);

  // Anexo denunciado: fica no Storage enquanto a denúncia estiver aberta.
  const photo = `${team}/1700000000000-foto.png`;
  const loosePhoto = `${team}/1700000000001-outra.png`;
  const betaPhoto = `${otherTeam}/1700000000002-beta.png`;
  await asUser(U.author);
  await db.exec(`INSERT INTO storage.objects(bucket_id, name, owner) VALUES ('chat', '${photo}', '${U.author}'), ('chat', '${loosePhoto}', '${U.author}')`);
  await asUser(U.member2);
  await db.exec(`INSERT INTO storage.objects(bucket_id, name, owner) VALUES ('chat', '${betaPhoto}', '${U.member2}')`);
  await asUser(U.author);
  await fails(`INSERT INTO storage.objects(bucket_id, name, owner) VALUES ('chat', '${otherTeam}/x.png', '${U.author}')`, '42501');
  const image = await send(U.author, null, { type: 'image', attachment: photo });
  await asUser(U.editor);
  const r6 = await report(image.id, 'sexual');
  await asSystem();
  check((await rows('SELECT message_type, message_attachment_path FROM public.chat_reports WHERE id = $1', [r6.id]))[0],
    { message_type: 'image', message_attachment_path: photo });

  const storageRows = async (uid, sql) => { await asUser(uid); return (await rows(sql)).map((r) => r.name); };
  check(await storageRows(U.platform, `SELECT name FROM storage.objects WHERE bucket_id = 'chat' ORDER BY name`), [photo]);
  check(await storageRows(U.editor, `DELETE FROM storage.objects WHERE name = '${photo}' RETURNING name`), []);
  check(await storageRows(U.other, `DELETE FROM storage.objects WHERE name = '${photo}' RETURNING name`), []);
  check(await storageRows(U.platform, `DELETE FROM storage.objects WHERE name = '${loosePhoto}' RETURNING name`), []);
  check(await storageRows(U.leader, `DELETE FROM storage.objects WHERE name = '${betaPhoto}' RETURNING name`), []);

  await asUser(U.author);
  check(await del(image.id), { deleted: true, attachment_path: photo, keep_attachment: true });
  await asUser(U.leader);
  moderated = await moderate(r6.id, 'resolvida', 'Imagem removida.');
  check(moderated.attachment_to_remove, photo);
  check(await storageRows(U.leader, `DELETE FROM storage.objects WHERE name = '${photo}' RETURNING name`), [photo]);
  check(await storageRows(U.leader, `DELETE FROM storage.objects WHERE name = '${loosePhoto}' RETURNING name`), [loosePhoto]);
  // Denúncia encerrada com a mensagem ainda no ar: o anexo é dela, não sai.
  const live = await send(U.author, null, { type: 'audio', attachment: `${team}/1700000000003-audio.webm` });
  await asUser(U.editor);
  const r7 = await report(live.id, 'spam');
  await asUser(U.leader);
  check((await moderate(r7.id, 'descartada')).attachment_to_remove, null);

  // Remover o autor da equipe ao resolver.
  const r8 = await (async () => { const m = await send(U.author, 'última'); await asUser(U.editor); return report(m.id, 'assedio'); })();
  await asUser(U.leader);
  moderated = await moderate(r8.id, 'resolvida', 'Removido após advertência.', true);
  check([moderated.member_removed, moderated.member_removed_at !== null], [true, true]);
  await asSystem();
  check((await rows(`SELECT 1 FROM public.team_members WHERE team_id = '${team}' AND profile_id = '${P.author}'`)).length, 0);
  await asUser(U.leader);
  check((await value(`SELECT public.list_chat_reports('${team}', '', '', 1, 100) AS result`)).items.find((item) => item.id === r8.id).reported_is_member, false);
  // Quem saiu da equipe continua bloqueado e aparece na lista (para poder desbloquear).
  await asUser(U.reporter);
  check((await value('SELECT public.list_blocked_users() AS result')).map((b) => b.profile_id), [P.author]);

  // ---------------------------------------------------------------- exclusão de contas e equipes
  await asSystem();
  const reportsBefore = await value(`SELECT count(*)::int AS result FROM public.chat_reports WHERE team_id = '${team}'`);
  await db.exec(`DELETE FROM public.profiles WHERE id = '${P.author}'`);
  check(await value(`SELECT count(*)::int AS result FROM public.chat_reports WHERE team_id = '${team}'`), reportsBefore);
  check(await value(`SELECT count(*)::int AS result FROM public.chat_reports WHERE reported_profile_id IS NULL AND team_id = '${team}' AND id <> '${r3.id}' AND id <> '${r5.id}'`), reportsBefore - 2);
  check(await value(`SELECT count(*)::int AS result FROM public.chat_reports WHERE message_id IS NULL AND message_deleted_role = 'sistema'`) > 0, true);
  check(await value(`SELECT count(*)::int AS result FROM public.user_blocks`), 0);
  await db.exec(`DELETE FROM public.profiles WHERE id = '${P.reporter}'`);
  check(await value(`SELECT count(*)::int AS result FROM public.chat_reports WHERE reporter_profile_id IS NULL`) >= 10, true);
  await db.exec(`DELETE FROM public.teams WHERE id = '${team}'`);
  check(await value('SELECT count(*)::int AS result FROM public.chat_reports'), 0);

  console.log(`${checks} PostgreSQL checks passed: privileges, content filter, reports, notifications, rate limit, RLS isolation, moderation, blocks, deletion, storage and cascades.`);
} finally {
  await db.close();
}
