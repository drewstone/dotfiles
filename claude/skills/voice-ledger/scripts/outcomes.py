#!/usr/bin/env python3
"""Every PR authored by drewstone merged per UTC day, via the GitHub search API through gh-drew (1000-result
cap per query, so one query per day, paged). Appends <out>/corpus/prs.jsonl and marks each finished day in
<out>/corpus/prs.days, so a rerun resumes where it stopped. Prints `day total fetched` per day.
Usage: outcomes.py <out> 2026-06-01 2026-10-14"""
import datetime as dt, json, os, subprocess, sys, time

if len(sys.argv) != 4:
    raise SystemExit('usage: outcomes.py <out> <first-day> <last-day>')
os.makedirs(os.path.join(sys.argv[1], 'corpus'), exist_ok=True)
os.chdir(sys.argv[1])
start, end = (dt.date.fromisoformat(x) for x in sys.argv[2:4])
out = open('corpus/prs.jsonl', 'a')
done = set()
try:
    for l in open('corpus/prs.days'):
        done.add(l.strip())
except FileNotFoundError:
    pass
marks = open('corpus/prs.days', 'a')


def search(q, page):
    for attempt in range(8):
        p = subprocess.run(['gh-drew', 'api', '-X', 'GET', 'search/issues', '-f', f'q={q}', '-f', 'per_page=100', '-f', f'page={page}'],
                           capture_output=True, text=True)
        if p.returncode == 0:
            return json.loads(p.stdout)
        transient = ('rate limit', '403', '429', '502', '503', 'timeout', 'tls', 'connection', 'eof')
        if any(x in p.stderr.lower() for x in transient):
            time.sleep(20 * (attempt + 1))
            continue
        raise RuntimeError(p.stderr[:300])
    raise RuntimeError('rate limited')


d = start
while d <= end:
    day = d.isoformat()
    if day not in done:
        q = f'is:pr is:merged author:drewstone merged:{day}..{day}'
        page, n, total = 1, 0, None
        while True:
            r = search(q, page)
            total = r['total_count']
            for it in r['items']:
                out.write(json.dumps({'day': day, 'repo': it['repository_url'].split('/repos/')[1], 'number': it['number'],
                                      'title': it['title'], 'created_at': it['created_at'],
                                      'merged_at': (it.get('pull_request') or {}).get('merged_at'),
                                      'labels': [x['name'] for x in it.get('labels') or []]}) + '\n')
                n += 1
            if n >= min(total, 1000) or not r['items']:
                break
            page += 1
            time.sleep(2.1)
        out.flush()
        marks.write(day + '\n'); marks.flush()
        print(day, total, n, flush=True)
        time.sleep(2.1)
    d += dt.timedelta(days=1)
