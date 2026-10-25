"""Warn before `gh pr merge` / `gh-drew pr merge` when a PR's head commit is not green.

A merge-queue session once merged 18 agent-dev-container PRs in one loop. Its red filter read only check-run `conclusion`
and missed commit statuses (`signoff/local` reports a `state`), so #10102 (signoff failure),
#10079 (failure), #10106 (mixed) and #10110 (pending) looked green. develop enforces nothing:
branch protection is not available on that plan.

This never blocks: Drew's instruction to merge stands, and the session shows him the truth first.
For every PR a command merges, including through a `for` loop, `while read`, or `xargs`, it reads
the head commit's statusCheckRollup, which holds both check runs (conclusion) and commit statuses
(state), in one GraphQL request, and lists each PR that is red or pending, and why: a failed or
cancelled check run, a failed commit status, or a signoff/* or revision-receipt status not yet
passed. GitHub CI check runs still running stay quiet on their own: the merge gate is the local
Beelink signoff and PR CI is never awaited; they are listed only beside another finding.

Loop and xargs inputs are read when they are literal, or come from a short pipeline of read-only
text tools over local files (`awk` without system, getline or redirection, grep, cut, cat, head,
tail, sort, uniq, tr, jq), run with a 3 s timeout. Anything else is reported as not checked.

Called from process_guard.py, which owns the shell parsing. CC_GUARD_GH replaces the gh binary in
tests; CC_GUARD_NO_MERGE_CHECK=1 turns the check off.
"""
import json
import os
import re
import shutil
import subprocess

SAFE_TEXT = {"awk", "grep", "egrep", "cut", "cat", "head", "tail", "sort", "uniq", "tr", "jq"}
AWK_UNSAFE = re.compile(r"system|getline|close|fflush|[|>]")
VALUE_FLAGS = {"-R", "--repo", "-t", "--subject", "-b", "--body", "-F", "--body-file", "--match-head-commit",
               "-A", "--author-email"}
PR_URL = re.compile(r"github\.com/([^/\s]+/[^/\s]+)/pull/(\d+)")
RED_CONCLUSIONS = {"FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE", "STALE"}
OK_CONCLUSIONS = {"SUCCESS", "NEUTRAL", "SKIPPED"}
RED_STATES = {"FAILURE", "ERROR"}
PENDING_STATES = {"PENDING", "EXPECTED"}


def expand(word, env):
    m = re.fullmatch(r"\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?", word)
    if m:
        return env.get(m.group(1))
    return None if "$" in word else word


def run_safe(argv, cwd, env, stdin):
    """stdout of one read-only text tool, or None when it is not one or fails."""
    if not argv or os.path.basename(argv[0]) not in SAFE_TEXT:
        return None
    prog = os.path.basename(argv[0])
    args, program_seen, rest = [], False, argv[1:]
    k = 0
    while k < len(rest):
        a = rest[k]
        if prog == "awk" and not program_seen:
            if a in ("-F", "-v") and k + 1 < len(rest):
                args += [a, rest[k + 1]]
                k += 2
                continue
            if a.startswith("-f") or a == "--file":
                return None  # a program file could do anything
            if a.startswith("-"):
                args.append(a)
                k += 1
                continue
            if AWK_UNSAFE.search(a):
                return None
            args.append(a)  # the program: its $1 fields belong to awk, not the shell
            program_seen = True
            k += 1
            continue
        if re.fullmatch(r"\$\{?[A-Za-z_][A-Za-z0-9_]*\}?", a):
            a = expand(a, env)
            if a is None:
                return None
        args.append(a)
        k += 1
    try:
        r = subprocess.run([shutil.which(prog) or prog, *args], input=stdin, capture_output=True, text=True,
                           cwd=cwd if cwd and os.path.isdir(cwd) else None, timeout=3)
    except Exception:
        return None
    return r.stdout[:65536] if r.returncode in (0, 1) else None


def run_chain(chain, cwd, env):
    text = None
    for argv in chain:
        prog = os.path.basename(argv[0]) if argv else ""
        if prog == "echo":
            text = " ".join(a for a in argv[1:] if a not in ("-n", "-e", "-E")) + "\n"
        elif prog == "printf" and len(argv) > 1:
            fmt, rest = argv[1], argv[2:]
            text = "\n".join(rest) + "\n" if re.fullmatch(r"%s\\n|%s |%s\\n%s|%d\\n", fmt) else (None if rest else fmt)
        else:
            text = run_safe(argv, cwd, env, text)
        if text is None:
            return None
    return text


def substitution_text(word, cwd, env):
    """Run a `$(...)` of read-only text tools; None when it is anything else."""
    from process_guard import lex, strip_prefix
    if not (word.startswith("$(") and word.endswith(")")):
        return None
    chain = []
    for seg in lex(word[2:-1]):
        if seg.writes or seg.heredocs or (chain and not seg.pipe_in):
            return None
        _, argv = strip_prefix(seg.words)
        chain.append(argv)
    return run_chain(chain, cwd, env)


