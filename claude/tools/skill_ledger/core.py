"""Skill-run ledger, schema 2: the "operator tools" layer's instrument for the climb.

skill-run-log writes rows with this module, skill-scoreboard ranks them and exports climb
positions, and lead-scorecard reads the lead's operating records for the "operator" layer.
The vocabulary is docs/processes/climb.md's: `layer`, `hill`, `prediction`, `outcome`.
Standard library only, so the system python3 on the Mac, GTR and the Beelink WSL hosts runs it.

Files in each repository's state directory, ${XDG_STATE_HOME:-~/.local/state}/agent-work/<repo>/:
  skill-runs.jsonl        append-only originals; schema-1 and schema-2 rows side by side
  skill-runs.v2.jsonl     derived: each schema-1 original normalized and linked to its transcript
                          (skill-run-log --backfill rewrites it; originals are never edited)
  skill-run-events.jsonl  append-only: operator corrections settled after a run
and per host, agent-work/_outcomes/prs.jsonl holds machine-checked pull request snapshots.

A schema-2 row keeps every schema-1 field with its old meaning, except that `verdict` holds one
of VERDICTS and the skill's own label moves to `verdictDetail`. The verdict is the author's own
grade, the weakest reward in climb.md; `outcome` (merged, reverted or hot-fixed within 7 days)
and `operatorOverride` (the operator's reaction) outrank it.
"""

from __future__ import annotations

import datetime as dt
import glob
import hashlib
import json
import os
import re
import shutil
import socket
import subprocess
import uuid
from pathlib import Path

SCHEMA = 2
LAYER_TOOLS = "operator tools"
LAYER_OPERATOR = "operator"
VERDICTS = ("PASS", "FAIL", "PARTIAL", "BLOCKED", "ABANDONED")
VERDICT_MEANING = {
    "PASS": "the target met the skill's completion bar (verified, approved, shipped, cause confirmed, decision made)",
    "FAIL": "the target was checked and did not meet the bar (changes requested, check failed)",
    "PARTIAL": "progress with required work left (iterate, local only, pending deploy, gaps)",
    "BLOCKED": "the run could not finish for something outside it (owner, authorization, access, missing data)",
    "ABANDONED": "stopped, deferred or superseded before a result",
}

RUNS = "skill-runs.jsonl"
BACKFILL = "skill-runs.v2.jsonl"
EVENTS = "skill-run-events.jsonl"
OVERRIDE_METHOD = "lexical-v2"

# Every single-label verdict in the 421 schema-1 rows written 2026-10-05..10 on the Mac and GTR
# (110 distinct labels), mapped by VERDICT_MEANING. Keys are normalized: upper case, runs of
# '-', '_' or spaces folded to '_'. An audit's REQUEST_CHANGES is FAIL because the verdict
# reports the target, not whether the audit ran.
LABEL_VERDICTS = {
    **dict.fromkeys(
        """PASS PASSED APPROVE APPROVED DONE COMPLETE COMPLETED SUCCESS VERIFIED CONFIRMED
        ROOT_CAUSE_CONFIRMED DIAGNOSED FIXED DELIVERED MERGED LIVE SHIPPED KEEP KEEP_CURRENT
        SIMPLIFIED TRIMMED CHOSEN APPLIED REPORTED MEASURED CONTINUE CONTINUED RESUMED CHECKPOINT
        HANDOFF_READY HANDOFF_CURRENT_ACTIVE_GOAL COMPLETED_STATE_VERIFIED IN_SCOPE_GAP_FIXED
        OWNER_IDENTIFIED_HOST_FULL NO_CHANGE CHANGED STOP DEFER ADOPT ADAPT REJECT ADVANCE BUILT""".split(),
        "PASS",
    ),
    **dict.fromkeys(
        """FAIL FAILED REQUEST_CHANGES CORRECTIONS_NEEDED FINDINGS BLOCK REVERT HARNESS_ENDED
        NO_WINNER_HARNESS_GATE PRE_RUNTIME_FAILED""".split(),
        "FAIL",
    ),
    **dict.fromkeys(
        """PARTIAL ITERATE GAP CHECKED_WITH_GAP MIXED INCOMPLETE CANDIDATE LAUNCHED PENDING
        PENDING_DEPLOY WAITING FIXED_LOCAL PASS_LOCAL PASS_WITH_EXTERNAL_LIMIT
        LOCAL_GATE_PASSED_SERVED_PENDING NARROW""".split(),
        "PARTIAL",
    ),
    **dict.fromkeys(
        """BLOCKED BLOCKED_OWNER_PROFILE PARTIAL_BACKEND_BLOCKED HOLD INDETERMINATE INSUFFICIENT_DATA
        UNVERIFIABLE UNMEASURED COMPARISON_UNAVAILABLE UNAVAILABLE_OLD_RELEASE""".split(),
        "BLOCKED",
    ),
    **dict.fromkeys("ABANDONED DEFERRED SUPERSEDED CANCELLED CANCELED".split(), "ABANDONED"),
}

