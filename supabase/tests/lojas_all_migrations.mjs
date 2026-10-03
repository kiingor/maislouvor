// Conformidade com as lojas: as migrações das cinco frentes juntas, em ordem, sobre o
// recorte de produção (fixtures/core_schema_20260927.sql) — e o que só aparece com
// todas aplicadas: exclusão de conta com denúncias, bloqueios, aceites dos termos e
// do aviso de IA do Asafe; prova de denúncia que sobrevive à exclusão; versões do
// banco iguais às do app; Asafe suspenso não ativa grupo.
// Roda num PostgreSQL em memória (PGlite), nunca na produção:
//   PGLITE_MODULE=/caminho/@electric-sql/pglite/dist/index.js node supabase/tests/lojas_all_migrations.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createAssistantDb, serviceRpc, withRole } from './helpers/assistant_db.mjs';
import { activationErrorMessage } from '../functions/whatsapp-assistant/persona.ts';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migration = (name) => read(`../migrations/${name}`);

/** As migrações da conformidade (20261003...) na ordem do nome, como o deploy aplica. */
const STORE_MIGRATIONS = [
  '20261003130000_account_deletion.sql',
  '20261003131000_terms_acceptance.sql',
  '20261003132000_chat_moderation.sql',
  '20261003133000_assistant_ai_consent.sql',
];

let checks = 0;
const check = (actual, expected, label = 'valor diferente') => { assert.deepEqual(actual, expected, label); checks++; };
const ok = (value, label = 'condição falsa') => { assert.ok(value, label); checks++; };

const { db } = await createAssistantDb();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const rpc = serviceRpc(db);
/** RPC do app como a pessoa (auth.uid() = uid), numa transação só dela. */
const asUser = (uid, sql, params) => withRole(db, 'authenticated', uid, async (tx) => (await tx.query(sql, params)).rows[0]?.r);
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

const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const names = ['olga', 'bia', 'caio', 'dani', 'enzo'];
const U = Object.fromEntries(names.map((n, i) => [n, id(1, i + 1)]));
const P = Object.fromEntries(names.map((n, i) => [n, id(2, i + 1)]));
// T: equipe da Olga com Bia e Caio. D: equipe só da Dani. S: equipe do Enzo com o Asafe suspenso.
const team = { t: id(3, 1), d: id(3, 2), s: id(3, 3) };
const msg = { biaPhoto: id(4, 1), biaAudio: id(4, 2), biaText: id(4, 3), caioText: id(4, 4), daniPhoto: id(4, 5) };
const file = {
  biaPhoto: `${team.t}/foto-bia.jpg`,
  biaAudio: `${team.t}/audio-bia.webm`,
  daniPhoto: `${team.d}/foto-dani.jpg`,
};

