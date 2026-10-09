// RPCs SECURITY DEFINER do app: consentimento geral não pode ser contornado
// pelo contrato antigo, mas os controles de retirada precisam continuar abertos.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAssistantDb, withRole } from './helpers/assistant_db.mjs';
const migration = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const { db } = await createAssistantDb({ extraMigrations: [
  '20260929120000_assistant_notifications.sql', '20260930120000_assistant_missions.sql',
  '20261003133000_assistant_ai_consent.sql', '20261007120000_strict_assistant_consent.sql',
] });
let checks = 0;
const check = (actual, expected, label = 'valor esperado') => { assert.deepEqual(actual, expected, label); checks++; };
const [leader, viewer, pl, pv, team, ml, mv, group, mission] = Array.from({ length: 9 }, () => crypto.randomUUID());
const call = (uid, name, args = []) => withRole(db, 'authenticated', uid, async tx =>
  (await tx.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) r`, args)).rows[0]?.r);
const denied = async (name, args, uid = leader, hint = 'TEAM_DATA_CONSENT_REQUIRED') => {
  await assert.rejects(call(uid, name, args), error => error.code === '42501' && (!hint || error.hint === hint)); checks++;
};
const operations = [
  ['assistant_team_overview', [team]],
  ['assistant_create_activation_code', [team]],
  ['assistant_update_instructions', [team, 'Fixture instructions']],
  ['assistant_notification_settings', [team]],
  ['assistant_set_notification', [team, 'avisos', true]],
  ['assistant_missions_overview', [team]],
  ['assistant_set_mission_state', [team, 'FIXTURE', 'retomar']],
  ['give_assistant_consent', ['team_activation', team, '2026-10-03']],
  ['give_assistant_consent', ['member_link', null, '2026-10-03']],
  ['assistant_create_link_code', []],
];
try {
  await db.exec(`
    create or replace function public.get_my_profile_id() returns uuid language sql stable security definer set search_path=public as $$ select id from profiles where user_id=auth.uid() limit 1 $$;
    create table public.team_join_requests(id uuid primary key default gen_random_uuid(), team_id uuid, profile_id uuid);
    update public.assistant_config set enabled = true where id;
  `);
  for (const [u, p, name] of [[leader, pl, 'Fixture leader'], [viewer, pv, 'Fixture viewer']])
    await db.query('insert into profiles(id,user_id,full_name)values($1,$2,$3)', [p, u, name]);
  await db.query('insert into teams(id,name,owner_id)values($1,$2,$3)', [team, 'QA guard', pl]);
  for (const [p, m, role] of [[pl, ml, 'admin'], [pv, mv, 'viewer']])
    await db.query('insert into team_members(id,profile_id,team_id,role)values($1,$2,$3,$4)', [m, p, team, role]);
  await db.exec(await migration('20261008233000_team_data_consent.sql'));
  const preserved = ['has_team_role', 'revoke_assistant_consent', 'assistant_unlink_me', 'assistant_deactivate_group', 'assistant_my_status', 'account_deletion_promote_leader'];
  const definitions = () => db.query(`select p.proname, pg_get_functiondef(p.oid) definition, p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1) order by p.proname`, [preserved]);
  const before = (await definitions()).rows;
  const guard = await migration('20261008235000_assistant_team_data_guard.sql');
  await db.exec(guard); await db.exec(guard);
  check((await definitions()).rows, before, 'rights and shared role helpers unchanged, including grants');
  for (const [name, args] of operations) await denied(name, args);
  await call(leader, 'set_my_team_data_consent', [true, '2026-10-08']);
  await call(viewer, 'set_my_team_data_consent', [true, '2026-10-08']);
  const aiVersion = (await db.query('select assistant_ai_consent_version() version')).rows[0].version;
  check((await call(leader, 'give_assistant_consent', ['team_activation', team, aiVersion])).ok, true);
  check((await call(leader, 'give_assistant_consent', ['member_link', null, aiVersion])).ok, true);
  check(typeof (await call(leader, 'assistant_create_activation_code', [team])).code, 'string');
  check(typeof (await call(leader, 'assistant_create_link_code')).code, 'string');
  check((await call(leader, 'assistant_update_instructions', [team, 'Fixture instructions'])).ok, true);
  check((await call(leader, 'assistant_team_overview', [team])).instructions, 'Fixture instructions');
  check((await call(leader, 'assistant_set_notification', [team, 'avisos', true])).avisos, true);
  check((await call(leader, 'assistant_notification_settings', [team])).avisos, true);
  check(await call(leader, 'assistant_missions_overview', [team]), []);
  await denied('assistant_team_overview', [team], viewer, null);
  await denied('assistant_update_instructions', [team, 'forbidden'], viewer, null);
  await denied('assistant_set_notification', [team, 'avisos', true], viewer, null);
  await denied('assistant_missions_overview', [team], viewer, null);
  await db.query("insert into assistant_groups(id,team_id,group_jid,group_name,active,activated_by)values($1,$2,$3,'QA group',true,$4)", [group, team, 'qa-group@g.us', pl]);
  await db.query("insert into assistant_missions(id,team_id,group_id,group_activated_at,authorized_by,title,body,frequency,send_time,status)values($1,$2,$3,now(),$4,'QA mission','Synthetic fixture','daily','10:00','paused')", [mission, team, group, ml]);
  const code = (await db.query('select code from assistant_missions where id=$1', [mission])).rows[0].code;
  check((await call(leader, 'assistant_set_mission_state', [team, code, 'retomar'])).ok, true);
  await call(leader, 'set_my_team_data_consent', [false, '2026-10-08']);
  for (const [name, args] of operations) await denied(name, args);
  await db.query("update team_members set role='admin' where id=$1", [mv]);
  const remainingLeaderView = await call(viewer, 'assistant_team_overview', [team]);
  check(remainingLeaderView.groups[0].activated_by, null, 'activation actor name hidden after their withdrawal');
  check(remainingLeaderView.ai_consent.accepted_by, null, 'team consent remains without the withdrawn actor name');
  check((await db.query('select assistant_team_consent_valid($1) allowed', [team])).rows[0].allowed, true, 'individual withdrawal does not revoke team activation');
  check((await db.query('select assistant_member_ai_allowed($1,$2) allowed', [team, pl])).rows[0].allowed, false, 'individual stays excluded from AI');
  check((await call(leader, 'assistant_set_notification', [team, 'avisos', false])).avisos, false, 'can disable notifications after withdrawal');
  check((await call(leader, 'assistant_set_mission_state', [team, code, 'pausar'])).ok, true, 'can pause after withdrawal');
  check((await call(leader, 'assistant_set_mission_state', [team, code, 'cancelar'])).ok, true, 'can cancel after withdrawal');
  check((await call(leader, 'assistant_my_status')).ai_consent.allowed, false, 'own privacy status remains accessible');
  check((await call(leader, 'assistant_unlink_me')).ok, true, 'can unlink after withdrawal');
  check((await call(leader, 'assistant_deactivate_group', [group])).ok, true, 'can deactivate group after withdrawal');
  check((await call(leader, 'revoke_assistant_consent', ['team_activation', team])).ok, true, 'can explicitly revoke team activation');
  check((await call(leader, 'revoke_assistant_consent', ['member_link', null])).ok, true, 'can explicitly revoke AI data use');
  await assert.rejects(withRole(db, 'anon', null, tx => tx.query('select assistant_team_overview($1)', [team])), error => error.code === '42501'); checks++;
  console.log(`${checks} verificações de RPCs Asafe e consentimento geral aprovadas.`);
} finally { await db.close(); }
