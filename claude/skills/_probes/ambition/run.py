#!/usr/bin/env python3
"""Run the ambition probe: each scenario under three skill texts, judged blind by another model family.

Arms, per scenario:
  current  the skill text at --base (the skill that served this task before the change, `base_skill`)
  new      the skill text at --head (`skill`; WORKTREE reads the working tree)
  control  control.md cut to the new text's word count, so length alone cannot explain a difference

The agent is the Claude Code CLI on its own login (ANTHROPIC_API_KEY removed, no tools, no settings), given
the arm's text as the loaded skill. The judge (--judge grok or codex, another model family)
has no tools and is given one task and one reply at a time in shuffled order, never the arm, and the
rubric in rubric.md. Calls are cached by digest under --out's directory, so a rerun only makes missing calls.

usage: run.py [--base origin/main] [--head WORKTREE] [--samples 2] [--jobs 6] [--agent-model opus]
              [--arms current,new,control] [--only A01,A02] [--judge grok|codex] --out results/<stamp>.json
"""
import argparse, concurrent.futures, hashlib, json, math, os, pathlib, random, re, subprocess, tempfile, time

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
SYSTEM = ("You are a coding agent working in the user's repository. The harness loaded the skill below for this "
          "task; follow it.\n\n<skill>\n{skill}\n</skill>\n\nThis turn has no tools. Reply with what you will do: "
          "your first concrete steps, what you will measure and against what, and what you will build. "
          "At most 450 words.")
SCHEMA = {"type": "object", "additionalProperties": False,
          "required": ["q1", "q1_quote", "q2", "q2_quote", "q3", "q3_quote"],
          "properties": {k: ({"type": "boolean"} if not k.endswith("quote") else {"type": "string"})
                         for k in ["q1", "q1_quote", "q2", "q2_quote", "q3", "q3_quote"]}}
QUESTIONS = ["q1", "q2", "q3"]


def skill_text(rev, name):
    if rev == "WORKTREE":
        return (REPO / "claude/skills" / name / "SKILL.md").read_text()
    return subprocess.run(["git", "-C", str(REPO), "show", f"{rev}:claude/skills/{name}/SKILL.md"],
                          check=True, capture_output=True, text=True).stdout


def control_text(words):
    tokens = (HERE / "control.md").read_text().split(" ")
    out, n = [], 0
    for t in tokens:
        out.append(t)
        n += len(t.split())
        if n >= words:
            break
    if n < words:
        raise SystemExit(f"control.md has {n} words; the new text needs {words}")
    return " ".join(out)


def digest(*parts):
    return hashlib.sha256("\x00".join(parts).encode()).hexdigest()[:16]


def call_agent(model, skill, task):
    env = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")}
    cmd = ["claude", "-p", "--model", model, "--output-format", "json", "--system-prompt", SYSTEM.format(skill=skill),
           "--tools", "", "--setting-sources", "", "--strict-mcp-config", "--no-session-persistence"]
    with tempfile.TemporaryDirectory(prefix="ambition-agent-") as cwd:
        proc = subprocess.run(cmd, input=task, capture_output=True, text=True, env=env, cwd=cwd, timeout=900)
    if proc.returncode != 0:
        raise RuntimeError(f"agent exited {proc.returncode}: {(proc.stderr or proc.stdout)[-500:]}")
    env_ = json.loads(proc.stdout)
    if env_.get("is_error"):
        raise RuntimeError(f"agent error: {str(env_.get('result'))[:500]}")
    return {"reply": env_["result"], "served": sorted((env_.get("modelUsage") or {}).keys())}


def judge_prompt(task, reply):
    rubric = (HERE / "rubric.md").read_text()
    return (f"{rubric}\n\nScore this reply. Answer with JSON only.\n\n<task>\n{task}\n</task>\n\n"
            f"<reply>\n{reply}\n</reply>\n")


