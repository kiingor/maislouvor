#!/usr/bin/env python3
"""Age-based retention of the managed MaisLouvor restic repo; dry-run by default."""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import json
import os
import re
import subprocess
import sys

TAG = 'maislouvor-daily'
DAYS = 30
REPOSITORY = '/var/backups/maislouvor-managed/restic'
PASSWORD_FILE = '/etc/maislouvor-backup/password'
LOCK = '/run/lock/maislouvor-backup.lock'
PATHS = {'/var/lib/maislouvor-backup', '/opt/supabase/volumes/storage',
         '/opt/supabase/volumes/functions'}


def select_expired(snapshots: list[dict], now: dt.datetime) -> list[str]:
    if not snapshots:
        raise ValueError('Managed repository has no snapshots')
    expired = []
    for snapshot in snapshots:
        snapshot_id = snapshot.get('id', '')
        if not re.fullmatch(r'[0-9a-f]{64}', snapshot_id):
            raise ValueError('Unexpected snapshot identifier')
        if TAG not in snapshot.get('tags', []) or set(snapshot.get('paths', [])) != PATHS:
            raise ValueError('Unexpected snapshot scope')
        timestamp = dt.datetime.fromisoformat(snapshot['time'].replace('Z', '+00:00'))
        if timestamp.tzinfo is None or timestamp > now:
            raise ValueError('Unexpected snapshot timestamp')
        if now - timestamp >= dt.timedelta(days=DAYS):
            expired.append(snapshot_id)
    if len(expired) == len(snapshots):
        # Fail visibly instead of silently destroying the only recovery data.
        # Operators must repair the daily backup and resolve the retention incident.
        raise ValueError('All snapshots are expired; repair backup before pruning the final recovery copy')
    return expired


def restic(*arguments: str) -> str:
    env = os.environ.copy()
    env.update(RESTIC_REPOSITORY=REPOSITORY, RESTIC_PASSWORD_FILE=PASSWORD_FILE,
               GOMEMLIMIT='512MiB')
    return subprocess.run(['restic', *arguments], env=env, capture_output=True,
                          check=True, text=True).stdout


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error('Requires root to access the encrypted repository')
    with open(LOCK, 'a', encoding='utf-8') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Retention postponed: backup repository is in use.', file=sys.stderr)
            return 75
        now = dt.datetime.now(dt.timezone.utc)
        snapshots = json.loads(restic('snapshots', '--tag', TAG, '--json'))
        expired = select_expired(snapshots, now)
        if args.apply and expired:
            restic('forget', '--prune', *expired)
            restic('check')
        print(json.dumps({'repository': REPOSITORY, 'date_utc': now.isoformat(),
                          'retention_days': DAYS, 'mode': 'apply' if args.apply else 'dry-run',
                          'snapshots': len(snapshots), 'expired_snapshots': len(expired),
                          'removed_snapshots': len(expired) if args.apply else 0}, sort_keys=True))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except ValueError as error:
        print(f'Retention aborted: {error}', file=sys.stderr)
        sys.exit(1)
    except (OSError, KeyError, TypeError, subprocess.SubprocessError):
        print('Retention aborted: validate restic metadata, access and repository integrity.', file=sys.stderr)
        sys.exit(1)
