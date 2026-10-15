#!/usr/bin/env python3
"""Turn a `traces facts --since/--until` report into the per-session rows merge.mjs reads (the shape of
trace-mine's extract.mjs output). traces is the owner of Claude Code turn classification (it reads through
harness-sessions); this script only reshapes its humanTurns and answered text.

A session traces could not read is listed in `selection.unreadSessions`. For each one that is a real
session (not a throwaway /tmp project), rows are taken from an extract.mjs file for the same window when
--fallback names one, and every such session is printed to stderr, so a reader bug never silently drops
turns. Usage:
  from_traces.py <facts.json> --host <host> [--fallback <extract.jsonl>] > claude-<host>.jsonl
"""
import argparse, json, re, sys

THROWAWAY = re.compile(r'/projects/-private-tmp-|/projects/-tmp-')

ap = argparse.ArgumentParser()
ap.add_argument('facts')
ap.add_argument('--host', required=True)
ap.add_argument('--fallback')
a = ap.parse_args()

report = json.load(open(a.facts))
if report.get('measurementVersion') and int(report['measurementVersion']) < 4:
    sys.exit('from_traces: needs traces >= 0.23.0 (facts measurement version 4: windows, cwd, answered)')
written = 0
for s in report['sessions']:
    turns = (s.get('humanTurns') or {}).get('value') or []
    if not turns:
        continue
    cwd = (s.get('cwd') or {}).get('value')
    rows = [{'id': None, 'ts': t['at'], 'text': t['text'], 'previousAgent': t.get('answered') or '',
             'afterInterrupt': False, 'reply': ''} for t in turns]
    print(json.dumps({'host': a.host, 'session': s['sessionId'], 'cwd': cwd, 'source': 'traces', 'turns': rows}))
    written += len(rows)

unread = [u for u in ((report.get('selection') or {}).get('unreadSessions') or []) if not THROWAWAY.search(u.get('source') or '')]
recovered = 0
if unread:
    ids = {u.get('sessionId') for u in unread}
    by_session = {}
    if a.fallback:
        for line in open(a.fallback):
            r = json.loads(line)
            if r.get('session') in ids:
                by_session[r['session']] = r
    for u in unread:
        r = by_session.get(u.get('sessionId'))
        if r:
            r['source'] = 'extract.mjs (traces could not read)'
            print(json.dumps(r))
            recovered += len(r.get('turns') or [])
        print(f"from_traces: unread {u.get('sessionId')} {'recovered from fallback' if r else 'LOST (pass --fallback)'}: {(u.get('reason') or '')[:120]}", file=sys.stderr)
print(f'from_traces: {written} turns from traces, {recovered} recovered from fallback, {len(unread)} real unread sessions', file=sys.stderr)
