// Asafe: aviso de IA de terceiros (OpenAI) e consentimento explícito.
// Equipes que já usavam o assistente (pendentes), ativação e vínculo exigindo o
// aceite, permissão por pessoa (opt-in, com a tolerância de quem já usava),
// revogação, uso dos dados (identificação, ferramentas, menções e citações), RLS
// e o handler real da edge function.
// Roda num PostgreSQL em memória (PGlite), nunca na produção:
//   PGLITE_MODULE=/caminho/@electric-sql/pglite/dist/index.js node supabase/tests/assistant_ai_consent.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAssistantDb, serviceRpc, withRole } from './helpers/assistant_db.mjs';
import { createHandler } from '../functions/whatsapp-assistant/handler.ts';
import { AI_DISCLOSURE_LINE } from '../functions/whatsapp-assistant/persona.ts';

const { db } = await createAssistantDb({
  extraMigrations: ['20260929120000_assistant_notifications.sql', '20260930120000_assistant_missions.sql'],
});
const consentMigration = await readFile(new URL('../migrations/20261003133000_assistant_ai_consent.sql', import.meta.url), 'utf8');

const VERSION = '2026-10-03';
let checks = 0;
const check = (actual, expected, label = 'valor diferente') => { assert.deepEqual(actual, expected, label); checks++; };
const ok = (value, label = 'condição falsa') => { assert.ok(value, label); checks++; };
const sql = async (query, params) => (await db.query(query, params)).rows;
const one = async (query, params) => (await sql(query, params))[0];
const rpc = serviceRpc(db);
const run = (role, uid, query, params) => withRole(db, role, uid, async (tx) => (await tx.query(query, params)).rows);
const call = async (uid, fn, args = []) =>
  (await run('authenticated', uid, `SELECT public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) AS r`, args))[0].r;
const fails = async (promise, code, label, message) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `${label}: ${error.message}`);
    if (message) assert.match(error.message, message, label);
    return true;
  });
  checks++;
};

const uuid = () => crypto.randomUUID();
const person = (name, phone) => ({ name, phone, user: uuid(), profile: uuid(), member: uuid() });
const ana = person('Ana Souza', '(11) 98765-4321');     // líder da equipe A (já usava o Asafe)
const bruno = person('Bruno Lima', '(21) 99999-0000');  // membro da A, reconhecido pelo telefone
const carla = person('Carla Dias', null);               // membro da A, vinculada por código antes do aviso
const ines = person('Inês Prado', '(31) 97777-1111');   // membro da A que divide o número com o Jonas
const jonas = person('Jonas Prado', '(31) 97777-1111');
const eva = person('Eva Castro', '(11) 91234-5678');    // líder da equipe B (já usava, vai desativar)
const gil = person('Gil Moura', '(41) 98888-2222');     // líder da equipe C (nova)
const hugo = person('Hugo Reis', '(41) 98888-3333');    // membro da C
const kleber = person('Kleber Luz', null);              // membro da C, com código antigo
const lia = person('Lia Torres', '(11) 96666-5555');    // entra na A depois do aviso (sem tolerância)
const [teamA, teamB, teamC] = [uuid(), uuid(), uuid()];
const groupA = '120363000000000001@g.us';
const groupB = '120363000000000002@g.us';
const groupC = '120363000000000003@g.us';
const BOT_PN = '5511955554444@s.whatsapp.net';
const BOT_LID = '88001@lid';
const wa = {
  ana: { pn: '5511987654321@s.whatsapp.net', lid: '10001@lid' },
  bruno: { pn: '552199990000@s.whatsapp.net', lid: '10002@lid' },
  carla: { lid: '10003@lid' },
  jonas: { pn: '5531977771111@s.whatsapp.net', lid: '10009@lid' },
  gil: { pn: '5541988882222@s.whatsapp.net', lid: '10006@lid' },
  hugo: { pn: '5541988883333@s.whatsapp.net', lid: '10007@lid' },
  kleber: { lid: '10008@lid' },
  lia: { pn: '5511966665555@s.whatsapp.net', lid: '10010@lid' },
  ines: { pn: '5531977771111@s.whatsapp.net' },
};

