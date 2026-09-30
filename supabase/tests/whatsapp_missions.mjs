// Agenda e fila em PostgreSQL real (PGlite); WhatsApp/OpenAI simulados, sem rede.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAssistantDb, serviceRpc, withRole } from './helpers/assistant_db.mjs';
import { createNotificationDispatcher } from '../functions/whatsapp-assistant/notifications.ts';
import { createHandler } from '../functions/whatsapp-assistant/handler.ts';
import { missionWriteIntent, hasExplicitSendTime, runMissionTool } from '../functions/whatsapp-assistant/missions.ts';

const { db } = await createAssistantDb();
const rpc = serviceRpc(db);
const sql = async (q, p) => (await db.query(q, p)).rows;
let checks = 0;
const eq = (a, b, label="valor diferente") => { assert.deepEqual(a, b, label); checks++; };
const ok = (a, label="condição falsa") => { assert.ok(a, label); checks++; };
const denied = async fn => { await assert.rejects(fn, e => e.code === '42501'); checks++; };
const id = () => crypto.randomUUID();
const team = id(), otherTeam = id(), group = id(), otherGroup = id(), siblingGroup = id();
const leader = { user:id(), profile:id(), member:id(), phone:'5511987654321' };
const viewer = { user:id(), profile:id(), member:id(), phone:'5511987654322' };
const editor = { user:id(), profile:id(), member:id(), phone:'5511987654323' };
const outsider = { user:id(), profile:id(), member:id(), phone:'5511987654324' };
const bot='5511955554444@s.whatsapp.net', jid='120363000000000001@g.us';
const args = { titulo:'Ensaio', mensagem:'Equipe, temos ensaio às 19h. 🎶', frequencia:'semanal',dias_semana:[5],horario_envio:'17:00',data:null };
const command = (action, input={}, overrides={}) => rpc('assistant_mission_command', {
  p_team_id:team,p_group_id:group,p_member_id:leader.member,p_request_id:id(),p_action:action,p_args:input,...overrides,
});
const create = async (overrides={}) => {
  const r=await command('criar',{...args,...overrides});ok(r.ok,JSON.stringify(r));return r.missao;
};
const list = async () => (await command('listar')).missoes;
const queued = () => sql("select * from assistant_outbox where kind='mission' order by created_at");
const due = code => sql("update assistant_missions set next_run_at=now()-interval '30 seconds' where code=$1",[code]);
const row = async code => (await sql('select * from assistant_missions where code=$1',[code]))[0];
const clear = () => db.exec('truncate assistant_outbox,assistant_missions,assistant_mission_requests cascade');
const asUser = (person, fn) => withRole(db,'authenticated',person.user,fn);
const sent=[];
let beforeInfo=null, failInfo=false, failSend=false;
const whatsapp={
  async sendPresence(){},
  async groupInfo(to){
    if(failInfo)throw Error('offline');
    if(beforeInfo)await beforeInfo();
    return {subject:'Equipe A',participants:[{ids:[bot]},{ids:[leader.phone+'@s.whatsapp.net']}]};
  },
  async sendText(to,text,quote,mentioned){ if(failSend)throw Error('timeout');sent.push({to,text,quote,mentioned}); },
};
const dispatch=createNotificationDispatcher({rpc,whatsapp,log(){}});

