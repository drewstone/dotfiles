"""Stamp each page under PAGE_AUTHOR_DIR (default ~/reviews) with the session that wrote it: one click reaches that agent.

process_guard.py imports this only for a Bash or Write call naming an .htm(l) file. A page's Write is stamped through
updatedInput, so the harness records the stamped file and the next Edit sees no outside change; `open <page>` stamps a page
a script wrote. The calling session is the author; a subagent shares its lead's CLAUDE_PID, so the stamp names the lead.
"""
import datetime as dt
import html
import json
import os
import re
import shlex
import socket
from pathlib import Path

BEGIN, END = "<!-- page-author -->", "<!-- /page-author -->"
BLOCK = re.compile(re.escape(BEGIN) + r".*?" + re.escape(END) + r"\n?", re.S)
STYLE = ("#page-author{box-sizing:border-box;width:100%;grid-column:1/-1;margin:0;padding:6px 16px;font:12px/1.5 "
         "-apple-system,sans-serif;color:#1f2328;background:#eef1f5;border-bottom:1px solid #d0d7de}#page-author a{color:#0969da}"
         "@media (prefers-color-scheme:dark){#page-author{color:#e6edf3;background:#161b22;border-color:#30363d}"
         "#page-author a{color:#58a6ff}}")


def is_page(path):
    p = Path(os.path.expanduser(os.path.expandvars(path)))
    pages = Path(os.path.expanduser(os.environ.get("PAGE_AUTHOR_DIR") or "~/reviews")).resolve()
    return p.suffix.lower() in (".html", ".htm") and p.parent.resolve().is_relative_to(pages)


def stamp(text):
    """text with this session's stamp after <body> in place of any earlier one; None outside a Claude session."""
    try:
        session = json.loads((Path.home() / ".claude" / "sessions" / f"{os.environ['CLAUDE_PID']}.json").read_text())
    except (KeyError, OSError, ValueError):
        return None
    e = lambda s: html.escape(str(s), quote=True)
    sid, focus = session.get("sessionId", ""), os.environ.get("WARP_FOCUS_URL", "")
    name = session.get("name") or sid[:8]
    message = f'SendMessage to "{session["name"]}"' if session.get("name") else f"claude --resume {sid}"
    metas = "".join(f'<meta name="author-{k}" content="{e(v)}">' for k, v in (("session", sid), ("name", name), ("focus", focus)))
    when = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%MZ")
    tab = f' · <a href="{e(focus)}">Open tab</a>' if focus else ""
    line = (f'<style>{STYLE}</style><div id="page-author">Written by <b>{e(name)}</b>{tab} · Message: <code>{e(message)}'
            f'</code> · {sid[:8]} · {e(socket.gethostname().split(".")[0])} · {when}</div>')
    text = BLOCK.sub("", text)
    at = body_start(text)  # the meta tags ride in the one block: every HTML parser reads them there
    return text if at is None else text[:at] + f"{BEGIN}{metas}{line}{END}\n" + text[at:]


def body_start(text):
    """Where the visible page begins: after <body>, else before the first tag a head cannot hold (a page may omit <body>)."""
    body = re.search(r"<body\b[^>]*>\n?", text, re.I)
    if body:
        return body.end()
    for tag in re.finditer(r"<style\b.*?</style\s*>|<script\b.*?</script\s*>|<!--.*?-->|<(/?[a-z!]+)", text, re.I | re.S):
        if tag[1] and tag[1].lower() not in ("html", "head", "/head", "meta", "title", "/title", "link", "base", "!doctype"):
            return tag.start()
    return None


def pre_tool_use(payload):
    """{"updatedInput": stamped input} for a Write of a page, else {}; stamps each unstamped page `open` names. Never raises.
    A page a Bash call writes and opens in the same call is not there yet, so it stays unstamped until its next open: a
    rewritten command (an `open` wrapper) was refused by the Bash tool's own check as brace-with-quote obfuscation."""
    tool, inp = payload.get("tool_name"), payload.get("tool_input") or {}
    try:
        if tool == "Write" and isinstance(inp.get("content"), str) and is_page(inp.get("file_path") or ""):
            content = stamp(inp["content"])
            return {"updatedInput": {**inp, "content": content}} if content else {}
        command = inp.get("command") if tool == "Bash" else None
        if isinstance(command, str) and re.search(r"(^|[;&|(\s])open\s", command):
            for word in shlex.split(command, comments=True):
                page = Path(os.path.expanduser(os.path.expandvars(word)))
                if is_page(word) and page.is_file() and BEGIN not in (text := page.read_text(errors="replace")):
                    page.write_text(stamp(text) or text)
    except Exception:  # a stamp never blocks or breaks a call
        pass
    return {}
