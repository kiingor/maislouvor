// Exercise the real anonymous entry points. Never sign any private audio.
let handler: (r: Request) => Promise<Response>;
Object.defineProperty(Deno, 'serve', { value: (h: typeof handler) => { handler = h; return {}; } });
Object.defineProperty(Deno.env, 'get', { value: () => 'https://fixture.invalid' });
const own = { id: 'song', team_id: 'team', title: 'Own song', moderation_blocked: false, audio_path: 'private.mp3', cover_path: 'cover.jpg' };
let signed: string[] = [];
const songRows = [{ songs: own }, { songs: { ...own, id: 'foreign', team_id: 'other' } }, { songs: { ...own, id: 'blocked', moderation_blocked: true } }];
(globalThis as any).mockCreateClient = () => ({
  from(table: string) {
    const data = table === 'repertorio_songs' || table === 'culto_songs' ? songRows : table === 'culto_blocks' ? [] : { id: 'list', name: 'List', team_id: 'team' };
    const query: any = { select: () => query, eq: () => query, order: async () => ({ data }), single: async () => ({ data }) };
    return query;
  },
  storage: { from: (bucket: string) => ({ createSignedUrl: async (path: string) => {
    signed.push(bucket + '/' + path); return { data: { signedUrl: 'https://fixture.invalid/cover' } };
  } }) },
});
await import('../../functions/public-playlist/index.ts'); const playlist = handler!;
await import('../../functions/public-culto/index.ts'); const culto = handler!;
const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
Deno.test('public playlist exposes only own-team metadata and never signs stored audio', async () => {
  signed = [];
  const r = await playlist(new Request('https://fixture.invalid?token=public-token'));
  eq(r.status,200); const data = await r.json();
  eq(data.audio_access,'team_only'); eq(data.songs.map((s: any) => s.id), ['song']);
  eq(data.songs[0].audio_url, null); eq('audio_path' in data.songs[0],false);
  eq(signed, ['covers/cover.jpg']);
});
Deno.test('public culto rejects foreign-team and blocked songs from legacy associations', async () => {
  const r = await culto(new Request('https://fixture.invalid?token=public-token'));
  eq((await r.json()).items.map((s: any) => s.title), ['Own song']);
});
