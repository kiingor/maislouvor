#!/usr/bin/env python3
"""Prepare/apply/revoke one private Apple sandbox authorization; never switch global billing."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
HELPERS = Path(__file__).with_name('publish-consent-backend.py')
MIGRATION = '20261009010000_revenuecat_apple_test_policy.sql'
FILES = ['_shared/revenuecat-model.ts', '_shared/revenuecat.ts', 'revenuecat-webhook/handler.ts']
PRESERVED = ['_shared/security.ts', 'revenuecat-webhook/index.ts', 'revenuecat-sync/index.ts',
             'revenuecat-sync/handler.ts', 'revenuecat-web-portal/index.ts', 'revenuecat-web-portal/handler.ts']
REMOTE = r'''
import fcntl
os.umask(0o077)
p=json.load(sys.stdin); action=p.pop('action')
CHANGED=tuple(p['files']); PRESERVED=tuple(p['preserved'])
assert set(CHANGED)=={'_shared/revenuecat-model.ts','_shared/revenuecat.ts','revenuecat-webhook/handler.ts'}
assert set(PRESERVED)=={'_shared/security.ts','revenuecat-webhook/index.ts','revenuecat-sync/index.ts','revenuecat-sync/handler.ts','revenuecat-web-portal/index.ts','revenuecat-web-portal/handler.ts'}
assert re.fullmatch(r'20\d{6}-apple-sandbox(?:-[a-z0-9-]+)?',p['release_id'])
for value in p['selection'].values(): assert re.fullmatch(r'[0-9a-f-]{36}',value) and str(__import__('uuid').UUID(value))==value
assert set(p['selection'])=={'team_id','owner_profile_id','app_user_id'}
for content in [p['migration'],*p['files'].values()]: assert sha(content['source'].encode())==content['sha256']
team,owner,customer=(p['selection'][key] for key in ['team_id','owner_profile_id','app_user_id'])
release=RELEASES/p['release_id']
def enrollment_ok():
  return command(PSQL,source=f"""SELECT EXISTS(SELECT 1 FROM public.revenuecat_customers c
    JOIN public.teams t ON t.id=c.team_id JOIN public.account_subscriptions s ON s.team_id=t.id
    WHERE c.app_user_id='{customer}' AND c.team_id='{team}' AND t.owner_id='{owner}'
    AND s.provider='manual' AND s.plan='free' AND NOT s.is_unlimited AND s.product_id IS NULL
    AND s.revenuecat_environment IS NULL AND cardinality(s.entitlement_ids)=0 AND s.access_expires_at IS NULL);""").strip()=='t'
def provider_check():
  env=dict(item.split('=',1) for item in runtime()['Config']['Env'] if '=' in item)
  assert env.get('REVENUECAT_ENVIRONMENT')=='PRODUCTION','Global production configuration changed'
  request=urllib.request.Request('https://api.revenuecat.com/v1/subscribers/'+customer,
    headers={'Authorization':'Bearer '+env['REVENUECAT_SECRET_API_KEY'],'Accept':'application/json'})
  with urllib.request.urlopen(request,timeout=30) as response: data=json.load(response)
  subscriptions=data.get('subscriber',{}).get('subscriptions')
  assert isinstance(subscriptions,dict),'Invalid provider subscriber response'
  now=dt.datetime.now(dt.timezone.utc)
  for value in subscriptions.values():
    assert isinstance(value.get('is_sandbox'),bool),'Unknown provider environment'
    times=[dt.datetime.fromisoformat(value[key].replace('Z','+00:00')) for key in ['expires_date','grace_period_expires_date'] if value.get(key)]
    if not value['is_sandbox'] and not value.get('refunded_at') and (not times or max(times)>now):
      raise RuntimeError('Active production purchase prevents sandbox enrollment')
  return {'provider_checked':True,'active_production_purchase':False}
def sql_transaction(commit):
  source="BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'; SET LOCAL standard_conforming_strings=on;\n"+p['migration']['source']+'\n'
  # Lock order matches apply_revenuecat_snapshot: subscription first, then ownership.
  source+=f"SELECT pg_advisory_xact_lock(hashtextextended('subscription:' || '{team}',0));\n"
  source+=f"SELECT 1 FROM public.teams WHERE id='{team}' AND owner_id='{owner}' FOR UPDATE;\n"
  source+=f"INSERT INTO public.revenuecat_test_customers(app_user_id,owner_profile_id,expires_at) VALUES('{customer}','{owner}',now()+interval '14 days');\n"
  source+="DO $$ BEGIN IF EXISTS(SELECT FROM public.account_deletion_blocking_references()) THEN RAISE EXCEPTION 'Unhandled deletion reference'; END IF; END $$;\n"
  # Authorization must not mutate the existing free subscription.
  source+=f"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.account_subscriptions WHERE team_id='{team}' AND provider='manual' AND plan='free' AND product_id IS NULL AND revenuecat_environment IS NULL AND cardinality(entitlement_ids)=0) THEN RAISE EXCEPTION 'Contract changed before enrollment'; END IF; END $$;\n"
  escaped=p['migration']['source'].replace("'","''")
  source+="INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261009010000','revenuecat_apple_test_policy',ARRAY['"+escaped+"']);\n"
  source+=f"SELECT public.revenuecat_customer_policy('{customer}');\n"
  return source+('COMMIT;\n' if commit else 'ROLLBACK;\n')
def health():
  statuses={}
  for endpoint in ['revenuecat-webhook','revenuecat-sync']:
    request=urllib.request.Request('https://api.maislouvor.com/functions/v1/'+endpoint,data=b'{}',headers={'Content-Type':'application/json'})
    try:
      with urllib.request.urlopen(request,timeout=30) as response: status=response.status
    except urllib.error.HTTPError as error: status=error.code; error.close()
    assert status==401,'Unauthenticated billing endpoint did not reject request'
    statuses[endpoint]=status
  return statuses
lock=open(LOCK,'a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
if action=='revoke':
  assert (release/'result.json').exists(),'Release was not applied'
  command(PSQL,source=f"BEGIN; UPDATE public.revenuecat_test_customers SET revoked_at=now() WHERE app_user_id='{customer}' AND owner_profile_id='{owner}'; COMMIT;")
  result={'revoked':True,'production_environment_unchanged':True,'subscriptions_untouched':True}
  (release/'revoked.json').write_text(json.dumps(result)); print(json.dumps(result)); sys.exit(0)
before=snapshot()
assert enrollment_ok(),'Target no longer matches the authorized free owner/team/customer'
provider=provider_check()
assert command(PSQL,source="SELECT to_regclass('public.revenuecat_test_customers') IS NULL;").strip()=='t','Policy already installed; inspect instead of replaying'
if action=='prepare':
  started=time.monotonic();command(PSQL,source=sql_transaction(False),timeout=300)
  assert snapshot()==before,'Baseline changed during prepare'
  print(json.dumps({'baseline':before,'preflight':{'transaction':'ROLLBACK','seconds':round(time.monotonic()-started,3),
    'selection_matches':True,'free_without_purchase':True,'authorized_customers':1,'authorization_days':14,**provider,'health':health()}}));sys.exit(0)
assert action=='apply' and before==p['baseline'],'Baseline changed; re-prepare'
release.mkdir(mode=0o700);(release/'payload.json').write_text(json.dumps(p,indent=2))
save_state(release,'backup-started',database_committed=False)
with (release/'database.before.dump').open('xb') as output:
  backup=subprocess.run(['docker','exec','supabase-db','pg_dump','-U','postgres','-d','postgres','-Fc'],stdout=output,stderr=subprocess.PIPE,timeout=300)
assert backup.returncode==0 and (release/'database.before.dump').stat().st_size>1024,'Backup failed'
with (release/'database.before.dump').open('rb') as source:
  checked=subprocess.run(['docker','exec','-i','supabase-db','pg_restore','--list'],stdin=source,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=120)
assert checked.returncode==0,'Backup index invalid'
for name in CHANGED:
  target=release/'functions-before'/name;target.parent.mkdir(parents=True,mode=0o700,exist_ok=True);shutil.copyfile(FUNCTIONS/name,target)
assert snapshot()==before and enrollment_ok(),'Production changed during backup'
provider_check()
save_state(release,'database-apply-started',database_committed='unknown-until-confirmed')
command(PSQL,source=sql_transaction(True),timeout=300,log=release/'database-apply.log')
save_state(release,'database-committed',database_committed=True)
try:
  for name,content in p['files'].items(): atomic_source(FUNCTIONS/name,content['source'])
  command(['docker','restart',EDGE]);after=wait_ready()
  assert runtime_identity(after)==before['runtime'],'Runtime configuration changed'
  assert file_hash(FUNCTIONS/'main/index.ts')==before['loader_sha256'],'Loader changed'
  for name in CHANGED+PRESERVED:
    assert file_hash(FUNCTIONS/name)==(p['files'][name]['sha256'] if name in CHANGED else before['files'][name]),'Source mismatch'
  policy=json.loads(command(PSQL,source=f"SELECT public.revenuecat_customer_policy('{customer}');").strip())
  assert policy['environment']=='SANDBOX' and policy['store']=='app_store' and policy['may_sync'],'Policy validation failed'
  timing=json.loads(command(PSQL,source=f"SELECT json_build_object('created_at',created_at,'expires_at',expires_at) FROM public.revenuecat_test_customers WHERE app_user_id='{customer}';").strip())
  result={'deployed':True,'authorized_customers':1,'store':'app_store','normal_environment':'PRODUCTION',
    'owner_binding':True,'grants_from_allowlist':0,'authorization':timing,'health':health(),'runtime_preserved':True}
  (release/'result.json').write_text(json.dumps(result,indent=2));save_state(release,'completed',database_committed=True)
  print(json.dumps(result))
except BaseException:
  save_state(release,'needs-forward-repair',database_committed=True,automatic_database_restore=False)
  raise
'''


def digest(content): return hashlib.sha256(content).hexdigest()


def invoke(action, payload):
    helpers = HELPERS.read_text().split("\nif __name__ == '__main__':")[0]
    wrapper = "\ntry:\n" + '\n'.join('  ' + line for line in REMOTE.splitlines()) + "\nexcept BaseException as error:\n  if isinstance(error,SystemExit): raise\n  print('RevenueCat test deployment failed: '+type(error).__name__+'; inspect private release evidence',file=sys.stderr)\n  sys.exit(1)\n"
    result = subprocess.run(['ssh', '-o', 'BatchMode=yes', 'louvor-vps', 'python3 -c ' + shlex.quote(helpers + wrapper)],
                            input=json.dumps({**payload, 'action': action}), text=True, capture_output=True, timeout=900)
    if result.returncode: raise RuntimeError(result.stderr.strip())
    return json.loads(result.stdout)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'apply', 'revoke'])
    parser.add_argument('--selection', type=Path)
    parser.add_argument('--release-id', default='20261009-apple-sandbox')
    parser.add_argument('--artifact', type=Path, required=True)
    parser.add_argument('--sha256')
    args = parser.parse_args(); artifact = args.artifact.parent.resolve() / args.artifact.name
    if args.action == 'prepare':
        if artifact.exists() or not args.selection: raise ValueError('Fresh artifact and private selection required')
        payload = {'release_id': args.release_id, 'selection': json.loads(args.selection.read_text()), 'preserved': PRESERVED,
                   'source_commit': subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()}
        def entry(path):
            content = path.read_text(); return {'source': content, 'sha256': digest(content.encode())}
        payload['files'] = {name: entry(ROOT / 'supabase/functions' / name) for name in FILES}
        payload['migration'] = entry(ROOT / 'supabase/migrations' / MIGRATION)
        payload.update(invoke('prepare', payload))
        with artifact.open('x') as output: json.dump(payload, output, indent=2)
        artifact.chmod(0o600)
        print(json.dumps({'artifact': str(artifact), 'sha256': digest(artifact.read_bytes()), **payload['preflight']}, indent=2))
    else:
        if digest(artifact.read_bytes()) != args.sha256: raise ValueError('Artifact hash mismatch')
        payload = json.loads(artifact.read_text())
        if payload.get('preflight', {}).get('transaction') != 'ROLLBACK': raise ValueError('No successful preflight')
        print(json.dumps(invoke(args.action, payload), indent=2))


if __name__ == '__main__':
    try: main()
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError):
        print('Operation stopped; no secret/identity values printed. Inspect private deployment evidence.', file=sys.stderr)
        sys.exit(1)
