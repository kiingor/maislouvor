// Validação opcional contra um pg_dump --schema-only de public (sem dados de produção).
// PGLITE_MODULE=... node supabase/tests/whatsapp_notifications_schema.mjs /caminho/schema-public.sql
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { serviceRpc, withRole } from './helpers/assistant_db.mjs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const rows=async(s,p)=>(await db.query(s,p)).rows;
try {
  if (!process.argv[2]) throw new Error('Informe o caminho do schema-only de public.');
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE supabase_admin;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
    DROP SCHEMA public CASCADE;
  `);
  await db.exec(await readFile(process.argv[2],'utf8'));
  await db.exec('SET search_path TO public; SET row_security TO on; SET check_function_bodies TO on;');
  await db.exec(await readFile(new URL('../migrations/20260928120000_whatsapp_assistant.sql',import.meta.url),'utf8'));
  const migration=await readFile(new URL('../migrations/20260929120000_assistant_notifications.sql',import.meta.url),'utf8');
  await db.exec(migration); await db.exec(migration);
  const missions=await readFile(new URL('../migrations/20260930120000_assistant_missions.sql',import.meta.url),'utf8');
  await db.exec(missions); await db.exec(missions);
  const appRpcs=['assistant_team_overview','assistant_create_activation_code','assistant_deactivate_group',
    'assistant_update_instructions','assistant_my_status','assistant_create_link_code','assistant_unlink_me',
    'assistant_notification_settings','assistant_set_notification','assistant_missions_overview','assistant_set_mission_state'];
  for (const f of await rows(`select p.proname,has_function_privilege('anon',p.oid,'execute') anon,
    has_function_privilege('authenticated',p.oid,'execute') authenticated,has_function_privilege('service_role',p.oid,'execute') service,
    p.prosecdef definer,coalesce(array_to_string(p.proconfig,','),'') config from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'assistant_%'`)) {
    eq([f.anon,f.authenticated,f.service],[false,appRpcs.includes(f.proname),true],f.proname);
    if (f.definer) eq(f.config.includes('search_path=public'),true,f.proname);
  }
  for (const table of await rows(`select c.relname,c.relrowsecurity rls,
    has_table_privilege('anon',c.oid,'select') anon,has_table_privilege('authenticated',c.oid,'select') authenticated
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'assistant_%'`)) {
    eq([table.rls,table.anon,table.authenticated],[true,false,false],table.relname);
  }
  const userA=crypto.randomUUID(),userB=crypto.randomUUID(),profileA=crypto.randomUUID(),profileB=crypto.randomUUID();
  const teamA=crypto.randomUUID(),teamB=crypto.randomUUID(),culto=crypto.randomUUID();
  await rows('insert into auth.users(id) values($1),($2)',[userA,userB]);
  await rows('insert into profiles(id,user_id,full_name) values($1,$2,$3),($4,$5,$6)',[profileA,userA,'Líder A',profileB,userB,'Líder B']);
  await rows("insert into teams(id,owner_id,name) values($1,$2,'A'),($3,$4,'B')",[teamA,profileA,teamB,profileB]);
  await rows("insert into assistant_groups(team_id,group_jid) values($1,'120363000000000001@g.us')",[teamA]);
  await db.exec('update assistant_config set enabled=true');
  const asA=(fn)=>withRole(db,'authenticated',userA,fn);
  await asA(tx=>tx.query("insert into cultos(id,team_id,name,date) values($1,$2,'Culto de teste',current_date+3)",[culto,teamA]));
  eq((await rows('select team_id from assistant_outbox')).map(q=>q.team_id),[teamA],'trigger funciona com RLS do dump');
  await assert.rejects(()=>asA(tx=>tx.query("insert into cultos(team_id,name,date) values($1,'Não autorizado',current_date+3)",[teamB])),e=>e.code==='42501');checks++;
  eq((await rows('select count(*)::int n from assistant_outbox'))[0].n,1,'save negado não deixa mensagem');
  await asA(tx=>tx.query("insert into culto_lineup(culto_id,team_member_id,instrument) select $1,id,'Violão' from team_members where team_id=$2 and profile_id=$3",[culto,teamA,profileA]));
  eq((await rows('select count(*)::int n from assistant_outbox'))[0].n,1,'fila também agrupa com todos os triggers reais');
  await assert.rejects(()=>asA(tx=>tx.query('select assistant_notice_claim()')),e=>e.code==='42501');checks++;
  const rpc=serviceRpc(db);
  const member=(await rows('select id from team_members where team_id=$1 and profile_id=$2',[teamA,profileA]))[0].id;
  const group=(await rows('select id from assistant_groups where team_id=$1',[teamA]))[0].id;
  const mission=await rpc('assistant_mission_command',{
    p_team_id:teamA,p_group_id:group,p_member_id:member,p_request_id:'schema-test',p_action:'criar',
    p_args:{titulo:'Ensaio',mensagem:'Ensaio às 19h',frequencia:'semanal',dias_semana:[5],horario_envio:'17:00',data:null},
  });
  eq(mission.ok,true,'missão no schema completo');
  eq((await asA(tx=>tx.query('select assistant_missions_overview($1) r',[teamA]))).rows[0].r[0].codigo,mission.missao.codigo);
  eq((await asA(tx=>tx.query("select assistant_set_mission_state($1,$2,'pausar') r",[teamA,mission.missao.codigo]))).rows[0].r.missao.status,'paused');
  await assert.rejects(()=>withRole(db,'authenticated',userB,tx=>tx.query('select assistant_missions_overview($1)',[teamA])),e=>e.code==='42501');checks++;
  console.log(`${checks} checks passed on the full public schema: migration twice, grants, RLS and real app writes.`);
} catch (error) {
  console.error(error.message, error.code ?? '', error.where ?? '');
  process.exitCode=1;
} finally {await db.close();}
