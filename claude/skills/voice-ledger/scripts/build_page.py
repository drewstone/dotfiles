#!/usr/bin/env python3
"""Assemble the voice-ledger page from a run's measured files. Usage: build_page.py <out>
Reads <out>/chart-data.json (stage.py chart), <out>/corpus/contrast-result.json (the contrast workflow result),
<out>/profiles/*.json, and <out>/page-text.json: the prose that states this run's numbers (lede, tiles, captions,
method, headlines), written by the agent from this run's outputs. Writes <out>/page/voice-ledger.html from
../assets/template.html. With no page-text.json it writes a skeleton and exits 1; a value still marked TODO exits 1."""
import json, os, sys

if len(sys.argv) != 2:
    raise SystemExit('usage: build_page.py <out>')
TEMPLATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'template.html')
os.chdir(sys.argv[1])

C = json.load(open('chart-data.json'))
R = json.load(open('corpus/contrast-result.json'))
R = R.get('result', R)
con, prof, red = R['contrast'], R['profile'], R['redteam']

SKELETON = {
    'lede': 'TODO: 2-4 sentences with this run\'s headline numbers (<b> and <i> allowed), each with its window and denominator',
    'tiles': [{'v': 'TODO', 'k': 'TODO: what the number counts, with its window'}],
    'method': [{'h': h, 'p': 'TODO'} for h in ('Sources', 'Authorship', 'Corrections', 'Days and outcomes', 'Red team', 'traces CLI')],
    'timelineCap': 'TODO', 'agentCap': 'TODO', 'drewCap': 'TODO', 'findingsNote': 'TODO', 'funnelCap': 'TODO',
    'runHow': 'TODO: commands to validate a profile and start a sandbox from it', 'runNote': 'TODO: what is proven live and what is read from code only',
    'text': {'timelineHeadline': 'TODO', 'liftHeadline': 'TODO', 'monthlyCap': 'TODO', 'profilesEyebrow': 'TODO: AgentProfile · validated against agent-interface <version validate.mjs printed>'},
}
if not os.path.exists('page-text.json'):
    json.dump(SKELETON, open('page-text.json', 'w'), indent=1)
    raise SystemExit(f'wrote {os.path.abspath("page-text.json")}: fill every TODO from this run\'s outputs, then rerun')
T = json.load(open('page-text.json'))
todo = [k for k, v in T.items() if 'TODO' in json.dumps(v)]
if todo:
    raise SystemExit(f'page-text.json still has TODO in: {", ".join(todo)}')

verdicts = {}
for lens in red:
    for v in (lens or {}).get('verdicts', []):
        verdicts.setdefault(v['id'], []).append({'lens': lens['lens'], 'verdict': v['verdict'], 'numbers': v['numbers'][:400]})
rank = {'survives': 0, 'weakened': 1, 'refuted': 2}
findings = []
for f in con['findings']:
    vs = verdicts.get(f['id'], [])
    findings.append({**f, 'verdicts': vs, 'worst': max((rank[v['verdict']] for v in vs), default=1), 'best': sum(v['verdict'] == 'survives' for v in vs)})
findings.sort(key=lambda f: (f['worst'], -f['best']))

short = {'agent asks permission / offers options': 'asks permission', 'agent reports blocked / needs you': 'reports blocked',
         'agent reply over 1,400 chars (clipped)': 'reply 1,400+ chars', 'agent claims done/merged/green': 'claims done/merged',
         'agent gives a plan, not a result': 'plan, not result', 'agent cites numbers with units': 'numbers with units'}
agent_rows = sorted(({'label': short.get(k, k.replace('agent ', '')), **v} for k, v in C['agentSide'].items() if v), key=lambda r: r['diff'])
names = {'short_cmd': 'short (5 words or fewer)', 'go': 'go-ahead (yalla, merge)', 'ownership': 'ownership grant', 'link': 'pastes a link',
         'status': 'status ask', 'question': 'question', 'long_form': '120+ words', 'number_target': 'number target',
         'criteria': 'done criteria / proof ask', 'vision': 'vision talk', 'simplicity': 'simplify / delete', 'why': 'explains why',
         'shout': 'CAPS (2+ words)', 'relay': 'pasted agent output'}
drew_rows = sorted(({'label': names.get(k, k), **v} for k, v in C['drewSide'].items() if v), key=lambda r: r['diff'])

profiles = []
master = 'profiles/drew-operator.json'
if os.path.exists(master):
    profiles.append({'name': 'drew-operator', 'oneLine': 'Master profile from the best alignment and composite days.', 'json': json.load(open(master))})
for d in prof['domains']:
    path = os.path.join('profiles', os.path.basename(d['file']))
    profiles.append({'name': os.path.basename(path)[:-5], 'oneLine': d['oneLine'], 'json': json.load(open(path))})

w = C['window']
harnesses = ', '.join({'claude-code': 'Claude Code', 'codex': 'Codex', 'pi': 'Pi', 'opencode': 'OpenCode'}.get(h, h) for h in C['harness'])
text = {'eyebrowTop': f"Operator voice · {C['totals']['days']} days · {harnesses}", 'windowLabel': f"Daily record · {w['from']} to {w['to']}",
        'daysEyebrow': f"{len(C['days'])} days with 40+ of Drew's own turns", **T.get('text', {})}
data = {
    **{k: T[k] for k in ('lede', 'tiles', 'method', 'timelineCap', 'agentCap', 'drewCap', 'findingsNote', 'funnelCap', 'runHow', 'runNote')},
    'text': text, 'series': C['series'], 'months': C['months'], 'agentLift': agent_rows, 'drewLift': drew_rows,
    'base': C['base'], 'nextBase': C['nextBase'], 'themes': C['themes'], 'harness': C['harness'],
    'findings': findings, 'rewrites': prof['rewrites'], 'voiceCard': prof['voiceCard'], 'profiles': profiles,
    'concepts': C['concepts'], 'days': C['days'], 'funnel': C['funnel'],
    'extras': {'domainsOverTime': con['domainsOverTime'], 'tradeoff': con['tradeoff'], 'unasked': con['unaskedQuestion'], 'tenX': con['tenX']},
}
html = open(TEMPLATE).read()
blob = json.dumps(data, ensure_ascii=False).replace('</', '<\\/')
os.makedirs('page', exist_ok=True)
open('page/voice-ledger.html', 'w').write(html.replace('__DATA__', blob))
print('page', os.path.abspath('page/voice-ledger.html'), 'bytes', len(html) + len(blob), 'findings',
      [(f['id'], [v['verdict'] for v in f['verdicts']]) for f in findings])