# The schema-1 verdicts written as sentences without a leading label (26 in the 421-row snapshot), keyed by the first 16
# hex digits of the sentence's sha1 so this public repository does not carry their text. Each was
# read in its row and mapped by VERDICT_MEANING: an unfinished served or consumer proof is PARTIAL,
# a completed assessment or verification whose remaining work belongs to another skill is PASS,
# and a release waiting on authorization is BLOCKED. Sentences that begin with a label and a
# colon ("PASS: ...") need no entry; the prefix rule maps them.
SENTENCE_VERDICTS = {
    "2b2cdf4e2c0fc245": "PARTIAL",
    "742d827169bc8880": "PASS",
    "5cf92d3daaf4cb46": "PARTIAL",
    "d95e6a3d2a720a4a": "PARTIAL",
    "91fded05bde32d80": "FAIL",
    "e630fead8b85c122": "PARTIAL",
    "f2ce9e680c0ab65e": "PARTIAL",
    "4cacde9662e566ff": "PARTIAL",
    "5a3a7aca1987b324": "PARTIAL",
    "62fc361f15d6188f": "PASS",
    "a5cd5077a554d4c9": "PASS",
    "b3f2789e00fabf0b": "BLOCKED",
    "9437f80ecdebe637": "PARTIAL",
    "998320f83d1b5674": "PASS",
    "033522dd7533f2ec": "PASS",
    "11572ba5f8148250": "PARTIAL",
    "cbca96bbd63e7628": "PASS",
    "4b0d4a38f0fe841b": "PARTIAL",
    "bb1478317145c2a9": "PARTIAL",
    "503c61629d6db7b8": "PASS",
    "611c9a5ac2b7ad66": "PASS",
    "eaf9e75927c6314e": "PASS",
    "10c01dc3a9b0e7b6": "PASS",
    "44675003977446fa": "PASS",
    "517501da9e5723f8": "PASS",
    "8da282680fb4362b": "PASS",
    "e496ce1ae920f45a": "PARTIAL",  # written 2026-10-10, after the 421-row snapshot
}

_TOKEN = re.compile(r"[A-Za-z][A-Za-z_ -]*")
_PREFIX = re.compile(r"^\s*([A-Za-z][A-Za-z_-]*)\s*:")


def _norm_label(label: str) -> str:
    return re.sub(r"[-_\s]+", "_", label.strip()).upper()


def sentence_key(text: str) -> str:
    return hashlib.sha1(text.encode()).hexdigest()[:16]


def map_verdict(label):
    """Return (verdict or None, rule) for a schema-1 label or a schema-2 value."""
    if label is None:
        return None, "missing"
    text = str(label).strip()
    if not text or text.lower() in ("n/a", "na", "none", "null", "unknown"):
        return None, "missing"
    if sentence_key(text) in SENTENCE_VERDICTS:
        return SENTENCE_VERDICTS[sentence_key(text)], "sentence"
    if _TOKEN.fullmatch(text):
        key = _norm_label(text)
        if key in VERDICTS:
            return key, "enum"
        if key in LABEL_VERDICTS:
            return LABEL_VERDICTS[key], "label"
    match = _PREFIX.match(text)
    if match:
        key = _norm_label(match.group(1))
        if key in VERDICTS:
            return key, "prefix"
        if key in LABEL_VERDICTS:
            return LABEL_VERDICTS[key], "prefix"
    return None, "unmapped"


# ---------------------------------------------------------------------------------------------
# Paths and time


def state_root() -> Path:
    base = os.environ.get("XDG_STATE_HOME") or str(Path.home() / ".local" / "state")
    return Path(base) / "agent-work"


