// Run in an isolated in-memory PostgreSQL instance, never against production.
// PGLITE_MODULE may point to a separately installed @electric-sql/pglite package.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const team = '10000000-0000-4000-8000-000000000001';
const song = '20000000-0000-4000-8000-000000000001';
const audio = '30000000-0000-4000-8000-000000000001';
const yt = '30000000-0000-4000-8000-000000000002';
const user = '40000000-0000-4000-8000-000000000001';
const path = `${team}/${song}/additional/${audio}.mp3`;
let checks = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const rows = async (sql) => (await db.query(sql)).rows;
const fails = async (sql, code) => {
  await assert.rejects(db.exec(sql), (error) => error.code === code); checks++;
};
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    GRANT USAGE ON SCHEMA public, auth, storage TO authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE public.songs(id uuid PRIMARY KEY, team_id uuid, audio_path text, segment_timestamps jsonb);
    CREATE TABLE public.members(user_id uuid, team_id uuid, can_edit boolean);
    CREATE TABLE public.read_shares(user_id uuid, song_id uuid);
    CREATE FUNCTION public.member_can(uuid, uuid, text, text) RETURNS boolean
      LANGUAGE sql SECURITY DEFINER SET search_path = '' AS
      $$ SELECT EXISTS(SELECT 1 FROM public.members m WHERE m.user_id = $1 AND m.team_id = $2 AND ($4 = 'ver' OR m.can_edit)) $$;
    ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY read_song ON public.songs FOR SELECT TO authenticated USING (
      public.member_can(auth.uid(), team_id, 'musicas', 'ver') OR EXISTS (
        SELECT 1 FROM public.read_shares r WHERE r.user_id = auth.uid() AND r.song_id = songs.id
      )
    );
    GRANT SELECT ON public.songs, public.members, public.read_shares TO authenticated;
    CREATE TABLE storage.objects(bucket_id text, name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON storage.objects TO authenticated;
    INSERT INTO public.songs VALUES ('${song}', '${team}', '${team}/${song}.mp3', '[0, 15, 30]');
    INSERT INTO public.members VALUES ('${user}', '${team}', true);
  `);
  await db.exec(await readFile(new URL('../migrations/20260926120000_song_audio_attachments.sql', import.meta.url), 'utf8'));
  await db.exec(`SET ROLE authenticated; SELECT set_config('test.uid', '${user}', false)`);
  await db.exec(`INSERT INTO public.song_audio_attachments (id, song_id, title, audio_path) VALUES ('${audio}', '${song}', 'Contralto', '${path}')`);
  await db.exec(`UPDATE public.song_audio_attachments SET title = 'Kit contralto' WHERE id = '${audio}'`);
  check((await rows('SELECT title FROM public.song_audio_attachments'))[0].title, 'Kit contralto');
  await fails(`UPDATE public.song_audio_attachments SET status = 'queued' WHERE id = '${audio}'`, '42501');
  await fails(`SELECT public.claim_song_audio_import()`, '42501');
  await fails(`INSERT INTO public.song_audio_attachments (song_id, title, audio_path) VALUES ('${song}', 'Wrong path', '${team}/${song}.mp3')`, '23514');
  await fails(`INSERT INTO public.song_audio_attachments (song_id, title, audio_path) VALUES ('${song}', 'Other attachment', '${path}')`, '23514');
  await fails(`INSERT INTO public.song_audio_attachments (song_id, title, audio_path) VALUES ('${song}', ' ', '${path}')`, '23514');
  await db.exec(`RESET ROLE; INSERT INTO storage.objects VALUES ('audio', '${path}'), ('audio', '${team}/${song}.mp3'); UPDATE public.members SET can_edit = false; SET ROLE authenticated`);
  check((await rows('SELECT id FROM public.song_audio_attachments')).length, 1);
  check((await rows('SELECT name FROM storage.objects')).map(x => x.name), [path]);
  check((await rows(`DELETE FROM public.song_audio_attachments WHERE id = '${audio}' RETURNING id`)).length, 0);
  check((await rows(`UPDATE public.song_audio_attachments SET title = 'Denied' RETURNING id`)).length, 0);
  await fails(`INSERT INTO public.song_audio_attachments (id, song_id, title, audio_path) VALUES ('${yt}', '${song}', 'Denied', '${team}/${song}/additional/${yt}.mp3')`, '42501');
  await db.exec(`RESET ROLE; DELETE FROM public.members; SET ROLE authenticated`);
  check((await rows('SELECT id FROM public.song_audio_attachments')).length, 0);
  check((await rows('SELECT name FROM storage.objects')).length, 0);
  await db.exec(`RESET ROLE; INSERT INTO public.read_shares VALUES ('${user}', '${song}'); SET ROLE authenticated`);
  check((await rows('SELECT id FROM public.song_audio_attachments')).length, 1);
  check((await rows('SELECT name FROM storage.objects')).map(x => x.name), [path]);
  check((await rows('DELETE FROM public.song_audio_attachments RETURNING id')).length, 0);
  await db.exec(`RESET ROLE; INSERT INTO public.song_audio_attachments (id, song_id, title, youtube_url, status) VALUES ('${yt}', '${song}', 'Tenor', 'https://www.youtube.com/watch?v=abcdefghijk', 'queued')`);
  await fails(`INSERT INTO public.song_audio_attachments (song_id, title, youtube_url, status) VALUES ('${song}', 'Invalid URL', 'https://evilyoutube.com/watch?v=abcdefghijk', 'queued')`, '23514');
  await db.exec('SET ROLE service_role');
  const claimed = (await rows('SELECT public.claim_song_audio_import() AS job'))[0].job;
  check([claimed.attachment_id, claimed.song_id, claimed.team_id], [yt, song, team]);
  check((await rows('SELECT public.claim_song_audio_import() AS job'))[0].job, null);
  check((await rows(`SELECT public.complete_song_audio_import('${yt}', '${team}/${song}/additional/${yt}.mp3') AS ok`))[0].ok, true);
  check((await rows(`SELECT status FROM public.song_audio_attachments WHERE id = '${yt}'`))[0].status, 'ready');
  check((await rows(`SELECT public.complete_song_audio_import('${yt}', '${team}/${song}/additional/${yt}.mp3') AS ok`))[0].ok, false);
  await db.exec('RESET ROLE');
  check((await rows('SELECT audio_path, segment_timestamps FROM public.songs'))[0], { audio_path: `${team}/${song}.mp3`, segment_timestamps: [0, 15, 30] });
  await db.exec(`UPDATE public.song_audio_attachments SET audio_path = NULL, status = 'processing', claimed_at = now() - interval '16 minutes' WHERE id = '${yt}'`);
  await db.exec('SELECT public.claim_song_audio_import()');
  check((await rows(`SELECT status FROM public.song_audio_attachments WHERE id = '${yt}'`))[0].status, 'error');
  await db.exec(`DELETE FROM public.songs WHERE id = '${song}'`);
  check((await rows('SELECT id FROM public.song_audio_attachments')).length, 0);
  console.log(`${checks} PostgreSQL checks passed: RLS, read shares, paths, queue isolation, retries and parent preservation.`);
} finally { await db.close(); }
