#!/usr/bin/env python3
"""Opt-in read-only proof: historical full payload, current decisions, real cache/backoff."""
import argparse
import ast
import datetime as dt
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace


def baseline_query(root, ref):
    source = subprocess.run(['git', 'show', ref + ':claude/tools/merge-on-green'],
                            cwd=root, capture_output=True, text=True, check=True).stdout
    for statement in ast.parse(source).body:
        if (isinstance(statement, ast.Assign)
                and any(isinstance(target, ast.Name) and target.id == 'QUERY'
                        for target in statement.targets)):
            query = ast.literal_eval(statement.value)
            if isinstance(query, str):
                return query
    raise ValueError('baseline must contain a literal full-list QUERY')


def read_queue(client, query, *, page=None):
    args = ['api', 'graphql', '-f', 'query=' + query,
            '-f', 'owner=tangle-network', '-f', 'name=agent-container']
    # The historical full query fixes develop in its text. Current queries
    # declare base/ref and the typed page, exactly as the production tick does.
    if '$base' in query:
        args += ['-f', 'base=develop', '-f', 'ref=refs/heads/develop']
    if '$page' in query:
        if page is None:
            raise ValueError('current full-list query requires its typed page')
        args += ['-F', f'page={page}']
    result = client.run(*args, via='gh-read')
    if result.returncode:
        raise RuntimeError('live queue read failed: ' + result.stderr.strip())
    answer = json.loads(result.stdout)
    if answer.get('errors'):
        raise RuntimeError('live queue read returned GraphQL errors')
    return answer['data']['repository']['pullRequests']['nodes']


def eligible(pr, owner):
    return not (pr['isDraft'] or pr['headRefName'].startswith(owner['RELEASE_PREFIXES'])
                or owner['hold_reason'](pr))


def guard_read(reader, answer, root):
    result = subprocess.run([sys.executable, '-I', '-c', reader,
                             str(root / 'claude/tools/merge-on-green')],
                            input=json.dumps(answer), capture_output=True, text=True, check=True)
    return result.stdout


def current_queue(client, owner):
    owner['queue_page'].__globals__['CLIENT'] = client
    args = SimpleNamespace(repo=client.repo, base='develop', probe=False)
    page = owner['queue_page'](args, 'tangle-network', 'agent-container')
    return read_queue(client, owner['QUERY'], page=page)


def prove_live():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-ref', required=True,
                        help='pre-cache revision with the full literal QUERY, e.g. 1434764d5aeaa6c899044638b76ca38c0cfe152c')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    # Resolve nested wrappers beside the candidate, including their captured
    # real-CLI transport; installed tools must not qualify different source.
    os.environ['PATH'] = str(root / 'claude/tools') + os.pathsep + os.environ['PATH']
    owner = runpy.run_path(str(root / 'claude/tools/merge-on-green'))
    module = owner['_github']
    fragment = owner['REVIEW_FRAGMENT']
    reader = (root / 'claude/tools/gh-drew-review.sh').read_text().split("<<'PY'", 1)[1].split('\n', 1)[1].split('\nPY', 1)[0]
    now = dt.datetime.now(dt.timezone.utc)
    with tempfile.TemporaryDirectory(prefix='mog-live-') as scratch:
        state = Path(scratch)
        baseline = module.GitHub(state, 'tangle-network/agent-container')
        prs = read_queue(baseline, baseline_query(root, args.baseline_ref))
        before = {pr['number']: owner['decide'](pr, now) for pr in prs}
        # Compare the current guard on independent live reads, including PRs
        # whose checks wait. Do not execute historical merge-policy code.
        old_answers = {pr['number']: baseline.reviews(pr, fragment)
                       for pr in prs if eligible(pr, owner)}
        assert old_answers, 'need a live unheld PR to qualify the review guard'
        cold = module.GitHub(state / 'current', baseline.repo)
        cold.root.mkdir()
        compact = current_queue(cold, owner)
        assert {pr['number'] for pr in compact} == set(before), 'open set moved during comparison'
        after, guards = {}, {}
        for pr in compact:
            if eligible(pr, owner):
                answer = cold.reviews(pr, fragment)
                pr['reviewThreads'] = answer['data']['repository']['pullRequest']['reviewThreads']
                guards[pr['number']] = guard_read(reader, answer, root) == guard_read(reader, old_answers[pr['number']], root)
            after[pr['number']] = owner['decide'](pr, now)
        assert before == after, 'live decisions differ between full and compact payloads'
        assert guards and all(guards.values()), 'live review guard changed during comparison'
        warm = module.GitHub(cold.root, cold.repo)
        warm_prs = current_queue(warm, owner)
        warm_decisions, warm_guards = {}, {}
        for pr in warm_prs:
            if eligible(pr, owner):
                answer = warm.reviews(pr, fragment)
                pr['reviewThreads'] = answer['data']['repository']['pullRequest']['reviewThreads']
                warm_guards[pr['number']] = guard_read(reader, answer, root) == guard_read(reader, old_answers[pr['number']], root)
            warm_decisions[pr['number']] = owner['decide'](pr, now)
        assert before == warm_decisions, 'live PR set or decisions moved during warm read'
        assert warm_guards and all(warm_guards.values()), 'live warm review guard changed'
        assert warm.hits == len(old_answers) and warm.misses == 0, 'live review fingerprints changed; retry proof'
        # Exercise the actual CLI, persisted state and real clock. No HTTP cost
        # is fabricated, and --dry-run prevents merges/comments/settings writes.
        backoff = state / 'backoff'
        backoff.mkdir()
        module.save(backoff / 'github-backoff.json',
                    {'until': time.time() + 2, 'attempt': 1, 'pr': None,
                     'reason': 'live proof of persisted backoff'})
        command = [sys.executable, str(root / 'claude/tools/merge-on-green'), '--probe',
                   '--dry-run', '--state-dir', str(backoff)]
        subprocess.run(command, check=True, capture_output=True, text=True)
        held = json.loads((backoff / 'ticks.jsonl').read_text().splitlines()[-1])
        assert held['github_calls'] == 0 and held['deferred']
        time.sleep(2)
        subprocess.run(command, check=True, capture_output=True, text=True)
        resumed = json.loads((backoff / 'ticks.jsonl').read_text().splitlines()[-1])
        assert resumed['github_calls'] > 0 and not resumed['deferred']
        assert not (backoff / 'github-backoff.json').exists()
        result = {'at': now.isoformat(), 'baseline_ref': args.baseline_ref,
                  'decision_policy': 'current owner on both live payloads',
                  'open_prs': len(prs), 'decisions_unchanged': len(before),
                  'baseline_live_calls': baseline.calls, 'new_cold_calls': cold.calls,
                  'new_warm_calls': warm.calls, 'cache_hits': warm.hits, 'cache_misses': warm.misses,
                  'merge_guard_comparisons': len(guards), 'warm_guard_comparisons': len(warm_guards),
                  'backoff_zero_calls_then_resumed': True,
                  'resumed_graphql_cost': resumed['graphql_cost'],
                  'resumed_cost_complete': resumed['cost_complete'],
                  'mutations_attempted': False, 'raw_api_payloads_retained': False}
    Path(args.output).write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    prove_live()