def repo_name(cwd: str | None = None) -> str:
    """The main checkout's name, shared by its linked worktrees; $PWD's basename outside git."""
    cwd = cwd or os.getcwd()
    try:
        common = subprocess.run(
            ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
            cwd=cwd, capture_output=True, text=True, timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        common = None
    if common is not None and common.returncode == 0 and common.stdout.strip():
        path = common.stdout.strip().rstrip("/")
        if path.endswith("/.git"):
            return os.path.basename(os.path.dirname(path))
        name = os.path.basename(path)
        return name[:-4] if name.endswith(".git") else name
    return os.path.basename(cwd.rstrip("/")) or "root"


def claude_home() -> Path:
    return Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")


def codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")


UTC = dt.timezone.utc


def now() -> dt.datetime:
    fixed = os.environ.get("SKILL_LEDGER_NOW")  # tests pin the clock
    return parse_ts(fixed) if fixed else dt.datetime.now(UTC)


def parse_ts(value):
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return dt.datetime.fromtimestamp(value / 1000 if value > 1e11 else value, UTC)
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = dt.datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def iso(value: dt.datetime | None, *, ms: bool = False):
    if value is None:
        return None
    value = value.astimezone(UTC)
    return value.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z" if ms else value.strftime("%Y-%m-%dT%H:%M:%SZ")


def host_name() -> str:
    return os.environ.get("TANGLE_HOST") or socket.gethostname().split(".")[0]


# ---------------------------------------------------------------------------------------------
# Rows


def normalize_skill(skill) -> str:
    text = str(skill or "").strip()
    return text if text.startswith("/") or not text else "/" + text


def skill_hill(skill: str) -> str:
    return f"skill:{normalize_skill(skill)}"


def run_key(row: dict, raw: str) -> str:
    """Stable identity: the row's id, else a hash of its exact bytes (rows written before ids)."""
    if row.get("id"):
        return row["id"]
    return "v1-" + hashlib.sha1(raw.strip().encode()).hexdigest()[:16]


def read_jsonl(text: str):
    """Yield (line number, raw line, object) for each parseable JSON object line."""
    for number, raw in enumerate(text.splitlines(), 1):
        if not raw.strip():
            continue
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            yield number, raw, obj


def normalize(row: dict, raw: str) -> dict:
    """A schema-2 view of any original row; schema-2 rows pass through with their key."""
    out = dict(row)
    out["runKey"] = run_key(row, raw)
    out["skill"] = normalize_skill(row.get("skill"))
    out.setdefault("layer", LAYER_TOOLS)
    out.setdefault("hill", skill_hill(out["skill"]))
    if row.get("schema") == SCHEMA:
        return out
    verdict, rule = map_verdict(row.get("verdict"))
    # Rows from the shell tool after dotfiles #299 name a PR and a session id; lift them so their
    # outcomes and links count.
    session = {"harness": None, "id": row["sessionId"]} if row.get("sessionId") else None
    out.update(
        schema=SCHEMA,
        verdict=verdict,
        verdictDetail=row.get("verdict"),
        verdictRule=rule,
        prediction=None,
        metrics=[],
        prs=[{**ref, "how": "flag"} for ref in pr_refs(row.get("pr") or "")],
        cost=None,
        session=session,
        startedAt=None,
        durationSource="flag" if row.get("durationMin") is not None else None,
        skillSha=None,
        schemaFrom=1,
    )
    return out


def skill_sha(skill: str, harness: str | None) -> str | None:
    """Short sha256 of the SKILL.md the harness loads, so results can be split by skill version."""
    name = skill.lstrip("/").split(":")[-1]
    homes = [codex_home(), claude_home()] if harness == "codex" else [claude_home(), codex_home()]
    for home in homes:
        path = home / "skills" / name / "SKILL.md"
        try:
            return hashlib.sha256(path.read_bytes()).hexdigest()[:12]
        except OSError:
            continue
    return None


_PR_URL = re.compile(r"https://github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)/pull/(\d+)")
_PR_SHORT = re.compile(r"(?<![\w/.-])([A-Za-z0-9_-][A-Za-z0-9_.-]*/[A-Za-z0-9_.-]+)#(\d+)\b")


def pr_refs(text: str) -> list[dict]:
    """Pull request references written as URLs or owner/repo#N."""
    refs, seen = [], set()
    for pattern in (_PR_URL, _PR_SHORT):
        for match in pattern.finditer(text or ""):
            key = (match.group(1).lower(), int(match.group(2)))
            if key not in seen:
                seen.add(key)
                refs.append({"repo": match.group(1), "number": int(match.group(2))})
    return refs


def merge_refs(*lists) -> list[dict]:
    out, seen = [], set()
    for refs in lists:
        for ref in refs or []:
            key = (ref["repo"].lower(), int(ref["number"]))
            if key not in seen:
                seen.add(key)
                out.append({"repo": ref["repo"], "number": int(ref["number"]), **({"how": ref["how"]} if ref.get("how") else {})})
    return out


# ---------------------------------------------------------------------------------------------
# Sessions and transcripts


def find_claude_transcript(session_id: str) -> Path | None:
    matches = glob.glob(str(claude_home() / "projects" / "*" / f"{session_id}.jsonl"))
    if not matches:
        return None
    return Path(max(matches, key=lambda p: os.path.getmtime(p)))


def find_codex_rollout(thread_id: str) -> Path | None:
    matches = glob.glob(str(codex_home() / "sessions" / "*" / "*" / "*" / f"rollout-*-{thread_id}.jsonl"))
    if not matches:
        return None
    return Path(max(matches, key=lambda p: os.path.getmtime(p)))


def _tail_lines(path: Path, limit: int = 4 << 20):
    try:
        with open(path, "rb") as handle:
            handle.seek(0, os.SEEK_END)
            size = handle.tell()
            handle.seek(max(0, size - limit))
            data = handle.read()
    except OSError:
        return []
    return data.decode("utf-8", "replace").splitlines()


_TS = re.compile(r'"timestamp":"([^"]+)"')


def _locate_invoking(main: Path, session_id: str, skill: str) -> tuple[Path, str | None]:
    """The transcript whose newest Bash call ran this skill-run-log: the main session or a subagent.

    Claude Code persists a tool_use before running it, so the calling transcript already holds
    the command. Subagents share the parent's session id, so their files are checked too.
    """
    candidates = [main]
    sub_dir = main.parent / session_id / "subagents"
    horizon = now().timestamp() - 1800
    if sub_dir.is_dir():
        for path in sub_dir.glob("agent-*.jsonl"):
            try:
                if path.stat().st_mtime >= horizon:
                    candidates.append(path)
            except OSError:
                continue
    needles = (f"skill-run-log {skill}", f"skill-run-log {skill.lstrip('/')}")
    best, best_ts = main, None
    for path in candidates:
        for line in reversed(_tail_lines(path)):
            if '"type":"assistant"' not in line or not any(n in line for n in needles):
                continue
            match = _TS.search(line)
            stamp = parse_ts(match.group(1)) if match else None
            if stamp and (best_ts is None or stamp > best_ts):
                best, best_ts = path, stamp
            break
    agent = best.stem[len("agent-"):] if best.parent.name == "subagents" else None
    return best, agent


def codex_meta(path: Path) -> dict:
    try:
        with open(path, encoding="utf-8", errors="replace") as handle:
            first = json.loads(handle.readline())
    except (OSError, json.JSONDecodeError):
        return {}
    payload = first.get("payload") if isinstance(first, dict) else None
    return payload if isinstance(payload, dict) else {}


def detect_session(skill: str | None = None, env=None) -> dict | None:
    """Session identity from the harness environment, with its transcript when one is on disk."""
    env = os.environ if env is None else env
    lineage = {
        "runId": env.get("TANGLE_RUN_ID") or None,
        "rootRunId": env.get("TANGLE_ROOT_RUN_ID") or None,
        "host": env.get("TANGLE_HOST") or host_name(),
    }
    sid = env.get("CLAUDE_CODE_SESSION_ID")
    if sid:
        main = find_claude_transcript(sid)
        invoking, agent = (main, None)
        if main and skill:
            invoking, agent = _locate_invoking(main, sid, skill)
        trace = main.parent / sid if main and (main.parent / sid).is_dir() else None
        attended = env.get("CLAUDE_CODE_SESSION_ATTENDED")
        return {
            "harness": "claude-code",
            "id": sid,
            "agentId": agent,
            "transcriptPath": str(invoking) if invoking else None,
            "mainTranscriptPath": str(main) if main else None,
            "traceDir": str(trace) if trace else None,
            "attended": None if attended is None else attended == "1",
            **lineage,
        }
    tid = env.get("CODEX_THREAD_ID")
    if tid:
        rollout = find_codex_rollout(tid)
        meta = codex_meta(rollout) if rollout else {}
        parent = meta.get("parent_thread_id")
        main = find_codex_rollout(parent) if parent else rollout
        return {
            "harness": "codex",
            "id": tid,
            "agentId": tid if parent else None,
            "transcriptPath": str(rollout) if rollout else None,
            "mainTranscriptPath": str(main) if main else None,
            "traceDir": None,
            "attended": None,
            **lineage,
        }
    if lineage["runId"]:
        return {"harness": env.get("TANGLE_HARNESS") or None, "id": None, "agentId": None,
                "transcriptPath": None, "mainTranscriptPath": None, "traceDir": None,
                "attended": None, **lineage}
    return None


def transcript_session(path: Path) -> dict:
    """Session identity of a transcript file: its session, whether it is a subagent, and the main file."""
    path = Path(path)
    if path.name.startswith("rollout-") and "/sessions/" in str(path):
        meta = codex_meta(path)
        parent = meta.get("parent_thread_id")
        main = find_codex_rollout(parent) if parent else path
        return {"harness": "codex", "id": meta.get("id"), "agentId": meta.get("id") if parent else None,
                "transcriptPath": str(path), "mainTranscriptPath": str(main) if main else None, "traceDir": None}
    if path.parent.name == "subagents":
        sid = path.parent.parent.name
        main = path.parent.parent.parent / f"{sid}.jsonl"
        return {"harness": "claude-code", "id": sid, "agentId": path.stem[len("agent-"):],
                "transcriptPath": str(path), "mainTranscriptPath": str(main) if main.exists() else None,
                "traceDir": str(path.parent.parent)}
    trace = path.parent / path.stem
    return {"harness": "claude-code", "id": path.stem, "agentId": None, "transcriptPath": str(path),
            "mainTranscriptPath": str(path), "traceDir": str(trace) if trace.is_dir() else None}


class Event:
    __slots__ = ("ts", "kind", "data")

    def __init__(self, ts, kind, data):
        self.ts, self.kind, self.data = ts, kind, data

    def __repr__(self):  # pragma: no cover - debugging aid
        return f"Event({iso(self.ts)}, {self.kind}, {self.data})"


_SKILL_PATH = re.compile(r"skills/([A-Za-z0-9_.:-]+)/SKILL\.md")
_COMMAND_NAME = re.compile(r"<command-name>/?([A-Za-z0-9_.:-]+)</command-name>")
# Non-greedy: Codex nests command output as JSON text, so several results share one line,
# separated by a literal backslash-n. Since dotfiles #299 the row id precedes the skill.
_LOGGED = re.compile(r"logged: (?:(sr-\S+) )?(\S+) -> (\S+) \((.*?)\) \[([^\]\n\\]*?skill-runs\.jsonl)\]")
_LOGCALL = re.compile(r"skill-run-log\s+(/?[A-Za-z][A-Za-z0-9_.:-]*)")
_PR_COMMAND = re.compile(r"\bpr\s+(create|merge)\b")
_INTERRUPT = "[Request interrupted by user"


def _strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _strings(item)


def _text_of(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") in ("text", "input_text"))
    return ""


def _log_events(ts, value):
    out = []
    for text in _strings(value):
        if "logged: " not in text:
            continue
        for match in _LOGGED.finditer(text):
            out.append(Event(ts, "log", {
                "id": match.group(1), "skill": normalize_skill(match.group(2)), "next": match.group(3),
                "verdict": match.group(4), "ledger": match.group(5),
            }))
    return out


def _pr_events(ts, command: str, output, how: str):
    """PRs a `pr create` or `pr merge` call produced: refs in its output, else in its command."""
    texts = [command] + list(_strings(output))
    refs = merge_refs(*(pr_refs(text) for text in texts))
    return [Event(ts, "pr", {**ref, "how": how}) for ref in refs]


# Codex records every injected turn as a user message. On GTR, 1,398 of 1,461 Codex user messages
# from 2026-10-07..10 were automation: fleet inbox notices ("[fleet-message-id:...]"), account
# rotation, task wrappers, role prompts and operator-agent steers. Claude Code tags the operator's
# own turns (origin.kind "human"), so this filter applies to Codex only.
_AUTOMATED = re.compile(
    r"^\s*(\[[a-z][a-z-]*:|acct moved this session|<task>|<turn_aborted>|<user_instructions>|<environment_context>"
    r"|# AGENTS\.md instructions|You are (the|a|an) |Operator \()")


def operator_text(text: str) -> bool:
    """Whether a Codex user message could be the operator's own words."""
    return bool((text or "").strip()) and not _AUTOMATED.match(text)


def _human_fallback(entry, text) -> bool:
    """For transcripts written before Claude Code recorded `origin`: a typed external prompt."""
    if entry.get("isMeta") or entry.get("userType") not in (None, "external"):
        return False
    stripped = text.lstrip()
    return bool(stripped) and not stripped.startswith(
        ("<task-notification", "<local-command", "<command-message", "Caveat:", "This session is being continued",
         "Another Claude session", "<system-reminder", "<cross-session-message"))


def scan_claude(path: Path) -> list[Event]:
    events: list[Event] = []
    pr_calls: dict[str, str] = {}
    seen_pr_links: set = set()
    try:
        handle = open(path, encoding="utf-8", errors="replace")
    except OSError:
        return events
    with handle:
        for line in handle:
            if '"type":"pr-link"' in line:
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                key = (str(entry.get("prRepository")), entry.get("prNumber"))
                ts = parse_ts(entry.get("timestamp"))
                if ts and entry.get("prRepository") and entry.get("prNumber") and key not in seen_pr_links:
                    seen_pr_links.add(key)  # Claude Code repeats the link every turn; its first sighting dates it
                    events.append(Event(ts, "pr", {"repo": entry["prRepository"], "number": int(entry["prNumber"]), "how": "pr-link"}))
                continue
            is_assistant = '"type":"assistant"' in line
            is_user = '"type":"user"' in line
            if not (is_assistant or is_user):
                continue
            # User lines are mostly tool results; parse only logged results, PR command results,
            # operator turns and interrupts, plus untagged lines from transcripts written before
            # `origin` existed.
            if is_user and not ("logged: " in line or _INTERRUPT in line or '"kind":"human"' in line
                                or any(call in line for call in pr_calls)
                                or ('"origin"' not in line and '"tool_result"' not in line)):
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = parse_ts(entry.get("timestamp"))
            if ts is None:
                continue
            message = entry.get("message") or {}
            content = message.get("content")
            if entry.get("type") == "assistant":
                usage = message.get("usage")
                if isinstance(usage, dict) and message.get("id"):
                    events.append(Event(ts, "usage", {
                        "id": message["id"], "model": message.get("model"),
                        "input": usage.get("input_tokens") or 0,
                        "output": usage.get("output_tokens") or 0,
                        "cacheRead": usage.get("cache_read_input_tokens") or 0,
                        "cacheWrite": usage.get("cache_creation_input_tokens") or 0,
                    }))
                for block in content if isinstance(content, list) else []:
                    if not isinstance(block, dict) or block.get("type") != "tool_use":
                        continue
                    name, args = block.get("name"), block.get("input") or {}
                    if name == "Skill" and args.get("skill"):
                        events.append(Event(ts, "skill", {"name": str(args["skill"]), "how": "Skill"}))
                    elif name == "Read":
                        match = _SKILL_PATH.search(str(args.get("file_path", "")))
                        if match:
                            events.append(Event(ts, "skill", {"name": match.group(1), "how": "Read"}))
                    elif name == "Bash":
                        command = str(args.get("command", ""))
                        for match in _SKILL_PATH.finditer(command):
                            events.append(Event(ts, "skill", {"name": match.group(1), "how": "Bash"}))
                        if "skill-run-log" in command:
                            for match in _LOGCALL.finditer(command):
                                events.append(Event(ts, "logcall", {"skill": normalize_skill(match.group(1))}))
                        if _PR_COMMAND.search(command) and block.get("id"):
                            pr_calls[block["id"]] = command
                continue
            # user entries
            if isinstance(content, list) and any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content):
                events.extend(_log_events(ts, content))
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_result" and block.get("tool_use_id") in pr_calls:
                        command = pr_calls.pop(block["tool_use_id"])
                        how = "pr-merge" if "merge" in _PR_COMMAND.search(command).group(1) else "pr-create"
                        events.extend(_pr_events(ts, command, block.get("content"), how))
                continue
            text = _text_of(content)
            if _INTERRUPT in text:
                events.append(Event(ts, "human", {"interrupt": True, "uuid": entry.get("uuid"), "text": ""}))
                continue
            origin = entry.get("origin")
            if isinstance(origin, dict):
                human = origin.get("kind") == "human"
            else:
                human = "origin" not in entry and _human_fallback(entry, text)
            if not human:
                continue
            command = _COMMAND_NAME.search(text)
            if command:
                events.append(Event(ts, "skill", {"name": command.group(1), "how": "slash"}))
            events.append(Event(ts, "human", {
                "interrupt": False, "uuid": entry.get("uuid"), "text": text, "invoke": bool(command),
            }))
    events.sort(key=lambda e: e.ts)
    return events


_CODEX_CALLS = ("function_call", "custom_tool_call", "local_shell_call")
_CODEX_OUTPUTS = ("function_call_output", "custom_tool_call_output")


def scan_codex(path: Path) -> list[Event]:
    events: list[Event] = []
    pr_calls: dict[str, str] = {}
    try:
        handle = open(path, encoding="utf-8", errors="replace")
    except OSError:
        return events
    with handle:
        for line in handle:
            interesting = ("SKILL.md" in line or "skill-run-log" in line or "logged: " in line
                           or '"UserMessage"' in line or '"user_message"' in line or '"token_count"' in line
                           or '"CommandExecution"' in line
                           or (pr_calls and '"call_id"' in line) or ("pr create" in line or "pr merge" in line))
            if not interesting:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = parse_ts(entry.get("timestamp"))
            payload = entry.get("payload") if isinstance(entry.get("payload"), dict) else {}
            kind, ptype = entry.get("type"), payload.get("type")
            if ts is None:
                continue
            if kind == "response_item" and ptype in _CODEX_CALLS:
                body = " ".join(_strings({k: payload.get(k) for k in ("arguments", "input", "action")}))
                for match in _SKILL_PATH.finditer(body):
                    events.append(Event(ts, "skill", {"name": match.group(1), "how": "shell"}))
                if "skill-run-log" in body:
                    for match in _LOGCALL.finditer(body):
                        events.append(Event(ts, "logcall", {"skill": normalize_skill(match.group(1))}))
                if _PR_COMMAND.search(body) and payload.get("call_id"):
                    pr_calls[payload["call_id"]] = body
            elif kind == "response_item" and ptype in _CODEX_OUTPUTS:
                events.extend(_log_events(ts, payload.get("output")))
                command = pr_calls.pop(payload.get("call_id"), None)
                if command:
                    how = "pr-merge" if "merge" in _PR_COMMAND.search(command).group(1) else "pr-create"
                    events.extend(_pr_events(ts, command, payload.get("output"), how))
            elif kind == "event_msg" and ptype == "exec_command_end":
                events.extend(_log_events(ts, payload.get("aggregated_output") or payload.get("stdout")))
            elif kind == "event_msg" and ptype == "item_completed" and (payload.get("item") or {}).get("type") == "CommandExecution":
                item = payload.get("item") or {}
                events.extend(_log_events(ts, item.get("aggregated_output")))
                command = " ".join(_strings(item.get("command")))
                match = _PR_COMMAND.search(command)
                if match:
                    events.extend(_pr_events(ts, command, item.get("aggregated_output"), f"pr-{match.group(1)}"))
            elif kind == "event_msg" and ptype == "item_completed" and (payload.get("item") or {}).get("type") == "UserMessage":
                item = payload.get("item") or {}
                text = _text_of(item.get("content"))
                if operator_text(text):
                    events.append(Event(ts, "human", {"interrupt": False, "uuid": item.get("id"), "text": text, "invoke": False}))
            elif kind == "event_msg" and ptype == "user_message":
                text = str(payload.get("message") or "")
                if operator_text(text):
                    events.append(Event(ts, "human", {"interrupt": False, "uuid": None, "text": text, "invoke": False}))
            elif kind == "event_msg" and ptype == "token_count":
                total = ((payload.get("info") or {}).get("total_token_usage")) or {}
                if total:
                    events.append(Event(ts, "tokens", {
                        "input": total.get("input_tokens") or 0, "output": total.get("output_tokens") or 0,
                        "cacheRead": total.get("cached_input_tokens") or 0,
                        "cacheWrite": total.get("cache_write_input_tokens") or 0,
                    }))
    events.sort(key=lambda e: e.ts)
    return events


def is_codex(path) -> bool:
    return Path(path).name.startswith("rollout-") and "/sessions/" in str(path)


def scan(path, cache: dict | None = None) -> list[Event]:
    if not path:
        return []
    key = str(path)
    if cache is not None and key in cache:
        return cache[key]
    events = scan_codex(Path(path)) if is_codex(path) else scan_claude(Path(path))
    if cache is not None:
        cache[key] = events
    return events


def scan_logs(path) -> list[Event]:
    """Only the `logged:` results skill-run-log printed; cheap enough to run over every transcript."""
    events: list[Event] = []
    try:
        handle = open(path, encoding="utf-8", errors="replace")
    except OSError:
        return events
    with handle:
        for line in handle:
            if "logged: " not in line or "skill-runs.jsonl" not in line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = parse_ts(entry.get("timestamp"))
            if ts is None:
                continue
            if entry.get("type") == "user":
                content = (entry.get("message") or {}).get("content")
                if isinstance(content, list) and any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content):
                    events.extend(_log_events(ts, content))
            elif entry.get("type") in ("response_item", "event_msg"):
                payload = entry.get("payload") if isinstance(entry.get("payload"), dict) else {}
                if payload.get("type") in _CODEX_OUTPUTS:
                    events.extend(_log_events(ts, payload.get("output")))
                elif payload.get("type") == "exec_command_end":
                    events.extend(_log_events(ts, payload.get("aggregated_output") or payload.get("stdout")))
                elif payload.get("type") == "item_completed" and (payload.get("item") or {}).get("type") == "CommandExecution":
                    events.extend(_log_events(ts, (payload.get("item") or {}).get("aggregated_output")))
    return events


