#!/usr/bin/env python3
"""Run both retention checks even when one fails, then surface any failure."""
import subprocess
import sys

COMMANDS = (
    ['/usr/local/sbin/maislouvor-restic-retention', '--apply'],
    ['/usr/bin/flock', '-n', '/run/lock/maislouvor-backup-retention.lock',
     '/usr/local/sbin/maislouvor-backup-retention', '--apply'],
)


def main() -> int:
    failed = False
    for command in COMMANDS:
        try:
            failed = subprocess.run(command, check=False).returncode != 0 or failed
        except OSError:
            failed = True
            print('Retention step unavailable; inspect the installed scripts.', file=sys.stderr)
    return int(failed)


if __name__ == '__main__':
    sys.exit(main())
