#!/usr/bin/env python3
"""Retira somente sugestão de músicas e Moises; sem --apply, apenas confere a produção.

Backup privado das fontes, hashes contra alterações concorrentes e rollback.
Não altera banco, credenciais, imagens, Asafe ou separação de faixas.
"""
import argparse
import json
from pathlib import Path
import shlex
import subprocess

ROOT = Path(__file__).resolve().parents[2]
EXPECTED = {
    "suggest-culto-songs/index.ts": "d6925c67f5d634008af7b7c058d7c7f0e5cd7d4d21f2baeca0be735fc8ec6283",
    "import-moises/index.ts": "a735295d03b82862cd7438deb7cbb66989ca3069af2d7c188df98d99c9f29929",
    "_shared/retiredMusicAi.ts": None,
}
REMOTE = r'''
import fcntl,hashlib,json,os,pathlib,subprocess,sys,time,urllib.request,urllib.error
os.umask(0o077)
p=json.load(sys.stdin)
functions=pathlib.Path('/opt/supabase/volumes/functions')
# A tentativa inicial foi revertida: o Kong responde ao preflight com 200,
# antes de chegar ao handler (que responde 204). Preservamos o primeiro backup.
release=pathlib.Path('/var/lib/maislouvor-deploy/20261007-retire-music-ai-r2')
lock=open('/var/lock/maislouvor-deploy.lock','a'); fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
def run(args):
 r=subprocess.run(args,text=True,capture_output=True,timeout=60)
 if r.returncode: raise RuntimeError('Command failed: '+args[0]+'; output withheld')
 return r.stdout
def runtime(): return json.loads(run(['docker','inspect','supabase-edge-functions']))[0]
def atomic(path,content):
 path.parent.mkdir(parents=True,exist_ok=True)
 temp=path.with_name(path.name+'.retire-tmp')
 with open(temp,'xb') as f: f.write(content)
 os.chmod(temp,0o644); os.replace(temp,path)
def hashes():
 return {str(f.relative_to(functions)):hashlib.sha256(f.read_bytes()).hexdigest()
         for f in functions.rglob('*') if f.is_file()}
def ready():
 for _ in range(25):
  obj=runtime()
  if obj['State'].get('Health',{}).get('Status')=='healthy': return obj
  time.sleep(1)
 raise RuntimeError('Functions service did not become healthy')
def request(name,method='POST',body=b'{}'):
 req=urllib.request.Request('https://api.maislouvor.com/functions/v1/'+name,
  data=body if method=='POST' else None, method=method,
  headers={'Authorization':'Bearer '+env['SUPABASE_ANON_KEY'],
           'apikey':env['SUPABASE_ANON_KEY'],'Content-Type':'application/json',
           'Origin':'https://maislouvor.com','Access-Control-Request-Method':'POST'})
 try: response=urllib.request.urlopen(req,timeout=30)
 except urllib.error.HTTPError as e: response=e
 return response.status,response.read(),response.headers
assert not release.exists(), 'Release already exists; inspect it before updating'
before=ready(); env=dict(x.split('=',1) for x in before['Config']['Env'] if '=' in x)
baseline_health={}
for name in ['separate-stems','delete-account','apple-auth-token','public-playlist','public-culto']:
 status,_,_=request(name)
 assert status in (400,401), 'Baseline endpoint health failed: '+name
 baseline_health[name]=status
before_hashes=hashes(); originals={}
for name,digest in p['expected'].items():
 assert before_hashes.get(name)==digest, 'Production source changed: '+name
 if digest is not None: originals[name]=(functions/name).read_bytes()
manifest={'before':p['expected'],'after':{n:hashlib.sha256(s.encode()).hexdigest() for n,s in p['files'].items()}}
print(json.dumps({'preflight':True,'apply':p['apply'],'files':list(p['files'])}),flush=True)
if not p['apply']: sys.exit(0)
release.mkdir(mode=0o700,parents=True)
(release/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
for name,content in originals.items():
 path=release/'functions-before'/name; path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(content)
try:
 for name,source in p['files'].items(): atomic(functions/name,source.encode())
 run(['docker','restart','supabase-edge-functions']); after=ready()
 assert before['Config']['Env']==after['Config']['Env'] and before['Image']==after['Image'], 'Runtime environment changed'
 actual=hashes()
 assert {k:v for k,v in actual.items() if k not in p['files']}=={k:v for k,v in before_hashes.items() if k not in p['files']}, 'Unrelated sources changed'
 for name,digest in manifest['after'].items(): assert actual[name]==digest, 'Deployed source mismatch'
 statuses={}
 for name in p['files']:
  if not name.endswith('/index.ts'): continue
  endpoint=name.split('/')[0]; checks=[]
  for method,body in [('POST',b'{}'),('POST',b'not json'),('GET',None),('OPTIONS',None)]:
   status,body,headers=request(endpoint,method,body)
   assert status in ((200,204) if method=='OPTIONS' else (410,)), 'Unexpected status: '+endpoint+' '+method+' '+str(status)
   assert headers.get('Access-Control-Allow-Origin')=='*', 'CORS missing: '+endpoint
   if method!='OPTIONS': assert json.loads(body)['code']=='FEATURE_REMOVED', 'Wrong retired response'
   checks.append(status)
  statuses[endpoint]=checks
 # Pedidos sem usuário válido: nenhuma fila de áudio é criada, nenhuma mensagem é enviada.
 health={}
 for name,expected in baseline_health.items():
  status,_,_=request(name)
  assert status==expected, 'Unrelated endpoint health failed: '+name
  health[name]=status
 report={'deployed':True,'retired':statuses,'other_endpoints':health,
         'service_healthy':True,'environment_preserved':True,'other_sources_preserved':True,
         'database_changed':False,'user_content_changed':False}
 (release/'result.json').write_text(json.dumps(report,indent=2)+'\n'); print(json.dumps(report,indent=2))
except Exception:
 for name,digest in p['expected'].items():
  path=functions/name
  if digest is None: path.unlink(missing_ok=True)
  else: atomic(path,originals[name])
 run(['docker','restart','supabase-edge-functions']); ready()
 print('Previous function sources restored; inspect the private release.',file=sys.stderr)
 raise
'''


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    payload = {"apply": args.apply, "expected": EXPECTED,
               "files": {name: (ROOT / "supabase/functions" / name).read_text() for name in EXPECTED}}
    raise SystemExit(subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "louvor-vps",
         "python3 -c " + shlex.quote(REMOTE)],
        input=json.dumps(payload), text=True, timeout=180,
    ).returncode)
