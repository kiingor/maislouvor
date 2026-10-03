// Roda num PostgreSQL em memória (PGlite), nunca contra a produção.
// PGLITE_MODULE pode apontar para um @electric-sql/pglite instalado à parte.
//
// Usa o recorte real do schema de produção (fixtures) para:
//   1. reproduzir a escalada: quem só tem a exceção "Membros: editar" vira
//      líder, se dá permissões, põe alguém como líder e remove o dono; e um
//      colíder troca teams.owner_id;
//   2. aplicar 20261003120000_team_member_privilege_guard.sql e conferir que
//      esses caminhos fecham sem quebrar criação de equipe (handle_new_team),
//      create-invite, accept-invite, código de entrada, aprovação/recusa e a
//      gestão de membros que o app oferece a quem tem "Membros: editar".
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { withRole } from './helpers/assistant_db.mjs';

const MIGRATION = '20261003120000_team_member_privilege_guard.sql';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const team = '10000000-0000-4000-8000-000000000001';
const otherTeam = '10000000-0000-4000-8000-000000000002';
const people = ['owner', 'coadmin', 'manager', 'editor', 'viewer', 'requester', 'latecomer', 'outsider'];
const user = Object.fromEntries(people.map((name, i) => [name, `40000000-0000-4000-8000-00000000000${i + 1}`]));
const profile = Object.fromEntries(people.map((name, i) => [name, `50000000-0000-4000-8000-00000000000${i + 1}`]));
const email = (name) => `${name}@example.test`;
const MANAGE_MEMBERS = { membros: { editar: true } };
const EVERYTHING = { membros: { editar: true }, musicas: { editar: true }, cultos: { editar: true } };

let checks = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const ROLLBACK = Symbol('rollback');

async function createDb(withMigration) {
  const db = new PGlite();
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
  await db.exec(await read('./fixtures/core_schema_20260927.sql'));
  await db.exec(await read('./fixtures/team_membership_20261003.sql'));
  if (withMigration) {
    const migration = await read(`../migrations/${MIGRATION}`);
    await db.exec(migration);
    await db.exec(migration); // idempotente
  }
  return db;
}

// Usuário logado (PostgREST com o JWT dele) e edge function com a service_role.
const as = (db, who, sql, params = []) =>
  withRole(db, 'authenticated', user[who], async (tx) => (await tx.query(sql, params)).rows);
const service = (db, sql, params = []) =>
  withRole(db, 'service_role', null, async (tx) => (await tx.query(sql, params)).rows);
const rpc = async (db, who, fn, args) => (await as(db, who, `SELECT public.${fn}(${args}) AS r`))[0].r;

/** Executa como `who`, devolve o resultado e desfaz tudo. */
async function probe(db, who, sql, params = []) {
  let result;
  await withRole(db, 'authenticated', user[who], async (tx) => {
    result = (await tx.query(sql, params)).rows;
    throw ROLLBACK;
  }).catch((error) => { if (error !== ROLLBACK) throw error; });
  return result;
}

async function denied(promise, message) {
  await assert.rejects(promise, (error) => error.code === '42501' && message.test(error.message));
  checks++;
}

const memberRow = async (db, who, teamId = team) =>
  (await db.query('SELECT id, role, permissions, instruments FROM public.team_members WHERE team_id = $1 AND profile_id = $2',
    [teamId, profile[who]])).rows[0];
const roster = async (db, teamId = team) => Object.fromEntries((await db.query(
  `SELECT p.id, tm.role, tm.permissions FROM public.team_members tm JOIN public.profiles p ON p.id = tm.profile_id
    WHERE tm.team_id = $1`, [teamId])).rows.map((r) => [people[Object.values(profile).indexOf(r.id)], [r.role, r.permissions]]));

