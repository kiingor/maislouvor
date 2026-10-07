#!/usr/bin/env python3
"""Publish the reviewed web build atomically, retaining old assets and a rollback.

Run locally after build and QA. Does not publish the separate marketing site or
APKs. Copies assets first and the service worker / app shell last.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import tarfile
import tempfile

ROOT=Path(__file__).resolve().parents[1]
REMOTE=r'''
import fcntl,hashlib,json,os,pathlib,shutil,subprocess,tarfile,tempfile,urllib.request
from concurrent.futures import ThreadPoolExecutor
os.umask(0o077)
release=pathlib.Path('/var/lib/maislouvor-deploy/20261007-web-billing')
web=pathlib.Path('/var/www/maislouvor')
lock=open('/var/lock/maislouvor-deploy.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert (release/'result.json').exists(), 'Billing backend not validated'
assert not (release/'web-result.json').exists(),'Already published'
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
baseline={'index.html':'31ca90d49c6d0ac6756ecf90e74e7ecc0a7a7261575e67a36d1df7c3ee499092',
 'sw.js':'a51e5a90a9c715078c1eec6f85578908aa6c3084bbbc3867b2cb4023d2cccf1e',
 'landing-sw.js':'b444eb8742f125aa79f4cbc52126f6d5dc5fbbeb85f7971ddb6a2f48b41a4b88'}
for name,value in baseline.items():assert digest(web/name)==value,'Published site changed: '+name
protected={str(p):digest(p) for p in pathlib.Path('/var/www/maislouvor-marketing').rglob('*') if p.is_file()}
for p in [pathlib.Path('/etc/caddy/Caddyfile'),*web.rglob('*.apk')]:
 if p.is_file():protected[str(p)]=digest(p)
payload=release/'web-payload';payload.mkdir(mode=0o700)
with tarfile.open(release/'web-bundle.tar.gz') as t:
 for item in t.getmembers():assert not item.issym() and not item.islnk() and not pathlib.Path(item.name).is_absolute() and '..' not in pathlib.Path(item.name).parts
 t.extractall(payload,filter='data')
manifest=json.loads((payload/'release.json').read_text());dist=payload/'dist'
assert set(str(p.relative_to(dist)) for p in dist.rglob('*') if p.is_file())==set(manifest['files'])
for name,value in manifest['files'].items():assert digest(dist/name)==value and not name.endswith('.apk')
assert digest(dist/'landing-sw.js')==baseline['landing-sw.js'],'Landing service worker modified'
backup=release/'web-before';backup.mkdir(mode=0o700)
order=[n for n in sorted(manifest['files']) if n not in ['manifest.webmanifest','registerSW.js','sw.js','index.html']]+['manifest.webmanifest','registerSW.js','sw.js','index.html']
existed=[]
for name in order:
 if (web/name).exists():
  assert not (web/name).is_symlink();(backup/name).parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(web/name,backup/name);existed.append(name)
(release/'web-existing.json').write_text(json.dumps(existed))
def atomic(source,target):
 if not target.parent.exists():
  target.parent.mkdir(parents=True,exist_ok=True);target.parent.chmod(0o755)
 with tempfile.NamedTemporaryFile(dir=target.parent,prefix='.billing-',delete=False) as f:temp=pathlib.Path(f.name)
 shutil.copyfile(source,temp);temp.chmod(0o644);os.replace(temp,target)
try:
 for name in order:atomic(dist/name,web/name)
 for name,value in manifest['files'].items():assert digest(web/name)==value
 for name,value in protected.items():assert digest(pathlib.Path(name))==value,'Protected file changed'
 def fetch(path):
  with urllib.request.urlopen('https://maislouvor.com'+path,timeout=40) as r:return r.status,r.read()
 for path in ['/app/settings','/admin/assinaturas','/login']:
  status,body=fetch(path);assert status==200 and hashlib.sha256(body).hexdigest()==manifest['files']['index.html'],'Route incorrect: '+path
 paths=['/'+n for n in manifest['files'] if n.startswith('assets/') or n in ['sw.js','registerSW.js','manifest.webmanifest','landing-sw.js']]
 def verify(path):
  status,body=fetch(path);assert status==200 and hashlib.sha256(body).hexdigest()==manifest['files'][path[1:]],'HTTPS asset differs: '+path
 with ThreadPoolExecutor(6) as pool:list(pool.map(verify,paths))
 report={'published':True,'source_commit':manifest['source_commit'],'files_verified':len(manifest['files']),'https_assets_verified':len(paths),'marketing_and_apks_preserved':True,'index_sha256':manifest['files']['index.html']}
 (release/'web-result.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
except Exception:
 for name in order:
  if name in existed:atomic(backup/name,web/name)
 print('Web publication failed; previous files restored. New hashed assets may remain harmlessly cached.')
 raise
'''

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply',action='store_true');args=parser.parse_args()
dist=ROOT/'dist'
files={str(p.relative_to(dist)):hashlib.sha256(p.read_bytes()).hexdigest() for p in dist.rglob('*') if p.is_file() and p.suffix!='.apk'}
assert 'index.html' in files and 'sw.js' in files
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
manifest={'source_commit':commit,'files':files}
print(json.dumps({'build_files':len(files),'source_commit':commit,'apply':args.apply}),flush=True)
if not args.apply:raise SystemExit(0)
with tempfile.TemporaryDirectory(prefix='maislouvor-billing-publish-') as folder:
 path=Path(folder);(path/'release.json').write_text(json.dumps(manifest,indent=2))
 archive=path/'web-bundle.tar.gz'
 with tarfile.open(archive,'w:gz') as t:
  t.add(path/'release.json',arcname='release.json')
  for name in files:t.add(dist/name,arcname='dist/'+name)
  source=path/'source-without-credentials.tar.gz'
  tracked=subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0')
  with tarfile.open(source,'w:gz') as s:
   for name in tracked:
    if name and (ROOT/name).is_file() and not Path(name).name.startswith('.env') and not name.endswith('.apk'):s.add(ROOT/name,arcname=name)
  t.add(source,arcname=source.name)
 subprocess.run(['scp','-q',str(archive),'louvor-vps:/var/lib/maislouvor-deploy/20261007-web-billing/web-bundle.tar.gz'],check=True)
 subprocess.run(['ssh','-o','BatchMode=yes','louvor-vps','python3 -c '+shlex.quote(REMOTE)],check=True)
