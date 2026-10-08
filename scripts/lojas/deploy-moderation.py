#!/usr/bin/env python3
"""Deploy the chat/content moderation backend, with explicit production hashes.

Read-only by default. --apply backs up the database and changed functions,
applies only moderation migrations, then restarts only the functions container.
Does not send push notifications, moderate actual content or suspend accounts.
"""
import argparse
import json
from pathlib import Path
import shlex
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
EXPECTED = {
    "public-culto/index.ts": "96506ab424eea15937faa61c44a419b7dadeee453e893062d60f96a7bb378149",
    "public-playlist/index.ts": "955cd535c7f661c168c5f2db62e09e3eeb93a95ad6a6f79ea1cd9ac98cef73ea",
    "send-push/index.ts": "24faba7c03e8bd65c4fd443ce035e2996d070fb71f297d839715f2941e555ed2",
    "platform-suspend-account/index.ts": None,
    "platform-suspend-account/flow.ts": None,
}
REMOTE = r'''
import fcntl,hashlib,json,os,pathlib,subprocess,sys,time,urllib.request,urllib.error
os.umask(0o077)
p=json.load(sys.stdin)
root=pathlib.Path('/opt/supabase'); functions=root/'volumes/functions'
release=pathlib.Path('/var/lib/maislouvor-deploy/20261007-moderation')
lock=open('/var/lock/maislouvor-deploy.lock','a'); fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
def run(args,input=None):
 r=subprocess.run(args,input=input,text=True,capture_output=True,timeout=60)
 if r.returncode: raise RuntimeError('Command failed: '+args[0]+'; output withheld')
 return r.stdout
def sql(query): return run(['docker','exec','-i','supabase-db','psql','-X','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],query)
def runtime(): return json.loads(run(['docker','inspect','supabase-edge-functions']))[0]
def atomic(path,source):
 path.parent.mkdir(parents=True,exist_ok=True)
 temp=path.with_name(path.name+'.moderation-tmp')
 with open(temp,'x') as f: f.write(source)
 os.chmod(temp,0o644); os.replace(temp,path)
def ready():
 for i in range(25):
  obj=runtime()
  if obj['State'].get('Health',{}).get('Status')=='healthy': return obj
  time.sleep(1)
 raise RuntimeError('Functions service did not become healthy')
assert not release.exists(), 'Release already exists; inspect it before updating'
before=runtime(); env=dict(x.split('=',1) for x in before['Config']['Env'] if '=' in x)
rest=json.loads(run(['docker','inspect','supabase-rest']))[0]
rest_env=dict(x.split('=',1) for x in rest['Config']['Env'] if '=' in x)
assert 'private' not in [x.strip() for x in rest_env['PGRST_DB_SCHEMAS'].split(',')], 'Private schema exposed'
assert sql("SELECT to_regclass('public.account_deletion_storage_queue') IS NOT NULL;").strip()=='t', 'Deletion prerequisite missing'
assert sql("SELECT to_regclass('public.chat_reports') IS NULL AND to_regclass('public.content_reports') IS NULL;").strip()=='t', 'Moderation already installed'
originals={}
for name,digest in p['expected'].items():
 path=functions/name
 if digest is None: assert not path.exists(), 'New function already exists'
 else:
  content=path.read_bytes(); assert hashlib.sha256(content).hexdigest()==digest, 'Production source changed: '+name
  originals[name]=content
manifest={'migrations':{n:hashlib.sha256(v.encode()).hexdigest() for n,v in p['migrations'].items()},
          'files':{n:hashlib.sha256(v.encode()).hexdigest() for n,v in p['files'].items()}}
print(json.dumps({'preflight':True,'apply':p['apply'],**manifest}),flush=True)
if not p['apply']: sys.exit(0)
release.mkdir(mode=0o700,parents=True)
(release/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
with open(release/'database.before.dump','xb') as backup:
 result=subprocess.run(['docker','exec','supabase-db','pg_dump','-U','postgres','-d','postgres','-Fc'],stdout=backup,stderr=subprocess.PIPE,timeout=60)
 assert result.returncode==0, 'Database backup failed'
assert (release/'database.before.dump').stat().st_size>1000, 'Invalid backup'
for name,content in originals.items():
 path=release/'functions-before'/name; path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(content)
query="BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s';\n"+'\n'.join(p['migrations'].values())
query+="""
DO $check$ BEGIN
 IF EXISTS (SELECT FROM public.account_deletion_blocking_references()) THEN RAISE EXCEPTION 'Unhandled deletion reference'; END IF;
 IF has_table_privilege('anon','public.content_reports','SELECT')
    OR has_table_privilege('authenticated','public.content_reports','INSERT')
    OR has_function_privilege('authenticated','public.platform_record_account_suspension(uuid,uuid,boolean,text,uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'Private moderation operation exposed'; END IF;
 IF public.chat_mask_text('computador disputa cuidado')<>'computador disputa cuidado' THEN RAISE EXCEPTION 'Word filter corrupts normal text'; END IF;
 IF public.chat_mask_text('babaca')='babaca' THEN RAISE EXCEPTION 'Word filter inactive'; END IF;
END $check$;
COMMIT;
"""
sql(query)
(release/'database-applied.json').write_text(json.dumps(manifest['migrations'],indent=2)+'\n')
try:
 for name,source in p['files'].items(): atomic(functions/name,source)
 run(['docker','restart','supabase-edge-functions']); after=ready()
 assert before['Config']['Env']==after['Config']['Env'] and before['Image']==after['Image'], 'Runtime environment changed'
 statuses={}
 for name,expected in [('platform-suspend-account',401),('public-playlist',400),('public-culto',400),('send-push',400)]:
  req=urllib.request.Request('https://api.maislouvor.com/functions/v1/'+name,data=b'{}',
   headers={'Authorization':'Bearer '+env['SUPABASE_ANON_KEY'],'apikey':env['SUPABASE_ANON_KEY'],'Content-Type':'application/json'})
  try:
   response=urllib.request.urlopen(req,timeout=30); status=response.status
  except urllib.error.HTTPError as e: status=e.code
  assert status==expected, 'Health check failed: '+name
  statuses[name]=status
 report={'deployed':True,'endpoints':statuses,'service_healthy':True,'environment_preserved':True,
         'content_blocked':False,'accounts_suspended':False,'notifications_sent':False,'smtp_changed':False}
 (release/'result.json').write_text(json.dumps(report,indent=2)+'\n'); print(json.dumps(report,indent=2))
except Exception:
 for name,digest in p['expected'].items():
  path=functions/name
  if digest is None:
   if path.exists(): path.unlink()
  else:
   temp=path.with_name(path.name+'.rollback'); temp.write_bytes(originals[name]); os.chmod(temp,0o644); os.replace(temp,path)
 run(['docker','restart','supabase-edge-functions']); ready()
 print('Functions restored. Additive database changes retained; inspect private release.',file=sys.stderr)
 raise SystemExit(1)
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    names = ["20261003132000_chat_moderation.sql", "20261007123000_content_reports_and_provenance.sql"]
    payload = {"apply": args.apply, "expected": EXPECTED,
               "migrations": {n: (ROOT / "supabase/migrations" / n).read_text() for n in names},
               "files": {n: (ROOT / "supabase/functions" / n).read_text() for n in EXPECTED}}
    return subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "louvor-vps",
                           "python3 -c " + shlex.quote(REMOTE)], input=json.dumps(payload), text=True, timeout=180).returncode


if __name__ == "__main__":
    sys.exit(main())