/** A equipe como ela nasce pelo app, passando pelos fluxos reais de entrada. */
async function seed(db) {
  for (const name of people) {
    await db.query('INSERT INTO public.profiles (id, user_id, full_name) VALUES ($1, $2, $3)', [profile[name], user[name], name]);
  }
  // CreateTeamModal: insert em teams com o JWT do criador; handle_new_team o põe como líder.
  await as(db, 'owner', 'INSERT INTO public.teams (id, name, owner_id) VALUES ($1, $2, $3)', [team, 'Louvor Central', profile.owner]);
  await as(db, 'outsider', 'INSERT INTO public.teams (id, name, owner_id) VALUES ($1, $2, $3)', [otherTeam, 'Outra', profile.outsider]);
  check((await memberRow(db, 'owner')).role, 'admin');
  check((await memberRow(db, 'outsider', otherTeam)).role, 'admin');

  // create-invite (service_role, depois de conferir que quem chama é líder): pessoa já cadastrada entra direto.
  for (const [who, role] of [['coadmin', 'admin'], ['manager', 'viewer'], ['viewer', 'viewer']]) {
    await service(db, 'INSERT INTO public.team_members (team_id, profile_id, role) VALUES ($1, $2, $3)', [team, profile[who], role]);
    await service(db, 'INSERT INTO public.team_invites (team_id, email, role, accepted) VALUES ($1, $2, $3, true)', [team, email(who), role]);
  }
  check((await memberRow(db, 'coadmin')).role, 'admin');

  // Líder dá a exceção "Membros: editar" a um membro comum.
  await as(db, 'owner', 'UPDATE public.team_members SET permissions = $1 WHERE team_id = $2 AND profile_id = $3',
    [MANAGE_MEMBERS, team, profile.manager]);
  check((await memberRow(db, 'manager')).permissions, MANAGE_MEMBERS);

  // Link de convite: líder cria; accept-invite (service_role) faz o upsert como o PostgREST.
  const [invite] = await as(db, 'owner', 'INSERT INTO public.team_invites (team_id, email, role) VALUES ($1, $2, $3) RETURNING token',
    [team, email('editor'), 'editor']);
  const upsert = `INSERT INTO public.team_members (team_id, profile_id, role) VALUES ($1, $2, $3)
    ON CONFLICT (team_id, profile_id) DO UPDATE SET team_id = excluded.team_id, profile_id = excluded.profile_id, role = excluded.role`;
  const [found] = await service(db, 'SELECT id, team_id, role FROM public.team_invites WHERE token = $1 AND accepted = false', [invite.token]);
  await service(db, upsert, [found.team_id, profile.editor, found.role]);
  await service(db, 'UPDATE public.team_invites SET accepted = true WHERE id = $1', [found.id]);
  await service(db, upsert, [found.team_id, profile.editor, found.role]); // reaceite cai no ON CONFLICT DO UPDATE
  check((await memberRow(db, 'editor')).role, 'editor');

  // Código de entrada: pedido (join-team -> request_team_join) e aprovação por quem tem "Membros: editar".
  const [{ join_code: code }] = (await db.query('SELECT join_code FROM public.teams WHERE id = $1', [team])).rows;
  check((await rpc(db, 'requester', 'request_team_join', `'${code.toLowerCase()}'`)).status, 'pending');
  check((await rpc(db, 'latecomer', 'request_team_join', `'${code}'`)).status, 'pending');
  const requestOf = async (who) => (await db.query('SELECT id FROM public.team_join_requests WHERE profile_id = $1', [profile[who]])).rows[0].id;
  check(await rpc(db, 'manager', 'approve_join_request', `'${await requestOf('requester')}'`), { ok: true });
  check(await rpc(db, 'manager', 'reject_join_request', `'${await requestOf('latecomer')}'`), { ok: true });
  check((await memberRow(db, 'requester')).role, 'viewer');
  check(await memberRow(db, 'latecomer'), undefined);
}

const SEEDED = {
  owner: ['admin', {}], coadmin: ['admin', {}], manager: ['viewer', MANAGE_MEMBERS],
  viewer: ['viewer', {}], editor: ['editor', {}], requester: ['viewer', {}],
};

