#!/usr/bin/env python3
"""Production HTTP verification using only marked, disposable accounts.

setup leaves the verified fixture available for browser QA. cleanup removes only
its journaled UUIDs after checking names/emails and membership ownership. No email
is sent, no Stripe purchase is submitted, no real account is edited.
"""
import argparse
import shlex
import subprocess

REMOTE = r'''
import concurrent.futures,json,os,pathlib,secrets,subprocess,sys,urllib.request,urllib.error,uuid
os.umask(0o077)
mode=sys.argv[1]
folder=pathlib.Path('/var/lib/maislouvor-deploy/20261007-web-billing/qa')
obj=json.loads(subprocess.check_output(['docker','inspect','supabase-edge-functions']))[0]
env=dict(x.split('=',1) for x in obj['Config']['Env'] if '=' in x)
admin=env['SUPABASE_SERVICE_ROLE_KEY'];anon=env['SUPABASE_ANON_KEY'];base='https://api.maislouvor.com'
checks=[]
def check(ok,label):
 if not ok: raise AssertionError(label)
 checks.append(label)
def api(path,method='GET',body=None,token=None,extra=None):
 headers={'apikey':anon,'Authorization':'Bearer '+(token or admin),'Content-Type':'application/json',**(extra or {})}
 req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
 try:
  with urllib.request.urlopen(req,timeout=40) as r: status=r.status; content=r.read()
 except urllib.error.HTTPError as e: status=e.code;content=e.read()
 try: data=json.loads(content) if content else None
 except: data=None
 return status,data
def rows(table,query):
 status,data=api('/rest/v1/'+table+'?'+query);check(status==200 and isinstance(data,list),'Read '+table);return data
def insert(table,body):
 status,data=api('/rest/v1/'+table,'POST',body,extra={'Prefer':'return=representation'})
 check(status==201 and isinstance(data,list),'Insert '+table+' status '+str(status));return data[0]
def rpc(name,body,token):return api('/rest/v1/rpc/'+name,'POST',body,token)
def call(name,body,token):return api('/functions/v1/'+name,'POST',body,token)
def persist(): (folder/'fixtures.json').write_text(json.dumps(state,indent=2))
if mode=='cleanup':
 state=json.loads((folder/'fixtures.json').read_text());marker=state['marker'];profiles=[x['profile_id'] for x in state['users'] if 'profile_id' in x]
 for tid in state['teams']:
  found=rows('teams','select=id,name&id=eq.'+tid)
  if not found:continue
  check(found[0]['name'].startswith(marker),'Cleanup team marker')
  members=rows('team_members','select=profile_id&team_id=eq.'+tid)
  check(all(x['profile_id'] in profiles for x in members),'Cleanup only fixture members')
  check(api('/rest/v1/teams?id=eq.'+tid,'DELETE')[0]==204,'Cleanup team')
 for u in state['users']:
  status,data=api('/auth/v1/admin/users/'+u['id'])
  if status==404:continue
  check(status==200 and data['email']==u['email'] and data['email'].startswith(marker),'Cleanup account marker')
  check(api('/auth/v1/admin/users/'+u['id'],'DELETE')[0]==200,'Cleanup account')
 for u in state['users']: api('/rest/v1/edge_rate_limits?rate_key=like.*'+u['id']+'*','DELETE')
 (folder/'browser.json').unlink(missing_ok=True)
 (folder/'cleanup.json').write_text(json.dumps({'cleaned':True,'checks':len(checks)}));print(json.dumps({'cleaned':True,'checks':len(checks)}));sys.exit(0)
assert not folder.exists(),'Fixture exists; inspect or clean it first'
folder.mkdir(mode=0o700);marker='billing-qa-'+uuid.uuid4().hex
state={'marker':marker,'users':[],'teams':[]};persist();sessions=[]
try:
 for i in range(7):
  email=marker+'-'+str(i)+'@example.invalid';password=secrets.token_urlsafe(24)
  status,user=api('/auth/v1/admin/users','POST',{'email':email,'password':password,'email_confirm':True,'user_metadata':{'full_name':'QA Assinatura '+str(i),'billing_qa':marker}})
  check(status==200 and user.get('id'),'Create confirmed QA user')
  state['users'].append({'id':user['id'],'email':email});persist()
  profile=rows('profiles','select=id&user_id=eq.'+user['id'])[0]['id'];state['users'][-1]['profile_id']=profile;persist()
  status,session=api('/auth/v1/token?grant_type=password','POST',{'email':email,'password':password},anon)
  check(status==200 and session.get('access_token'),'Real QA login');sessions.append(session)
 owner=state['users'][0]; token=sessions[0]['access_token']; outsider=sessions[6]['access_token']
 tid=str(uuid.uuid4());state['teams'].append(tid);persist()
 insert('teams',{'id':tid,'name':marker,'owner_id':owner['profile_id']})
 status,cap=rpc('get_team_member_capacity',{'p_team_id':tid},token)
 check(status==200 and cap['member_count']==1 and cap['member_limit']==5 and not cap['is_unlimited'],'New team free with owner counted')
 body={'team_ids':[tid],'full_name':'QA Assinatura 1','email':state['users'][1]['email'],'password':'unused-existing','role':'viewer'}
 status,data=call('create-invite',body,token)
 check(status==200 and data['teams_added']==1,'Installed app direct-add contract preserved')
 # Issue one invitation before filling the remaining seats.
 status,invite=call('create-invite',{'team_id':tid,'email':state['users'][5]['email'],'role':'viewer'},token)
 check(status==200 and invite.get('token'),'Create link invitation')
 for u in state['users'][2:5]: insert('team_members',{'team_id':tid,'profile_id':u['profile_id'],'role':'viewer'})
 status,cap=rpc('get_team_member_capacity',{'p_team_id':tid},token)
 check(status==200 and cap['member_count']==5 and not cap['can_add_member'],'Five seats exhausted')
 status,data=call('create-invite',body,token)
 check(status==200 and data.get('already_member'),'Existing member idempotent at capacity')
 status,data=call('create-invite',{**body,'email':marker+'-blocked@example.invalid'},token)
 check(status==409 and data.get('code')=='TEAM_MEMBER_LIMIT_REACHED','Sixth new member blocked before account creation')
 status,data=call('create-invite',{'team_id':tid,'email':state['users'][6]['email'],'role':'viewer'},token)
 check(status==409 and data.get('code')=='TEAM_MEMBER_LIMIT_REACHED','Full team cannot issue invitation')
 status,data=call('accept-invite',{'token':invite['token']},sessions[5]['access_token'])
 check(status==409 and data.get('code')=='TEAM_MEMBER_LIMIT_REACHED','Full team cannot accept invitation')
 check(rows('team_invites','select=accepted&token=eq.'+invite['token'])[0]['accepted'] is False,'Failed invitation remains usable')
 status,data=call('create-invite',body,outsider);check(status==403,'Outsider cannot add members')
 status,data=rpc('get_team_billing_context',{'p_team_id':tid},outsider);check(status==403,'Billing context private')
 status,data=rpc('get_team_billing_context',{'p_team_id':tid},token)
 check(status==200 and data.get('app_user_id') and len([p for p in data['products'] if p['product_id'].startswith('price_')])==70,'Owner sees real 70-product catalogue')
 status,data=rpc('get_team_billing_context',{'p_team_id':tid},sessions[1]['access_token'])
 check(status==200 and data['app_user_id'] is None and not data['can_manage'],'Member cannot retrieve payment identity')
 status,data=call('revenuecat-sync',{'team_id':tid,'is_active':True,'entitlement_ids':['completo']},token)
 check(status==200 and data.get('is_active') is False,'Real RevenueCat sync ignores forged paid payload')
 check(call('revenuecat-sync',{'team_id':tid},outsider)[0]==403,'Only owner can synchronize billing')
 check(call('revenuecat-web-portal',{'team_id':tid},outsider)[0]==403,'Only owner can open billing portal')
 # Two real simultaneous database requests compete for the last seat.
 removed=state['users'][4]['profile_id']
 check(api('/rest/v1/team_members?team_id=eq.'+tid+'&profile_id=eq.'+removed,'DELETE')[0]==204,'Prepare one empty QA seat')
 def add(u):return api('/rest/v1/team_members','POST',{'team_id':tid,'profile_id':u['profile_id'],'role':'viewer'})
 with concurrent.futures.ThreadPoolExecutor(2) as pool: results=list(pool.map(add,state['users'][4:6]))
 check(sorted(s for s,d in results)==[201,400],'Concurrent sixth member rejected')
 check(sum(d.get('hint')=='TEAM_MEMBER_LIMIT_REACHED' for s,d in results if isinstance(d,dict))==1,'Concurrent failure returns capacity hint')
 status,cap=rpc('get_team_member_capacity',{'p_team_id':tid},token);check(cap['member_count']==5,'Concurrent capacity stays exactly five')
 legacy=rows('account_subscriptions','select=team_id&unlimited_reason=eq.legacy&is_unlimited=eq.true')
 check(len(legacy)==6,'All original teams remain unlimited')
 (folder/'browser.json').write_text(json.dumps({'session':sessions[0],'member_session':sessions[1],'team_id':tid,'marker':marker}))
 (folder/'result.json').write_text(json.dumps({'checks':checks,'passed':True},indent=2))
 print(json.dumps({'passed':True,'checks':len(checks),'fixture_for_browser':True,'real_charge':False}))
except Exception as error:
 print('QA failed: '+str(error));print('Use cleanup; journaled synthetic accounts remain private.');sys.exit(1)
'''

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('mode',choices=['setup','cleanup'])
args=parser.parse_args()
result=subprocess.run(['ssh','-o','BatchMode=yes','louvor-vps','python3 -c '+shlex.quote(REMOTE)+' '+args.mode])
raise SystemExit(result.returncode)
