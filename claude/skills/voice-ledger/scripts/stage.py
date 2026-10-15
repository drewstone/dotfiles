#!/usr/bin/env python3
"""Deterministic steps between the workflows of a voice-ledger run. Every subcommand reads and writes under <out>.

  stage.py authorship <out>
      Batch every turn of 120+ characters from corpus/turns.jsonl into corpus/authorship/batch-NNN.jsonl (220 a
      batch; the authorship workflow audits fixed line offsets of that size) and print the workflow args.
  stage.py authorship-join <out> <workflow-result.json>
      Write corpus/authorship.json ({turn id: drew|relay|agent|unsure}) and, when the map ran, corpus/profile-brief.md
      and corpus/profile-notes.json. Exits 2 when the blind re-label agrees on fewer than 90% of audited lines.
  stage.py contrast <out> --from DAY
      From post.py's outputs: corpus/lifts-final.json (turn-level lifts), corpus/groups.json (top and bottom quartile
      days by composite, alignment and shipping, days >= DAY), corpus/days-condensed.jsonl (what the contrast
      workflow reads), and profiles/day-profiles.json (every day's AgentProfile, for validate.mjs).
  stage.py chart <out> --from DAY --to DAY
      chart-data.json for build_page.py: daily series, months, funnel, lifts, day explorer rows, concepts, totals.
"""
import argparse, collections, datetime as dt, json, math, os, re, sys


def jsonl(path):
    return [json.loads(line) for line in open(path) if line.strip()]


def workflow_result(path):
    """A Workflow result saved as {"result": ...}, as the bare result, or as tool text that contains the JSON."""
    raw = open(path).read()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        start = min(i for i in (raw.find('{"'), raw.find('{\n')) if i >= 0)
        data = json.loads(raw[start:raw.rfind('}') + 1])
    return data.get('result', data) if isinstance(data, dict) else data


def authorship(out):
    rows = jsonl('corpus/turns.jsonl')
    long = [r for r in rows if len(r['text']) >= 120]
    d = 'corpus/authorship'
    os.makedirs(d, exist_ok=True)
    for f in os.listdir(d):
        os.remove(os.path.join(d, f))
    size = 220
    for b in range(0, len(long), size):
        with open(f'{d}/batch-{b // size:03d}.jsonl', 'w') as fh:
            for r in long[b:b + size]:
                fh.write(json.dumps({'id': r['id'], 'harness': r['harness'], 'host': r['host'][:9], 'project': r['project'],
                                     'agentBefore': r['previousAgent'][:160], 'text': r['text'][:500]}) + '\n')
    n = len(os.listdir(d))
    print(f'turns {len(rows)} long {len(long)} short {len(rows) - len(long)} batches {n}', file=sys.stderr)
    print(json.dumps({'dir': os.path.abspath(d), 'batches': n}))


def authorship_join(out, result_path):
    d = workflow_result(result_path)
    auth, c, missing = {}, collections.Counter(), 0
    for b in d['labelled']:
        if not b:
            continue
        lines = jsonl(f"corpus/authorship/batch-{b['batch']:03d}.jsonl")
        lab = {x['n']: x['a'] for x in (b['labels'] or [])}
        for n, row in enumerate(lines, 1):
            a = lab.get(n)
            if a is None:
                missing += 1
                a = 'unsure'
            auth[row['id']] = a
            c[a] += 1
    json.dump(auth, open('corpus/authorship.json', 'w'))
    if d.get('profileBrief'):
        open('corpus/profile-brief.md', 'w').write(d['profileBrief'])
        json.dump(d.get('profileNotes'), open('corpus/profile-notes.json', 'w'), indent=1)
    audit = d['audit']
    rate = audit['agree'] / audit['compared'] if audit['compared'] else 0
    print(json.dumps({'labels': dict(c), 'missing': missing, 'audit': audit, 'agreement': round(rate, 3)}))
    if rate < 0.9:
        print(f'audit agreement {rate:.1%} is below 90%: sharpen GUIDE in workflows/authorship.js and rerun', file=sys.stderr)
        sys.exit(2)


