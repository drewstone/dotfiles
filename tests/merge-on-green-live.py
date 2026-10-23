#!/usr/bin/env python3
"""Opt-in read-only proof: historical full payload, current decisions, real cache/backoff."""
import argparse
import ast
import datetime as dt
import hashlib
import json
import os
import re
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


def guard_read(reader, answer, root, pending_observations):
    result = subprocess.run([sys.executable, '-I', '-c', reader,
                             str(root / 'claude/tools/merge-on-green')],
                            input=json.dumps(answer), capture_output=True, text=True, check=True)
    # The real reader owns its clock. Exclude only its validated dynamic line;
    # every other byte (including findings, running reviews and holds) is exact.
    stable_lines = []
    for line in result.stdout.splitlines(keepends=True):
        if line.startswith('pending'):
            match = re.fullmatch(r'pending\t([0-9]+)\t([0-9]+)\n', line)
            assert match, 'unexpected pending guard format'
            left, since = map(int, match.groups())
            assert left > 0 and since >= 0, 'invalid pending countdown'
            pending_observations['lines'] += 1
        else:
            stable_lines.append(line)
    return ''.join(stable_lines)


def current_queue(client, owner):
    owner['queue_page'].__globals__['CLIENT'] = client
    args = SimpleNamespace(repo=client.repo, base='develop', probe=False)
    page = owner['queue_page'](args, 'tangle-network', 'agent-container')
    return read_queue(client, owner['QUERY'], page=page)


def input_snapshot(pr):
    return {'head': pr['headRefOid'], 'mergeable': pr['mergeable'],
            'sha256': hashlib.sha256(json.dumps(pr, sort_keys=True).encode()).hexdigest()}


