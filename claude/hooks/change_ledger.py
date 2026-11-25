#!/usr/bin/env python3
"""Record the commits and pull requests a coding-agent session makes, at the moment it makes them.

Called by change-ledger.sh (PostToolUse on Bash) with the hook payload on stdin. One JSON line is
appended to ~/.local/state/change-ledger/changes.jsonl per change:

  {"v":1,"at":"<ISO UTC>","harness":"claude-code","sessionId":"...","agentId":null|"...",
   "toolUseId":"...","action":"commit"|"pr-create"|"pr-merge"|"observed",
   "remote":"owner/repo"|"host/path"|null,"sha":"<commit>"|null,"pr":<number>|null}

- `toolUseId` is the tool call's id, the id the session transcript names the call by, so a reader
  places a change inside the user turn that made it.
- `agentId` is set inside a subagent; `sessionId` is then the parent's.
- `observed` is written once per session or subagent, at its first Bash call: it says the recorder
  was running, so a session with an `observed` row and no change rows made no change by git commit,
  gh pr create or gh pr merge, and a session with no row at all is unknown.
- `remote` is the repository's origin as `owner/repo` for github.com, else `host/path`, with any
  credentials removed. null: the repository could not be found from the call.
- A merge whose pull request number the command does not name writes a row with `pr` null, so the
  gap is visible and never a guess. A pull request create writes a row only when its output names the URL.

The row carries no command text, no path and no attribution. Fail-open: every failure exits 0.
"""
import datetime
import json
import os
import re
import subprocess
import sys

STATE = os.path.join(os.environ.get("CHANGE_LEDGER_DIR") or os.path.expanduser("~/.local/state/change-ledger"))
LEDGER = os.path.join(STATE, "changes.jsonl")
SEEN = os.path.join(STATE, "seen")

ID = re.compile(r"^[A-Za-z0-9._-]{1,200}$")
COMMIT = re.compile(r"(?:^|[;&|(]\s*|\s)git\b((?:\s+(?:-[A-Za-z]\s+\S+|--\S+))*)\s+commit\b")
GH = re.compile(r"\bgh(?:-[\w-]+)?\s+((?:-\S+\s+\S+\s+)*)pr\s+(create|merge)\b")
COMMIT_LINE = re.compile(r"^\[[^\]\n]* ([0-9a-f]{7,40})\]", re.M)
PULL_URL = re.compile(r"https://github\.com/([\w.-]+/[\w.-]+)/pull/(\d+)")
MERGE_ARGS = re.compile(r"\bpr\s+merge\s+(?:(?:https://github\.com/([\w.-]+/[\w.-]+)/pull/)?(\d+))")
REPO_FLAG = re.compile(r"(?:-R|--repo)[\s=]+([\w.-]+/[\w.-]+)")
CD = re.compile(r"\bcd\s+(?:--\s+)?(\"[^\"]+\"|'[^']+'|[^\s;&|]+)")
GIT_C = re.compile(r"\bgit\s+-C\s+(\"[^\"]+\"|'[^']+'|[^\s;&|]+)")


