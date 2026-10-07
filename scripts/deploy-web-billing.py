#!/usr/bin/env python3
"""Narrow billing backend deployment. Default rehearses SQL with ROLLBACK.

--apply uses private local credentials, backs up PostgreSQL and changed sources,
preserves all existing runtime variables/functions, and restarts only functions.
No web files, marketing, SMTP or native builds are changed by this script.
"""
import argparse
import json
from pathlib import Path
import re
import shlex
import subprocess

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = [
    '20261006210000_billing_runtime_prerequisites.sql',
    '20261006220000_revenuecat_billing.sql',
    '20261007090000_team_member_limits.sql',
    '20261007130000_stripe_billing_catalog.sql',
]
QA = r'''
DO $$
DECLARE u uuid; p uuid; t uuid; pids uuid[] := '{}'; inv uuid; cap jsonb; hint text;
BEGIN
  ASSERT (SELECT count(*) FROM public.teams) = (SELECT count(*) FROM public.account_subscriptions WHERE is_unlimited AND unlimited_reason='legacy'), 'Legacy teams not preserved';
  ASSERT NOT has_table_privilege('authenticated','public.stripe_billing_products','SELECT'), 'Stripe map exposed';
  ASSERT NOT has_table_privilege('anon','public.revenuecat_customers','SELECT'), 'Customer identity exposed';
  ASSERT NOT has_function_privilege('authenticated','public.apply_revenuecat_snapshot(uuid,jsonb)','EXECUTE'), 'Client can grant access';
  ASSERT (SELECT count(*) FROM public.stripe_billing_products WHERE environment='PRODUCTION')=70, 'Catalogue incomplete';
  FOR i IN 1..6 LOOP
    u := gen_random_uuid();
    INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(u,'billing-rollback-'||u||'@example.invalid','{"full_name":"Billing rollback QA"}');
    SELECT id INTO p FROM public.profiles WHERE user_id=u;
    pids := array_append(pids,p);
  END LOOP;
  INSERT INTO public.teams(name,owner_id) VALUES('Billing rollback QA',pids[1]) RETURNING id INTO t;
  cap := public.team_member_capacity(t);
  ASSERT cap->>'member_count'='1' AND cap->>'member_limit'='5' AND cap->>'is_unlimited'='false', 'New team policy';
  INSERT INTO public.team_invites(team_id,email) VALUES(t,'rollback@example.invalid') RETURNING id INTO inv;
  FOR i IN 2..5 LOOP INSERT INTO public.team_members(team_id,profile_id) VALUES(t,pids[i]); END LOOP;
  BEGIN
    INSERT INTO public.team_members(team_id,profile_id) VALUES(t,pids[6]);
    RAISE EXCEPTION 'Sixth member unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS hint=PG_EXCEPTION_HINT;
    ASSERT hint='TEAM_MEMBER_LIMIT_REACHED', 'Unexpected sixth-member error';
  END;
  BEGIN
    PERFORM public.accept_team_invite(inv,pids[6],'rollback@example.invalid');
    RAISE EXCEPTION 'Full invitation unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS hint=PG_EXCEPTION_HINT;
    ASSERT hint='TEAM_MEMBER_LIMIT_REACHED', 'Unexpected invitation error';
  END;
  ASSERT (SELECT NOT accepted FROM public.team_invites WHERE id=inv), 'Failed invitation consumed';
  UPDATE public.account_subscriptions SET plan='essencial',status='active',member_limit=10 WHERE team_id=t;
  PERFORM public.accept_team_invite(inv,pids[6],'rollback@example.invalid');
  ASSERT (SELECT count(*) FROM public.team_members WHERE team_id=t)=6, 'Paid capacity not available';
  ASSERT (SELECT accepted FROM public.team_invites WHERE id=inv), 'Legacy invitation not accepted';
END $$;
'''