def loop_values(spec):
    kind, data, cwd, env = spec
    if kind == "chain":
        text = run_chain(data, cwd, env)
        return text.split() if text is not None else None
    values = []
    for w in data:
        if w.startswith("$("):
            text = substitution_text(w, cwd, env)
            if text is None:
                return None
            values += text.split()
        elif "$" in w:
            v = expand(w, env)
            if v is None:
                return None
            values += v.split()
        else:
            values.append(w)
    return values


def target_values(word, cmd):
    """Concrete merge targets one argv word stands for, or None when they cannot be read."""
    m = re.fullmatch(r"\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?", word)
    if m:
        name = m.group(1)
        if name in cmd.loops:
            return loop_values(cmd.loops[name])
        value = cmd.env.get(name)
        if value and value.startswith("$(") and value.endswith(")"):
            text = substitution_text(value, cmd.cwd, cmd.env)
            return text.split() if text is not None else None
        if not value or "$" in value or "`" in value:
            return None  # set from something this check cannot run
        return value.split()
    if "$" in word or "`" in word:
        return None
    return [word]


def git_repo(cwd):
    try:
        url = subprocess.run(["git", "-C", cwd, "remote", "get-url", "origin"], capture_output=True, text=True,
                             timeout=5).stdout.strip()
    except Exception:
        return None
    m = re.search(r"github\.com[:/]([^/\s]+/[^/\s]+?)(?:\.git)?$", url)
    return m.group(1) if m else None


def current_branch(cwd):
    try:
        return subprocess.run(["git", "-C", cwd, "symbolic-ref", "--short", "-q", "HEAD"], capture_output=True,
                              text=True, timeout=5).stdout.strip() or None
    except Exception:
        return None


def merge_targets(cmd):
    """[(repo, number-or-branch)] for one gh merge command, plus a list of what could not be read."""
    args = cmd.argv[1:]
    pos, repo, i = [], None, 0
    while i < len(args):
        a = args[i]
        if a in VALUE_FLAGS:
            if a in ("-R", "--repo") and i + 1 < len(args):
                repo = expand(args[i + 1], cmd.env) if "$" in args[i + 1] else args[i + 1]
            i += 2
            continue
        if a.startswith("--repo="):
            repo = a.split("=", 1)[1]
        elif not a.startswith("-"):
            pos.append(a)
        i += 1
    if pos[:2] != ["pr", "merge"]:
        return [], []
    words = pos[2:3]
    unread = []
    if not words or words[0] in ("{}",):
        if cmd.via_xargs and cmd.upstream:
            text = run_chain(cmd.upstream, cmd.cwd, cmd.env)
            words = text.split() if text is not None else None
            if words is None:
                return [], ["the PR list piped into xargs"]
        elif not words and cmd.cwd and not cmd.remote:
            branch = current_branch(cmd.cwd)
            words = [branch] if branch else []
    targets = []
    for word in words:
        values = target_values(word, cmd)
        if values is None:
            unread.append(f"`{word}`")
            continue
        for v in values:
            m = PR_URL.search(v)
            if m:
                targets.append((m.group(1), m.group(2)))
                continue
            r = repo or (git_repo(cmd.cwd) if cmd.cwd and not cmd.remote else None)
            r = r.rstrip("/").removeprefix("https://github.com/") if r else None
            if not r or not re.fullmatch(r"[\w.-]+/[\w.-]+", r):
                unread.append(f"#{v} (no readable --repo)")
                continue
            if not re.fullmatch(r"#?\d+|[\w./-]+", v):
                unread.append(f"`{v}`")
                continue
            targets.append((r, v.lstrip("#")))
    return targets, unread


ROLLUP = ("commits(last:1){nodes{commit{oid statusCheckRollup{state contexts(first:100){nodes{__typename "
          "... on CheckRun{name status conclusion startedAt completedAt} "
          "... on StatusContext{context state createdAt}}}}}}}")


def query(targets):
    by_repo = {}
    for repo, t in targets:
        by_repo.setdefault(repo, []).append(t)
    parts, aliases = [], {}
    for ri, (repo, items) in enumerate(sorted(by_repo.items())):
        owner, name = repo.split("/", 1)
        fields = []
        for ti, t in enumerate(dict.fromkeys(items)):
            alias = f"p{ti}"
            aliases[(f"r{ri}", alias)] = (repo, t)
            if t.isdigit():
                fields.append(f"{alias}: pullRequest(number:{int(t)}){{number {ROLLUP}}}")
            else:
                fields.append(f"{alias}: pullRequests(headRefName:{json.dumps(t)}, first:1, "
                              f"orderBy:{{field:CREATED_AT, direction:DESC}}){{nodes{{number {ROLLUP}}}}}")
        parts.append(f"r{ri}: repository(owner:{json.dumps(owner)}, name:{json.dumps(name)}){{{' '.join(fields)}}}")
    gh = os.environ.get("CC_GUARD_GH") or shutil.which("gh-drew") or shutil.which("gh") or "gh"
    r = subprocess.run([gh, "api", "graphql", "-f", "query={" + " ".join(parts) + "}"], capture_output=True,
                       text=True, timeout=20)
    data = json.loads(r.stdout or "{}").get("data") or {}
    results = {}
    for (ralias, alias), key in aliases.items():
        node = (data.get(ralias) or {}).get(alias)
        if isinstance(node, dict) and "nodes" in node:
            node = (node.get("nodes") or [None])[0]
        results[key] = node
    return results


