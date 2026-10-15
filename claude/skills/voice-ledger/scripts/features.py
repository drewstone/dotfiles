#!/usr/bin/env python3
"""Per-turn voice features, next-reaction labels, per-day rollups and distinctive terms. Usage: features.py <out>
Inputs under <out>: corpus/turns.jsonl, corpus/authorship.json ({id: label}), corpus/prs.jsonl.
Outputs: corpus/turns-labelled.jsonl, corpus/day-features.json, corpus/reaction-lift.json.
A turn under 120 characters was not sent to the authorship pass and counts as Drew's."""
import collections, json, math, os, re, sys

if len(sys.argv) != 2:
    raise SystemExit('usage: features.py <out>')
os.chdir(sys.argv[1])

rows = [json.loads(l) for l in open('corpus/turns.jsonl')]
auth = json.load(open('corpus/authorship.json'))
for r in rows:
    r['who'] = auth.get(r['id'], 'drew' if len(r['text']) < 120 else 'unsure')
drew = [r for r in rows if r['who'] in ('drew', 'relay')]

GO = re.compile(r"^(yalla|go|do it|continue|cont|proceed|ship it|merge( it)?|yes|ok|okay|sure|finish|resume|keep going)\b", re.I)
STATUS = re.compile(r"^(status|update|where are we|progress|eta)\b|\bstatus\?", re.I)
NUMBER_TARGET = re.compile(r"(\d+(\.\d+)?\s?(%|ms|s\b|sec|min|x\b|k\b|users|prs?|tokens|\$))|\b(under|below|at least|beat|target|p95|p50)\b", re.I)
WHY = re.compile(r"\b(because|so that|so we can|the goal is|the point is|why:|in order to|i want .* so)\b", re.I)
CRITERIA = re.compile(r"\b(done when|acceptance|must (pass|work|show)|prove|proof|evidence|verify|test(ed)? (it|this)|screenshot|video|e2e|end to end)\b", re.I)
OWNERSHIP = re.compile(r"\b(take (the )?lead|own (it|this)|you are the (lead|owner)|operator|autonom|don'?t ask|without asking|i trust you|be ambitious|go above and beyond|100x|principal)\b", re.I)
SIMPLE = re.compile(r"\b(simple|simplify|keep it simple|delete|remove|minimal|consolidate|less)\b", re.I)
VISION = re.compile(r"\b(vision|imagine|the future|long[- ]term|world[- ]class|best in the world|moonshot|10x|north star|what if)\b", re.I)
LINK = re.compile(r"https?://")
QUESTION = re.compile(r"\?\s*$|^(what|why|how|can|could|should|is|are|do|does|did|where|when|which)\b", re.I)
CAPS = re.compile(r"\b[A-Z]{4,}\b")


def feats(t):
    s = t['text']
    w = t['words']
    return {
        'short_cmd': w <= 5, 'go': bool(GO.match(s)), 'status': bool(STATUS.search(s)),
        'question': bool(QUESTION.search(s)), 'long_form': w >= 120, 'number_target': bool(NUMBER_TARGET.search(s)),
        'why': bool(WHY.search(s)), 'criteria': bool(CRITERIA.search(s)), 'ownership': bool(OWNERSHIP.search(s)),
        'simplicity': bool(SIMPLE.search(s)), 'vision': bool(VISION.search(s)), 'link': bool(LINK.search(s)),
        'shout': len(CAPS.findall(s)) >= 2, 'relay': t['who'] == 'relay',
    }


# Next reaction: Drew's next turn in the same session.
by_session = collections.defaultdict(list)
for r in drew:
    by_session[(r['host'], r['session'])].append(r)
for turns in by_session.values():
    turns.sort(key=lambda r: r['ts'])
    for i, r in enumerate(turns):
        r['f'] = feats(r)
        nxt = turns[i + 1] if i + 1 < len(turns) else None
        if nxt is None:
            r['next'] = 'end'
        elif nxt['correction']:
            r['next'] = 'correction'
        elif nxt['praise']:
            r['next'] = 'praise'
        elif GO.match(nxt['text']):
            r['next'] = 'go'
        elif STATUS.search(nxt['text']):
            r['next'] = 'status'
        else:
            r['next'] = 'other'

with open('corpus/turns-labelled.jsonl', 'w') as fh:
    for r in drew:
        fh.write(json.dumps({k: r[k] for k in ('id', 'host', 'harness', 'session', 'project', 'ts', 'day', 'who', 'text', 'words', 'correction', 'theme', 'praise', 'f', 'next', 'previousAgent', 'reply')}) + '\n')

