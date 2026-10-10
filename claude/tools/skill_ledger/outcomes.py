"""Machine-checked outcomes for skill runs, climb.md's strongest reward.

A run's pull requests are judged on GitHub: merged, reverted or hot-fixed within 7 days, CI red
on the merge commit, and served (a successful deployment of the merge commit). Snapshots are
appended to ${XDG_STATE_HOME:-~/.local/state}/agent-work/_outcomes/prs.jsonl, one per check;
the latest snapshot of a PR wins. A PR whose outcome is final is not checked again.

GitHub calls go through gh-drew, so they run as drewstone and respect its quota floor.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import subprocess

from . import core as L

WINDOW = dt.timedelta(days=7)
RECHECK = dt.timedelta(hours=20)
# Snapshots judged by another rule are judged again. Measured on 152 PRs from the 2026-10-05..10
# runs: any later fix touching a shared file (v1) flagged 89, mostly busy repos refixing shared
# files; any mention of the PR (v2) flagged 24, but 9 of a 12-PR sample were context or a cited base
# commit. outcome-v3 counts a fix only when it names the PR as the cause: "fixes #N", "since #N",
# "after #N", "#N broke", and a revert only when it names the PR or its title. On that set it
# flagged 6, all genuine follow-ups. outcome-v4 keeps those rules and checks a snapshot again until
# its 7-day window closes, so a green re-run after a red merge is seen. outcome-v5 counts red CI only
# when the merge turned the base red: 103 of 261 PRs merged onto a red merge commit, and a PR merged
# onto an already-red base did not cause it.
RULE = "outcome-v5"
_REVERT_TITLE = re.compile(r'^\s*(revert\b|revert[(:!]|Revert ")', re.I)
_FIX_TITLE = re.compile(r"^\s*(fix|hotfix)(\([^)]*\))?!?:|\bhot-?fix\b", re.I)


def outcomes_path():
    return L.state_root() / "_outcomes" / "prs.jsonl"


def gh_graphql(query: str, timeout: int = 60):
    """(data, error) from one GraphQL call through gh-drew."""
    binary = L.which("gh-drew")
    if not binary:
        return None, "gh-drew not found"
    try:
        done = subprocess.run([binary, "api", "graphql", "-f", f"query={query}"],
                              capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.SubprocessError) as error:
        return None, str(error)
    try:
        body = json.loads(done.stdout or "{}")
    except json.JSONDecodeError:
        return None, (done.stderr or done.stdout).strip()[-300:]
    if body.get("errors") and not body.get("data"):
        return None, json.dumps(body["errors"])[:300]
    return body.get("data"), None


def _quote(text: str) -> str:
    return json.dumps(text)


_PR_FIELDS = """number title body state merged mergedAt closedAt url author { login }
files(first: 100) { nodes { path } }
mergeCommit { oid statusCheckRollup { state } parents(first: 1) { nodes { statusCheckRollup { state } } }
  deployments(last: 10) { nodes { environment latestStatus { state } } } }"""


def fetch_prs(refs: list[dict]) -> tuple[dict, list[str]]:
    """{(repo lower, number): pull request} for each ref, 20 per GraphQL call."""
    found, errors = {}, []
    refs = L.merge_refs(refs)
    for offset in range(0, len(refs), 20):
        chunk = refs[offset:offset + 20]
        parts = []
        for index, ref in enumerate(chunk):
            owner, _, name = ref["repo"].partition("/")
            parts.append(f"p{index}: repository(owner: {_quote(owner)}, name: {_quote(name)}) "
                         f"{{ pullRequest(number: {int(ref['number'])}) {{ {_PR_FIELDS} }} }}")
        data, error = gh_graphql("query { " + " ".join(parts) + " }")
        if error and not data:
            errors.append(error)
            continue
        for index, ref in enumerate(chunk):
            node = ((data or {}).get(f"p{index}") or {}).get("pullRequest")
            if node:
                found[(ref["repo"].lower(), int(ref["number"]))] = {**node, "repo": ref["repo"]}
    return found, errors


def merged_between(repo: str, start: dt.datetime, end: dt.datetime) -> tuple[list[dict], str | None]:
    """Pull requests merged into `repo` in [start, end], up to 1,000."""
    query_text = f"repo:{repo} is:pr is:merged merged:{start.date().isoformat()}..{end.date().isoformat()}"
    out, cursor = [], None
    for _ in range(10):
        after = f", after: {_quote(cursor)}" if cursor else ""
        data, error = gh_graphql(
            f"query {{ search(query: {_quote(query_text)}, type: ISSUE, first: 100{after}) {{ "
            "pageInfo { hasNextPage endCursor } nodes { ... on PullRequest { number title body mergedAt "
            "files(first: 100) { nodes { path } } } } } }")
        if error:
            return out, error
        search = (data or {}).get("search") or {}
        out.extend(n for n in search.get("nodes") or [] if n)
        page = search.get("pageInfo") or {}
        if not page.get("hasNextPage"):
            break
        cursor = page.get("endCursor")
    return out, None


def revert_commits(repo: str, start: dt.datetime, end: dt.datetime) -> tuple[list[dict], str | None]:
    """Default-branch commits in [start, end] whose message says "This reverts commit", up to 500 scanned."""
    owner, _, name = repo.partition("/")
    out, cursor = [], None
    for _ in range(5):
        after = f", after: {_quote(cursor)}" if cursor else ""
        data, error = gh_graphql(
            f"query {{ repository(owner: {_quote(owner)}, name: {_quote(name)}) {{ defaultBranchRef {{ target {{ "
            f"... on Commit {{ history(first: 100, since: {_quote(L.iso(start))}, until: {_quote(L.iso(end))}{after}) {{ "
            "pageInfo { hasNextPage endCursor } nodes { oid message committedDate } } } } } } }")
        if error:
            return out, error
        target = ((((data or {}).get("repository") or {}).get("defaultBranchRef") or {}).get("target")) or {}
        history = target.get("history") or {}
        for node in history.get("nodes") or []:
            if node and "This reverts commit" in (node.get("message") or ""):
                out.append({"sha": node.get("oid"), "message": node.get("message"), "date": node.get("committedDate")})
        page = history.get("pageInfo") or {}
        if not page.get("hasNextPage"):
            break
        cursor = page.get("endCursor")
    return out, None


# Files most changes touch; sharing one of them does not make a later fix a fix of this PR.
_SHARED = re.compile(r"(^|/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|Cargo\.lock|go\.sum|"
                     r"CHANGELOG\.md|README\.md|[^/]*\.lock)$")


def _paths(node) -> set:
    return {f.get("path") for f in ((node or {}).get("files") or {}).get("nodes") or []
            if f and f.get("path") and not _SHARED.search(f["path"])}


_CAUSE_BEFORE = r"(?:fix(?:es|ed)?|regress\w*|introduced\s+(?:in|by)|broken\s+(?:in|by)|broke\s+in|since|after|follow[- ]?up\s+(?:to|on|for)|caused\s+by)"
_CAUSE_AFTER = r"(?:broke|broken|removed|introduced|regressed|caused|left|missed|dropped)"


def _caused_by(text: str, number: int) -> bool:
    """Whether a later fix names this PR as the cause of what it fixes."""
    return bool(re.search(rf"\b{_CAUSE_BEFORE}\s+#{number}\b", text, re.I)
                or re.search(rf"(?<![\w/])#{number}\s+{_CAUSE_AFTER}\b", text, re.I))


def _reverts(text: str, pr: dict, number: int) -> bool:
    title = (pr.get("title") or "").strip()
    return bool(re.search(rf"(?<![\w/])#{number}\b", text) or f"/pull/{number}" in text
                or (len(title) >= 12 and title in text))


def judge_pr(pr: dict, followups: list[dict], reverts: list[dict], at: dt.datetime) -> dict:
    """One snapshot: the PR's state and every machine-checked signal climb.md names."""
    merged_at = L.parse_ts(pr.get("mergedAt"))
    commit = pr.get("mergeCommit") or {}
    oid = commit.get("oid") or ""
    deployments = ((commit.get("deployments") or {}).get("nodes")) or []
    states = [((d or {}).get("latestStatus") or {}).get("state") for d in deployments]
    served = True if "SUCCESS" in states else (False if states else None)
    ci = (commit.get("statusCheckRollup") or {}).get("state")
    parents = ((commit.get("parents") or {}).get("nodes")) or []
    ci_before = ((parents[0] or {}).get("statusCheckRollup") or {}).get("state") if parents else None
    snapshot = {
        "repo": pr["repo"], "number": pr["number"], "checkedAt": L.iso(at), "title": pr.get("title"),
        "state": pr.get("state"), "merged": bool(pr.get("merged")), "mergedAt": pr.get("mergedAt"),
        "author": (pr.get("author") or {}).get("login"), "mergeCommit": oid or None, "closedAt": pr.get("closedAt"),
        "ciAfterMerge": ci, "ciBeforeMerge": ci_before, "served": served, "revertedBy": None, "hotfixedBy": None, "fixTouches": 0,
        "rule": RULE,
    }
    if not merged_at:
        return {**snapshot, **_status(snapshot, at)}
    horizon = merged_at + WINDOW
    files = _paths(pr)
    number = int(pr["number"])
    for other in sorted(followups, key=lambda n: n.get("mergedAt") or ""):
        when = L.parse_ts(other.get("mergedAt"))
        if not when or other.get("number") == number or not (merged_at < when <= horizon):
            continue
        text = f"{other.get('title', '')}\n{other.get('body') or ''}"
        ref = {"number": other["number"], "mergedAt": other.get("mergedAt")}
        if _REVERT_TITLE.search(other.get("title", "")):
            if _reverts(text, pr, number):
                snapshot["revertedBy"] = snapshot["revertedBy"] or ref
        elif _FIX_TITLE.search(other.get("title", "")):
            if _caused_by(text, number):
                snapshot["hotfixedBy"] = snapshot["hotfixedBy"] or ref
            elif files & _paths(other):
                snapshot["fixTouches"] += 1  # context only: busy repos refix shared files constantly
    for commit_row in reverts:
        when = L.parse_ts(commit_row.get("date"))
        if oid and oid in (commit_row.get("message") or "") and when and merged_at < when <= horizon:
            snapshot["revertedBy"] = snapshot["revertedBy"] or {"commit": commit_row.get("sha"), "date": commit_row.get("date")}
    return {**snapshot, **_status(snapshot, at)}