def private_decisions(decisions):
    # A hold reason can quote a PR body. Retain its identity, never that text.
    return {number: {'action': action,
                     'reason_sha256': hashlib.sha256(reason.encode()).hexdigest()}
            for number, (action, reason) in decisions.items()}


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
    result = {'at': now.isoformat(), 'baseline_ref': args.baseline_ref, 'qualified': False}
    pending_observations = {'lines': 0}
    result['time_policy_comparison'] = 'validated pending countdown excluded; real clock policy not qualified'

    def record(stage, **values):
        result.update(stage=stage, pending_countdown_observations=pending_observations['lines'], **values)
        Path(args.output).write_text(json.dumps(result, indent=2) + '\n')

    with tempfile.TemporaryDirectory(prefix='mog-live-') as scratch:
        state = Path(scratch)
        baseline = module.GitHub(state, 'tangle-network/agent-container')
        prs = read_queue(baseline, baseline_query(root, args.baseline_ref))
        before = {pr['number']: owner['decide'](pr, now) for pr in prs}
        record('baseline', baseline_inputs={pr['number']: input_snapshot(pr) for pr in prs})
        # Compare the current guard on independent live reads, including PRs
        # whose checks wait. Do not execute historical merge-policy code.
        old_answers = {pr['number']: baseline.reviews(pr, fragment)
                       for pr in prs if eligible(pr, owner)}
        assert old_answers, 'need a live unheld PR to qualify the review guard'
        cold = module.GitHub(state / 'current', baseline.repo)
        cold.root.mkdir()
        compact = current_queue(cold, owner)
        record('cold-list', baseline_inputs={pr['number']: input_snapshot(pr) for pr in prs},
               cold_list_inputs={pr['number']: input_snapshot(pr) for pr in compact},
               cold_added=sorted({pr['number'] for pr in compact} - set(before)),
               cold_removed=sorted(set(before) - {pr['number'] for pr in compact}))
        assert {pr['number'] for pr in compact} == set(before), 'open set moved; see safe diagnostics'
        after, guards, cold_guard_output, review_versions = {}, {}, {}, {}
        for pr in compact:
            if eligible(pr, owner):
                review_versions[pr['number']] = module.fingerprint(pr)
                answer = cold.reviews(pr, fragment)
                pr['reviewThreads'] = answer['data']['repository']['pullRequest']['reviewThreads']
                cold_guard_output[pr['number']] = guard_read(reader, answer, root, pending_observations)
                guards[pr['number']] = cold_guard_output[pr['number']] == guard_read(reader, old_answers[pr['number']], root, pending_observations)
            after[pr['number']] = owner['decide'](pr, now)
        cold_inputs = {pr['number']: input_snapshot(pr) for pr in compact}
        baseline_inputs = {pr['number']: input_snapshot(pr) for pr in prs}
        # GitHub can finish mergeability computation between reads of one head.
        # Exclude only observed head/mergeability movement; every other cold
        # decision difference remains an error. Guards depend on the head,
        # not mergeability: same-head guards remain strict even when it moves.
        cold_moved = {n for n in before
                      if any(baseline_inputs[n][key] != cold_inputs[n][key]
                             for key in ('head', 'mergeable'))}
        cold_stable = set(before) - cold_moved
        cold_same_head = {n for n in before if baseline_inputs[n]['head'] == cold_inputs[n]['head']}
        cold_stable_guards = set(guards) & cold_same_head
        record('cold-comparison', cold_inputs=cold_inputs,
               baseline_decisions=private_decisions(before), cold_decisions=private_decisions(after),
               cold_input_movement={n: {'before': baseline_inputs[n], 'after': cold_inputs[n]}
                                    for n in sorted(cold_moved)},
               cold_compared_numbers=sorted(cold_stable), cold_compared_guard_numbers=sorted(cold_stable_guards),
               cold_guard_head_exclusions=sorted(set(guards) - cold_same_head),
               cold_decision_changes=sorted(n for n in cold_stable if before[n] != after[n]),
               cold_guard_changes=sorted(n for n in cold_stable_guards if not guards[n]))
        assert cold_stable_guards, 'no stable eligible cold guard; see safe diagnostics'
        assert all(before[n] == after[n] for n in cold_stable), 'stable full/compact decisions differ; see safe diagnostics'
        assert all(guards[n] for n in cold_stable_guards), 'stable live review guard changed'
        warm = module.GitHub(cold.root, cold.repo)
        warm_prs = current_queue(warm, owner)
        warm_decisions, warm_guards, warm_inputs = {}, {}, {}
        expected_hits, expected_misses, changed_review_versions = [], [], []
        for pr in warm_prs:
            number = pr['number']
            if eligible(pr, owner):
                version = module.fingerprint(pr)
                same_review = review_versions.get(number) == version
                (expected_hits if same_review else expected_misses).append(number)
                if number in review_versions and not same_review:
                    changed_review_versions.append(number)
                answer = warm.reviews(pr, fragment)
                pr['reviewThreads'] = answer['data']['repository']['pullRequest']['reviewThreads']
                if same_review:
                    warm_guards[number] = guard_read(reader, answer, root, pending_observations) == cold_guard_output[number]
            warm_inputs[number] = input_snapshot(pr)
            warm_decisions[number] = owner['decide'](pr, now)
        common = set(cold_inputs) & set(warm_inputs)
        stable = {number for number in common if cold_inputs[number] == warm_inputs[number]}
        # Queue changes affect decision comparisons, but do not excuse a
        # review guard mismatch at the same head and review fingerprint.
        same_head = {n for n in common if cold_inputs[n]['head'] == warm_inputs[n]['head']}
        stable_guards = same_head & set(warm_guards)
        decision_changes = sorted(n for n in stable if after[n] != warm_decisions[n])
        record('warm-comparison', warm_inputs=warm_inputs, warm_decisions=private_decisions(warm_decisions),
               warm_added=sorted(set(warm_inputs) - set(cold_inputs)),
               warm_removed=sorted(set(cold_inputs) - set(warm_inputs)),
               warm_input_changed=sorted(common - stable), warm_stable=sorted(stable),
               stable_decision_changes=decision_changes, stable_guard_numbers=sorted(stable_guards),
               warm_guard_head_exclusions=sorted((set(expected_hits + expected_misses) & common) - same_head),
               warm_guard_fingerprint_exclusions=sorted(expected_misses),
               changed_review_fingerprints=sorted(changed_review_versions),
               expected_cache_hits=sorted(expected_hits), expected_cache_misses=sorted(expected_misses),
               cache_hits=warm.hits, cache_misses=warm.misses,
               stable_guard_changes=sorted(n for n in stable_guards if not warm_guards[n]))
        assert stable_guards, 'no stable eligible guard/cache input; see safe diagnostics'
        assert not decision_changes, 'same current input changed decision; see safe diagnostics'
        assert all(warm_guards[n] for n in stable_guards), 'stable live review guard changed'
        assert warm.hits == len(expected_hits) and warm.misses == len(expected_misses), 'cache invalidation differs from actual review fingerprints'
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
        record('backoff-held', held_calls=held['github_calls'], held_deferred=bool(held['deferred']))
        assert held['github_calls'] == 0 and held['deferred']
        time.sleep(2)
        subprocess.run(command, check=True, capture_output=True, text=True)
        resumed = json.loads((backoff / 'ticks.jsonl').read_text().splitlines()[-1])
        record('backoff-resumed', resumed_calls=resumed['github_calls'],
               resumed_deferred=bool(resumed['deferred']))
        assert resumed['github_calls'] > 0 and not resumed['deferred']
        assert not (backoff / 'github-backoff.json').exists()
        result.update({'qualified': True,
                  'decision_policy': 'current owner on both live payloads',
                  'open_prs': len(prs), 'cold_decisions_unchanged': len(cold_stable),
                  'baseline_live_calls': baseline.calls, 'new_cold_calls': cold.calls,
                  'new_warm_calls': warm.calls, 'cache_hits': warm.hits, 'cache_misses': warm.misses,
                  'merge_guard_comparisons': len(cold_stable_guards), 'warm_guard_comparisons': len(stable_guards),
                  'warm_stable_decisions': len(stable),
                  'backoff_zero_calls_then_resumed': True,
                  'resumed_graphql_cost': resumed['graphql_cost'],
                  'resumed_cost_complete': resumed['cost_complete'],
                  'mutations_attempted': False, 'raw_api_payloads_retained': False})
    record('complete')
    print(json.dumps(result))


if __name__ == '__main__':
    prove_live()