AGENT_SIDE = {
    'agent asks permission / offers options': r"(want me to|should i|shall i|would you like|do you want me|let me know if|if you'd like|happy to|i can also)",
    'agent reports blocked / needs you': r"\b(blocked|can'?t|cannot|unable|not able|requires? (you|your|manual)|you('ll)? need to|needs? your)\b",
    'agent claims done/merged/green': r"\b(done|shipped|merged|deployed|fixed|completed?|all (tests )?pass(ing)?|green)\b",
    'agent hedges': r"\b(might|may|could be|probably|likely|i think|i believe|seems?|appears?)\b",
    'agent gives a plan, not a result': r"(next,? i('| wi)ll|i will now|i'll (now|start|begin|then)|plan:|here'?s the plan|step 1)",
    'agent shows a table': r"\n\|.*\|",
    'agent cites numbers with units': r"\b\d+(\.\d+)?\s?(%|ms|s|min|h|GB|MiB|tokens|PRs?|tests?)\b",
    'agent links PRs/files': r"https?://|/Users/drew/|#\d{3,}",
}


def lift(pool, pred, outcome):
    a = [r for r in pool if pred(r)]
    b = [r for r in pool if not pred(r)]
    if len(a) < 40 or len(b) < 40:
        return None
    pa = sum(outcome(r) for r in a) / len(a)
    pb = sum(outcome(r) for r in b) / len(b)
    se = math.sqrt(pa * (1 - pa) / len(a) + pb * (1 - pb) / len(b)) or 1
    return {'n': len(a), 'with': round(pa, 3), 'without': round(pb, 3), 'diff': round(pa - pb, 3), 'z': round((pa - pb) / se, 2)}


