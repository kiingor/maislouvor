// Testes da conta de revisão, sem rede: dados fictícios, segurança da CLI e o fluxo
// apply/reset contra um store em memória (com FKs e cascatas simuladas).
//   node --test scripts/review-demo/
// O fluxo contra o schema real (PGlite) está em supabase/tests/review_demo_seed.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import {
  ALL_SONG_KEYS, BABY_BIRD, BABY_BIRD_LICENSE_URL, BABY_BIRD_SOURCE_URL, DEMO_ARTIST, DEMO_EMAILS, DEMO_TEAM_NAME,
  LEADER, MEMBERS, ORIGINAL_SONGS, PEOPLE, REVIEW_MARKER, addDaysISO, buildContent, buildTeam, buildUsers,
  chordTones, generatePassword, guideByteLength, guideLayout, isChordLine, localDateISO, lyricsFromCifra,
  renderGuideWav, upcomingSunday,
} from './data.mjs';
import { assertSafeTarget, describePlan, loadFileBytes, main, parseArgs } from './seed.mjs';

const NOW = new Date('2026-10-03T15:00:00Z');
const counterUuid = (prefix = 'a') => {
  let n = 0;
  return () => `${prefix.padEnd(8, '0')}-0000-4000-8000-${String(++n).padStart(12, '0')}`;
};
const refsFor = (uuid) => {
  const refs = { teamId: uuid(), profiles: {}, members: {} };
  for (const person of PEOPLE) { refs.profiles[person.key] = uuid(); refs.members[person.key] = uuid(); }
  return refs;
};
const plan = (now = NOW) => {
  const uuid = counterUuid();
  const refs = refsFor(uuid);
  const content = buildContent({ now, uuid, refs });
  return { refs, content, tables: Object.fromEntries(content.tables), team: buildTeam(refs) };
};

/** Todas as strings de um valor (objetos e arrays aninhados). */
function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => strings(item, out));
  return out;
}

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

