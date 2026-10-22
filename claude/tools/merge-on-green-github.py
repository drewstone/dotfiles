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


def trace_metrics(trace, account, *, graphql_stdout=None):
    """Summarize each real HTTP exchange before callers filter its stdout."""
    account = account if re.fullmatch(r'[A-Za-z0-9-]{1,39}', account) else 'unknown'
    requests = list(re.finditer(r'^> (?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) (\S+) ', trace, re.M))
    result = {'transport_version': 2, 'calls': len(requests), 'quota_probes': 0,
              'graphql_calls': 0, 'graphql_known_cost': 0, 'graphql_cost_samples': 0,
              'graphql_unknown_cost_calls': 0, 'graphql_parse_failures': 0,
              'cost_complete': True, 'quota': {}, 'quota_observations': [],
              'quota_observation_gaps': 0}
    response_count = 0
    for index, request in enumerate(requests):
        path = request[1].split('?', 1)[0]
        result['quota_probes'] += int(path == '/rate_limit')
        exchange = trace[request.end():requests[index + 1].start() if index + 1 < len(requests) else len(trace)]
        responses = re.split(r'^< HTTP/\S+ (\d{3})[^\n]*\n', exchange, flags=re.M)
        final = [(int(responses[i]), responses[i + 1]) for i in range(1, len(responses), 2)
                 if int(responses[i]) >= 200]
        response_count += len(final)
        graphql = path.rstrip('/').endswith('/graphql')
        known = 0
        for _, response in final:
            header = lambda name: re.search(r'^< ' + name + r':\s*(\S+)', response, re.M | re.I)
            resource = header('x-ratelimit-resource')
            resource = resource[1].lower() if resource and re.fullmatch(r'[a-z_]{1,40}', resource[1], re.I) else None
            graphql = graphql or resource == 'graphql'
            observation = {'account': account, 'resource': resource, 'observed_at': time.time()}
            for field in ('used', 'remaining', 'reset', 'limit'):
                value = header('x-ratelimit-' + field)
                if value and value[1].isdigit():
                    observation[field] = int(value[1])
            complete = resource is not None and all(k in observation for k in ('used', 'remaining', 'reset', 'limit'))
            result['quota_observation_gaps'] += int(not complete)
            if resource is not None:
                result['quota_observations'].append(observation)
                if 'remaining' in observation:
                    result['quota'][f'{account}/{resource}'] = observation['remaining']
            if not graphql:
                continue
            body = re.search(r'^\s*[\[{]', response, re.M)
            try:
                payload, _ = json.JSONDecoder().raw_decode(response[body.start():].lstrip()) if body else (None, 0)
                if not isinstance(payload, dict):
                    raise ValueError('GraphQL response body unavailable')
            except ValueError:
                # gh omits large bodies from its debug trace. The caller may
                # supply the unfiltered stdout for exactly one GraphQL HTTP
                # exchange; never use it for an ambiguous or malformed body.
                if body is not None or len(requests) != 1 or len(final) != 1 or graphql_stdout is None:
                    result['graphql_parse_failures'] += 1
                    continue
                try:
                    payload = json.loads(graphql_stdout)
                    if not isinstance(payload, dict):
                        raise ValueError('GraphQL stdout unavailable')
                except ValueError:
                    result['graphql_parse_failures'] += 1
                    continue
            data = payload.get('data')
            rate = data.get('rateLimit') if isinstance(data, dict) else None
            cost = rate.get('cost') if isinstance(rate, dict) else None
            if isinstance(cost, int) and not isinstance(cost, bool) and cost >= 0:
                result['graphql_known_cost'] += cost
                result['graphql_cost_samples'] += 1
                known += 1
        if graphql:
            result['graphql_calls'] += 1
            result['graphql_unknown_cost_calls'] += int(known == 0)
            result['cost_complete'] &= len(final) == 1 and known == 1
        elif not final:
            # No response headers/body are available to verify its resource.
            result['cost_complete'] = False
    # A changed trace format must not silently discard responses or calls.
    observed_responses = len(re.findall(r'^< HTTP/\S+ [2-5]\d\d\b', trace, re.M))
    result['cost_complete'] &= (response_count == observed_responses and account != 'unknown'
                                and len(re.findall(r'^\* Request at ', trace, re.M)) == len(requests))
    return result


