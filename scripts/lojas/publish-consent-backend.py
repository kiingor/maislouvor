#!/usr/bin/env python3
"""Freeze and preflight the consent backend; apply is an explicit separate command.

prepare: reads production, runs SQL in a transaction ending in ROLLBACK, and
creates a private local artifact. apply: verifies that frozen baseline, creates
a database backup and private originals, commits all seven migrations together,
replaces only eight reviewed edge files, and restarts only the edge container.
No automatic database restore or rollback of consent restrictions is performed.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

HOST = 'louvor-vps'
FUNCTIONS = Path('/opt/supabase/volumes/functions')
RELEASES = Path('/var/lib/maislouvor-deploy')
LOCK = '/var/lock/maislouvor-deploy.lock'
EDGE = 'supabase-edge-functions'
MIGRATIONS = (
    '20261003131000_terms_acceptance.sql',
    '20261003133000_assistant_ai_consent.sql',
    '20261007120000_strict_assistant_consent.sql',
    '20261007124000_legal_versions.sql',
    '20261008233000_team_data_consent.sql',
    '20261008234000_privacy_version.sql',
    '20261008235000_assistant_team_data_guard.sql',
)
CHANGED = (
    'whatsapp-assistant/persona.ts', 'whatsapp-assistant/tools.ts',
    'whatsapp-assistant/handler.ts', 'send-push/index.ts', 'public-culto/index.ts',
    'create-invite/index.ts', 'create-invite/legacy.ts', 'accept-invite/index.ts',
)
PRESERVED = (
    'whatsapp-assistant/notifications.ts', 'whatsapp-assistant/capabilities.ts',
    'whatsapp-assistant/openai.ts', 'whatsapp-assistant/format.ts',
    'whatsapp-assistant/missions.ts', 'whatsapp-assistant/evolution.ts',
    'whatsapp-assistant/notification-options.ts', 'whatsapp-assistant/index.ts',
    'whatsapp-assistant/triggers.ts', '_shared/security.ts', '_shared/revenuecat.ts',
)
PSQL = ['docker', 'exec', '-i', 'supabase-db', 'psql', '-X', '-U', 'postgres',
        '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1']


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def validate_release(value: str) -> str:
    if not re.fullmatch(r'20\d{6}-consent-backend(?:-[a-z0-9-]{1,30})?', value):
        raise ValueError('Release ID must be YYYYMMDD-consent-backend[-suffix]')
    dt.datetime.strptime(value[:8], '%Y%m%d')
    return value


def validate_payload(payload):
    if payload.get('format') != 1:
        raise ValueError('Unknown payload format')
    validate_release(payload['release_id'])
    if set(payload['expected']) != set(CHANGED + PRESERVED):
        raise ValueError('Wrong baseline scope')
    if set(payload['files']) != set(CHANGED) or list(payload['migrations']) != list(MIGRATIONS):
        raise ValueError('Wrong deployment scope or migration order')
    for digest in payload['expected'].values():
        if not re.fullmatch(r'[0-9a-f]{64}', digest):
            raise ValueError('Invalid baseline digest')
    for group in ['files', 'migrations']:
        for value in payload[group].values():
            if not isinstance(value['source'], str) or sha(value['source'].encode()) != value['sha256']:
                raise ValueError('Source digest mismatch')


def transaction(payload, *, commit: bool) -> str:
    source = "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='90s'; SET LOCAL standard_conforming_strings=on;\n"
    source += '\n'.join(payload['migrations'][name]['source'] for name in MIGRATIONS)
    source += r'''
DO $verify$
BEGIN
  IF public.team_data_consent_version() <> '2026-10-08'
     OR public.legal_current_versions() <> '{"terms":"2026-10-07","privacy":"2026-10-08"}'::jsonb
  THEN RAISE EXCEPTION 'Unexpected consent or legal version'; END IF;
  IF (SELECT count(*) FROM public.team_data_consents) <> 0
  THEN RAISE EXCEPTION 'Unexpected automatic consent grants'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.team_data_consents'::regclass)
     OR has_table_privilege('authenticated','public.team_data_consents','INSERT')
     OR has_function_privilege('anon','public.set_my_team_data_consent(boolean,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.team_data_allowed_profiles(uuid[])','EXECUTE')
  THEN RAISE EXCEPTION 'Consent access control invalid'; END IF;
  IF EXISTS (SELECT FROM public.account_deletion_blocking_references())
  THEN RAISE EXCEPTION 'Unhandled account deletion reference'; END IF;
END $verify$;
'''
    # This self-hosted installation had no Supabase CLI migration registry.
    # Record only what this transaction actually executes, not invented history.
    source += '''
CREATE SCHEMA IF NOT EXISTS supabase_migrations AUTHORIZATION postgres;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text NOT NULL PRIMARY KEY, statements text[], name text
);
REVOKE ALL ON SCHEMA supabase_migrations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE supabase_migrations.schema_migrations FROM PUBLIC, anon, authenticated;
'''
    for filename in MIGRATIONS:
        version, name = filename.removesuffix('.sql').split('_', 1)
        escaped = payload['migrations'][filename]['source'].replace("'", "''")
        source += ("INSERT INTO supabase_migrations.schema_migrations(version,name,statements) "
                   f"VALUES ('{version}','{name}',ARRAY['{escaped}']);\n")
    source += '''
SELECT json_build_object('total',count(*),'app',count(*) FILTER (WHERE source='app'),
                         'review_fixture',count(*) FILTER (WHERE source='review_fixture'))
FROM public.team_data_consents;
'''
    source += 'COMMIT;\n' if commit else 'ROLLBACK;\n'
    return source


def command(arguments, *, source=None, timeout=120, log=None):
    result = subprocess.run(arguments, input=source, text=True, capture_output=True, timeout=timeout)
    if log is not None:
        Path(log).write_text(result.stdout + result.stderr)
        Path(log).chmod(0o600)
    if result.returncode:
        raise RuntimeError(f'Command failed ({arguments[0]}, exit {result.returncode}); diagnostics withheld')
    return result.stdout


def file_hash(path: Path) -> str:
    if path.is_symlink() or any(parent.is_symlink() for parent in path.parents):
        raise RuntimeError('Symlink refused in deployment surface')
    return sha(path.read_bytes())


def runtime():
    return json.loads(command(['docker', 'inspect', EDGE]))[0]


def runtime_identity(container):
    # Values from Config.Env never leave the server, only a whole-array digest.
    mounts = sorted(container['Mounts'], key=lambda entry: (entry.get('Destination', ''), entry.get('Source', '')))
    return {'image': container['Image'], 'environment_sha256': sha(canonical(container['Config']['Env'])),
            'command': container['Config']['Cmd'], 'mounts_sha256': sha(canonical(mounts))}


def snapshot():
    container = runtime()
    if container['State'].get('Health', {}).get('Status') != 'healthy':
        raise RuntimeError('Edge container is not healthy')
    rest = json.loads(command(['docker', 'inspect', 'supabase-rest']))[0]
    env = dict(entry.split('=', 1) for entry in rest['Config']['Env'] if '=' in entry)
    if 'private' in [schema.strip() for schema in env.get('PGRST_DB_SCHEMAS', '').split(',')]:
        raise RuntimeError('Private schema is exposed through REST')
    schema = command(['docker', 'exec', 'supabase-db', 'pg_dump', '-U', 'postgres', '-d', 'postgres',
                      '--schema-only', '--no-owner'])
    # PostgreSQL patch versions may emit randomized psql restriction tokens.
    schema = '\n'.join(line for line in schema.splitlines()
                       if not line.startswith(('\\restrict ', '\\unrestrict ')))
    return {'files': {name: file_hash(FUNCTIONS / name) for name in CHANGED + PRESERVED},
            'loader_sha256': file_hash(FUNCTIONS / 'main/index.ts'),
            'schema_sha256': sha(schema.encode()), 'runtime': runtime_identity(container)}


def smoke():
    # All requests stop before authentication/mutations, except the assistant
    # GET which checks configuration only; no webhook secret is sent at all.
    container = runtime()
    env = dict(entry.split('=', 1) for entry in container['Config']['Env'] if '=' in entry)
    statuses = {}
    for name, method, expected in [
        ('whatsapp-assistant', 'GET', 404), ('create-invite', 'POST', 401),
        ('accept-invite', 'POST', 401), ('public-culto', 'POST', 400), ('send-push', 'POST', 400),
    ]:
        headers = {'Content-Type': 'application/json', 'apikey': env['SUPABASE_ANON_KEY'],
                   'Authorization': 'Bearer ' + env['SUPABASE_ANON_KEY']}
        request = urllib.request.Request('https://api.maislouvor.com/functions/v1/' + name,
                                         data=b'{}' if method == 'POST' else None,
                                         method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                status = response.status
        except urllib.error.HTTPError as error:
            status = error.code
            error.close()
        if status != expected:
            raise RuntimeError(f'Endpoint {name} returned {status}, expected {expected}')
        statuses[name] = status
    return statuses


def atomic_source(path: Path, source: str):
    file_hash(path)  # Validate path/ancestors before writing; every target already exists.
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.consent-', delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(source.encode())
    try:
        temporary.chmod(0o644)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def wait_ready():
    for _ in range(45):
        container = runtime()
        if container['State'].get('Health', {}).get('Status') == 'healthy':
            return container
        time.sleep(1)
    raise RuntimeError('Edge did not become healthy after restart')


def save_state(release: Path, phase: str, **details):
    (release / 'state.json').write_text(json.dumps({'phase': phase, **details}, indent=2) + '\n')


def remote_main(action: str, payload):
    import fcntl
    os.umask(0o077)
    validate_payload(payload)
    with open(LOCK, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        before = snapshot()
        if before['files'] != payload['expected']:
            raise RuntimeError('Edge baseline drifted; prepare again after reviewing differences')
        absent = command(PSQL, source="SELECT to_regclass('public.team_data_consents') IS NULL;").strip()
        if absent != 't':
            raise RuntimeError('Consent backend already exists; do not replay this first-deployment pipeline')
        if action == 'prepare':
            started = time.monotonic()
            command(PSQL, source=transaction(payload, commit=False), timeout=300)
            elapsed = round(time.monotonic() - started, 3)
            after = snapshot()
            if after != before:
                changed = ', '.join(key for key in before if before[key] != after[key])
                raise RuntimeError('Production changed during preflight: ' + changed)
            return {'baseline': before, 'preflight': {'transaction': 'ROLLBACK', 'migrations': len(MIGRATIONS),
                                                    'migration_seconds': elapsed,
                                                    'consents_before': {'table_existed': False, 'total': 0, 'app': 0, 'review_fixture': 0},
                                                    'health': smoke()}}
        if action != 'apply' or payload.get('baseline') != before:
            raise RuntimeError('Frozen production baseline differs; prepare again')
        release = RELEASES / payload['release_id']
        release.mkdir(mode=0o700)
        (release / 'payload.json').write_text(json.dumps(payload, indent=2) + '\n')
        save_state(release, 'backup-started', database_committed=False)
        with (release / 'database.before.dump').open('xb') as output:
            result = subprocess.run(['docker', 'exec', 'supabase-db', 'pg_dump', '-U', 'postgres',
                                     '-d', 'postgres', '-Fc'], stdout=output, stderr=subprocess.PIPE, timeout=300)
        if result.returncode or (release / 'database.before.dump').stat().st_size < 1024:
            raise RuntimeError('Database backup failed; production not changed')
        with (release / 'database.before.dump').open('rb') as backup:
            check = subprocess.run(['docker', 'exec', '-i', 'supabase-db', 'pg_restore', '--list'],
                                   stdin=backup, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=120)
        if check.returncode:
            raise RuntimeError('Database backup validation failed; production not changed')
        for name in CHANGED:
            destination = release / 'functions-before' / name
            destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            shutil.copyfile(FUNCTIONS / name, destination)
            if file_hash(destination) != payload['expected'][name]:
                raise RuntimeError('Private original copy mismatch')
        if snapshot() != before:
            raise RuntimeError('Production drifted while backing up; production not changed')
        save_state(release, 'database-apply-started', database_committed='unknown-until-confirmed')
        applied = command(PSQL, source=transaction(payload, commit=True), timeout=300, log=release / 'database-apply.log')
        transaction_counts = json.loads([line for line in applied.splitlines() if line.startswith('{')][-1])
        save_state(release, 'database-committed', database_committed=True)
        # SQL is committed first: new edges never run without their required RPCs.
        # Until restart the existing workers may finish with the previous code.
        try:
            for name in CHANGED:
                atomic_source(FUNCTIONS / name, payload['files'][name]['source'])
            command(['docker', 'restart', EDGE], timeout=120)
            after_runtime = wait_ready()
            if runtime_identity(after_runtime) != before['runtime']:
                raise RuntimeError('Edge runtime image/environment/mounts changed')
            if file_hash(FUNCTIONS / 'main/index.ts') != before['loader_sha256']:
                raise RuntimeError('Loader changed')
            for name in CHANGED + PRESERVED:
                expected = payload['files'][name]['sha256'] if name in CHANGED else payload['expected'][name]
                if file_hash(FUNCTIONS / name) != expected:
                    raise RuntimeError('Deployed or preserved source hash differs: ' + name)
            health = smoke()
            current_counts = json.loads(command(PSQL, source="SELECT json_build_object('total',count(*),'app',count(*) FILTER (WHERE source='app'),'review_fixture',count(*) FILTER (WHERE source='review_fixture')) FROM public.team_data_consents;").strip())
            versions = ','.join("'" + name.split('_')[0] + "'" for name in MIGRATIONS)
            registered = json.loads(command(PSQL, source=f"SELECT json_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations WHERE version IN ({versions});").strip())
            if registered != [name.split('_')[0] for name in MIGRATIONS]:
                raise RuntimeError('Migration registry differs from the applied release')
            report = {'deployed': True, 'release_id': payload['release_id'], 'database_committed': True,
                      'migrations': list(MIGRATIONS), 'changed_files': list(CHANGED),
                      'registered_versions': registered,
                      'consents_before': {'table_existed': False, 'total': 0, 'app': 0, 'review_fixture': 0},
                      'consents_after_migrations': transaction_counts,
                      'consents_after_health': current_counts,
                      'preserved_dependencies': len(PRESERVED), 'health': health,
                      'runtime_preserved': True, 'loader_preserved': True,
                      'notifications_sent': False, 'invites_created': False}
            (release / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
            save_state(release, 'completed', database_committed=True)
            return report
        except BaseException:
            # A blind pg_restore would destroy live writes; reversing privacy
            # restrictions or old edge code could re-enable processing without consent.
            save_state(release, 'needs-forward-repair', database_committed=True,
                       automatic_database_restore=False, automatic_edge_rollback=False)
            raise


def remote(action, payload):
    source = Path(__file__).read_text()
    result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', HOST,
                             'python3 -c ' + shlex.quote(source) + ' --remote ' + action],
                            input=json.dumps(payload), text=True, capture_output=True, timeout=900)
    if result.returncode:
        # Remote wrapper returns only a sanitized diagnostic, never subprocess logs/env.
        raise RuntimeError(result.stderr.strip() or 'Remote deployment command failed')
    return json.loads(result.stdout)


def prepare(args):
    root = Path(__file__).resolve().parents[2]
    # macOS /tmp and /var are system aliases. Resolve the parent of a local
    # artifact, while keeping production target traversal strictly forbidden.
    args.output = args.output.parent.resolve() / args.output.name
    if args.output.exists() or args.output.is_symlink():
        raise ValueError('Output artifact already exists; choose a fresh path')
    baseline_entries = json.loads(args.baseline.read_text())
    if len(baseline_entries) != len(CHANGED + PRESERVED):
        raise ValueError('Baseline must contain exactly nineteen unique files')
    expected = {row['file']: row['remote'] for row in baseline_entries}
    if set(expected) != set(CHANGED + PRESERVED):
        raise ValueError('Baseline contains an unexpected or duplicate file')
    for name in PRESERVED:
        if file_hash(root / 'supabase/functions' / name) != expected[name]:
            raise ValueError('Preserved local dependency differs from production: ' + name)
    payload = {'format': 1, 'release_id': validate_release(args.release_id), 'expected': expected,
               'source_commit': command(['git', '-C', str(root), 'rev-parse', 'HEAD']).strip(),
               'created_at': dt.datetime.now(dt.timezone.utc).isoformat()}
    for group, folder, names in [('files', 'supabase/functions', CHANGED),
                                  ('migrations', 'supabase/migrations', MIGRATIONS)]:
        payload[group] = {}
        for name in names:
            content = (root / folder / name).read_text()
            payload[group][name] = {'source': content, 'sha256': sha(content.encode())}
    validate_payload(payload)
    outcome = remote('prepare', payload)
    payload.update(outcome)
    args.output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with args.output.open('x') as output:
        json.dump(payload, output, indent=2)
        output.write('\n')
    args.output.chmod(0o600)
    print(json.dumps({'prepared': str(args.output), 'artifact_sha256': file_hash(args.output),
                      'release_id': payload['release_id'], **payload['preflight']}, indent=2))


def main():
    os.umask(0o077)
    if len(sys.argv) > 1 and sys.argv[1] == '--remote':
        print(json.dumps(remote_main(sys.argv[2], json.load(sys.stdin))))
        return 0
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest='action', required=True)
    prepare_parser = actions.add_parser('prepare')
    prepare_parser.add_argument('--release-id', required=True)
    prepare_parser.add_argument('--baseline', type=Path, required=True)
    prepare_parser.add_argument('--output', type=Path, required=True)
    apply_parser = actions.add_parser('apply')
    apply_parser.add_argument('--artifact', type=Path, required=True)
    apply_parser.add_argument('--sha256', required=True, help='Exact hash printed by prepare')
    args = parser.parse_args()
    if args.action == 'prepare':
        prepare(args)
    else:
        args.artifact = args.artifact.parent.resolve() / args.artifact.name
        if file_hash(args.artifact) != args.sha256:
            raise ValueError('Prepared artifact hash differs')
        payload = json.loads(args.artifact.read_text())
        validate_payload(payload)
        if 'baseline' not in payload or payload.get('preflight', {}).get('transaction') != 'ROLLBACK':
            raise ValueError('Artifact has no successful frozen preflight')
        print(json.dumps(remote('apply', payload), indent=2))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, RuntimeError, OSError, KeyError, subprocess.SubprocessError) as error:
        # Known errors contain metadata only. Never dump subprocess objects or payloads.
        print(f'Consent deployment stopped: {error}', file=sys.stderr)
        sys.exit(1)
