"""Org-wide stale PR ownership measurement for the existing merge-on-green tick."""
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import subprocess

OWNER_VISIBILITY = 'owner search with archived accounting; gh-read comments with owner permission fallback'


def pr_owner_fields(comment):
    """A trusted comment must name an owner and the work that keeps it open."""
    if comment.get('author_association') not in {'OWNER', 'MEMBER', 'COLLABORATOR'}:
        return None
    # Fenced examples and quoted old instructions are not an assignment.
    body = re.sub(r'```.*?```', '', comment.get('body') or '', flags=re.S)
    fields = {}
    for line in body.splitlines():
        if line.lstrip().startswith('>'):
            continue
        line = re.sub(r'[*`]', '', line).strip().lstrip('- ').strip()
        found = re.match(r'(?i)^(owner|blocker|next(?: action)?)\s*:\s*(\S.*)', line)
        if found:
            key = found[1].lower().split()[0]
            fields[key] = found[2].strip()
    if all(fields.get(key) for key in ('owner', 'blocker', 'next')):
        return {**fields, 'comment': comment['html_url']}
    return None


def pr_owner_pages(client, endpoint, *args, via='gh-read'):
    result = client.run('api', '--method', 'GET', endpoint, '--paginate', *args, via=via)
    if result.returncode and via == 'gh-read' and re.search(r'HTTP (?:403|404)', result.stderr):
        # The reader cannot see every private repo. Keep its cheap quota for
        # ordinary comments, but do not silently drop the owner's private PRs.
        result = client.run('api', '--method', 'GET', endpoint, '--paginate', *args, via='gh-drew')
    if result.returncode:
        raise RuntimeError(f'ownership read failed: {endpoint}: {result.stderr.strip()[:200]}')
    # Older installed gh versions emit adjacent JSON pages and have no --slurp.
    pages, rest, decoder = [], result.stdout.strip(), json.JSONDecoder()
    while rest:
        page, end = decoder.raw_decode(rest)
        pages.append(page)
        rest = rest[end:].lstrip()
    return pages


def pr_owner_notice(root, report, save):
    """Retry the same durable send until Fleet accepts it, then send only changed breaches."""
    urls = sorted(row['url'] for row in report['ownerless'])
    signature = hashlib.sha256(json.dumps([report['orgs'], urls]).encode()).hexdigest()
    path = root / 'ownership-notice.json'
    prior = json.loads(path.read_text()) if path.exists() else {}
    if prior.get('sent') == signature:
        return
    if prior.get('signature') != signature:
        prior = {'signature': signature, 'id': 'mog-owners-' + hashlib.sha256(
            (signature + report['at']).encode()).hexdigest()[:24]}
        save(path, prior)
    message = (f"merge-on-green ownership: {len(urls)} of {report['actionable']} non-archived PRs aged >=24h lack a trusted "
               f"Owner / Blocker / Next action comment. Target 0. Read {root / 'ownership.md'}; "
               + ("Read each PR fully, close with supersession proof or hand to a live owner via PR + inbox. "
                  "Never close a PR whose remaining precondition is a decision or confirmation owed by Drew "
                  "or a lead: leave it open and route it to that lead. "
                  if urls else "No actionable ownership breach remains. ") +
               f"Archived: {len(report['archived'])} read-only PRs listed separately; no action. "
               f"Strict unassigned: {len(report['unassigned'])} / {report['aged']} total aged. "
               "No hold removal or merge is authorized by this alert.\n" + '\n'.join(urls[:10]))
    sent = subprocess.run(['fleet', 'send', '--id', prior['id'], '--enqueue', 'op-company:pr-closer', message],
                          capture_output=True, text=True, timeout=30)
    if sent.returncode:
        raise RuntimeError('ownership alert not accepted by Fleet: ' + sent.stderr.strip()[:200])
    save(path, {**prior, 'sent': signature})