try {
  // ---- Antes do aviso: equipes A e B já usam o Asafe ---------------------------------
  const later = (await one('SELECT (public.assistant_today() + 10)::text AS d')).d;
  for (const p of [ana, bruno, carla, ines, jonas, eva, gil, hugo, kleber, lia]) {
    await sql('INSERT INTO public.profiles (id, user_id, full_name, phone) VALUES ($1, $2, $3, $4)', [p.profile, p.user, p.name, p.phone]);
  }
  await sql(`INSERT INTO public.teams (id, name, owner_id) VALUES ($1, 'Louvor Sede', $2), ($3, 'Louvor Bairro', $4), ($5, 'Louvor Jovem', $6)`,
    [teamA, ana.profile, teamB, eva.profile, teamC, gil.profile]);
  for (const [team, p, role] of [[teamA, ana, 'admin'], [teamA, bruno, 'viewer'], [teamA, carla, 'editor'], [teamA, ines, 'viewer'],
    [teamA, jonas, 'viewer'], [teamB, eva, 'admin'], [teamC, gil, 'admin'], [teamC, hugo, 'viewer'], [teamC, kleber, 'viewer']]) {
    await sql(`INSERT INTO public.team_members (id, team_id, profile_id, role, instruments) VALUES ($1, $2, $3, $4, '{Violão}')`,
      [p.member, team, p.profile, role]);
  }
  await sql(`INSERT INTO public.member_availability (team_member_id, available_date, status, instruments) VALUES
    ($1, $3, 'available', '{Violão}'), ($2, $3, 'available', '{Violão}')`, [ana.member, bruno.member, later]);
  await sql(`UPDATE public.assistant_config SET enabled = true, bot_phone = '5511955554444'`);

  const activateOld = async (leader, team, group) => {
    const code = await call(leader.user, 'assistant_create_activation_code', [team]);
    check((await rpc('assistant_activate_group', { p_code: code.code, p_group_jid: group, p_group_name: 'Grupo' })).ok, true, 'ativação antiga');
  };
  await activateOld(ana, teamA, groupA);
  await activateOld(eva, teamB, groupB);
  check((await rpc('assistant_resolve_sender', { p_team_id: teamA, p_wa_ids: [wa.bruno.pn, wa.bruno.lid], p_phones: ['552199990000'] })).ok, true);
  const carlaCode = await call(carla.user, 'assistant_create_link_code');
  check((await rpc('assistant_link_identity', { p_code: carlaCode.code, p_wa_ids: [wa.carla.lid] })).ok, true, 'vínculo antigo da Carla');
  const kleberOldCode = await call(kleber.user, 'assistant_create_link_code'); // gerado antes do aviso, ainda sem uso

  // ---- A migração (idempotente) ---------------------------------------------------------
  await db.exec(consentMigration);
  check((await one(`SHOW lock_timeout`)).lock_timeout, '0', 'lock_timeout volta ao padrão no fim da migração');
  // As tolerâncias têm prazo desde o deploy: 30 dias depois da primeira aplicação.
  const deadline = await one(`SELECT ai_consent_required_from AS d, ai_consent_required_from > now() + interval '29 days'
    AND ai_consent_required_from <= now() + interval '30 days' AS ok FROM public.assistant_config`);
  check(deadline.ok, true, 'prazo padrão de 30 dias');
  // Grupos que já estavam ativos ainda não receberam a linha da OpenAI.
  check((await sql(`SELECT ai_disclosure_version FROM public.assistant_groups ORDER BY group_jid`)).map((r) => r.ai_disclosure_version),
    [null, null], 'grupos antigos sem a linha de transparência');
  // Opt-out fora de profiles: a equipe lê profiles inteiro.
  check((await one(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name = 'profiles' AND column_name = 'assistant_ai_opt_out'`)).n, 0, 'profiles sem o opt-out');
  const legacyNames = async () => (await sql(`SELECT p.full_name || '@' || t.name AS who FROM public.assistant_ai_legacy_members l
    JOIN public.profiles p ON p.id = l.profile_id JOIN public.teams t ON t.id = l.team_id ORDER BY 1`)).map((r) => r.who);
  const legacyAtStart = ['Ana Souza@Louvor Sede', 'Bruno Lima@Louvor Sede', 'Carla Dias@Louvor Sede', 'Eva Castro@Louvor Bairro',
    'Inês Prado@Louvor Sede', 'Jonas Prado@Louvor Sede'];
  check(await legacyNames(), legacyAtStart, 'tolerância: só quem estava numa equipe ativa');
  // Lia entra na equipe A depois do aviso: rodar a migração de novo não a acrescenta.
  await sql(`INSERT INTO public.team_members (id, team_id, profile_id, role, instruments) VALUES ($1, $2, $3, 'viewer', '{Violão}')`,
    [lia.member, teamA, lia.profile]);
  await db.exec(consentMigration);
  check(await legacyNames(), legacyAtStart, 'a foto é tirada uma vez só');
  check((await one('SELECT ai_consent_required_from AS d FROM public.assistant_config')).d, deadline.d, 'rodar de novo não muda o prazo');
  // O restante começa sem prazo (null) e define o prazo quando precisa.
  await sql(`UPDATE public.assistant_config SET ai_consent_required_from = null`);
  check((await one(`SELECT public.assistant_ai_consent_version() AS v`)).v, VERSION, 'versão do texto');
  check((await one(`SELECT count(*)::int AS n FROM public.assistant_ai_consents`)).n, 0, 'nenhum consentimento inventado');

  // ---- Equipes que já usavam: pendentes, sem parar -----------------------------------------
  let overview = await call(ana.user, 'assistant_team_overview', [teamA]);
  check(overview.ai_consent, { state: 'pending', current_version: VERSION, version: null, accepted_at: null, accepted_by: null }, 'A pendente');
  check((await rpc('assistant_group_context', { p_group_jid: groupA })).ai_consent, 'pending', 'contexto do grupo');
  check(await call(ana.user, 'assistant_consent_prompts'), {
    version: VERSION, assistant_name: 'Asafe', member_notice: true, member_legacy: true, grace_until: null,
    teams: [{ team_id: teamA, team_name: 'Louvor Sede', state: 'pending', groups: 1 }],
  }, 'líder da A recebe o aviso que pede decisão');
  check(await call(bruno.user, 'assistant_consent_prompts'),
    { version: VERSION, assistant_name: 'Asafe', member_notice: true, member_legacy: true, grace_until: null, teams: [] },
    'membro vê só o aviso de membro (ainda reconhecido pela tolerância)');
  check(await call(lia.user, 'assistant_consent_prompts'),
    { version: VERSION, assistant_name: 'Asafe', member_notice: true, member_legacy: false, grace_until: null, teams: [] },
    'quem entrou depois vê o aviso, sem tolerância');
  check((await call(gil.user, 'assistant_consent_prompts')).member_notice, false, 'equipe sem grupo ativo: sem aviso');
  let who = await rpc('assistant_resolve_sender', { p_team_id: teamA, p_wa_ids: [wa.bruno.lid], p_phones: [] });
  check([who.ok, who.member_id], [true, bruno.member], 'pendente continua reconhecendo');
  check((await rpc('assistant_resolve_sender', { p_team_id: teamA, p_wa_ids: [wa.carla.lid], p_phones: [] })).ok, true, 'vínculo antigo continua');
  check((await rpc('assistant_consume_quota', { p_team_id: teamA, p_profile_id: bruno.profile })).allowed, true, 'e responde');
  check((await call(bruno.user, 'assistant_my_status')).ai_consent,
    { state: 'pending', allowed: true, legacy: true, grace_until: null, accepted_at: null, current_version: VERSION },
    'Bruno ainda não decidiu (tolerância)');

  // Opt-in: quem não estava na equipe ativa quando o aviso chegou só é reconhecido depois de permitir.
  check((await call(lia.user, 'assistant_my_status')).ai_consent,
    { state: 'pending', allowed: false, legacy: false, grace_until: null, accepted_at: null, current_version: VERSION },
    'Lia: sem permissão, sem tolerância');
  check(await rpc('assistant_resolve_sender', { p_team_id: teamA, p_wa_ids: [wa.lia.pn, wa.lia.lid], p_phones: ['5511966665555'] }),
    { ok: false, error: 'unknown' }, 'Lia sem permissão: desconhecida');
  check((await one(`SELECT count(*)::int AS n FROM public.assistant_wa_identities WHERE profile_id = $1`, [lia.profile])).n, 0,
    'nada aprendido de quem não permitiu');
  await sql(`INSERT INTO public.member_availability (team_member_id, available_date, status, instruments) VALUES ($1, $2, 'available', '{Violão}')`,
    [lia.member, later]);
  let availA = await rpc('assistant_tool_disponibilidade_equipe', { p_team_id: teamA, p_member_id: ana.member, p_args: { data: later } });
  ok(!JSON.stringify(availA).includes('Lia'), 'Lia fora das listas enviadas à IA');
  check(availA.nao_compartilham, 1, 'só a contagem');
  check(Object.keys(await rpc('assistant_notice_mentions', { p_team_id: teamA, p_profile_ids: [ana.profile, lia.profile],
    p_participants: [{ ids: [wa.ana.pn] }, { ids: [wa.lia.pn] }] })), [ana.profile], 'Lia não é marcada');
  check(await rpc('assistant_quote_author_allowed', { p_team_id: teamA, p_wa_ids: [wa.lia.pn] }), false, 'citação da Lia: não vai');
  check(await rpc('assistant_quote_author_allowed', { p_team_id: teamA, p_wa_ids: [wa.ana.pn] }), true, 'citação da Ana (tolerância): vai');

  // ---- Ativação nova exige o aceite do líder --------------------------------------------
  await fails(call(gil.user, 'assistant_create_activation_code', [teamC]), 'P0001', 'sem aceite não gera código', /consent_required/);
  await fails(call(gil.user, 'give_assistant_consent', ['team_activation', teamC, '2025-01-01']), '22023', 'texto antigo', /outdated_version/);
  await fails(call(gil.user, 'give_assistant_consent', ['team_activation', teamC, null]), '22023', 'sem versão');
  await fails(call(gil.user, 'give_assistant_consent', ['qualquer', teamC, VERSION]), '22023', 'escopo inválido');
  await fails(call(hugo.user, 'give_assistant_consent', ['team_activation', teamC, VERSION]), '42501', 'membro não aceita pela equipe');
  await fails(call(eva.user, 'give_assistant_consent', ['team_activation', teamC, VERSION]), '42501', 'líder de outra equipe');
  await fails(call(gil.user, 'give_assistant_consent', ['team_activation', null, VERSION]), '42501', 'equipe obrigatória');
  check(await call(gil.user, 'give_assistant_consent', ['team_activation', teamC, VERSION]),
    { ok: true, scope: 'team_activation', team_id: teamC, state: 'granted', version: VERSION }, 'Gil aceita');
  check((await call(gil.user, 'give_assistant_consent', ['team_activation', teamC, VERSION])).ok, true, 'aceitar de novo');
  check((await one(`SELECT count(*)::int AS n FROM public.assistant_ai_consents WHERE team_id = $1`, [teamC])).n, 1, 'idempotente');
  const codeC = await call(gil.user, 'assistant_create_activation_code', [teamC]);
  ok(/^[A-HJ-NP-Z2-9]{6}$/.test(codeC.code), 'código gerado com o aceite');
  check((await rpc('assistant_activate_group', { p_code: codeC.code, p_group_jid: groupC, p_group_name: 'Jovens' })).ok, true, 'ativa');
  check((await one('SELECT ai_disclosure_version AS v FROM public.assistant_groups WHERE group_jid = $1', [groupC])).v, VERSION,
    'o boas-vindas da ativação já traz a linha da OpenAI');
  check(await rpc('assistant_claim_ai_disclosure', { p_group_jid: groupC }), false, 'não repete na primeira resposta');
  overview = await call(gil.user, 'assistant_team_overview', [teamC]);
  check([overview.ai_consent.state, overview.ai_consent.version, overview.ai_consent.accepted_by], ['granted', VERSION, 'Gil Moura']);
  ok(overview.ai_consent.accepted_at, 'data do aceite');

  // Código gerado com o aceite, mas o aceite deixou de valer antes do uso: não ativa.
  const spare = await call(gil.user, 'assistant_create_activation_code', [teamC]);
  await sql(`UPDATE public.assistant_ai_consents SET revoked_at = now() WHERE team_id = $1`, [teamC]);
  check(await rpc('assistant_activate_group', { p_code: spare.code, p_group_jid: '120363000000000009@g.us', p_group_name: null }),
    { ok: false, error: 'consent_required' }, 'ativação confere o aceite de novo');
  check((await one(`SELECT used_at IS NULL AS unused FROM public.assistant_activation_codes WHERE code = $1`, [spare.code])).unused, true);
  check((await call(gil.user, 'give_assistant_consent', ['team_activation', teamC, VERSION])).state, 'granted', 'novo aceite');
  check((await one(`SELECT count(*)::int AS n FROM public.assistant_ai_consents WHERE team_id = $1`, [teamC])).n, 2, 'histórico preservado');

  // ---- Pendente: o líder confirma (A) ou desativa (B) ------------------------------------
  await fails(call(bruno.user, 'give_assistant_consent', ['team_activation', teamA, VERSION]), '42501', 'membro não confirma pela equipe');
  check((await call(ana.user, 'give_assistant_consent', ['team_activation', teamA, VERSION])).state, 'granted', 'Ana confirma');
  check((await call(ana.user, 'assistant_consent_prompts')).teams, [], 'aviso some depois da decisão');
  check((await rpc('assistant_group_context', { p_group_jid: groupA })).ai_consent, 'granted');

  await fails(call(ana.user, 'revoke_assistant_consent', ['team_activation', teamB]), '42501', 'líder de outra equipe não desativa');
  const pendingB = await call(eva.user, 'assistant_create_activation_code', [teamB]).catch((e) => e.message);
  check(pendingB, 'consent_required', 'pendente não gera código novo sem confirmar');
  check(await call(eva.user, 'revoke_assistant_consent', ['team_activation', teamB]),
    { ok: true, scope: 'team_activation', team_id: teamB, groups_deactivated: 1, state: 'none' }, 'Eva desativa');
  check((await rpc('assistant_group_context', { p_group_jid: groupB })).active, false, 'grupo B desligado');
  check((await call(eva.user, 'assistant_consent_prompts')).teams, [], 'sem pendência');
  check((await legacyNames()).filter((n) => n.endsWith('@Louvor Bairro')), [], 'desativar pela equipe acaba com a tolerância dela');

  // Revogar pela equipe com o aceite dado: desliga os grupos e apaga o código guardado.
  const extra = await call(gil.user, 'assistant_create_activation_code', [teamC]);
  check((await call(gil.user, 'revoke_assistant_consent', ['team_activation', teamC])).groups_deactivated, 1, 'Gil revoga');
  check((await one(`SELECT count(*)::int AS n FROM public.assistant_activation_codes WHERE code = $1`, [extra.code])).n, 0, 'código apagado');
  check((await call(gil.user, 'assistant_team_overview', [teamC])).ai_consent.state, 'none');
  await fails(call(gil.user, 'assistant_create_activation_code', [teamC]), 'P0001', 'depois de revogar, precisa aceitar de novo');
  await call(gil.user, 'give_assistant_consent', ['team_activation', teamC, VERSION]);
  const codeC2 = await call(gil.user, 'assistant_create_activation_code', [teamC]);
  check((await rpc('assistant_activate_group', { p_code: codeC2.code, p_group_jid: groupC, p_group_name: null })).ok, true, 'religa');

  // Texto novo (versão diferente): equipe ativa volta a ficar pendente, sem parar.
  await sql(`UPDATE public.assistant_ai_consents SET text_version = '2025-01-01' WHERE team_id = $1 AND revoked_at IS NULL`, [teamC]);
  overview = await call(gil.user, 'assistant_team_overview', [teamC]);
  check([overview.ai_consent.state, overview.ai_consent.version], ['pending', '2025-01-01'], 'aceite de texto antigo');
  await call(gil.user, 'give_assistant_consent', ['team_activation', teamC, VERSION]);
  check(await sql(`SELECT text_version, revoked_at IS NOT NULL AS revoked FROM public.assistant_ai_consents
                    WHERE team_id = $1 ORDER BY accepted_at, revoked_at NULLS LAST`, [teamC]).then((r) => r.slice(-2)),
    [{ text_version: '2025-01-01', revoked: true }, { text_version: VERSION, revoked: false }], 'o antigo fica no histórico');

  // Prazo da plataforma: pendentes viram bloqueadas.
  await sql(`UPDATE public.assistant_ai_consents SET revoked_at = now() WHERE team_id = $1 AND revoked_at IS NULL`, [teamA]);
  check((await rpc('assistant_group_context', { p_group_jid: groupA })).ai_consent, 'pending');
  await sql(`UPDATE public.assistant_config SET ai_consent_required_from = now() - interval '1 minute'`);
  check((await rpc('assistant_group_context', { p_group_jid: groupA })).ai_consent, 'blocked', 'depois do prazo');
  check((await call(ana.user, 'assistant_consent_prompts')).teams.map((t) => t.state), ['blocked']);
  check(await rpc('assistant_resolve_sender', { p_team_id: teamA, p_wa_ids: [wa.carla.lid], p_phones: [] }),
    { ok: false, error: 'no_phone' }, 'depois do prazo, a tolerância das pessoas também acaba');
  check((await call(carla.user, 'assistant_my_status')).ai_consent,
    { state: 'pending', allowed: false, legacy: false, grace_until: null, accepted_at: null, current_version: VERSION });
  await sql(`UPDATE public.assistant_config SET ai_consent_required_from = now() + interval '1 day'`);
  check((await rpc('assistant_group_context', { p_group_jid: groupA })).ai_consent, 'pending', 'prazo no futuro');
  check((await rpc('assistant_resolve_sender', { p_team_id: teamA, p_wa_ids: [wa.carla.lid], p_phones: [] })).ok, true,
    'tolerância até o prazo');
  const carlaStatus = (await call(carla.user, 'assistant_my_status')).ai_consent;
  check([carlaStatus.legacy, typeof carlaStatus.grace_until], [true, 'string'], 'o app mostra até quando');
  check(typeof (await call(carla.user, 'assistant_consent_prompts')).grace_until, 'string');
  await sql(`UPDATE public.assistant_config SET ai_consent_required_from = null`);

  // ---- Vínculo por código exige o aceite da pessoa ---------------------------------------
  check(await rpc('assistant_resolve_sender', { p_team_id: teamC, p_wa_ids: [wa.hugo.pn], p_phones: ['5541988883333'] }),
    { ok: false, error: 'unknown' }, 'equipe nova: o líder aceitou, mas o Hugo ainda não permitiu');
  await fails(call(hugo.user, 'assistant_create_link_code'), 'P0001', 'sem aceite não gera código de vínculo', /consent_required/);
  await fails(call(hugo.user, 'give_assistant_consent', ['member_link', teamC, VERSION]), '22023', 'membro não informa equipe');
  check(await call(hugo.user, 'give_assistant_consent', ['member_link', null, VERSION]),
    { ok: true, scope: 'member_link', state: 'granted', version: VERSION }, 'Hugo aceita');
  check((await call(hugo.user, 'assistant_my_status')).ai_consent.state, 'granted');
  const hugoCode = await call(hugo.user, 'assistant_create_link_code');
  check(await rpc('assistant_link_identity', { p_code: hugoCode.code, p_wa_ids: [wa.hugo.lid] }), { ok: true, full_name: 'Hugo Reis' });
  check((await rpc('assistant_resolve_sender', { p_team_id: teamC, p_wa_ids: [wa.hugo.pn], p_phones: ['5541988883333'] })).ok, true,
    'permitiu: reconhecido pelo telefone');
  check(await rpc('assistant_link_identity', { p_code: kleberOldCode.code, p_wa_ids: [wa.kleber.lid] }),
    { ok: false, error: 'consent_required' }, 'código gerado antes do aviso não vincula');
  check((await one(`SELECT used_at IS NOT NULL AS used FROM public.assistant_link_codes WHERE code = $1`, [kleberOldCode.code])).used, true,
    'e não vale mais');

  // ---- A pessoa desliga o uso dos dados ---------------------------------------------------
  await rpc('assistant_log_exchange', { p_group_jid: groupA, p_team_id: teamA, p_profile_id: bruno.profile, p_wa_message_id: 'B1',
    p_question: 'qual minha escala?', p_answer: 'Domingo.', p_tokens_in: 1, p_tokens_out: 1, p_model: 'gpt', p_error: null });
  check(await call(bruno.user, 'revoke_assistant_consent', ['member_link']),
    { ok: true, scope: 'member_link', state: 'opted_out', removed: 2 }, 'Bruno desliga');
  check(await call(bruno.user, 'assistant_my_status').then((s) => [s.linked, s.ai_consent.state, s.ai_consent.allowed]),
    [false, 'opted_out', false]);
  check((await one(`SELECT count(*)::int AS n FROM public.assistant_messages WHERE profile_id = $1`, [bruno.profile])).n, 0,
    'histórico dele com o assistente apagado');
  check(await rpc('assistant_resolve_sender', { p_team_id: teamA, p_wa_ids: [wa.bruno.pn, wa.bruno.lid], p_phones: ['552199990000'] }),
    { ok: false, error: 'unknown' }, 'pelo telefone: desconhecido');
  check(await rpc('assistant_resolve_sender', { p_team_id: teamA, p_wa_ids: [wa.bruno.lid], p_phones: [] }),
    { ok: false, error: 'no_phone' }, 'pelo @lid: desconhecido');
  check((await one(`SELECT count(*)::int AS n FROM public.assistant_wa_identities WHERE profile_id = $1`, [bruno.profile])).n, 0,
    'nada reaprendido');
  await fails(call(bruno.user, 'assistant_create_link_code'), 'P0001', 'desligado não vincula');
  check((await call(bruno.user, 'assistant_consent_prompts')).member_notice, false, 'decisão tomada: sem aviso');
  ok(!(await legacyNames()).includes('Bruno Lima@Louvor Sede'), 'decidiu: sai da tolerância');
  check(await rpc('assistant_quote_author_allowed', { p_team_id: teamA, p_wa_ids: [wa.bruno.pn] }), false, 'citação de quem desligou: não vai');

  // Ferramentas: fora das listas de disponibilidade (só a contagem); escala segue com o nome.
  const avail = await rpc('assistant_tool_disponibilidade_equipe', { p_team_id: teamA, p_member_id: ana.member, p_args: { data: later } });
  check(avail.disponiveis, [{ nome: 'Ana Souza', funcoes: ['Violão'] }], 'Bruno fora dos disponíveis');
  ok(!JSON.stringify(avail).includes('Bruno'), 'nome não vai para a IA');
  check([avail.nao_compartilham, typeof avail.aviso], [2, 'string'], 'contagem (Bruno e Lia) e aviso');
  // Menções nos avisos automáticos: o nome sai em texto, sem @.
  const mentions = await rpc('assistant_notice_mentions', { p_team_id: teamA, p_profile_ids: [ana.profile, bruno.profile],
    p_participants: [{ ids: [wa.ana.pn, wa.ana.lid] }, { ids: [wa.bruno.pn, wa.bruno.lid] }] });
  check(Object.keys(mentions), [ana.profile], 'só marca quem permite');
  // O opt-out é privado: nenhum colega (nem a própria pessoa) lê a tabela; o app usa assistant_my_status.
  check((await one(`SELECT count(*)::int AS n FROM public.assistant_ai_opt_outs WHERE profile_id = $1`, [bruno.profile])).n, 1);
  await fails(run('authenticated', ana.user, 'SELECT * FROM public.assistant_ai_opt_outs'), '42501', 'colega não lê o opt-out');
  await fails(run('authenticated', bruno.user, 'SELECT * FROM public.assistant_ai_opt_outs'), '42501', 'nem pela API');

  // Escala e vozes do roteiro: quem não permite (Bruno desligou; Lia ainda não decidiu)
  // aparece sem nome — função, confirmação e voz ficam.
  const [cultoA, songA, cultoSongA] = [uuid(), uuid(), uuid()];
  await sql(`INSERT INTO public.cultos (id, team_id, name, date) VALUES ($1, $2, 'Culto com escala', $3)`, [cultoA, teamA, later]);
  await sql(`INSERT INTO public.culto_lineup (culto_id, team_member_id, instrument, status) VALUES
    ($1, $2, 'Violão', 'accepted'), ($1, $3, 'Violão', 'pending'), ($1, $4, 'Teclado', 'pending')`,
    [cultoA, ana.member, bruno.member, lia.member]);
  await sql(`INSERT INTO public.songs (id, team_id, title) VALUES ($1, $2, 'Bondade de Deus')`, [songA, teamA]);
  await sql(`INSERT INTO public.culto_songs (id, culto_id, song_id) VALUES ($1, $2, $3)`, [cultoSongA, cultoA, songA]);
  await sql(`INSERT INTO public.culto_song_voices (culto_song_id, team_member_id, voice) VALUES ($1, $2, 1), ($1, $3, 2)`,
    [cultoSongA, ana.member, bruno.member]);
  const cultoDetails = async () => (await rpc('assistant_tool_detalhes_culto',
    { p_team_id: teamA, p_member_id: ana.member, p_args: { culto_id: cultoA } })).cultos[0];
  const lineupNames = (c) => Object.fromEntries(c.escala.map((e) => [e.funcao, e.pessoas.map((x) => [x.nome, x.confirmacao])]));
  let details = await cultoDetails();
  ok(!/Bruno|Lia/.test(JSON.stringify(details)), 'nomes de quem não permite não vão para a IA');
  check(Object.fromEntries(Object.entries(lineupNames(details)).map(([k, v]) => [k, v.map(([n]) => n)])),
    { Violão: ['Ana Souza', null], Teclado: [null] }, 'escala sem os nomes');
  check(details.roteiro[0].vozes.map((v) => [v.voz, v.nome]), [[1, 'Ana Souza'], [2, null]], 'vozes sem os nomes');
  check(typeof details.aviso, 'string', 'aviso para a IA não adivinhar');

  // Dividem o número: quem desligou nunca é trocado pelo outro.
  await call(ines.user, 'revoke_assistant_consent', ['member_link']);
  check(await rpc('assistant_resolve_sender', { p_team_id: teamA, p_wa_ids: [wa.jonas.pn], p_phones: ['5531977771111'] }),
    { ok: false, error: 'ambiguous' }, 'número dividido continua ambíguo');
  check(await rpc('assistant_quote_author_allowed', { p_team_id: teamA, p_wa_ids: [wa.ines.pn] }), false, 'citação de número dividido: não vai');

  // Liga de novo.
  check((await call(bruno.user, 'give_assistant_consent', ['member_link', null, VERSION])).state, 'granted');
  check((await one(`SELECT count(*)::int AS n FROM public.assistant_ai_opt_outs WHERE profile_id = $1`, [bruno.profile])).n, 0,
    'permitir de novo apaga o opt-out');
  who = await rpc('assistant_resolve_sender', { p_team_id: teamA, p_wa_ids: [wa.bruno.pn], p_phones: ['552199990000'] });
  check([who.ok, who.member_id], [true, bruno.member], 'reconhecido de novo');
  check((await rpc('assistant_tool_disponibilidade_equipe', { p_team_id: teamA, p_member_id: ana.member, p_args: { data: later } }))
    .disponiveis.map((d) => d.nome), ['Ana Souza', 'Bruno Lima']);

  // Lia permite: passa a ser reconhecida, listada e citada.
  check((await call(lia.user, 'give_assistant_consent', ['member_link', null, VERSION])).state, 'granted', 'Lia permite');
  check((await rpc('assistant_resolve_sender', { p_team_id: teamA, p_wa_ids: [wa.lia.pn], p_phones: ['5511966665555'] })).ok, true,
    'Lia reconhecida');
  check((await rpc('assistant_tool_disponibilidade_equipe', { p_team_id: teamA, p_member_id: ana.member, p_args: { data: later } }))
    .disponiveis.map((d) => d.nome), ['Ana Souza', 'Bruno Lima', 'Lia Torres']);
  check(await rpc('assistant_quote_author_allowed', { p_team_id: teamA, p_wa_ids: [wa.lia.pn] }), true, 'citação da Lia: vai');
  details = await cultoDetails();
  check(Object.fromEntries(Object.entries(lineupNames(details)).map(([k, v]) => [k, v.map(([n]) => n).sort()])),
    { Violão: ['Ana Souza', 'Bruno Lima'], Teclado: ['Lia Torres'] }, 'quem permitiu volta à escala com o nome');
  check(details.aviso, undefined, 'sem aviso quando todos aparecem');
  await sql('DELETE FROM public.cultos WHERE id = $1', [cultoA]);
  check(await rpc('assistant_quote_author_allowed', { p_team_id: teamA, p_wa_ids: ['5511900001111@s.whatsapp.net'] }), false,
    'citação de quem não é da equipe: não vai');
  check(await rpc('assistant_quote_author_allowed', { p_team_id: teamC, p_wa_ids: [wa.hugo.lid] }), true, 'citação pelo @lid vinculado');
  check(await rpc('assistant_quote_author_allowed', { p_team_id: teamA, p_wa_ids: [wa.hugo.lid] }), false, 'mas só na equipe dele');
  check((await one(`SELECT count(*)::int AS n FROM public.assistant_wa_identities WHERE wa_id = ANY($1)`,
    [[wa.lia.lid, '5511900001111@s.whatsapp.net']])).n, 0, 'conferir a citação não grava nada');

  // Aceitou um texto anterior e não revogou: tolerância até decidir de novo.
  await sql(`UPDATE public.assistant_ai_consents SET text_version = '2025-01-01' WHERE profile_id = $1 AND revoked_at IS NULL`, [bruno.profile]);
  check(await call(bruno.user, 'assistant_my_status').then((st) => [st.ai_consent.state, st.ai_consent.allowed, st.ai_consent.legacy]),
    ['pending', true, true], 'texto novo: Bruno precisa decidir de novo, sem parar');
  check((await rpc('assistant_resolve_sender', { p_team_id: teamA, p_wa_ids: [wa.bruno.pn], p_phones: ['552199990000'] })).ok, true);
  check((await call(bruno.user, 'assistant_consent_prompts')).member_notice, true, 'e vê o aviso de novo');
  await call(bruno.user, 'give_assistant_consent', ['member_link', null, VERSION]);
  check((await call(bruno.user, 'assistant_my_status')).ai_consent.state, 'granted');

  // Modo estrito da plataforma: só reconhece quem aceitou o aviso de membro.
  await sql(`UPDATE public.assistant_config SET ai_member_consent_required = true`);
  check(await rpc('assistant_resolve_sender', { p_team_id: teamA, p_wa_ids: [wa.carla.lid], p_phones: [] }),
    { ok: false, error: 'no_phone' }, 'Carla (sem aceite) deixa de ser reconhecida');
  check((await call(carla.user, 'assistant_my_status')).ai_consent.allowed, false);
  check((await rpc('assistant_resolve_sender', { p_team_id: teamA, p_wa_ids: [wa.bruno.pn], p_phones: ['552199990000'] })).ok, true,
    'Bruno aceitou');
  await call(carla.user, 'give_assistant_consent', ['member_link', null, VERSION]);
  check((await rpc('assistant_resolve_sender', { p_team_id: teamA, p_wa_ids: [wa.carla.lid], p_phones: [] })).ok, true, 'Carla aceitou');
  await sql(`UPDATE public.assistant_config SET ai_member_consent_required = false`);

  // ---- RLS e permissões ----------------------------------------------------------------------
  const visible = async (p) => (await run('authenticated', p.user,
    `SELECT scope, team_id, profile_id FROM public.assistant_ai_consents ORDER BY accepted_at`)).map((r) =>
    `${r.scope}:${r.team_id === teamA ? 'A' : r.team_id === teamB ? 'B' : r.team_id === teamC ? 'C' : '-'}:${r.profile_id === p.profile ? 'eu' : 'outro'}`);
  check([...new Set(await visible(bruno))], ['member_link:-:eu'], 'membro lê só os próprios');
  check([...new Set(await visible(hugo))], ['member_link:-:eu'], 'membro da C não lê o aceite da equipe');
  check([...new Set(await visible(gil))], ['team_activation:C:eu'], 'líder lê os da equipe dele');
  check([...new Set(await visible(ana))], ['team_activation:A:eu'], 'e não os de outra equipe');
  check(await visible(eva), [], 'B desativou sem ter aceitado: nada a ler');
  await fails(run('authenticated', hugo.user, `INSERT INTO public.assistant_ai_consents (profile_id, scope, text_version) VALUES ($1, 'member_link', $2)`,
    [hugo.profile, VERSION]), '42501', 'sem insert direto');
  await fails(run('authenticated', hugo.user, `UPDATE public.assistant_ai_consents SET revoked_at = null`), '42501', 'sem update direto');
  await fails(run('authenticated', hugo.user, `DELETE FROM public.assistant_ai_consents`), '42501', 'sem delete direto');
  await fails(run('anon', null, `SELECT * FROM public.assistant_ai_consents`), '42501', 'anon não lê');
  await fails(run('authenticated', ana.user, `SELECT * FROM public.assistant_ai_legacy_members`), '42501', 'tolerância: só o servidor lê');
  for (const [fn, args] of [['give_assistant_consent', `'member_link', null, '${VERSION}'`], ['revoke_assistant_consent', `'member_link', null`],
    ['assistant_consent_prompts', ''], ['assistant_my_status', '']]) {
    await fails(run('anon', null, `SELECT public.${fn}(${args})`), '42501', `anon: ${fn}`);
  }
  for (const [fn, args] of [['assistant_profile_ai_allowed', `'${bruno.profile}'`], ['assistant_team_consent_state', `'${teamA}'`],
    ['assistant_member_consent_valid', `'${bruno.profile}'`], ['assistant_group_context', `'${groupA}'`],
    ['assistant_resolve_sender', `'${teamA}', '{}', '{}'`], ['assistant_tool_disponibilidade_equipe', `'${teamA}', '${ana.member}', '{}'`],
    ['assistant_notice_mentions', `'${teamA}', '{}', '[]'`], ['assistant_link_identity', `'X', '{}'`], ['assistant_activate_group', `'X', 'g', null`],
    ['assistant_member_ai_allowed', `'${teamA}', '${bruno.profile}'`], ['assistant_quote_author_allowed', `'${teamA}', '{}'`]]) {
    await fails(run('authenticated', ana.user, `SELECT public.${fn}(${args})`), '42501', `interna: ${fn}`);
  }
  const grants = await sql(`SELECT p.proname, has_function_privilege('authenticated', p.oid, 'execute') AS auth,
      has_function_privilege('anon', p.oid, 'execute') AS anon, has_function_privilege('service_role', p.oid, 'execute') AS service
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('give_assistant_consent', 'revoke_assistant_consent', 'assistant_consent_prompts',
      'assistant_team_overview', 'assistant_create_activation_code', 'assistant_my_status', 'assistant_create_link_code')
    ORDER BY 1`);
  check(grants.every((g) => g.auth && !g.anon && g.service), true, `RPCs do app: ${JSON.stringify(grants)}`);

  // ---- Handler real (edge function) contra o banco -----------------------------------------
  const sent = [];
  const aiRequests = [];
  const whatsapp = {
    async sendText(to, text, quote) { sent.push({ to, text, quote: quote?.id ?? null }); },
    async sendPresence() {},
    async groupInfo() { return { subject: 'Grupo', participants: [{ ids: [BOT_LID, BOT_PN] }, { ids: [wa.lia.lid, wa.lia.pn] }] }; },
  };
  const ask = async (request) => { aiRequests.push(request); return { text: 'ok 🎺', inputTokens: 1, outputTokens: 1, cachedTokens: 0, toolCalls: [] }; };
  let seq = 0;
  const nowSeconds = () => Math.floor(Date.now() / 1000);
  const mention = (group, from, text) => ({ event: 'messages.upsert', instance: 'maislouvor', sender: BOT_PN, data: {
    key: { remoteJid: group, fromMe: false, id: `C${++seq}`, participant: from.lid ?? from.pn, ...(from.lid && from.pn ? { participantAlt: from.pn } : {}) },
    message: { extendedTextMessage: { text: `@88001 ${text}`, contextInfo: { mentionedJid: [BOT_LID] } } }, messageTimestamp: nowSeconds() } });
  // Chama o assistente respondendo a uma mensagem de outra pessoa (author = id de quem escreveu a citada).
  const quoting = (group, from, text, author, quotedText) => {
    const payload = mention(group, from, text);
    Object.assign(payload.data.message.extendedTextMessage.contextInfo,
      { stanzaId: `Q${seq}`, participant: author, quotedMessage: { conversation: quotedText } });
    return payload;
  };
  const lastQuestion = async (profile) => (await one(`SELECT body FROM public.assistant_messages
    WHERE profile_id = $1 AND direction = 'in' ORDER BY seq DESC LIMIT 1`, [profile])).body;
  const direct = (from, text) => ({ event: 'messages.upsert', instance: 'maislouvor', sender: BOT_PN, data: {
    key: { remoteJid: from.lid ?? from.pn, fromMe: false, id: `D${++seq}` }, message: { conversation: text }, messageTimestamp: nowSeconds() } });
  const handle = createHandler({ rpc, whatsapp, ask, log: () => {} });
  const deliver = async (payload) => {
    const before = sent.length;
    const asked = aiRequests.length;
    const outcomes = (await handle(payload)).map((o) => `${o.action}:${o.detail}`);
    return { outcomes, replies: sent.slice(before).map((s) => s.text), ai: aiRequests.length - asked };
  };

  // A pendente (Ana ainda não confirmou de novo) continua respondendo. O grupo, ativado
  // antes do aviso, recebe uma vez a linha da OpenAI junto com a primeira resposta.
  let r = await deliver(mention(groupA, wa.bruno, 'qual minha escala?'));
  check([r.outcomes, r.ai], [['answered:no_tools'], 1], 'pendente responde com a IA');
  check(r.replies[0], `ok 🎺\n\n${AI_DISCLOSURE_LINE}`, 'linha de transparência na primeira resposta depois do deploy');
  check((await one(`SELECT body FROM public.assistant_messages WHERE direction = 'out' ORDER BY seq DESC LIMIT 1`)).body, 'ok 🎺',
    'a linha não entra no histórico da conversa');
  check(await rpc('assistant_claim_ai_disclosure', { p_group_jid: groupA }), false, 'já marcada');

  // Quem desligou: desconhecido, sem IA, com a dica de como ligar.
  await call(bruno.user, 'revoke_assistant_consent', ['member_link']);
  r = await deliver(mention(groupA, wa.bruno, 'qual minha escala?'));
  check([r.outcomes, r.ai], [['replied:sender_unknown'], 0], 'desligado não vai para a IA');
  ok(r.replies[0].includes('só reconheço quem permite no app') && r.replies[0].includes('Assistente no WhatsApp'), 'explica como ligar');
  r = await deliver(mention(groupA, { lid: wa.bruno.lid }, 'e agora?'));
  check(r.ai, 0, 'nem pelo @lid');

  // Ferramenta pelo handler: a IA não recebe o nome de quem desligou.
  let toolOutput = null;
  const handleTool = createHandler({ rpc, whatsapp, log: () => {}, ask: async (request) => {
    toolOutput = await request.runTool('disponibilidade_equipe', JSON.stringify({ data: later }));
    return { text: 'lista', inputTokens: 1, outputTokens: 1, cachedTokens: 0, toolCalls: ['disponibilidade_equipe'] };
  } });
  check((await handleTool(mention(groupA, wa.ana, `quem pode dia ${later.slice(8)}?`))).map((o) => o.action), ['answered']);
  ok(toolOutput.includes('Ana Souza') && !toolOutput.includes('Bruno') && toolOutput.includes('nao_compartilham'), toolOutput);

  // Citações: o texto de outra pessoa só vai para a IA se ela permite; nunca fica no histórico.
  r = await deliver(quoting(groupA, wa.carla, 'o que ele quis dizer?', wa.bruno.pn, 'Não vou poder ir domingo, minha mãe está internada.'));
  check([r.outcomes, r.ai], [['answered:no_tools'], 1], 'responde mesmo assim');
  check(r.replies[0], 'ok 🎺', 'a linha da OpenAI vai uma vez só por grupo');
  let askedMessage = aiRequests.at(-1).message;
  ok(!askedMessage.includes('internada') && askedMessage.includes('não é compartilhado'), askedMessage);
  ok(!(await lastQuestion(carla.profile)).includes('internada'), 'nem no histórico');
  r = await deliver(quoting(groupA, wa.carla, 'confirma isso?', wa.ana.lid, 'Ensaio sábado às 15h.'));
  askedMessage = aiRequests.at(-1).message;
  ok(askedMessage.includes('Ensaio sábado às 15h.'), 'autora que permite: a citação vai');
  const logged = await lastQuestion(carla.profile);
  ok(logged.startsWith('confirma isso?') && !logged.includes('Ensaio sábado') && logged.includes('outra pessoa'), logged);
  r = await deliver(quoting(groupA, wa.carla, 'e isso?', wa.lia.lid, 'Levo o teclado.'));
  ok(aiRequests.at(-1).message.includes('Levo o teclado.'), '@lid sem vínculo: o telefone vem da lista do grupo');
  r = await deliver(quoting(groupA, wa.carla, 'e isso?', '99999@lid', 'Mensagem de alguém de fora.'));
  ok(!aiRequests.at(-1).message.includes('alguém de fora'), 'autor desconhecido: não vai');

  // Prazo vencido: a equipe pendente não chama a IA e pede a confirmação do líder; quem não
  // permitiu e só tinha a tolerância passa a ser desconhecido.
  await sql(`UPDATE public.assistant_config SET ai_consent_required_from = now() - interval '1 minute'`);
  r = await deliver(mention(groupA, wa.ana, 'quem toca domingo?'));
  check([r.outcomes, r.ai], [['replied:sender_unknown'], 0], 'tolerância vencida: desconhecido, sem IA');
  ok(r.replies[0].includes('só reconheço quem permite no app'), 'explica onde permitir');
  await call(ana.user, 'give_assistant_consent', ['member_link', null, VERSION]);
  r = await deliver(mention(groupA, wa.ana, 'qual o repertório?'));
  check([r.outcomes, r.ai], [['replied:ai_consent_required'], 0], 'bloqueada não usa a IA');
  ok(r.replies[0].includes('Usuário › Equipe › Assistente no WhatsApp'));
  r = await deliver(mention(groupA, wa.ana, 'oi?'));
  check(r.outcomes, ['ignored:ai_consent_required_throttled'], 'não repete o aviso');
  await call(ana.user, 'give_assistant_consent', ['team_activation', teamA, VERSION]);
  r = await deliver(mention(groupA, wa.ana, 'e agora?'));
  check([r.outcomes, r.ai], [['answered:no_tools'], 1], 'confirmou: volta a responder');
  await sql(`UPDATE public.assistant_config SET ai_consent_required_from = null`);

  // Vínculo no privado com código sem aceite (gerado antes do aviso).
  await sql(`INSERT INTO public.assistant_link_codes (code, profile_id, expires_at) VALUES ('KXYZ23', $1, now() + interval '1 hour')`, [kleber.profile]);
  r = await deliver(direct(wa.kleber, 'vincular KXYZ23'));
  check(r.outcomes, ['replied:link_consent_required']);
  ok(r.replies[0].includes('permita no app'), 'explica o aceite');
  await call(kleber.user, 'give_assistant_consent', ['member_link', null, VERSION]);
  const kleberCode = await call(kleber.user, 'assistant_create_link_code');
  r = await deliver(direct(wa.kleber, `vincular ${kleberCode.code}`));
  check(r.outcomes, ['replied:linked'], 'com o aceite, vincula');

  // Ativação no grupo com código cuja equipe perdeu o aceite.
  const lateCode = await call(gil.user, 'assistant_create_activation_code', [teamC]);
  await sql(`UPDATE public.assistant_ai_consents SET revoked_at = now() WHERE team_id = $1 AND revoked_at IS NULL`, [teamC]);
  r = await deliver(mention('120363000000000008@g.us', wa.gil, `ativar ${lateCode.code}`));
  check(r.outcomes, ['replied:activation_consent_required']);
  ok(r.replies[0].includes('aceitar no app'), 'pede o aceite');

  console.log(`${checks} consent checks passed: grandfathered teams and members, opt-in, activation and link consent, revocation, opt-out (identity, tools, mentions, quotes), versions, platform levers, RLS and the edge handler.`);
} finally {
  await db.close();
}
