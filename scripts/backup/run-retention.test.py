import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location('run_retention', Path(__file__).with_name('run-retention.py'))
retention = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(retention)


class RunnerTests(unittest.TestCase):
    def test_second_step_runs_when_first_step_fails(self):
        with mock.patch.object(retention.subprocess, 'run', side_effect=[
                SimpleNamespace(returncode=1), SimpleNamespace(returncode=0)]) as run:
            self.assertEqual(retention.main(), 1)
            self.assertEqual(run.call_count, 2)

    def test_success_requires_both_steps_to_succeed(self):
        for statuses, expected in [([0, 0], 0), ([0, 75], 1)]:
            with mock.patch.object(retention.subprocess, 'run', side_effect=[
                    SimpleNamespace(returncode=status) for status in statuses]):
                self.assertEqual(retention.main(), expected)


if __name__ == '__main__':
    unittest.main()
