#!/usr/bin/env python3
"""Align only pricing and availability copy on the two existing landing builds.

Retains the published design, content, CSS, animations and media. Uses new hashed
JS filenames, backs up both entrypoints and checks every approved quote before
writing. Default is a read-only preview; --apply was authorized with web launch.
"""
import argparse,json,shlex,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
COPY={
 'Planos em preparação':'Planos para sua equipe',
 'Uma prévia do que vem por aí.':'Assinatura para a equipe toda.',
 'Valores previstos de lançamento, sujeitos a confirmação. As assinaturas ainda não estão disponíveis para contratação. Recursos de IA terão limites de uso.':'Assine pelo site em Usuário → Assinatura. Escolha cobrança mensal ou anual; no anual, o pagamento é único. O Essencial é gratuito para até 5 integrantes.',
 'Como será o pagamento da assinatura?':'Como funciona o pagamento da assinatura?',
 'Estamos preparando assinaturas mensais e anuais pela App Store e pelo Google Play. Também está previsto o pagamento pelo site com Apple Pay e Google Pay. Os planos desta página são uma previsão; nenhum pagamento é feito aqui.':'O responsável pela equipe escolhe o plano em Usuário → Assinatura e paga com cartão pelo site. A cobrança pode ser mensal ou anual, com renovação automática. Você pode cancelar a renovação no gerenciamento da assinatura. As compras pelas lojas de aplicativos ainda estão em preparação.',
}
REMOTE=r'''
import fcntl,hashlib,json,os,pathlib,re,subprocess,sys,tempfile,urllib.request
os.umask(0o077);p=json.load(sys.stdin)
root=pathlib.Path('/var/www/maislouvor-marketing')
release=pathlib.Path('/var/lib/maislouvor-deploy/20261007-web-billing/landing-price-alignment-v2')
lock=open('/var/lock/maislouvor-deploy.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
expected={'root':'a78480a8ccf9f12a7eb4a0586d605719e94d5c2338b035892e450ab7f12b61d2','conheca':'f5a7d1b3418363d1362c424525d2b163e58c8fec1d79f0cf35dc35b4aa429133'}
def sha(data):return hashlib.sha256(data).hexdigest()
changes=[]
for name in ['root','conheca']:
 html=(root/name/'index.html').read_text();assert sha(html.encode())==expected[name], 'Landing changed; reread before modifying'
 url=re.findall(r'<script[^>]+src="([^"]+)"',html);assert len(url)==1
 asset=root/name/'assets'/url[0].split('/')[-1];source=asset.read_text();patched=source
 table=re.search(r'(?:const )([A-Za-z]+)=\{essencial:\{prices:.*?\}\},([A-Za-z]+)=\[5,10,20,40,50,75,100,150,200\];function ([A-Za-z]+)\(e,t,a=!1\)\{.*?return\{monthly:r,total:a\?r\*10:r,equivalent:a\?Math.round\(r\*10/12\):r\}\}',source)
 assert table,'Unknown pricing function'
 table_name,sizes_name,fn_name=table.group(1,2,3)
 replacement='const '+table_name+'='+json.dumps(p['plans'],separators=(',',':'))+','+sizes_name+'=[5,10,20,40,50,75,100,150,200];function '+fn_name+'(e,t,a=!1){if(!Object.hasOwn('+table_name+',e)||!'+sizes_name+'.includes(t))throw new RangeError("Plano ou faixa de equipe inválidos.");const r='+table_name+'[e].prices['+sizes_name+'.indexOf(t)];return{monthly:r,total:a?r*10:r,equivalent:a?Math.round(r*10/12):r}}'
 patched=source[:table.start()]+replacement+source[table.end():]
 assert '.extra' not in patched
 # Evaluate only the new pure quote function, never the browser bundle.
 tests=';const plans='+json.dumps(p['plans'])+';let count=0;for(const [plan,data] of Object.entries(plans)){for(const [i,size] of '+sizes_name+'.entries()){for(const annual of [false,true]){const q='+fn_name+'(plan,size,annual);if(q.total!==data.prices[i]*(annual?10:1))throw Error("quote mismatch");count++}}}console.log(count)'
 # Node is not required on the VPS. Exact arrays/formula are checked here and browser QA follows.
 assert len(p['plans'])==4 and all(len(v['prices'])==9 for v in p['plans'].values())
 new_name='index-billing-'+sha(patched.encode())[:12]+'.js';new_url=url[0].rsplit('/',1)[0]+'/'+new_name
 changed_html=html.replace(url[0],new_url)
 for old,new in p['copy'].items():
  assert changed_html.count(old)==1,'Availability copy changed: '+old[:30]
  changed_html=changed_html.replace(old,new)
 changes.append({'name':name,'old_html':html,'old_js':source,'js':patched,'html':changed_html,'asset':new_name,'url':new_url,'quote_source':replacement,'quote_test':tests})
print(json.dumps({'preflight':True,'landings':2,'plans':4,'capacities':9,'changes':'approved prices and subscription availability','apply':p['apply']}),flush=True)
if not p['apply']:sys.exit(0)
assert not release.exists(),'Alignment already applied'
release.mkdir(parents=True,mode=0o700)
protected={str(f):sha(f.read_bytes()) for f in root.rglob('*') if f.is_file() and f not in [root/'root/index.html',root/'conheca/index.html']}
def atomic(target,data):
 temp=target.with_name('.'+target.name+'.billing-tmp');temp.write_text(data);temp.chmod(0o644);os.replace(temp,target)
try:
 for c in changes:
  (release/(c['name']+'-index.before.html')).write_text(c['old_html']);(release/(c['name']+'-bundle.before.js')).write_text(c['old_js'])
  (release/(c['name']+'-quote-test.js')).write_text(c['quote_source']+c['quote_test'])
  atomic(root/c['name']/'assets'/c['asset'],c['js'])
 for c in changes:atomic(root/c['name']/'index.html',c['html'])
 for c in changes:
  for path,content in [(('/' if c['name']=='root' else '/conheca/'),c['html']),(c['url'],c['js'])]:
   with urllib.request.urlopen('https://maislouvor.com'+path,timeout=40) as r:
    expected_content=changes[0]['html'] if path=='/conheca/' and r.url=='https://maislouvor.com/' else content
    assert r.status==200 and r.read().decode()==expected_content,'Published content differs: '+path
 for path,value in protected.items():assert sha(pathlib.Path(path).read_bytes())==value,'Unrelated landing file changed'
 report={'published':True,'landings':{c['name']:{'index_sha256':sha(c['html'].encode()),'asset':c['asset']} for c in changes},'unrelated_landing_files_preserved':True}
 (release/'result.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
except Exception:
 for c in changes:atomic(root/c['name']/'index.html',c['old_html'])
 raise
'''
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
catalog=json.loads((ROOT/'docs/billing/revenuecat-catalog.json').read_text())
plans={plan:{'prices':[0 if plan=='essencial' and n==5 else next(p['price_cents'] for p in catalog['products'] if p['plan']==plan and p['member_limit']==n and p['billing_period']=='monthly') for n in [5,10,20,40,50,75,100,150,200]]} for plan in ['essencial','estudio','asafe','completo']}
payload={'plans':plans,'copy':COPY,'apply':args.apply}
result=subprocess.run(['ssh','-o','BatchMode=yes','louvor-vps','python3 -c '+shlex.quote(REMOTE)],input=json.dumps(payload),text=True)
raise SystemExit(result.returncode)
