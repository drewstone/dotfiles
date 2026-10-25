#!/usr/bin/env bash
# Hourly scoreboard for the <1,000-line hill: re-run the census, apply the same scope, append one row
# to <state>/score.jsonl. Every number comes from the census owner beside it (git/census/README.md), so the scoreboard,
# the ratchets and factory's census checks count alike.
# logic_lines counts every in-scope logic file, so deletion and deduplication show up; a split only moves lines out of over_1000.
set -u
here="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
D="${1:-$HOME/.local/state/agent-work/loc-census}"
cp "$D/files.tsv" "$D/files.prev.tsv" 2>/dev/null
"$here/census.sh" "$D" > /dev/null 2>&1
# Each core repo's metrics at its default branch: god functions and classes, duplication, stale doc paths, duplicate exports.
for spec in "agent-container /home/drew/code/adc-t09-rebase origin/develop" "agent-runtime /home/drew/code/agent-runtime origin/main" "agent-eval /home/drew/code/agent-eval origin/main" "tangle-router /home/drew/code/tangle-router origin/main"; do
  set -- $spec; git -C "$2" fetch -q origin 2>/dev/null
  rm -f "$D/measure-$1.json"  # a refused or timed-out measure leaves no stale row behind
  timeout 1500 "$here/census" measure "$2" "$3" > "$D/measure-$1.json.tmp" 2>/dev/null && mv "$D/measure-$1.json.tmp" "$D/measure-$1.json"
done
# Shared-primitive gap across the focus repos: exported names defined in 2+ repos, code blocks copied across repos.
timeout 1500 "$here/census" xrepo agent-container=/home/drew/code/adc-t09-rebase:origin/develop agent-runtime=/home/drew/code/agent-runtime:origin/main agent-eval=/home/drew/code/agent-eval:origin/main tangle-router=/home/drew/code/tangle-router:origin/main creative-agent=/home/drew/code/creative-agent:origin/HEAD gtm-agent=/home/drew/code/gtm-agent:origin/HEAD agent-app=/home/drew/code/agent-app:origin/HEAD legal-agent=/home/drew/code/legal-agent:origin/HEAD hardware-agent=/home/drew/code/hardware-agent:origin/HEAD > "$D/xprims.json.tmp" 2>/dev/null && mv "$D/xprims.json.tmp" "$D/xprims.json"
python3 - "$D" <<"PY"
import os,sys,json,datetime
D=sys.argv[1]
rows=[l.rstrip("\n").split("\t") for l in open(f"{D}/files.tsv") if l.count("\t")==2]
DUP={"agent-dev-container","ph0ny"}
SKIP={"discovery-lab":("prereg/","archive/","artifacts/","reports/","pursuits/","experiments/"),"tnt-core":("bindings/",),"blueprint-agent":("scripts/experiments/",)}
scoped=[(r,p,int(n)) for r,p,n in rows if r not in DUP and not any(p.startswith(s) for s in SKIP.get(r,()))]
big=[b for b in scoped if b[2]>1000]
# Focus: agent-container, agent-eval, agent-runtime, and whatever is really used; not blueprints.
# Really used = a successful production deploy run in the 7 days before 10-21 (gh run list): the apps below and tangle-router.
FOCUS={"agent-container","agent-eval","agent-runtime","tangle-router","creative-agent","gtm-agent","agent-app","legal-agent","hardware-agent"}
fbig=[b for b in big if b[0] in FOCUS]
lanes={}; owned=set()
for f in os.listdir(f"{D}/queues"):
    if not f.endswith(".tsv"): continue
    q={(l.split("\t")[1],l.split("\t")[2].rstrip("\n")) for l in open(f"{D}/queues/{f}")}
    lanes[f[:-4]]=sum(1 for r,p,n in big if (r,p) in q); owned|=q