# Lift: P(next=correction | feature) vs P(next=correction | not feature), over turns with a next turn.
scored = [r for r in drew if r['next'] != 'end']
lift = {}
for k in scored[0]['f']:
    a = [r for r in scored if r['f'][k]]
    b = [r for r in scored if not r['f'][k]]
    if len(a) < 30:
        continue
    pa = sum(r['next'] == 'correction' for r in a) / len(a)
    pb = sum(r['next'] == 'correction' for r in b) / len(b)
    ga = sum(r['next'] in ('praise', 'go') for r in a) / len(a)
    gb = sum(r['next'] in ('praise', 'go') for r in b) / len(b)
    se = math.sqrt(pa * (1 - pa) / len(a) + pb * (1 - pb) / len(b))
    lift[k] = {'n': len(a), 'nextCorrection': round(pa, 3), 'without': round(pb, 3), 'diff': round(pa - pb, 3), 'z': round((pa - pb) / se, 2) if se else None,
               'nextPositive': round(ga, 3), 'positiveWithout': round(gb, 3)}
json.dump({'turnsScored': len(scored), 'baseCorrection': round(sum(r['next'] == 'correction' for r in scored) / len(scored), 3), 'lift': lift},
          open('corpus/reaction-lift.json', 'w'), indent=1)

# Day rollups + outcomes.
prs = collections.defaultdict(list)
try:
    for l in open('corpus/prs.jsonl'):
        p = json.loads(l)
        prs[p['day']].append(p)
except FileNotFoundError:
    pass
STOP = set('the a an and or but to of in on for with is are was were be been it this that i you we my your our me us as at by from so if not no do does did can could should would will just have has had there here what why how when where which who about into out up down then than also more most very really like get got want need make let all any some one two its im dont thats its youre ive id ill lets ok okay yes please now still even only over after before because'.split())
tok = lambda s: [w for w in re.findall(r"[a-z][a-z0-9_-]{2,}", s.lower()) if w not in STOP and not w.startswith('http')]
df = collections.Counter()
day_tf = collections.defaultdict(collections.Counter)
for r in drew:
    if r['who'] != 'drew':
        continue
    day_tf[r['day']].update(tok(r['text']))
for d, tf in day_tf.items():
    df.update(set(tf))
ndays = len(day_tf)
days = collections.defaultdict(list)
for r in drew:
    days[r['day']].append(r)
out = []
for d in sorted(days):
    ts = days[d]
    n = len(ts)
    own = [t for t in ts if t['who'] == 'drew']
    projects = collections.Counter(t['project'] for t in ts)
    ent = -sum((c / n) * math.log2(c / n) for c in projects.values())
    tf = day_tf.get(d, collections.Counter())
    tfidf = sorted(((w, c * math.log(ndays / (1 + df[w]))) for w, c in tf.items() if c >= 2), key=lambda x: -x[1])[:25]
    stamps = sorted(t['ts'] for t in ts)
    p = prs.get(d, [])
    out.append({
        'day': d, 'turns': n, 'own': len(own), 'relay': n - len(own),
        'wordsMedian': sorted(t['words'] for t in ts)[n // 2],
        'corrections': sum(t['correction'] for t in ts), 'correctionRate': round(sum(t['correction'] for t in ts) / n, 3),
        'praise': sum(t['praise'] for t in ts),
        'nextCorrectionRate': round(sum(t['next'] == 'correction' for t in ts) / max(1, sum(t['next'] != 'end' for t in ts)), 3),
        'feat': {k: round(sum(t['f'][k] for t in ts) / n, 3) for k in ts[0]['f']},
        'sessions': len({(t['host'], t['session']) for t in ts}), 'projects': dict(projects.most_common(6)), 'projectEntropy': round(ent, 2),
        'harness': dict(collections.Counter(t['harness'] for t in ts)),
        'firstTs': stamps[0], 'lastTs': stamps[-1],
        'mergedPRs': len(p), 'revertPRs': sum(1 for x in p if x['title'].lower().startswith('revert')),
        'prRepos': dict(collections.Counter(x['repo'] for x in p).most_common(6)),
        'terms': [w for w, _ in tfidf],
    })
json.dump(out, open('corpus/day-features.json', 'w'), indent=1)
print('drew turns', len(drew), 'scored', len(scored), 'days', len(out))