// ---------------------------------------------------------------------------
// 1. Schema de produção, sem a migração: a escalada funciona.
// ---------------------------------------------------------------------------
{
  const db = await createDb(false);
  try {
    await seed(db);
    check(await roster(db), SEEDED);
    const manager = await memberRow(db, 'manager');
    const ownerRow = await memberRow(db, 'owner');
    check(await probe(db, 'manager', `UPDATE public.team_members SET role = 'admin' WHERE id = $1 RETURNING role`, [manager.id]),
      [{ role: 'admin' }]);
    check(await probe(db, 'manager', 'UPDATE public.team_members SET permissions = $1 WHERE id = $2 RETURNING permissions',
      [EVERYTHING, manager.id]), [{ permissions: EVERYTHING }]);
    check(await probe(db, 'manager', `INSERT INTO public.team_members (team_id, profile_id, role) VALUES ($1, $2, 'admin') RETURNING role`,
      [team, profile.outsider]), [{ role: 'admin' }]);
    check(await probe(db, 'manager', 'DELETE FROM public.team_members WHERE id = $1 RETURNING role', [ownerRow.id]),
      [{ role: 'admin' }]);
    check(await probe(db, 'coadmin', 'UPDATE public.teams SET owner_id = $1 WHERE id = $2 RETURNING owner_id',
      [profile.coadmin, team]), [{ owner_id: profile.coadmin }]);
    check(await roster(db), SEEDED);
  } finally { await db.close(); }
}
const reproduced = checks;