describe('dados fictícios', () => {
  test('contas fixas, todas no domínio do +Louvor e sem telefone', () => {
    assert.equal(LEADER.email, 'revisao@maislouvor.com');
    assert.equal(LEADER.role, 'admin');
    assert.ok(MEMBERS.length >= 3 && MEMBERS.length <= 4);
    assert.equal(new Set(DEMO_EMAILS).size, DEMO_EMAILS.length);
    for (const person of MEMBERS) {
      assert.match(person.email, /^membro\d\.revisao@maislouvor\.com$/);
      assert.ok(['editor', 'viewer'].includes(person.role));
    }
    for (const person of PEOPLE) {
      assert.match(person.fullName, /( Exemplo| Demonstração)$/, 'nomes claramente fictícios');
      assert.equal('phone' in person, false);
    }
  });

  test('nenhum padrão de dado pessoal real no plano inteiro', () => {
    const { content, team } = plan();
    const all = strings([content, team, buildUsers(undefined), PEOPLE]);
    const phone = /(?:\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/;
    const cpf = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
    const email = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
    for (const text of all) {
      assert.doesNotMatch(text, phone, `telefone em: ${text}`);
      assert.doesNotMatch(text, cpf, `CPF em: ${text}`);
      for (const found of text.match(email) || []) assert.ok(DEMO_EMAILS.includes(found), `e-mail fora da lista: ${found}`);
      assert.doesNotMatch(text, /youtu\.?be/i, 'nada de links do YouTube na demonstração');
      for (const url of text.match(/https?:\/\/[^\s)]+/g) || []) {
        assert.ok([BABY_BIRD_SOURCE_URL, BABY_BIRD_LICENSE_URL].includes(url), `URL inesperada: ${url}`);
      }
    }
  });

  test('músicas completas para o catálogo (seis campos) e publicadas', () => {
    const { tables } = plan();
    assert.equal(tables.songs.length, ALL_SONG_KEYS.length);
    assert.ok(tables.songs.length >= 5 && tables.songs.length <= 6);
    for (const song of tables.songs) {
      for (const field of ['title', 'artist', 'key_original', 'key_current', 'theme', 'audio_path', 'cifra_text']) {
        assert.ok(typeof song[field] === 'string' && song[field].trim(), `${song.title}: ${field}`);
      }
      assert.equal(song.is_draft, false);
      assert.equal(song.recording_source_url, null);
      assert.deepEqual(song.draft_repertorio_ids, []);
      assert.ok(Number.isInteger(song.bpm) && Number.isInteger(song.duration_seconds) && song.duration_seconds > 0);
    }
    const originals = tables.songs.filter((song) => song.artist === DEMO_ARTIST);
    assert.equal(originals.length, ORIGINAL_SONGS.length);
    const baby = tables.songs.find((song) => song.title === 'Baby Bird (demo)');
    assert.equal(baby.artist, 'Admiral Bob');
    assert.equal(baby.stems_status, 'done');
    assert.match(baby.cifra_text, /CC BY 3\.0/);
    assert.ok(baby.cifra_text.includes(BABY_BIRD_LICENSE_URL) && baby.cifra_text.includes(BABY_BIRD_SOURCE_URL));
    assert.equal(baby.media_url, BABY_BIRD_SOURCE_URL);
  });

  test('cifras originais começam no tom cadastrado e a letra sai sem acordes', () => {
    for (const song of ORIGINAL_SONGS) {
      const firstChordLine = song.cifra.split('\n').find(isChordLine);
      assert.equal(firstChordLine.trim().split(/\s+/)[0], song.keyOriginal, song.title);
      assert.equal(song.guide[0], song.keyOriginal);
      song.guide.forEach((symbol) => chordTones(symbol));
      const lyrics = lyricsFromCifra(song.cifra);
      assert.ok(lyrics.split('\n').every((line) => !isChordLine(line)), song.title);
      assert.match(lyrics, /^\[Verso\]/, 'a introdução só de acordes some da letra');
    }
  });

  test('datas futuras para qualquer dia da semana (fuso de Brasília)', () => {
    for (let day = 0; day < 21; day++) {
      for (const hour of ['02:30', '12:00', '23:30']) {
        const now = new Date(`${addDaysISO('2026-10-03', day)}T${hour}:00-03:00`);
        const today = localDateISO(now);
        const { tables } = plan(now);
        for (const culto of tables.cultos) assert.ok(culto.date > today, `${culto.date} > ${today}`);
        assert.ok(addDaysISO(today, 3) <= tables.cultos[0].date, 'pelo menos 3 dias de folga para a revisão');
        assert.equal(new Date(`${tables.cultos[0].date}T12:00:00Z`).getUTCDay(), 0, 'domingo');
        for (const row of tables.member_availability) assert.ok(row.available_date > today);
        for (const row of [...tables.messages, ...tables.notifications]) assert.ok(new Date(row.created_at) < now);
      }
    }
    assert.equal(upcomingSunday('2026-10-03'), '2026-10-11');
    assert.equal(upcomingSunday('2026-10-07'), '2026-10-11');
    assert.equal(upcomingSunday('2026-10-09'), '2026-10-18');
  });

  test('referências e restrições únicas coerentes dentro do plano', () => {
    const { tables, refs } = plan();
    const ids = (rows) => new Set(rows.map((row) => row.id));
    const songIds = ids(tables.songs);
    const cultoIds = ids(tables.cultos);
    const memberIds = new Set(Object.values(refs.members));
    const profileIds = new Set(Object.values(refs.profiles));
    for (const row of tables.song_tracks) assert.ok(songIds.has(row.song_id));
    for (const row of tables.repertorio_songs) assert.ok(songIds.has(row.song_id));
    for (const row of tables.culto_songs) assert.ok(songIds.has(row.song_id) && cultoIds.has(row.culto_id));
    for (const row of tables.culto_lineup) assert.ok(memberIds.has(row.team_member_id) && cultoIds.has(row.culto_id));
    for (const row of tables.member_availability) assert.ok(memberIds.has(row.team_member_id));
    for (const row of tables.messages) assert.ok(profileIds.has(row.sender_profile_id));
    const unique = (rows, cols) => assert.equal(new Set(rows.map((r) => cols.map((c) => r[c]).join('|'))).size, rows.length, cols.join(','));
    unique(tables.culto_lineup, ['culto_id', 'team_member_id', 'instrument']);
    unique(tables.member_availability, ['team_member_id', 'available_date']);
    unique(tables.repertorio_songs, ['repertorio_id', 'song_id']);
    unique(tables.culto_song_voices, ['culto_song_id', 'team_member_id']);
    // Roteiro: músicas e momentos não disputam a mesma posição.
    for (const culto of tables.cultos) {
      const order = [...tables.culto_songs, ...tables.culto_blocks].filter((r) => r.culto_id === culto.id).map((r) => r.sort_order);
      assert.equal(new Set(order).size, order.length);
    }
    const general = tables.messages.filter((m) => !m.channel_id && !m.culto_id);
    assert.equal(general.length, 8);
    assert.ok(general.some((m) => m.sender_profile_id !== refs.profiles.leader), 'mensagens de outros membros (denunciar/bloquear)');
    for (const loop of tables.song_loop_points) {
      assert.ok(loop.notes.trim() && loop.notes.length <= 1000);
      assert.ok(loop.start_time < loop.end_time && loop.end_time <= BABY_BIRD.durationSeconds + 1);
    }
  });

  test('Asafe desligado e membros com papéis da equipe', () => {
    const { team, refs } = plan();
    assert.equal(team.team.name, DEMO_TEAM_NAME);
    assert.equal(team.team.owner_id, refs.profiles.leader);
    assert.equal(team.assistant.enabled, false);
    assert.ok(Object.values(team.assistant.notification_settings).every((value) => value === false));
    assert.deepEqual(team.members.map((m) => m.role), PEOPLE.map((p) => p.role));
  });

  test('arquivos seguem os caminhos do app e os stems batem com credits.json', async () => {
    const { tables, content, refs } = plan();
    const paths = new Set(content.files.map((file) => file.path));
    for (const song of tables.songs) {
      assert.ok(paths.has(song.audio_path));
      assert.match(song.audio_path, new RegExp(`^${refs.teamId}/${song.id}\\.(wav|m4a)$`));
    }
    for (const track of tables.song_tracks) {
      assert.ok(paths.has(track.audio_path));
      assert.match(track.audio_path, new RegExp(`^${refs.teamId}/[0-9a-f-]+/stems/[a-z]+\\.m4a$`));
    }
    const credits = JSON.parse(await readFile(new URL('./assets/baby-bird/credits.json', import.meta.url), 'utf8'));
    for (const [key, info] of Object.entries(credits.files)) {
      const bytes = await readFile(new URL(`./assets/baby-bird/${info.file}`, import.meta.url));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), info.sha256, key);
    }
    const license = await readFile(new URL('./assets/baby-bird/LICENSE-BabyBird.txt', import.meta.url), 'utf8');
    assert.match(license, /Creative Commons Attribution 3\.0/);
    assert.ok((await stat(new URL('./assets/baby-bird/mix.m4a', import.meta.url))).size > 100_000);
  });

  test('guia em WAV válido, determinístico e do tamanho previsto', () => {
    for (const song of ORIGINAL_SONGS) {
      const bytes = renderGuideWav(song);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const text = (offset) => String.fromCharCode(...bytes.slice(offset, offset + 4));
      assert.equal(text(0), 'RIFF');
      assert.equal(text(8), 'WAVE');
      assert.equal(view.getUint16(22, true), 1, 'mono');
      assert.equal(view.getUint32(24, true), 22050);
      assert.equal(bytes.length, guideByteLength(song));
      const seconds = (bytes.length - 44) / 2 / 22050;
      assert.ok(seconds >= 24 && seconds <= 40, `${song.title}: ${seconds}s`);
      assert.equal(Math.round(guideLayout(song).seconds), Math.round(seconds));
      let peak = 0;
      for (let i = 44; i < bytes.length; i += 2) peak = Math.max(peak, Math.abs(view.getInt16(i, true)));
      assert.ok(peak > 20_000 && peak <= 32767, 'normalizado sem clipar');
    }
    assert.deepEqual(renderGuideWav(ORIGINAL_SONGS[0]), renderGuideWav(ORIGINAL_SONGS[0]));
  });

  test('senha legível, forte e sem caracteres ambíguos', () => {
    // Bytes determinísticos (sha256 de um contador) no lugar de node:crypto.randomBytes.
    let counter = 0;
    const random = (n) => {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i += 32) out.set(createHash('sha256').update(`seed-${counter++}`).digest().subarray(0, n - i), i);
      return out;
    };
    const passwords = new Set();
    for (let i = 0; i < 50; i++) {
      const password = generatePassword(random);
      assert.match(password, /^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
      assert.match(password, /[A-Z]/);
      assert.match(password, /[a-z]/);
      assert.match(password, /[0-9]/);
      assert.doesNotMatch(password, /[01lIO]/);
      passwords.add(password);
    }
    assert.equal(passwords.size, 50);
    assert.ok(buildUsers('Abcd-Efgh-2345-Jkmn').filter((u) => u.password).length === 1, 'só o líder tem senha');
    assert.ok(buildUsers('x').every((u) => u.email_confirm === true && u.app_metadata[REVIEW_MARKER] === true));
  });
});

