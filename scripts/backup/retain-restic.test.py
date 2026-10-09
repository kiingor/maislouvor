import datetime as dt
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location('retain_restic', Path(__file__).with_name('retain-restic.py'))
retention = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(retention)


class RetentionTests(unittest.TestCase):
    now = dt.datetime(2026, 10, 9, 12, tzinfo=dt.timezone.utc)

    def snapshot(self, days, identifier='a', **changes):
        snapshot = {'id': identifier * 64, 'time': (self.now - dt.timedelta(days=days)).isoformat(),
                    'tags': [retention.TAG], 'paths': sorted(retention.PATHS)}
        snapshot.update(changes)
        return snapshot

    def test_exact_thirty_day_boundary_relative_to_real_clock(self):
        snapshots = [self.snapshot(30), self.snapshot(29.999, 'b')]
        self.assertEqual(retention.select_expired(snapshots, self.now), ['a' * 64])

    def test_newest_snapshot_not_used_as_clock_anchor(self):
        snapshots = [self.snapshot(32), self.snapshot(7, 'b')]
        self.assertEqual(retention.select_expired(snapshots, self.now), ['a' * 64])

    def test_last_recovery_copy_preserved_on_backup_failure(self):
        with self.assertRaisesRegex(ValueError, 'All snapshots are expired'):
            retention.select_expired([self.snapshot(40)], self.now)

    def test_invalid_or_foreign_metadata_fails_closed(self):
        invalid = [{'id': 'not-an-id'}, {'tags': ['another-app']}, {'paths': ['/elsewhere']},
                   {'time': '2026-10-10T12:00:00+00:00'}, {'time': '2026-10-08T12:00:00'}]
        for changes in invalid:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                retention.select_expired([self.snapshot(1, **changes)], self.now)

    def test_healthy_repository_has_no_expirations(self):
        self.assertEqual(retention.select_expired([self.snapshot(0), self.snapshot(1, 'b')], self.now), [])

    def test_empty_repository_fails(self):
        with self.assertRaises(ValueError):
            retention.select_expired([], self.now)


if __name__ == '__main__':
    unittest.main()