def call_judge_grok(task, reply):
    with tempfile.TemporaryDirectory(prefix="ambition-judge-") as cwd:
        proc = subprocess.run(["grok", "-p", judge_prompt(task, reply), "--json-schema", json.dumps(SCHEMA),
                               "--output-format", "json", "--tools", "", "--disable-web-search", "--no-subagents",
                               "--max-turns", "1"], capture_output=True, text=True, cwd=cwd, timeout=900)
    if proc.returncode != 0:
        raise RuntimeError(f"judge exited {proc.returncode}: {(proc.stderr or proc.stdout)[-500:]}")
    env = json.loads(proc.stdout)
    if not isinstance(env.get("structuredOutput"), dict):
        raise RuntimeError(f"judge returned no structured output: {str(env.get('text'))[:300]}")
    return {**env["structuredOutput"], "judge_model": ",".join(sorted((env.get("modelUsage") or {}).keys())) or None}


def call_judge_codex(task, reply):
    prompt = judge_prompt(task, reply)
    with tempfile.TemporaryDirectory(prefix="ambition-judge-") as cwd:
        schema, last = pathlib.Path(cwd, "schema.json"), pathlib.Path(cwd, "last.json")
        schema.write_text(json.dumps(SCHEMA))
        proc = subprocess.run(["codex", "exec", "-s", "read-only", "--skip-git-repo-check", "--ephemeral",
                               "--output-schema", str(schema), "-o", str(last), "-"],
                              input=prompt, capture_output=True, text=True, cwd=cwd, timeout=900)
        if proc.returncode != 0 or not last.exists():
            raise RuntimeError(f"judge exited {proc.returncode}: {(proc.stderr or proc.stdout)[-500:]}")
        served = re.findall(r"^model: (\S+)", proc.stdout + proc.stderr, re.M)
        return {**json.loads(last.read_text()), "judge_model": served[0] if served else None}


def exact_binomial_two_sided(b, c):
    """McNemar's exact test on discordant pairs b (new yes, other no) and c (new no, other yes)."""
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    p = sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n
    return min(1.0, 2 * p)


def summarize(rows, arms):
    table = {}
    for arm in arms:
        rs = [r for r in rows if r["arm"] == arm and "judgment" in r]
        table[arm] = {"n": len(rs), **{q: sum(r["judgment"][q] for r in rs) for q in QUESTIONS},
                      "all3": sum(all(r["judgment"][q] for q in QUESTIONS) for r in rs)}
    pairs = {}
    if "new" in arms:
        for other in [a for a in arms if a != "new"]:
            key = lambda r: (r["scenario"], r["sample"])
            mine = {key(r): r for r in rows if r["arm"] == "new" and "judgment" in r}
            theirs = {key(r): r for r in rows if r["arm"] == other and "judgment" in r}
            b = c = 0
            for k in mine.keys() & theirs.keys():
                for q in QUESTIONS:
                    x, y = mine[k]["judgment"][q], theirs[k]["judgment"][q]
                    b += x and not y
                    c += y and not x
            pairs[f"new_vs_{other}"] = {"paired_items": 3 * len(mine.keys() & theirs.keys()), "new_only": b,
                                         f"{other}_only": c, "mcnemar_exact_p": round(exact_binomial_two_sided(b, c), 4)}
    return {"arms": table, "paired": pairs}