// ---------------------------------------------------------------------------
// CLI e fluxo
// ---------------------------------------------------------------------------

const FK = {
  teams: [['owner_id', 'profiles']],
  team_members: [['team_id', 'teams'], ['profile_id', 'profiles']],
  assistant_team_settings: [['team_id', 'teams']],
  songs: [['team_id', 'teams'], ['created_by', 'profiles', 'restrict']],
  song_tracks: [['song_id', 'songs']],
  repertorios: [['team_id', 'teams'], ['created_by', 'profiles', 'restrict']],
  repertorio_songs: [['repertorio_id', 'repertorios'], ['song_id', 'songs']],
  cultos: [['team_id', 'teams'], ['created_by', 'profiles', 'restrict']],
  culto_blocks: [['culto_id', 'cultos']],
  culto_songs: [['culto_id', 'cultos'], ['song_id', 'songs'], ['notes_author_id', 'profiles', 'restrict']],
  culto_song_voices: [['culto_song_id', 'culto_songs'], ['team_member_id', 'team_members']],
  culto_lineup: [['culto_id', 'cultos'], ['team_member_id', 'team_members']],
  member_availability: [['team_member_id', 'team_members']],
  channels: [['team_id', 'teams'], ['created_by', 'profiles', 'restrict']],
  messages: [['team_id', 'teams'], ['channel_id', 'channels'], ['sender_profile_id', 'profiles']],
  song_loop_points: [['song_id', 'songs'], ['profile_id', 'profiles']],
  notifications: [['profile_id', 'profiles'], ['team_id', 'teams'], ['sender_profile_id', 'profiles', 'restrict']],
};

