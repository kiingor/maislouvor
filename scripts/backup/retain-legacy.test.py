import datetime as dt
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location('retain_legacy', Path(__file__).with_name('retain-legacy.py'))
retention = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(retention)


class RetentionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve() / 'backups'
        self.root.mkdir(mode=0o700)
        self.today = dt.date(2026, 10, 9)

    def tearDown(self):
        self.tmp.cleanup()

    def run_retention(self, **kwargs):
        return retention.retain_root(self.root, self.today, **kwargs)

    def test_recognizes_all_current_backup_name_forms(self):
        for name in ['20260926-additional-audio', '20260930-landing-root.tar.gz',
                     'site-20260916T012948Z', 'source-20260921T232401Z.tar.gz',
                     'release-20260921T232401Z.json', 'apk-20260923T004641Z',
                     'smtp-20261008T235750Z']:
            with self.subTest(name=name):
                self.assertIsNotNone(retention.copy_date(name))
        for name in ['landing.lock', '20261399-invalid', 'db.sql', '../20260901-a',
                     'otherapp-20260921T232401Z', '20260901-']:
            self.assertIsNone(retention.copy_date(name))

    def test_dates_come_from_copy_names_not_preserved_mtimes(self):
        path = self.root / 'site-20260916T012948Z'
        path.mkdir()
        os.utime(path, (0, 0))
        self.assertEqual(self.run_retention(apply=True)[0]['status'], 'retained')
        self.assertTrue(path.exists())

    def test_dry_run_and_exact_thirty_day_boundary(self):
        expired = self.root / '20260909-old'
        expired.mkdir()
        (expired / 'database.dump').write_text('synthetic fixture')
        (self.root / '20260910-new').mkdir()
        statuses = {r['name']: r['status'] for r in self.run_retention()}
        self.assertEqual(statuses, {'20260909-old': 'would-delete', '20260910-new': 'retained'})
        self.assertTrue(expired.exists())
        self.run_retention(apply=True)
        self.assertFalse(expired.exists())
        self.assertTrue((self.root / '20260910-new').exists())

    def test_expired_regular_file_removed(self):
        path = self.root / 'release-20260901T120000Z.json'
        path.write_text('{}')
        self.assertEqual(self.run_retention(apply=True)[0]['status'], 'deleted')
        self.assertFalse(path.exists())

    def test_unknown_invalid_future_and_control_files_preserved(self):
        for name in ['database.dump', '20261301-invalid', '20261101-future', 'landing.lock']:
            (self.root / name).touch()
        self.assertEqual({r['status'] for r in self.run_retention(apply=True)},
                         {'unrecognized-name', 'future-date', 'ignored-control-file'})
        self.assertEqual(len(list(self.root.iterdir())), 4)

    def test_top_level_symlink_preserves_external_data(self):
        outside = Path(self.tmp.name).resolve() / 'outside'
        outside.mkdir()
        (outside / 'important.txt').write_text('keep')
        (self.root / '20260901-link').symlink_to(outside)
        self.assertEqual(self.run_retention(apply=True)[0]['status'], 'blocked')
        self.assertTrue((outside / 'important.txt').exists())

    def test_nested_symlink_blocks_whole_copy(self):
        path = self.root / '20260901-old'
        path.mkdir()
        (path / 'link').symlink_to('/nonexistent')
        self.assertEqual(self.run_retention(apply=True)[0]['reason'], 'nested-symlink')
        self.assertTrue(path.exists())

    def test_live_reference_blocks_whole_copy(self):
        path = self.root / '20260901-old'
        path.mkdir()
        self.assertEqual(self.run_retention(apply=True, protected={path / 'database.dump'})[0]['reason'],
                         'active-reference')
        self.assertTrue(path.exists())

    def test_mount_point_blocks_whole_copy(self):
        path = self.root / '20260901-old'
        path.mkdir()
        with mock.patch.object(retention.os.path, 'ismount', return_value=True):
            self.assertEqual(self.run_retention(apply=True)[0]['reason'], 'mount-point')
        self.assertTrue(path.exists())

    def test_writable_or_symlink_root_refused(self):
        self.root.chmod(0o777)
        with self.assertRaises(ValueError):
            self.run_retention(apply=True)
        self.root.chmod(0o700)
        link = Path(self.tmp.name).resolve() / 'link'
        link.symlink_to(self.root)
        with self.assertRaises(ValueError):
            retention.retain_root(link, self.today, apply=True)


if __name__ == '__main__':
    unittest.main()