// ---------------------------------------------------------------------------
// 2. Com a migração.
// ---------------------------------------------------------------------------
{
  const db = await createDb(true);
  try {
    await seed(db); // criação de equipe, convites, código e aprovação continuam funcionando
    check(await roster(db), SEEDED);
    const manager = await memberRow(db, 'manager');
    const ownerRow = await memberRow(db, 'owner');
    const coadmin = await memberRow(db, 'coadmin');
    const viewer = await memberRow(db, 'viewer');

    // Quem só tem "Membros: editar" não sobe de nível nem mexe em líderes ou permissões.
    await denied(as(db, 'manager', `UPDATE public.team_members SET role = 'admin' WHERE id = $1`, [manager.id]), /líder/);
    await denied(as(db, 'manager', 'UPDATE public.team_members SET permissions = $1 WHERE id = $2', [EVERYTHING, manager.id]), /permissões/);
    await denied(as(db, 'manager', `UPDATE public.team_members SET role = 'editor' WHERE id = $1`, [manager.id]), /próprio papel/);
    await denied(as(db, 'manager', `INSERT INTO public.team_members (team_id, profile_id, role) VALUES ($1, $2, 'admin')`,
      [team, profile.outsider]), /líder/);
    await denied(as(db, 'manager', `INSERT INTO public.team_members (team_id, profile_id, permissions) VALUES ($1, $2, $3)`,
      [team, profile.outsider, MANAGE_MEMBERS]), /permissões/);
    await denied(as(db, 'manager', `INSERT INTO public.team_members (team_id, profile_id, role) VALUES ($1, $2, 'admin')
      ON CONFLICT (team_id, profile_id) DO UPDATE SET role = 'admin'`, [team, profile.manager]), /líder/);
    await denied(as(db, 'manager', `UPDATE public.team_members SET role = 'admin' WHERE id = $1`, [viewer.id]), /líder/);
    await denied(as(db, 'manager', 'UPDATE public.team_members SET permissions = $1 WHERE id = $2', [MANAGE_MEMBERS, viewer.id]), /permissões/);
    await denied(as(db, 'manager', `UPDATE public.team_members SET instruments = '{baixo}' WHERE id = $1`, [ownerRow.id]), /líder/);
    await denied(as(db, 'manager', `UPDATE public.team_members SET role = 'viewer' WHERE id = $1`, [coadmin.id]), /líder/);
    await denied(as(db, 'manager', 'DELETE FROM public.team_members WHERE id = $1', [coadmin.id]), /líder/);
    await denied(as(db, 'manager', 'DELETE FROM public.team_members WHERE id = $1', [ownerRow.id]), /dono/);
    await denied(as(db, 'manager', 'UPDATE public.team_members SET profile_id = $1 WHERE id = $2', [profile.outsider, viewer.id]), /vínculo/);
    await denied(as(db, 'owner', 'UPDATE public.team_members SET team_id = $1 WHERE id = $2', [otherTeam, viewer.id]), /vínculo/);
    check(await as(db, 'manager', 'UPDATE public.teams SET owner_id = $1 WHERE id = $2 RETURNING id', [profile.manager, team]), []);
    check(await roster(db), SEEDED);

    // ...mas segue fazendo o que o app oferece a quem gerencia membros.
    await as(db, 'manager', `UPDATE public.team_members SET instruments = '{violão}', instrument_levels = '{"violão":"avançado"}' WHERE id = $1`,
      [viewer.id]);
    await as(db, 'manager', 'UPDATE public.team_members SET role = $1, permissions = $2, instruments = $3, instrument_levels = $4 WHERE id = $5',
      ['viewer', {}, ['violão', 'voz'], { voz: 'básico' }, viewer.id]); // payload completo do MemberEditModal
    await as(db, 'manager', `UPDATE public.team_members SET role = 'editor' WHERE id = $1`, [viewer.id]);
    check((await memberRow(db, 'viewer')).role, 'editor');
    await as(db, 'manager', `UPDATE public.team_members SET role = 'viewer' WHERE id = $1`, [viewer.id]);
    check((await memberRow(db, 'viewer')).instruments, ['violão', 'voz']);
    await as(db, 'manager', 'INSERT INTO public.team_members (team_id, profile_id, role) VALUES ($1, $2, $3)', [team, profile.latecomer, 'editor']);
    await as(db, 'manager', 'DELETE FROM public.team_members WHERE team_id = $1 AND profile_id = $2', [team, profile.latecomer]);
    check(await memberRow(db, 'latecomer'), undefined);
    const oldCode = (await db.query('SELECT join_code FROM public.teams WHERE id = $1', [team])).rows[0].join_code;
    const newCode = await rpc(db, 'manager', 'regenerate_team_code', `'${team}'`);
    check(newCode !== oldCode && newCode.length, 6);

    // Líderes promovem, rebaixam, mexem em permissões e removem outros líderes.
    const requester = await memberRow(db, 'requester');
    await as(db, 'owner', `UPDATE public.team_members SET role = 'admin' WHERE id = $1`, [requester.id]);
    await as(db, 'coadmin', 'UPDATE public.team_members SET permissions = $1 WHERE id = $2', [EVERYTHING, manager.id]);
    check((await memberRow(db, 'manager')).permissions, EVERYTHING);
    await as(db, 'coadmin', 'UPDATE public.team_members SET permissions = $1 WHERE id = $2', [MANAGE_MEMBERS, manager.id]);
    await as(db, 'coadmin', `UPDATE public.team_members SET role = 'editor' WHERE id = $1`, [requester.id]);
    await as(db, 'owner', `UPDATE public.team_members SET role = 'admin' WHERE id = $1`, [requester.id]);
    await as(db, 'coadmin', 'DELETE FROM public.team_members WHERE id = $1', [requester.id]);
    check(await memberRow(db, 'requester'), undefined);
    await as(db, 'owner', `INSERT INTO public.team_members (team_id, profile_id, role, permissions) VALUES ($1, $2, 'viewer', $3)`,
      [team, profile.requester, MANAGE_MEMBERS]);
    check((await memberRow(db, 'requester')).permissions, MANAGE_MEMBERS);

    // O dono não é rebaixado nem removido, e owner_id não muda por UPDATE direto.
    await denied(as(db, 'coadmin', `UPDATE public.team_members SET role = 'editor' WHERE id = $1`, [ownerRow.id]), /dono/);
    await denied(as(db, 'owner', `UPDATE public.team_members SET role = 'editor' WHERE id = $1`, [ownerRow.id]), /dono/);
    await denied(as(db, 'coadmin', 'DELETE FROM public.team_members WHERE id = $1', [ownerRow.id]), /dono/);
    await denied(as(db, 'coadmin', 'UPDATE public.teams SET owner_id = $1 WHERE id = $2', [profile.coadmin, team]), /transferência/);
    await denied(as(db, 'owner', 'UPDATE public.teams SET owner_id = $1 WHERE id = $2', [profile.coadmin, team]), /transferência/);
    await as(db, 'coadmin', `UPDATE public.teams SET owner_id = owner_id, name = 'Louvor Central 2', availability_mode = 'available_only' WHERE id = $1`, [team]);
    check((await db.query('SELECT name, owner_id FROM public.teams WHERE id = $1', [team])).rows[0],
      { name: 'Louvor Central 2', owner_id: profile.owner });

    // transfer_team_ownership: só o dono, só para membro; quem recebe vira líder.
    // Argumentos nomeados, como o supabase.rpc() manda.
    const transfer = (who, to) =>
      rpc(db, who, 'transfer_team_ownership', `p_team_id => '${team}', p_new_owner_profile_id => '${profile[to]}'`);
    check(await transfer('coadmin', 'coadmin'), { ok: false, error: 'forbidden' });
    check(await transfer('manager', 'manager'), { ok: false, error: 'forbidden' });
    check(await transfer('owner', 'outsider'), { ok: false, error: 'not_member' });
    check(await transfer('owner', 'owner'), { ok: true });
    await assert.rejects(withRole(db, 'anon', null, (tx) => tx.query(`SELECT public.transfer_team_ownership('${team}', '${profile.viewer}')`)),
      (error) => error.code === '42501'); checks++;
    check(await transfer('owner', 'viewer'), { ok: true });
    check((await db.query('SELECT owner_id FROM public.teams WHERE id = $1', [team])).rows[0].owner_id, profile.viewer);
    check((await memberRow(db, 'viewer')).role, 'admin');
    check((await memberRow(db, 'owner')).role, 'admin');
    await as(db, 'viewer', `UPDATE public.team_members SET role = 'editor' WHERE id = $1`, [ownerRow.id]); // ex-dono já pode ser rebaixado
    check(await as(db, 'owner', 'UPDATE public.teams SET owner_id = $1 WHERE id = $2 RETURNING id', [profile.owner, team]), []);

    // Sem JWT de usuário (service_role/suporte) continua livre.
    await service(db, 'UPDATE public.teams SET owner_id = $1 WHERE id = $2', [profile.coadmin, team]);
    await service(db, `UPDATE public.team_members SET role = 'viewer' WHERE id = $1`, [viewer.id]);
    check((await db.query('SELECT owner_id FROM public.teams WHERE id = $1', [team])).rows[0].owner_id, profile.coadmin);

    // Excluir a equipe leva junto os vínculos (ON DELETE CASCADE), inclusive o do dono e o de outro
    // líder gravado depois do vínculo de quem exclui (a cascata já apagou o de quem exclui).
    await as(db, 'coadmin', `UPDATE public.team_members SET role = 'admin', permissions = '{}' WHERE id = $1`, [manager.id]);
    check(await as(db, 'coadmin', 'DELETE FROM public.teams WHERE id = $1 RETURNING id', [team]), [{ id: team }]);
    check((await db.query('SELECT count(*)::int AS n FROM public.team_members WHERE team_id = $1', [team])).rows[0].n, 0);

    // Conta apagada por uma rotina que roda com o JWT da própria pessoa, líder de outra equipe.
    await as(db, 'outsider', `INSERT INTO public.team_members (team_id, profile_id, role) VALUES ($1, $2, 'admin')`,
      [otherTeam, profile.editor]);
    await withRole(db, 'postgres', user.editor, (tx) => tx.query('DELETE FROM public.profiles WHERE id = $1', [profile.editor]));
    check(await roster(db, otherTeam), { outsider: ['admin', {}] });
  } finally { await db.close(); }
}

console.log(`${checks} PostgreSQL checks passed: escalation reproduced on the production schema (${reproduced}), ` +
  'then blocked by the migration; team creation, create-invite, accept-invite, join code, approve/reject, member ' +
  'management, owner protection, ownership transfer and team deletion still work.');
