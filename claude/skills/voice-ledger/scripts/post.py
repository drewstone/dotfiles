#!/usr/bin/env python3
"""Join the day-profiles workflow result with the corpus: model correction labels for every Drew turn, a calibration
score against trace-mine's own labels, a mechanical verbatim check of every quote in the day profiles, and per-day
outcomes with PR volume detrended by its trailing 14-day median. Usage: post.py <out> <workflow-result.json>
Writes <out>/corpus/turns-final.jsonl, day-profiles.json and day-outcomes.json; prints calibration and the day ranking.
A quote not found verbatim in Drew's text that day is dropped; exits 2 when a turn has no label."""
import collections, datetime as dt, json, math, os, re, statistics as st, sys

if len(sys.argv) != 3:
    raise SystemExit('usage: post.py <out> <workflow-result.json>')
raw = json.load(open(sys.argv[2]))
out = raw.get('result', raw)
os.chdir(sys.argv[1])
maps = json.load(open('corpus/adjudicate/_map.json'))
full = {json.loads(l)['id']: json.loads(l) for l in open('corpus/turns.jsonl')}
rows = [json.loads(l) for l in open('corpus/turns-labelled.jsonl')]
own = [r for r in rows if r['who'] in ('drew', 'relay')]

# 1. Labels and calibration.
new, calib = {}, []
missing = 0
for b in out['adjudication']:
    if not b or not b.get('labels'):
        missing += len(maps.get(b['batch'] if b else '', {}))
        continue
    m = maps[b['batch']]
    got = {l['id']: l for l in b['labels']}
    for short, real in m.items():
        l = got.get(short)
        if l is None:
            missing += 1
            continue
        if b['batch'].startswith('calib'):
            calib.append((full[real]['correction'], l['correction']))
        else:
            new[real] = l
tp = sum(1 for a, b in calib if a and b); tn = sum(1 for a, b in calib if not a and not b)
fp = sum(1 for a, b in calib if not a and b); fn = sum(1 for a, b in calib if a and not b)
po = (tp + tn) / len(calib)
pa = ((tp + fn) / len(calib)) * ((tp + fp) / len(calib)) + ((tn + fp) / len(calib)) * ((tn + fn) / len(calib))
kappa = (po - pa) / (1 - pa) if pa < 1 else 1
calibration = {'n': len(calib), 'agreement': round(po, 3), 'kappa': round(kappa, 3), 'traceMineYes': tp + fn, 'oursYes': tp + fp, 'tp': tp, 'fp': fp, 'fn': fn, 'tn': tn}

for r in own:
    if full[r['id']]['labelSource'] == 'model':
        r['corr'] = full[r['id']]['correction']; r['src'] = 'trace-mine'
    elif r['id'] in new:
        r['corr'] = new[r['id']]['correction']; r['theme'] = new[r['id']]['theme']; r['src'] = 'sonnet'
    else:
        r['corr'] = r['correction']; r['src'] = 'lexical'

# Recompute next reaction with model labels.
GO = re.compile(r"^(yalla|go|do it|continue|cont|proceed|ship it|merge( it)?|yes|ok|okay|sure|finish|resume|keep going)\b", re.I)
by = collections.defaultdict(list)
for r in own:
    by[(r['host'], r['session'])].append(r)
for ts in by.values():
    ts.sort(key=lambda r: r['ts'])
    for i, r in enumerate(ts):
        n = ts[i + 1] if i + 1 < len(ts) else None
        r['next2'] = 'end' if n is None else 'correction' if n['corr'] else 'praise' if n['praise'] else 'go' if GO.match(n['text']) else 'other'
with open('corpus/turns-final.jsonl', 'w') as fh:
    for r in own:
        fh.write(json.dumps(r) + '\n')

# 2. Verbatim check of day-profile quotes: a quote not found in that day's own text is dropped from the profile, so
# only verbatim quotes reach the analysis and the page; quoteCheck keeps the counts and the first dropped quotes.
day_text = collections.defaultdict(str)
for r in own:
    if r['who'] == 'drew':
        day_text[r['day']] += '\n' + r['text']
norm = lambda s: re.sub(r'\s+', ' ', s).strip()
qcheck = {}
profiles = [d for d in out['days'] if d]
for p in profiles:
    hay = norm(day_text.get(p['day'], ''))
    quotes = list(p['goals']) + list(p['rules']) + list(p['essence']) + [q['quote'] for q in p['corrections']] + [q['quote'] for q in p['praise']] + [e for s in p['signatures'] for e in s['examples']]
    found = lambda q: bool(norm(q)) and norm(q) in hay
    ok = [q for q in quotes if found(q)]
    bad = [q for q in quotes if not found(q)]
    qcheck[p['day']] = {'quotes': len(quotes), 'verbatim': len(ok), 'notFound': bad[:8]}
    for key in ('goals', 'rules', 'essence'):
        p[key] = [q for q in p[key] if found(q)]
    for key in ('corrections', 'praise'):
        p[key] = [q for q in p[key] if found(q['quote'])]
    for sig in p['signatures']:
        sig['examples'] = [e for e in sig['examples'] if found(e)]
