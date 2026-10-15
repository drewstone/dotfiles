#!/usr/bin/env python3
"""The voice-ledger instrument: operator baselines over a window, as climb-ledger rows (hill operator:voice).
Usage: baselines.py <out> --from DAY --to DAY [--ledger PATH] > rows.jsonl
then:  climb-log append --project <dotfiles checkout> --file rows.jsonl
Reads <out>/corpus/turns-final.jsonl, prs.jsonl and day-outcomes.json (calibration). Days are America/Los_Angeles
dates with a 04:00 cutoff. Metrics: correction share of Drew's own turns; merged PRs per correction; corrections per
100 turns for each theme; correction share of a turn sent 30+ minutes after Drew's previous turn in that session
against one sent sooner. With --ledger, prints each metric's latest earlier value from that ledger to stderr.
Correction labels mix trace-mine Opus and Sonnet (same prompt); the selection text names the mix, so a later run
compares like with like."""
import argparse, collections, datetime as dt, json, os, sys
from zoneinfo import ZoneInfo

THEMES = ['communication', 'rigor', 'scope', 'cost', 'autonomy', 'safety']
INSTRUMENT = 'claude/skills/voice-ledger/scripts/baselines.py'


def utc_cutoff(day):
    local = dt.datetime.fromisoformat(day + 'T04:00').replace(tzinfo=ZoneInfo('America/Los_Angeles'))
    return local.astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def main():
    ap = argparse.ArgumentParser(description='voice-ledger operator baselines as climb rows')
    ap.add_argument('out')
    ap.add_argument('--from', dest='first', required=True)
    ap.add_argument('--to', dest='last', required=True)
    ap.add_argument('--ledger', help='a climb ledger to compare against')
    a = ap.parse_args()
    os.chdir(a.out)
    rows = [json.loads(l) for l in open('corpus/turns-final.jsonl') if l.strip()]
    drew = [r for r in rows if r['who'] == 'drew' and r['day'] and a.first <= r['day'] <= a.last]
    if not drew:
        raise SystemExit('no Drew turns in the window')
    cal = json.load(open('corpus/day-outcomes.json'))['calibration']
    prs = {(p['repo'], p['number']) for p in map(json.loads, open('corpus/prs.jsonl')) if a.first <= p['day'] <= a.last}

    n, corr = len(drew), sum(bool(r['corr']) for r in drew)
    src = collections.Counter(r['src'] for r in drew)
    window = {'from': utc_cutoff(a.first), 'to': utc_cutoff((dt.date.fromisoformat(a.last) + dt.timedelta(days=1)).isoformat())}
    calibration = {
        'verdict': 'PASS' if cal['n'] and cal['kappa'] >= 0.6 else 'FAIL',
        'check': 'post.py blind calibration: Sonnet with trace-mine ADJUDICATION_SYSTEM against trace-mine Opus labels (PASS at kappa >= 0.6)',
        'against': f"trace-mine Opus labels on {cal['n']} turns: agreement {cal['agreement']}, kappa {cal['kappa']}, Opus yes {cal['traceMineYes']}, Sonnet yes {cal['oursYes']}",
    }
    labels = ', '.join(f'{k} {v}' for k, v in src.most_common())
    base_sel = f"every turn Drew typed or dictated (authorship pass: who=drew) on days {a.first}..{a.last}; labels: {labels}"

    def row(metric, unit, value, count, selection, basis='judged'):
        slug = metric.lower().replace(' ', '-').replace('/', '-').replace('+', 'plus')
        return {
            'id': f'voice-{slug}-{a.first}-{a.last}', 'project': 'dotfiles', 'layer': 'operator', 'hill': 'operator:voice',
            'lever': 'baseline', 'category': 'criteria', 'goal': "Drew's agents ship more per correction and need fewer corrections",
            'targets': ['claude/skills/voice-ledger'], 'timestamp': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'baseline': {'value': value, 'measurement': {
                'metric': metric, 'unit': unit, 'selection': selection, 'selectBy': 'event', 'n': count, 'basis': basis,
                'window': window, 'perRelease': False, 'instrument': INSTRUMENT, 'calibration': calibration}},
            'reasoning': f'voice-ledger run over {os.path.abspath(".")}',
        }

    out = [
        row('correction share', 'share of turns', round(corr / n, 3), n, base_sel),
        row('merged PRs per correction', 'PRs per correction', round(len(prs) / corr, 2) if corr else None, corr,
            f"unique PRs authored by drewstone merged on days {a.first}..{a.last} (UTC merge date) over the corrections among {base_sel}"),
    ]
    for theme in THEMES:
        k = sum(1 for r in drew if r['corr'] and r.get('theme') == theme)
        out.append(row(f'{theme} corrections per 100 turns', 'corrections per 100 turns', round(100 * k / n, 1), n, base_sel))
    sessions = collections.defaultdict(list)
    for r in drew:
        sessions[(r['host'], r['session'])].append(r)
    slow, fast = [], []
    for ts in sessions.values():
        ts.sort(key=lambda r: r['ts'])
        for prev, cur in zip(ts, ts[1:]):
            gap = (dt.datetime.fromisoformat(cur['ts'].replace('Z', '+00:00')) - dt.datetime.fromisoformat(prev['ts'].replace('Z', '+00:00'))).total_seconds()
            (slow if gap >= 1800 else fast).append(bool(cur['corr']))
    for name, xs, rule in (('correction share after 30+ min gap', slow, '30 minutes or more'), ('correction share after under 30 min gap', fast, 'under 30 minutes')):
        if xs:
            out.append(row(name, 'share of turns', round(sum(xs) / len(xs), 3), len(xs),
                           f'turns sent {rule} after Drew\'s previous turn in the same session, among {base_sel}'))
    for r in out:
        print(json.dumps(r))

    if a.ledger and os.path.exists(a.ledger):
        prior = {}
        for line in open(a.ledger):
            try:
                p = json.loads(line)
            except json.JSONDecodeError:
                continue
            m = (p.get('baseline') or {}).get('measurement') or {}
            if p.get('hill') == 'operator:voice' and m.get('metric') and p['id'] not in {r['id'] for r in out}:
                if m['metric'] not in prior or p['timestamp'] > prior[m['metric']]['timestamp']:
                    prior[m['metric']] = p
        for r in out:
            m = r['baseline']['measurement']
            p = prior.get(m['metric'])
            was = f"{p['baseline']['value']} over {p['baseline']['measurement']['window']} n={p['baseline']['measurement']['n']}" if p else 'no earlier row'
            print(f"{m['metric']}: {r['baseline']['value']} (n={m['n']}) | before: {was}", file=sys.stderr)


if __name__ == '__main__':
    main()
