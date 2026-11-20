#!/usr/bin/env python3
"""Run the ambition probe: each scenario under three skill texts, judged blind by another model family.

Arms, per scenario:
  current  the skill text at --base (the skill that served this task before the change, `base_skill`)
  new      the skill text at --head (`skill`; WORKTREE reads the working tree)
  control  control.md cut to the new text's word count, so length alone cannot explain a difference

The agent is the Claude Code CLI on its own login (ANTHROPIC_API_KEY removed, no settings), given the arm's
text as the loaded skill. With --agent-tools none it has no tools. With --agent-tools search it has web
search, web fetch and read-only file tools, in a snapshot of the arm's revision of this repository (the
current arm reads --base, new and control read --head) with the probe directory removed, so the skill's
relative links resolve and the rubric and earlier replies are out of reach.

The judge (--judge grok or codex, another model family) has no tools and is given one task and one reply at a
time in shuffled order, never the arm, and the rubric in rubric.md. Calls are cached by digest under --out's
directory, so a rerun only makes missing calls.

Scenarios carry a split: `tuned` (the default; skill text may be edited against them) or `heldout` (never
used to edit text). The summary reports every split, and each skill, separately.

usage: run.py [--base origin/main] [--head WORKTREE] [--samples 2] [--jobs 6] [--agent-model opus]
              [--agent-tools none|search] [--arms current,new,control] [--only A01,A02] [--split tuned|heldout]
              [--judge grok|codex] --out results/<stamp>.json
       run.py --table results/<stamp>.json
"""
import argparse, concurrent.futures, hashlib, json, math, os, pathlib, random, re, shutil, subprocess, tempfile, time

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
PROBES = "claude/skills/_probes"
REPLY = ("reply with what you will do: your first concrete steps, what you will measure and against what, "
         "and what you will build. At most 450 words.")
SYSTEM = ("You are a coding agent working in the user's repository. The harness loaded the skill below for this "
          "task; follow it.\n\n<skill>\n{skill}\n</skill>\n\nThis turn has no tools. Reply with what you will do: "
          "your first concrete steps, what you will measure and against what, and what you will build. "
          "At most 450 words.")
SYSTEM_TOOLS = ("You are a coding agent working in the user's repository. The harness loaded the skill below for "
                "this task; follow it.\n\n<skill>\n{skill}\n</skill>\n\nThis turn has read-only tools: WebSearch, "
                "WebFetch, Read, Grep and Glob. The working directory is a read-only copy of the repository that "
                "holds the team's skills and process docs{location}. The product the task describes is not in it; "
                "its numbers are as the task states. Use the tools as the skill directs, then " + REPLY)
SEARCH_TOOLS = ["WebSearch", "WebFetch", "Read", "Grep", "Glob"]
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


def snapshot(rev, root):
    """A read-only copy of the tracked files at rev (WORKTREE: as they are on disk), without the probe directory.

    Returns (path, content digest); the digest keys the agent cache, so a changed linked file is a new call."""
    git = lambda *a: subprocess.run(["git", "-C", str(REPO), *a], check=True, capture_output=True).stdout
    if rev == "WORKTREE":
        names = [n for n in git("ls-files", "-z").decode().split("\0") if n and (REPO / n).is_file()]
        files = {n: (REPO / n).read_bytes() for n in names}
    else:
        files = {}
        with tempfile.TemporaryDirectory(prefix="ambition-archive-") as tmp:
            subprocess.run(f"git -C {str(REPO)!r} archive {rev} | tar -x -C {tmp!r}", shell=True, check=True)
            for p in pathlib.Path(tmp).rglob("*"):
                if p.is_file() and not p.is_symlink():
                    files[str(p.relative_to(tmp))] = p.read_bytes()
    files = {n: b for n, b in files.items() if not n.startswith(PROBES + "/")}
    key = digest(*(f"{n}\x01{hashlib.sha256(b).hexdigest()}" for n, b in sorted(files.items())))
    dest = root / key
    if not dest.exists():
        stage = root / f".{key}.{os.getpid()}"
        for n, b in files.items():
            (stage / n).parent.mkdir(parents=True, exist_ok=True)
            (stage / n).write_bytes(b)
        for p in stage.rglob("*"):
            p.chmod(0o555 if p.is_dir() else 0o444)
        try:
            stage.rename(dest)
        except OSError:  # another worker finished the same snapshot first
            shutil.rmtree(stage, ignore_errors=True)
    return dest, key