def gate_status(context):
    """The commit statuses that are the merge gate: the local signoff and the revision receipt."""
    return context.startswith("signoff/") or "revision-receipt" in context


def classify_status(context, state):
    """"red", "pending" (a gate status not finished), "quiet" (another status not finished), or None."""
    if state in RED_STATES:
        return "red"
    if state in PENDING_STATES:
        return "pending" if gate_status(context) else "quiet"
    return None


def verdict(node, as_of=None):
    """(red, pending, quiet, sha) for one PR node.

    red: a failed or cancelled check run, or a failed commit status. pending: a gate status (signoff/*,
    revision receipt) not finished. quiet: GitHub CI check runs still running and other unfinished statuses;
    the merge gate is the local signoff and PR CI is not awaited, so these alone never warn.
    A re-run supersedes an earlier run of the same check, so only the latest run per check name counts.
    `as_of` (ISO time, for replays) judges each check as it stood then: a run started later is ignored, and
    one that completed later was still running."""
    commits = (((node or {}).get("commits") or {}).get("nodes") or [])
    commit = (commits[0] or {}).get("commit") if commits else None
    if not commit:
        return None
    rollup = commit.get("statusCheckRollup")
    found = {"red": [], "pending": [], "quiet": []}
    runs = {}
    for c in ((rollup or {}).get("contexts") or {}).get("nodes") or []:
        if c.get("__typename") == "CheckRun":
            started = c.get("startedAt") or ""
            if as_of and started > as_of:
                continue
            name = c.get("name")
            if name not in runs or started >= (runs[name].get("startedAt") or ""):
                runs[name] = c
        elif c.get("__typename") == "StatusContext":
            context = c.get("context") or ""
            if as_of and (c.get("createdAt") or "") > as_of:
                found["pending" if gate_status(context) else "quiet"].append(
                    f"{context}=later than the merge; see status history (commit status)")
                continue
            kind = classify_status(context, c.get("state"))
            if kind:
                found[kind].append(f"{context}={c.get('state', '').lower()} (commit status)")
    for name, c in runs.items():
        done = c.get("status") == "COMPLETED" and not (as_of and (c.get("completedAt") or "") > as_of)
        if not done:
            state = "in_progress" if c.get("status") == "COMPLETED" else (c.get("status") or "").lower()
            found["quiet"].append(f"{name}={state} (check run)")
        elif c.get("conclusion") in RED_CONCLUSIONS:
            found["red"].append(f"{name}={c.get('conclusion', '').lower()} (check run)")
        elif c.get("conclusion") not in OK_CONCLUSIONS:
            found["quiet"].append(f"{name}={str(c.get('conclusion')).lower()} (check run)")
    return found["red"], found["pending"], found["quiet"], commit.get("oid", "")[:10]


def warnings(cmds, payload, as_of=None):
    if os.environ.get("CC_GUARD_NO_MERGE_CHECK") == "1":
        return []
    targets, unread = [], []
    for cmd in cmds:
        if cmd.prog in ("gh", "gh-drew"):
            t, u = merge_targets(cmd)
            targets += t
            unread += u
    targets = list(dict.fromkeys(targets))
    if not targets and not unread:
        return []
    lines = []
    results = query(targets) if targets else {}
    flagged = 0
    for repo, t in targets:
        node = results.get((repo, t))
        v = verdict(node, as_of)
        label = f"{repo}#{node.get('number') if node else t}"
        if v is None:
            lines.append(f"- {label}: not found or unreadable")
            flagged += 1
            continue
        red, pending, quiet, sha = v
        if red or pending:
            flagged += 1
            state = "red" if red else "pending"
            line = f"- {label} at {sha}: {state}: " + "; ".join(red + pending)
            if quiet:
                line += "; also still running: " + "; ".join(quiet)
            lines.append(line)
    if unread:
        lines.append("- not checked (PR list not readable from the command): " + ", ".join(dict.fromkeys(unread)))
    if not lines:
        return []
    head = (f"merge-check: {flagged} of {len(targets)} PR(s) this command merges are not green on their head commit "
            "(failed or cancelled check runs, failed commit statuses, and signoff or revision-receipt statuses "
            "not yet passed; GitHub CI still running is not awaited):")
    tail = ("Merging is not blocked. If Drew asked for this merge, show him this list before you run it; "
            "otherwise fix or wait for these checks first.")
    return ["\n".join([head, *lines, tail])]