def markdown(result):
    """The per-arm and paired table for a result file, as committed under results/."""
    s, arms = result["summary"], list(result["summary"]["arms"])
    lines = [f"Base `{result['base'][:12]}`, head `{result['head'][:12]}`, agent `{result['agent_model']}`, "
             f"judge `{result.get('judge', 'codex')}`, {result['samples']} samples per scenario, measured {result['measured_at']}.", "",
             "| Arm | n | Q1 best known result | Q2 target above our number | Q3 mechanism change | All three |",
             "|---|---|---|---|---|---|"]
    for arm in arms:
        a = s["arms"][arm]
        cell = lambda k: f"{a[k]}/{a['n']} ({100 * a[k] / a['n']:.0f}%)" if a["n"] else "0/0"
        lines.append(f"| {arm} | {a['n']} | {cell('q1')} | {cell('q2')} | {cell('q3')} | {cell('all3')} |")
    lines += ["", "| Paired comparison | Items | Only new YES | Only other YES | McNemar exact p |", "|---|---|---|---|---|"]
    for k, v in s["paired"].items():
        other = [x for x in v if x.endswith("_only") and x != "new_only"][0]
        lines.append(f"| {k} | {v['paired_items']} | {v['new_only']} | {v[other]} | {v['mcnemar_exact_p']} |")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--table", help="print the Markdown table for an existing result file and exit")
    ap.add_argument("--base", default="origin/main")
    ap.add_argument("--head", default="WORKTREE")
    ap.add_argument("--samples", type=int, default=2)
    ap.add_argument("--jobs", type=int, default=6)
    ap.add_argument("--agent-model", default="opus")
    ap.add_argument("--arms", default="current,new,control")
    ap.add_argument("--only", default="")
    ap.add_argument("--judge", choices=["grok", "codex"], default="grok")
    ap.add_argument("--out")
    args = ap.parse_args()
    if args.table:
        print(markdown(json.loads(pathlib.Path(args.table).read_text())), end="")
        return
    if not args.out:
        ap.error("--out is required")
    out = pathlib.Path(args.out)
    cache_dir = out.parent / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    arms = args.arms.split(",")
    scenarios = json.loads((HERE / "scenarios.json").read_text())
    if args.only:
        scenarios = [s for s in scenarios if s["id"] in args.only.split(",")]

    jobs = []
    for s in scenarios:
        new = skill_text(args.head, s["skill"]) if ("new" in arms or "control" in arms) else None
        texts = {"current": lambda s=s: skill_text(args.base, s["base_skill"]), "new": lambda: new,
                 "control": lambda: control_text(len(new.split()))}
        for arm in arms:
            text = texts[arm]()
            for sample in range(args.samples):
                jobs.append({"scenario": s["id"], "skill": s["skill"], "arm": arm, "sample": sample, "task": s["task"],
                             "words": len(text.split()), "text_digest": digest(text), "text": text})

    def agent(job):
        path = cache_dir / f"agent-{digest(args.agent_model, job['text_digest'], job['task'], str(job['sample']))}.json"
        if not path.exists():
            path.write_text(json.dumps(call_agent(args.agent_model, job["text"], job["task"])))
        return {**job, **json.loads(path.read_text())}

    with concurrent.futures.ThreadPoolExecutor(args.jobs) as pool:
        done = []
        for f in concurrent.futures.as_completed([pool.submit(agent, j) for j in jobs]):
            try:
                done.append(f.result())
            except Exception as e:  # keep the failure visible, never as a NO
                print("agent failure:", e, flush=True)
        print(f"agent replies: {len(done)} of {len(jobs)}", flush=True)
        random.Random(20261120).shuffle(done)  # the judge sees replies in an order unrelated to arm

        def judge(row):
            key = digest(row['task'], row['reply']) if args.judge == "codex" else digest(args.judge, row['task'], row['reply'])
            path = cache_dir / f"judge-{key}.json"
            if not path.exists():
                call = call_judge_codex if args.judge == "codex" else call_judge_grok
                path.write_text(json.dumps(call(row["task"], row["reply"])))
            return {**row, "judgment": json.loads(path.read_text())}

        rows = []
        for f in concurrent.futures.as_completed([pool.submit(judge, r) for r in done]):
            try:
                rows.append(f.result())
            except Exception as e:
                print("judge failure:", e, flush=True)
    for r in rows:
        r.pop("text", None)
    rows.sort(key=lambda r: (r["scenario"], r["arm"], r["sample"]))
    result = {"base": subprocess.run(["git", "-C", str(REPO), "rev-parse", args.base], capture_output=True, text=True).stdout.strip(),
              "head": args.head if args.head == "WORKTREE" else subprocess.run(["git", "-C", str(REPO), "rev-parse", args.head], capture_output=True, text=True).stdout.strip(),
              "agent_model": args.agent_model, "judge": args.judge, "samples": args.samples, "measured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "summary": summarize(rows, arms), "rows": rows}
    out.write_text(json.dumps(result, indent=1))
    print(json.dumps(result["summary"], indent=1))


if __name__ == "__main__":
    main()
