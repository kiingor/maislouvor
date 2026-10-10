import hashlib
import unittest
from unittest.mock import Mock
from consolidate import consolidate, cleanup


class ConsolidationTests(unittest.TestCase):
    def setUp(self):
        self.candidate = {'kind': 'song', 'entity_id': 'song', 'song_id': 'song', 'path': 'team/song.mp3',
                          'revision': 'revision', 'object_version': 'version'}
        self.data = b'original audio'
        self.sha = hashlib.sha256(self.data).hexdigest()
        self.client = Mock()
        self.client.rpc.return_value = True

    def test_dry_run_never_writes(self):
        self.client.download.side_effect = [(self.data, 'audio/mpeg'), (None, None)]
        r = consolidate(self.client, [self.candidate])
        self.assertEqual(r['would_relink'], 1)
        self.client.upload_once.assert_not_called()
        self.client.rpc.assert_not_called()

    def test_hashes_actual_bytes_uploads_without_overwrite_and_fences_commit(self):
        self.client.download.side_effect = [(self.data, 'audio/mpeg'), (None, None), (self.data, 'audio/mpeg')]
        r = consolidate(self.client, [self.candidate], True)
        self.assertEqual(r['relinked'], 1)
        self.client.upload_once.assert_called_once_with('_audio/' + self.sha, self.data, 'audio/mpeg')
        name, args = self.client.rpc.call_args.args
        self.assertEqual(name, 'commit_audio_dedup')
        self.assertEqual(args['p_sha256'], self.sha)
        self.assertEqual(args['p_object_version'], 'version')
        self.assertEqual(args['p_expected_revision'], 'revision')

    def test_existing_matching_content_never_uploaded_again(self):
        self.client.download.side_effect = [(self.data, 'audio/mpeg'), (self.data, 'audio/mpeg'), (self.data, 'audio/mpeg')]
        r = consolidate(self.client, [self.candidate, {**self.candidate, 'song_id': 'other-team-song'}], True)
        self.assertEqual(r['relinked'], 2)
        self.assertEqual(r['reused'], 2)
        self.client.upload_once.assert_not_called()

    def test_corrupted_shared_file_cannot_be_attached(self):
        self.client.download.side_effect = [(self.data, 'audio/mpeg'), (b'wrong same len', 'audio/mpeg')]
        self.assertEqual(consolidate(self.client, [self.candidate], True)['failed'], 1)
        self.client.rpc.assert_not_called()
        self.client.upload_once.assert_not_called()

    def test_racing_upload_verified_after_conflict(self):
        self.client.download.side_effect = [(self.data, 'audio/mpeg'), (None, None), (self.data, 'audio/mpeg')]
        self.client.upload_once.side_effect = RuntimeError('Conflict')
        self.assertEqual(consolidate(self.client, [self.candidate], True)['relinked'], 1)

    def test_failed_upload_is_not_committed(self):
        self.client.download.side_effect = [(self.data, 'audio/mpeg'), (None, None), (None, None)]
        self.client.upload_once.side_effect = RuntimeError('Offline')
        self.assertEqual(consolidate(self.client, [self.candidate], True)['failed'], 1)
        self.client.rpc.assert_not_called()

    def test_stale_commit_preserves_all_files(self):
        self.client.download.side_effect = [(self.data, 'audio/mpeg'), (self.data, 'audio/mpeg')]
        self.client.rpc.return_value = False
        self.assertEqual(consolidate(self.client, [self.candidate], True)['stale'], 1)
        self.client.remove.assert_not_called()

    def test_cleanup_requires_fresh_eligibility(self):
        old = {'path': 'team/song.mp3', 'object_version': 'v1'}
        self.client.rpc.side_effect = [[old], []]
        self.assertEqual(cleanup(self.client, 25, True)['removed_old_files'], 0)
        self.client.remove.assert_not_called()

    def test_cleanup_never_removes_shared_asset(self):
        old = {'path': '_audio/' + self.sha, 'object_version': 'v1'}
        self.client.rpc.return_value = [old]
        with self.assertRaises(RuntimeError):
            cleanup(self.client, 25, True)
        self.client.remove.assert_not_called()

    def test_cleanup_dry_run_and_only_exact_old_path(self):
        old = {'path': 'team/song.mp3', 'object_version': 'v1'}
        self.client.rpc.return_value = [old]
        self.assertEqual(cleanup(self.client, 25)['eligible_old_files'], 1)
        self.client.remove.assert_not_called()
        self.assertEqual(cleanup(self.client, 25, True)['removed_old_files'], 1)
        self.client.remove.assert_called_once_with(old['path'])


if __name__ == '__main__':
    unittest.main()