def _same_skill(name: str, skill: str) -> bool:
    want = skill.lstrip("/")
    name = name.lstrip("/")
    return name == want or name.split(":")[-1] == want.split(":")[-1]


def measure(events: list[Event], skill: str, log_ts: dt.datetime, main_events: list[Event] | None = None) -> dict:
    """Start, duration, token use and pull requests of the run that logged `skill` at `log_ts`.

    The run starts at the first invocation of the skill after that skill's previous logged result
    in the same transcript, so a skill re-read mid-run does not shorten it. Its pull requests are
    the ones a `pr create` or `pr merge` produced in that window, plus PRs Claude Code first linked
    to the session in it (`main_events`, the main transcript, holds those links for subagents).
    """
    empty = {"startedAt": None, "durationMin": None, "durationSource": None, "cost": None, "prs": []}
    previous = [e.ts for e in events if e.kind == "log" and e.data["skill"] == skill
                and e.ts < log_ts - dt.timedelta(seconds=1)]
    floor = max(previous) if previous else None
    starts = [e for e in events if e.kind == "skill" and _same_skill(e.data["name"], skill)
              and e.ts <= log_ts and (floor is None or e.ts > floor)]
    if not starts:
        return empty
    start = starts[0]
    minutes = round((log_ts - start.ts).total_seconds() / 60, 2)
    seen, totals, models = set(), {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0}, {}
    first_snapshot = last_snapshot = None
    prs = []
    window_end = log_ts + dt.timedelta(seconds=5)
    for event in events:
        if event.kind == "tokens" and event.ts < start.ts:
            first_snapshot = event.data
        if event.ts < start.ts or event.ts > window_end:
            continue
        if event.kind == "usage" and event.data["id"] not in seen and event.ts <= log_ts:
            seen.add(event.data["id"])
            for key in totals:
                totals[key] += int(event.data.get(key) or 0)
            model = event.data.get("model")
            if model:
                models[model] = models.get(model, 0) + 1
        elif event.kind == "tokens" and event.ts <= log_ts:
            last_snapshot = event.data
        elif event.kind == "pr":
            prs.append(event.data)
    if main_events is not None and main_events is not events:
        prs.extend(e.data for e in main_events if e.kind == "pr" and e.data.get("how") == "pr-link"
                   and start.ts <= e.ts <= window_end)
    if last_snapshot is not None:
        base = first_snapshot or {key: 0 for key in totals}
        totals = {key: int(last_snapshot.get(key, 0)) - int(base.get(key, 0)) for key in totals}
    cost = None
    if seen or last_snapshot is not None:
        cost = {"usd": None, "tokens": totals, "model": max(models, key=models.get) if models else None,
                "source": "transcript", "scope": "invoking transcript"}
    return {"startedAt": iso(start.ts, ms=True), "durationMin": max(minutes, 0.0),
            "durationSource": f"transcript:{start.data['how']}", "cost": cost, "prs": merge_refs(prs)}


