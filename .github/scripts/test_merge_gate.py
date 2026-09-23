"""Regression for review statuses shared by two PRs on one commit."""

import os
import tempfile
import unittest
from unittest.mock import patch

os.environ.setdefault('GITHUB_REPOSITORY', 'drewstone/dotfiles')
os.environ.setdefault('GH_TOKEN', 'unused-test-token')

import merge_gate


class MergeGateTest(unittest.TestCase):
    def test_select_ci_uses_live_main_tip_when_pr_base_sha_is_stale(self):
        head, stale, live = ('a' * 40, 'b' * 40, 'c' * 40)
        pr = {'number': 139, 'state': 'open', 'base': {'ref': 'main', 'sha': stale},
              'head': {'sha': head, 'repo': {'full_name': merge_gate.REPO}}}
        statuses = []
        with tempfile.TemporaryDirectory() as directory, \
                patch.dict(os.environ, {'GITHUB_EVENT_NAME': 'workflow_dispatch',
                                        'GITHUB_OUTPUT': f'{directory}/output'}), \
                patch.object(merge_gate, 'pages', return_value=iter([pr])), \
                patch.object(merge_gate, 'current_pr', return_value=pr), \
                patch.object(merge_gate, 'main_sha', return_value=live), \
                patch.object(merge_gate, 'status', side_effect=lambda *args: statuses.append(args)):
            merge_gate.select_ci()
            with open(f'{directory}/output', encoding='utf-8') as output:
                self.assertIn(f'"base":"{live}"', output.read())
        self.assertEqual(statuses[0], (head, 'merge-gate/ci', 'pending', f'Queued base {live}'))

    def test_live_codex_badge_on_current_head_blocks(self):
        # PR #5156 had this badge on a current-head, unresolved Codex thread.
        head = 'b853006846d9e4755b2ccc238a1ead521e8bc7c7'
        comment = {
            'body': '<sub><sub>![P1 Badge](https://img.shields.io/badge/P1-orange?style=flat)</sub></sub>',
            'author': {'login': 'chatgpt-codex-connector'},
            'commit': {'oid': head},
        }
        thread = {
            'isResolved': False,
            'isOutdated': False,
            'comments': {'totalCount': 1, 'nodes': [comment]},
        }
        response = {'data': {'repository': {'pullRequest': {
            'headRefOid': head,
            'reviewThreads': {'nodes': [thread], 'pageInfo': {'hasNextPage': False}},
        }}}}
        with patch.object(merge_gate, 'request', return_value=response):
            self.assertEqual(merge_gate.scan_threads(5156, head), 1)
            thread['isOutdated'] = True
            self.assertEqual(merge_gate.scan_threads(5156, head), 0)
            thread['isOutdated'] = False
            comment['commit']['oid'] = 'c' * 40
            self.assertEqual(merge_gate.scan_threads(5156, head), 0)
            comment['commit']['oid'] = head
            comment['author']['login'] = 'someone-else'
            self.assertEqual(merge_gate.scan_threads(5156, head), 0)

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
                patch.object(merge_gate, 'latest_status', return_value={'target_url': 'current-run'}), \
                patch.object(merge_gate, 'run_url', return_value='current-run'), \
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
                patch.object(merge_gate, 'main_sha', return_value='c' * 40), \
                patch.object(merge_gate, 'status', side_effect=lambda *args: statuses.append(args)):
            merge_gate.select_ci()
            with open(f'{directory}/output', encoding='utf-8') as output:
                self.assertEqual(output.read().strip(), 'matrix={"include":[]}\ncount=0')
        self.assertEqual([(sha, state) for sha, _, state, _ in statuses], [
            (head, 'failure'),
        ])


if __name__ == '__main__':
    unittest.main()
