#!/usr/bin/env python3
"""Publish the account-deletion backend only. Default: read-only preflight.

Run preflight-remote.py --scope account-deletion first. --apply backs up the
database on the VPS and applies exactly two migrations, then adds a new function.
It does not publish legal documents, change SMTP/AI or restart existing services.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
REMOTE = r'''
import fcntl,hashlib,json,os,pathlib,subprocess,sys,urllib.request,urllib.error
os.umask(0o077)
p=json.load(sys.stdin)
root=pathlib.Path('/opt/supabase')
release=pathlib.Path('/var/lib/maislouvor-deploy/20261007-account-deletion')
target=root/'volumes/functions/delete-account'
lock=open('/var/lock/maislouvor-deploy.lock','a')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
def run(args,input=None):
 r=subprocess.run(args,input=input,text=True,capture_output=True,timeout=60)
 if r.returncode: raise RuntimeError('Command failed: '+args[0]+'; output withheld')
 return r.stdout
def sql(query): return run(['docker','exec','-i','supabase-db','psql','-X','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],query)
def runtime(): return json.loads(run(['docker','inspect','supabase-edge-functions']))[0]
before=runtime()
env=dict(x.split('=',1) for x in before['Config']['Env'] if '=' in x)
assert all(env.get(k) for k in ['APPLE_CLIENT_ID','APPLE_TEAM_ID','APPLE_KEY_ID','APPLE_PRIVATE_KEY','APPLE_TOKEN_ENCRYPTION_KEY']), 'Apple setup missing'
assert not release.exists() and not target.exists(), 'Existing release or function; inspect before updating'
assert hashlib.sha256((root/'volumes/functions/_shared/appleTokens.ts').read_bytes()).hexdigest()==p['apple_sha256'], 'Apple module differs'
assert sql("SELECT to_regclass('public.apple_auth_tokens') IS NOT NULL;").strip()=='t', 'Apple table missing'
assert sql("SELECT to_regprocedure('public.delete_account_data(uuid)') IS NULL;").strip()=='t', 'Deletion already installed'
guard=sql("SELECT md5(pg_get_functiondef('public.transfer_team_ownership(uuid,uuid)'::regprocedure));").strip()
assert sql("SELECT pg_get_functiondef('public.transfer_team_ownership(uuid,uuid)'::regprocedure) LIKE '%app.transfer_team_ownership%';").strip()=='t', 'Production guard missing'
manifest={'migrations':{n:hashlib.sha256(v.encode()).hexdigest() for n,v in p['migrations'].items()},
          'files':{n:hashlib.sha256(v.encode()).hexdigest() for n,v in p['files'].items()}}
print(json.dumps({'preflight':True,'apply':p['apply'],**manifest}),flush=True)
if not p['apply']: sys.exit(0)
release.mkdir(mode=0o700,parents=True)
(release/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
with open(release/'database.before.dump','xb') as backup:
 result=subprocess.run(['docker','exec','supabase-db','pg_dump','-U','postgres','-d','postgres','-Fc'],stdout=backup,stderr=subprocess.PIPE,timeout=60)
 assert result.returncode==0, 'Database backup failed'
assert (release/'database.before.dump').stat().st_size>1000, 'Backup is unexpectedly small'
stage=release/'function'
stage.mkdir()
for name,source in p['files'].items():
 assert name in ['index.ts','flow.ts']
 (stage/name).write_text(source); os.chmod(stage/name,0o644)
os.chmod(stage,0o755)
query="BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s';\n"+'\n'.join(p['migrations'].values())
query+="""
DO $check$ BEGIN
 IF EXISTS (SELECT FROM public.account_deletion_blocking_references()) THEN RAISE EXCEPTION 'Unhandled account reference'; END IF;
 IF has_function_privilege('authenticated','public.delete_account_data(uuid)','EXECUTE')
   OR has_function_privilege('anon','public.delete_account_data(uuid)','EXECUTE')
   OR has_function_privilege('authenticated','public.account_deletion_recover_team(uuid,uuid,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'Private RPC exposed';
 END IF;
END $check$;
"""
query+="DO $check$ BEGIN IF md5(pg_get_functiondef('public.transfer_team_ownership(uuid,uuid)'::regprocedure))<>'"+guard+"' THEN RAISE EXCEPTION 'Owner guard changed'; END IF; END $check$;\nCOMMIT;"
sql(query)
(release/'database-applied.json').write_text(json.dumps(manifest['migrations'],indent=2)+'\n')
os.replace(stage,target)
try:
 req=urllib.request.Request('https://api.maislouvor.com/functions/v1/delete-account',data=b'{}',
  headers={'Authorization':'Bearer '+env['SUPABASE_ANON_KEY'],'apikey':env['SUPABASE_ANON_KEY'],'Content-Type':'application/json'})
 try:
  urllib.request.urlopen(req,timeout=30)
  raise RuntimeError('Anonymous caller accepted')
 except urllib.error.HTTPError as e:
  assert e.code==401 and json.loads(e.read()).get('error')=='unauthorized', 'Function health check failed'
 after=runtime()
 assert after['State']['StartedAt']==before['State']['StartedAt'], 'Functions service restarted concurrently'
 assert after['State']['Health']['Status']=='healthy', 'Functions service unhealthy'
 report={'deployed':True,'anonymous_status':401,'private_rpc_permissions':True,'owner_guard_preserved':True,
  'services_restarted':False,'smtp_changed':False,'real_user_data_deleted':False}
 (release/'result.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps(report,indent=2))
except Exception:
 # Only our newly created endpoint moves out; committed additive SQL is retained.
 os.replace(target,release/'function-failed')
 print('Endpoint withdrawn; additive database changes retained. Inspect the private release.',file=sys.stderr)
 raise SystemExit(1)
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    names = ["20261003130000_account_deletion.sql", "20261007122000_account_deletion_recovery.sql"]
    payload = {"apply": args.apply, "migrations": {n: (ROOT / "supabase/migrations" / n).read_text() for n in names},
               "files": {n: (ROOT / "supabase/functions/delete-account" / n).read_text() for n in ["index.ts", "flow.ts"]},
               "apple_sha256": hashlib.sha256((ROOT / "supabase/functions/_shared/appleTokens.ts").read_bytes()).hexdigest()}
    return subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "louvor-vps",
                           "python3 -c " + shlex.quote(REMOTE)], input=json.dumps(payload), text=True, timeout=180).returncode


if __name__ == "__main__":
    sys.exit(main())
