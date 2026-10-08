import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { withRole, serviceRpc } from './helpers/assistant_db.mjs';

// Executado no final de lojas_all_migrations: mesmo esquema integrado, sem produção.
export async function runStoreHardeningChecks(db) {
  for (const name of ['20261007120000_strict_assistant_consent.sql','20261007121000_apple_auth_tokens.sql','20261007122000_account_deletion_recovery.sql','20261007123000_content_reports_and_provenance.sql','20261008233000_team_data_consent.sql']) {
    const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url),'utf8');
    await db.exec(sql); await db.exec(sql);
  }
  const q = async (sql,args=[]) => (await db.query(sql,args)).rows;
  const user = (uid,sql,args=[]) => withRole(db,'authenticated',uid,async tx => (await tx.query(sql,args)).rows);
  const rpc = serviceRpc(db);
  const [owner,member,outsider,admin,op,mp,xp,ap,team,song] = Array.from({length:10},() => crypto.randomUUID());
  for (const [uid,pid,name] of [[owner,op,'Dono legado'],[member,mp,'Membro'],[outsider,xp,'Outra pessoa'],[admin,ap,'Moderação']]) {
    await q('insert into auth.users(id) values($1)',[uid]);
    await q('insert into public.profiles(id,user_id,full_name) values($1,$2,$3)',[pid,uid,name]);
    await user(uid,"select public.set_my_team_data_consent(true,'2026-10-08')");
  }
  await q('insert into public.platform_admins(user_id) values($1)',[admin]);
  await q("insert into public.teams(id,name,owner_id) values($1,'Equipe teste',$2)",[team,op]);
  await q("insert into public.team_members(team_id,profile_id,role) values($1,$2,'viewer'),($1,$3,'viewer')",[team,op,mp]);
  const preview = await rpc('account_deletion_preview_for',{p_user_id:owner});
  assert.equal(preview.teams[0].action,'support_required');
  assert.equal(preview.teams[0].candidates[0].profile_id,mp);
  await assert.rejects(user(owner,'select public.account_deletion_recover_team($1,$2,$3)',[owner,team,mp]),{code:'42501'});
  await assert.rejects(rpc('account_deletion_recover_team',{p_user_id:outsider,p_team_id:team,p_new_owner:mp}),{code:'42501'});
  await assert.rejects(rpc('account_deletion_recover_team',{p_user_id:owner,p_team_id:team,p_new_owner:xp}),{code:'42501'});
  await rpc('account_deletion_recover_team',{p_user_id:owner,p_team_id:team,p_new_owner:mp});
  assert.equal((await rpc('account_deletion_preview_for',{p_user_id:owner})).can_delete,true);
  assert.equal((await q('select owner_id from public.teams where id=$1',[team]))[0].owner_id,mp);
  // O antigo dono não recebe permissão administrativa, mesmo após a recuperação.
  await assert.rejects(user(owner,"update public.team_members set role='admin' where team_id=$1 and profile_id=$2",[team,op]),{code:'42501'});

  // Campos antigos de tolerância não podem liberar dados sem aceite.
  await q("update public.assistant_config set ai_member_consent_required=false,ai_consent_required_from=now()+interval '90 days'");
  await q('insert into public.assistant_ai_legacy_members(team_id,profile_id) values($1,$2) on conflict do nothing',[team,op]);
  assert.equal(await rpc('assistant_member_ai_allowed',{p_team_id:team,p_profile_id:op}),false);
  await user(owner,"select public.give_assistant_consent('member_link',null,'2026-10-03')");
  assert.equal(await rpc('assistant_member_ai_allowed',{p_team_id:team,p_profile_id:op}),true);
  await user(owner,"select public.revoke_assistant_consent('member_link',null)");
  assert.equal(await rpc('assistant_member_ai_allowed',{p_team_id:team,p_profile_id:op}),false);

  await q("insert into public.songs(id,team_id,title,artist,audio_path,lyrics_text,created_by) values($1,$2,'Música teste','Autor',$3,'Letra para denúncia',$4)",[song,team,`${team}/${song}.mp3`,mp]);
  await assert.rejects(user(outsider,"select public.report_content('song',$1,'copyright','','')",[song]),{code:'42501'});
  const report=(await user(owner,"select public.report_content('song',$1,'copyright','Licença não apresentada','') as id",[song]))[0].id;
  assert.equal((await user(owner,'select * from public.content_reports')).length,0,'denunciante não recebe fila administrativa');
  assert.equal((await user(admin,'select * from public.content_reports where id=$1',[report])).length,1);
  await assert.rejects(user(owner,"select public.resolve_content_report($1,'resolved','Decisão',true)",[report]),{code:'42501'});
  await assert.rejects(user(owner,'insert into public.content_reports(kind,reason,evidence) values(\'ai\',\'other\',\'x\')'),{code:'42501'});
  await assert.rejects(user(outsider,"select public.set_song_provenance($1,'','original','Minha obra')",[song]),{code:'42501'});
  await user(member,"select public.set_song_provenance($1,'https://example.org/obra','permission','Autorização declarada pelo titular')",[song]);
  await assert.rejects(user(member,"select public.set_song_provenance($1,'javascript:alert(1)','licensed','Licença')",[song]));
  await assert.rejects(user(member,'update public.songs set moderation_blocked=true where id=$1',[song]),{code:'42501'});
  await user(admin,"select public.resolve_content_report($1,'resolved','Retirada após análise',true)",[report]);
  await db.exec('alter table public.songs enable row level security');
  assert.equal((await user(member,'select id from public.songs where id=$1',[song])).length,0,'conteúdo moderado não é retornado');
  assert.equal((await user(member,'select public.moderated_song_file(\'audio\',$1) as denied',[`${team}/${song}.mp3`]))[0].denied,true);
  await assert.rejects(user(member,'select * from public.apple_auth_tokens'),{code:'42501'});
  await assert.rejects(user(member,"insert into public.apple_auth_tokens(user_id,encrypted) values($1,'{}')",[member]),{code:'42501'});
  assert.deepEqual(await q('select * from public.account_deletion_blocking_references()'),[],'novas FKs não bloqueiam exclusão');
  await rpc('delete_account_data',{p_user_id:owner});
  assert.equal((await q('select reporter_id from public.content_reports where id=$1',[report]))[0].reporter_id,null);
  console.log('Store hardening passed: migrações idempotentes; recuperação restrita; consentimento sem tolerância; moderação, origem, tokens e exclusão com RLS.');
}