# ---------------------------------------------------------------------------------------------
# Operator corrections: climb.md's reward 3, the person's reaction read by a labeler.


# lexical-v2. Tuned on the 15 operator messages that followed Mac runs on 2026-10-05..10: v1 flagged
# 4 (3 genuine; a question's "instead of" was not) and missed 5 ("have you even...", "...shouldn't
# exclusively run...", "not all agents...", "do not stop until..."). GTR's messages are its held-out set.
_CORRECTION = re.compile(
    r"""(?ix)
    ^\W*(no|nope|nah|wrong|stop|wait|hold\ on|undo|revert|redo|actually|instead)\b
    | \b(that|this|it)(\ is|'s|s)\ (not|wrong|incorrect|bad|broken|ugly|unacceptable|terrible)\b
    | \bnot\ what\ i\b | \bi\ (said|asked|told\ you|meant|thought)\b | \bas\ i\ (said|asked)\b
    | \b(you|it)\ (didn'?t|did\ not|missed|forgot|ignored|broke|failed\ to|skipped)\b
    | \b(have|did)\ you\ (even|actually|really)\b
    | \bwhy\ (did|didn'?t|are|is|would|were)\ (you|it|this|we)\b
    | \b(do\ not|don'?t|never)\ (do|use|ship|merge|say|add|make|touch|change|send|post|publish|stop)\b
    | \bshould(n'?t|\ not)\b | \bnot\ all\b | \bhate\b
    | \bstill\ (broken|wrong|failing|not|bad|missing)\b
    | \bnot\ (good|right|correct|done|working|acceptable|enough|amazing|it)\b
    | \b(terrible|garbage|awful|unacceptable|sloppy|lazy|useless|rejected?)\b
    | \btry\ again\b | \bdo\ it\ again\b | \bstart\ over\b
    """
)


