#!/usr/bin/env python3
"""GitHub transport, review cache and tick accounting for merge-on-green."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time


class RateLimited(Exception):
    pass


def save(path, value):
    path = Path(path)
    tmp = path.with_suffix('.tmp')
    with os.fdopen(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as f:
        json.dump(value, f)
    tmp.replace(path)


def fingerprint(pr):
    # Include resolution, original findings, reply counts and summary edit times:
    # a latest timestamp alone misses reopened threads and older summary edits.
    fields = [pr.get(k) for k in ('headRefOid', 'updatedAt', 'reviewThreads', 'comments', 'reviews')]
    return hashlib.sha256(json.dumps(fields, sort_keys=True).encode()).hexdigest()


class GitHub:
    def __init__(self, state_dir, repo):
        self.root = Path(state_dir)
        self.repo = repo
        self.calls = 0
        self.quota_probes = 0
        self.graphql_cost = 0
        self.graphql_cost_samples = 0
        self.quota = {}
        self.hits = self.misses = 0
        self.pr = None
        self.decisions = []
        self.backoff_path = self.root / 'github-backoff.json'
        self.cache_path = self.root / 'reviews.json'
        self.backoff = self.read(self.backoff_path)
        self.cache = self.read(self.cache_path)

    @staticmethod
    def read(path):
        try:
            return json.loads(path.read_text())
        except (OSError, ValueError):
            return {}

    def ready(self):
        if self.backoff.get('until', 0) > time.time():
            raise RateLimited(self.backoff['reason'])

    def run(self, *args, input=None, via='gh-drew', env=None):
        self.ready()
        # gh's API trace supplies actual nested calls (identity, review guard and
        # merge included). Keep it only in memory; never persist credentials/bodies.
        with tempfile.NamedTemporaryFile(dir=self.root, prefix='http-', mode='r+') as metrics:
            r = subprocess.run([via, *args], input=input, capture_output=True, text=True,
                               env={**os.environ, **(env or {}), 'GH_DEBUG': 'api',
                                    'MOG_HTTP_METRICS': metrics.name})
            requests = [json.loads(line) for line in metrics.read().splitlines()]
        trace = r.stderr
        self.calls += (sum(x['calls'] for x in requests) if requests else
                       len(re.findall(r'^> (?:GET|POST|PUT|PATCH|DELETE|HEAD) ', trace, re.M)))
        self.quota_probes += sum(x['quota_probes'] for x in requests)
        remaining = None
        for response in re.split(r'^< HTTP/', trace, flags=re.M)[1:]:
            resource = re.search(r'^< x-ratelimit-resource:\s*(\S+)', response, re.M | re.I)
            quota = re.search(r'^< x-ratelimit-remaining:\s*(\d+)', response, re.M | re.I)
            if resource and quota:
                remaining = int(quota[1])
                self.quota[f'{via}/{resource[1]}'] = remaining
        for request in requests:
            self.quota.update(request['quota'])
            # Only sanitized limit metadata leaves the child; the debug trace
            # itself is consumed there even when a guard suppresses stderr.
            if request['limited']:
                trace += '\nAPI rate limit exceeded\n' + request['limit_headers']
                if request['secondary']:
                    trace += '\nsecondary rate limit\n'
        # A gh-drew review error is printed after the nested debug request ends.
        r.stderr = re.sub(r'\* Request at .*?\* Request took [^\n]*\n?', '', trace, flags=re.S)
        try:
            cost = json.loads(r.stdout)['data']['rateLimit']['cost']
            self.graphql_cost += cost
            self.graphql_cost_samples += 1
        except (ValueError, KeyError, TypeError):
            pass
        # Match failures only: a successful PR body can discuss rate limits.
        failed = r.returncode != 0 or bool(re.search(r'"errors"\s*:', r.stdout)) or any(x['limited'] for x in requests)
        limited = failed and re.search(r'secondary rate limit|API rate limit (?:already )?exceeded|abuse detection',
                                      trace + r.stdout, re.I)
        retry = re.search(r'(?:<\s*)?retry-after:\s*(\d+)', trace, re.I)
        if limited or (retry and re.search(r'\b(?:403|429)\b', trace)):
            attempt = self.backoff.get('attempt', 0) + 1
            delay = int(retry[1]) if retry else min(3600, 60 * 2 ** min(attempt - 1, 6))
            resets = re.findall(r'< x-ratelimit-reset:\s*(\d+)', trace, re.I)
            primary = not retry and not re.search(r'secondary rate limit|abuse detection', trace, re.I)
            if resets and (primary or remaining == 0 or re.search(r'< x-ratelimit-remaining:\s*0\b', trace, re.I)):
                delay = max(delay, int(resets[-1]) - int(time.time()))
            self.backoff = {'until': time.time() + delay, 'attempt': attempt,
                            'pr': self.pr or self.backoff.get('pr'),
                            'reason': f'GitHub rate limit; retry after {delay}s'}
            save(self.backoff_path, self.backoff)
            raise RateLimited(self.backoff['reason'])
        return r

    def reviews(self, pr, fragment):
        key = f'{self.repo}#{pr["number"]}'
        version = fingerprint(pr)
        cached = self.cache.get(key, {})
        if cached.get('version') == version:
            self.hits += 1
            answer = cached['answer']
        else:
            self.misses += 1
            owner, name = self.repo.split('/')
            query = ('query($owner:String!,$name:String!,$number:Int!){rateLimit{cost remaining resetAt} repository(owner:$owner,name:$name)'
                     '{pullRequest(number:$number){...pr}}}\n' + fragment)
            r = self.run('api', 'graphql', '-f', f'query={query}', '-f', f'owner={owner}',
                         '-f', f'name={name}', '-F', f'number={pr["number"]}', via='gh-read')
            answer = json.loads(r.stdout) if r.returncode == 0 else {}
            detail = ((answer.get('data') or {}).get('repository') or {}).get('pullRequest')
            if answer.get('errors') or not detail or detail['headRefOid'] != pr['headRefOid']:
                raise RuntimeError('review read failed or head moved; retry next tick')
            # If metadata changes during the detail read the next tick invalidates it.
            self.cache[key] = {'version': version, 'answer': answer}
            save(self.cache_path, self.cache)
        # Body/labels are always from this tick, even when the review payload is cached.
        answer = json.loads(json.dumps(answer))
        detail = answer['data']['repository']['pullRequest']
        detail.update({k: pr[k] for k in ('body', 'labels')})
        return answer

    def snapshot(self, pr, answer):
        path = self.root / 'review-snapshot.json'
        save(path, {'repo': self.repo, 'number': pr['number'], 'at': time.time(), 'answer': answer})
        return str(path.resolve())

    def finish(self, dry_run, deferred=None, success=False):
        if success:
            self.backoff_path.unlink(missing_ok=True)
        rec = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'repo': self.repo,
               'dry_run': dry_run, 'github_calls': self.calls, 'remaining': self.quota,
               'quota_probe_calls': self.quota_probes,
               'graphql_cost': self.graphql_cost, 'graphql_cost_samples': self.graphql_cost_samples,
               'review_cache_hits': self.hits, 'review_cache_misses': self.misses,
               'decisions': self.decisions, 'deferred': deferred}
        with (self.root / 'ticks.jsonl').open('a') as f:
            f.write(json.dumps(rec) + '\n')
        print('merge-on-green: tick ' + json.dumps({k: v for k, v in rec.items() if k != 'decisions'}))


def snapshot_answer(path, owner, name, number):
    """Reuse only the bot's fresh, matching per-tick response; otherwise read live."""
    try:
        s = json.loads(Path(path).read_text())
        if s['repo'] == f'{owner}/{name}' and s['number'] == int(number) and 0 <= time.time() - s['at'] < 15:
            return json.dumps(s['answer'])
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return None


