from pathlib import Path
import subprocess,json
ROOT=Path(__file__).resolve().parents[2]
files=['20261003131000_terms_acceptance.sql','20261003133000_assistant_ai_consent.sql','20261007120000_strict_assistant_consent.sql','20261007124000_legal_versions.sql','20261008233000_team_data_consent.sql','20261008234000_privacy_version.sql']
source='BEGIN; SET LOCAL lock_timeout=\'5s\'; SET LOCAL statement_timeout=\'60s\';\n'
source+='\n'.join((ROOT/'supabase/migrations'/f).read_text() for f in files)
source+='''\nselect json_build_object('allowed_existing', (select count(*) from public.team_data_consents),'versions',public.legal_current_versions()); ROLLBACK;'''
r=subprocess.run(['ssh','louvor-vps','docker exec -i supabase-db psql -X -U postgres -d postgres -qAt -v ON_ERROR_STOP=1'],input=source,text=True,capture_output=True)
Path('/tmp/maislouvor-consent-preflight.log').write_text(r.stdout+r.stderr)
print(json.dumps({'preflight_exit':r.returncode,'transaction':'ROLLBACK','migrations':files}))
if r.returncode: print(r.stderr[-1500:])
