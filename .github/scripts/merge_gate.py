#!/usr/bin/env python3
"""Publish merge statuses for trusted pushes and scan open PR review threads."""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen


REPO = os.environ['GITHUB_REPOSITORY']
TOKEN = os.environ['GH_TOKEN']
API = os.environ.get('GITHUB_API_URL', 'https://api.github.com')
P1 = re.compile(r'!\[P1 Badge\]\([^)]+\)|\[P1\]')
CODEX_AUTHOR = 'chatgpt-codex-connector'
PENDING_RETRY = timedelta(minutes=25)


def request(path, data=None):
    body = None if data is None else json.dumps(data).encode()
    headers = {
        'Accept': 'application/vnd.github+json',
        'Authorization': f'Bearer {TOKEN}',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
    }
    req = Request(f'{API}{path}', body, headers)
    try:
        with urlopen(req, timeout=30) as response:
            return json.load(response)
    except HTTPError as error:
        raise RuntimeError(f'GitHub API returned HTTP {error.code} for {path}') from error


def run_url():
    return (f"{os.environ['GITHUB_SERVER_URL']}/{REPO}/actions/runs/"
            f"{os.environ['GITHUB_RUN_ID']}/attempts/{os.environ['GITHUB_RUN_ATTEMPT']}")


def latest_status(sha, context):
    checks = request(f'/repos/{REPO}/commits/{sha}/status')['statuses']
    return max((check for check in checks if check['context'] == context),
               key=lambda check: check['id'], default=None)


def status(sha, context, state, description):
    request(f'/repos/{REPO}/statuses/{sha}', {
        'context': context,
        'state': state,
        'description': description[:140],
        'target_url': run_url(),
    })
    print(f'{context}: {state} on {sha[:12]} ({description})')


def pages(path):
    page = 1
    while True:
        items = request(f'{path}{"&" if "?" in path else "?"}per_page=100&page={page}')
        yield from items
        if len(items) < 100:
            return
        page += 1


def current_pr(number):
    return request(f'/repos/{REPO}/pulls/{number}')


def open_groups():
    groups = {}
    for pr in pages(f'/repos/{REPO}/pulls?state=open'):
        head_repo = (pr['head']['repo'] or {}).get('full_name', '')
        if head_repo.lower() == REPO.lower() and pr['base']['ref'] == 'main':
            groups.setdefault(pr['head']['sha'], []).append(pr)
    return groups


def selected_groups(groups):
    event = os.environ['GITHUB_EVENT_NAME']
    if event == 'schedule':
        return groups
    if event not in ('workflow_dispatch', 'pull_request_target'):
        raise RuntimeError(f'Unsupported event: {event}')
    with open(os.environ['GITHUB_EVENT_PATH'], encoding='utf-8') as event_file:
        payload = json.load(event_file)
    number = int(payload['inputs']['pr'] if event == 'workflow_dispatch'
                 else payload['pull_request']['number'])
    selected = current_pr(number)
    head = selected['head']['sha']
    if head not in groups or not any(pr['number'] == number for pr in groups[head]):
        raise RuntimeError(f'PR #{number} is not an open same-repository pull request')
    return {head: groups[head]}


def scan_threads(number, head):
    owner, name = REPO.split('/', 1)
    cursor = None
    count = 0
    while True:
        query = '''
        query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
          repository(owner: $owner, name: $name) {
            pullRequest(number: $number) {
              headRefOid
              reviewThreads(first: 100, after: $cursor) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  isResolved
                  isOutdated
                  comments(first: 100) {
                    totalCount
                    nodes { body author { login } commit { oid } }
                  }
                }
              }
            }
          }
        }'''
        result = request('/graphql', {
            'query': query,
            'variables': {'owner': owner, 'name': name, 'number': number, 'cursor': cursor},
        })
        if result.get('errors'):
            raise RuntimeError(f'GraphQL could not inspect PR #{number} review threads')
        pr = result['data']['repository']['pullRequest']
        if pr['headRefOid'] != head:
            raise RuntimeError(f'PR #{number} changed heads during review scan')
        threads = pr['reviewThreads']
        for thread in threads['nodes']:
            if thread['isResolved'] or thread['isOutdated']:
                continue
            comments = thread['comments']
            if comments['totalCount'] > len(comments['nodes']):
                raise RuntimeError(f'PR #{number} has a review thread too long to scan')
            if any(P1.search(comment['body']) and
                   (comment['author'] or {}).get('login') == CODEX_AUTHOR and
                   (comment['commit'] or {}).get('oid') == head
                   for comment in comments['nodes']):
                count += 1
        if not threads['pageInfo']['hasNextPage']:
            return count
        cursor = threads['pageInfo']['endCursor']


