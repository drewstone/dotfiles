#!/usr/bin/env python3
"""Opt-in read-only integration: real org search, trusted comments and cached tick."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def run_owner_live_proof():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix='mog-owner-live-') as scratch:
        state = Path(scratch)
        command = [sys.executable, str(root / 'claude/tools/merge-on-green'), '--owner-only',
                   '--owner-org', 'tangle-network', '--owner-org', 'drewstone', '--dry-run', '--state-dir', scratch]
        first = subprocess.run(command, capture_output=True, text=True, check=True)
        report = json.loads((state / 'ownership.json').read_text())
        cold = json.loads((state / 'ticks.jsonl').read_text().splitlines()[-1])
        # Independent CLI query at the exact same birthday boundary: a truncated or
        # accidentally base-filtered sweep must not pass on its own count.
        expected, expected_archived = set(), set()
        for org in report['orgs']:
            search = subprocess.run(['gh-drew', 'api', '--method', 'GET', 'search/issues', '--paginate',
                                     '-f', f'q=is:pr is:open user:{org} created:<={report["cutoff"]}',
                                     '-f', 'per_page=100', '--jq', '.items[].html_url'],
                                    capture_output=True, text=True, check=True)
            expected.update(search.stdout.splitlines())
            archived = subprocess.run(['gh-drew', 'api', '--method', 'GET', 'search/issues', '--paginate',
                                       '-f', f'q=is:pr is:open user:{org} created:<={report["cutoff"]} archived:true',
                                       '-f', 'per_page=100', '--jq', '.items[].html_url'],
                                      capture_output=True, text=True, check=True)
            expected_archived.update(archived.stdout.splitlines())
        actual = {row['url'] for row in report['prs']}
        assert actual == expected, f'Live PR set moved or sweep differs: {actual ^ expected}'
        assert report['aged'] == len(actual) == report['owned'] + len(report['unassigned'])
        assert report['aged'] == report['actionable'] + len(report['archived'])
        assert all(not row['archived'] for row in report['ownerless'])
        assert {row['url'] for row in report['archived']} == expected_archived
        assert cold['github_calls'] >= 2 and cold['decisions'] == []
        # Validate assignment provenance against the real comment endpoint, rather
        # than only accepting the sweep's parsed fields.
        owned = [row for row in report['prs'] if row['assignment']]
        assert owned, 'Need at least one live trusted assignment to qualify parser'
        for row in owned[:3]:
            assignment = row['assignment']
            comment_id = assignment['comment'].rsplit('-', 1)[1]
            result = subprocess.run(['gh-drew', 'api', f'repos/{row["repo"]}/issues/comments/{comment_id}'],
                                    capture_output=True, text=True, check=True)
            comment = json.loads(result.stdout)
            assert comment['author_association'] in {'OWNER', 'MEMBER', 'COLLABORATOR'}
            text = re.sub(r'[*`]', '', comment['body'])
            assert assignment['owner'] in text and assignment['next'] in text
        subprocess.run(command, capture_output=True, text=True, check=True)
        warm = json.loads((state / 'ticks.jsonl').read_text().splitlines()[-1])
        assert warm['github_calls'] == 0 and warm['decisions'] == []
        assert json.loads((state / 'ownership.json').read_text()) == report
        assert not (state / 'ownership-notice.json').exists(), 'dry-run sent an inbox notice'
        assert not (state / 'security-updates.json').exists(), 'owner-only touched security settings'
        result = {'at': report['at'], 'aged': report['aged'], 'owned': report['owned'],
                  'ownerless': len(report['ownerless']), 'cold_github_calls': cold['github_calls'],
                  'archived': len(report['archived']), 'strict_unassigned': len(report['unassigned']),
                  'warm_github_calls': warm['github_calls'], 'independent_search_matches': True,
                  'independent_archived_membership_matches': True,
                  'live_assignment_provenance_checks': min(3, len(owned)), 'merge_decisions': 0,
                  'dry_run_no_notice': True, 'owner_only_no_security_updates': True}
        Path(args.output).write_text(json.dumps(result, indent=2) + '\n')
        print(first.stdout, end='')
        print(json.dumps(result))


if __name__ == '__main__':
    run_owner_live_proof()