def agent_env():
    return {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")}


def call_agent(model, skill, task):
    cmd = ["claude", "-p", "--model", model, "--output-format", "json", "--system-prompt", SYSTEM.format(skill=skill),
           "--tools", "", "--setting-sources", "", "--strict-mcp-config", "--no-session-persistence"]
    with tempfile.TemporaryDirectory(prefix="ambition-agent-") as cwd:
        proc = subprocess.run(cmd, input=task, capture_output=True, text=True, env=agent_env(), cwd=cwd, timeout=900)
    if proc.returncode != 0:
        raise RuntimeError(f"agent exited {proc.returncode}: {(proc.stderr or proc.stdout)[-500:]}")
    env_ = json.loads(proc.stdout)
    if env_.get("is_error"):
        raise RuntimeError(f"agent error: {str(env_.get('result'))[:500]}")
    return {"reply": env_["result"], "served": sorted((env_.get("modelUsage") or {}).keys())}


def call_agent_tools(model, skill, task, cwd, location):
    """The agent with search and read-only file tools; returns the final reply and every tool call it made."""
    system = SYSTEM_TOOLS.format(skill=skill, location=location)
    cmd = ["claude", "-p", "--model", model, "--output-format", "stream-json", "--verbose", "--system-prompt", system,
           "--tools", ",".join(SEARCH_TOOLS), "--allowedTools", "WebSearch", "WebFetch", "--restricted",
           "--permission-prompts", "none",
           "--setting-sources", "", "--strict-mcp-config", "--no-session-persistence"]
    proc = subprocess.run(cmd, input=task, capture_output=True, text=True, env=agent_env(), cwd=cwd, timeout=1800)
    events = [json.loads(line) for line in proc.stdout.splitlines() if line.startswith("{")]
    result = next((e for e in reversed(events) if e.get("type") == "result"), None)
    if proc.returncode != 0 or result is None:
        raise RuntimeError(f"agent exited {proc.returncode}: {(proc.stderr or proc.stdout)[-500:]}")
    if result.get("is_error"):
        raise RuntimeError(f"agent error: {str(result.get('result'))[:500]}")
    calls = []
    for e in events:
        for block in (e.get("message") or {}).get("content") or [] if e.get("type") == "assistant" else []:
            if isinstance(block, dict) and block.get("type") == "tool_use":
                inp = block.get("input") or {}
                calls.append({"tool": block.get("name"),
                              "arg": str(inp.get("query") or inp.get("url") or inp.get("file_path") or inp.get("pattern") or "")[:200]})
    return {"reply": result["result"], "served": sorted((result.get("modelUsage") or {}).keys()),
            "turns": result.get("num_turns"), "tool_calls": calls}


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


def arm_counts(rs):
    return {"n": len(rs), **{q: sum(r["judgment"][q] for r in rs) for q in QUESTIONS},
            "all3": sum(all(r["judgment"][q] for q in QUESTIONS) for r in rs)}


def summarize(rows, arms):
    """Per-arm counts, and new against each other arm paired by scenario and sample, per question and pooled.

    The pooled row treats a reply's three questions as independent, which they are not; read the per-question rows."""
    rows = [r for r in rows if "judgment" in r]
    table = {arm: arm_counts([r for r in rows if r["arm"] == arm]) for arm in arms}
    pairs = {}
    if "new" in arms:
        key = lambda r: (r["scenario"], r["sample"])
        mine = {key(r): r for r in rows if r["arm"] == "new"}
        for other in [a for a in arms if a != "new"]:
            theirs = {key(r): r for r in rows if r["arm"] == other}
            shared = mine.keys() & theirs.keys()
            per_q, b, c = {}, 0, 0
            for q in QUESTIONS:
                bq = sum(mine[k]["judgment"][q] and not theirs[k]["judgment"][q] for k in shared)
                cq = sum(theirs[k]["judgment"][q] and not mine[k]["judgment"][q] for k in shared)
                per_q[q] = {"new_only": bq, f"{other}_only": cq, "mcnemar_exact_p": float(f"{exact_binomial_two_sided(bq, cq):.3g}")}
                b, c = b + bq, c + cq
            pairs[f"new_vs_{other}"] = {"paired_items": 3 * len(shared), "new_only": b, f"{other}_only": c,
                                         "mcnemar_exact_p": float(f"{exact_binomial_two_sided(b, c):.3g}"), "per_question": per_q}
    return {"arms": table, "paired": pairs}


def summarize_all(rows, arms):
    out = summarize(rows, arms)
    splits = sorted({r.get("split", "tuned") for r in rows})
    if len(splits) > 1:
        out["by_split"] = {s: summarize([r for r in rows if r.get("split", "tuned") == s], arms) for s in splits}
    out["by_skill"] = {}
    for s in splits:
        for skill in sorted({r["skill"] for r in rows if r.get("split", "tuned") == s}):
            rs = [r for r in rows if "judgment" in r and r["skill"] == skill and r.get("split", "tuned") == s]
            out["by_skill"][f"{s}/{skill}"] = {arm: arm_counts([r for r in rs if r["arm"] == arm]) for arm in arms}
    return out


def arm_table(s, arms):
    lines = ["| Arm | n | Q1 best known result | Q2 target above our number | Q3 mechanism change | All three |",
             "|---|---|---|---|---|---|"]
    for arm in arms:
        a = s["arms"][arm]
        cell = lambda k: f"{a[k]}/{a['n']} ({100 * a[k] / a['n']:.0f}%)" if a["n"] else "0/0"
        lines.append(f"| {arm} | {a['n']} | {cell('q1')} | {cell('q2')} | {cell('q3')} | {cell('all3')} |")
    lines += ["", "| Paired comparison | Question | Only new YES | Only other YES | McNemar exact p |", "|---|---|---|---|---|"]
    for k, v in s["paired"].items():
        other = [x for x in v if x.endswith("_only") and x != "new_only"][0]
        for q, pq in (v.get("per_question") or {}).items():
            lines.append(f"| {k} | {q.upper()} | {pq['new_only']} | {pq[other]} | {pq['mcnemar_exact_p']} |")
    return lines


def markdown(result):
    """The per-arm and paired tables for a result file, overall and per split, as committed under results/."""
    s, arms = result["summary"], list(result["summary"]["arms"])
    lines = [f"Base `{result['base'][:12]}`, head `{result['head'][:12]}`, agent `{result['agent_model']}` "
             f"(tools: {result.get('agent_tools', 'none')}), judge `{result.get('judge', 'codex')}`, "
             f"{result['samples']} samples per scenario, measured {result['measured_at']}.", ""]
    if "by_split" in s:
        for split, sub in s["by_split"].items():
            lines += [f"**{split}**", ""] + arm_table(sub, arms) + [""]
    else:
        lines += arm_table(s, arms) + [""]
    if s.get("by_skill"):
        lines += ["| Split/skill | " + " | ".join(f"{a} Q1 / all three" for a in arms) + " |",
                  "|---|" + "---|" * len(arms)]
        for k, v in s["by_skill"].items():
            lines.append(f"| {k} | " + " | ".join(f"{v[a]['q1']}/{v[a]['n']} / {v[a]['all3']}/{v[a]['n']}" for a in arms) + " |")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--table", help="print the Markdown table for an existing result file and exit")
    ap.add_argument("--base", default="origin/main")
    ap.add_argument("--head", default="WORKTREE")
    ap.add_argument("--samples", type=int, default=2)
    ap.add_argument("--jobs", type=int, default=6)
    ap.add_argument("--agent-model", default="opus")
    ap.add_argument("--agent-tools", choices=["none", "search"], default="none")
    ap.add_argument("--arms", default="current,new,control")
    ap.add_argument("--only", default="")
    ap.add_argument("--split", default="", help="run only scenarios of this split (tuned or heldout)")
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
    if args.split:
        scenarios = [s for s in scenarios if s.get("split", "tuned") == args.split]
    checkouts = {}
    if args.agent_tools == "search":
        root = cache_dir / "checkouts"
        root.mkdir(exist_ok=True)
        for rev in {args.base if a == "current" else args.head for a in arms}:
            checkouts[rev] = snapshot(rev, root)

    jobs = []
    for s in scenarios:
        new = skill_text(args.head, s["skill"]) if ("new" in arms or "control" in arms) else None
        texts = {"current": lambda s=s: skill_text(args.base, s["base_skill"]), "new": lambda: new,
                 "control": lambda: control_text(len(new.split()))}
        for arm in arms:
            text = texts[arm]()
            rev = args.base if arm == "current" else args.head
            name = {"current": s["base_skill"], "new": s["skill"]}.get(arm)
            for sample in range(args.samples):
                jobs.append({"scenario": s["id"], "split": s.get("split", "tuned"), "skill": s["skill"], "arm": arm,
                             "sample": sample, "task": s["task"], "words": len(text.split()), "text_digest": digest(text),
                             "text": text, "rev": rev,
                             "location": f"; the skill's file is claude/skills/{name}/SKILL.md, so its relative links resolve from there" if name else ""})

    def agent(job):
        if args.agent_tools == "none":
            key = digest(args.agent_model, job["text_digest"], job["task"], str(job["sample"]))
        else:
            cwd, tree = checkouts[job["rev"]]
            key = digest(args.agent_model, "tools:" + args.agent_tools, tree, job["location"], job["text_digest"], job["task"], str(job["sample"]))
        path = cache_dir / f"agent-{key}.json"
        if not path.exists():
            reply = (call_agent(args.agent_model, job["text"], job["task"]) if args.agent_tools == "none" else
                     call_agent_tools(args.agent_model, job["text"], job["task"], cwd, job["location"]))
            path.write_text(json.dumps(reply))
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
    # Snapshot paths name this machine's scratch directory; keep them relative to the snapshot.
    local = re.compile("|".join(re.escape(str(p)) for p in {cache_dir / "checkouts", cache_dir.resolve() / "checkouts"})
                       + r"/[0-9a-f]{16}/?")
    for r in rows:
        r.pop("text", None)
        r.pop("location", None)
        r["reply"] = local.sub("", r["reply"])
        for c in r.get("tool_calls", []):
            c["arg"] = local.sub("", c["arg"])
    rows.sort(key=lambda r: (r.get("split", "tuned"), r["scenario"], r["arm"], r["sample"]))
    rev = lambda r: subprocess.run(["git", "-C", str(REPO), "rev-parse", r], capture_output=True, text=True).stdout.strip()
    result = {"base": rev(args.base), "head": args.head if args.head == "WORKTREE" else rev(args.head),
              "head_commit": rev("HEAD"), "agent_model": args.agent_model, "agent_tools": args.agent_tools,
              "snapshots": {k: v[1] for k, v in checkouts.items()}, "judge": args.judge, "samples": args.samples,
              "measured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "summary": summarize_all(rows, arms), "rows": rows}
    out.write_text(json.dumps(result, indent=1))
    print(json.dumps(result["summary"], indent=1))


if __name__ == "__main__":
    main()