REMOTE = r'''
import copy,fcntl,hashlib,json,os,pathlib,subprocess,sys,time,urllib.request,urllib.error
os.umask(0o077)
p=json.load(sys.stdin); root=pathlib.Path('/opt/supabase'); functions=root/'volumes/functions'
release=pathlib.Path('/var/lib/maislouvor-deploy/20261007-web-billing')
compose=root/'docker-compose.yml'; envfile=root/'.env.billing'
lock=open('/var/lock/maislouvor-deploy.lock','a'); fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
def run(args,data=None,private=True):
 r=subprocess.run(args,input=data,text=True,capture_output=True,cwd=root,timeout=120)
 if r.returncode: raise RuntimeError(args[0]+' failed: '+('output withheld' if private else r.stderr[-3000:]))
 return r.stdout
def sql(source): return run(['docker','exec','-i','supabase-db','psql','-X','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],source,False)
def config(): return json.loads(run(['docker','compose','config','--format','json']))
def runtime(): return json.loads(run(['docker','inspect','supabase-edge-functions']))[0]
def env_of(obj): return dict(x.split('=',1) for x in obj['Config']['Env'] if '=' in x)
def hashes(): return {str(f.relative_to(functions)):hashlib.sha256(f.read_bytes()).hexdigest() for f in functions.rglob('*') if f.is_file()}
def atomic(path,data,mode=0o600):
 path.parent.mkdir(parents=True,exist_ok=True)
 temp=path.with_name(path.name+'.billing-tmp'); temp.write_text(data); temp.chmod(mode); os.replace(temp,path)
assert not envfile.exists() and not release.exists(), 'Billing already installed; inspect prior deployment'
before=config(); running=runtime(); actual=env_of(running); old_hashes=hashes()
assert all(str(v)==actual.get(k) for k,v in before['services']['functions']['environment'].items()), 'Runtime differs from Compose'
assert actual.get('VERIFY_JWT')=='false', 'External webhook requires narrowly scoped routing review'
for name,expected in p['baseline_functions'].items(): assert old_hashes.get(name)==expected, 'Changed function baseline: '+name
for name in p['files']:
 if name not in p['baseline_functions']: assert name not in old_hashes, 'Unexpected existing source: '+name
assert sql("SELECT to_regclass('public.revenuecat_products') IS NULL;").strip()=='t', 'Billing database already exists'
before_counts=sql("SELECT jsonb_build_object('teams',(SELECT count(*) FROM public.teams),'members',(SELECT count(*) FROM public.team_members));").strip()
transaction="BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';\n"+p['sql']
sql(transaction+'\n'+p['qa']+'\nROLLBACK;')
assert sql("SELECT to_regclass('public.revenuecat_products') IS NULL;").strip()=='t', 'Rehearsal was not rolled back'
assert before_counts==sql("SELECT jsonb_build_object('teams',(SELECT count(*) FROM public.teams),'members',(SELECT count(*) FROM public.team_members));").strip(), 'Rehearsal altered team counts'
print(json.dumps({'preflight':True,'rehearsal_rolled_back':True,'counts':json.loads(before_counts),'production_products':70,'apply':p['apply']}),flush=True)
if not p['apply']: sys.exit(0)
release.mkdir(parents=True,mode=0o700)
original=compose.read_text(); original_sources={k:(functions/k).read_text() if (functions/k).exists() else None for k in p['files']}
(release/'docker-compose.before.yml').write_text(original)
(release/'functions.before.json').write_text(json.dumps(original_sources))
(release/'functions.hashes.before.json').write_text(json.dumps(old_hashes))
(release/'database.before.sql').write_text(run(['docker','exec','supabase-db','pg_dump','-U','postgres','-d','postgres']))
(release/'migration.sql').write_text(p['sql'])
assert original.count('      - ./.env.apple-signin\n')==1, 'Unexpected environment configuration'
patched=original.replace('      - ./.env.apple-signin\n','      - ./.env.apple-signin\n      - ./.env.billing\n',1)
values=p['env']; assert all("'" not in v and '\n' not in v for v in values.values())
db_applied=False
try:
 atomic(envfile,''.join(k+"='"+v+"'\n" for k,v in values.items()))
 atomic(compose,patched)
 expected=copy.deepcopy(before); expected['services']['functions']['environment'].update(values)
 assert config()==expected, 'Unrelated Compose change'
 for name,source in p['files'].items(): atomic(functions/name,source,0o644)
 # Migrations capture all teams existing at this cutover as permanent legacy.
 sql(transaction+"\nNOTIFY pgrst, 'reload schema';\nCOMMIT;"); db_applied=True
 (release/'database-applied.json').write_text(json.dumps({'migrations':p['migrations'],'sql_sha256':hashlib.sha256(p['sql'].encode()).hexdigest()}))
 run(['docker','compose','up','-d','--no-deps','functions'])
 for i in range(30):
  if runtime()['State'].get('Health',{}).get('Status')=='healthy': break
  time.sleep(1)
 else: raise RuntimeError('Functions unhealthy')
 current=env_of(runtime())
 assert all(current.get(k)==v for k,v in {**actual,**values}.items()), 'Runtime variables changed'
 assert runtime()['Image']==running['Image'], 'Runtime image changed'
 after_hashes=hashes()
 assert all(after_hashes.get(k)==v for k,v in old_hashes.items() if k not in p['files']), 'Unrelated function changed'
 for name,source in p['files'].items(): assert after_hashes[name]==hashlib.sha256(source.encode()).hexdigest()
 def request(endpoint,headers,body):
  req=urllib.request.Request('https://api.maislouvor.com/functions/v1/'+endpoint,data=json.dumps(body).encode(),headers={'Content-Type':'application/json',**headers})
  try:
   with urllib.request.urlopen(req,timeout=40) as r: return r.status,json.loads(r.read())
  except urllib.error.HTTPError as e: return e.code,json.loads(e.read())
 for endpoint in ['revenuecat-sync','revenuecat-web-portal','create-invite','accept-invite']:
  status,_=request(endpoint,{},{}); assert status==401, endpoint+' unauthenticated check failed: '+str(status)
 status,result=request('revenuecat-webhook',{'Authorization':values['REVENUECAT_WEBHOOK_AUTHORIZATION']},{'event':{'id':'billing-deploy-test','type':'TEST'}})
 assert status==200 and result.get('test'), 'Webhook transport failed'
 assert request('revenuecat-webhook',{}, {'event':{'id':'billing-deploy-test','type':'TEST'}})[0]==401, 'Webhook authorization missing'
 report={'deployed':True,'database':True,'webhook_transport':True,'unauthenticated_requests_rejected':True,'old_runtime_preserved':True,'other_functions_preserved':True,
   'counts_at_preflight':json.loads(before_counts),'files':{k:after_hashes[k] for k in p['files']},'frontend_published':False}
 (release/'result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
except Exception as e:
 atomic(compose,original)
 for name,source in original_sources.items():
  if source is None: (functions/name).unlink(missing_ok=True)
  else: atomic(functions/name,source,0o644)
 run(['docker','compose','up','-d','--no-deps','functions'])
 (release/'failed.txt').write_text(str(e))
 print('Backend failed; old runtime/source restored. Database additive migration retained: '+str(db_applied)+'. '+str(e),file=sys.stderr)
 sys.exit(1)
'''