try {
  // ------------------------------------------------------------------ recorte
  // O que a produção tem e o recorte de 27/09 não traz (mesmas colunas e FKs das
  // migrações), o Storage mínimo e as migrações já publicadas depois do recorte.
  await db.exec(`
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, created_at timestamptz DEFAULT now(),
      last_sign_in_at timestamptz, email_confirmed_at timestamptz,
      raw_user_meta_data jsonb NOT NULL DEFAULT '{}', raw_app_meta_data jsonb NOT NULL DEFAULT '{}');
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    CREATE SCHEMA storage;
    GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
    CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL,
      name text NOT NULL, owner uuid, owner_id text, UNIQUE (bucket_id, name));
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;
    GRANT ALL ON storage.objects TO service_role;
    -- Policies do bucket 'chat' como as migrações do chat deixaram (pasta = equipe).
    CREATE POLICY "Team members can view chat media" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'chat' AND public.is_team_member(auth.uid(), split_part(name, '/', 1)::uuid));
    CREATE POLICY "Authenticated can delete own chat media" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'chat' AND owner = auth.uid());
    CREATE TABLE public.repertorios (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE, name text NOT NULL,
      created_by uuid REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(), public_token uuid UNIQUE, is_public boolean NOT NULL DEFAULT false);
    CREATE TABLE public.repertorio_songs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      repertorio_id uuid NOT NULL REFERENCES public.repertorios(id) ON DELETE CASCADE,
      song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
      sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (repertorio_id, song_id));
    CREATE TABLE public.song_tracks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
      track_name text NOT NULL, audio_path text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.song_loop_points (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
      profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      label text NOT NULL DEFAULT 'Loop', start_time real NOT NULL, end_time real NOT NULL,
      is_public boolean NOT NULL DEFAULT false, repeat_count integer NOT NULL DEFAULT 0,
      sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.channels (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE, name text NOT NULL,
      description text, created_by uuid REFERENCES public.profiles(id), sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
      culto_id uuid REFERENCES public.cultos(id) ON DELETE CASCADE,
      sender_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, content text,
      created_at timestamptz NOT NULL DEFAULT now(), channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE,
      message_type text NOT NULL DEFAULT 'text', attachment_path text);
    CREATE TABLE public.team_invites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE, email text NOT NULL,
      role public.team_role NOT NULL DEFAULT 'viewer', token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
      accepted boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.device_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, token text NOT NULL UNIQUE);
    CREATE TABLE public.push_subscriptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, endpoint text NOT NULL UNIQUE);
    CREATE TABLE public.team_join_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
      profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'pending', decided_by uuid REFERENCES public.profiles(id), UNIQUE (team_id, profile_id));
  `);
  // 20260928 (assistente) já veio do helper; as outras publicadas depois do recorte, em ordem.
  for (const name of ['20260927120000_song_loop_notes.sql', '20260929120000_assistant_notifications.sql',
    '20260930010000_platform_admin_and_support.sql', '20260930120000_assistant_missions.sql',
    '20260930200000_song_registration_catalog.sql']) {
    await db.exec(await migration(name));
  }

  // Equipes e pessoas ANTES da conformidade: a equipe T já usa o Asafe (vira
  // "pendente" e os membros entram na tolerância de quem já usava).
  await db.exec(`
    INSERT INTO auth.users(id, email) VALUES ${names.map((n) => `('${U[n]}', '${n}@example.test')`).join(', ')};
    INSERT INTO public.profiles(id, user_id, full_name, phone) VALUES
      ${names.map((n, i) => `('${P[n]}', '${U[n]}', '${n[0].toUpperCase()}${n.slice(1)}', '(11) 9000${i}-000${i}')`).join(', ')};
    INSERT INTO public.teams(id, name, owner_id) VALUES
      ('${team.t}', 'Louvor Sede', '${P.olga}'), ('${team.d}', 'Banda da Dani', '${P.dani}'), ('${team.s}', 'Louvor Revisão', '${P.enzo}');
    INSERT INTO public.team_members(team_id, profile_id, role) VALUES
      ('${team.t}', '${P.olga}', 'admin'), ('${team.t}', '${P.bia}', 'viewer'), ('${team.t}', '${P.caio}', 'viewer'),
      ('${team.d}', '${P.dani}', 'admin'), ('${team.s}', '${P.enzo}', 'admin');
    INSERT INTO public.assistant_groups(group_jid, team_id, activated_by) VALUES ('120363000000000001@g.us', '${team.t}', '${P.olga}');
  `);

  // ------------------------------------------------------------- as migrações
  const later = (await readdir(new URL('../migrations/', import.meta.url)))
    .filter((name) => name.endsWith('.sql') && name >= '20261003').sort();
  for (const name of STORE_MIGRATIONS) ok(later.includes(name), `${name} está em supabase/migrations`);
  // A demo não precisou de migração (scripts/review-demo marca as contas em app_metadata).
  ok(!later.some((name) => name.startsWith('20261003134000')), 'sem migração da demo');
  for (const name of later) {
    try {
      await db.exec(await migration(name));
    } catch (error) {
      throw new Error(`${name} não aplicou depois das anteriores: ${error.message}`);
    }
  }
  // Reaplicar tudo, na mesma ordem (deploy repetido), não quebra nada.
  for (const name of later) await db.exec(await migration(name));
  check(await rows(`SELECT count(*)::int AS n FROM public.assistant_ai_legacy_members`), [{ n: 3 }],
    'tolerância do Asafe: foto única dos membros da equipe T');

  // ------------------------------------------------------- objetos principais
  const fns = [
    'get_account_deletion_preview()', 'transfer_team_ownership(uuid,uuid)', 'delete_account_data(uuid)',
    'account_deletion_preview_for(uuid)', 'account_deletion_storage_objects(uuid)', 'account_deletion_storage_done(uuid,jsonb)',
    'account_deletion_blocking_references()',
    'accept_terms(text,text)', 'legal_current_versions()',
    'report_chat_message(uuid,text,text)', 'list_chat_reports(uuid,text,text,integer,integer)',
    'moderate_chat_report(uuid,text,text,boolean)', 'delete_chat_message(uuid)', 'block_user(uuid)', 'unblock_user(uuid)',
    'list_blocked_users()', 'chat_report_platform_push_targets(uuid,uuid)', 'platform_transfer_team_ownership(uuid,uuid)',
    'platform_account_suspension_target(uuid,uuid)', 'platform_record_account_suspension(uuid,uuid,boolean,text,uuid)',
    'give_assistant_consent(text,uuid,text)', 'revoke_assistant_consent(text,uuid)', 'assistant_consent_prompts()',
    'assistant_member_ai_allowed(uuid,uuid)', 'assistant_ai_consent_version()', 'assistant_claim_ai_disclosure(text)',
  ];
  for (const fn of fns) ok((await one(`SELECT to_regprocedure($1) IS NOT NULL AS ok`, [`public.${fn}`])).ok, `função ${fn}`);
  // As das policies do Storage ficam fora da API (schema private).
  ok((await one(`SELECT to_regprocedure('private.chat_media_has_open_report(text)') IS NOT NULL
    AND to_regprocedure('public.chat_media_has_open_report(text)') IS NULL AS ok`)).ok, 'chat_media_* em private');
  for (const table of ['account_deletion_storage_queue', 'chat_blocked_terms', 'chat_reports', 'user_blocks',
    'assistant_ai_consents', 'assistant_ai_legacy_members', 'assistant_ai_opt_outs', 'platform_account_suspensions']) {
    ok((await one(`SELECT to_regclass($1) IS NOT NULL AS ok`, [`public.${table}`])).ok, `tabela ${table}`);
  }
  check((await rows(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles'
    AND column_name IN ('terms_accepted_at', 'terms_version', 'privacy_version', 'assistant_ai_opt_out') ORDER BY column_name`))
    .map((r) => r.column_name), ['privacy_version', 'terms_accepted_at', 'terms_version'], 'o opt-out do Asafe fica fora de profiles');
  check(await fkAction('public.teams', 'owner_id'), 'r', 'teams.owner_id RESTRICT (o dono não apaga a equipe)');
  check(await fkAction('public.songs', 'created_by'), 'n', 'songs.created_by SET NULL');
  check(await rows('SELECT * FROM public.account_deletion_blocking_references()'), [], 'nenhuma FK trava a exclusão com tudo aplicado');

  // Nenhuma RPC nova aberta para anon; as do app só para quem entrou; as internas só para o servidor.
  const can = async (role, fn) => (await one(`SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok`, [role, `public.${fn}`])).ok;
  for (const fn of ['get_account_deletion_preview()', 'accept_terms(text,text)', 'report_chat_message(uuid,text,text)',
    'block_user(uuid)', 'give_assistant_consent(text,uuid,text)', 'delete_account_data(uuid)']) {
    check(await can('anon', fn), false, `anon não executa ${fn}`);
  }
  check(await can('authenticated', 'delete_account_data(uuid)'), false, 'só o servidor apaga contas');
  check(await can('authenticated', 'account_deletion_storage_objects(uuid)'), false);
  check(await can('anon', 'legal_current_versions()'), true, 'versões dos documentos são públicas');

  // --------------------------------------------- versões: banco igual ao app
  const legalTs = await read('../../src/lib/legal.ts');
  const consentTs = await read('../../src/lib/assistantAiConsent.ts');
  const constant = (source, name) => source.match(new RegExp(`export const ${name} = "([^"]+)"`))?.[1];
  const versions = (await one('SELECT public.legal_current_versions() AS v')).v;
  check([versions.terms, versions.privacy],
    [constant(legalTs, 'TERMS_VERSION'), constant(legalTs, 'PRIVACY_VERSION')], 'Termos/Privacidade: banco = src/lib/legal.ts');
  check((await one('SELECT public.assistant_ai_consent_version() AS v')).v, constant(consentTs, 'ASSISTANT_AI_CONSENT_VERSION'),
    'aviso do Asafe: banco = src/lib/assistantAiConsent.ts');
  const VERSION = versions.terms;

  // ------------------------------------------------ uso com tudo junto
  // Bia aceita os termos e permite o Asafe; Olga confirma a IA da equipe T.
  await asUser(U.bia, 'SELECT public.accept_terms($1, $2) AS r', [VERSION, VERSION]);
  await asUser(U.bia, `SELECT public.give_assistant_consent('member_link', NULL, $1) AS r`, [VERSION]);
  await asUser(U.olga, `SELECT public.give_assistant_consent('team_activation', $1, $2) AS r`, [team.t, VERSION]);
  await asUser(U.dani, `SELECT public.give_assistant_consent('team_activation', $1, $2) AS r`, [team.d, VERSION]);
  check((await one('SELECT terms_version FROM public.profiles WHERE id = $1', [P.bia])).terms_version, VERSION);

  // Chat: o filtro mascara ao salvar; anexos da Bia (um vira prova de denúncia, o outro não).
  await db.exec(`
    INSERT INTO public.messages(id, team_id, sender_profile_id, content, message_type, attachment_path) VALUES
      ('${msg.biaPhoto}', '${team.t}', '${P.bia}', NULL, 'image', '${file.biaPhoto}'),
      ('${msg.biaAudio}', '${team.t}', '${P.bia}', NULL, 'audio', '${file.biaAudio}'),
      ('${msg.biaText}', '${team.t}', '${P.bia}', 'Que porra de ensaio', 'text', NULL),
      ('${msg.caioText}', '${team.t}', '${P.caio}', 'Chego às 19h', 'text', NULL),
      ('${msg.daniPhoto}', '${team.d}', '${P.dani}', NULL, 'image', '${file.daniPhoto}');
    INSERT INTO storage.objects(bucket_id, name, owner) VALUES
      ('chat', '${file.biaPhoto}', '${U.bia}'), ('chat', '${file.biaAudio}', '${U.bia}'), ('chat', '${file.daniPhoto}', '${U.dani}'),
      ('avatars', '${U.bia}/avatar.jpg', '${U.bia}');
  `);
  check((await one('SELECT content FROM public.messages WHERE id = $1', [msg.biaText])).content, 'Que ***** de ensaio',
    'filtro do chat ativo');
  const photoReport = await asUser(U.caio, `SELECT public.report_chat_message($1, 'sexual', 'foto imprópria') AS r`, [msg.biaPhoto]);
  const textReport = await asUser(U.caio, `SELECT public.report_chat_message($1, 'ofensivo') AS r`, [msg.biaText]);
  const byBia = await asUser(U.bia, `SELECT public.report_chat_message($1, 'spam') AS r`, [msg.caioText]);
  await asUser(U.bia, 'SELECT public.block_user($1) AS r', [P.caio]);
  await asUser(U.caio, 'SELECT public.block_user($1) AS r', [P.bia]);
  check((await one('SELECT count(*)::int AS n FROM public.user_blocks')).n, 2);

  // ------------------------------------------- exclusão da Bia (sai da equipe T)
  check((await rpc('account_deletion_preview_for', { p_user_id: U.bia })).teams.map((t) => t.action), ['leave']);
  const queued = await rpc('account_deletion_storage_objects', { p_user_id: U.bia });
  check(queued.map((o) => `${o.bucket}/${o.path}`).sort(), [`avatars/${U.bia}/avatar.jpg`, `chat/${file.biaAudio}`],
    'anexo em denúncia aberta fica fora da fila (prova); o resto da Bia entra');
  const deleted = await rpc('delete_account_data', { p_user_id: U.bia });
  check([deleted.deleted, deleted.left_team_count, deleted.storage_objects.length], [true, 1, 2]);
  await db.query('DELETE FROM auth.users WHERE id = $1', [U.bia]);
  check((await one('SELECT count(*)::int AS n FROM public.profiles WHERE id = $1', [P.bia])).n, 0, 'perfil (e aceite dos termos) apagado');
  check((await one('SELECT count(*)::int AS n FROM public.messages WHERE sender_profile_id IS NULL OR id IN ($1, $2, $3)',
    [msg.biaPhoto, msg.biaAudio, msg.biaText])).n, 0, 'mensagens da Bia apagadas');
  check((await one('SELECT count(*)::int AS n FROM public.user_blocks')).n, 0, 'bloqueios dela e contra ela saem');
  // Denúncias continuam, sem a ligação com a conta, com a cópia da mensagem.
  const reports = await rows(`SELECT id, reported_profile_id, reporter_profile_id, message_id, message_content,
      message_attachment_path, message_deleted_role, status FROM public.chat_reports ORDER BY created_at, id`);
  check(reports.length, 3, 'as três denúncias continuam');
  const report = (rid) => reports.find((r) => r.id === rid);
  check([report(photoReport.id).reported_profile_id, report(photoReport.id).message_id, report(photoReport.id).message_attachment_path,
    report(photoReport.id).message_deleted_role], [null, null, file.biaPhoto, 'sistema']);
  check(report(textReport.id).message_content, 'Que ***** de ensaio', 'cópia (já mascarada) da mensagem denunciada');
  check([report(byBia.id).reporter_profile_id, report(byBia.id).status], [null, 'aberta'], 'denúncia feita pela Bia fica, sem ela');
  // Aceite do aviso de IA fica como histórico, sem identificar a pessoa.
  check(await rows(`SELECT scope, profile_id, revoked_at FROM public.assistant_ai_consents WHERE scope = 'member_link'`),
    [{ scope: 'member_link', profile_id: null, revoked_at: null }]);
  check((await one('SELECT count(*)::int AS n FROM public.assistant_ai_legacy_members WHERE profile_id = $1', [P.bia])).n, 0);
  check((await one(`SELECT count(*)::int AS n FROM storage.objects WHERE name = $1`, [file.biaPhoto])).n, 1, 'prova continua no Storage');

  // Enquanto a denúncia está aberta, nem a liderança apaga a prova pelo Storage.
  const deleteAsOlga = () => withRole(db, 'authenticated', U.olga,
    (tx) => tx.query(`DELETE FROM storage.objects WHERE bucket_id = 'chat' AND name = $1`, [file.biaPhoto]));
  await deleteAsOlga();
  check((await one(`SELECT count(*)::int AS n FROM storage.objects WHERE name = $1`, [file.biaPhoto])).n, 1, 'prova protegida');
  // A liderança fecha a denúncia: a prova sai (o app apaga o arquivo devolvido).
  const closed = await asUser(U.olga, `SELECT public.moderate_chat_report($1, 'resolvida', 'Conta excluída') AS r`, [photoReport.id]);
  check(closed.attachment_to_remove, file.biaPhoto, 'ao fechar, a moderação recebe o anexo para apagar');
  await deleteAsOlga();
  check((await one(`SELECT count(*)::int AS n FROM storage.objects WHERE name = $1`, [file.biaPhoto])).n, 0,
    'liderança apaga a prova depois de fechar a denúncia');

  // --------------------- exclusão da Dani (equipe só dela, com o aceite do Asafe)
  check((await rpc('account_deletion_preview_for', { p_user_id: U.dani })).teams.map((t) => t.action), ['delete_team']);
  const dani = await rpc('delete_account_data', { p_user_id: U.dani });
  check(dani.deleted_team_ids, [team.d]);
  check(dani.storage_objects.map((o) => o.path), [file.daniPhoto], 'anexo da equipe apagada vai para a fila');
  await db.query('DELETE FROM auth.users WHERE id = $1', [U.dani]);
  check((await one('SELECT count(*)::int AS n FROM public.assistant_ai_consents WHERE team_id = $1', [team.d])).n, 0,
    'aceite da equipe sai com a equipe');

  // ------------------------- Olga (dona da T, com Caio) precisa transferir antes
  check((await rpc('account_deletion_preview_for', { p_user_id: U.olga })).teams.map((t) => t.action), ['transfer_required']);
  await fails(rpc('delete_account_data', { p_user_id: U.olga }), '55000', 'dona com membros não exclui sem transferir');
  await asUser(U.olga, 'SELECT public.transfer_team_ownership($1, $2) AS r', [team.t, P.caio]);
  check((await rpc('delete_account_data', { p_user_id: U.olga })).deleted, true);
  check((await one('SELECT owner_id FROM public.teams WHERE id = $1', [team.t])).owner_id, P.caio);
  check(await rows('SELECT * FROM public.account_deletion_blocking_references()'), [], 'nada trava depois das exclusões');

  // ------------------------- Asafe suspenso: o código mostra o aviso, mas não ativa
  await db.exec(`INSERT INTO public.assistant_team_settings(team_id, enabled) VALUES ('${team.s}', false)`);
  await asUser(U.enzo, `SELECT public.give_assistant_consent('team_activation', $1, $2) AS r`, [team.s, VERSION]);
  const code = await asUser(U.enzo, 'SELECT public.assistant_create_activation_code($1) AS r', [team.s]);
  ok(/^[A-Z0-9]+$/.test(code.code), 'gera o código (o aviso de IA aparece no app)');
  check(await rpc('assistant_activate_group', { p_code: code.code, p_group_jid: '120363000000000009@g.us', p_group_name: 'Revisão' }),
    { ok: false, error: 'team_suspended' }, 'equipe suspensa não ativa grupo');
  check((await one(`SELECT count(*)::int AS n FROM public.assistant_groups WHERE team_id = $1`, [team.s])).n, 0);
  ok(activationErrorMessage('Asafe', 'team_suspended').includes('suspenso'), 'o bot explica a suspensão');

  console.log(`${checks} checks passed: as migrações da conformidade juntas e em ordem (duas vezes), objetos e permissões, `
    + 'versões banco = app, exclusão com denúncias/bloqueios/aceites, prova de denúncia, equipe só da pessoa, '
    + 'transferência e Asafe suspenso.');
} finally {
  await db.close();
}
