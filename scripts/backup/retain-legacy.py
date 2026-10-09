#!/usr/bin/env python3
"""Expire dated MaisLouvor rollback copies; no path arguments and dry-run by default."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys

ROOTS = (Path('/var/backups/maislouvor'), Path('/var/lib/maislouvor-deploy'))
DAYS = 30
# Dates belong to the copy, unlike mtimes preserved from its source files.
NAMES = (
    re.compile(r'^(?P<date>20\d{6})-[a-z0-9][a-z0-9._-]*$'),
    re.compile(r'^(?:site|source|release|apk|smtp)-(?P<date>20\d{6})T\d{6}Z(?:\.json|\.tar\.gz)?$'),
)
IGNORED = {'landing.lock'}


def copy_date(name: str) -> dt.date | None:
    for pattern in NAMES:
        match = pattern.fullmatch(name)
        if match:
            try:
                return dt.datetime.strptime(match['date'], '%Y%m%d').date()
            except ValueError:
                return None
    return None


def inside(path: Path, parent: Path) -> bool:
    return path == parent or parent in path.parents


def protected_paths() -> set[Path]:
    """Mount sources and live process references, without logging their contents."""
    protected: set[Path] = set()
    docker_ids = subprocess.run(['docker', 'ps', '-aq'], check=True, capture_output=True,
                                text=True).stdout.split()
    if docker_ids:
        mounts = subprocess.run(['docker', 'inspect', '--format', '{{json .Mounts}}',
                                 *docker_ids], check=True, capture_output=True, text=True)
        for line in mounts.stdout.splitlines():
            for mount in json.loads(line):
                if mount.get('Source'):
                    protected.add(Path(mount['Source']).resolve())
    for process in Path('/proc').glob('[0-9]*'):
        try:
            links = [process / 'cwd', process / 'root', *list((process / 'fd').iterdir())]
        except (FileNotFoundError, ProcessLookupError):
            continue
        for link in links:
            try:
                target = os.readlink(link)
            except (FileNotFoundError, ProcessLookupError, OSError):
                continue
            if target.startswith('/'):
                protected.add(Path(target).resolve())
    return protected


def unsafe_reason(path: Path, protected: set[Path]) -> str | None:
    if path.is_symlink():
        return 'symlink'
    if any(inside(active, path) for active in protected):
        return 'active-reference'
    for current, directories, files in os.walk(path, followlinks=False):
        for item in [Path(current), *(Path(current) / name for name in directories + files)]:
            if item.is_symlink():
                return 'nested-symlink'
            if os.path.ismount(item):
                return 'mount-point'
    if os.path.ismount(path):
        return 'mount-point'
    return None


def retain_root(root: Path, today: dt.date, *, apply: bool = False,
                protected: set[Path] | None = None) -> list[dict]:
    if not root.exists() and not root.is_symlink():
        return [{'root': str(root), 'status': 'absent'}]
    if root.is_symlink() or root.resolve() != root:
        raise ValueError('Backup root must be a real directory without symlink ancestors')
    root_stat = root.stat()
    if not stat.S_ISDIR(root_stat.st_mode) or root_stat.st_mode & 0o022:
        raise ValueError('Backup root must be a directory not writable by group/others')
    results = []
    for path in sorted(root.iterdir()):
        row = {'root': str(root), 'name': path.name}
        date = copy_date(path.name)
        if path.name in IGNORED:
            row['status'] = 'ignored-control-file'
        elif date is None:
            row['status'] = 'unrecognized-name'
        elif date > today:
            row['status'] = 'future-date'
        elif (today - date).days < DAYS:
            row.update(status='retained', age_days=(today - date).days)
        else:
            before = path.lstat()
            if not (stat.S_ISREG(before.st_mode) or stat.S_ISDIR(before.st_mode)):
                reason = 'unsupported-type'
            else:
                reason = unsafe_reason(path, protected or set())
            if reason:
                row.update(status='blocked', reason=reason)
            elif not apply:
                row.update(status='would-delete', age_days=(today - date).days)
            else:
                # Refuse a renamed/replaced root or candidate between inspection and deletion.
                current_root = root.stat()
                current = path.lstat()
                if (current_root.st_dev, current_root.st_ino) != (root_stat.st_dev, root_stat.st_ino):
                    raise RuntimeError('Backup root changed during retention')
                if (current.st_dev, current.st_ino, current.st_mode) != (before.st_dev, before.st_ino, before.st_mode):
                    raise RuntimeError('Backup candidate changed during retention')
                if path.is_dir():
                    if not shutil.rmtree.avoids_symlink_attacks:
                        raise RuntimeError('Safe recursive deletion unavailable on this platform')
                    shutil.rmtree(path)
                else:
                    path.unlink()
                row.update(status='deleted', age_days=(today - date).days)
        results.append(row)
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Delete expired copies in the two fixed roots')
    args = parser.parse_args()
    if args.apply and os.geteuid() != 0:
        parser.error('--apply requires root')
    # UTC date, evaluated independently from successful creation of a new backup.
    today = dt.datetime.now(dt.timezone.utc).date()
    if args.apply and any(root.exists() and root.stat().st_uid != 0 for root in ROOTS):
        raise RuntimeError('Production roots must be owned by root')
    protected = protected_paths()
    rows = [row for root in ROOTS for row in retain_root(root, today, apply=args.apply, protected=protected)]
    for row in rows:
        print(json.dumps(row, sort_keys=True))
    counts = {status: sum(row['status'] == status for row in rows)
              for status in sorted({row['status'] for row in rows})}
    print(json.dumps({'date_utc': today.isoformat(), 'retention_days': DAYS,
                      'mode': 'apply' if args.apply else 'dry-run', 'summary': counts}, sort_keys=True))
    return int(any(row['status'] in {'blocked', 'unrecognized-name', 'future-date'} for row in rows))


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError):
        # subprocess stderr/cmd may contain sensitive paths; journal only a generic failure.
        print('Retention aborted: validate filesystem, permissions and Docker availability.', file=sys.stderr)
        sys.exit(1)
