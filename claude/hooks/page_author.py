#!/usr/bin/env python3
"""Stamp each HTML page an agent writes for the owner with the session that wrote it, so one click reaches that agent.

The stamp is one line at the top of the page (author name, "Open tab", "Message", short session id, host, UTC time)
plus author-* meta tags, each between <!-- page-author --> markers; stamping again replaces it, never duplicates it.
Pages are the .html files under PAGE_AUTHOR_DIR (default ~/reviews).

Hook (PreToolUse; no arguments, payload on stdin):
  Write <page>     rewrites the tool's own content through updatedInput, so the file the harness records as written
                   is the stamped one and the agent's next Edit does not fail as "modified since read".
  Bash `open <page>`  stamps a page written another way (a script, a copy) that has no stamp yet, before it opens.
CLI:
  page-author [--force] <page>...   finds the author of an existing page from Claude transcripts, ~/.claude/sessions and
                                    the live process environment, and stamps it; --force re-attributes a stamped page.

Identity: the session file ~/.claude/sessions/<CLAUDE_PID>.json names the session (its peer name is the SendMessage
address); a subagent shares its lead's CLAUDE_PID, so the stamp names the lead. WARP_FOCUS_URL focuses the Warp tab.
Inside tmux the author is the pane's session:window, and PAGE_AUTHOR_LANE_SEND (default `tmux send-keys -t {lane}`)
is the command that reaches it. Fail-open: a hook failure never blocks the tool call.
"""
from __future__ import annotations

import datetime as dt
import html
import json
import mmap
import os
import re
import shlex
import socket
import subprocess
import sys
from pathlib import Path

HOME = Path.home()
SESSIONS = HOME / ".claude" / "sessions"
PROJECTS = HOME / ".claude" / "projects"
BEGIN, END = "<!-- page-author -->", "<!-- /page-author -->"
BLOCK = re.compile(re.escape(BEGIN) + r".*?" + re.escape(END) + r"\n?", re.S)
WRITERS = {"Write", "Edit", "MultiEdit", "NotebookEdit", "Bash"}
STYLE = (
    "#page-author{box-sizing:border-box;width:100%;grid-column:1/-1;margin:0;padding:6px 16px;"
    "font:12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2328;background:#eef1f5;"
    "border-bottom:1px solid #d0d7de;overflow-wrap:anywhere;text-align:left}"
    "#page-author b{font-weight:600}#page-author a{color:#0969da;text-decoration:underline}"
    "#page-author code{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;background:rgba(127,127,127,.15);"
    "padding:1px 4px;border-radius:4px;cursor:copy}#page-author .pa-dim{color:#59636e}"
    "@media (prefers-color-scheme:dark){#page-author{color:#e6edf3;background:#161b22;border-color:#30363d}"
    "#page-author a{color:#58a6ff}#page-author .pa-dim{color:#9198a1}}"
)


def page_dir() -> Path:
    return Path(os.path.expanduser(os.environ.get("PAGE_AUTHOR_DIR") or "~/reviews")).resolve()


def expand(path: str | os.PathLike) -> Path:
    return Path(os.path.expanduser(os.path.expandvars(str(path))))


def is_page(path: str | os.PathLike) -> bool:
    p = expand(path)
    if p.suffix.lower() not in (".html", ".htm"):
        return False
    try:
        p.parent.resolve().relative_to(page_dir())
        return True
    except (ValueError, OSError):
        return False


def host() -> str:
    return socket.gethostname().split(".")[0]


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def process_env(pid: str) -> dict:
    """The environment of a live process of this user, from `ps eww` (macOS and Linux)."""
    try:
        out = subprocess.run(["ps", "eww", "-o", "command=", "-p", str(pid)], capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError):
        return {}
    return dict(re.findall(r"(?:^|\s)([A-Z_][A-Z0-9_]*)=(\S*)", out))