exr=[l.rstrip("\n").split("\t") for l in open(f"{D}/attr-exempt.tsv") if l.count("\t")==2] if os.path.exists(f"{D}/attr-exempt.tsv") else []
ex=[(r,p,int(n)) for r,p,n in exr if r not in DUP and not any(p.startswith(x) for x in SKIP.get(r,()))]
# Regressions since the previous census, in the focus repos: a file that crossed 1,000 lines, or one already over 1,000 that grew.
prev={(r,p):int(n) for r,p,n in (l.rstrip("\n").split("\t") for l in open(f"{D}/files.prev.tsv") if l.count("\t")==2)} if os.path.exists(f"{D}/files.prev.tsv") else {}
regress=[[f"{r}/{p}",prev.get((r,p)),n] for r,p,n in fbig if prev and (prev.get((r,p)) or 0)<n and (prev.get((r,p)) is None or prev.get((r,p))<=1000 or n>prev.get((r,p)))]
ms={r:json.load(open(f"{D}/measure-{r}.json"))["metrics"] for r in ("agent-container","agent-runtime","agent-eval","tangle-router") if os.path.exists(f"{D}/measure-{r}.json")}
xp=json.load(open(f"{D}/xprims.json")) if os.path.exists(f"{D}/xprims.json") else {}
row={"shared_primitives":{"names_in_2plus_repos":xp.get("names_in_2plus_repos"),"names_in_3plus_repos":xp.get("names_in_3plus_repos"),"cross_repo_copied_blocks":sum((xp.get("cross_repo_shared_windows_by_repo_pair") or {}).values())},"duplication":{r:{"duplicated_lines":v["dup_lines"],"duplicated_pct":v["dup_pct"]} for r,v in ms.items() if "dup_lines" in v},"god_functions":{r:{"fns_over_150":v["fns_over_150"],"fns_over_300":v["fns_over_300"],"fns_over_500":v["fns_over_500"],"classes_over_40_members":v["classes_over_40"],"hug_fns":v["hug_fns"]} for r,v in ms.items() if "fns_over_300" in v},"regressions":regress,"confusion":{r:{k:v[k] for k in ("stale_doc_refs","dup_exports")} for r,v in ms.items() if "dup_exports" in v},"production_lines":{r:v["prod_lines"] for r,v in ms.items()},"t":datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ"),"over_1000":len(big),"over_1500":sum(1 for b in big if b[2]>1500),
     "over_3000":sum(1 for b in big if b[2]>3000),"over_5000":sum(1 for b in big if b[2]>5000),"over_10000":sum(1 for b in big if b[2]>10000),
     "unowned_over_1000":sum(1 for r,p,n in big if (r,p) not in owned),"focus_over_1000":len(fbig),"focus_over_3000":sum(1 for b in fbig if b[2]>3000),"focus_lines_over_1000":sum(b[2] for b in fbig),
     "focus_by_repo":{r:sum(1 for b in fbig if b[0]==r) for r in sorted(FOCUS)},"largest":[[f"{r}/{p}",n] for r,p,n in sorted(big,key=lambda b:-b[2])[:10]],"lines_over_1000":sum(b[2] for b in big),
     "logic_files":len(scoped),"logic_lines":sum(b[2] for b in scoped),"repo_lines":{r:sum(n for rr,_,n in scoped if rr==r) for r in sorted({b[0] for b in scoped})},"attr_exempt_over_1000":sum(1 for e in ex if e[2]>1000),"lanes":lanes}
open(f"{D}/score.jsonl","a").write(json.dumps(row)+"\n"); print(json.dumps(row))
PY
# Tell the operator the same hour a focus file crosses or grows past 1,000 lines (the ratchet should have refused it).
R=$(tail -n1 "$D/score.jsonl" | python3 -c "import sys,json; r=json.loads(sys.stdin.read()); print(\"\\n\".join(f\"  {f}: {a} -> {b} lines\" for f,a,b in r.get(\"regressions\",[])))")
if [ -n "$R" ]; then
  printf "loc-census %s: logic files in the focus repos crossed or grew past 1,000 lines since the last census. loc-ratchet should refuse this at commit, so find the commit and the host that skipped it, and send each file to its owner to shrink:\n%s\n" "$(date -u +%H:%MZ)" "$R" | PATH=$HOME/bin:$HOME/.local/bin:$PATH fleet send op-company:operator --reason "loc regression" >/dev/null 2>&1
fi