def classify_followup(text: str):
    """(True, marker) when an operator message reads as a correction or redirect (OVERRIDE_METHOD)."""
    match = _CORRECTION.search((text or "")[:600])
    return (True, match.group(0).strip()) if match else (False, None)


def judge_override(run: dict, invoking: list[Event], human: list[Event], *, ended: bool, at: dt.datetime) -> dict | None:
    """Judge one run's operator correction from the operator's messages, or None while its window is open.

    Mid-run: an interrupt, or a correction typed between the skill's start and its log.
    After the run: the operator's first message before the next skill starts. A subagent's
    result reaches the operator through its parent, so it has no direct channel and stays unknown.
    The quote stays in this host's state directory; exports carry only its transcript pointer.
    """
    log_ts = parse_ts(run.get("ts"))
    session = run.get("session") or {}
    if log_ts is None:
        return None
    base = {"runKey": run["runKey"], "skill": run.get("skill"), "runTs": run.get("ts"),
            "sessionId": session.get("id"), "method": OVERRIDE_METHOD, "layer": LAYER_OPERATOR,
            "hill": "operator:corrections", "theme": None}
    if session.get("agentId"):
        return {**base, "operatorOverride": None, "basis": "subagent"}
    if not any(e.kind == "human" for e in human):
        return {**base, "operatorOverride": None, "basis": "no-operator-turns"}

    def evidence(event, marker=None):
        out = {"ts": iso(event.ts), "uuid": event.data.get("uuid"), "transcript": session.get("mainTranscriptPath")}
        if marker:
            out["marker"] = marker
            out["quote"] = (event.data.get("text") or "")[:280]
        return out

    start = parse_ts(run.get("startedAt")) or log_ts
    for event in human:
        if not (start < event.ts <= log_ts) or event.data.get("invoke"):
            continue
        if event.data.get("interrupt"):
            return {**base, "operatorOverride": True, "basis": "interrupt", "evidence": evidence(event)}
        hit, marker = classify_followup(event.data.get("text", ""))
        if hit:
            return {**base, "operatorOverride": True, "basis": "mid-run", "evidence": evidence(event, marker)}
    later = [e.ts for e in invoking if e.kind in ("skill", "log") and e.ts > log_ts + dt.timedelta(seconds=1)]
    window_end = min(later) if later else None
    for event in human:
        if event.ts <= log_ts or (window_end and event.ts > window_end) or event.data.get("interrupt"):
            continue
        hit, marker = classify_followup(event.data.get("text", ""))
        return {**base, "operatorOverride": hit, "basis": "next-operator-message", "evidence": evidence(event, marker)}
    if window_end or ended or (at - log_ts) > dt.timedelta(hours=12):
        return {**base, "operatorOverride": False, "basis": "no-operator-message"}
    return None