json.dump(profiles, open('corpus/day-profiles.json', 'w'), indent=1)

# 3. Per-day outcomes.
prs = collections.defaultdict(dict)
for l in open('corpus/prs.jsonl'):
    p = json.loads(l)
    prs[p['day']][(p['repo'], p['number'])] = p
days = collections.defaultdict(list)
for r in own:
    days[r['day']].append(r)
table = []
for d in sorted(days):
    ts = days[d]
    drew = [t for t in ts if t['who'] == 'drew']
    if len(drew) < 40:
        continue
    scored = [t for t in ts if t['next2'] != 'end']
    p = list(prs.get(d, {}).values())
    prof = next((x for x in profiles if x['day'] == d), None)
    table.append({
        'day': d, 'drewTurns': len(drew), 'corrections': sum(t['corr'] for t in drew),
        'correctionRate': round(sum(t['corr'] for t in drew) / len(drew), 3),
        'themes': dict(collections.Counter(t.get('theme') for t in drew if t['corr'] and t.get('theme'))),
        'praise': sum(t['praise'] for t in drew), 'goRate': round(sum(bool(GO.match(t['text'])) for t in drew) / len(drew), 3),
        'mergedPRs': len(p), 'revertPRs': sum(1 for x in p if x['title'].lower().startswith('revert')),
        'repos': len({x['repo'] for x in p}),
        'harness': dict(collections.Counter(t['harness'] for t in drew)),
        'projects': dict(collections.Counter(t['project'] for t in drew).most_common(5)),
        'wordsMedian': sorted(t['words'] for t in drew)[len(drew) // 2],
        'judged': prof['judged']['score'] if prof else None,
        'tasksShipped': sum(1 for t in (prof or {}).get('tasks', []) if t['status'] == 'shipped'),
        'tasksStalled': sum(1 for t in (prof or {}).get('tasks', []) if t['status'] in ('stalled', 'abandoned')),
        'tasks': len((prof or {}).get('tasks', [])),
        'quoteVerbatim': qcheck.get(d, {}).get('verbatim'), 'quotes': qcheck.get(d, {}).get('quotes'),
    })
# Shipping against the trailing 14-day median of merged PRs per day (fleet volume grew by orders of magnitude, so raw
# counts rank the calendar, not the day), alignment as the correction share, each z-scored across days.
# score2 = zShip + zAlign + 0.5 * zPraise. Judged scores are reported, never scored.
per_day, seen_pr = collections.Counter(), set()
for d_prs in prs.values():
    for k, p in d_prs.items():
        if k not in seen_pr:
            seen_pr.add(k)
            per_day[p['day']] += 1
def trailing(day):
    D = dt.date.fromisoformat(day)
    return st.median([per_day.get((D - dt.timedelta(days=i)).isoformat(), 0) for i in range(1, 15)])
for t in table:
    t['prBaseline'] = trailing(t['day'])
    t['prRatio'] = round((t['mergedPRs'] + 1) / (t['prBaseline'] + 1), 2)
def z(xs):
    m = sum(xs) / len(xs); s = math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs)) or 1
    return [(x - m) / s for x in xs]
zr = z([math.log(t['prRatio']) for t in table])
zc = z([t['correctionRate'] for t in table])
zp = z([t['praise'] / t['drewTurns'] for t in table])
for t, a, b, c in zip(table, zr, zc, zp):
    t['zShip'], t['zAlign'], t['score2'] = round(a, 2), round(-b, 2), round(a - b + 0.5 * c, 2)
json.dump({'calibration': calibration, 'labelled': len(new), 'missing': missing, 'quoteCheck': qcheck, 'days': table}, open('corpus/day-outcomes.json', 'w'), indent=1)
qv = sum(v['verbatim'] for v in qcheck.values()); qn = sum(v['quotes'] for v in qcheck.values())
print('calibration', calibration)
print('new labels', len(new), 'missing', missing, 'quotes verbatim', qv, '/', qn)
for t in sorted(table, key=lambda t: -t['score2']):
    print(t['day'], f"score2={t['score2']:+.2f} ship={t['zShip']:+.2f} align={t['zAlign']:+.2f} prs={t['mergedPRs']:4d} base={t['prBaseline']} corr={t['correctionRate']:.2f} praise={t['praise']:3d} judged={t['judged']}")
print(f'dropped {qn - qv} quotes that are not verbatim in their day', file=sys.stderr)
if missing:
    print(f'{missing} turns have no label: rerun their batches with the workflow before any analysis', file=sys.stderr)
    sys.exit(2)
