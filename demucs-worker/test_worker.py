"""Isolated worker tests: no credentials, network, model downloads or real audio."""
import importlib.util
import os
import pathlib
import sys
import types
import unittest
from unittest.mock import patch

sys.modules.setdefault('requests', types.ModuleType('requests'))
target = pathlib.Path(os.environ.get('STEMS_TEST_WORKER_PATH', pathlib.Path(__file__).with_name('worker.py')))
spec = importlib.util.spec_from_file_location('pull_worker', target)
worker = importlib.util.module_from_spec(spec)
with patch.dict(os.environ, {'SUPABASE_URL': 'https://fixture.invalid', 'SERVICE_KEY': 'fixture-key', 'WORKER_NAME': 'fixture-worker'}, clear=True), patch.object(pathlib.Path, 'exists', return_value=False):
    spec.loader.exec_module(worker)

class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.uploads = []
        self.context = {'allowed': True, 'song_id': 'song', 'team_id': 'team', 'audio_path': 'team/song.mp3'}
        self.rpc_patch = patch.object(worker, 'rpc', side_effect=self.rpc).start()
        patch.object(worker, 'select', return_value=[]).start()
        patch.object(worker, 'storage_download', side_effect=lambda path, dest: pathlib.Path(dest).write_bytes(b'audio fixture')).start()
        patch.object(worker, 'separate_file', side_effect=self.separate).start()
        patch.object(worker, 'storage_upload', side_effect=self.upload).start()
        patch.object(worker, 'upsert_ignore').start()
        for fn in ['patch', 'insert', 'delete', 'storage_copy', 'storage_remove']:
            patch.object(worker, fn, side_effect=AssertionError('Direct mutation forbidden: '+fn)).start()
        self.addCleanup(patch.stopall)
    def rpc(self, fn, payload):
        self.calls.append((fn,payload))
        if fn == 'stem_job_context': return dict(self.context)
        if fn == 'finish_stem_job': return {'applied': True}
        return None
    def separate(self, infile, outdir):
        outdir.mkdir(); (outdir/'vocals.mp3').write_bytes(b'vocals'); (outdir/'bass.mp3').write_bytes(b'bass')
    def upload(self,path,data): self.uploads.append(path)
    def commits(self): return [p for fn,p in self.calls if fn=='finish_stem_job']
    def test_stages_all_files_then_commits_once(self):
        worker.process({'id':'job'})
        tracks=self.commits()[0]['p_tracks']; self.assertEqual(len(tracks),2)
        self.assertTrue(all(t['audio_path'].startswith('team/song/stems/job/') for t in tracks))
        self.assertEqual(len({t['audio_path'].split('/')[4] for t in tracks}),1)
    def test_failed_upload_never_replaces_metadata(self):
        worker.storage_upload.side_effect=RuntimeError('fixture failure')
        worker.process({'id':'job'}); self.assertEqual([p['p_tracks'] for p in self.commits()],[None])
    def test_stale_before_work_never_downloads(self):
        self.context['allowed']=False; worker.process({'id':'job'})
        worker.storage_download.assert_not_called(); worker.separate_file.assert_not_called()
    def test_source_changed_during_demucs_never_uploads(self):
        def separate(infile,outdir): self.separate(infile,outdir); self.context['allowed']=False
        worker.separate_file.side_effect=separate; worker.process({'id':'job'}); self.assertEqual(self.uploads,[])
    def test_final_rejection_never_caches_stale_result(self):
        def rpc(fn,p):
            r=self.rpc(fn,p); return {'applied':False} if fn=='finish_stem_job' else r
        self.rpc_patch.side_effect=rpc; worker.process({'id':'job'})
        worker.upsert_ignore.assert_not_called(); self.assertFalse(any(p.startswith('_stemcache/') for p in self.uploads))
    def test_ambiguous_commit_preserves_staged_files(self):
        def rpc(fn,p):
            if fn=='finish_stem_job' and p['p_tracks'] is not None:
                self.calls.append((fn,p)); raise TimeoutError('ambiguous commit')
            return self.rpc(fn,p)
        self.rpc_patch.side_effect=rpc; worker.process({'id':'job'})
        self.assertEqual(len(self.uploads),2); worker.storage_remove.assert_not_called()
    def test_cache_miss_download_failure_keeps_old_tracks(self):
        worker.select.return_value=[{'stems':[{'key':'vocals'}]}]
        worker.storage_download.side_effect=RuntimeError('fixture download failure')
        worker.process({'id':'job'}); self.assertEqual(self.uploads,[]); self.assertIsNone(self.commits()[0]['p_tracks'])
    def test_cached_files_use_same_atomic_finalize(self):
        worker.select.return_value=[{'stems':[{'key':'vocals'},{'key':'bass'},{'key':'../../other'}]}]
        worker.process({'id':'job'}); worker.separate_file.assert_not_called()
        self.assertEqual(len(self.commits()[0]['p_tracks']),2)
    def test_claim_uses_versioned_rpc(self):
        worker.claim(90); self.assertEqual(self.calls[-1][0],'claim_stem_job_v2')

if __name__ == '__main__': unittest.main()