def tmux_lane(pane: str) -> str:
    try:
        return subprocess.run(["tmux", "display-message", "-p", "-t", pane, "#S:#W"], capture_output=True,
                              text=True, timeout=5).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def identity(sid: str = "", pid: str = "", env: dict | None = None, cwd: str = "", when: str = "") -> dict:
    """Who a page names: the session's peer name, how to focus it, how to message it."""
    session = read_json(SESSIONS / f"{pid}.json") if pid else {}
    if sid and session.get("sessionId") not in (None, sid):
        session = {}
    if sid and not session:  # find the live process of a session id
        for f in SESSIONS.glob("*.json"):
            s = read_json(f)
            if s.get("sessionId") == sid:
                session, pid = s, str(s.get("pid") or f.stem)
                break
    if session and env is None:
        env = process_env(pid)
    env = env or {}
    sid = sid or session.get("sessionId") or ""
    name = session.get("name") or ""
    lane = tmux_lane(env["TMUX_PANE"]) if env.get("TMUX_PANE") else ""
    focus = "" if env.get("TMUX") else env.get("WARP_FOCUS_URL", "")
    if lane:
        send = os.environ.get("PAGE_AUTHOR_LANE_SEND") or "tmux send-keys -t {lane}"
        message, open_label = f"{send.format(lane=lane)} \"<msg>\"", f"lane {lane}"
        focus = focus or message
    elif session:
        message, open_label = f'SendMessage to "{name}"', "Open tab"
    else:  # the session is no longer running: resuming it is the way back
        message, open_label = f"cd {shlex.quote(cwd or session.get('cwd') or '~')} && claude --resume {sid}", "session ended"
    return {"name": lane or name or f"session {sid[:8]}", "sid": sid, "focus": focus, "message": message,
            "open_label": open_label, "host": host(),
            "when": when or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%MZ")}


def current_identity(payload: dict) -> dict:
    pid = os.environ.get("CLAUDE_PID", "")
    sid = (read_json(SESSIONS / f"{pid}.json").get("sessionId") if pid else "") or payload.get("session_id", "")
    return identity(sid=sid, pid=pid, env=dict(os.environ), cwd=payload.get("cwd", ""))


def render(who: dict) -> tuple[str, str]:
    e = lambda s: html.escape(str(s), quote=True)
    metas = "".join(f'<meta name="author-{k}" content="{e(who[v])}">' for k, v in
                    (("session", "sid"), ("name", "name"), ("focus", "focus"), ("message", "message")))
    head = f"{BEGIN}{metas}{END}\n"
    if who["focus"].startswith(("warp://", "http://", "https://")):
        opener = f'<a href="{e(who["focus"])}">{e(who["open_label"])}</a>'
    else:
        opener = f'<span class="pa-dim">{e(who["open_label"])}</span>'
    copy = "navigator.clipboard&&navigator.clipboard.writeText(this.textContent)"
    body = (f'{BEGIN}<style>{STYLE}</style><div id="page-author" role="note">Written by <b>{e(who["name"])}</b> · {opener}'
            f' · Message: <code title="click to copy" onclick="{e(copy)}">{e(who["message"])}</code>'
            f' · <span class="pa-dim">{e(who["sid"][:8])} · {e(who["host"])} · {e(who["when"])}</span></div>{END}\n')
    return head, body


def stamp_text(text: str, who: dict) -> str:
    text = BLOCK.sub("", text)
    head, body = render(who)
    m = re.search(r"</head\s*>", text, re.I)
    if m:
        text = text[:m.start()] + head + text[m.start():]
    else:  # no head: the meta tags travel with the visible line
        body = head + body
    m = re.search(r"<body\b[^>]*>\n?", text, re.I) or re.search(r"</head\s*>\n?|<html\b[^>]*>\n?|<!doctype[^>]*>\n?", text, re.I)
    at = m.end() if m else 0
    return text[:at] + body + text[at:]


def stamped(text: str) -> bool:
    return BEGIN in text


def stamp_file(page: Path, who: dict) -> None:
    text = page.read_text(errors="replace")
    new = stamp_text(text, who)
    if new != text:
        page.write_text(new)


def lines_naming(files: list[str], needle: bytes):
    """(file, line) for each transcript line containing needle; mmap search runs at memory speed on 100 MB files."""
    for f in files:
        try:
            with open(f, "rb") as fh, mmap.mmap(fh.fileno(), 0, access=mmap.ACCESS_READ) as mm:
                at = mm.find(needle)
                while at != -1:
                    start, end = mm.rfind(b"\n", 0, at) + 1, mm.find(b"\n", at)
                    end = len(mm) if end == -1 else end
                    yield f, mm[start:end].decode(errors="replace")
                    at = mm.find(needle, end)
        except (OSError, ValueError):  # empty or vanished file
            continue


def find_author(page: Path) -> dict | None:
    """The session whose last write-shaped tool call named the page before the page's last change."""
    try:
        mtime = page.stat().st_mtime
    except OSError:
        return None
    needle = str(page)
    files = [str(f) for f in PROJECTS.rglob("*.jsonl") if f.stat().st_mtime >= mtime - 1]
    if not files:
        return None
    best = None
    for f, line in lines_naming(files, needle.encode()):
        try:
            d = json.loads(line)
        except ValueError:
            continue
        content, ts = (d.get("message") or {}).get("content"), d.get("timestamp")
        if not ts or not isinstance(content, list):
            continue
        for b in content:
            if not isinstance(b, dict) or b.get("type") != "tool_use" or b.get("name") not in WRITERS:
                continue
            i = b.get("input") or {}
            cmd = i.get("command") or ""
            if not (needle in (i.get("file_path"), i.get("notebook_path"))
                    or (needle in cmd and "page-author" not in cmd and "page_author" not in cmd)):
                continue
            t = dt.datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
            late = t > mtime + 5  # a call after the page's last change only read it; the earliest such is the fallback
            key = (not late, -t if late else t)
            if best is None or key > best[0]:
                sid = Path(f).parent.parent.name if Path(f).parent.name == "subagents" else d.get("sessionId", "")
                best = (key, sid, d.get("cwd") or "", ts)
    if not best:
        return None
    when = dt.datetime.fromisoformat(best[3].replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%MZ")
    return identity(sid=best[1], cwd=best[2], when=when)


def open_targets(command: str) -> list[Path]:
    if not re.search(r"(^|[;&|\s])open\s", command):
        return []
    try:
        words = shlex.split(command, comments=True)
    except ValueError:
        words = command.split()
    return [expand(w).resolve() for w in words if is_page(w) and expand(w).is_file()]


def hook() -> None:
    try:
        payload = json.loads(sys.stdin.read())
    except ValueError:
        return
    if payload.get("hook_event_name") != "PreToolUse":
        return
    tool, tin = payload.get("tool_name"), payload.get("tool_input") or {}
    if tool == "Write" and is_page(tin.get("file_path", "")) and isinstance(tin.get("content"), str):
        content = stamp_text(tin["content"], current_identity(payload))
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                                 "updatedInput": {**tin, "content": content}}}))
    elif tool == "Bash":
        for page in open_targets(tin.get("command") or ""):
            if not stamped(page.read_text(errors="replace")):
                stamp_file(page, find_author(page) or current_identity(payload))


def main(argv: list[str]) -> int:
    if not argv:
        try:
            hook()
        except Exception:  # fail open: a stamp is never worth a blocked tool call
            pass
        return 0
    force = "--force" in argv
    pages = [expand(a).resolve() for a in argv if a != "--force"]
    if not pages or any(a in ("-h", "--help") for a in argv):
        print(__doc__.strip())
        return 0
    status = 0
    for page in pages:
        if not page.is_file():
            print(f"{page}: no such page", file=sys.stderr)
            status = 1
            continue
        text = page.read_text(errors="replace")
        if stamped(text) and not force:
            name = re.search(r'name="author-name" content="([^"]*)"', text)
            print(f"{page}: already stamped ({html.unescape(name.group(1)) if name else '?'}); --force re-attributes")
            continue
        who = find_author(page)
        if not who:
            print(f"{page}: no transcript names a write of it; not stamped", file=sys.stderr)
            status = 1
            continue
        stamp_file(page, who)
        print(f"{page}: {who['name']} · {who['sid'][:8]} · {who['focus'] or who['message']}")
    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
