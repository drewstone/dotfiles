"""Regression for review statuses shared by two PRs on one commit."""

import os
import tempfile
import unittest
from unittest.mock import patch

os.environ.setdefault('GITHUB_REPOSITORY', 'drewstone/dotfiles')
os.environ.setdefault('GH_TOKEN', 'unused-test-token')

import merge_gate


class MergeGateTest(unittest.TestCase):
    def test_one_p1_blocks_every_pr_on_the_shared_head(self):
        head = 'a' * 40
        repo = merge_gate.REPO
        prs = [
            {'number': number, 'state': 'open', 'base': {'ref': 'main'}, 'head': {
                'sha': head, 'repo': {'full_name': repo}}}
            for number in (1, 2)
        ]
        prs.append({'number': 3, 'state': 'open', 'base': {'ref': 'main'}, 'head': {
            'sha': 'b' * 40, 'repo': {'full_name': 'someone/dotfiles'}}})
        statuses = []
        with patch.dict(os.environ, {'GITHUB_EVENT_NAME': 'schedule'}), \
                patch.object(merge_gate, 'pages', return_value=iter(prs)), \
                patch.object(merge_gate, 'current_pr', side_effect=lambda number: prs[number - 1]), \
                patch.object(merge_gate, 'scan_threads', side_effect=lambda number, _: int(number == 1)), \
                patch.object(merge_gate, 'status', side_effect=lambda *args: statuses.append(args)):
            self.assertEqual(merge_gate.p1_gate(), 0)
        self.assertEqual([(sha, state) for sha, _, state, _ in statuses], [
            (head, 'pending'), (head, 'failure'),
        ])
        statuses.clear()
        with tempfile.TemporaryDirectory() as directory, \
                patch.dict(os.environ, {'GITHUB_EVENT_NAME': 'schedule',
                                        'GITHUB_OUTPUT': f'{directory}/output'}), \
                patch.object(merge_gate, 'pages', return_value=iter(prs)), \
                patch.object(merge_gate, 'status', side_effect=lambda *args: statuses.append(args)):
            merge_gate.select_ci()
            with open(f'{directory}/output', encoding='utf-8') as output:
                self.assertEqual(output.read().strip(), 'matrix={"include":[]}\ncount=0')
        self.assertEqual([(sha, state) for sha, _, state, _ in statuses], [
            (head, 'failure'),
        ])


if __name__ == '__main__':
    unittest.main()