# ---------------------------------------------------------------------------------------------
# Host reads


NON_REPO_DIRS = {"_outcomes", "_lead", "_guards"}  # state directories that are not a repository's ledger
LEDGER_GLOBS = ("*/skill-runs.jsonl", "*/skill-runs.v2.jsonl", "*/skill-run-events.jsonl", "_outcomes/prs.jsonl")


def _collect_script(globs) -> str:
    """A POSIX sh script printing hostname, then NUL-separated (name, contents) for each file.
    Globs are relative to the agent-work root, or to $HOME when they start with "~/"."""
    patterns = " ".join(f'"$HOME"/{g[2:]}' if g.startswith("~/") else f'"$root"/{g}' for g in globs)
    return (
        'root="${XDG_STATE_HOME:-$HOME/.local/state}/agent-work"; '
        "hostname | cut -d. -f1; printf '\\0'; "
        f"for f in {patterns}; do [ -f \"$f\" ] || continue; "
        'case "$f" in "$root"/*) name="${f#$root/}" ;; *) name="~/${f#$HOME/}" ;; esac; '
        "printf '%s\\0' \"$name\"; cat \"$f\"; printf '\\0'; done"
    )


def read_host(host: str | None, globs=LEDGER_GLOBS, timeout: int = 45) -> dict:
    """Read only the named ledger files on a host ('local' or None for this machine) over ssh."""
    script = _collect_script(globs)
    if host in (None, "", "local"):
        command = ["sh", "-c", script]
    else:
        command = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", host, script]
    try:
        done = subprocess.run(command, capture_output=True, timeout=timeout)
    except (OSError, subprocess.SubprocessError) as error:
        return {"host": host or "local", "ok": False, "error": str(error), "files": {}}
    if done.returncode != 0 and not done.stdout:
        return {"host": host or "local", "ok": False, "error": done.stderr.decode(errors="replace").strip()[-300:], "files": {}}
    parts = done.stdout.decode("utf-8", "replace").split("\0")
    hostname = parts[0].strip() if parts else ""
    files = {}
    for index in range(1, len(parts) - 1, 2):
        files[parts[index]] = parts[index + 1]
    return {"host": host or "local", "hostname": hostname, "ok": True, "files": files}


