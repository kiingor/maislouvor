// Banco real em memória + dispatcher real; Evolution simulada, nenhuma mensagem externa.
// PGLITE_MODULE=/caminho/@electric-sql/pglite/dist/index.js node supabase/tests/whatsapp_notifications.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAssistantDb, serviceRpc, withRole } from './helpers/assistant_db.mjs';
import { createNotificationDispatcher, renderNotice } from '../functions/whatsapp-assistant/notifications.ts';
import { createEvolutionClient } from '../functions/whatsapp-assistant/evolution.ts';

const { db } = await createAssistantDb();
const rpc = serviceRpc(db);
const sql = async (s, params) => (await db.query(s, params)).rows;
let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const ok = (a, label) => { assert.ok(a, label); checks++; };
const rejected = async (fn, label) => { await assert.rejects(fn, label); checks++; };
const noticeText = notice => renderNotice(notice)?.messages.map(m=>m.text).join('\n');
const id = () => crypto.randomUUID();
const t = { a: id(), b: id() };
const p = { leader: id(), member: id(), hidden: id(), outsider: id() };
const u = { leader: id(), member: id(), hidden: id(), outsider: id() };
const m = { leader: id(), member: id(), hidden: id(), outsider: id() };
const g = { a: id(), b: id() };
const culto = id();
const song = id();
const bot = '5511955554444@s.whatsapp.net';
const groupA = '120363000000000001@g.us';
const groupB = '120363000000000002@g.us';
const participants = [
  { ids: [bot, '88001@lid'] },
  { ids: ['5511987654321@s.whatsapp.net', '10001@lid'] },
  { ids: ['552199990000@s.whatsapp.net', '10002@lid'] },
  { ids: ['10003@lid'] },
];
const asUser = (who, fn) => withRole(db, 'authenticated', u[who], fn);
const setOption = (key, enabled) => asUser('leader', (tx) => tx.query(
  'select assistant_set_notification($1,$2,$3)', [t.a,key,enabled]));
const due = () => db.exec("update assistant_outbox set available_at = now() - interval '1 second' where status = 'pending'");
const clear = () => db.exec('truncate assistant_outbox');
const queue = () => sql('select * from assistant_outbox order by created_at,id');
const sent = [];
let failInfo = false, failSend = false, beforeSend = null;
const wa = {
  async groupInfo(jid) {
    if (failInfo) throw Error('offline');
    eq(jid, groupA, 'nunca consulta o grupo da outra equipe');
    if (beforeSend) await beforeSend();
    return { subject: 'Louvor A', participants };
  },
  async sendText(to, text, quote, mentioned) {
    if (failSend) throw Error('timeout after delivery may have happened');
    sent.push({ to,text,quote,mentioned });
  },
  async sendPresence() {},
};
const dispatch = createNotificationDispatcher({ rpc, whatsapp: wa, log() {} });

