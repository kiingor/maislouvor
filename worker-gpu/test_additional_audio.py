"""Offline regression tests: no Supabase, yt-dlp, Torch or credentials required."""
import importlib.util
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch, MagicMock


with patch.dict(os.environ, {"SUPABASE_URL": "https://test.invalid", "SERVICE_KEY": "test-only"}), \
        patch.dict(sys.modules, {"requests": types.ModuleType("requests")}):
    spec = importlib.util.spec_from_file_location("audio_worker", Path(__file__).with_name("worker.py"))
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)


class AdditionalAudioTests(unittest.TestCase):
    def setUp(self):
        self.job = {"id": "job", "attachment_id": "attachment", "song_id": "song",
                    "team_id": "team", "url": "https://www.youtube.com/watch?v=abcdefghijk"}
        self.mocks = {}
        for name in ("select", "patch", "rpc", "storage_upload", "storage_copy", "storage_remove", "upsert_ignore", "log"):
            patcher = patch.object(worker, name)
            self.mocks[name] = patcher.start()
            self.addCleanup(patcher.stop)
        self.mocks["rpc"].return_value = True
        self.mocks["select"].side_effect = lambda table, params: [{"id": "attachment"}] if table == "song_audio_attachments" else []
        self.runner = patch.object(worker.subprocess, "run", side_effect=self.download).start()
        self.addCleanup(patch.stopall)

    @staticmethod
    def download(cmd, **kwargs):
        template = cmd[cmd.index("-o") + 1]
        Path(template.replace("%(ext)s", "mp3")).write_bytes(b"fake audio")
        Path(template.replace("%(ext)s", "jpg")).write_bytes(b"fake cover")
        return types.SimpleNamespace(returncode=0, stderr="", stdout="")

    def assert_main_untouched(self):
        self.assertFalse(any(call.args[0] in ("songs", "song_tracks", "yt_import_jobs") for call in self.mocks["patch"].call_args_list))
        for call in self.mocks["storage_upload"].call_args_list:
            self.assertNotIn(call.args[0], ("team/song.mp3", "team/song.jpg"))

    def test_download_only_completes_the_attachment(self):
        worker.process_yt(self.job)
        self.mocks["rpc"].assert_called_once_with("complete_song_audio_import", {
            "p_id": "attachment", "p_path": "team/song/additional/attachment.mp3"})
        self.mocks["storage_upload"].assert_any_call("team/song/additional/attachment.mp3", b"fake audio")
        self.assert_main_untouched()

    def test_cached_audio_copies_to_its_own_path(self):
        self.mocks["select"].side_effect = lambda table, params: [{"storage_path": "_ytcache/abcdefghijk.mp3"}] if table == "yt_audio_cache" else [{"id": "attachment"}]
        worker.process_yt(self.job)
        self.runner.assert_not_called()
        self.mocks["storage_copy"].assert_called_once_with("_ytcache/abcdefghijk.mp3", "team/song/additional/attachment.mp3")
        self.assert_main_untouched()

    def test_stale_cache_falls_back_to_download(self):
        self.mocks["select"].side_effect = lambda table, params: [{"storage_path": "_ytcache/missing.mp3"}] if table == "yt_audio_cache" else [{"id": "attachment"}]
        self.mocks["storage_copy"].side_effect = RuntimeError("missing")
        worker.process_yt(self.job)
        self.runner.assert_called_once()
        self.mocks["rpc"].assert_called_once()
        self.assert_main_untouched()

    def test_failed_download_marks_only_the_attachment(self):
        self.runner.return_value = types.SimpleNamespace(returncode=1, stderr="sign in to confirm", stdout="")
        self.runner.side_effect = None
        worker.process_yt(self.job)
        args = self.mocks["patch"].call_args.args
        self.assertEqual(args[0], "song_audio_attachments")
        self.assertEqual(args[2]["status"], "error")
        self.assertIn("COOKIE_EXPIRED", args[2]["error"])
        self.assert_main_untouched()

    def test_deletion_during_download_cleans_the_new_file(self):
        self.mocks["rpc"].return_value = False
        worker.process_yt(self.job)
        self.mocks["storage_remove"].assert_called_once_with("team/song/additional/attachment.mp3")
        self.assert_main_untouched()

    def test_deleted_job_is_not_downloaded(self):
        self.mocks["select"].return_value = []
        self.mocks["select"].side_effect = None
        worker.process_yt(self.job)
        self.runner.assert_not_called()
        self.mocks["storage_upload"].assert_not_called()

    def test_original_queue_still_updates_main_audio_and_cover(self):
        del self.job["attachment_id"]
        worker.process_yt(self.job)
        self.mocks["patch"].assert_any_call("songs", {"id": "eq.song"}, {"audio_path": "team/song.mp3"})
        self.mocks["patch"].assert_any_call("songs", {"id": "eq.song"}, {"cover_path": "team/song.jpg"})
        self.mocks["patch"].assert_any_call("yt_import_jobs", {"id": "eq.job"}, {"status": "done"})
        self.mocks["rpc"].assert_not_called()


if __name__ == "__main__":
    unittest.main()
