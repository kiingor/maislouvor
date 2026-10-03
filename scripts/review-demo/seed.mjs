#!/usr/bin/env node
// Conta de revisão das lojas (Apple 2.1 "Sign-in required" / Google Play "App access").
// Cria um líder com uma equipe fictícia e populada para quem revisa o app.
//
//   node scripts/review-demo/seed.mjs                 simulação (padrão): só imprime o plano, sem rede
//   node scripts/review-demo/seed.mjs --apply --yes   cria a conta e a equipe
//   node scripts/review-demo/seed.mjs --reset --yes   apaga a equipe e as contas de revisão e recria
//
// --apply e --reset gravam em PRODUÇÃO com a service_role: exigem SUPABASE_URL em
// https, SUPABASE_SERVICE_ROLE_KEY e --yes. A senha do líder vai só para o arquivo de
// credenciais (diretório 700, arquivo 600); a chave e a senha nunca são impressas.
// Detalhes e cuidados: scripts/review-demo/README.md.
import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BABY_BIRD, CREDENTIALS_RELATIVE_PATH, DEMO_EMAILS, DEMO_TEAM_NAME, LEADER, ORIGINAL_SONGS, PEOPLE,
  REVIEW_MARKER, TIME_ZONE, buildContent, buildTeam, buildUsers, generatePassword, renderGuideWav,
} from './data.mjs';

const ASSETS_DIR = fileURLToPath(new URL('./assets/', import.meta.url));
const REPO_ROOT = resolve(ASSETS_DIR, '..', '..', '..');

export const USAGE = `Uso: node scripts/review-demo/seed.mjs [--dry-run | --apply --yes | --reset --yes] [opções]

  --dry-run         (padrão) imprime o plano completo; não usa a rede nem grava nada
  --apply           cria a conta de revisão e a equipe de demonstração
  --reset           apaga a equipe e as contas de revisão e cria tudo de novo
  --yes             confirma a gravação em produção (obrigatório com --apply/--reset)
  --new-password    gera outra senha em vez de reaproveitar a do arquivo de credenciais
  --credentials P   caminho do arquivo de credenciais (padrão: ~/${CREDENTIALS_RELATIVE_PATH})

Variáveis (só para --apply/--reset): SUPABASE_URL (https) e SUPABASE_SERVICE_ROLE_KEY.`;

// ---------------------------------------------------------------------------
// Argumentos e segurança
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const options = { mode: null, yes: false, newPassword: false, credentialsPath: null, help: false };
  const setMode = (mode) => {
    if (options.mode && options.mode !== mode) throw new Error('Use só um modo: --dry-run, --apply ou --reset.');
    options.mode = mode;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') setMode('dry-run');
    else if (arg === '--apply') setMode('apply');
    else if (arg === '--reset') setMode('reset');
    else if (arg === '--yes') options.yes = true;
    else if (arg === '--new-password') options.newPassword = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--credentials') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error('Informe o caminho depois de --credentials.');
      options.credentialsPath = resolve(value);
    } else throw new Error(`Opção desconhecida: ${arg}`);
  }
  options.mode ??= 'dry-run';
  return options;
}

/** Só grava com --yes, URL https e a chave presente. Nunca devolve a chave em mensagens. */
export function assertSafeTarget({ yes, env }) {
  if (!yes) throw new Error('Este modo grava em produção. Confirme com --yes.');
  const rawUrl = (env.SUPABASE_URL || '').trim();
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error('Defina SUPABASE_URL (https://...).'); }
  if (url.protocol !== 'https:') throw new Error('SUPABASE_URL precisa usar https://.');
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!key) throw new Error('Defina SUPABASE_SERVICE_ROLE_KEY (chave service_role).');
  return { url: url.origin, host: url.host, key };
}

/** Saída com segredos mascarados: a chave e a senha nunca chegam ao terminal. */
export function createLogger() {
  const secrets = new Set();
  const redact = (parts) => {
    let text = parts.map(String).join(' ');
    for (const secret of secrets) text = text.split(secret).join('[oculto]');
    return text;
  };
  return {
    addSecret(secret) { if (secret && secret.length >= 6) secrets.add(secret); },
    info: (...parts) => console.log(redact(parts)),
    warn: (...parts) => console.warn(redact(parts)),
    error: (...parts) => console.error(redact(parts)),
  };
}

// ---------------------------------------------------------------------------
// Arquivo de credenciais
// ---------------------------------------------------------------------------