try {
  const migration = await readFile(new URL('../migrations/20260929120000_assistant_notifications.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  await db.exec(await readFile(new URL('../migrations/20260930120000_assistant_missions.sql', import.meta.url),'utf8'));
  eq((await sql("select count(*)::int n from pg_trigger where not tgisinternal and tgname like 'assistant_notice_%'"))[0].n, 6, 'migração reaplicável');
  for (const person of Object.keys(p)) {
    await sql('insert into profiles(id,user_id,full_name,phone) values ($1,$2,$3,$4)',
      [p[person],u[person],person === 'member' ? 'Filipe Teste' : person,
        ({ leader:'(11) 98765-4321',member:'(21) 99999-0000',hidden:null,outsider:'(21) 99999-0000' })[person]]);
  }
  await sql("insert into teams(id,name,owner_id) values ($1,'A',$2),($3,'B',$4)", [t.a,p.leader,t.b,p.outsider]);
  for (const person of Object.keys(m)) {
    await sql('insert into team_members(id,team_id,profile_id,role) values ($1,$2,$3,$4)',
      [m[person], person === 'outsider' ? t.b : t.a, p[person], ['leader','outsider'].includes(person) ? 'admin':'viewer']);
  }
  const today = (await sql('select assistant_today()::text d'))[0].d;
  const future = (await sql("select (assistant_today()+3)::text d"))[0].d;
  await sql("insert into cultos(id,team_id,name,date) values ($1,$2,'Culto da Família',$3)", [culto,t.a,future]);
  await sql("insert into songs(id,team_id,title,key_current) values ($1,$2,'Canção de Teste','G')", [song,t.a]);
  await sql("insert into assistant_groups(id,team_id,group_jid) values ($1,$2,$3),($4,$5,$6)", [g.a,t.a,groupA,g.b,t.b,groupB]);
  await sql("insert into assistant_wa_identities(wa_id,profile_id,source) values ('10003@lid',$1,'code')", [p.hidden]);
  await sql('update assistant_config set enabled=true,bot_phone=$1', [bot.split('@')[0]]);
  eq((await queue()).length,0,'sem retroativo na ativação');

  // RLS, grants e líderes: o navegador não consegue enfileirar nem enviar por RPC interna.
  for (const role of ['anon','authenticated']) {
    await rejected(() => withRole(db,role,u.leader,tx => tx.query('select * from assistant_outbox')));
    for (const name of ['assistant_notice_claim','assistant_notice_reminders']) {
      await rejected(() => withRole(db,role,u.leader,tx => tx.query(`select ${name}()`)));
    }
  }
  await rejected(() => asUser('member', tx => tx.query('select assistant_set_notification($1,$2,true)',[t.a,'escala'])));
  await rejected(() => asUser('outsider', tx => tx.query('select assistant_notification_settings($1)',[t.a])));
  await rejected(() => setOption('bogus',true));
  eq((await asUser('leader',tx => tx.query('select assistant_notification_settings($1) s',[t.a]))).rows[0].s,
    { cultos:true,escala:true,repertorio:true,avisos:true,lembretes:true });

  // Várias funções, várias pessoas e repertório no mesmo save -> um aviso e uma menção por pessoa.
  await sql("insert into culto_lineup(culto_id,team_member_id,instrument,status) values ($1,$2,'Violão','accepted'),($1,$2,'Vocal','pending'),($1,$3,'Teclado','pending')", [culto,m.member,m.hidden]);
  await sql('insert into culto_songs(culto_id,song_id) values ($1,$2)', [culto,song]);
  eq((await queue()).length,1,'coalesce funções/repertório');
  eq(new Set((await queue())[0].payload.categories),new Set(['escala','repertorio']));
  eq((await dispatch()).sent,0,'espera edição terminar');
  await due();
  eq((await dispatch()).sent,1);
  eq(sent[0].to,groupA);
  eq(new Set(sent[0].mentioned),new Set(['10002@lid','10003@lid']));
  ok(sent[0].text.includes('tu foi escalado') && sent[0].text.includes('Canção de Teste — G'));
  ok(sent[0].text.includes('Violão') && sent[0].text.includes('Vocal'));
  ok(!sent[0].text.includes('55219999'),'não expõe o telefone quando há LID');
  eq((await dispatch()).sent,0,'tick repetido não repete entrega');
  eq((await sql('select count(*)::int n from assistant_usage_daily'))[0].n,0,'avisos sem quota de IA');
  eq((await sql("select status from culto_lineup where team_member_id=$1 and instrument='Violão'",[m.member]))[0].status,'accepted','não zera confirmação');

  await clear(); sent.length=0;
  await sql("update culto_lineup set status='accepted' where culto_id=$1",[culto]);
  eq((await queue()).length,0,'respostas não reenviam escala');
  await sql("update culto_lineup set instrument='Guitarra' where culto_id=$1 and team_member_id=$2 and instrument='Violão'",[culto,m.member]);
  await due(); await dispatch();
  ok(sent[0].text.includes('função na escala mudou'));
  eq(sent[0].mentioned,['10002@lid']);
  await clear(); sent.length=0;
  await sql('delete from culto_lineup where culto_id=$1 and team_member_id=$2',[culto,m.hidden]);
  await due(); await dispatch();
  ok(sent[0].text.includes('Saiu desta escala')); eq(sent[0].mentioned,['10003@lid']);

  // Delete + insert idêntico não é mudança de escala; rollback não vaza evento.
  await clear(); sent.length=0;
  await db.transaction(async tx => {
    const row=(await tx.query('delete from culto_lineup where culto_id=$1 returning *',[culto])).rows;
    for (const l of row) await tx.query('insert into culto_lineup(culto_id,team_member_id,instrument,status) values ($1,$2,$3,$4)', [culto,l.team_member_id,l.instrument,l.status]);
  });
  await due(); eq((await dispatch()).sent,0,'rascunho com mesmo estado final fica silencioso');
  await clear();
  await rejected(() => db.transaction(async tx => {
    await tx.query("update cultos set name='rollback' where id=$1",[culto]); throw Error('rollback');
  }));
  eq((await queue()).length,0,'fila atômica com o save');

  // Aviso do líder: N destinatários -> 1 mensagem, inclusive no app antigo.
  await sql("insert into notifications(profile_id,team_id,sender_profile_id,type,title,body) values ($1,$2,$3,'manual','Ensaio','Quinta às 20h'),($4,$2,$3,'manual','Ensaio','Quinta às 20h')",[p.member,t.a,p.leader,p.hidden]);
  eq((await queue()).length,1); await due(); eq((await dispatch()).sent,1);
  ok(sent.at(-1).text.includes('Quinta às 20h')); eq(sent.at(-1).mentioned,[]);
  await clear();
  await sql("insert into notifications(profile_id,team_id,sender_profile_id,type,title) values ($1,$2,$3,'lineup','duplicata app'),($1,$2,$4,'manual','pessoa sem liderança')",[p.member,t.a,p.leader,p.member]);
  eq((await queue()).length,0,'ignora notificações de escala do frontend e avisos de não líderes');

  // Identidade: só participantes presentes, sem adivinhar número ambíguo ou outra equipe.
  const resolve = (ids, parts=participants) => rpc('assistant_notice_mentions',{p_team_id:t.a,p_profile_ids:ids,p_participants:parts});
  eq(await resolve([p.member,p.hidden,p.outsider]),{[p.member]:'10002@lid',[p.hidden]:'10003@lid'});
  eq(await resolve([p.member], [{ids:['552199990000@s.whatsapp.net']}]),{[p.member]:'552199990000@s.whatsapp.net'},'PN também serve');
  eq(await resolve([p.member],[]),{});
  await sql('update profiles set phone=$1 where id=$2',['(21) 99999-0000',p.hidden]);
  eq(await resolve([p.member]),{},'telefone ambíguo não marca a pessoa errada');
  eq(await resolve([p.hidden]),{[p.hidden]:'10003@lid'},'código pessoal tem precedência');
  await sql('update profiles set phone=null where id=$1',[p.hidden]);
  eq(await resolve([p.member],[participants[2],participants[2]]),{},'identidade duplicada na lista não adivinha');
  await sql("insert into assistant_wa_identities(wa_id,profile_id,source) values ('10002@lid',$1,'phone')",[p.member]);
  await sql("update profiles set phone='(31) 97777-6666' where id=$1",[p.member]);
  eq(await resolve([p.member],[{ids:['10002@lid']}]),{},'troca de telefone invalida LID antigo');
  await sql("update profiles set phone='(21) 99999-0000' where id=$1",[p.member]);

  // Mudança de data e de tom original são visíveis; não pinga equipe inteira.
  await clear(); sent.length=0;
  await sql('update cultos set date=date+1 where id=$1',[culto]);
  await sql("update songs set key_current='A' where id=$1",[song]);
  await due(); await dispatch();
  ok(sent[0].text.includes('A data mudou') && sent[0].text.includes('Canção de Teste — A'));
  eq(sent[0].mentioned,['10002@lid']);
  await clear(); sent.length=0;
  const fresh=id();
  await sql("insert into cultos(id,team_id,name,date) values ($1,$2,'Novo culto',$3)",[fresh,t.a,future]);
  await due(); await dispatch(); ok(sent[0].text.includes('culto novo'));
  await clear(); sent.length=0;
  await sql('delete from cultos where id=$1',[fresh]);
  await due(); await dispatch(); ok(sent[0].text.includes('Culto cancelado'));
  await clear(); sent.length=0;
  await sql("insert into cultos(id,team_id,name,date) values ($1,$2,'Rascunho',$3)",[fresh,t.a,future]);
  await sql('delete from cultos where id=$1',[fresh]);
  await due(); eq((await dispatch()).sent,0,'criado e apagado antes do envio');

  // Preferências e desativação são conferidas tanto ao enfileirar quanto antes do envio.
  await clear();
  await setOption('escala',false);
  await sql("insert into culto_lineup(culto_id,team_member_id,instrument) values ($1,$2,'Piano')",[culto,m.hidden]);
  eq((await queue()).length,0);
  await setOption('escala',true);
  await sql("update culto_lineup set instrument='Teclado' where team_member_id=$1",[m.hidden]);
  await setOption('escala',false); await setOption('escala',true);
  await due(); eq((await dispatch()).sent,0,'religar não envia backlog');
  await clear();
  await sql("update cultos set description='detalhes' where id=$1",[culto]);
  await due(); beforeSend=() => setOption('cultos',false);
  eq((await dispatch()).sent,0,'desligado durante consulta do grupo'); beforeSend=null;
  await setOption('cultos',true);
  await clear();
  await sql("update cultos set description='outros detalhes' where id=$1",[culto]);
  await sql("update assistant_groups set activated_at=activated_at+interval '1 second' where id=$1",[g.a]);
  await due(); eq((await dispatch()).sent,0,'reativação não recebe fila da ativação anterior');
  await clear();
  await sql('update assistant_groups set active=false where id=$1',[g.a]);
  await sql("update cultos set description='grupo desligado' where id=$1",[culto]);
  eq((await queue()).length,0);
  await sql('update assistant_groups set active=true where id=$1',[g.a]);
  await sql('update assistant_team_settings set enabled=false where team_id=$1',[t.a]);
  await sql("update cultos set description='equipe suspensa' where id=$1",[culto]);
  eq((await queue()).length,0);
  await sql('update assistant_team_settings set enabled=true where team_id=$1',[t.a]);

  // Retentativas antes do envio; erro depois do envio é incerto, jamais repetido sozinho.
  await sql("update cultos set description='para retry' where id=$1",[culto]);
  await due(); failInfo=true; eq((await dispatch()).retry,1); failInfo=false;
  eq((await queue())[0].status,'pending'); await due(); eq((await dispatch()).sent,1);
  // Durante uma falha pré-envio entram novas pessoas; o retry não duplica a nova menção.
  await clear(); sent.length=0;
  await sql('delete from culto_lineup where culto_id=$1 and team_member_id=$2',[culto,m.hidden]);
  await due(); failInfo=true; await dispatch(); failInfo=false;
  await sql("insert into culto_lineup(culto_id,team_member_id,instrument) values ($1,$2,'Baixo')",[culto,m.leader]);
  await due(); eq((await dispatch()).sent,1,'retry incorpora a escala final uma vez');
  eq((await dispatch()).sent,0);
  eq(sent.filter(msg=>msg.mentioned.includes('10001@lid')).length,1);
  await clear();
  await sql("update cultos set description='para timeout' where id=$1",[culto]);
  await due(); failSend=true; eq((await dispatch()).uncertain,1); failSend=false;
  eq((await queue())[0].status,'uncertain'); await due(); eq((await dispatch()).sent,0);
  await clear();
  await sql("update cultos set description='para concorrência' where id=$1",[culto]);
  await due();
  const claim=await rpc('assistant_notice_claim',{});
  ok(claim?.id); eq(await rpc('assistant_notice_claim',{}),null,'reserva impede dois workers');
  eq(await rpc('assistant_notice_begin',{p_id:claim.id,p_token:id(),p_categories:['cultos']}),false,'token antigo não envia');
  eq(await rpc('assistant_notice_begin',{p_id:claim.id,p_token:claim.lock_token,p_categories:['cultos']}),true);
  await sql("update assistant_outbox set locked_until=now()-interval '1 second' where id=$1",[claim.id]);
  eq(await rpc('assistant_notice_claim',{}),null); eq((await queue())[0].status,'uncertain','crash depois de begin não repete');

  // Véspera em Brasília, uma vez; reescalonar troca a data, recusas não recebem lembrete.
  await clear();
  await sql('update cultos set date=assistant_today()+1 where id=$1',[culto]);
  await clear();
  eq(await rpc('assistant_notice_reminders',{p_now:`${today}T20:59:00Z`}),0,'17h59 em Brasília');
  eq(await rpc('assistant_notice_reminders',{p_now:`${today}T21:00:00Z`}),1,'18h em Brasília');
  eq(await rpc('assistant_notice_reminders',{p_now:`${today}T21:10:00Z`}),0,'dedup por data/grupo');
  eq((await queue()).length,1);
  const snapshot=await rpc('assistant_notice_snapshot',{p_culto_id:culto});
  const reminder={...claim,kind:'reminder',payload:{categories:['lembretes'],after:snapshot}};
  ok(noticeText(reminder).includes('amanhã tem'));
  snapshot.members.forEach(person => person.roles.forEach(role => { role.status='declined'; }));
  eq(renderNotice(reminder),null,'ninguém que recusou recebe lembrete');
  await clear();
  eq(await rpc('assistant_notice_reminders',{p_now:`${today}T23:59:00-03:00`}),0,'não manda de madrugada');

  // Listas extensas se dividem: todas as pessoas são avisadas, sem menções invisíveis.
  const huge=structuredClone(reminder);
  huge.payload.after.members=Array.from({length:100},(_,i)=>({profile_id:`p${i}`,name:`Pessoa ${i}`,roles:[{instrument:'Violão '.repeat(15),status:'pending'}]}));
  const mapping=Object.fromEntries(huge.payload.after.members.map((person,i)=>[person.profile_id,`${1000+i}@lid`]));
  const text=renderNotice(huge,mapping);
  ok(text.messages.every(part=>part.text.length<3600)); ok(text.messages.length>1);
  ok(text.messages.every(part=>part.mentioned.every(jid=>part.text.includes(`@${jid.split('@')[0]}`))));
  eq(text.messages.flatMap(part=>part.mentioned).length,100);
  eq(text.profileIds.length,100);
  let bigClaimed=false, bigBegins=0; const parts=[],finished=[];
  const bigRpc=async(fn,args)=>{
    if(fn==='assistant_notice_reminders'||fn==='assistant_mission_tick') return 0;
    if(fn==='assistant_notice_claim') { if(bigClaimed) return null; bigClaimed=true; return huge; }
    if(fn==='assistant_notice_mentions') return mapping;
    if(fn==='assistant_notice_begin') { bigBegins++; return true; }
    if(fn==='assistant_notice_finish') { finished.push(args.p_result); return true; }
    throw Error(fn);
  };
  const bigDispatch=createNotificationDispatcher({rpc:bigRpc,whatsapp:{
    ...wa, async sendText(to,text,quote,mentioned){parts.push({text,mentioned});},
  },log(){}});
  eq((await bigDispatch()).sent,1);
  eq(parts.length,text.messages.length); eq(bigBegins,parts.length);
  eq(parts.flatMap(part=>part.mentioned).length,100,'dispatcher entrega todas as menções');
  eq(finished,['sent']);
  bigClaimed=false; bigBegins=0; parts.length=0; finished.length=0;
  const partialDispatch=createNotificationDispatcher({rpc:async(fn,args)=>
    fn==='assistant_notice_begin' ? ++bigBegins===1 : bigRpc(fn,args),whatsapp:{
      ...wa,async sendText(to,text,quote,mentioned){parts.push({text,mentioned});},
    },log(){}});
  eq((await partialDispatch()).uncertain,1,'desligar no meio do aviso interrompe as partes restantes');
  eq(parts.length,1); eq(finished,['uncertain']);

  // Transferência entre equipes: cada grupo só vê o estado que pertence à sua equipe.
  await clear();
  const moving=id();
  await sql("insert into cultos(id,team_id,name,date) values ($1,$2,'Culto A',$3)",[moving,t.a,future]);
  await clear();
  await sql("update cultos set team_id=$1,name='Culto reservado de B' where id=$2",[t.b,moving]);
  await due();
  const moved=[];
  for (let i=0;i<2;i++) {
    const item=await rpc('assistant_notice_claim',{}); moved.push(item);
    await rpc('assistant_notice_finish',{p_id:item.id,p_token:item.lock_token,p_result:'skipped'});
  }
  const old=moved.find(item=>item.team_id===t.a), transferred=moved.find(item=>item.team_id===t.b);
  eq(old.payload.after,null); ok(!noticeText(old).includes('reservado'));
  eq(transferred.payload.before,null); ok(noticeText(transferred).includes('Culto reservado de B'));

  // Religar/revincular antes do tick: o primeiro evento da nova ativação não é perdido.
  await clear();
  await sql("update cultos set name='Primeira versão' where id=$1",[culto]);
  await sql("update assistant_groups set activated_at=activated_at+interval '1 second' where id=$1",[g.a]);
  await sql("update cultos set name='Segunda versão' where id=$1",[culto]);
  await due();
  const reactivated=await rpc('assistant_notice_claim',{});
  eq(reactivated.payload.before.name,'Primeira versão');
  eq(reactivated.payload.after.name,'Segunda versão');
  await rpc('assistant_notice_finish',{p_id:reactivated.id,p_token:reactivated.lock_token,p_result:'skipped'});

  // Lease pré-envio recupera; depois de cinco falhas para; mensagens antigas expiram.
  await clear();
  await sql("update cultos set name='Lease' where id=$1",[culto]); await due();
  const leased=await rpc('assistant_notice_claim',{});
  await sql("update assistant_outbox set locked_until=now()-interval '1 second' where id=$1",[leased.id]);
  await rpc('assistant_notice_claim',{});
  eq((await queue())[0].status,'pending');
  await due();
  const reclaimed=await rpc('assistant_notice_claim',{});
  ok(reclaimed.lock_token!==leased.lock_token);
  eq(await rpc('assistant_notice_begin',{p_id:leased.id,p_token:leased.lock_token,p_categories:['cultos']}),false);
  await sql('update assistant_outbox set attempts=5 where id=$1',[leased.id]);
  await rpc('assistant_notice_finish',{p_id:reclaimed.id,p_token:reclaimed.lock_token,p_result:'retry'});
  eq((await queue())[0].status,'failed');
  await clear();
  await sql("update cultos set name='Expiração' where id=$1",[culto]);
  await sql("update assistant_outbox set created_at=now()-interval '25 hours'");
  await due(); eq(await rpc('assistant_notice_claim',{}),null); eq((await queue())[0].status,'skipped');

  // Contrato HTTP real da Evolution: apenas a lista explicitamente resolvida.
  let request;
  const client=createEvolutionClient({baseUrl:'https://fake',instance:'test',apiKey:'fake'},async (_url,init)=>{
    request=JSON.parse(init.body); return new Response('{}',{status:201});
  });
  await client.sendText(groupA,'@10002 eiii',undefined,['10002:4@lid','10002@lid',groupA,'invalid']);
  eq(request.mentioned,['10002@lid']); ok(!('mentionsEveryOne' in request));
  console.log(`${checks} notification checks passed (SQL, permissions, tenant isolation, batching, real mentions, reminders, delivery failures).`);
} finally { await db.close(); }