def without_api_trace(trace):
    """Discard complete and interrupted debug blocks; never return request bodies."""
    return re.sub(r'^\* Request at .*?(?:^\* Request took [^\n]*\n?|\Z)', '', trace,
                  flags=re.S | re.M)


class GitHub:
    def __init__(self, state_dir, repo):
        self.root = Path(state_dir)
        self.repo = repo
        self.calls = 0
        self.quota_probes = 0
        self.graphql_cost = 0
        self.graphql_cost_samples = 0
        self.graphql_calls = self.graphql_unknown_cost_calls = self.graphql_parse_failures = 0
        self.cost_complete = True
        self.transport_metric_errors = self.unclassified_calls = 0
        self.quota_observations = []
        self.quota_observation_gaps = 0
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

    def security_updates(self, dry_run):
        """Keep product security alerts and updates enabled, checking once a day."""
        path = self.root / 'security-updates.json'
        prior = self.read(path)
        if (prior.get('repo') == self.repo and prior.get('enabled') is True
                and prior.get('paused') is False and 0 <= time.time() - prior.get('checked_at', 0) < 86400):
            return True
        endpoint = f'repos/{self.repo}'
        alerts = self.run('api', endpoint + '/vulnerability-alerts', '--include')
        if alerts.returncode:
            if not re.search(r'HTTP/\S+ 404\b', alerts.stdout):
                raise RuntimeError(f'security alerts read failed: {alerts.stderr.strip()}')
            if dry_run:
                print(f'merge-on-green: would enable security alerts and updates for {self.repo}')
                return True
            enabled = self.run('api', endpoint + '/vulnerability-alerts', '--method', 'PUT')
            if enabled.returncode:
                raise RuntimeError(f'enabling security alerts failed: {enabled.stderr.strip()}')
        result = self.run('api', endpoint + '/automated-security-fixes')
        if result.returncode:
            raise RuntimeError(f'security updates read failed: {result.stderr.strip()}')
        state = json.loads(result.stdout)
        if state.get('enabled') is not True or state.get('paused') is not False:
            if dry_run:
                print(f'merge-on-green: would enable security updates for {self.repo}')
                return True
            enabled = self.run('api', endpoint + '/automated-security-fixes', '--method', 'PUT')
            if enabled.returncode:
                raise RuntimeError(f'enabling security updates failed: {enabled.stderr.strip()}')
            result = self.run('api', endpoint + '/automated-security-fixes')
            state = json.loads(result.stdout) if result.returncode == 0 else {}
            if state.get('enabled') is not True or state.get('paused') is not False:
                raise RuntimeError(f'security updates did not enable: {result.stderr.strip()}')
        if not dry_run:
            save(path, {'repo': self.repo, 'checked_at': time.time(), **state})
        print(f'merge-on-green: security alerts and updates enabled for {self.repo}')
        return True

    def run(self, *args, input=None, via='gh-drew', env=None):
        self.ready()
        # gh's API trace supplies actual nested calls (identity, review guard and
        # merge included). Keep it only in memory; never persist credentials/bodies.
        with tempfile.NamedTemporaryFile(dir=self.root, prefix='http-', mode='r+') as metrics:
            r = subprocess.run([via, *args], input=input, capture_output=True, text=True,
                               env={**os.environ, **(env or {}), 'GH_DEBUG': 'api',
                                    'MOG_HTTP_METRICS': metrics.name})
            requests = []
            for line in metrics.read().splitlines():
                try:
                    record = json.loads(line)
                    if not isinstance(record, dict):
                        raise ValueError('Invalid transport record')
                    requests.append(record)
                except ValueError:
                    self.transport_metric_errors += 1
                    self.cost_complete = False
        trace = r.stderr
        self.calls += (sum(x['calls'] for x in requests) if requests else
                       len(re.findall(r'^> (?:GET|POST|PUT|PATCH|DELETE|HEAD) ', trace, re.M)))
        self.quota_probes += sum(x['quota_probes'] for x in requests)
        remaining = None
        instrumented = [x for x in requests if x.get('transport_version') == 2]
        if instrumented:
            # Every real CLI response is accounted here, including nested calls.
            # Outer stdout may repeat that response or may have discarded its cost.
            for request in instrumented:
                self.graphql_calls += request['graphql_calls']
                self.graphql_cost += request['graphql_known_cost']
                self.graphql_cost_samples += request['graphql_cost_samples']
                self.graphql_unknown_cost_calls += request['graphql_unknown_cost_calls']
                self.graphql_parse_failures += request['graphql_parse_failures']
                self.cost_complete &= request['cost_complete']
                self.quota_observations.extend(request['quota_observations'])
                self.quota_observation_gaps += request['quota_observation_gaps']
            legacy = [x for x in requests if x.get('transport_version') != 2]
            self.unclassified_calls += sum(x['calls'] for x in legacy)
            self.cost_complete &= not legacy
        else:
            # Compatibility only: this cannot establish complete nested costs.
            self.cost_complete = False
            fallback = trace_metrics(trace, 'unknown')
            for observation in fallback['quota_observations']:
                if 'remaining' in observation:
                    remaining = observation['remaining']
                    self.quota[f"{via}/{observation['resource']}"] = remaining
            calls = fallback['graphql_calls']
            samples = 0
            try:
                cost = json.loads(r.stdout)['data']['rateLimit']['cost']
                if isinstance(cost, int) and not isinstance(cost, bool) and cost >= 0:
                    self.graphql_cost += cost
                    self.graphql_cost_samples += 1
                    samples = 1
            except (ValueError, KeyError, TypeError):
                pass
            self.graphql_calls += max(calls, samples)
            self.graphql_unknown_cost_calls += max(0, calls - samples)
            self.unclassified_calls += max(0, (sum(x['calls'] for x in requests) if requests else fallback['calls']) - max(calls, samples))
        for request in requests:
            self.quota.update(request['quota'])
            if request['quota']:
                remaining = list(request['quota'].values())[-1]
            # Only sanitized limit metadata leaves the child; the debug trace
            # itself is consumed there even when a guard suppresses stderr.
            if request['limited']:
                trace += '\nAPI rate limit exceeded\n' + request['limit_headers']
                if request['secondary']:
                    trace += '\nsecondary rate limit\n'
        r.stderr = without_api_trace(trace)
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
               'graphql_cost': self.graphql_cost, 'graphql_known_cost': self.graphql_cost,
               'graphql_cost_samples': self.graphql_cost_samples, 'graphql_calls': self.graphql_calls,
               'graphql_unknown_cost_calls': self.graphql_unknown_cost_calls,
               'graphql_parse_failures': self.graphql_parse_failures, 'cost_complete': self.cost_complete,
               'transport_metric_errors': self.transport_metric_errors, 'unclassified_calls': self.unclassified_calls,
               'quota_observations': self.quota_observations, 'quota_observation_gaps': self.quota_observation_gaps,
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
        account = os.environ.get('GH_DREW_EXPECTED_LOGIN', 'drewstone')
        args = sys.argv[3:]
        fields = args[2:]
        # Only this canonical API form returns one unfiltered response. Native
        # commands, formatting flags, pagination and unfamiliar argument forms
        # cannot supply a fallback, even if their stdout resembles GraphQL JSON.
        unfiltered_graphql = (args[:2] == ['api', 'graphql'] and len(fields) % 2 == 0
                              and all(fields[i] in ('-f', '-F', '--field', '--raw-field')
                                      for i in range(0, len(fields), 2)))
        metrics = trace_metrics(trace, account, graphql_stdout=r.stdout if unfiltered_graphql else None)
        failure = r.returncode != 0 or bool(re.search(rb'"errors"\s*:', r.stdout))
        limited = failure and bool(re.search(r'secondary rate limit|API rate limit (?:already )?exceeded|abuse detection',
                                              trace + r.stdout.decode(errors='replace'), re.I))
        secondary = bool(re.search(r'secondary rate limit|abuse detection', trace, re.I))
        headers = '\n'.join(f'< {name.lower()}: {value}' for name, value in
                            re.findall(r'^< (retry-after|x-ratelimit-(?:remaining|reset)):\s*(\d+)\s*$', trace, re.M | re.I))
        if failure and re.search(r'\b(?:403|429)\b', trace) and re.search(r'retry-after:', headers, re.I):
            limited = True
        with open(os.environ['MOG_HTTP_METRICS'], 'a') as f:
            f.write(json.dumps({**metrics, 'limited': limited, 'secondary': secondary,
                                'limit_headers': headers if limited else ''}) + '\n')
        sys.stdout.buffer.write(r.stdout)
        sys.stderr.write(without_api_trace(trace))
        sys.exit(r.returncode)
    answer = snapshot_answer(*sys.argv[1:])
    if answer is None:
        sys.exit(1)
    print(answer)
