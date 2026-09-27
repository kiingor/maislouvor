// Assistente no WhatsApp: migração, permissões, identificação, limites e ferramentas.
// Roda num PostgreSQL em memória (PGlite), nunca na produção:
//   PGLITE_MODULE=/caminho/@electric-sql/pglite/dist/index.js node supabase/tests/whatsapp_assistant.mjs
import assert from 'node:assert/strict';
import { createAssistantDb } from './helpers/assistant_db.mjs';

const { db, migration } = await createAssistantDb();

const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-00000000000${n}`;
const [teamA, teamB] = [id(1, 1), id(1, 2)];
const users = { ana: id(4, 1), bruno: id(4, 2), carla: id(4, 3), davi: id(4, 4), eva: id(4, 5), fabio: id(4, 6) };
const prof = { ana: id(5, 1), bruno: id(5, 2), carla: id(5, 3), davi: id(5, 4), eva: id(5, 5), fabio: id(5, 6) };
const mem = { ana: id(3, 1), bruno: id(3, 2), carla: id(3, 3), davi: id(3, 4), eva: id(3, 5), fabio: id(3, 6) };
const culto = { past: id(6, 1), next: id(6, 2), later: id(6, 3), laterYouth: id(6, 4), teamB: id(6, 5) };
const song = { oracao: id(7, 1), bondade: id(7, 2), cem: id(7, 3), teamB: id(7, 4) };
const cultoSong = { nextOracao: id(8, 1), nextBondade: id(8, 2), pastBondade: id(8, 3) };
const group = '120363000000000001@g.us';
const otherGroup = '120363000000000002@g.us';

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
const asService = () => db.exec(`RESET ROLE; SELECT set_config('test.uid', '', false); SET ROLE service_role`);
const asAdmin = () => db.exec('RESET ROLE');
const rpc = async (fn, args = []) => {
  const params = args.map((_, i) => `$${i + 1}`).join(', ');
  return (await one(`SELECT public.${fn}(${params}) AS r`, args)).r;
};
const tool = (name, member, args = {}, team = teamA) =>
  rpc(`assistant_tool_${name}`, [team, member, JSON.stringify(args)]);

try {
  await db.exec(migration); // idempotente
  check((await one('SELECT count(*)::int AS n FROM public.assistant_config')).n, 1, 'config singleton');

  const today = (await one('SELECT public.assistant_today()::text AS d')).d;
  const day = async (n) => (await one(`SELECT (public.assistant_today() + ${n})::text AS d`)).d;
  const [past, next, later] = [await day(-7), await day(3), await day(10)];

  await db.exec(`
    INSERT INTO public.profiles (id, user_id, full_name, phone) VALUES
      ('${prof.ana}', '${users.ana}', 'Ana Souza', '(11) 98765-4321'),
      ('${prof.bruno}', '${users.bruno}', 'Bruno Lima', '+55 21 99999-0000'),
      ('${prof.carla}', '${users.carla}', 'Carla Dias', '8888-7777'),
      ('${prof.davi}', '${users.davi}', 'Davi Reis', null),
      ('${prof.eva}', '${users.eva}', 'Eva Castro', '(11) 91234-5678'),
      ('${prof.fabio}', '${users.fabio}', 'Fábio Nunes', '(31) 97777-1111');
    INSERT INTO public.teams (id, name, owner_id, availability_mode) VALUES
      ('${teamA}', 'Louvor Sede', '${prof.ana}', 'both'),
      ('${teamB}', 'Louvor Congregação', '${prof.eva}', 'unavailable_only');
    INSERT INTO public.team_members (id, team_id, profile_id, role, instruments, instrument_levels, permissions) VALUES
      ('${mem.ana}', '${teamA}', '${prof.ana}', 'admin', '{Ministrante,Violão}', '{"Violão":"avancado"}', '{}'),
      ('${mem.bruno}', '${teamA}', '${prof.bruno}', 'viewer', '{Violão,Soprano}', '{}', '{}'),
      ('${mem.carla}', '${teamA}', '${prof.carla}', 'editor', '{Teclado}', '{}', '{}'),
      ('${mem.davi}', '${teamA}', '${prof.davi}', 'viewer', '{Bateria}', '{}', '{"cultos":{"ver":false},"musicas":{"ver":false}}'),
      ('${mem.eva}', '${teamB}', '${prof.eva}', 'admin', '{Teclado}', '{}', '{}'),
      ('${mem.fabio}', '${teamA}', '${prof.fabio}', 'viewer', '{Baixo}', '{}', '{}');
    INSERT INTO public.cultos (id, team_id, name, date, description) VALUES
      ('${culto.past}', '${teamA}', 'Culto de Domingo', '${past}', null),
      ('${culto.next}', '${teamA}', 'Culto da Família', '${next}', 'Chegar 18h30'),
      ('${culto.later}', '${teamA}', 'Santa Ceia', '${later}', null),
      ('${culto.laterYouth}', '${teamA}', 'Culto Jovem', '${later}', null),
      ('${culto.teamB}', '${teamB}', 'Culto B', '${next}', null);
    INSERT INTO public.culto_lineup (culto_id, team_member_id, instrument, status) VALUES
      ('${culto.next}', '${mem.ana}', 'Violão', 'accepted'),
      ('${culto.next}', '${mem.ana}', 'Ministrante', 'accepted'),
      ('${culto.next}', '${mem.bruno}', 'Soprano', 'pending'),
      ('${culto.next}', '${mem.carla}', 'Teclado', 'declined'),
      ('${culto.later}', '${mem.bruno}', 'Violão', 'pending'),
      ('${culto.past}', '${mem.bruno}', 'Violão', 'accepted');
    INSERT INTO public.songs (id, team_id, title, artist, key_original, key_current, bpm, media_url, theme) VALUES
      ('${song.oracao}', '${teamA}', 'Oração ao Pai', 'Ministério X', 'A', 'G', 72, 'https://youtu.be/oracao', 'Adoração'),
      ('${song.bondade}', '${teamA}', 'Bondade de Deus', 'Isaías Saad', 'E', null, 68, null, null),
      ('${song.cem}', '${teamA}', '100% Jesus', null, 'D', null, null, null, null),
      ('${song.teamB}', '${teamB}', 'Oração ao Pai', 'Ministério X', 'C', null, null, null, null);
    INSERT INTO public.culto_songs (id, culto_id, song_id, sort_order, notes, key_override) VALUES
      ('${cultoSong.nextBondade}', '${culto.next}', '${song.bondade}', 0, null, null),
      ('${cultoSong.nextOracao}', '${culto.next}', '${song.oracao}', 2, 'Entrada suave', 'F'),
      ('${cultoSong.pastBondade}', '${culto.past}', '${song.bondade}', 0, null, null);
    INSERT INTO public.culto_blocks (culto_id, title, kind, duration_min, sort_order) VALUES
      ('${culto.next}', 'Abertura', 'moment', 5, 1);
    INSERT INTO public.culto_song_voices (culto_song_id, team_member_id, voice, voice_part) VALUES
      ('${cultoSong.nextOracao}', '${mem.bruno}', 1, null),
      ('${cultoSong.nextOracao}', '${mem.ana}', 2, 'Contralto');
    INSERT INTO public.member_availability (team_member_id, available_date, status, instruments, reason) VALUES
      ('${mem.bruno}', '${later}', 'available', '{Violão}', null),
      ('${mem.carla}', '${later}', 'unavailable', '{}', 'viagem');
  `);

  // ---- Telefones: formatos do cadastro x número do WhatsApp -------------------
  const matches = async (profilePhone, sender) =>
    (await one('SELECT public.assistant_phone_matches($1, $2) AS m', [profilePhone, sender])).m;
  check(await matches('(11) 98765-4321', '5511987654321'), true, 'celular com DDD');
  check(await matches('(11) 98765-4321', '551187654321'), true, 'WhatsApp antigo sem o nono dígito');
  check(await matches('+55 11 8765-4321', '5511987654321'), true, 'cadastro sem o nono dígito');
  check(await matches('011 98765-4321', '5511987654321'), true, 'zero de operadora');
  check(await matches('98765-4321', '5511987654321'), true, 'cadastro sem DDD');
  check(await matches('(21) 98765-4321', '5511987654321'), false, 'DDD diferente');
  check(await matches('(11) 98765-4320', '5511987654321'), false, 'número diferente');
  check(await matches('+1 (415) 555-0100', '14155550100'), true, 'fora do Brasil com código');
  check(await matches('415 555 0100', '14155550100'), true, 'fora do Brasil sem código');
  check(await matches(null, '5511987654321'), false, 'sem telefone');
  check(await matches('1234', '5511987654321'), false, 'curto demais');

  // ---- Permissões ----------------------------------------------------------------
  await as(users.ana);
  await fails('SELECT * FROM public.assistant_config', '42501');
  await fails('SELECT * FROM public.assistant_wa_identities', '42501');
  await fails(`SELECT public.assistant_consume_quota('${teamA}', '${prof.ana}')`, '42501');
  await fails(`SELECT public.assistant_tool_minha_escala('${teamA}', '${mem.bruno}', '{}')`, '42501');
  await fails(`SELECT public.assistant_resolve_sender('${teamA}', '{x@lid}', '{5521999990000}')`, '42501');
  await fails(`SELECT public.assistant_member_user('${teamA}', '${mem.bruno}')`, '42501');
  await db.exec('RESET ROLE; SET ROLE anon');
  await fails(`SELECT public.assistant_team_overview('${teamA}')`, '42501');
  await fails('SELECT public.assistant_my_status()', '42501');

  // ---- Líder: visão geral, código de ativação e instruções ------------------------
  await as(users.bruno);
  await fails(`SELECT public.assistant_team_overview('${teamA}')`, '42501');
  await fails(`SELECT public.assistant_create_activation_code('${teamA}')`, '42501');
  await fails(`SELECT public.assistant_update_instructions('${teamA}', 'oi')`, '42501');

  await as(users.ana);
  let overview = await rpc('assistant_team_overview', [teamA]);
  check([overview.platform_enabled, overview.team_enabled, overview.assistant_name, overview.groups, overview.pending_code],
    [false, true, 'Asafe', [], null], 'visão geral inicial');
  check(overview.usage, { today: 0, team_limit: 100, member_limit: 20 }, 'limites padrão');

  const first = await rpc('assistant_create_activation_code', [teamA]);
  const activation = await rpc('assistant_create_activation_code', [teamA]);
  ok(/^[A-HJ-NP-Z2-9]{6}$/.test(activation.code), 'código legível');
  check((await rpc('assistant_team_overview', [teamA])).pending_code.code, activation.code, 'só o último código vale');

  const instructions = 'Ensaio toda quinta, 20h, no templo sede.\nChegar 30 min antes do culto.';
  check(await rpc('assistant_update_instructions', [teamA, `  ${instructions}  `]), { ok: true });
  check((await rpc('assistant_team_overview', [teamA])).instructions, instructions, 'instruções salvas sem espaços nas pontas');
  await fails(`SELECT public.assistant_update_instructions('${teamA}', repeat('x', 2001))`, '22001');

  // ---- Ativação do grupo (edge function) ------------------------------------------
  await asService();
  check(await rpc('assistant_activate_group', [first.code, group, 'Louvor 🎸']), { ok: false, error: 'invalid_code' }, 'código substituído');
  check(await rpc('assistant_activate_group', ['nope', group, null]), { ok: false, error: 'invalid_code' });
  check(await rpc('assistant_activate_group', [` ${activation.code.toLowerCase()} `, group, 'Louvor 🎸']),
    { ok: true, team_id: teamA, team_name: 'Louvor Sede' }, 'ativa com código em minúsculas');
  check(await rpc('assistant_activate_group', [activation.code, group, 'Louvor 🎸']), { ok: false, error: 'used_code' });

  const ctx = await rpc('assistant_group_context', [group]);
  check([ctx.team_id, ctx.team_name, ctx.active, ctx.team_enabled, ctx.instructions, ctx.availability_mode],
    [teamA, 'Louvor Sede', true, true, instructions, 'both'], 'contexto do grupo');
  check(await rpc('assistant_group_context', [otherGroup]), null, 'grupo desconhecido');

  // Código de outra equipe não "rouba" um grupo ativo.
  await as(users.eva);
  const evaCode = await rpc('assistant_create_activation_code', [teamB]);
  await asService();
  check(await rpc('assistant_activate_group', [evaCode.code, group, null]), { ok: false, error: 'group_taken' });
  await asAdmin();
  await db.exec(`UPDATE public.assistant_activation_codes SET expires_at = now() - interval '1 minute' WHERE code = '${evaCode.code}'`);
  await asService();
  check(await rpc('assistant_activate_group', [evaCode.code, otherGroup, null]), { ok: false, error: 'expired_code' });

  // ---- Quem está falando ---------------------------------------------------------
  const resolve = (ids, phones, team = teamA) => rpc('assistant_resolve_sender', [team, ids, phones]);
  let who = await resolve(['5511987654321@s.whatsapp.net', '99001@lid'], ['5511987654321']);
  check([who.ok, who.member_id, who.full_name, who.role, who.instruments, who.source],
    [true, mem.ana, 'Ana Souza', 'admin', ['Ministrante', 'Violão'], 'phone'], 'Ana pelo telefone');
  who = await resolve(['99001@lid'], []);
  check([who.ok, who.member_id], [true, mem.ana], 'Ana só pelo @lid, já aprendido');
  who = await resolve(['99002@lid'], ['552199990000']);
  check([who.ok, who.member_id], [true, mem.bruno], 'Bruno com número antigo (sem o nono dígito)');
  check(await resolve(['99003@lid'], []), { ok: false, error: 'no_phone' }, 'WhatsApp escondeu o número');
  check(await resolve(['5511900000000@s.whatsapp.net'], ['5511900000000']), { ok: false, error: 'unknown' });
  check(await resolve(['5511912345678@s.whatsapp.net'], ['5511912345678']), { ok: false, error: 'unknown' },
    'membro de outra equipe não é achado pelo telefone');

  // Dois membros batem com o mesmo número: não chuta ninguém.
  await asAdmin();
  await db.exec(`UPDATE public.profiles SET phone = '(31) 98888-7777' WHERE id = '${prof.fabio}'`);
  await asService();
  check(await resolve(['5531988887777@s.whatsapp.net'], ['5531988887777']), { ok: false, error: 'ambiguous' });

  // Telefone do perfil mudou: o vínculo feito pelo telefone antigo é refeito.
  await asAdmin();
  await db.exec(`UPDATE public.profiles SET phone = '(11) 97777-0000' WHERE id = '${prof.ana}'`);
  await asService();
  check(await resolve(['5511987654321@s.whatsapp.net'], ['5511987654321']), { ok: false, error: 'unknown' },
    'número antigo da Ana não vale mais');
  who = await resolve(['5511977770000@s.whatsapp.net', '99001@lid'], ['5511977770000']);
  check([who.ok, who.member_id], [true, mem.ana], 'Ana com o número novo');
  await asAdmin();
  await db.exec(`UPDATE public.profiles SET phone = '(11) 98765-4321' WHERE id = '${prof.ana}'`);

  // ---- Vínculo por código (quando o WhatsApp esconde o número) --------------------
  await as(users.carla);
  let status = await rpc('assistant_my_status');
  check([status.enabled, status.has_phone, status.linked], [false, false, false], 'Carla: telefone sem DDD, sem vínculo');
  const link = await rpc('assistant_create_link_code');
  await asService();
  check(await rpc('assistant_link_identity', ['XXXXXX', ['77001@lid']]), { ok: false, error: 'invalid_code' });
  check(await rpc('assistant_link_identity', [link.code, []]), { ok: false, error: 'no_sender' });
  check(await rpc('assistant_link_identity', [link.code, ['77001@lid']]), { ok: true, full_name: 'Carla Dias' });
  check(await rpc('assistant_link_identity', [link.code, ['77001@lid']]), { ok: false, error: 'used_code' });
  await asAdmin();
  check((await rows(`SELECT type, title, link FROM public.notifications WHERE profile_id = '${prof.carla}'`)),
    [{ type: 'assistant', title: 'WhatsApp vinculado ao assistente', link: '/app/settings' }], 'dona avisada no app');
  await as(users.carla);
  const exposed = await rpc('assistant_create_link_code');
  await asService();
  check(await rpc('assistant_burn_link_code', [exposed.code.toLowerCase()]), true, 'código que apareceu no grupo é invalidado');
  check(await rpc('assistant_burn_link_code', [exposed.code]), false);
  check(await rpc('assistant_link_identity', [exposed.code, ['66666@lid']]), { ok: false, error: 'used_code' }, 'ninguém usa o código exposto');
  who = await resolve(['77001@lid'], []);
  check([who.ok, who.member_id, who.source], [true, mem.carla, 'code'], 'Carla pelo vínculo');
  await as(users.carla);
  check((await rpc('assistant_my_status')).linked, true);
  check(await rpc('assistant_unlink_me'), { ok: true, removed: 1 }, 'desvincula');
  check((await rpc('assistant_my_status')).linked, false);
  await asService();
  check(await resolve(['77001@lid'], []), { ok: false, error: 'no_phone' }, 'depois de desvincular, o @lid não vale mais');
  await as(users.carla);
  const relink = await rpc('assistant_create_link_code');
  await asService();
  check((await rpc('assistant_link_identity', [relink.code, ['77001@lid']])).ok, true);

  // O mesmo WhatsApp com um perfil em cada equipe: o vínculo de uma não trava a outra.
  await asAdmin();
  const twin = { user: id(4, 7), prof: id(5, 7), mem: id(3, 7) };
  await db.exec(`
    INSERT INTO public.profiles (id, user_id, full_name, phone) VALUES ('${twin.prof}', '${twin.user}', 'Ana (conta da congregação)', '11 98765-4321');
    INSERT INTO public.team_members (id, team_id, profile_id, role) VALUES ('${twin.mem}', '${teamB}', '${twin.prof}', 'viewer');`);
  await asService();
  who = await resolve(['5511987654321@s.whatsapp.net', '99001@lid'], ['5511987654321'], teamB);
  check([who.ok, who.member_id], [true, twin.mem], 'na outra equipe, acha o perfil de lá pelo telefone');
  who = await resolve(['99001@lid'], [], teamA);
  check([who.ok, who.member_id], [true, mem.ana], 'e o vínculo da primeira equipe continua');
  check(await resolve(['99001@lid'], [], teamB), { ok: false, error: 'not_member' }, 'sem telefone, não chuta o perfil de outra equipe');

  // Vínculo de alguém que não é da equipe do grupo.
  await as(users.eva);
  const evaLink = await rpc('assistant_create_link_code');
  await asService();
  await rpc('assistant_link_identity', [evaLink.code, ['55001@lid']]);
  check(await resolve(['55001@lid'], []), { ok: false, error: 'not_member' });

  // ---- Limites diários -----------------------------------------------------------
  const quota = (profile) => rpc('assistant_consume_quota', [teamA, profile]);
  check(await quota(prof.ana), { allowed: false, reason: 'disabled' }, 'desligado até configurar o número');
  await asAdmin();
  await db.exec(`UPDATE public.assistant_config SET enabled = true, bot_phone = '5511955554444'`);
  await db.exec(`INSERT INTO public.assistant_team_settings (team_id, team_daily_limit, member_daily_limit) VALUES ('${teamA}', 3, 2)
                 ON CONFLICT (team_id) DO UPDATE SET team_daily_limit = 3, member_daily_limit = 2`);
  await asService();
  check(await quota(prof.ana), { allowed: true, day: today, team_used: 1, team_limit: 3, member_used: 1, member_limit: 2 });
  check((await quota(prof.ana)).member_used, 2);
  check(await quota(prof.ana), { allowed: false, reason: 'member_limit', notify: true, limit: 2 }, 'avisa uma vez');
  check(await quota(prof.ana), { allowed: false, reason: 'member_limit', notify: false, limit: 2 }, 'depois fica quieto');
  check((await quota(prof.bruno)).team_used, 3);
  check(await quota(prof.carla), { allowed: false, reason: 'team_limit', notify: true, limit: 3 });
  await rpc('assistant_refund_quota', [teamA, prof.bruno, await day(1)]);
  check((await quota(prof.carla)).allowed, false, 'devolução de outro dia não mexe em hoje');
  await rpc('assistant_refund_quota', [teamA, prof.bruno, today]);
  check((await quota(prof.carla)).allowed, true, 'devolução no dia da reserva libera uma pergunta');
  await asAdmin();
  await db.exec(`UPDATE public.assistant_team_settings SET unlimited = true WHERE team_id = '${teamA}'`);
  await asService();
  check(await quota(prof.ana), { allowed: true, day: today, team_used: 4, team_limit: null, member_used: 3, member_limit: null }, 'sem limite');
  await asAdmin();
  await db.exec(`UPDATE public.assistant_team_settings SET enabled = false WHERE team_id = '${teamA}'`);
  await asService();
  check(await quota(prof.ana), { allowed: false, reason: 'disabled' }, 'equipe suspensa');
  await asAdmin();
  await db.exec(`UPDATE public.assistant_team_settings SET enabled = true, unlimited = false WHERE team_id = '${teamA}'`);
  await as(users.ana);
  overview = await rpc('assistant_team_overview', [teamA]);
  check([overview.platform_enabled, overview.bot_phone, overview.usage], [true, '5511955554444', { today: 4, team_limit: 3, member_limit: 2 }]);
  check(overview.groups.map((g) => [g.name, g.activated_by]), [['Louvor 🎸', 'Ana Souza']]);

  // ---- Histórico, deduplicação e avisos ---------------------------------------------
  await asService();
  await rpc('assistant_log_exchange', [group, teamA, prof.bruno, 'W1', 'qual minha escala?', 'Domingo, Soprano.', 1200, 80, 'gpt-6-luna', null]);
  await rpc('assistant_log_exchange', [group, teamA, prof.bruno, 'W2', 'e o tom?', null, 0, 0, null, 'openai_error']);
  await rpc('assistant_log_exchange', [group, teamA, prof.bruno, 'W3', 'e no outro?', 'Santa Ceia, Violão.', 900, 60, 'gpt-6-luna', null]);
  await rpc('assistant_log_exchange', [group, teamA, prof.ana, 'W4', 'oi', 'Oi, Ana!', 10, 5, 'gpt-6-luna', null]);
  check(await rpc('assistant_history', [group, prof.bruno, 4, 60]), [
    { role: 'user', content: 'qual minha escala?' }, { role: 'assistant', content: 'Domingo, Soprano.' },
    { role: 'user', content: 'e no outro?' }, { role: 'assistant', content: 'Santa Ceia, Violão.' },
  ], 'histórico só da pessoa, sem a pergunta que falhou');
  check(await rpc('assistant_history', [group, prof.bruno, 1, 60]), [
    { role: 'user', content: 'e no outro?' }, { role: 'assistant', content: 'Santa Ceia, Violão.' },
  ], 'respeita a quantidade de trocas');
  await asAdmin();
  check(await one(`SELECT tokens_in::int, tokens_out::int FROM public.assistant_usage_daily WHERE team_id = '${teamA}'`),
    { tokens_in: 2110, tokens_out: 145 });
  await db.exec(`UPDATE public.assistant_messages SET created_at = now() - interval '2 hours' WHERE wa_message_id = 'W1'
                 OR (direction = 'out' AND body = 'Domingo, Soprano.')`);
  await asService();
  check((await rpc('assistant_history', [group, prof.bruno, 4, 60])).length, 2, 'janela de tempo');

  check(await rpc('assistant_claim_message', ['ABC']), true);
  check(await rpc('assistant_claim_message', ['ABC']), false, 'webhook repetido');
  check(await rpc('assistant_should_notify', ['unknown:x', 60]), true);
  check(await rpc('assistant_should_notify', ['unknown:x', 60]), false, 'não repete o aviso');
  check(await rpc('assistant_should_notify', ['unknown:x', 0]), true, 'janela vencida');

  await rpc('assistant_note_bot_ids', [['5511955554444@s.whatsapp.net', '88001@lid']]);
  await rpc('assistant_note_bot_ids', [['88001@lid']]);
  check((await rpc('assistant_runtime_config')).bot_ids, ['5511955554444@s.whatsapp.net', '88001@lid']);
  await rpc('assistant_touch_event');
  await asAdmin();
  ok((await one('SELECT last_event_at IS NOT NULL AS t FROM public.assistant_config')).t, 'pulso da Evolution');

  // ---- Ferramentas de consulta -----------------------------------------------------
  await asService();
  let r = await tool('minha_escala', mem.ana);
  check(r, { hoje: today, escalas: [{ culto_id: culto.next, culto: 'Culto da Família', data: next,
    dia_semana: r.escalas[0].dia_semana, funcoes: ['Ministrante', 'Violão'], confirmacao: 'confirmado' }] }, 'escala da Ana');
  r = await tool('minha_escala', mem.bruno);
  check(r.escalas.map((e) => [e.culto, e.funcoes, e.confirmacao]),
    [['Culto da Família', ['Soprano'], 'pendente'], ['Santa Ceia', ['Violão'], 'pendente']], 'sem cultos passados');
  check((await tool('minha_escala', mem.bruno, { limite: 1 })).escalas.length, 1);
  check((await tool('minha_escala', mem.bruno, { limite: '99999999999' })).escalas.length, 2, 'limite absurdo não quebra');
  check((await tool('minha_escala', mem.carla)).escalas[0].confirmacao, 'recusado');
  check(await tool('minha_escala', mem.davi), { erro: 'sem_permissao', detalhe: 'O acesso desta pessoa aos cultos está bloqueado na equipe.' });
  check(await tool('minha_escala', mem.eva), { erro: 'membro_invalido' }, 'membro de outra equipe');

  check(await tool('meus_instrumentos', mem.ana), { funcoes: ['Ministrante', 'Violão'], niveis: { Violão: 'avancado' }, papel: 'líder' });
  check(await tool('meus_instrumentos', mem.eva), { erro: 'membro_invalido' });

  r = await tool('proximos_cultos', mem.bruno);
  check(r.cultos.map((c) => [c.culto, c.minhas_funcoes, c.pessoas_escaladas, c.musicas]), [
    ['Culto da Família', ['Soprano'], 3, 2], ['Culto Jovem', [], 0, 0], ['Santa Ceia', ['Violão'], 1, 0],
  ], 'próximos cultos da equipe');
  check((await tool('proximos_cultos', mem.bruno, { de: later, ate: later })).cultos.length, 2);
  check((await tool('proximos_cultos', mem.bruno, { de: 'amanhã' })).cultos.length, 3, 'data inválida vira hoje');

  r = await tool('detalhes_culto', mem.bruno);
  const details = r.cultos[0];
  check([details.culto, details.descricao, details.minhas_funcoes], ['Culto da Família', 'Chegar 18h30', ['Soprano']], 'próximo culto');
  check(details.escala.map((e) => [e.funcao, e.pessoas.map((p) => `${p.nome}:${p.confirmacao}`)]), [
    ['Ministrante', ['Ana Souza:confirmado']], ['Soprano', ['Bruno Lima:pendente']],
    ['Violão', ['Ana Souza:confirmado']], ['Teclado', ['Carla Dias:recusado']],
  ], 'escala em ordem de função');
  check(details.roteiro.map((i) => [i.tipo, i.titulo, i.tom ?? null]), [
    ['musica', 'Bondade de Deus', 'E'], ['momento', 'Abertura', null], ['musica', 'Oração ao Pai', 'F'],
  ], 'roteiro na ordem, com o tom do culto');
  check([details.roteiro[2].tom_original, details.roteiro[2].bpm, details.roteiro[2].observacao, details.roteiro[2].vozes], [
    'A', 72, 'Entrada suave', [{ nome: 'Bruno Lima', voz: 1, naipe: null }, { nome: 'Ana Souza', voz: 2, naipe: 'Contralto' }],
  ]);
  check((await tool('detalhes_culto', mem.bruno, { data: later })).cultos.map((c) => c.culto), ['Culto Jovem', 'Santa Ceia'], 'dois cultos no dia');
  check((await tool('detalhes_culto', mem.bruno, { culto_id: culto.teamB })).cultos, [], 'culto de outra equipe');
  check((await tool('detalhes_culto', mem.bruno, { data: '2020-01-01' })).aviso, 'nenhum culto encontrado');

  r = await tool('buscar_musica', mem.bruno, { termo: 'oracao' });
  check(r.musicas.map((m) => [m.titulo, m.tom, m.tom_original, m.bpm, m.link]),
    [['Oração ao Pai', 'G', 'A', 72, 'https://youtu.be/oracao']], 'busca sem acento e só da equipe');
  check(r.musicas[0].proxima_vez, { data: next, dia_semana: r.musicas[0].proxima_vez.dia_semana, culto: 'Culto da Família', tom: 'F' });
  check((await tool('buscar_musica', mem.bruno, { termo: 'bondade' })).musicas[0].ultima_vez, { data: past, culto: 'Culto de Domingo' });
  check((await tool('buscar_musica', mem.bruno, { termo: '100%' })).musicas.map((m) => m.titulo), ['100% Jesus'], '% literal');
  check((await tool('buscar_musica', mem.bruno, { termo: '%' })).erro, 'termo_curto');
  check((await tool('buscar_musica', mem.bruno, { termo: 'saad' })).musicas.map((m) => m.titulo), ['Bondade de Deus'], 'por artista');
  check((await tool('buscar_musica', mem.davi, { termo: 'oracao' })).erro, 'sem_permissao');

  r = await tool('disponibilidade_equipe', mem.bruno, { data: later });
  check([r.modo_da_equipe, r.disponiveis, r.indisponiveis, r.sem_resposta, r.cultos_no_dia.map((c) => c.culto)], [
    'both', [{ nome: 'Bruno Lima', funcoes: ['Violão'] }], ['Carla Dias'], ['Ana Souza', 'Davi Reis', 'Fábio Nunes'], ['Culto Jovem', 'Santa Ceia'],
  ], 'disponibilidade do dia, sem motivos');
  ok(!JSON.stringify(r).includes('viagem'), 'motivo não vaza');
  check((await tool('disponibilidade_equipe', mem.bruno, { data: 'sexta' })).erro, 'data_invalida');

  r = await tool('minha_disponibilidade', mem.carla);
  check(r.marcacoes, [{ data: later, dia_semana: r.marcacoes[0].dia_semana, status: 'indisponível' }]);
  ok(!JSON.stringify(r).includes('viagem'), 'motivo da própria pessoa também não aparece no grupo');

  // ---- Ações da própria pessoa --------------------------------------------------------
  r = await tool('responder_escala', mem.bruno, { culto_id: culto.next, resposta: 'confirmar' });
  check([r.ok, r.funcoes, r.confirmacao], [true, ['Soprano'], 'confirmado']);
  await asAdmin();
  check((await rows(`SELECT instrument, status::text FROM public.culto_lineup WHERE culto_id = '${culto.next}' ORDER BY instrument`))
    .map((l) => `${l.instrument}:${l.status}`),
    ['Ministrante:accepted', 'Soprano:accepted', 'Teclado:declined', 'Violão:accepted'], 'só a linha do Bruno mudou');
  await asService();
  check((await tool('responder_escala', mem.bruno, { culto_id: culto.past, resposta: 'recusar' })).erro, 'culto_passado');
  check((await tool('responder_escala', mem.bruno, { culto_id: culto.laterYouth, resposta: 'recusar' })).erro, 'nao_escalado');
  check((await tool('responder_escala', mem.bruno, { culto_id: culto.teamB, resposta: 'recusar' })).erro, 'culto_nao_encontrado');
  check((await tool('responder_escala', mem.bruno, { culto_id: culto.next, resposta: 'talvez' })).erro, 'resposta_invalida');

  r = await tool('marcar_disponibilidade', mem.bruno, { data: later, status: 'indisponível', motivo: 'plantão' });
  check([r.ok, r.status, r.escalado_neste_dia.map((c) => c.culto)], [true, 'indisponível', ['Santa Ceia']], 'avisa que está escalado');
  r = await tool('marcar_disponibilidade', mem.bruno, { data: next, status: 'disponivel' });
  check([r.ok, r.status, r.escalado_neste_dia], [true, 'disponível', []]);
  await asAdmin();
  check(await one(`SELECT status, instruments, reason FROM public.member_availability WHERE team_member_id = '${mem.bruno}' AND available_date = '${later}'`),
    { status: 'unavailable', instruments: [], reason: 'plantão' });
  check((await one(`SELECT instruments FROM public.member_availability WHERE team_member_id = '${mem.bruno}' AND available_date = '${next}'`)).instruments,
    ['Violão', 'Soprano'], 'disponível com as funções do cadastro');
  await asService();
  check((await tool('marcar_disponibilidade', mem.bruno, { data: later, status: 'remover' })).removido, true);
  check((await tool('marcar_disponibilidade', mem.bruno, { data: past, status: 'indisponivel' })).erro, 'data_invalida');
  check((await tool('marcar_disponibilidade', mem.bruno, { data: later, status: 'ocupado' })).erro, 'status_invalido');
  await asAdmin();
  await db.exec(`UPDATE public.teams SET availability_mode = 'unavailable_only' WHERE id = '${teamA}'`);
  await asService();
  check(await tool('marcar_disponibilidade', mem.bruno, { data: later, status: 'disponivel' }),
    { ok: false, erro: 'modo_da_equipe', modo_da_equipe: 'unavailable_only' }, 'respeita o modo da equipe');
  r = await tool('disponibilidade_equipe', mem.bruno, { data: later });
  check([r.disponiveis, r.indisponiveis, r.sem_resposta], [null, ['Carla Dias'], null], 'modo só indisponibilidade');

  // Sem "cultos: ver": não responde escala nem vê nomes de culto pela disponibilidade.
  await asAdmin();
  await db.exec(`UPDATE public.teams SET availability_mode = 'both' WHERE id = '${teamA}';
                 INSERT INTO public.culto_lineup (culto_id, team_member_id, instrument) VALUES ('${culto.later}', '${mem.davi}', 'Bateria');`);
  await asService();
  check((await tool('responder_escala', mem.davi, { culto_id: culto.later, resposta: 'confirmar' })).erro, 'sem_permissao');
  r = await tool('disponibilidade_equipe', mem.davi, { data: later });
  check([r.cultos_no_dia, Array.isArray(r.indisponiveis)], [null, true], 'disponibilidade sem nomes de culto');
  r = await tool('marcar_disponibilidade', mem.davi, { data: later, status: 'indisponivel' });
  check([r.ok, r.escalado_neste_dia], [true, []], 'marca, sem revelar o culto');

  // ---- Desligar o grupo ------------------------------------------------------------------
  check(await rpc('assistant_deactivate_group_jid', [group, prof.bruno]), { ok: false, error: 'forbidden' }, 'membro comum não desliga');
  check(await rpc('assistant_deactivate_group_jid', [group, prof.ana]), { ok: true }, 'líder desliga pelo grupo');
  check((await rpc('assistant_group_context', [group])).active, false);
  check(await rpc('assistant_deactivate_group_jid', [group, null]), { ok: false, error: 'not_active' });

  await as(users.ana);
  const again = await rpc('assistant_create_activation_code', [teamA]);
  await asService();
  check((await rpc('assistant_activate_group', [again.code, group, null])).ok, true, 'reativa');
  check((await rpc('assistant_group_context', [group])).group_name, 'Louvor 🎸', 'mantém o nome conhecido');
  await as(users.ana);
  const groupId = (await rpc('assistant_team_overview', [teamA])).groups[0].id;
  await as(users.bruno);
  await fails(`SELECT public.assistant_deactivate_group('${groupId}')`, '42501');
  await as(users.ana);
  check(await rpc('assistant_deactivate_group', [groupId]), { ok: true });
  check((await rpc('assistant_team_overview', [teamA])).groups, [], 'some da lista');

  console.log(`${checks} PostgreSQL checks passed: grants, activation, phone/LID identity, link code, daily limits, history, dedup, tools and actions.`);
} finally {
  await db.close();
}
