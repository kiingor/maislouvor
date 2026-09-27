// Run in an isolated in-memory PostgreSQL instance, never against production.
// PGLITE_MODULE may point to a separately installed @electric-sql/pglite package.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const team = '10000000-0000-4000-8000-000000000001';
const song = '20000000-0000-4000-8000-000000000001';
const owner = '40000000-0000-4000-8000-000000000001';
const mate = '40000000-0000-4000-8000-000000000002';
const ownerProfile = '50000000-0000-4000-8000-000000000001';
const mateProfile = '50000000-0000-4000-8000-000000000002';
const chorus = '60000000-0000-4000-8000-000000000001';
const bridge = '60000000-0000-4000-8000-000000000002';
let checks = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const fails = async (sql, code, params) => {
  await assert.rejects(db.query(sql, params), (error) => error.code === code); checks++;
};
const as = (uid) => db.exec(`RESET ROLE; SELECT set_config('test.uid', '${uid}', false); SET ROLE authenticated`);
const migration = (name) => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE public.songs(id uuid PRIMARY KEY, team_id uuid);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, user_id uuid);
    CREATE TABLE public.members(user_id uuid, team_id uuid);
    CREATE FUNCTION public.get_my_profile_id() RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = '' AS
      $$ SELECT id FROM public.profiles WHERE user_id = auth.uid() $$;
    CREATE FUNCTION public.is_team_member(uuid, uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS
      $$ SELECT EXISTS(SELECT 1 FROM public.members WHERE user_id = $1 AND team_id = $2) $$;
    GRANT SELECT ON public.songs TO authenticated;
    INSERT INTO public.songs VALUES ('${song}', '${team}');
    INSERT INTO public.profiles VALUES ('${ownerProfile}', '${owner}'), ('${mateProfile}', '${mate}');
    INSERT INTO public.members VALUES ('${owner}', '${team}'), ('${mate}', '${team}');
  `);
  await db.exec(await migration('20260301201228_4702a9c9-71c3-48c7-87ed-6be03e776da9.sql'));
  await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON public.song_loop_points TO authenticated');
  // Loops salvos antes da migração: um público e um privado, já em sequência.
  await db.exec(`INSERT INTO public.song_loop_points (id, song_id, profile_id, label, start_time, end_time, is_public, repeat_count, sort_order) VALUES
    ('${chorus}', '${song}', '${ownerProfile}', 'Refrão', 62.5, 80, true, 4, 0),
    ('${bridge}', '${song}', '${ownerProfile}', 'Ponte', 95, 110, false, 0, 1)`);
  const before = await rows('SELECT id, label, start_time, end_time, is_public, repeat_count, sort_order, created_at FROM public.song_loop_points ORDER BY sort_order');

  await db.exec(await migration('20260927120000_song_loop_notes.sql'));
  await db.exec(await migration('20260927120000_song_loop_notes.sql')); // idempotente
  check(await rows('SELECT id, label, start_time, end_time, is_public, repeat_count, sort_order, created_at FROM public.song_loop_points ORDER BY sort_order'), before);
  check((await rows('SELECT notes FROM public.song_loop_points')).map((r) => r.notes), [null, null]);

  // Dono: cria com observação, edita (quebras de linha preservadas) e remove.
  await as(owner);
  const created = await rows(`INSERT INTO public.song_loop_points (song_id, profile_id, label, start_time, end_time, sort_order, notes)
    VALUES ($1, $2, 'Solo', 120, 140, 2, 'Entrar junto com a bateria') RETURNING notes`, [song, ownerProfile]);
  check(created[0].notes, 'Entrar junto com a bateria');
  const multiline = 'Respirar antes do refrão.\n\nSegunda voz entra no "eu te louvo".';
  await db.query('UPDATE public.song_loop_points SET notes = $1 WHERE id = $2', [multiline, chorus]);
  check((await rows('SELECT notes FROM public.song_loop_points WHERE id = $1', [chorus]))[0].notes, multiline);
  await db.query('UPDATE public.song_loop_points SET notes = $1 WHERE id = $2', ['x'.repeat(1000), bridge]);
  check((await rows('SELECT char_length(notes) AS n FROM public.song_loop_points WHERE id = $1', [bridge]))[0].n, 1000);
  await db.query('UPDATE public.song_loop_points SET notes = NULL WHERE id = $1', [bridge]);
  check((await rows('SELECT notes FROM public.song_loop_points WHERE id = $1', [bridge]))[0].notes, null);
  await fails('UPDATE public.song_loop_points SET notes = $1 WHERE id = $2', '23514', ['x'.repeat(1001), bridge]);
  await fails('UPDATE public.song_loop_points SET notes = $1 WHERE id = $2', '23514', [' \n\t ', bridge]);
  await fails('UPDATE public.song_loop_points SET notes = $1 WHERE id = $2', '23514', ['', bridge]);
  await db.query('UPDATE public.song_loop_points SET notes = $1 WHERE id = $2', ['Privada', bridge]);

  // Colega da equipe: lê a observação do loop público, não vê o privado, não altera nada.
  await as(mate);
  check(await rows('SELECT label, notes FROM public.song_loop_points ORDER BY sort_order'), [{ label: 'Refrão', notes: multiline }]);
  check((await rows(`UPDATE public.song_loop_points SET notes = 'invasão' RETURNING id`)).length, 0);
  await db.exec('RESET ROLE');
  check((await rows('SELECT notes FROM public.song_loop_points WHERE id = $1', [bridge]))[0].notes, 'Privada');
  check((await rows('SELECT notes FROM public.song_loop_points WHERE id = $1', [chorus]))[0].notes, multiline);
  check((await rows('SELECT label, repeat_count, sort_order FROM public.song_loop_points ORDER BY sort_order')).map((r) => [r.label, r.repeat_count, r.sort_order]),
    [['Refrão', 4, 0], ['Ponte', 0, 1], ['Solo', 0, 2]]);
  console.log(`${checks} PostgreSQL checks passed: existing loops preserved, idempotent, notes create/edit/remove, length and blank checks, RLS read/write.`);
} finally { await db.close(); }