try {
  await db.exec(await readFile(new URL('../migrations/20260929120000_assistant_notifications.sql',import.meta.url),'utf8'));
  const migration=await readFile(new URL('../migrations/20260930120000_assistant_missions.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration);
  for(const [name,p] of Object.entries({leader,viewer,editor,outsider})) {
    await sql('insert into profiles(id,user_id,full_name,phone) values($1,$2,$3,$4)',[p.profile,p.user,name,p.phone]);
  }
  await sql("insert into teams(id,name,owner_id) values($1,'Equipe A',$2),($3,'Equipe B',$4)",[team,leader.profile,otherTeam,outsider.profile]);
  for(const [role,p] of [['admin',leader],['viewer',viewer],['editor',editor],['admin',outsider]]) {
    await sql('insert into team_members(id,team_id,profile_id,role) values($1,$2,$3,$4)',
      [p.member,p===outsider?otherTeam:team,p.profile,role]);
  }
  await sql("insert into assistant_groups(id,team_id,group_jid,group_name) values($1,$2,$3,'Louvor'),($4,$5,'120363000000000002@g.us','Outra equipe'),($6,$2,'120363000000000003@g.us','Outro grupo')",
    [group,team,jid,otherGroup,otherTeam,siblingGroup]);
  await sql('update assistant_config set enabled=true,bot_phone=$1',[bot.split('@')[0]]);
  await sql('insert into assistant_team_settings(team_id,unlimited) values($1,true)',[team]);

  // Calendário sem depender da data do teste: sexta, virada de mês, domingo, Brasília.
  const next=(frequency,days,time,date,after)=>rpc('assistant_mission_next',{
    p_frequency:frequency,p_weekdays:days,p_time:time,p_date:date,p_after:after,
  }).then(value=>value?new Date(value).toISOString():null);
  eq(await next('weekly',[5],'17:00',null,'2026-10-02T19:59:00Z'),'2026-10-02T20:00:00.000Z');
  eq(await next('weekly',[5],'17:00',null,'2026-10-02T20:00:00Z'),'2026-10-09T20:00:00.000Z','igual já é próxima semana');
  eq(await next('weekly',[1,5],'17:00',null,'2026-10-02T20:01:00Z'),'2026-10-05T20:00:00.000Z');
  eq(await next('weekly',[7],'00:00',null,'2026-10-03T23:00:00Z'),'2026-10-04T03:00:00.000Z');
  eq(await next('daily',[],'00:05',null,'2026-10-31T23:00:00Z'),'2026-11-01T03:05:00.000Z');
  eq(await next('once',[],'17:00','2026-10-02','2026-10-01T23:00:00Z'),'2026-10-02T20:00:00.000Z');
  eq(await next('once',[],'17:00','2026-10-02','2026-10-02T20:00:00Z'),null);

  for(const role of ['anon','authenticated']){
    await denied(()=>withRole(db,role,leader.user,tx=>tx.query('select * from assistant_missions')));
    await denied(()=>withRole(db,role,leader.user,tx=>tx.query('select * from assistant_mission_requests')));
    await denied(()=>withRole(db,role,leader.user,tx=>tx.query('select assistant_mission_tick()')));
  }
  for(const person of [viewer,editor,outsider]){
    eq((await command('criar',args,{p_member_id:person.member})).erro,'somente_lider');
    await denied(()=>asUser(person,tx=>tx.query('select assistant_missions_overview($1)',[team])));
    await denied(()=>asUser(person,tx=>tx.query("select assistant_set_mission_state($1,'00000000','cancelar')",[team])));
  }
  eq((await command('criar',args,{p_group_id:otherGroup})).erro,'grupo_invalido');
  eq((await list()).length,0);

  for(const [changes,error] of [
    [{horario_envio:null},'horario_envio_necessario'],[{horario_envio:'25:10'},'horario_invalido'],
    [{horario_envio:'17:5'},'horario_invalido'],[{dias_semana:[]},'dias_necessarios'],
    [{dias_semana:[0,8]},'dias_invalidos'],[{mensagem:' '},'texto_invalido'],
    [{dias_semana:[null]},'dias_invalidos'],[{mensagem:{text:'x'}},'texto_invalido'],
    [{data:'2026-10-02'},'data_apenas_envio_unico'],
    [{titulo:'x'.repeat(81)},'texto_invalido'],[{mensagem:'x'.repeat(1601)},'texto_invalido'],
    [{frequencia:'mensal'},'frequencia_invalida'],
    [{frequencia:'diaria',dias_semana:[5]},'dias_apenas_semanal'],
    [{frequencia:'unica',dias_semana:null,data:null},'data_necessaria'],
    [{frequencia:'unica',dias_semana:null,data:'2026-02-30'},'data_necessaria'],
    [{frequencia:'unica',dias_semana:null,data:'2000-01-01'},'data_no_passado'],
  ])eq((await command('criar',{...args,...changes})).erro,error);
  eq((await list()).length,0,'argumentos inválidos não deixam rascunho');

  const request=id();
  const created=await command('criar',args,{p_request_id:request});
  ok(created.ok);eq(await command('criar',args,{p_request_id:request}),created,'repetição idempotente');
  eq((await command('criar',{...args,titulo:'Outra'},{p_request_id:request})).erro,'uma_alteracao_por_mensagem');
  eq((await list()).length,1);
  eq((await command('listar',{}, {p_group_id:siblingGroup})).missoes,[],'grupo vizinho não herda missão');
  eq((await command('cancelar',{codigo:created.missao.codigo},{p_group_id:siblingGroup})).erro,'missao_nao_encontrada');
  const snapshot=await row(created.missao.codigo);
  eq([snapshot.team_id,snapshot.group_id,snapshot.authorized_by],[team,group,leader.member]);
  eq(created.missao.horario_envio,'17:00');eq(created.missao.fuso,'America/Sao_Paulo');

  // Uma ocorrência, um grupo, um envio. Repetir o timer não repete o aviso.
  await due(created.missao.codigo);
  eq(await rpc('assistant_mission_tick',{}),1);eq(await rpc('assistant_mission_tick',{}),0);
  eq((await queued()).length,1);
  const delivery=await dispatch();eq(delivery.sent,1);
  eq(sent.length,1);eq(sent[0].to,jid);eq(sent[0].mentioned,[]);
  ok(sent[0].text.includes('temos ensaio às 19h'));ok(sent[0].text.includes(created.missao.codigo));
  eq((await dispatch()).sent,0);eq((await row(created.missao.codigo)).last_delivery_status,'sent');
  ok((await row(created.missao.codigo)).next_run_at > new Date());

  // Alterar e pausar invalidam a reserva anterior, mesmo depois do claim.
  await due(created.missao.codigo);await rpc('assistant_mission_tick',{});
  let job=await rpc('assistant_notice_claim',{});
  ok(job?.lock_token);
  const same=await command('alterar',{codigo:created.missao.codigo,horario_envio:'17:00'});
  eq(same.acao,'sem_alteracao');eq((await row(created.missao.codigo)).revision,1,'salvar sem mudança preserva a reserva');
  const changed=await command('alterar',{codigo:created.missao.codigo,horario_envio:'18:00',mensagem:'Ensaio às 20h!'});
  ok(changed.ok);eq(changed.missao.horario_envio,'18:00');
  eq(await rpc('assistant_notice_begin',{p_id:job.id,p_token:job.lock_token,p_categories:['avisos']}),false);
  eq(await rpc('assistant_notice_finish',{p_id:job.id,p_token:job.lock_token,p_result:'skipped'}),true);
  eq((await command('pausar',{codigo:created.missao.codigo})).missao.status,'paused');
  const editPaused=await command('alterar',{codigo:created.missao.codigo,mensagem:'Texto novo'});
  eq(editPaused.missao.status,'paused');eq(editPaused.missao.proximo_envio,null);
  eq(await rpc('assistant_mission_tick',{}),0);
  const resumed=await command('retomar',{codigo:created.missao.codigo});
  eq(resumed.missao.status,'active');ok(resumed.missao.proximo_envio);
  await due(created.missao.codigo);
  beforeInfo=()=>command('cancelar',{codigo:created.missao.codigo});
  eq((await dispatch()).sent,0,'cancelamento após reserva, antes do envio');
  beforeInfo=null;
  eq((await command('retomar',{codigo:created.missao.codigo})).erro,'missao_cancelada');

  // Permissão revogada depois do claim é conferida de novo no begin.
  await clear();
  let mission=await create();
  await due(mission.codigo);await rpc('assistant_mission_tick',{});job=await rpc('assistant_notice_claim',{});
  await sql("update team_members set role='editor' where id=$1",[leader.member]);
  eq(await rpc('assistant_notice_begin',{p_id:job.id,p_token:job.lock_token,p_categories:['avisos']}),false);
  await rpc('assistant_mission_tick',{});eq((await row(mission.codigo)).status,'paused');
  await sql("update team_members set role='admin' where id=$1",[leader.member]);
  // Vínculo de grupo novo não ressuscita agendamento da ativação antiga.
  await command('retomar',{codigo:mission.codigo});await due(mission.codigo);
  await sql("update assistant_groups set activated_at=activated_at+interval '1 second' where id=$1",[group]);
  eq(await rpc('assistant_mission_tick',{}),0);eq((await row(mission.codigo)).status,'paused');
  ok((await command('retomar',{codigo:mission.codigo})).ok,'líder adota agenda explicitamente após conferir grupo');
  await due(mission.codigo);await rpc('assistant_mission_tick',{});job=await rpc('assistant_notice_claim',{});
  // Limpa a reserva anterior de revisão antiga antes de conferir o grupo transferido.
  if(job?.lock_token) await rpc('assistant_notice_finish',{p_id:job.id,p_token:job.lock_token,p_result:'skipped'});
  await sql("update assistant_groups set team_id=$1,group_name='Nome privado de outra equipe' where id=$2",[otherTeam,group]);
  const movedList=(await asUser(leader,tx=>tx.query('select assistant_missions_overview($1) r',[team]))).rows[0].r;
  eq(movedList[0].grupo,null,'grupo transferido não vaza nome da nova equipe');
  for(const q of await queued()) eq(await rpc('assistant_notice_allowed',{p_id:q.id}),false);
  eq((await dispatch()).sent,0);
  ok((await command('cancelar',{codigo:mission.codigo})).ok,'líder encerra sua missão antiga sem acesso à nova equipe');
  await sql("update assistant_groups set team_id=$1,group_name='Louvor' where id=$2",[team,group]);

  // Queda prolongada avança uma vez, sem despejar ocorrências antigas.
  await clear();mission=await create({frequencia:'diaria',dias_semana:null});
  await sql("update assistant_missions set next_run_at=now()-interval '10 days' where code=$1",[mission.codigo]);
  eq(await rpc('assistant_mission_tick',{}),0);eq((await queued()).length,0);
  eq((await row(mission.codigo)).last_delivery_status,'missed');ok((await row(mission.codigo)).next_run_at>new Date());
  // Preferência desligada também não acumula retroativo.
  await due(mission.codigo);
  await asUser(leader,tx=>tx.query("select assistant_set_notification($1,'avisos',false)",[team]));
  eq(await rpc('assistant_mission_tick',{}),0);eq((await row(mission.codigo)).last_delivery_status,'disabled');
  await asUser(leader,tx=>tx.query("select assistant_set_notification($1,'avisos',true)",[team]));
  eq(await rpc('assistant_mission_tick',{}),0);
  // Aviso que atrasou na fila perde a autorização após 15min.
  await due(mission.codigo);await rpc('assistant_mission_tick',{});job=await rpc('assistant_notice_claim',{});
  await sql("update assistant_outbox set scheduled_for=now()-interval '16 minutes' where id=$1",[job.id]);
  eq(await rpc('assistant_notice_begin',{p_id:job.id,p_token:job.lock_token,p_categories:['avisos']}),false);

  // Envio único encerra depois da entrega; falha após envio nunca é repetida.
  await clear();
  const tomorrow=(await sql('select (assistant_today()+1)::text d'))[0].d;
  mission=await create({frequencia:'unica',dias_semana:null,data:tomorrow});
  await due(mission.codigo);eq((await dispatch()).sent,1);eq((await row(mission.codigo)).status,'completed');
  eq((await row(mission.codigo)).next_run_at,null);eq((await dispatch()).sent,0);
  await clear();mission=await create();await due(mission.codigo);failSend=true;
  eq((await dispatch()).uncertain,1);failSend=false;eq((await dispatch()).sent,0);
  eq((await row(mission.codigo)).last_delivery_status,'uncertain');
  await clear();mission=await create();await due(mission.codigo);failInfo=true;
  eq((await dispatch()).retry,1);failInfo=false;
  await db.exec("update assistant_outbox set available_at=now() where status='pending'");
  eq((await dispatch()).sent,1,'falha de consulta antes do envio pode tentar de novo');
  await clear();mission=await create({frequencia:'unica',dias_semana:null,data:tomorrow});
  await sql("update assistant_missions set next_run_at=now()-interval '16 minutes' where code=$1",[mission.codigo]);
  await rpc('assistant_mission_tick',{});eq((await row(mission.codigo)).status,'expired');

  // App: líder controla; resultados refletem o banco e grupo corretos.
  await clear();mission=await create();
  let appList=(await asUser(leader,tx=>tx.query('select assistant_missions_overview($1) r',[team]))).rows[0].r;
  eq(appList[0].codigo,mission.codigo);
  const pause=(await asUser(leader,tx=>tx.query("select assistant_set_mission_state($1,$2,'pausar') r",[team,mission.codigo]))).rows[0].r;
  eq(pause.missao.status,'paused');
  eq((await asUser(outsider,tx=>tx.query('select assistant_missions_overview($1) r',[otherTeam]))).rows[0].r,[]);
  for(let i=1;i<20;i++)await create({titulo:'Agenda '+i});
  eq((await command('criar',args)).erro,'limite_20_missoes');
  await command('cancelar',{codigo:mission.codigo});ok((await command('criar',args)).ok);

  // Frases reais e separação horário de evento/envio.
  const initial='avisa toda sexta pra equipe que tem ensaio às 19h';
  const history=[{role:'user',content:initial},{role:'assistant',content:'Que horas devo mandar o aviso de sexta?'}];
  eq(missionWriteIntent(initial,[]),'criar_missao');
  eq(missionWriteIntent('avise todas as sextas às 17h que tem ensaio',[]),'criar_missao');
  eq(hasExplicitSendTime('17:00','envie uma mensagem toda sexta às 17h: Ensaio às 19h',[]),true);
  eq(hasExplicitSendTime('19:00',initial,[]),false);
  eq(hasExplicitSendTime('17:00','toda sexta às 17h avisa que tem ensaio às 19h',[]),true);
  eq(hasExplicitSendTime('19:00','toda sexta às 17h avisa que tem ensaio às 19h',[]),false);
  eq(missionWriteIntent('às 17h',history),'criar_missao');eq(hasExplicitSendTime('17:00','às 17h',history),true);
  eq(hasExplicitSendTime('17:30','às 5h30 da tarde',history),true);
  eq(missionWriteIntent('quais missões estão ativas?',[]),null);
  eq(missionWriteIntent('não crie essa missão',history),null);
  eq(missionWriteIntent('Como criar um aviso toda sexta?',[]),null);
  eq(missionWriteIntent('pode não criar a missão',history),null);
  eq(missionWriteIntent('por favor não me lembre toda sexta às 17h',history),null);
  eq(missionWriteIntent('obrigado',history),null);
  eq(missionWriteIntent('e o repertório?',history),null);
  eq(missionWriteIntent('quero que avise toda sexta às 17h que tem ensaio às 19h',[]),'criar_missao');
  eq(hasExplicitSendTime('17:00','quero que avise toda sexta às 17h que tem ensaio às 19h',[]),true);
  eq(hasExplicitSendTime('18:00','mude a missão ensaio para às 18h',[]),true);
  eq(hasExplicitSendTime('17:00','17',history),true);
  eq(missionWriteIntent('olha isso\n\n(Contexto: avisa toda sexta às 17h)',[]),null);
  eq(missionWriteIntent('pause a missão ABCD1234',[]),'gerenciar_missao');
  eq(missionWriteIntent('mude a missão ABCD1234 para às 18h',[]),'alterar_missao');
  let called=false;
  const grounded=JSON.parse(await runMissionTool(async()=>{called=true;return{};},{
    teamId:team,groupId:group,memberId:leader.member,requestId:id(),text:initial,history:[],
  },'criar_missao',JSON.stringify({...args,horario_envio:'19:00'})));
  eq(grounded.erro,'horario_envio_necessario');eq(called,false);
  const wrongAction=JSON.parse(await runMissionTool(async()=>{called=true;return{};},{
    teamId:team,groupId:group,memberId:leader.member,requestId:id(),text:'pause a missão ABCD1234',history:[],
  },'gerenciar_missao',JSON.stringify({codigo:'ABCD1234',acao:'cancelar'})));
  eq(wrongAction.erro,'acao_diferente_do_pedido');eq(called,false);
  const monthly=JSON.parse(await runMissionTool(async()=>{called=true;return{};},{
    teamId:team,groupId:group,memberId:leader.member,requestId:id(),text:'agende um aviso todo mês às 17h',history:[],
  },'criar_missao',JSON.stringify(args)));
  eq(monthly.erro,'recorrencia_nao_suportada');eq(called,false);

  // Handler real: consulta de líder, membro bloqueado e follow-up com agenda real.
  await clear();sent.length=0;
  await db.exec('truncate assistant_messages,assistant_inbound_seen');
  let behavior=async()=>({text:'ok',inputTokens:1,outputTokens:1,cachedTokens:0,toolCalls:[]});
  const aiRequests=[];
  const handle=createHandler({rpc,whatsapp,ask:async req=>{aiRequests.push(req);return behavior(req);},log(){}});
  const message=(person,text,quoted)=>({event:'messages.upsert',instance:'maislouvor',sender:bot,
    data:{key:{remoteJid:jid,participant:person.phone+'@s.whatsapp.net',id:id(),fromMe:false},
      message:{extendedTextMessage:{text:'@Asafe '+text,contextInfo:quoted?{
        stanzaId:'quote',participant:viewer.phone+'@s.whatsapp.net',quotedMessage:{conversation:quoted},
      }:{}}},messageTimestamp:Math.floor(Date.now()/1000)}});
  behavior=async req=>{
    const result=JSON.parse(await req.runTool('criar_missao',JSON.stringify(args)));
    eq(result.erro,'acao_nao_autorizada_nesta_mensagem');
    return {text:'Só líderes podem criar missões.',inputTokens:1,outputTokens:1,cachedTokens:0,toolCalls:[]};
  };
  await handle(message(viewer,'toda sexta às 17h avisa que tem ensaio às 19h'));
  eq((await list()).length,0);eq(aiRequests.at(-1).tools.some(t=>t.name==='criar_missao'),false);
  behavior=async req=>{
    eq(JSON.parse(await req.runTool('criar_missao',JSON.stringify(args))).erro,'acao_nao_autorizada_nesta_mensagem');
    return {text:'Nenhuma missão.',inputTokens:1,outputTokens:1,cachedTokens:0,toolCalls:[]};
  };
  await handle(message(leader,'veja isto','crie um aviso toda sexta às 17h'));
  eq((await list()).length,0,'citação não autoriza ação');
  behavior=async req=>{
    eq(JSON.parse(await req.runTool('criar_missao',JSON.stringify({...args,horario_envio:'19:00'}))).erro,'horario_envio_necessario');
    return {text:'Que horas devo mandar o aviso de sexta?',inputTokens:1,outputTokens:1,cachedTokens:0,toolCalls:[]};
  };
  await handle(message(leader,initial));eq((await list()).length,0);
  behavior=async req=>{
    const result=JSON.parse(await req.runTool('criar_missao',JSON.stringify(args)));
    ok(result.ok,JSON.stringify(result));
    eq(JSON.parse(await req.runTool('criar_missao',JSON.stringify(args))),result,'modelo repetindo chamada não duplica');
    return {text:'Missão agendada para sexta às 17h, Brasília. Código '+result.missao.codigo,inputTokens:1,outputTokens:1,cachedTokens:0,toolCalls:['criar_missao']};
  };
  await handle(message(leader,'às 17h'));
  eq((await list()).length,1);eq((await list())[0].horario_envio,'17:00');
  ok(aiRequests.at(-1).instructions.includes('HORÁRIO DE ENVIO'));ok(sent.at(-1).text.includes('agendada'));
  console.log(`${checks} mission checks passed: agenda, permissions, idempotency, cancellation, delivery, app and WhatsApp conversation.`);
} catch(error) {
  console.error(error.stack ?? error, error.where ?? '');
  process.exitCode=1;
} finally {await db.close();}