def _status(snapshot: dict, at: dt.datetime) -> dict:
    """Status and signal. A snapshot is final once its 7-day window has closed; until then a
    green re-run, a revert or a hot-fix can still change it, so it is checked again."""
    merged_at = L.parse_ts(snapshot["mergedAt"])
    closed_at = L.parse_ts(snapshot.get("closedAt"))
    anchor = merged_at or (closed_at if snapshot.get("state") == "CLOSED" else None)
    window_closed = bool(anchor and at - anchor >= WINDOW)
    if not snapshot["merged"]:
        if snapshot.get("state") == "CLOSED":
            return {"status": "FAIL", "signal": "closed-unmerged", "windowClosed": window_closed, "final": window_closed}
        return {"status": "PENDING", "signal": "open", "windowClosed": False, "final": False}
    if snapshot["revertedBy"]:
        return {"status": "FAIL", "signal": "reverted-within-7d", "windowClosed": window_closed, "final": True}
    if snapshot["hotfixedBy"]:
        return {"status": "FAIL", "signal": "hot-fixed-within-7d", "windowClosed": window_closed, "final": True}
    if snapshot["ciAfterMerge"] in ("FAILURE", "ERROR") and snapshot.get("ciBeforeMerge") not in ("FAILURE", "ERROR"):
        return {"status": "FAIL", "signal": "ci-red-after-merge", "windowClosed": window_closed, "final": window_closed}
    if window_closed:
        return {"status": "PASS", "signal": "merged-clean-7d", "windowClosed": True, "final": True}
    return {"status": "PENDING", "signal": "merged-window-open", "windowClosed": False, "final": False}


