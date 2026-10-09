"""Exercise deployment/rollback against isolated files, with no SSH or network."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
import subprocess
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('publish_web', Path(__file__).with_name('publish-integrated-web.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class PublicationSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='maislouvor-release-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.web = self.root / 'web'
        self.releases = self.root / 'releases'
        self.web.mkdir()
        self.releases.mkdir()
        for name in deploy.SHELL + ['landing-sw.js', 'LouvorMais.apk', 'assets/old-abc123.js']:
            path = self.web / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('previous-' + name)
        self.before = deploy.inventory(self.web)
        self.id = '20261009-web-test'
        self.release = self.releases / self.id
        self.release.mkdir()
        self.dist = self.root / 'dist'
        self.dist.mkdir()
        for name in deploy.SHELL + ['landing-sw.js', 'assets/new-abc123.js', 'push-sw.js']:
            path = self.dist / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(('previous-' if name == 'landing-sw.js' else 'new-') + name)
        self.files = deploy.inventory(self.dist)
        self.patches = [patch.object(deploy, 'WEB', self.web),
                        patch.object(deploy, 'RELEASES', self.releases),
                        patch.object(deploy, 'LOCK_PATH', self.root / 'deploy.lock'),
                        patch.object(deploy, 'snapshot', self.snapshot),
                        patch.object(deploy, 'fetch', self.fetch)]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)
        self.manifest = {'release_id': self.id, 'source_commit': 'a' * 40,
                         'build_mode': 'web-production', 'files': self.files,
                         'baseline': self.snapshot()}
        manifest_file = self.root / 'release.json'
        manifest_file.write_text(json.dumps(self.manifest))
        self.bundle = self.release / 'bundle.tar.gz'
        with tarfile.open(self.bundle, 'w:gz') as archive:
            archive.add(manifest_file, arcname='release.json')
            for name in self.files:
                archive.add(self.dist / name, arcname='dist/' + name)

    def snapshot(self):
        return {'web': deploy.inventory(self.web), 'protected': {'marketing': 'unchanged'},
                'marketing_https': {'/': 'unchanged'}}

    def fetch(self, route):
        path = self.web / ('index.html' if route in deploy.ROUTES else route.lstrip('/'))
        return {'status': 200, 'url': deploy.ORIGIN + route, 'sha256': deploy.digest(path)}

    def apply(self):
        with contextlib.redirect_stdout(io.StringIO()):
            deploy.remote_main('apply', self.id, deploy.digest(self.bundle))

    def rollback(self):
        with contextlib.redirect_stdout(io.StringIO()):
            deploy.remote_main('rollback', self.id)

    def assert_previous_intact(self):
        for name, sha in self.before.items():
            self.assertEqual(deploy.digest(self.web / name), sha, name)

    def test_success_retains_apk_and_old_assets_and_can_restore(self):
        self.apply()
        result = json.loads((self.release / 'result.json').read_text())
        self.assertTrue(result['published'])
        self.assertEqual(result['source_commit'], 'a' * 40)
        self.assertEqual(deploy.digest(self.web / 'LouvorMais.apk'), self.before['LouvorMais.apk'])
        self.assertTrue((self.web / 'assets/old-abc123.js').exists())
        self.rollback()
        self.assert_previous_intact()
        self.assertTrue((self.web / 'assets/new-abc123.js').exists())
        self.assertFalse((self.web / 'push-sw.js').exists())

    def test_changed_production_rejected_before_any_write(self):
        (self.web / 'index.html').write_text('another-release')
        state = deploy.inventory(self.web)
        with self.assertRaisesRegex(RuntimeError, 'Production changed'):
            self.apply()
        self.assertEqual(deploy.inventory(self.web), state)
        self.assertFalse((self.release / 'before').exists())

    def test_https_failure_restores_previous_release(self):
        original = self.fetch

        def broken_route(route):
            if route == '/login':
                return {'status': 200, 'sha256': hashlib.sha256(b'wrong-shell').hexdigest()}
            return original(route)

        with patch.object(deploy, 'fetch', broken_route):
            with self.assertRaisesRegex(RuntimeError, 'Application route differs'):
                self.apply()
        self.assert_previous_intact()
        self.assertTrue((self.release / 'automatic-rollback.json').exists())
        self.assertFalse((self.release / 'result.json').exists())

    def test_rollback_refuses_to_overwrite_subsequent_release(self):
        self.apply()
        (self.web / 'sw.js').write_text('later-release')
        state = deploy.inventory(self.web)
        with self.assertRaisesRegex(RuntimeError, 'Production changed after'):
            self.rollback()
        self.assertEqual(deploy.inventory(self.web), state)

    def test_tampered_bundle_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'hash mismatch'):
            deploy.remote_main('apply', self.id, '0' * 64)
        self.assert_previous_intact()

    def test_path_traversal_bundle_rejected(self):
        archive = self.root / 'unsafe.tar'
        with tarfile.open(archive, 'w') as bundle:
            member = tarfile.TarInfo('dist/../../outside')
            member.size = 4
            bundle.addfile(member, io.BytesIO(b'evil'))
        with self.assertRaisesRegex(ValueError, 'Invalid bundle'):
            deploy.extract_bundle(archive, self.root / 'payload')
        self.assertFalse((self.root / 'outside').exists())


class SourceIdentityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='maislouvor-source-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git('init', '-q')
        self.git('config', 'user.email', 'test@example.invalid')
        self.git('config', 'user.name', 'Release Test')
        (self.root / 'src').mkdir()
        (self.root / 'src/app.ts').write_text('approved app')
        self.commit('application')
        self.prepared = self.git('rev-parse', 'HEAD').strip()

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, text=True)

    def commit(self, message):
        self.git('add', '.')
        self.git('commit', '-qm', message)

    def test_identical_source_descendant_requires_explicit_option(self):
        (self.root / 'backend.sql').write_text('backend deployment')
        self.commit('backend')
        with self.assertRaisesRegex(RuntimeError, 'Expected commit'):
            deploy.check_source(self.root, self.prepared)
        self.assertEqual(deploy.check_source(self.root, self.prepared, True), self.git('rev-parse', 'HEAD').strip())

    def test_changed_frontend_descendant_is_rejected(self):
        (self.root / 'src/app.ts').write_text('different app')
        self.commit('frontend changed')
        with self.assertRaisesRegex(RuntimeError, 'identical application'):
            deploy.check_source(self.root, self.prepared, True)

    def test_uncommitted_frontend_is_rejected_after_backend_commit(self):
        (self.root / 'backend.sql').write_text('backend deployment')
        self.commit('backend')
        (self.root / 'src/app.ts').write_text('unreviewed change')
        with self.assertRaisesRegex(RuntimeError, 'Commit application/build source'):
            deploy.check_source(self.root, self.prepared, True)

    def test_non_descendant_with_same_frontend_is_rejected(self):
        self.git('checkout', '--orphan', 'unrelated')
        self.commit('unrelated history, same files')
        with self.assertRaisesRegex(RuntimeError, 'must descend'):
            deploy.check_source(self.root, self.prepared, True)


if __name__ == '__main__':
    unittest.main()