def without_transaction(source):
    return re.sub(r'^(?:BEGIN|COMMIT);\s*$', '', source, flags=re.M)

def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--apply', action='store_true')
    args.add_argument('--catalog', type=Path, required=True)
    args.add_argument('--env', type=Path, required=True)
    options = args.parse_args()
    assert not options.env.stat().st_mode & 0o077, 'Credentials must be private'
    values = {}
    for line in options.env.read_text().splitlines():
        if line and not line.startswith('#'):
            k,v=line.split('=',1); values[k]=json.loads(v) if v.startswith('"') else v
    assert values['REVENUECAT_ENVIRONMENT']=='PRODUCTION'
    sources={}
    for folder in ['revenuecat-sync','revenuecat-webhook','revenuecat-web-portal','create-invite','accept-invite']:
        for f in (ROOT/'supabase/functions'/folder).glob('*.ts'): sources[folder+'/'+f.name]=f.read_text()
    for name in ['security.ts','revenuecat.ts','revenuecat-model.ts']:
        sources['_shared/'+name]=(ROOT/'supabase/functions/_shared'/name).read_text()
    sql='\n'.join(without_transaction((ROOT/'supabase/migrations'/m).read_text()) for m in MIGRATIONS)
    sql+='\n'+without_transaction((ROOT/'supabase/setup/revenuecat_catalog.sql').read_text())
    sql+='\n'+without_transaction(options.catalog.read_text())
    payload={'apply':options.apply,'env':values,'sql':sql,'qa':QA,'files':sources,'migrations':MIGRATIONS,
        'baseline_functions':{'create-invite/index.ts':'fa7fb2e9a97d0c9f4767a0cce643c92ca22ebd2e82f9823cc5b654cd35983a55',
          'accept-invite/index.ts':'7c706fed41e25b823a0bcea20a52e8c1b9916e6cddb9d5f5f0bbfec7138acdaa'}}
    result=subprocess.run(['ssh','-o','BatchMode=yes','louvor-vps','python3 -c '+shlex.quote(REMOTE)],input=json.dumps(payload),text=True)
    raise SystemExit(result.returncode)

if __name__=='__main__': main()
