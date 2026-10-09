#!/usr/bin/env python3
"""Read-only deployment snapshot, with aggregate job/worker state and no secrets."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
FILES = [
    'supabase/migrations/20261010010000_stem_job_fencing.sql',
    'supabase/functions/separate-stems/index.ts',
    'supabase/functions/stems-callback/index.ts',
    'demucs-worker/worker.py',
    'worker-gpu/worker.py',
]
BASELINE = {
    '/opt/demucs-worker/worker.py': '4c3e525ca77475331963125480c3fa3305e52b4db8774b940dbb6b2eeb875821',
    '/opt/supabase/volumes/functions/separate-stems/index.ts': 'a970bef8b79ede239ad92c3b7f9aa1243a4759e0d71ce9ddc05f04023aff3c10',
    '/opt/supabase/volumes/functions/stems-callback/index.ts': 'bd97b469e98d9ed0a5a8c7fcf4cde81308b36e65caef566a579ad64980c4d0d4',
}
LOCAL_WORKER = Path('/Users/filipecardone/LouvorMais/louvor-glass-flow/worker-gpu/worker.py')
LOCAL_BASELINE = '50e8e15c26a485c23572d5955dda8f78008f8af2cadb5435f4f22e98d1915f65'
SQL = """
begin read only;
select jsonb_build_object('checked_at_utc',now() at time zone 'UTC',
 'queued',count(*) filter(where status='queued'),'processing',count(*) filter(where status='processing')) from public.stem_jobs;
select coalesce(jsonb_agg(t),'[]'::jsonb) from (
 select kind,count(*) known_workers,count(*) filter(where last_seen>now()-interval '5 minutes') seen_last_5min,
 floor(extract(epoch from(now()-max(last_seen)))/60) latest_age_minutes
 from public.worker_heartbeats group by kind order by kind
) t;
select jsonb_build_object('schema_hash',md5(string_agg(column_name||':'||data_type||':'||is_nullable,',' order by ordinal_position)))
 from information_schema.columns where table_schema='public' and table_name='stem_jobs';
select jsonb_build_object('rpc_hash',md5(string_agg(pg_get_functiondef(p.oid),E'\\n' order by p.proname)))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('claim_stem_job','claim_stem_job_v2','enqueue_stem_job','finish_stem_job','stem_job_context','guard_stem_job_claim','invalidate_song_audio_tracks');
commit;
"""

def run(args, source=None):
    result = subprocess.run(args, input=source, text=True, capture_output=True, timeout=45, check=False)
    if result.returncode:
        raise RuntimeError('Read-only command failed; stderr omitted to avoid exposing server details.')
    return result.stdout

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    remote_code = 'from pathlib import Path\nimport json,hashlib\npaths='+repr(list(BASELINE))+'\nprint(json.dumps({p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}))\n'
    remote = json.loads(run(['ssh','louvor-vps','python3 -'], remote_code))
    rows = [json.loads(line) for line in run(['ssh','louvor-vps','docker exec -i supabase-db psql -U postgres -d postgres -X -A -t -q -v ON_ERROR_STOP=1'], SQL).splitlines() if line.startswith('{') or line.startswith('[')]
    if len(rows) != 4: raise RuntimeError('Unexpected aggregate result')
    result = {
        'read_only': True,
        'source_commit': run(['git','-C',str(ROOT),'rev-parse','HEAD']).strip(),
        'source_hashes': {name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in FILES},
        'remote_hashes': remote,
        'remote_baseline_matches': remote == BASELINE,
        'local_gpu_sha256': hashlib.sha256(LOCAL_WORKER.read_bytes()).hexdigest(),
        'local_gpu_baseline_matches': hashlib.sha256(LOCAL_WORKER.read_bytes()).hexdigest() == LOCAL_BASELINE,
        'queue':rows[0], 'worker_aggregates':rows[1], **rows[2], **rows[3],
        'requires_coordinated_deploy': True,
        'apply_permitted_by_this_script': False,
    }
    payload = json.dumps(result,indent=2,ensure_ascii=False)+'\n'
    if args.output:
        fd = os.open(args.output,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
        with os.fdopen(fd,'w') as f: f.write(payload)
        os.chmod(args.output,0o600)
    print(payload,end='')

if __name__ == '__main__': main()
