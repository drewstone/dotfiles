"""skill-run-log writes one row per run with an id the outcome joiner can link to."""
import json
import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

TOOL = Path(__file__).resolve().parent.parent / 'claude' / 'tools' / 'skill-run-log'
ID = re.compile(r'^sr-\d{8}T\d{6}Z-[0-9a-f]{8}$')


def run(cwd, state, *args, env=None):
    environment = {k: v for k, v in os.environ.items()
                   if k not in ('CLAUDE_CODE_SESSION_ID', 'CODEX_SESSION_ID', 'CODEX_COMPANION_SESSION_ID')}
    environment.update({'XDG_STATE_HOME': state, **(env or {})})
    return subprocess.run([str(TOOL), *args], cwd=cwd, env=environment, capture_output=True, text=True, check=True)


def rows(state):
    return [json.loads(line) for path in Path(state).glob('agent-work/*/skill-runs.jsonl')
            for line in path.read_text().splitlines()]


class SkillRunLogTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = os.path.join(self.tmp.name, 'state')
        self.repo = os.path.join(self.tmp.name, 'widget')
        os.makedirs(self.repo)
        subprocess.run(['git', 'init', '-q', '-b', 'feat/x', self.repo], check=True)
        # Plumbing builds the fixture commit: the machine's global commit hooks guard real commits, not fixtures.
        identity = {**os.environ, 'GIT_AUTHOR_NAME': 't', 'GIT_AUTHOR_EMAIL': 't@example.com',
                    'GIT_COMMITTER_NAME': 't', 'GIT_COMMITTER_EMAIL': 't@example.com'}
        tree = subprocess.run(['git', '-C', self.repo, 'write-tree'], capture_output=True, text=True,
                              check=True).stdout.strip()
        self.head = subprocess.run(['git', '-C', self.repo, 'commit-tree', tree, '-m', 'init'], capture_output=True,
                                   text=True, check=True, env=identity).stdout.strip()
        subprocess.run(['git', '-C', self.repo, 'update-ref', 'refs/heads/feat/x', self.head], check=True)

    def tearDown(self):
        self.tmp.cleanup()

    def test_row_carries_a_printed_id_and_link_fields(self):
        done = run(self.repo, self.state, '/ship', '--target', 'widget #12', '--verdict', 'PASS',
                   '--pr', 'https://github.com/o/widget/pull/12', env={'CLAUDE_CODE_SESSION_ID': 'sess-1'})
        [row] = rows(self.state)
        self.assertRegex(row['id'], ID)
        self.assertIn(row['id'], done.stdout)
        self.assertEqual(row['pr'], 'https://github.com/o/widget/pull/12')
        self.assertEqual(row['sessionId'], 'sess-1')
        self.assertEqual(row['branch'], 'feat/x')
        self.assertEqual(row['headSha'], self.head)
        self.assertEqual(os.path.realpath(row['cwd']), os.path.realpath(self.repo))
        self.assertTrue(row['machine'])
        self.assertEqual(row['skill'], '/ship')

    def test_each_row_gets_its_own_id(self):
        for _ in range(3):
            run(self.repo, self.state, '/verify')
        ids = [row['id'] for row in rows(self.state)]
        self.assertEqual(len(set(ids)), 3)

    def test_unavailable_links_are_null_outside_git(self):
        outside = os.path.join(self.tmp.name, 'plain')
        os.makedirs(outside)
        run(outside, self.state, '/report', env={'GIT_CEILING_DIRECTORIES': self.tmp.name})
        [row] = rows(self.state)
        self.assertRegex(row['id'], ID)
        for field in ('pr', 'sessionId', 'branch', 'headSha'):
            self.assertIsNone(row[field], field)


if __name__ == '__main__':
    unittest.main()