export function defaultCredentialsPath() {
  return join(homedir(), CREDENTIALS_RELATIVE_PATH);
}

export function assertCredentialsOutsideRepo(path) {
  const rel = relative(REPO_ROOT, resolve(path));
  if (rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !/^[a-zA-Z]:/.test(rel))) {
    throw new Error('O arquivo de credenciais não pode ficar dentro do repositório.');
  }
}

export async function readCredentials(path) {
  let raw;
  try { raw = await readFile(path, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Não foi possível ler ${path} (${error.code}).`);
  }
  try { return JSON.parse(raw); } catch { throw new Error(`${path} não é um JSON válido. Corrija ou apague o arquivo.`); }
}

/** Grava com permissão 600 (troca atômica). O diretório padrão fica com 700. */
export async function writeCredentials(path, data) {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (resolve(path) === defaultCredentialsPath()) await chmod(dir, 0o700);
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, path);
  await chmod(path, 0o600);
}

// ---------------------------------------------------------------------------
// Acesso ao Supabase (service_role). Interface pequena para os testes simularem.
// ---------------------------------------------------------------------------

const PAGE = 1000;

function applyFilters(query, filters = {}) {
  for (const [column, value] of Object.entries(filters)) {
    query = Array.isArray(value) ? query.in(column, value) : query.eq(column, value);
  }
  return query;
}

/** Store sobre o supabase-js: Auth admin, PostgREST e Storage. */
export function supabaseStore(client) {
  const must = (label, { data, error }) => {
    if (error) throw new Error(`${label}: ${error.message}`);
    return data;
  };
  const chunks = (rows, size) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));
  return {
    async listUsersByEmail(emails) {
      const wanted = new Set(emails.map((email) => email.toLowerCase()));
      const found = [];
      for (let page = 1; page <= 10_000; page++) {
        const data = must('auth.listUsers', await client.auth.admin.listUsers({ page, perPage: PAGE }));
        for (const user of data.users) {
          const email = (user.email || '').toLowerCase();
          if (wanted.has(email)) found.push({ id: user.id, email, app_metadata: user.app_metadata || {} });
        }
        if (data.users.length < PAGE) return found;
      }
      throw new Error('auth.listUsers: paginação não terminou.');
    },
    async createUser(attributes) {
      const data = must(`auth.createUser(${attributes.email})`, await client.auth.admin.createUser(attributes));
      return { id: data.user.id };
    },
    async deleteUser(id) {
      must(`auth.deleteUser(${id})`, await client.auth.admin.deleteUser(id));
    },
    async select(table, columns, filters) {
      return must(`select ${table}`, await applyFilters(client.from(table).select(columns), filters)) || [];
    },
    async insert(table, rows) {
      for (const part of chunks(rows, 200)) must(`insert ${table}`, await client.from(table).insert(part));
    },
    async upsert(table, rows, onConflict) {
      must(`upsert ${table}`, await client.from(table).upsert(rows, { onConflict }));
    },
    async remove(table, filters) {
      if (!filters || !Object.keys(filters).length) throw new Error(`delete ${table} sem filtro.`);
      must(`delete ${table}`, await applyFilters(client.from(table).delete(), filters));
    },
    async upload(bucket, path, bytes, contentType) {
      must(`upload ${bucket}/${path}`, await client.storage.from(bucket).upload(path, bytes, { contentType, upsert: true }));
    },
    async listFiles(bucket, prefix) {
      const files = [];
      const folders = [prefix.replace(/\/+$/, '')];
      while (folders.length) {
        const folder = folders.pop();
        for (let offset = 0; ; offset += 100) {
          const items = must(`list ${bucket}/${folder}`, await client.storage.from(bucket).list(folder, { limit: 100, offset })) || [];
          for (const item of items) (item.id ? files : folders).push(`${folder}/${item.name}`);
          if (items.length < 100) break;
        }
      }
      return files;
    },
    async removeFiles(bucket, paths) {
      for (const part of chunks(paths, 100)) must(`remove ${bucket}`, await client.storage.from(bucket).remove(part));
    },
  };
}

export async function createSupabaseStore({ url, key }) {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return supabaseStore(client);
}

// ---------------------------------------------------------------------------
// Arquivos de áudio
// ---------------------------------------------------------------------------

const songByKey = Object.fromEntries(ORIGINAL_SONGS.map((song) => [song.key, song]));

/** Bytes de um arquivo do plano: guia sintetizado ou asset versionado em assets/. */
export async function loadFileBytes(file) {
  if (file.source.kind === 'guide') return renderGuideWav(songByKey[file.source.song]);
  return readFile(join(ASSETS_DIR, file.source.file));
}

async function fileSize(file) {
  if (file.bytes) return file.bytes;
  return (await stat(join(ASSETS_DIR, file.source.file))).size;
}

// ---------------------------------------------------------------------------
// Operações
// ---------------------------------------------------------------------------

/** O que já existe da conta de revisão (identificada pelos e-mails fixos + marca). */
export async function inspectDemo(store) {
  const users = await store.listUsersByEmail(DEMO_EMAILS);
  const unmarked = users.filter((user) => user.app_metadata?.[REVIEW_MARKER] !== true);
  const profiles = users.length ? await store.select('profiles', 'id,user_id', { user_id: users.map((u) => u.id) }) : [];
  const teams = profiles.length ? await store.select('teams', 'id,name,owner_id', { owner_id: profiles.map((p) => p.id) }) : [];
  return { users, unmarked, profiles, teams };
}

function refuseUnmarked(state) {
  if (state.unmarked.length) {
    throw new Error(`Estes e-mails já pertencem a contas sem a marca ${REVIEW_MARKER}: `
      + `${state.unmarked.map((u) => u.email).join(', ')}. Nada foi alterado; confira manualmente.`);
  }
}

/** Garante um perfil por conta (o trigger handle_new_user cria; aqui só completa se faltar). */
async function resolveProfiles(store, userIds) {
  const byUser = async () => Object.fromEntries(
    (await store.select('profiles', 'id,user_id', { user_id: Object.values(userIds) })).map((p) => [p.user_id, p.id]),
  );
  let found = await byUser();
  const missing = PEOPLE.filter((person) => !found[userIds[person.key]]);
  if (missing.length) {
    await store.insert('profiles', missing.map((person) => ({ user_id: userIds[person.key], full_name: person.fullName })));
    found = await byUser();
  }
  const profiles = {};
  for (const person of PEOPLE) {
    profiles[person.key] = found[userIds[person.key]];
    if (!profiles[person.key]) throw new Error(`Perfil de ${person.email} não foi criado.`);
  }
  return profiles;
}

/**
 * Cria tudo. Idempotente: se a conta completa já existe, não faz nada; se só parte
 * existe (execução interrompida), para e pede --reset. `saveCredentials` grava a senha
 * ANTES de criar o usuário, para ela nunca se perder.
 */
export async function applyDemo({ store, now, uuid, password, log, saveCredentials, loadBytes = loadFileBytes }) {
  const state = await inspectDemo(store);
  refuseUnmarked(state);
  const demoTeam = state.teams.find((team) => team.name === DEMO_TEAM_NAME);
  if (state.users.length === PEOPLE.length && demoTeam) {
    log.info('A conta de revisão já existe. Nada foi alterado (use --reset --yes para recriar).');
    return { status: 'exists', teamId: demoTeam.id };
  }
  if (state.users.length || state.teams.length) {
    throw new Error('Existe só parte da conta de revisão (execução interrompida?). Rode com --reset --yes.');
  }

  await saveCredentials({ status: 'pending', team_id: null });
  log.info('1/5 Contas (e-mail já confirmado, nenhum e-mail enviado)');
  const userIds = {};
  for (const attributes of buildUsers(password)) {
    const { key, ...body } = attributes;
    userIds[key] = (await store.createUser(body)).id;
    log.info(`    ${attributes.email}`);
  }
  const profiles = await resolveProfiles(store, userIds);

  log.info(`2/5 Equipe "${DEMO_TEAM_NAME}" (Asafe desligado)`);
  const teamId = uuid();
  const { team, members, assistant } = buildTeam({ teamId, profiles });
  await store.insert('teams', [team]);
  // O trigger on_team_created já põe o dono como admin; o upsert completa as funções.
  await store.upsert('team_members', members, 'team_id,profile_id');
  const memberRows = await store.select('team_members', 'id,profile_id', { team_id: teamId });
  const memberIds = {};
  for (const person of PEOPLE) {
    memberIds[person.key] = memberRows.find((row) => row.profile_id === profiles[person.key])?.id;
    if (!memberIds[person.key]) throw new Error(`Membro ${person.email} não entrou na equipe.`);
  }
  await store.upsert('assistant_team_settings', [assistant], 'team_id');
  await saveCredentials({ status: 'pending', team_id: teamId });

  const content = buildContent({ now, uuid, refs: { teamId, profiles, members: memberIds } });
  log.info(`3/5 Arquivos de áudio (${content.files.length})`);
  for (const file of content.files) {
    await store.upload(file.bucket, file.path, await loadBytes(file), file.contentType);
  }
  log.info('4/5 Músicas, repertório, cultos, escala, disponibilidade, chat, loops e avisos');
  for (const [table, rows] of content.tables) {
    await store.insert(table, rows);
    log.info(`    ${table}: ${rows.length}`);
  }
  await saveCredentials({ status: 'ready', team_id: teamId });
  log.info('5/5 Pronto.');
  return { status: 'created', teamId, content };
}

/**
 * Apaga a equipe (e o que estiver no Storage dela) e as contas de revisão. Só toca
 * contas com a marca; equipes só se o dono for uma conta de revisão.
 */
export async function resetDemo({ store, log, rememberedTeamIds = [] }) {
  const state = await inspectDemo(store);
  refuseUnmarked(state);
  const demoProfiles = new Set(state.profiles.map((p) => p.id));
  const teamIds = new Set(state.teams.map((team) => team.id));
  // Equipe registrada no arquivo de credenciais: limpa o Storage mesmo se a equipe
  // já foi apagada (ex.: o revisor excluiu a conta pelo app).
  const remembered = rememberedTeamIds.filter((id) => id && !teamIds.has(id));
  if (remembered.length) {
    const rows = await store.select('teams', 'id,owner_id', { id: remembered });
    for (const id of remembered) {
      const row = rows.find((team) => team.id === id);
      if (!row || demoProfiles.has(row.owner_id)) teamIds.add(id);
      else log.warn(`    equipe ${id} tem outro dono: mantida.`);
    }
  }
  log.info(`Limpando ${teamIds.size} equipe(s) e ${state.users.length} conta(s) de revisão`);
  for (const teamId of teamIds) {
    for (const bucket of ['audio', 'covers', 'chat']) {
      const files = await store.listFiles(bucket, teamId);
      if (files.length) await store.removeFiles(bucket, files);
    }
  }
  for (const user of state.users) {
    const files = await store.listFiles('avatars', user.id);
    if (files.length) await store.removeFiles('avatars', files);
  }
  if (state.teams.length) await store.remove('teams', { id: state.teams.map((team) => team.id) });
  for (const user of state.users) await store.deleteUser(user.id);
  return { teams: [...teamIds], users: state.users.map((u) => u.email) };
}

// ---------------------------------------------------------------------------
// Plano (simulação)
// ---------------------------------------------------------------------------

const ROLE_LABEL = { admin: 'líder (admin), dono da equipe', editor: 'editor', viewer: 'membro (viewer)' };

export async function describePlan({ now, credentialsPath }) {
  let n = 0;
  const fakeId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const refs = { teamId: fakeId(), profiles: {}, members: {} };
  for (const person of PEOPLE) { refs.profiles[person.key] = fakeId(); refs.members[person.key] = fakeId(); }
  const content = buildContent({ now, uuid: fakeId, refs });
  const table = Object.fromEntries(content.tables);
  let totalBytes = 0;
  for (const file of content.files) totalBytes += await fileSize(file);
  const lines = [];
  const add = (line = '') => lines.push(line);
  add('+Louvor · conta de revisão das lojas — SIMULAÇÃO (nada foi gravado, nenhuma rede usada)');
  add(`Hoje: ${content.today} (${TIME_ZONE})`);
  add();
  add(`Contas no Auth (e-mail confirmado, nenhum e-mail enviado, app_metadata.${REVIEW_MARKER} = true)`);
  for (const person of PEOPLE) {
    const access = person.key === LEADER.key
      ? `senha gerada e gravada só em ${credentialsPath}`
      : 'sem senha (não faz login), sem telefone';
    add(`  ${person.email} — ${person.fullName} · ${ROLE_LABEL[person.role]} · ${person.instruments.join(', ')} · ${access}`);
  }
  add();
  add(`Equipe "${DEMO_TEAM_NAME}"`);
  add('  Asafe: não ativado (sem grupo); assistente suspenso nesta equipe e avisos automáticos desligados');
  add();
  add(`Músicas (${table.songs.length}), todas com os seis campos do cadastro (nome, artista, tom, tema, cifra e áudio)`);
  for (const song of table.songs) {
    const tracks = table.song_tracks.filter((track) => track.song_id === song.id);
    const extra = tracks.length
      ? `${tracks.length} faixas (${tracks.map((t) => t.track_name).join(', ')}) · CC BY 3.0`
      : `guia de ${song.duration_seconds} s`;
    add(`  ${song.title} — ${song.artist} · ${song.key_original} · ${song.theme} · ${song.bpm} BPM · ${extra}`);
  }
  add(`  Arquivos no bucket audio: ${content.files.length} (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
  add();
  add(`Repertório "${table.repertorios[0].name}": ${table.repertorio_songs.length} músicas`);
  add('Cultos');
  for (const culto of table.cultos) {
    const songs = table.culto_songs.filter((row) => row.culto_id === culto.id).length;
    const blocks = table.culto_blocks.filter((row) => row.culto_id === culto.id).length;
    const lineup = table.culto_lineup.filter((row) => row.culto_id === culto.id);
    add(`  ${culto.date} ${culto.name} — ${songs} músicas, ${blocks} momento(s), escala: `
      + lineup.map((row) => `${PEOPLE.find((p) => refs.members[p.key] === row.team_member_id).fullName} (${row.instrument}, ${row.status})`).join('; '));
  }
  add(`Disponibilidade: ${table.member_availability.length} registros`);
  const general = table.messages.filter((m) => !m.channel_id).length;
  add(`Chat: ${general} mensagens em Geral e ${table.messages.length - general} no canal "${table.channels[0].name}"`);
  add(`Loops: ${table.song_loop_points.length} na ${BABY_BIRD.title}, com anotação`);
  add(`Avisos para o líder: ${table.notifications.length}`);
  add();
  add('Para gravar (produção — rode você mesmo, com a service_role):');
  add('  SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... node scripts/review-demo/seed.mjs --apply --yes');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export async function main(argv = process.argv.slice(2), deps = {}) {
  const {
    env = process.env, now = new Date(), createStore = createSupabaseStore, random = randomBytes,
    uuid = randomUUID, loadBytes = loadFileBytes,
  } = deps;
  const log = createLogger();
  let options;
  try { options = parseArgs(argv); } catch (error) {
    log.error(error.message);
    log.error(USAGE);
    return 2;
  }
  if (options.help) { log.info(USAGE); return 0; }
  const credentialsPath = options.credentialsPath || defaultCredentialsPath();

  if (options.mode === 'dry-run') {
    log.info(await describePlan({ now, credentialsPath }));
    return 0;
  }

  let target;
  try {
    target = assertSafeTarget({ yes: options.yes, env });
    log.addSecret(target.key);
    assertCredentialsOutsideRepo(credentialsPath);
  } catch (error) {
    log.error(error.message);
    return 2;
  }

  try {
    const previous = await readCredentials(credentialsPath);
    // Reaproveita a senha já cadastrada nas lojas, a menos que peçam outra.
    const reuse = !options.newPassword && previous?.email === LEADER.email
      && typeof previous.password === 'string' && previous.password.length >= 12;
    const password = reuse ? previous.password : generatePassword(random);
    log.addSecret(password);
    const saveCredentials = (extra) => writeCredentials(credentialsPath, {
      purpose: 'Conta de revisão das lojas (+Louvor). Use só no App Store Connect e no Play Console.',
      email: LEADER.email,
      password,
      supabase_url: target.url,
      team_name: DEMO_TEAM_NAME,
      updated_at: new Date().toISOString(),
      ...extra,
    });

    log.info(`Destino: ${target.host} (${options.mode === 'reset' ? 'reset' : 'apply'})`);
    const store = await createStore(target);
    if (options.mode === 'reset') {
      await resetDemo({ store, log, rememberedTeamIds: previous?.team_id ? [previous.team_id] : [] });
    }
    const result = await applyDemo({ store, now, uuid, password, log, saveCredentials, loadBytes });
    if (result.status === 'created') {
      log.info(`Login: ${LEADER.email}`);
      log.info(`Senha: ${reuse ? 'a mesma de antes' : 'nova'}, gravada em ${credentialsPath} (não é exibida aqui).`);
    } else if (!previous) {
      log.warn(`Sem arquivo de credenciais em ${credentialsPath}: rode --reset --yes para gerar uma senha nova.`);
    }
    return 0;
  } catch (error) {
    log.error(`Falhou: ${error.message}`);
    log.error('Nada mais foi gravado depois do erro. Para limpar e recriar: --reset --yes.');
    return 1;
  }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exitCode = await main();
