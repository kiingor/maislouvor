import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location('consent_deploy', Path(__file__).with_name('publish-consent-backend.py'))
deploy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deploy)


def payload():
    def entry(source):
        return {'source': source, 'sha256': deploy.sha(source.encode())}
    return {'format': 1, 'release_id': '20261009-consent-backend',
            'expected': {name: 'a' * 64 for name in deploy.CHANGED + deploy.PRESERVED},
            'files': {name: entry('// ' + name) for name in deploy.CHANGED},
            'migrations': {name: entry('-- ' + name) for name in deploy.MIGRATIONS}}


class DeploymentTests(unittest.TestCase):
    def test_scope_is_exact_and_validates(self):
        deploy.validate_payload(payload())
        self.assertEqual(len(deploy.CHANGED), 8)
        self.assertEqual(len(deploy.PRESERVED), 11)

    def test_source_tampering_fails(self):
        data = payload()
        data['files'][deploy.CHANGED[0]]['source'] = 'changed after preparation'
        with self.assertRaisesRegex(ValueError, 'digest mismatch'):
            deploy.validate_payload(data)

    def test_unknown_files_and_missing_dependencies_fail(self):
        for group in ['files', 'expected']:
            data = payload()
            data[group]['../../.env'] = next(iter(data[group].values()))
            with self.assertRaises(ValueError):
                deploy.validate_payload(data)

    def test_migration_order_cannot_change(self):
        data = payload()
        data['migrations'] = dict(reversed(list(data['migrations'].items())))
        with self.assertRaisesRegex(ValueError, 'migration order'):
            deploy.validate_payload(data)

    def test_prepare_ends_in_rollback_and_apply_in_commit(self):
        dry = deploy.transaction(payload(), commit=False)
        live = deploy.transaction(payload(), commit=True)
        self.assertTrue(dry.startswith('BEGIN;'))
        self.assertTrue(dry.endswith('ROLLBACK;\n'))
        self.assertNotIn('COMMIT;', dry)
        self.assertTrue(live.endswith('COMMIT;\n'))
        self.assertEqual(live.count('COMMIT;'), 1)
        self.assertIn('ON_ERROR_STOP=1', deploy.PSQL)

    def test_release_id_is_dated_and_cannot_escape_directory(self):
        for invalid in ['../20261009-consent-backend', '20261301-consent-backend',
                        'consent-backend', '20261009-something-else']:
            with self.assertRaises(ValueError):
                deploy.validate_release(invalid)

    def test_runtime_fingerprint_does_not_return_env(self):
        value = deploy.runtime_identity({'Image': 'image', 'Config': {
            'Env': ['TEST_SECRET=never-print-this'], 'Cmd': ['start']}, 'Mounts': []})
        self.assertNotIn('never-print-this', json.dumps(value))
        self.assertEqual(len(value['environment_sha256']), 64)

    def test_atomic_source_preserves_other_file_and_refuses_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            target = root / 'index.ts'
            neighbor = root / 'dependency.ts'
            target.write_text('old')
            neighbor.write_text('preserve')
            deploy.atomic_source(target, 'new')
            self.assertEqual(target.read_text(), 'new')
            self.assertEqual(neighbor.read_text(), 'preserve')
            target.unlink()
            target.symlink_to(neighbor)
            with self.assertRaises(RuntimeError):
                deploy.atomic_source(target, 'unsafe')
            self.assertEqual(neighbor.read_text(), 'preserve')

    def test_docker_mount_order_is_not_runtime_drift(self):
        data = {'Image': 'image', 'Config': {'Env': [], 'Cmd': ['start']},
                'Mounts': [{'Source': '/a', 'Destination': '/x'}, {'Source': '/b', 'Destination': '/y'}]}
        before = deploy.runtime_identity(data)
        data['Mounts'].reverse()
        self.assertEqual(before, deploy.runtime_identity(data))

    def test_commands_capture_output_and_emit_only_safe_failure(self):
        result = mock.Mock(returncode=1, stdout='secret output', stderr='secret error')
        with mock.patch.object(deploy.subprocess, 'run', return_value=result), self.assertRaises(RuntimeError) as caught:
            deploy.command(['test-command'])
        self.assertNotIn('secret', str(caught.exception))


if __name__ == '__main__':
    unittest.main()
