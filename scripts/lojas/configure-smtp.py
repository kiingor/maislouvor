#!/usr/bin/env python3
"""Valida SMTP sem enviar mensagens; --apply conecta o GoTrue ao provedor.

Senha: ~/.config/maislouvor-mail/senha-suporte.txt (600), nunca argumento/log/Git.
O SMTP usa TLS com verificação de certificado. Não muda a confirmação de cadastro.
"""
import argparse
import json
from pathlib import Path
import shlex
import stat
import subprocess

REMOTE = r'''
import datetime,fcntl,json,os,pathlib,re,shutil,smtplib,ssl,subprocess,sys
os.umask(0o077)
p=json.load(sys.stdin)
try:
    with smtplib.SMTP_SSL('smtpout.secureserver.net',465,context=ssl.create_default_context(),timeout=25) as smtp:
        smtp.login('suporte@maislouvor.com',p['password'])
except Exception as exc:
    print(json.dumps({'authenticated':False,'error_type':type(exc).__name__,'smtp_code':getattr(exc,'smtp_code',None)}))
    raise SystemExit(1)
if not p['apply']:
    print(json.dumps({'authenticated':True,'applied':False,'messages_sent':0}));raise SystemExit(0)
lock=open('/var/lock/maislouvor-deploy.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
root=pathlib.Path('/opt/supabase');envfile=root/'.env'
before=envfile.read_text()
settings={'SMTP_HOST':'smtpout.secureserver.net','SMTP_PORT':'465','SMTP_USER':'suporte@maislouvor.com',
          'SMTP_PASS':p['password'],'SMTP_ADMIN_EMAIL':'suporte@maislouvor.com','SMTP_SENDER_NAME':'+Louvor'}
result=before
for key,value in settings.items():
    # Docker Compose .env: double-quoted escapes; $$ preserves a literal dollar.
    line=key+'='+json.dumps(value,ensure_ascii=False).replace('$','$$')
    pattern=r'(?m)^'+re.escape(key)+r'=.*$'
    if not re.search(pattern,result): raise RuntimeError('Expected SMTP variable absent: '+key)
    result=re.sub(pattern,lambda _:line,result)
release=pathlib.Path('/var/lib/maislouvor-deploy')/('smtp-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
release.mkdir(mode=0o700);shutil.copy2(envfile,release/'env.before');(release/'env.before').chmod(0o600)
temporary=root/'.env.smtp-pending'
def install(contents):
    temporary.write_text(contents);temporary.chmod(0o600);os.replace(temporary,envfile)
def run(args):
    r=subprocess.run(args,cwd=root,capture_output=True,text=True)
    if r.returncode: raise RuntimeError('Docker validation/recreation failed')
    return r.stdout
try:
    install(result)
    run(['docker','compose','config','--quiet'])
    config=json.loads(run(['docker','compose','config','--format','json']))['services']['auth']['environment']
    for key,value in settings.items():
        if str(config.get('GOTRUE_'+key))!=value: raise RuntimeError('SMTP interpolation mismatch')
    run(['docker','compose','up','-d','--no-deps','auth'])
    active=json.loads(run(['docker','inspect','supabase-auth']))[0]
    runtime=dict(v.split('=',1) for v in active['Config']['Env'] if '=' in v)
    for key,value in settings.items():
        if runtime.get('GOTRUE_'+key)!=value: raise RuntimeError('SMTP runtime mismatch')
except Exception as exc:
    install(before)
    subprocess.run(['docker','compose','up','-d','--no-deps','auth'],cwd=root,capture_output=True)
    print(json.dumps({'authenticated':True,'applied':False,'rollback':True,'error_type':type(exc).__name__}))
    raise SystemExit(1)
report={'authenticated':True,'applied':True,'messages_sent':0,'sender':'suporte@maislouvor.com','provider':'GoDaddy Professional Email'}
(release/'result.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
'''

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
path = Path.home()/'.config/maislouvor-mail/senha-suporte.txt'
if not path.exists() or not path.stat().st_size:
    raise SystemExit('Aguardando senha no arquivo privado, sem envio pelo chat.')
if stat.S_IMODE(path.stat().st_mode) & 0o077:
    raise SystemExit('O arquivo da senha deve ter permissão 600.')
password = path.read_text().rstrip('\r\n')
if not password or any(char in password for char in '\r\n\x00'):
    raise SystemExit('O arquivo deve conter apenas a senha, em uma linha.')
payload = json.dumps({'password': password, 'apply': args.apply})
result = subprocess.run(['ssh','-o','BatchMode=yes','louvor-vps','python3 -c '+shlex.quote(REMOTE)],
                        input=payload,text=True,capture_output=True)
if result.stdout: print(result.stdout.strip())
if result.returncode and not result.stdout:
    print('Não foi possível completar a conexão/configuração; nenhum segredo foi impresso.')
raise SystemExit(result.returncode)
