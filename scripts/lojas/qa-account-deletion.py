#!/usr/bin/env python3
"""Exercise Auth -> function -> PostgreSQL -> Storage with disposable QA accounts.

Default only describes the plan. --apply creates three marked accounts with
confirmed example.invalid addresses (no email), two private teams and one tiny
avatar. The endpoint deletes them. Finally removes only recorded, marked fixtures.
Credentials stay in server memory. Exact fixture IDs are journaled privately for
recovery if SSH is interrupted. Never selects real users to delete.
"""
import argparse
import shlex
import subprocess
import sys

REMOTE = r'''
import base64,json,os,pathlib,secrets,subprocess,sys,urllib.request,urllib.error,uuid
os.umask(0o077)
obj=json.loads(subprocess.check_output(['docker','inspect','supabase-edge-functions']))[0]
env=dict(x.split('=',1) for x in obj['Config']['Env'] if '=' in x)
admin=env['SUPABASE_SERVICE_ROLE_KEY']; anon=env['SUPABASE_ANON_KEY']
base='https://api.maislouvor.com'
marker='store-deletion-qa-'+uuid.uuid4().hex
release=pathlib.Path('/var/lib/maislouvor-deploy/20261007-account-deletion')
assert (release/'result.json').exists(), 'Backend deployment not verified'
folder=release/marker; folder.mkdir(mode=0o700)
state={'marker':marker,'users':[],'teams':[],'objects':[]}
checks=[]; cleanup=[]; tokens={}; profiles={}; users={}
def persist(): (folder/'fixtures.json').write_text(json.dumps(state,indent=2)+'\n')
def check(value,label):
 if not value: raise AssertionError(label)
 checks.append(label)
def api(path,method='GET',body=None,token=None,raw=None,extra=None):
 headers={'apikey':anon,'Authorization':'Bearer '+(token or admin)}
 if raw is not None: data=raw; headers['Content-Type']='image/png'
 elif body is not None: data=json.dumps(body).encode(); headers['Content-Type']='application/json'
 else: data=None
 headers.update(extra or {})
 req=urllib.request.Request(base+path,data=data,headers=headers,method=method)
 try:
  with urllib.request.urlopen(req,timeout=30) as r: status=r.status; content=r.read()
 except urllib.error.HTTPError as e: status=e.code; content=e.read()
 try: result=json.loads(content) if content else None
 except json.JSONDecodeError: result=None
 return status,result
def rows(table,query):
 status,data=api('/rest/v1/'+table+'?'+query)
 check(status==200 and isinstance(data,list),'Read '+table)
 return data
def insert(table,body):
 status,data=api('/rest/v1/'+table,'POST',body,extra={'Prefer':'return=representation'})
 check(status==201 and isinstance(data,list) and len(data)==1,'Create QA '+table)
 return data[0]
def account_exists(uid):
 status,data=api('/auth/v1/admin/users/'+uid)
 check(status in [200,404],'Read QA account')
 return status==200
def call(who,body): return api('/functions/v1/delete-account','POST',body,token=tokens[who])
def preview(who):
 status,data=api('/rest/v1/rpc/get_account_deletion_preview','POST',{},token=tokens[who])
 check(status==200,'Preview own account')
 return data
def removed(who):
 check(not account_exists(users[who]),'Auth removed '+who)
 check(not rows('profiles','select=id&user_id=eq.'+users[who]),'Profile removed '+who)
 check(not rows('account_deletion_storage_queue','select=path&user_id=eq.'+users[who]),'Storage queue drained '+who)
persist()
failed=False
try:
 for who in ['owner','successor','outsider']:
  email=marker+'-'+who+'@example.invalid'; password=secrets.token_urlsafe(32)
  uid=str(uuid.uuid4()); state['users'].append({'id':uid,'email':email}); persist()
  status,user=api('/auth/v1/admin/users','POST',{'id':uid,'email':email,'password':password,'email_confirm':True,
       'user_metadata':{'full_name':'QA Exclusao '+who,'store_deletion_qa':marker}})
  if status==200 and isinstance(user.get('id'),str):
   # Preserve the returned ID even on servers that ignore caller-provided IDs.
   uid=str(uuid.UUID(user['id'])); state['users'][-1]['id']=uid; persist()
  check(status==200 and user.get('id')==uid,'Create marked Auth '+who)
  users[who]=uid
  profile=rows('profiles','select=id&user_id=eq.'+uid)
  check(len(profile)==1,'Profile created '+who); profiles[who]=profile[0]['id']
  status,session=api('/auth/v1/token?grant_type=password','POST',{'email':email,'password':password},token=anon)
  check(status==200 and isinstance(session.get('access_token'),str),'Real password login '+who)
  tokens[who]=session['access_token']
 team_ids={who:str(uuid.uuid4()) for who in ['owner','outsider']}
 for who,tid in team_ids.items():
  state['teams'].append(tid); persist()
  insert('teams',{'id':tid,'name':marker+' '+who,'owner_id':profiles[who]})
 shared=team_ids['owner']; solo=team_ids['outsider']
 insert('team_members',{'team_id':shared,'profile_id':profiles['successor'],'role':'viewer'})
 song=insert('songs',{'team_id':shared,'title':'QA Exclusao preservar acervo','created_by':profiles['owner']})
 # When moderation is deployed, verify permissions and public filtering with
 # synthetic content only. Never create reports that notify actual moderators.
 moderation=pathlib.Path('/var/lib/maislouvor-deploy/20261007-moderation/result.json').exists()
 if moderation:
  status,_=api('/functions/v1/platform-suspend-account','POST',{'profile_id':profiles['successor'],'action':'suspend'},token=tokens['owner'])
  check(status==403,'Ordinary user cannot suspend an account')
  status,reports=api('/rest/v1/content_reports?select=id',token=tokens['owner'])
  check(status==200 and reports==[],'Administrative content queue private')
  status,_=api('/rest/v1/content_reports','POST',{'kind':'ai','reason':'other','evidence':'QA'},token=tokens['owner'])
  check(status==403,'Client cannot insert reports directly')
  status,_=api('/rest/v1/songs?id=eq.'+song['id'],'PATCH',{'moderation_blocked':True},token=tokens['owner'])
  check(status==403,'Owner cannot set moderation flag')
  status,_=api('/rest/v1/rpc/set_song_provenance','POST',{'p_song_id':song['id'],'p_source_url':'','p_rights_basis':'original','p_rights_details':'Composicao sintetica para QA.'},token=tokens['owner'])
  check(status==204,'Owner records provenance of QA composition')
  check(rows('song_provenance','select=rights_basis&song_id=eq.'+song['id'])[0]['rights_basis']=='original','Provenance retained')
  rep=insert('repertorios',{'team_id':shared,'name':marker,'created_by':profiles['owner'],'is_public':True,'public_token':str(uuid.uuid4())})
  insert('repertorio_songs',{'repertorio_id':rep['id'],'song_id':song['id'],'sort_order':0})
  culto=insert('cultos',{'team_id':shared,'name':marker,'date':'2030-01-01T12:00:00Z','created_by':profiles['owner'],'is_public':True,'public_token':str(uuid.uuid4())})
  insert('culto_songs',{'culto_id':culto['id'],'song_id':song['id'],'sort_order':0})
  for fn,public_token in [('public-playlist',rep['public_token']),('public-culto',culto['public_token'])]:
   status,content=api('/functions/v1/'+fn+'?token='+public_token,token=anon)
   check(status==200 and song['title'] in json.dumps(content),'Unblocked QA music visible in '+fn)
  status,_=api('/rest/v1/songs?id=eq.'+song['id'],'PATCH',{'moderation_blocked':True})
  check(status==204,'Service marks only synthetic QA song')
  status,visible=api('/rest/v1/songs?select=id&id=eq.'+song['id'],token=tokens['owner'])
  check(status==200 and visible==[],'Moderated song hidden from ordinary member')
  for fn,public_token in [('public-playlist',rep['public_token']),('public-culto',culto['public_token'])]:
   status,content=api('/functions/v1/'+fn+'?token='+public_token,token=anon)
   check(status==200 and song['title'] not in json.dumps(content),'Moderated QA music absent from '+fn)
  status,_=api('/rest/v1/songs?id=eq.'+song['id'],'PATCH',{'moderation_blocked':False})
  check(status==204,'Restore synthetic QA song before deletion checks')
 path=users['outsider']+'/'+marker+'.png'; state['objects'].append(path); persist()
 png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=')
 status,_=api('/storage/v1/object/avatars/'+path,'POST',token=tokens['outsider'],raw=png)
 check(status==200,'Upload disposable avatar as its owner')
 status,_=call('outsider',{'user_id':users['owner']})
 check(status==400 and account_exists(users['owner']) and account_exists(users['outsider']),'Confirmation required before deletion')
 status,data=call('owner',{'confirmation':'EXCLUIR'})
 check(status==409 and data.get('error')=='blocked' and account_exists(users['owner']),'Shared team blocks owner deletion')
 # Reproduce the old owner-without-leadership state using only the marked team.
 status,_=api('/rest/v1/team_members?team_id=eq.'+shared+'&profile_id=eq.'+profiles['owner'],'PATCH',{'role':'viewer'})
 check(status==204,'Prepare legacy QA owner')
 data=preview('owner')
 check(not data['can_delete'] and data['teams'][0]['action']=='support_required','Legacy owner sees recovery')
 check(any(c['profile_id']==profiles['successor'] for c in data['teams'][0]['candidates']),'Recovery offers current successor')
 status,_=api('/rest/v1/rpc/account_deletion_recover_team','POST',{'p_user_id':users['owner'],'p_team_id':shared,'p_new_owner':profiles['successor']},token=tokens['owner'])
 check(status in [401,403,404],'Private recovery RPC inaccessible to client')
 status,_=call('outsider',{'action':'resolve_team','teamId':shared,'newOwner':profiles['successor']})
 check(status==409,'Outsider cannot recover another team')
 status,_=call('owner',{'action':'resolve_team','teamId':shared,'newOwner':profiles['outsider']})
 check(status==409,'Recovery rejects nonmember successor')
 status,data=call('outsider',{'confirmation':'EXCLUIR','user_id':users['owner']})
 check(status==200 and data.get('ok') is True,'Deletion uses authenticated caller, ignores supplied user ID')
 removed('outsider')
 check(account_exists(users['owner']) and account_exists(users['successor']),'Other accounts survive forged user ID')
 check(not rows('teams','select=id&id=eq.'+solo),'Sole-owner team removed')
 status,_=api('/storage/v1/object/info/avatars/'+path)
 check(status in [400,404],'Personal avatar removed from Storage')
 status,data=call('outsider',{'confirmation':'EXCLUIR'})
 check(status in [200,401], 'Repeated deletion does not mutate another account')
 check(account_exists(users['owner']),'Owner still survives repeated deletion')
 status,data=call('owner',{'action':'resolve_team','teamId':shared,'newOwner':profiles['successor']})
 check(status==200 and data.get('ok') is True,'Owner recovery endpoint succeeds')
 check(rows('teams','select=owner_id&id=eq.'+shared)[0]['owner_id']==profiles['successor'],'Ownership transferred to successor')
 check(rows('team_members','select=role&team_id=eq.'+shared+'&profile_id=eq.'+profiles['successor'])[0]['role']=='admin','Successor promoted')
 check(preview('owner')['can_delete'],'Previous owner can now leave')
 status,data=call('owner',{'confirmation':'EXCLUIR'})
 check(status==200 and data.get('ok') is True,'Previous owner deleted')
 removed('owner')
 check(len(rows('teams','select=id&id=eq.'+shared))==1,'Shared team preserved')
 retained=rows('songs','select=id,created_by&id=eq.'+song['id'])
 check(len(retained)==1 and retained[0]['created_by'] is None,'Team music preserved without deleted author')
 check(account_exists(users['successor']),'Successor account preserved')
 status,data=call('successor',{'confirmation':'EXCLUIR'})
 check(status==200 and data.get('ok') is True,'Last QA owner deleted')
 removed('successor')
 check(not rows('teams','select=id&id=eq.'+shared),'Final QA team removed')
except Exception as e:
 failed=True
 print('QA failed at: '+str(e),file=sys.stderr)
finally:
 # Journal and marker checks prevent fallback cleanup from targeting other users.
 try:
  for tid in state['teams']:
   found=rows('teams','select=id,name,owner_id&id=eq.'+tid)
   if not found: continue
   check(found[0]['name'].startswith(marker),'Cleanup team marker matches')
   members=rows('team_members','select=profile_id&team_id=eq.'+tid)
   check(all(m['profile_id'] in profiles.values() for m in members),'Cleanup team contains only QA members')
   status,_=api('/rest/v1/teams?id=eq.'+tid,'DELETE')
   check(status==204,'Fallback remove QA team')
  for path in state['objects']:
   status,_=api('/storage/v1/object/avatars','DELETE',{'prefixes':[path]})
   check(status==200,'Cleanup exact QA avatar')
  for record in state['users']:
   uid=record['id']; status,user=api('/auth/v1/admin/users/'+uid)
   if status==404: continue
   check(status==200 and user.get('email')==record['email'] and user.get('user_metadata',{}).get('store_deletion_qa')==marker,'Cleanup account marker matches')
   status,_=api('/auth/v1/admin/users/'+uid,'DELETE')
   check(status==200,'Fallback remove QA Auth account')
  for record in state['users']:
   check(not account_exists(record['id']),'No QA account remains')
  cleanup.append('All journaled accounts, teams and avatar removed')
 except Exception as e:
  failed=True
  print('QA cleanup requires attention: '+str(e),file=sys.stderr)
 report={'passed':not failed,'checks':len(checks),'checks_passed':checks,'cleanup':cleanup,
         'emails_sent':False,'notifications_to_real_moderators':False,'real_customer_accounts_used':False,'apple_real_login_tested':False}
 (folder/'result.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps(report,indent=2))
sys.exit(1 if failed else 0)
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not args.apply:
        print(__doc__)
        return 0
    return subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "louvor-vps",
                           "python3 -c " + shlex.quote(REMOTE)], timeout=180).returncode


if __name__ == "__main__":
    sys.exit(main())