def latest_snapshots(texts) -> dict:
    """{(repo lower, number): latest snapshot} across one or more prs.jsonl contents."""
    latest = {}
    for text in texts:
        for _, _, obj in L.read_jsonl(text or ""):
            if not obj.get("repo") or obj.get("number") is None:
                continue
            key = (obj["repo"].lower(), int(obj["number"]))
            if key not in latest or (obj.get("checkedAt") or "") >= (latest[key].get("checkedAt") or ""):
                latest[key] = obj
    return latest


def run_outcome(prs: list[dict], snapshots: dict) -> dict | None:
    """A run's outcome from its PRs: FAIL if any failed, PASS if all passed, else PENDING.

    `windowClosed` is true when every PR's 7-day window has closed. A pass rate is unbiased only
    over closed windows, because a FAIL can arrive at once while a PASS needs 7 clean days.
    """
    if not prs:
        return None
    judged = []
    for ref in prs:
        snap = snapshots.get((ref["repo"].lower(), int(ref["number"])))
        judged.append({"repo": ref["repo"], "number": int(ref["number"]),
                       "status": snap.get("status") if snap else "PENDING",
                       "signal": snap.get("signal") if snap else "unchecked",
                       "windowClosed": bool(snap and snap.get("windowClosed")),
                       "served": snap.get("served") if snap else None})
    statuses = {j["status"] for j in judged}
    status = "FAIL" if "FAIL" in statuses else ("PASS" if statuses == {"PASS"} else "PENDING")
    served = [j["served"] for j in judged if j["served"] is not None]
    return {"status": status, "signal": ",".join(sorted({j["signal"] for j in judged})),
            "windowClosed": all(j["windowClosed"] for j in judged),
            "served": (all(served) if served else None), "prs": judged}


