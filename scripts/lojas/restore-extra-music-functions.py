#!/usr/bin/env python3
"""Corrige o escopo da retirada: restaura só três rotas do backup remoto.

Sem --apply, apenas confere o estado. Asafe e Demucs não são substituídos.
Sugestão de músicas e Moises continuam retirados. Nenhuma migração ou mensagem.
"""
import argparse
import json
import shlex
import subprocess

REMOTE = r'''
import fcntl,hashlib,json,os,pathlib,subprocess,sys,time,urllib.request,urllib.error
os.umask(0o077)
p=json.load(sys.stdin)
root=pathlib.Path('/opt/supabase/volumes/functions')
backup=pathlib.Path('/var/lib/maislouvor-deploy/20261007-retire-music-ai-r2/functions-before')
release=pathlib.Path('/var/lib/maislouvor-deploy/20261007-restore-extra-music-functions')
expected={
 'import-cifra/index.ts':'4e09767fe582d590aa3a09ced7e4bd7524545b9c79debb3feac874173eb98f46',
 'sync-lyrics/index.ts':'0fcb524253384bd3ca3678fd42261ee1a031480713770976ca5579305090b9f7',
 'transpose/index.ts':'ed335bc8763df88d13712786b7ff603b63b5cd2217b10be4177f1858c912b827',
}
retired_hash='2b6c09e4dc635d3e757928a5a80f3769ef0b90bb921b1ea71abc669c6ba33ad2'
lock=open('/var/lock/maislouvor-deploy.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
def run(args):
 r=subprocess.run(args,capture_output=True,text=True,timeout=60)
 if r.returncode: raise RuntimeError('Command failed: '+args[0]+'; output withheld')
 return r.stdout
def state(): return json.loads(run(['docker','inspect','supabase-edge-functions']))[0]
def hashes():
 return {str(f.relative_to(root)):hashlib.sha256(f.read_bytes()).hexdigest()
         for f in root.rglob('*') if f.is_file()}
def atomic(path,content):
 temp=path.with_name(path.name+'.restore-tmp')
 with open(temp,'xb') as f: f.write(content)
 os.chmod(temp,0o644);os.replace(temp,path)
def ready():
 for _ in range(25):
  obj=state()
  if obj['State'].get('Health',{}).get('Status')=='healthy': return obj
  time.sleep(1)
 raise RuntimeError('Functions did not become healthy')
before=ready();env=dict(x.split('=',1) for x in before['Config']['Env'] if '=' in x)
def request(name,method='POST',secret=False):
 headers={'apikey':env['SUPABASE_ANON_KEY'],'Authorization':'Bearer '+env['SUPABASE_ANON_KEY'],'Content-Type':'application/json'}
 if secret: headers['x-webhook-secret']=env['WHATSAPP_WEBHOOK_SECRET']
 req=urllib.request.Request('https://api.maislouvor.com/functions/v1/'+name,
  method=method,data=b'{}' if method=='POST' else None,headers=headers)
 try: r=urllib.request.urlopen(req,timeout=30)
 except urllib.error.HTTPError as e: r=e
 return r.status,json.loads(r.read())
assert not release.exists(), 'Restoration already attempted; inspect the saved result'
before_hashes=hashes();originals={};restore={}
for name,digest in expected.items():
 assert before_hashes[name]==retired_hash, 'Production changed: '+name
 content=(backup/name).read_bytes()
 assert hashlib.sha256(content).hexdigest()==digest, 'Backup mismatch: '+name
 originals[name]=(root/name).read_bytes();restore[name]=content
for name in ['suggest-culto-songs/index.ts','import-moises/index.ts']:
 assert before_hashes[name]==retired_hash, 'Requested removal changed'
status,health=request('whatsapp-assistant','GET',True)
assert status==200 and health.get('ok') and health.get('evolution') and health.get('openai'), 'Asafe health failed before restoration'
worker_before=json.loads(run(['docker','inspect','demucs-worker']))[0]
assert worker_before['State']['Running'], 'Demucs is not running'
print(json.dumps({'preflight':True,'apply':p['apply'],'restore':list(expected),'asafe_health':status,'demucs_running':True}),flush=True)
if not p['apply']: sys.exit(0)
release.mkdir(mode=0o700,parents=True)
(release/'manifest.json').write_text(json.dumps({'restore':expected,'sources_before':before_hashes},indent=2)+'\n')
for name,content in originals.items():
 target=release/'functions-before'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(content)
try:
 for name,content in restore.items(): atomic(root/name,content)
 run(['docker','restart','supabase-edge-functions']);after=ready()
 assert before['Image']==after['Image'] and before['Config']['Env']==after['Config']['Env'], 'Environment changed'
 actual=hashes()
 assert {k:v for k,v in actual.items() if k not in expected}=={k:v for k,v in before_hashes.items() if k not in expected}, 'Unrelated source changed'
 for name,digest in expected.items(): assert actual[name]==digest, 'Restoration mismatch'
 statuses={}
 # Corpo vazio é rejeitado antes de downloads ou chamadas ao provedor.
 for name in ['import-cifra','sync-lyrics','transpose']:
  status,_=request(name);assert status==400, 'Restored endpoint unhealthy: '+name
  statuses[name]=status
 for name in ['suggest-culto-songs','import-moises']:
  status,data=request(name);assert status==410 and data.get('code')=='FEATURE_REMOVED', 'Requested removal lost'
  statuses[name]=status
 status,health=request('whatsapp-assistant','GET',True)
 assert status==200 and health.get('ok') and health.get('evolution') and health.get('openai'), 'Asafe health failed'
 status,_=request('separate-stems');assert status==401, 'Stem endpoint changed'
 worker_after=json.loads(run(['docker','inspect','demucs-worker']))[0]
 assert worker_after['State']['Running'] and worker_before['Id']==worker_after['Id'] and worker_before['State']['StartedAt']==worker_after['State']['StartedAt'], 'Demucs restarted unexpectedly'
 report={'restored':True,'endpoints':statuses,'asafe_healthy':True,'demucs_running_unchanged':True,
  'other_sources_preserved':True,'runtime_preserved':True,'database_changed':False,'messages_sent':False}
 (release/'result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
except Exception:
 for name,content in originals.items(): atomic(root/name,content)
 run(['docker','restart','supabase-edge-functions']);ready()
 print('Restoration rolled back; inspect the private release.',file=sys.stderr)
 raise
'''

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    raise SystemExit(subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "louvor-vps",
         "python3 -c " + shlex.quote(REMOTE)],
        input=json.dumps({"apply": args.apply}), text=True, timeout=180,
    ).returncode)
