import os,subprocess,time,json,pathlib
name='maislouvor-backup-restore-check'
env={**os.environ,'RESTIC_REPOSITORY':'/var/backups/maislouvor-managed/restic','RESTIC_PASSWORD_FILE':'/etc/maislouvor-backup/password'}
def run(args,**kw):return subprocess.run(args,capture_output=True,check=True,**kw)
snapshot=json.loads(run(['restic','snapshots','--json','--tag','maislouvor-daily'],env=env).stdout)[-1]['id']
dump=run(['restic','dump',snapshot,'/var/lib/maislouvor-backup/postgres.dump'],env=env).stdout
try:
 command='initdb -D /tmp/restoredb -A trust > /tmp/init.log && exec postgres -D /tmp/restoredb -c shared_preload_libraries=pg_stat_statements,pg_cron,pg_net -c cron.database_name=postgres -c cron.launch_active_jobs=off'
 run(['docker','run','--detach','--name',name,'--network','none','--memory','2g','--cpus','1','--user','postgres','--entrypoint','bash','supabase/postgres:15.8.1.085','-c',command])
 for attempt in range(60):
  if subprocess.run(['docker','exec',name,'pg_isready','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
  time.sleep(1)
 else:
  print(run(['docker','logs',name]).stderr.decode()[-2000:]);raise RuntimeError('Isolated restore database did not start')
 roles=run(['docker','exec','supabase-db','psql','-X','-U','postgres','-d','postgres','-qAt','-c',"select rolname from pg_roles where rolname !~ '^pg_' and rolname <> 'postgres'"]).stdout.decode().splitlines()
 statements=[]
 for role in roles:
  safe=role.replace('"','""').replace("'","''")
  statements.append(f"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='{safe}') THEN CREATE ROLE \"{safe}\"; END IF; END $$;")
 run(['docker','exec','-i',name,'psql','-X','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],input='\n'.join(statements).encode())
 result=subprocess.run(['docker','exec','-i',name,'pg_restore','-U','postgres','-d','postgres','--clean','--if-exists','--no-owner','--no-privileges'],input=dump,capture_output=True)
 pathlib.Path('/var/lib/maislouvor-backup/restore-check-errors.log').write_bytes(result.stderr)
 counts=run(['docker','exec',name,'psql','-X','-U','postgres','-d','postgres','-qAt','-c',"select json_build_object('profiles',(select count(*) from public.profiles),'teams',(select count(*) from public.teams),'songs',(select count(*) from public.songs),'objects',(select count(*) from storage.objects));"]).stdout.decode().strip()
 report={'snapshot':snapshot[:8],'restore_exit':result.returncode,'counts':json.loads(counts),'network':'none','jobs':'disabled','checked_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
 pathlib.Path('/var/lib/maislouvor-backup/restore-result.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
 if result.returncode: print(result.stderr.decode()[-3000:])
finally:
 subprocess.run(['docker','rm','-f','-v',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