def contrast(out, first):
    rows = jsonl('corpus/turns-final.jsonl')
    drew = [r for r in rows if r['who'] == 'drew']
    # Turn-level lifts: agent-reply features against Drew's correction, Drew's features against his next correction.
    pool = [r for r in drew if r['previousAgent'].strip()]
    lifts = {'agentSide': {}, 'drewSide': {}, 'harness': {}, 'base': round(sum(r['corr'] for r in pool) / len(pool), 3), 'n': len(pool)}
    for k, p in AGENT_SIDE.items():
        rx = re.compile(p, re.I)
        lifts['agentSide'][k] = lift(pool, lambda r, rx=rx: bool(rx.search(r['previousAgent'])), lambda r: r['corr'])
    lifts['agentSide']['agent reply under 300 chars'] = lift(pool, lambda r: len(r['previousAgent']) < 300, lambda r: r['corr'])
    lifts['agentSide']['agent reply over 1,400 chars (clipped)'] = lift(pool, lambda r: len(r['previousAgent']) >= 1400, lambda r: r['corr'])
    sc = [r for r in drew if r['next2'] != 'end']
    lifts['nextBase'] = round(sum(r['next2'] == 'correction' for r in sc) / len(sc), 3)
    for k in sc[0]['f']:
        lifts['drewSide'][k] = lift(sc, lambda r, k=k: r['f'][k], lambda r: r['next2'] == 'correction')
    c = collections.defaultdict(lambda: [0, 0])
    for r in drew:
        c[r['harness']][0] += 1
        c[r['harness']][1] += r['corr']
    lifts['harness'] = {k: {'n': n, 'rate': round(m / n, 3)} for k, (n, m) in c.items()}
    lifts['themes'] = dict(collections.Counter(r.get('theme') for r in drew if r['corr']).most_common())
    json.dump(lifts, open('corpus/lifts-final.json', 'w'), indent=1)

    # Best and worst days, three rankings, over the window.
    P = {p['day']: p for p in json.load(open('corpus/day-profiles.json'))}
    O = json.load(open('corpus/day-outcomes.json'))
    W = [t for t in O['days'] if t['day'] >= first]
    q = len(W) // 4
    by = lambda key, rev: [t['day'] for t in sorted(W, key=lambda t: t[key], reverse=rev)]
    comp, align, ship = by('score2', True), by('correctionRate', False), by('zShip', True)
    groups = {'window': f"{first}..{max(t['day'] for t in W)}", 'n': len(W),
              'composite': {'top': comp[:q], 'bottom': comp[-q:]}, 'alignment': {'best': align[:q], 'worst': align[-q:]},
              'shipping': {'best': ship[:q], 'worst': ship[-q:]}}
    json.dump(groups, open('corpus/groups.json', 'w'), indent=1)
    lines = []
    for t in sorted(W, key=lambda t: t['day']):
        p = P.get(t['day'])
        if not p:
            continue
        lines.append({
            'day': t['day'],
            'outcomes': {k: t[k] for k in ('drewTurns', 'correctionRate', 'themes', 'praise', 'mergedPRs', 'prBaseline', 'prRatio', 'zShip', 'zAlign', 'score2', 'harness', 'projects', 'judged')},
            'headline': p['headline'], 'domains': p['domains'],
            'tasks': [{'task': x['task'][:140], 'status': x['status']} for x in p['tasks']],
            'signatures': [{'pattern': s['pattern'], 'example': (s['examples'] or [''])[0][:240]} for s in p['signatures']],
            'rules': [r[:300] for r in p['rules']][:12],
            'corrections': [{'quote': x['quote'][:240], 'context': x['context'][:200]} for x in p['corrections']][:8],
            'praise': [{'quote': x['quote'][:200], 'context': x['context'][:160]} for x in p['praise']][:5],
            'worked': [w['pattern'] for w in p['worked']][:6], 'failed': [w['pattern'] for w in p['failed']][:6],
            'essence': [e[:300] for e in p['essence']][:10],
            'concepts': [x['term'] for x in sorted(p['concepts'], key=lambda x: -x['weight'])][:20],
        })
    open('corpus/days-condensed.jsonl', 'w').write('\n'.join(json.dumps(l) for l in lines) + '\n')
    os.makedirs('profiles', exist_ok=True)
    json.dump([P[d]['profile'] for d in sorted(P)], open('profiles/day-profiles.json', 'w'), indent=1)
    print(json.dumps({'days': len(lines), 'groups': groups, 'base': lifts['base'], 'nextBase': lifts['nextBase']}))