def pr_owner_sweep(client, orgs, state_dir, dry_run, save):
    root = Path(state_dir)
    now = dt.datetime.now(dt.timezone.utc)
    path = root / 'ownership.json'
    prior = json.loads(path.read_text()) if path.exists() else {}
    orgs = sorted(set(orgs))
    # Search is independent of the merge queue's probe: a birthday changes no PR metadata.
    if (prior.get('orgs') == orgs and prior.get('visibility') == OWNER_VISIBILITY
            and 0 <= now.timestamp() - prior.get('checked_at', 0) < 1680):
        if not dry_run:
            pr_owner_notice(root, prior, save)
        print(f"merge-on-green: ownership cached: {len(prior['ownerless'])} actionable ownerless / "
              f"{prior['actionable']} actionable aged; {len(prior['archived'])} archived read-only; "
              f"{len(prior['unassigned'])} strict unassigned / {prior['aged']} total aged; {prior['at']}")
        return prior
    cutoff = (now - dt.timedelta(hours=24)).strftime('%Y-%m-%dT%H:%M:%SZ')
    rows = []
    for org in orgs:
        pages = pr_owner_pages(client, 'search/issues', '-f', f'q=is:pr is:open user:{org} created:<={cutoff}',
                               '-f', 'per_page=100', via='gh-drew')
        issues = [issue for page in pages for issue in page['items']]
        if not pages or any(page.get('incomplete_results') for page in pages) or len(issues) != pages[0]['total_count']:
            raise RuntimeError(f'ownership search incomplete for {org}; refusing a partial count')
        archived_pages = pr_owner_pages(client, 'search/issues', '-f',
            f'q=is:pr is:open user:{org} created:<={cutoff} archived:true', '-f', 'per_page=100', via='gh-drew')
        archived_issues = [issue for page in archived_pages for issue in page['items']]
        if (not archived_pages or any(page.get('incomplete_results') for page in archived_pages)
                or len(archived_issues) != archived_pages[0]['total_count']):
            raise RuntimeError(f'archived ownership search incomplete for {org}')
        archived_urls = {issue['html_url'] for issue in archived_issues}
        if not archived_urls <= {issue['html_url'] for issue in issues}:
            raise RuntimeError(f'ownership search changed during archived accounting for {org}; retry')
        for issue in issues:
            repo = issue['repository_url'].split('/repos/', 1)[1]
            comments = pr_owner_pages(client, f'repos/{repo}/issues/{issue["number"]}/comments?per_page=100')
            assignment = next((owner for page in reversed(comments) for comment in reversed(page)
                               if (owner := pr_owner_fields(comment))), None)
            created = dt.datetime.fromisoformat(issue['created_at'].replace('Z', '+00:00'))
            rows.append({'repo': repo, 'number': issue['number'], 'url': issue['html_url'],
                         'created_at': issue['created_at'], 'age_hours': round((now-created).total_seconds()/3600, 2),
                         'author': issue['user']['login'], 'draft': issue.get('draft', False),
                         'archived': issue['html_url'] in archived_urls,
                         'hold': any(label['name'].lower() == 'hold' for label in issue['labels']),
                         'assignment': assignment})
    report = {'at': now.isoformat(), 'cutoff': cutoff, 'checked_at': now.timestamp(), 'orgs': orgs,
              'visibility': OWNER_VISIBILITY,
              'aged': len(rows), 'owned': sum(bool(row['assignment']) for row in rows),
              'unassigned': [row for row in rows if not row['assignment']],
              'actionable': sum(not row['archived'] for row in rows),
              'archived': [row for row in rows if row['archived']],
              'ownerless': [row for row in rows if not row['assignment'] and not row['archived']], 'prs': rows}
    save(path, report)
    lines = [f"# PR ownership {report['at']}", '', f"Target: 0 actionable ownerless PRs aged >=24h. "
             f"Measured: {len(report['ownerless'])} actionable ownerless / {report['actionable']} actionable aged; "
             f"{report['aged']} total aged, {report['owned']} with assignment, {len(report['unassigned'])} unassigned including archived.",
             f"Archived: {len(report['archived'])} read-only PRs listed below; no action per operator. "
             "These are excluded only from alerts, not from the total or strict unassigned count.",
             '', 'Trusted comment format: `Owner: <lane or Drew>`, `Blocker: <condition>`, `Next action: <action>`.',
             'Assignment text is evidence of responsibility; it does not prove the lane remains live.', '',
             '| PR | Age h | Owner | Blocker / next action |', '|---|---:|---|---|']
    for row in sorted(rows, key=lambda row: -row['age_hours']):
        owner = row['assignment'] or {}
        detail = (owner.get('blocker', '') + ' / ' + owner.get('next', '')).replace('|', '\\|')
        label = owner.get('owner', 'UNOWNED').replace('|', '\\|')
        if row['archived']:
            detail = 'archived: read-only, no action; ' + detail
        lines.append(f"| [{row['repo']}#{row['number']}]({row['url']}) | {row['age_hours']} | {label} | {detail} |")
    (root / 'ownership.md').write_text('\n'.join(lines) + '\n')
    print(f"merge-on-green: ownership: {len(report['ownerless'])} actionable ownerless / {report['actionable']} actionable aged; "
          f"{len(report['archived'])} archived read-only; {len(report['unassigned'])} strict unassigned / {report['aged']} total aged")
    if not dry_run:
        pr_owner_notice(root, report, save)
    return report