def join(refs: list[dict], *, at: dt.datetime | None = None, existing: dict | None = None, write: bool = True) -> dict:
    """Check every ref whose latest snapshot is missing, not final, or older than RECHECK."""
    at = at or L.now()
    path = outcomes_path()
    if existing is None:
        try:
            existing = latest_snapshots([path.read_text(encoding="utf-8", errors="replace")])
        except OSError:
            existing = {}
    due = []
    for ref in L.merge_refs(refs):
        snap = existing.get((ref["repo"].lower(), int(ref["number"])))
        if snap and snap.get("rule") == RULE and (
                snap.get("final") or at - (L.parse_ts(snap.get("checkedAt")) or at) < RECHECK):
            continue
        due.append(ref)
    report = {"checked": 0, "due": len(due), "errors": []}
    if not due:
        return report
    prs, errors = fetch_prs(due)
    report["errors"].extend(errors)
    by_repo: dict[str, list] = {}
    for pr in prs.values():
        by_repo.setdefault(pr["repo"].lower(), []).append(pr)
    for repo_prs in by_repo.values():
        repo = repo_prs[0]["repo"]
        merged = [L.parse_ts(p.get("mergedAt")) for p in repo_prs if p.get("mergedAt")]
        followups, reverts = [], []
        if merged:
            start, end = min(merged), min(max(merged) + WINDOW, at)
            followups, error = merged_between(repo, start, end)
            if error:
                report["errors"].append(f"{repo}: {error}")
            reverts, error = revert_commits(repo, start, end)
            if error:
                report["errors"].append(f"{repo} commits: {error}")
        for pr in repo_prs:
            snapshot = judge_pr(pr, followups, reverts, at)
            existing[(pr["repo"].lower(), int(pr["number"]))] = snapshot
            if write:
                L.append_jsonl(path, snapshot)
            report["checked"] += 1
    return report
