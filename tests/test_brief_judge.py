"""The report skill's brief-judge writes its scores through the installed climb-log (tangle-tools climb-log/)."""
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

TOOL = shutil.which('climb-log')
assert TOOL, 'climb-log is not installed: run tangle-tools-deploy install'
SKILL = Path(__file__).resolve().parent.parent / 'claude' / 'skills' / 'report' / 'scripts' / 'brief-judge'


def measurement(**overrides):
    block = {
        'metric': 'turn stream events p50', 'unit': 'events', 'basis': 'measured',
        'selection': 'every turn stream on b81b whose request started in the window',
        'selectBy': 'start', 'n': 212,
        'window': {'from': '2026-10-10T21:00:00Z', 'to': '2026-10-10T23:00:00Z'},
        'codeVersion': 'gtm-agent@db179c57', 'deployedAt': '2026-10-10T20:41:00Z',
    }
    block.update(overrides)
    return {k: v for k, v in block.items() if v is not None}


def comparison(**result_overrides):
    """A code change measured before and after: the shape of the coalescing row."""
    return {
        'id': 'coalesce-events-20261010', 'project': 'gtm-agent', 'layer': 'product', 'hill': 'turn-event-coalescing',
        'category': 'code', 'lever': 'agent-app#946 coalesced turn events', 'prediction': 'p50 events per stream < 2,000',
        'outcome': 'PENDING', 'timestamp': '2026-10-11T00:10:00Z',
        'baseline': {'value': 32401, 'measurement': measurement(
            codeVersion='gtm-agent@9c6b7a92', deployedAt='2026-10-10T17:02:00Z',
            window={'from': '2026-10-10T18:00:00Z', 'to': '2026-10-10T20:00:00Z'})},
        'result': {'value': 1904, 'measurement': measurement(**result_overrides)},
    }


def baseline_row(**block_overrides):
    block = measurement(metric='failure detection lag p95', unit='min', instrument='GET /api/admin/reliability',
                        calibration={'verdict': 'PASS', 'check': 'tests/reliability-lag.test.ts',
                                     'against': 'the 09:13Z request and its 19:43Z notice, read from D1'})
    block.update(block_overrides)
    return {
        'id': 'baseline-failure-detection-lag-20261011', 'project': 'gtm-agent', 'layer': 'system',
        'hill': 'failure-detection-lag', 'category': 'criteria', 'lever': 'baseline', 'prediction': 'p95 <= 15 min',
        'outcome': 'PENDING', 'timestamp': '2026-10-11T00:20:00Z',
        'baseline': {'value': 630, 'measurement': {k: v for k, v in block.items() if v is not None}}, 'result': None,
    }


class Ledger(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / 'widget'
        (self.root / '.agent').mkdir(parents=True)
        self.ledger = self.root / '.agent' / 'climb.jsonl'

    def tearDown(self):
        self.tmp.cleanup()

    def git_env(self):
        # The host's Git configuration stays out of the fixture: its global config, the system config, and
        # $XDG_CONFIG_HOME/git/attributes, which git/install.sh links to the global attributes file and Git
        # reads even when no config names it. The fixture's own gitconfig starts empty.
        config = Path(self.tmp.name) / 'gitconfig'
        config.touch()
        return {**os.environ, 'GIT_CEILING_DIRECTORIES': self.tmp.name, 'GIT_CONFIG_GLOBAL': str(config),
                'GIT_CONFIG_NOSYSTEM': '1', 'XDG_CONFIG_HOME': str(Path(self.tmp.name) / 'xdg')}

    def run_tool(self, *args, stdin=None):
        return subprocess.run([str(TOOL), *args], input=stdin, capture_output=True, text=True, cwd=self.root,
                              env=self.git_env())

    def append(self, row):
        return self.run_tool('append', '--project', str(self.root), stdin=json.dumps(row))

    def assertRefused(self, row, *phrases):
        before = self.ledger.read_text() if self.ledger.exists() else ''
        r = self.append(row)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        for phrase in phrases:
            self.assertIn(phrase, r.stderr)
        self.assertEqual(self.ledger.read_text() if self.ledger.exists() else '', before, 'a refused row is not written')
        return r.stderr

    def assertAccepted(self, row):
        r = self.append(row)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout.strip()



class BriefJudge(Ledger):
    def load(self):
        import importlib.machinery
        import importlib.util
        path = SKILL
        loader = importlib.machinery.SourceFileLoader('brief_judge', str(path))
        spec = importlib.util.spec_from_loader('brief_judge', loader)
        module = importlib.util.module_from_spec(spec)
        loader.exec_module(module)
        return module

    def test_scores_reach_the_ledger_through_the_checked_append(self):
        bj = self.load()
        judge = {'requested': 'opus', 'served': ['claude-opus-5-5'], 'via': 'claude-cli', 'account': None, 'seconds': 12.5}
        rows = [{'key': 'answer', 'name': 'Answer', 'score': 2, 'fix': 'lead with the number'}]
        first = bj.append_ledger(self.ledger, self.root, '/tmp/brief.html', 'ab' * 32, 22, rows, rows, judge, None)
        second = bj.append_ledger(self.ledger, self.root, '/tmp/brief.html', 'cd' * 32, 25, rows, rows, judge, 22)
        written = [json.loads(line) for line in self.ledger.read_text().splitlines()]
        self.assertEqual([r['id'] for r in written], [first['id'], second['id']])
        self.assertEqual(written[0]['baseline']['measurement']['calibration']['verdict'], 'UNCALIBRATED')
        self.assertEqual((written[1]['outcome'], bj.last_score(self.ledger)), ('PASS 25/30', 25))
        self.assertEqual(self.run_tool('check', '--project', str(self.root), '--since', '2000-01-01').returncode, 0)

    def test_level_three_is_read_from_the_climb_rubric(self):
        bj = self.load()
        anchors = bj.load_anchors()
        self.assertEqual(sorted(anchors), sorted(key for key, *_ in bj.DIMENSIONS))
        for key, text in anchors.items():
            self.assertNotRegex(text, r'\]\(|\]\[|`', f'{key} keeps Markdown link syntax')
        self.assertIn('Feynman', anchors['refutation'])
        prompt = bj.build_prompt('Status: all good.', '[page structure] markdown', None, anchors)
        for text in anchors.values():
            self.assertIn(text, prompt)
        self.assertNotIn(' 3: ', ' '.join(levels for *_, levels in bj.DIMENSIONS))

    def test_a_rubric_missing_a_level_three_line_stops_the_judge(self):
        bj = self.load()
        text = bj.RUBRIC.read_text()
        start = text.index('\n   **3:**', text.index('**Shape:**'))
        rubric = self.root / 'climb.md'
        rubric.write_text(text[:start] + text[text.index('\n', start + 1):])
        with self.assertRaisesRegex(ValueError, r"no '3:' line for Shape$"):
            bj.load_anchors(rubric)


if __name__ == '__main__':
    unittest.main()