/** Store em memória com o contrato do supabaseStore, FKs conferidas e cascatas. */
function createFakeStore({ failOn } = {}) {
  const db = { users: [], tables: new Map(), storage: new Map(), uploads: 0 };
  const rows = (table) => { if (!db.tables.has(table)) db.tables.set(table, []); return db.tables.get(table); };
  const matches = (row, filters = {}) => Object.entries(filters).every(([col, value]) => (Array.isArray(value) ? value.includes(row[col]) : row[col] === value));
  const nextId = counterUuid('f');
  const check = (op, target) => { if (failOn?.(op, target)) throw new Error(`falha simulada: ${op} ${target}`); };
  const checkFks = (table, row) => {
    for (const [col, parent] of FK[table] || []) {
      if (row[col] != null) assert.ok(rows(parent).some((p) => p.id === row[col]), `FK ${table}.${col} -> ${parent}`);
    }
  };
  // FKs sem ON DELETE barram a exclusão antes de qualquer cascata, como no Postgres de
  // produção (ver supabase/tests/review_demo_seed.mjs): por isso o reset apaga a equipe primeiro.
  const cascade = (table, predicate) => {
    const ids = new Set(rows(table).filter(predicate).map((row) => row.id));
    if (!ids.size) return;
    for (const [child, fks] of Object.entries(FK)) {
      for (const [col, parent, rule] of fks) {
        if (parent === table && rule === 'restrict') {
          assert.ok(!rows(child).some((row) => ids.has(row[col])), `${child}.${col} bloquearia a exclusão`);
        }
      }
    }
    db.tables.set(table, rows(table).filter((row) => !ids.has(row.id)));
    for (const [child, fks] of Object.entries(FK)) {
      for (const [col, parent, rule] of fks) if (parent === table && rule !== 'restrict') cascade(child, (row) => ids.has(row[col]));
    }
  };
  const add = (table, row) => {
    const copy = { ...structuredClone(row), id: row.id ?? nextId() };
    checkFks(table, copy);
    rows(table).push(copy);
    // Trigger on_team_created: o dono entra como admin.
    if (table === 'teams') rows('team_members').push({ id: nextId(), team_id: copy.id, profile_id: copy.owner_id, role: 'admin', instruments: [] });
  };
  const store = {
    db,
    rows,
    async listUsersByEmail(emails) {
      return db.users.filter((u) => emails.includes(u.email)).map((u) => ({ id: u.id, email: u.email, app_metadata: u.app_metadata }));
    },
    async createUser(attributes) {
      check('createUser', attributes.email);
      assert.equal(attributes.email_confirm, true);
      const user = { id: nextId(), ...structuredClone(attributes) };
      db.users.push(user);
      rows('profiles').push({ id: nextId(), user_id: user.id, full_name: attributes.user_metadata.full_name });
      return { id: user.id };
    },
    async deleteUser(id) {
      cascade('profiles', (row) => row.user_id === id);
      db.users = db.users.filter((user) => user.id !== id);
    },
    async select(table, columns, filters) { return rows(table).filter((row) => matches(row, filters)).map((row) => ({ ...row })); },
    async insert(table, list) { check('insert', table); list.forEach((row) => add(table, row)); },
    async upsert(table, list, onConflict) {
      check('upsert', table);
      const keys = onConflict.split(',');
      for (const row of list) {
        const existing = rows(table).find((x) => keys.every((key) => x[key] === row[key]));
        if (existing) Object.assign(existing, structuredClone(row)); else add(table, row);
      }
    },
    async remove(table, filters) { cascade(table, (row) => matches(row, filters)); },
    async upload(bucket, path, bytes, contentType) {
      check('upload', path);
      db.uploads++;
      db.storage.set(`${bucket}/${path}`, { size: bytes.length, contentType });
    },
    async listFiles(bucket, prefix) {
      return [...db.storage.keys()].filter((key) => key.startsWith(`${bucket}/${prefix}/`)).map((key) => key.slice(bucket.length + 1));
    },
    async removeFiles(bucket, paths) { paths.forEach((path) => db.storage.delete(`${bucket}/${path}`)); },
  };
  return store;
}