if __name__ == '__main__':
    import sys
    if sys.argv[1] == 'trace':
        # The gh shim reaches this at the real CLI boundary, before any caller
        # can discard stderr. Preserve CLI bytes; retain only counters/headers.
        r = subprocess.run(sys.argv[2:], capture_output=True,
                           env={**os.environ, 'GH_DEBUG': 'api'})
        trace = r.stderr.decode(errors='replace')
        quota = {}
        account = os.environ.get('GH_DREW_EXPECTED_LOGIN', 'drewstone')
        for response in re.split(r'^< HTTP/', trace, flags=re.M)[1:]:
            resource = re.search(r'^< x-ratelimit-resource:\s*(\S+)', response, re.M | re.I)
            left = re.search(r'^< x-ratelimit-remaining:\s*(\d+)', response, re.M | re.I)
            if resource and left:
                quota[f'{account}/{resource[1]}'] = int(left[1])
        failure = r.returncode != 0 or bool(re.search(rb'"errors"\s*:', r.stdout))
        limited = failure and bool(re.search(r'secondary rate limit|API rate limit (?:already )?exceeded|abuse detection',
                                              trace + r.stdout.decode(errors='replace'), re.I))
        secondary = bool(re.search(r'secondary rate limit|abuse detection', trace, re.I))
        headers = '\n'.join(line for line in trace.splitlines()
                            if re.match(r'< (?:retry-after|x-ratelimit-(?:remaining|reset)):', line, re.I))
        if failure and re.search(r'\b(?:403|429)\b', trace) and re.search(r'retry-after:', headers, re.I):
            limited = True
        with open(os.environ['MOG_HTTP_METRICS'], 'a') as f:
            f.write(json.dumps({'calls': len(re.findall(r'^> (?:GET|POST|PUT|PATCH|DELETE|HEAD) ', trace, re.M)),
                               'quota_probes': len(re.findall(r'^> GET /rate_limit(?:\s|\?)', trace, re.M)),
                               'quota': quota, 'limited': limited, 'secondary': secondary,
                               'limit_headers': headers if limited else ''}) + '\n')
        sys.stdout.buffer.write(r.stdout)
        sys.stderr.write(re.sub(r'\* Request at .*?\* Request took [^\n]*\n?', '', trace, flags=re.S))
        sys.exit(r.returncode)
    answer = snapshot_answer(*sys.argv[1:])
    if answer is None:
        sys.exit(1)
    print(answer)