def scan_group(head, prs):
    status(head, 'merge-gate/codex-p1', 'pending', 'Scanning unresolved review threads')
    count = 0
    for pr in prs:
        fresh = current_pr(pr['number'])
        if fresh['state'] != 'open' or fresh['head']['sha'] != head:
            raise RuntimeError(f"PR #{pr['number']} changed during review scan")
        found = scan_threads(pr['number'], head)
        count += found
        print(f"PR #{pr['number']}: {found} unresolved [P1] review threads")
    latest = latest_status(head, 'merge-gate/codex-p1')
    if not latest or latest['target_url'] != run_url():
        print(f'{head[:12]} has a newer P1 scan; ignoring stale result')
        return count > 0
    if count:
        status(head, 'merge-gate/codex-p1', 'failure', f'{count} unresolved [P1] review thread(s)')
    else:
        status(head, 'merge-gate/codex-p1', 'success', 'No unresolved [P1] review threads')
    return count > 0


def p1_gate():
    event = os.environ['GITHUB_EVENT_NAME']
    groups = selected_groups(open_groups())
    failures = sum(scan_group(head, prs) for head, prs in groups.items())
    scanned = sum(len(prs) for prs in groups.values())
    print(f'Scanned {scanned} open PR(s) on {len(groups)} head(s); {failures} heads blocked')
    return 1 if failures and event != 'schedule' else 0


def select_ci():
    groups = selected_groups(open_groups())
    items = []
    scheduled = os.environ['GITHUB_EVENT_NAME'] == 'schedule'
    for head, prs in groups.items():
        if len(prs) != 1:
            status(head, 'merge-gate/ci', 'failure', 'Multiple open PRs share this head')
            continue
        pr = current_pr(prs[0]['number'])
        if pr['state'] != 'open' or pr['head']['sha'] != head:
            raise RuntimeError(f"PR #{prs[0]['number']} changed during CI selection")
        if scheduled:
            latest = latest_status(head, 'merge-gate/ci')
            if latest and latest['description'].endswith(pr['base']['sha']):
                if latest['state'] in ('success', 'failure'):
                    continue
                updated = datetime.fromisoformat(latest['created_at'].replace('Z', '+00:00'))
                if latest['state'] == 'pending' and datetime.now(timezone.utc) - updated < PENDING_RETRY:
                    continue
        items.append({'number': pr['number'], 'head': head, 'base': pr['base']['sha']})
        status(head, 'merge-gate/ci', 'pending', f"Queued base {pr['base']['sha']}")
    matrix = json.dumps({'include': items}, separators=(',', ':'))
    with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
        print(f'matrix={matrix}', file=output)
        print(f'count={len(items)}', file=output)
    print(f'Selected {len(items)} same-repository PR head(s) for synthetic-merge CI')


def ci_result(number, head, base, state):
    pr = current_pr(number)
    if pr['state'] != 'open' or pr['head']['sha'] != head or pr['base']['sha'] != base:
        print(f'PR #{number} changed head or base; ignoring stale CI result')
        return
    latest = latest_status(head, 'merge-gate/ci')
    if not latest or latest['target_url'] != run_url():
        print(f'PR #{number} has a newer CI run; ignoring stale result')
        return
    verb = 'Passed' if state == 'success' else 'Failed'
    status(head, 'merge-gate/ci', state, f'{verb} base {base}')


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    result = sub.add_parser('ci-result')
    result.add_argument('--number', required=True, type=int)
    result.add_argument('--sha', required=True)
    result.add_argument('--base', required=True)
    result.add_argument('--state', required=True, choices=['success', 'failure'])
    sub.add_parser('p1')
    sub.add_parser('select-ci')
    args = parser.parse_args()
    if args.command == 'ci-result':
        ci_result(args.number, args.sha, args.base, args.state)
        return 0
    if args.command == 'p1':
        return p1_gate()
    select_ci()
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (KeyError, RuntimeError, ValueError) as error:
        print(f'merge gate: {error}', file=sys.stderr)
        sys.exit(1)