const ENV = { SUPABASE_URL: 'https://api.example.test', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-de-teste-123456' };
const fastBytes = async () => new Uint8Array(16);

/** Roda main() capturando tudo que iria para o terminal. */
async function run(argv, deps) {
  const output = [];
  const original = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const method of Object.keys(original)) console[method] = (...parts) => output.push(parts.map(String).join(' '));
  try {
    const code = await main(argv, { env: ENV, now: NOW, loadBytes: fastBytes, ...deps });
    return { code, output: output.join('\n') };
  } finally {
    Object.assign(console, original);
  }
}

describe('CLI', () => {
  let dir;
  let credentials;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maislouvor-review-test-'));
    credentials = join(dir, 'review', 'credentials.json');
  });
  after(async () => { await rm(dir, { recursive: true, force: true }); });

  test('argumentos: simulação por padrão e modos exclusivos', () => {
    assert.equal(parseArgs([]).mode, 'dry-run');
    assert.equal(parseArgs(['--apply', '--yes']).yes, true);
    assert.throws(() => parseArgs(['--apply', '--reset']), /só um modo/);
    assert.throws(() => parseArgs(['--force']), /desconhecida/);
    assert.throws(() => parseArgs(['--credentials']), /caminho/);
  });

  test('recusa gravar sem --yes, sem https ou sem chave (antes de qualquer rede)', async () => {
    const createStore = () => assert.fail('não pode conectar');
    for (const [argv, env, message] of [
      [['--apply'], ENV, /--yes/],
      [['--reset'], ENV, /--yes/],
      [['--apply', '--yes'], { ...ENV, SUPABASE_URL: 'http://api.example.test' }, /https/],
      [['--apply', '--yes'], { ...ENV, SUPABASE_URL: '' }, /SUPABASE_URL/],
      [['--reset', '--yes'], { ...ENV, SUPABASE_SERVICE_ROLE_KEY: '' }, /SUPABASE_SERVICE_ROLE_KEY/],
      [['--apply', '--yes', '--credentials', fileURLToPath(new URL('./credentials.json', import.meta.url))], ENV, /repositório/],
    ]) {
      const { code, output } = await run([...argv, ...(argv.includes('--credentials') ? [] : ['--credentials', credentials])], { env, createStore });
      assert.equal(code, 2);
      assert.match(output, message);
      assert.ok(!output.includes(ENV.SUPABASE_SERVICE_ROLE_KEY));
    }
    assert.throws(() => assertSafeTarget({ yes: true, env: { ...ENV, SUPABASE_URL: 'ftp://x' } }), /https/);
  });

  test('simulação imprime o plano sem rede e sem criar arquivo', async () => {
    const { code, output } = await run(['--credentials', credentials], { createStore: () => assert.fail('sem rede') });
    assert.equal(code, 0);
    assert.match(output, /SIMULAÇÃO/);
    assert.match(output, /revisao@maislouvor\.com/);
    assert.match(output, /Baby Bird \(demo\)/);
    assert.match(output, /2026-10-11 Culto de Domingo/);
    await assert.rejects(stat(credentials), { code: 'ENOENT' });
    assert.equal(await describePlan({ now: NOW, credentialsPath: credentials }), await describePlan({ now: NOW, credentialsPath: credentials }));
  });

  test('apply cria tudo, guarda a senha só no arquivo 600 e nunca a imprime', async () => {
    const store = createFakeStore();
    const { code, output } = await run(['--apply', '--yes', '--credentials', credentials], {
      createStore: async () => store, loadBytes: loadFileBytes,
    });
    assert.equal(code, 0, output);
    const saved = JSON.parse(await readFile(credentials, 'utf8'));
    assert.equal(saved.email, LEADER.email);
    assert.equal(saved.status, 'ready');
    assert.match(saved.password, /^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
    assert.ok(!output.includes(saved.password), 'senha fora do terminal');
    assert.ok(!output.includes(ENV.SUPABASE_SERVICE_ROLE_KEY), 'chave fora do terminal');
    assert.ok(!JSON.stringify(saved).includes(ENV.SUPABASE_SERVICE_ROLE_KEY), 'chave fora do arquivo');
    assert.ok(output.includes(credentials), 'mostra só o caminho do arquivo');
    assert.equal((await stat(credentials)).mode & 0o777, 0o600);

    assert.equal(store.db.users.length, PEOPLE.length);
    assert.ok(store.db.users.every((u) => u.app_metadata[REVIEW_MARKER] === true && u.email_confirm === true));
    assert.deepEqual(store.db.users.filter((u) => u.password).map((u) => u.email), [LEADER.email]);
    assert.equal(store.db.users.find((u) => u.email === LEADER.email).password, saved.password);
    const [team] = store.rows('teams');
    assert.equal(team.name, DEMO_TEAM_NAME);
    assert.equal(saved.team_id, team.id);
    assert.equal(store.rows('team_members').length, PEOPLE.length);
    const leaderProfile = store.rows('profiles').find((p) => p.user_id === store.db.users[0].id).id;
    assert.deepEqual(store.rows('team_members').find((m) => m.profile_id === leaderProfile).instruments, LEADER.instruments);
    assert.equal(store.rows('assistant_team_settings')[0].enabled, false);
    assert.equal(store.rows('songs').length, 6);
    assert.equal(store.rows('song_tracks').length, 5);
    assert.equal(store.rows('messages').length, 11);
    assert.equal(store.db.storage.size, 11);
    for (const song of store.rows('songs')) assert.ok(store.db.storage.has(`audio/${song.audio_path}`));
  });

  test('apply de novo não duplica nada; reset recria com a mesma senha', async () => {
    const store = createFakeStore();
    const deps = { createStore: async () => store };
    assert.equal((await run(['--apply', '--yes', '--credentials', credentials, '--new-password'], deps)).code, 0);
    const first = JSON.parse(await readFile(credentials, 'utf8'));
    // Uma equipe de outra pessoa não pode ser afetada.
    await store.createUser({ email: 'pessoa@example.test', email_confirm: true, user_metadata: { full_name: 'Outra' }, app_metadata: {} });
    const otherProfile = store.rows('profiles').at(-1).id;
    await store.insert('teams', [{ id: 'c0000000-0000-4000-8000-000000000001', name: DEMO_TEAM_NAME, owner_id: otherProfile }]);
    await store.upload('audio', 'c0000000-0000-4000-8000-000000000001/x.mp3', new Uint8Array(1), 'audio/mpeg');

    const again = await run(['--apply', '--yes', '--credentials', credentials], deps);
    assert.equal(again.code, 0);
    assert.match(again.output, /já existe/);
    assert.equal(store.rows('songs').length, 6);
    assert.equal(store.db.users.length, PEOPLE.length + 1);

    // O revisor gravou algo no Storage da equipe: o reset limpa.
    await store.upload('chat', `${first.team_id}/foto.jpg`, new Uint8Array(1), 'image/jpeg');
    const reset = await run(['--reset', '--yes', '--credentials', credentials], deps);
    assert.equal(reset.code, 0, reset.output);
    const second = JSON.parse(await readFile(credentials, 'utf8'));
    assert.equal(second.password, first.password, 'a senha cadastrada nas lojas continua valendo');
    assert.notEqual(second.team_id, first.team_id);
    assert.ok(!reset.output.includes(first.password));
    assert.equal(store.rows('teams').length, 2);
    assert.ok(store.rows('teams').some((t) => t.owner_id === otherProfile), 'equipe de outra pessoa intacta');
    assert.ok(store.db.storage.has('audio/c0000000-0000-4000-8000-000000000001/x.mp3'));
    assert.ok(![...store.db.storage.keys()].some((key) => key.includes(first.team_id)), 'Storage antigo removido');
    assert.equal(store.rows('songs').length, 6);
    assert.equal(store.rows('messages').length, 11);
    assert.equal(store.db.users.length, PEOPLE.length + 1);

    const rotated = await run(['--reset', '--yes', '--new-password', '--credentials', credentials], deps);
    assert.equal(rotated.code, 0);
    const third = JSON.parse(await readFile(credentials, 'utf8'));
    assert.notEqual(third.password, first.password);
    assert.equal(store.db.users.find((u) => u.email === LEADER.email).password, third.password);
  });

  test('reset limpa o Storage da equipe lembrada mesmo se a conta já foi excluída pelo app', async () => {
    const store = createFakeStore();
    const deps = { createStore: async () => store };
    assert.equal((await run(['--apply', '--yes', '--credentials', credentials], deps)).code, 0);
    const saved = JSON.parse(await readFile(credentials, 'utf8'));
    // Exclusão de conta pelo app: a equipe do dono e depois as contas.
    await assert.rejects(store.deleteUser(store.db.users[0].id), /bloquearia/);
    await store.remove('teams', { id: saved.team_id });
    for (const user of [...store.db.users]) await store.deleteUser(user.id);
    assert.equal(store.rows('teams').length, 0);
    assert.ok(store.db.storage.size > 0);
    const { code } = await run(['--reset', '--yes', '--credentials', credentials], deps);
    assert.equal(code, 0);
    assert.ok(![...store.db.storage.keys()].some((key) => key.includes(saved.team_id)));
    assert.equal(store.rows('teams').length, 1);
  });

  test('não toca em contas sem a marca nem continua um estado parcial', async () => {
    const store = createFakeStore();
    const deps = { createStore: async () => store };
    await store.createUser({ email: MEMBERS[0].email, email_confirm: true, user_metadata: { full_name: 'Real' }, app_metadata: {} });
    for (const mode of ['--apply', '--reset']) {
      const { code, output } = await run([mode, '--yes', '--credentials', credentials], deps);
      assert.equal(code, 1);
      assert.match(output, /sem a marca/);
    }
    assert.equal(store.db.users.length, 1, 'nada apagado');

    const partial = createFakeStore();
    await partial.createUser({ email: LEADER.email, email_confirm: true, user_metadata: { full_name: 'x' }, app_metadata: { [REVIEW_MARKER]: true } });
    const blocked = await run(['--apply', '--yes', '--credentials', credentials], { createStore: async () => partial });
    assert.equal(blocked.code, 1);
    assert.match(blocked.output, /--reset/);
    const fixed = await run(['--reset', '--yes', '--credentials', credentials], { createStore: async () => partial });
    assert.equal(fixed.code, 0, fixed.output);
    assert.equal(partial.db.users.length, PEOPLE.length);
  });

  test('falha no meio: senha preservada no arquivo e fora do terminal', async () => {
    const store = createFakeStore({ failOn: (op, target) => op === 'insert' && target === 'messages' });
    const { code, output } = await run(['--apply', '--yes', '--new-password', '--credentials', credentials], {
      createStore: async () => store,
    });
    assert.equal(code, 1);
    assert.match(output, /falha simulada/);
    const saved = JSON.parse(await readFile(credentials, 'utf8'));
    assert.equal(saved.status, 'pending');
    assert.ok(saved.team_id);
    assert.ok(!output.includes(saved.password));
  });
});
