// PostgreSQL em memória (PGlite) com o mínimo do Supabase para testar o
// assistente do WhatsApp: papéis, auth.uid(), os default privileges que dão
// tudo a anon/authenticated (a migração precisa revogar) e o núcleo do schema.
import { readFile } from 'node:fs/promises';

export const MIGRATION = '20260928120000_whatsapp_assistant.sql';

/** extraMigrations: arquivos de supabase/migrations aplicados depois do assistente, em ordem. */
export async function createAssistantDb({ extraMigrations = [] } = {}) {
  const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
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
  await db.exec(await readFile(new URL('../fixtures/core_schema_20260927.sql', import.meta.url), 'utf8'));
  const migration = await readFile(new URL(`../../migrations/${MIGRATION}`, import.meta.url), 'utf8');
  await db.exec(migration);
  for (const file of extraMigrations) {
    await db.exec(await readFile(new URL(`../../migrations/${file}`, import.meta.url), 'utf8'));
  }
  return { db, migration };
}

/**
 * Roda fn numa transação com o papel (e o auth.uid) só dela. Chamadas que
 * ficam rodando em segundo plano não conseguem trocar o papel de outra.
 */
export function withRole(db, role, uid, fn) {
  return db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE ${role}`);
    await tx.query(`SELECT set_config('test.uid', $1, true)`, [uid ?? '']);
    return fn(tx);
  });
}

/** supabase.rpc() da edge function: argumentos nomeados, como o PostgREST faz, com a service_role. */
export function serviceRpc(db) {
  return (fn, args = {}) => {
    const names = Object.keys(args);
    const params = names.map((name) => {
      const value = args[name];
      return value !== null && typeof value === 'object' && !Array.isArray(value) ? JSON.stringify(value) : value;
    });
    const call = `SELECT public.${fn}(${names.map((name, i) => `${name} => $${i + 1}`).join(', ')}) AS r`;
    return withRole(db, 'service_role', null, async (tx) => (await tx.query(call, params)).rows[0]?.r ?? null);
  };
}
