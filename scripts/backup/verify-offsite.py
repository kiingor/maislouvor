#!/usr/bin/env python3
"""Compara SHA-256 de todos os arquivos da cópia criptografada no NVMe.

Executar somente após rsync terminar. Nenhum conteúdo ou segredo é impresso.
O bloqueio compartilhado impede o backup/prune de alterar a origem na leitura.
"""
import hashlib
import json
from pathlib import Path
import shlex
import subprocess

DESTINATION = Path('/Volumes/MaisLouvorBuild/Backups/maislouvor-restic')
REMOTE = r'''
import hashlib,json,pathlib
root=pathlib.Path('/var/backups/maislouvor-managed/restic')
files={}
for p in sorted(root.rglob('*')):
 if p.is_file() and 'locks' not in p.relative_to(root).parts:
  h=hashlib.sha256()
  with p.open('rb') as f:
   for chunk in iter(lambda:f.read(2*1024*1024),b''):h.update(chunk)
  files[str(p.relative_to(root))]={'size':p.stat().st_size,'sha256':h.hexdigest()}
print(json.dumps(files))
'''

if not (DESTINATION/'config').is_file():
    raise SystemExit('A cópia do repositório não está disponível no destino esperado.')
result = subprocess.run(['ssh','-o','BatchMode=yes','louvor-vps',
    'flock -s /run/lock/maislouvor-backup.lock python3 -c '+shlex.quote(REMOTE)],
    capture_output=True,text=True,check=True)
expected = json.loads(result.stdout)
actual = {str(p.relative_to(DESTINATION)) for p in DESTINATION.rglob('*')
          if p.is_file() and 'locks' not in p.relative_to(DESTINATION).parts}
if not expected or actual != set(expected):
    raise SystemExit('O conjunto de arquivos diverge da origem; repetir/concluir a cópia.')
for name, metadata in expected.items():
    path = DESTINATION/name
    if path.stat().st_size != metadata['size']:
        raise SystemExit('Um arquivo tem tamanho diferente da origem.')
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda:source.read(2*1024*1024),b''):digest.update(chunk)
    if digest.hexdigest() != metadata['sha256']:
        raise SystemExit('Um arquivo diverge da origem.')
report = {'verified':True,'method':'SHA-256 de cada arquivo',
          'files':len(expected),'bytes':sum(v['size'] for v in expected.values())}
report_path=DESTINATION.parent/'copy-verification.json'
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
report_path.chmod(0o600)
print(json.dumps(report,ensure_ascii=False))