def git(directory, *args):
    try:
        out = subprocess.run(["git", "-C", directory, *args], capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout.strip() if out.returncode == 0 else None


def normalize_remote(url):
    """owner/repo for github.com, else host/path; credentials, scheme and the .git suffix removed."""
    if not url:
        return None
    url = url.strip()
    m = re.match(r"^[\w.-]+@([^:/]+):(.+)$", url)  # scp form: git@host:path
    if m:
        host, path = m.group(1), m.group(2)
    else:
        m = re.match(r"^[a-z+]+://(?:[^@/]*@)?([^/:]+)(?::\d+)?/(.+)$", url)
        if not m:
            return None
        host, path = m.group(1), m.group(2)
    path = re.sub(r"\.git$", "", path.strip("/"))
    return path if host == "github.com" else f"{host}/{path}"


def unquote(token):
    return token[1:-1] if len(token) > 1 and token[0] in "\"'" and token[-1] == token[0] else token


def directories(command, cwd):
    """Where the command may have run, most specific first: git -C and cd targets, then the session's cwd."""
    found = []
    base = cwd
    for m in CD.finditer(command):
        target = os.path.expanduser(unquote(m.group(1)))
        base = target if os.path.isabs(target) else os.path.join(base, target)
        found.append(base)
    for m in GIT_C.finditer(command):
        target = os.path.expanduser(unquote(m.group(1)))
        found.append(target if os.path.isabs(target) else os.path.join(cwd, target))
    found.reverse()
    found.append(cwd)
    return [d for d in found if d and os.path.isdir(d)]


def remote_of(command, cwd):
    for directory in directories(command, cwd):
        remote = normalize_remote(git(directory, "remote", "get-url", "origin"))
        if remote:
            return remote, directory
    return None, (directories(command, cwd) or [None])[0]


def response_text(response):
    if isinstance(response, str):
        return response
    if isinstance(response, dict):
        return "\n".join(str(response.get(k) or "") for k in ("stdout", "stderr", "output", "content"))
    return ""


def failed(response):
    return isinstance(response, dict) and (response.get("is_error") is True or response.get("interrupted") is True)


def changes(command, response):
    """The rows' action-specific fields for one command, before identity is added."""
    rows = []
    text = response_text(response)
    if COMMIT.search(command) and not failed(response):
        remote, directory = remote_of(command, CWD)
        for short in dict.fromkeys(COMMIT_LINE.findall(text)):
            full = git(directory, "rev-parse", "--verify", f"{short}^{{commit}}") if directory else None
            rows.append({"action": "commit", "remote": remote, "sha": full or short, "pr": None})
    for m in GH.finditer(command):
        if failed(response):
            continue
        if m.group(2) == "create":
            urls = list(dict.fromkeys(PULL_URL.findall(text)))
            for repo, number in urls:
                rows.append({"action": "pr-create", "remote": repo, "sha": None, "pr": int(number)})
        else:
            merge = MERGE_ARGS.search(command)
            repo = (merge.group(1) if merge else None) or (REPO_FLAG.search(command) or [None, None])[1]
            number = int(merge.group(2)) if merge else None
            rows.append({"action": "pr-merge", "remote": repo or remote_of(command, CWD)[0], "sha": None, "pr": number})
    return rows


def append(rows):
    os.makedirs(STATE, exist_ok=True)
    data = "".join(json.dumps(r, separators=(",", ":")) + "\n" for r in rows).encode()
    fd = os.open(LEDGER, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    try:
        os.write(fd, data)  # one O_APPEND write: rows of concurrent sessions never interleave
    finally:
        os.close(fd)


def main():
    global CWD
    payload = json.load(sys.stdin)
    if payload.get("tool_name") != "Bash":
        return
    session = payload.get("session_id")
    agent = payload.get("agent_id") or None
    if not isinstance(session, str) or not ID.match(session) or (agent is not None and not ID.match(str(agent))):
        return
    CWD = payload.get("cwd") if isinstance(payload.get("cwd"), str) else os.getcwd()
    command = (payload.get("tool_input") or {}).get("command")
    if not isinstance(command, str):
        return
    harness = os.environ.get("CHANGE_LEDGER_HARNESS") or "claude-code"
    base = {
        "v": 1,
        "at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "harness": harness,
        "sessionId": session,
        "agentId": agent,
        "toolUseId": payload.get("tool_use_id") if isinstance(payload.get("tool_use_id"), str) else None,
    }
    rows = []
    marker = os.path.join(SEEN, f"{harness}.{agent or session}")
    first = not os.path.exists(marker)
    if first:
        rows.append({**base, "action": "observed", "remote": None, "sha": None, "pr": None})
    rows += [{**base, **r} for r in changes(command, payload.get("tool_response"))]
    if rows:
        append(rows)
    if first:
        os.makedirs(SEEN, exist_ok=True)
        open(marker, "a").close()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