def rows_from_files(files: dict, host: str) -> list[dict]:
    """Normalized rows for one host: originals, replaced by their backfilled view, with settled corrections."""
    by_dir: dict[str, dict] = {}
    for rel, text in files.items():
        directory, _, name = rel.rpartition("/")
        by_dir.setdefault(directory, {})[name] = text
    rows = []
    for directory, named in sorted(by_dir.items()):
        if directory in NON_REPO_DIRS:
            continue
        backfilled = {obj["runKey"]: obj for _, _, obj in read_jsonl(named.get(BACKFILL, "")) if obj.get("runKey")}
        overrides = {}
        for _, _, obj in read_jsonl(named.get(EVENTS, "")):
            if obj.get("event") != "override" or not obj.get("runKey"):
                continue
            prior = overrides.get(obj["runKey"])
            if prior and prior.get("method") == "explicit" and obj.get("method") != "explicit":
                continue  # an explicit judgment outranks the labeler
            overrides[obj["runKey"]] = obj
        for _, raw, obj in read_jsonl(named.get(RUNS, "")):
            if not obj.get("skill"):
                continue
            key = run_key(obj, raw)
            row = dict(backfilled.get(key) or normalize(obj, raw))
            row["runKey"] = key
            event = overrides.get(key)
            if event is not None:
                row["operatorOverride"] = event.get("operatorOverride")
                row["overrideBasis"] = event.get("basis") or event.get("method")
                row["overrideEvent"] = event
            row["_host"] = host
            row["_dir"] = directory
            row["_orig"] = obj
            rows.append(row)
    return rows


def default_hosts() -> list[str]:
    configured = os.environ.get("SKILL_SCOREBOARD_HOSTS")
    if configured is not None:
        return [h for h in re.split(r"[\s,]+", configured) if h]
    return ["gtr", "beelink1-wsl", "beelink2-wsl"]


def gather(hosts, globs=LEDGER_GLOBS) -> list[dict]:
    """Read this machine and each remote host once; a remote whose hostname matches this one is skipped."""
    from concurrent.futures import ThreadPoolExecutor

    local = read_host(None, globs)
    reads = [local]
    with ThreadPoolExecutor(max_workers=max(1, len(hosts))) as pool:
        for result in pool.map(lambda h: read_host(h, globs), hosts):
            if result.get("ok") and result.get("hostname") == local.get("hostname"):
                result = {**result, "files": {}, "duplicateOf": "local"}
            reads.append(result)
    return reads


# ---------------------------------------------------------------------------------------------
# Terminal rendering. A deliberately small renderer: swap these functions for `viz` once it ships.


_BLOCKS = " ▁▂▃▄▅▆▇█"


def sparkline(values) -> str:
    numbers = [v for v in values if v is not None]
    top = max(numbers) if numbers else 0
    out = []
    for value in values:
        if value is None:
            out.append("·")
        elif top <= 0:
            out.append(_BLOCKS[0] if value == 0 else _BLOCKS[-1])
        else:
            out.append(_BLOCKS[min(len(_BLOCKS) - 1, max(1 if value > 0 else 0, round(value / top * (len(_BLOCKS) - 1))))])
    return "".join(out)


def bar(value, top, width: int = 20) -> str:
    if value is None or not top:
        return ""
    filled = round(max(0.0, min(1.0, value / top)) * width)
    return "█" * filled + "░" * (width - filled)


def render_table(headers, rows, align=None) -> str:
    cells = [[str(h) for h in headers]] + [["" if c is None else str(c) for c in row] for row in rows]
    widths = [max(len(row[i]) for row in cells) for i in range(len(headers))]
    align = align or ["<"] + [">"] * (len(headers) - 1)
    lines = []
    for index, row in enumerate(cells):
        lines.append("  ".join(f"{cell:{align[i]}{widths[i]}}" for i, cell in enumerate(row)).rstrip())
        if index == 0:
            lines.append("  ".join("-" * w for w in widths))
    return "\n".join(lines)


def percentile(values, q: float):
    data = sorted(v for v in values if v is not None)
    if not data:
        return None
    position = (len(data) - 1) * q
    low = int(position)
    high = min(low + 1, len(data) - 1)
    return data[low] + (data[high] - data[low]) * (position - low)


def new_run_id(at: dt.datetime) -> str:
    """The row id format dotfiles #299 introduced: sr-<UTC stamp>-<8 hex>."""
    return f"sr-{at.astimezone(UTC).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"


def machine() -> str | None:
    return socket.gethostname().split(".")[0] or None


def env_session_id(env=None) -> str | None:
    env = os.environ if env is None else env
    for name in ("CLAUDE_CODE_SESSION_ID", "CODEX_THREAD_ID", "CODEX_SESSION_ID", "CODEX_COMPANION_SESSION_ID"):
        if env.get(name):
            return env[name]
    return None


def git_links(cwd: str | None = None) -> dict:
    def git(*args):
        try:
            done = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, timeout=10)
        except (OSError, subprocess.SubprocessError):
            return None
        return done.stdout.strip() or None if done.returncode == 0 else None
    return {"branch": git("branch", "--show-current"), "headSha": git("rev-parse", "--verify", "--quiet", "HEAD")}


def pr_url(ref: dict) -> str:
    return ref.get("url") or f"https://github.com/{ref['repo']}/pull/{int(ref['number'])}"


def which(name: str) -> str | None:
    return shutil.which(name)


def append_jsonl(path: Path, row: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
