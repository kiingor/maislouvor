#!/usr/bin/env python3
"""Install only the additive Apple token backend on the existing self-hosted stack.

Default is a read-only preflight. --apply adds a private table, two source files,
five server variables and recreates only the functions service. Existing services,
functions and GoTrue settings must remain identical. Secrets travel over SSH stdin.
"""
import argparse
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
REMOTE = r'''
import base64, copy, fcntl, hashlib, json, os, pathlib, secrets, subprocess, sys, time, urllib.request, urllib.error
os.umask(0o077)
p=json.load(sys.stdin)
root=pathlib.Path('/opt/supabase')
release=pathlib.Path('/var/lib/maislouvor-deploy/20261007-apple-signin')
compose=root/'docker-compose.yml'
envfile=root/'.env.apple-signin'
lock=open('/var/lock/maislouvor-deploy.lock','a')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
def run(args, input=None):
 r=subprocess.run(args,input=input,text=True,capture_output=True,cwd=root,timeout=60)
 if r.returncode: raise RuntimeError('Command failed: '+args[0]+' (output withheld to protect secrets)')
 return r.stdout
def config(): return json.loads(run(['docker','compose','config','--format','json']))
def runtime(): return json.loads(run(['docker','inspect','supabase-edge-functions']))[0]
def env_of(obj): return dict(x.split('=',1) for x in obj['Config']['Env'] if '=' in x)
def atomic(path,data,mode=0o600):
 path.parent.mkdir(parents=True,exist_ok=True)
 temp=path.with_name(path.name+'.store-auth-tmp')
 with open(temp,'x') as f: f.write(data)
 os.chmod(temp,mode); os.replace(temp,path)
before=config(); running=runtime(); actual=env_of(running)
assert all(str(v)==actual.get(k) for k,v in before['services']['functions']['environment'].items()), 'Running service differs from Compose'
assert running['Config']['Labels']['com.docker.compose.project.config_files']==str(compose), 'Unexpected Compose sources'
assert not envfile.exists(), 'Apple environment already exists; preserve its encryption key and inspect the prior release'
assert not release.exists(), 'Release directory already exists; inspect its state before continuing'
assert 'env_file' not in before['services']['functions'], 'Unexpected existing env_file'
for relative in p['files']:
 assert relative in ['apple-auth-token/index.ts','_shared/appleTokens.ts']
 assert not (root/'volumes/functions'/relative).exists(), 'Refusing to replace an existing function'
assert '-----BEGIN PRIVATE KEY-----' in p['private_key'] and '-----END PRIVATE KEY-----' in p['private_key']
sql_check="SELECT to_regclass('public.apple_auth_tokens') IS NULL;"
assert run(['docker','exec','supabase-db','psql','-X','-U','postgres','-d','postgres','-Atc',sql_check]).strip()=='t', 'Apple table already exists; do not replace its encryption key'
original=compose.read_text()
assert original.count('  functions:\n')==1, 'Unexpected functions block'
patched=original.replace('  functions:\n','  functions:\n    env_file:\n      - ./.env.apple-signin\n',1)
values={'APPLE_CLIENT_ID':'com.maislouvor.app','APPLE_TEAM_ID':'U9PP989T5D','APPLE_KEY_ID':p['key_id'],
 'APPLE_PRIVATE_KEY':p['private_key'].strip().replace('\n',r'\n'),
 'APPLE_TOKEN_ENCRYPTION_KEY':base64.b64encode(secrets.token_bytes(32)).decode()}
assert all("'" not in v and '\n' not in v for v in values.values())
print(json.dumps({'preflight':True,'new_table':'apple_auth_tokens','new_function':'apple-auth-token','server_variables':list(values),'apply':p['apply']}),flush=True)
if not p['apply']: sys.exit(0)
release.mkdir(mode=0o700,parents=True)
(release/'docker-compose.before.yml').write_text(original)
(release/'schema.before.sql').write_text(run(['docker','exec','supabase-db','pg_dump','-U','postgres','-d','postgres','--schema-only']))
mutated=False
try:
 atomic(envfile,''.join(k+"='"+v+"'\n" for k,v in values.items()))
 atomic(compose,patched); mutated=True
 after=config()
 expected=copy.deepcopy(before)
 expected['services']['functions']['environment'].update(values)
 assert after==expected, 'Compose changed beyond the five Apple variables'
 for relative,source in p['files'].items(): atomic(root/'volumes/functions'/relative,source,0o644)
 run(['docker','exec','-i','supabase-db','psql','-X','-U','postgres','-d','postgres','-q','-v','ON_ERROR_STOP=1'],
     "BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s';\n"+p['migration']+"\nCOMMIT;\n")
 (release/'database-applied.json').write_text(json.dumps({'migration':p['migration_name'],'sha256':hashlib.sha256(p['migration'].encode()).hexdigest()})+'\n')
 run(['docker','compose','up','-d','--no-deps','functions'])
 for i in range(20):
  obj=runtime()
  if obj['State'].get('Health',{}).get('Status')=='healthy': break
  time.sleep(1)
 else: raise RuntimeError('Functions did not become healthy')
 current=env_of(runtime())
 assert all(current.get(k)==v for k,v in values.items()), 'Apple variables differ at runtime'
 assert all(current.get(k)==v for k,v in actual.items()), 'Previous runtime variables changed'
 req=urllib.request.Request('https://api.maislouvor.com/functions/v1/apple-auth-token',data=b'{}',
     headers={'Authorization':'Bearer '+current['SUPABASE_ANON_KEY'],'apikey':current['SUPABASE_ANON_KEY'],'Content-Type':'application/json'})
 try:
  urllib.request.urlopen(req,timeout=30)
  raise RuntimeError('Unauthenticated request unexpectedly accepted')
 except urllib.error.HTTPError as e:
  assert e.code==401 and json.loads(e.read()).get('error')=='unauthorized', 'New function did not reject unauthenticated caller'
 acl=run(['docker','exec','supabase-db','psql','-X','-U','postgres','-d','postgres','-Atc',
  "SELECT NOT has_table_privilege('anon','public.apple_auth_tokens','SELECT') AND NOT has_table_privilege('authenticated','public.apple_auth_tokens','SELECT') AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.apple_auth_tokens'::regclass);"]).strip()
 assert acl=='t', 'Apple token table permission check failed'
 report={'deployed':True,'table_private':True,'unauthenticated_status':401,'service_healthy':True,
  'existing_runtime_preserved':True,'files':{k:hashlib.sha256(v.encode()).hexdigest() for k,v in p['files'].items()},
  'real_apple_exchange_tested':False,'account_deletion_deployed':False}
 (release/'result.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps(report,indent=2))
except Exception as e:
 if mutated:
  atomic(compose,original)
  run(['docker','compose','up','-d','--no-deps','functions'])
 (release/'failed.txt').write_text(type(e).__name__+': '+str(e)+'\n')
 print('Deployment failed; previous Compose restored. Preserve private key files and inspect the private release. Any committed additive table is retained.',file=sys.stderr)
 raise SystemExit(1)
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--key-file", type=Path, required=True)
    parser.add_argument("--key-id", required=True)
    parser.add_argument("--host", default="louvor-vps")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Z0-9]{10}", args.key_id) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", args.host):
        parser.error("Invalid key identifier or SSH host alias")
    if args.key_file.stat().st_mode & 0o077:
        parser.error("Private key must be accessible only to its owner (0600)")
    migration = "20261007121000_apple_auth_tokens.sql"
    payload = {"apply": args.apply, "private_key": args.key_file.read_text(), "key_id": args.key_id,
               "files": {p: (ROOT / "supabase/functions" / p).read_text()
                         for p in ["apple-auth-token/index.ts", "_shared/appleTokens.ts"]},
               "migration_name": migration, "migration": (ROOT / "supabase/migrations" / migration).read_text()}
    result = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", args.host,
                             "python3 -c " + shlex.quote(REMOTE)], input=json.dumps(payload), text=True, timeout=180)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