def chart(out, first, last):
    rows = jsonl('corpus/turns-final.jsonl')
    allrows = jsonl('corpus/turns.jsonl')
    auth = json.load(open('corpus/authorship.json'))
    stats = json.load(open('corpus/merge-stats.json'))
    O = json.load(open('corpus/day-outcomes.json'))
    P = {p['day']: p for p in json.load(open('corpus/day-profiles.json'))}
    L = json.load(open('corpus/lifts-final.json'))
    prs, seen = collections.Counter(), set()
    for p in jsonl('corpus/prs.jsonl'):
        k = (p['repo'], p['number'])
        if k in seen:
            continue
        seen.add(k)
        prs[p['day']] += 1
    drew = [r for r in rows if r['who'] == 'drew']
    byday = collections.defaultdict(list)
    for r in drew:
        byday[r['day']].append(r)
    series, d = [], dt.date.fromisoformat(first)
    while d <= dt.date.fromisoformat(last):
        k = d.isoformat()
        ts = byday.get(k, [])
        series.append({'day': k, 'turns': len(ts), 'corrRate': round(sum(t['corr'] for t in ts) / len(ts), 3) if len(ts) >= 10 else None, 'prs': prs.get(k, 0)})
        d += dt.timedelta(days=1)
    months = collections.OrderedDict()
    for m in sorted({r['day'][:7] for r in drew if r['day']} | {k[:7] for k in prs}):
        months[m] = {'turns': sum(1 for r in drew if r['day'][:7] == m), 'prs': sum(v for k, v in prs.items() if k[:7] == m),
                     'corr': sum(r['corr'] for r in drew if r['day'][:7] == m)}
    who = collections.Counter(r['who'] for r in rows)
    funnel = {'extracted': stats['extracted'] - stats['duplicates'], 'machineRules': stats['machineDropped'], 'afterRules': len(allrows),
              'agentAuthored': sum(1 for v in auth.values() if v == 'agent'), 'unsure': sum(1 for v in auth.values() if v == 'unsure'),
              'drew': who['drew'], 'relay': who['relay'],
              'extractedLabel': f"Turns extracted from {len(stats['harness'])} harnesses, {len(stats['host'])} hosts"}
    conc = collections.defaultdict(collections.Counter)
    for day, p in P.items():
        if first <= day <= last:
            for x in p['concepts']:
                conc[day[:7]][x['term'].lower()] += x['weight']
    keep = ('day', 'drewTurns', 'correctionRate', 'praise', 'mergedPRs', 'prBaseline', 'zShip', 'zAlign', 'score2', 'judged', 'themes', 'harness', 'projects')
    days = [{k: t[k] for k in keep} | {
        'headline': P[t['day']]['headline'], 'domains': P[t['day']]['domains'], 'essence': P[t['day']]['essence'][:8],
        'concepts': [x['term'] for x in sorted(P[t['day']]['concepts'], key=lambda x: -x['weight'])][:16],
        'worked': [w['pattern'] for w in P[t['day']]['worked']][:4], 'failed': [w['pattern'] for w in P[t['day']]['failed']][:4],
        'profile': P[t['day']]['profile']} for t in O['days'] if t['day'] in P]
    out_ = {'window': {'from': first, 'to': last}, 'series': series, 'months': months, 'funnel': funnel,
            'harness': L['harness'], 'themes': L['themes'], 'agentSide': L['agentSide'], 'drewSide': L['drewSide'], 'base': L['base'], 'nextBase': L['nextBase'],
            'calibration': O['calibration'],
            'quoteCheck': {'verbatim': sum(v['verbatim'] for v in O['quoteCheck'].values()), 'quotes': sum(v['quotes'] for v in O['quoteCheck'].values())},
            'days': days, 'concepts': {m: conc[m].most_common(18) for m in sorted(conc)},
            'totals': {'drewTurns': len(drew), 'relay': who['relay'], 'days': len(byday), 'prsUnique': len(seen), 'corrections': sum(r['corr'] for r in drew)}}
    json.dump(out_, open('chart-data.json', 'w'))
    print(json.dumps({'funnel': funnel, 'totals': out_['totals'], 'months': months}))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('command', choices=['authorship', 'authorship-join', 'contrast', 'chart'])
    ap.add_argument('out')
    ap.add_argument('result', nargs='?', help='authorship-join: the authorship workflow result JSON')
    ap.add_argument('--from', dest='first', help='first day of the analysis window (YYYY-MM-DD, Los Angeles)')
    ap.add_argument('--to', dest='last', help='last day of the window')
    a = ap.parse_args()
    result = os.path.abspath(a.result) if a.result else None  # before the chdir, so a relative path still resolves
    os.chdir(a.out)
    if a.command == 'authorship':
        authorship(a.out)
    elif a.command == 'authorship-join':
        if not a.result:
            ap.error('authorship-join needs the workflow result file')
        authorship_join(a.out, result)
    elif a.command == 'contrast':
        if not a.first:
            ap.error('contrast needs --from')
        contrast(a.out, a.first)
    else:
        if not (a.first and a.last):
            ap.error('chart needs --from and --to')
        chart(a.out, a.first, a.last)
