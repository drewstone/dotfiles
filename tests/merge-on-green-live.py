#!/usr/bin/env python3
"""Opt-in integration proof; all API reads are live and no merge is attempted."""
import argparse, datetime as dt, json, os, runpy, subprocess, sys, tempfile, time
from pathlib import Path
ap=argparse.ArgumentParser(description='Read-only live comparison against a pre-cache merge-on-green revision')
ap.add_argument('--baseline-ref', required=True)
ap.add_argument('--output', required=True)
args=ap.parse_args()
root=Path(__file__).resolve().parents[1]
source=subprocess.run(['git','show',args.baseline_ref+':claude/tools/merge-on-green'],cwd=root,capture_output=True,text=True,check=True).stdout
base={'__name__':'baseline'}
exec(compile(source,'baseline-merge-on-green','exec'),base)
new=runpy.run_path(str(root/'claude/tools/merge-on-green'))
mod=new['_github']
state=Path(tempfile.mkdtemp(prefix='mog-live-'))
gh=mod.GitHub(state,'tangle-network/agent-container')
r=gh.run('api','graphql','-f','query='+base['QUERY'],'-f','owner=tangle-network','-f','name=agent-container',via='gh-read')
assert r.returncode == 0,r.stderr
prs=json.loads(r.stdout)['data']['repository']['pullRequests']['nodes']
now=dt.datetime.now(dt.timezone.utc)
base['decide'].__globals__['REQUIRED']=[]
new['decide'].__globals__['REQUIRED']=[]
before={p['number']:base['decide'](p,now) for p in prs}
# Same variable read made by the original tick.
gh.run('api','repos/tangle-network/agent-container/actions/variables/MERGE_ON_GREEN_PAUSED')
fragment=new['REVIEW_FRAGMENT']
reader=(root/'claude/tools/gh-drew-review.sh').read_text().split("<<'PY'",1)[1].split('\n',1)[1].split('\nPY',1)[0]
old_answers={}
probes_before_guards=gh.quota_probes
for pr in prs:
    if before[pr['number']][0]=='merge':
        old_answers[pr['number']]=gh.reviews(pr,fragment)
# The original review guard calls real gh inside gh-drew, without a second
# wrapper quota probe. Remove only those extra probes from this read-only
# replay; they are measured separately at the HTTP boundary.
baseline_replay_calls=gh.calls
baseline_calls=gh.calls-(gh.quota_probes-probes_before_guards)
# Start the new tick cache from a cold state and fetch its actual compact list.
a=mod.GitHub(state/'new','tangle-network/agent-container');a.root.mkdir(exist_ok=True)
compact=a.run('api','graphql','-f','query='+new['QUERY'],'-f','owner=tangle-network','-f','name=agent-container',via='gh-read')
compact=json.loads(compact.stdout)['data']['repository']['pullRequests']['nodes']
assert {p['number'] for p in compact}==set(before),'open set changed; repeat comparison'
a.run('api','repos/tangle-network/agent-container/actions/variables/MERGE_ON_GREEN_PAUSED')
after={}; guards={}
for pr in compact:
    if not (pr['isDraft'] or pr['headRefName'].startswith(new['RELEASE_PREFIXES']) or new['hold_reason'](pr)):
        answer=a.reviews(pr,fragment)
        pr['reviewThreads']=answer['data']['repository']['pullRequest']['reviewThreads']
        if pr['number'] in old_answers:
            def read(value):
                r=subprocess.run([sys.executable,'-I','-c',reader,str(root/'claude/tools/merge-on-green')],input=json.dumps(value),capture_output=True,text=True)
                assert r.returncode==0,r.stderr
                return r.stdout
            guards[pr['number']]=read(answer)==read(old_answers[pr['number']])
    after[pr['number']]=new['decide'](pr,now)
assert before==after,[(n,before[n],after[n]) for n in before if before[n]!=after[n]]
assert all(guards.values()),guards
result={'at':now.isoformat(),'open_prs':len(prs),'original_calls':baseline_calls,'original_replay_calls':baseline_replay_calls,'proof_only_quota_probes':gh.quota_probes-probes_before_guards,'new_cold_calls':a.calls,'decisions_unchanged':len(before),'merge_guard_comparisons':guards,'decisions':after}
cold_calls=a.calls
# A second compact-list read must produce the same keys and decisions; no full
# payload is fetched for unchanged reviews. Both ticks reach real GitHub.
warm=mod.GitHub(a.root,a.repo)
r=warm.run('api','graphql','-f','query='+new['QUERY'],'-f','owner=tangle-network','-f','name=agent-container',via='gh-read')
warm_prs=json.loads(r.stdout)['data']['repository']['pullRequests']['nodes']
warm.run('api','repos/tangle-network/agent-container/actions/variables/MERGE_ON_GREEN_PAUSED')
warm_decisions={}
for pr in warm_prs:
    if not (pr['isDraft'] or pr['headRefName'].startswith(new['RELEASE_PREFIXES']) or new['hold_reason'](pr)):
        answer=warm.reviews(pr,fragment)
        pr['reviewThreads']=answer['data']['repository']['pullRequest']['reviewThreads']
    warm_decisions[pr['number']]=new['decide'](pr,now)
assert before==warm_decisions,'PR set or decisions moved between live reads; repeat the proof'
result.update(new_cold_calls=cold_calls,new_warm_calls=warm.calls,cache_hits=warm.hits,cache_misses=warm.misses)
# Persisted backoff is exercised through the whole CLI and real clock. The
# first tick makes no requests; after expiry the next tick reads GitHub again.
backoff=state/'backoff';backoff.mkdir()
mod.save(backoff/'github-backoff.json', {'until':time.time()+2,'attempt':1,'pr':None,'reason':'live proof of persisted backoff'})
command=[sys.executable,str(root/'claude/tools/merge-on-green'),'--dry-run','--state-dir',str(backoff)]
subprocess.run(command,check=True,capture_output=True,text=True)
held=json.loads((backoff/'ticks.jsonl').read_text().splitlines()[-1])
assert held['github_calls']==0 and held['deferred']
time.sleep(2)
subprocess.run(command,check=True,capture_output=True,text=True)
resumed=json.loads((backoff/'ticks.jsonl').read_text().splitlines()[-1])
assert resumed['github_calls']>0 and not resumed['deferred']
assert not (backoff/'github-backoff.json').exists()
result['backoff_zero_calls_then_resumed']=True
Path(args.output).write_text(json.dumps(result,indent=2))
print(json.dumps(result))
