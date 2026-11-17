#!/usr/bin/env python3
"""Take feedback the owner types on a stamped page (page_author.py) to the session that wrote the page.

claude/install.sh runs this as a launchd agent on 127.0.0.1:PAGE_FEEDBACK_PORT. It takes only a POST to /feedback from a
file:// page (Origin: null) addressed to this host and port, at most 8 KB, carrying a token page_author.py minted. The token
is the guard: a website, or a sandboxed frame on one, also sends Origin: null, and without it could write to the owner's agents.
`page-feedback-send <session id>`, found on PATH, delivers the message on its stdin and exits 0 once it landed. With no sender,
or when it fails (the session has ended), the message waits in STATE/inbox.jsonl, and the next session to start in the
author's directory reads it (`page_feedback.py --session-start`, a SessionStart hook).
"""
import fcntl
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

from page_author import PORT, STATE


def queue(record, message):
    with os.fdopen(os.open(STATE / "inbox.jsonl", os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600), "a") as inbox:
        fcntl.flock(inbox, fcntl.LOCK_EX)  # session_start rewrites the inbox under this lock
        inbox.write(json.dumps({"cwd": record["cwd"], "message": message, "at": time.time()}) + "\n")


class Feedback(BaseHTTPRequestHandler):
    def answer(self, code, ok, message):
        data = json.dumps({"ok": ok, "message": message}).encode()
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "null")  # lets the file:// page read the answer
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        size = int(self.headers.get("Content-Length") or 0)
        if (self.headers.get("Origin") != "null" or self.path != "/feedback" or not 0 < size <= 8192
                or self.headers.get("Host") not in (f"127.0.0.1:{PORT}", f"localhost:{PORT}")):
            return self.answer(403, False, "Refused: only a stamped page on this computer can send feedback.")
        try:
            body = json.loads(self.rfile.read(size))
            token, text = str(body["token"]), str(body["text"]).strip()
            record = json.loads((STATE / "tokens" / f"{token}.json").read_text()) if re.fullmatch(r"[\w-]{24}", token) else None
        except (ValueError, KeyError, TypeError, OSError):
            record, text = None, ""
        if not record or not text:
            return self.answer(403, False, "Refused: unknown page token, or no text.")
        message = f"[page feedback] {record['page']}\n{text}"
        sender, run, why = shutil.which("page-feedback-send"), None, "no page-feedback-send on PATH"
        try:
            run = sender and subprocess.run([sender, record["sid"]], input=message, capture_output=True, text=True, timeout=20)
        except (OSError, subprocess.SubprocessError) as error:  # a hung or broken sender still queues
            why = f"page-feedback-send: {type(error).__name__}"
        if run and run.returncode == 0:
            return self.answer(200, True, f"Delivered to {record['name']}.")
        if run:
            why = (run.stderr.strip().splitlines() or [f"exit {run.returncode}"])[-1]
        queue(record, message)
        self.answer(200, False, f"Not delivered to {record['name']} ({why}). Queued for the next session in {record['cwd']}; "
                                f"by hand: printf %s {shlex.quote(message)} | page-feedback-send {record['sid']}")


def session_start():
    """Print the queued feedback for this session's directory as its context, and take it out of the inbox."""
    cwd, path = json.load(sys.stdin).get("cwd"), STATE / "inbox.jsonl"
    if not path.exists():
        return
    with open(path, "r+") as inbox:
        fcntl.flock(inbox, fcntl.LOCK_EX)
        rows = [json.loads(line) for line in inbox if line.strip()]
        inbox.seek(0)
        inbox.truncate()
        inbox.writelines(json.dumps(r) + "\n" for r in rows if r["cwd"] != cwd)
    mine = [r["message"] for r in rows if r["cwd"] == cwd]
    if mine:
        print("The owner sent this feedback on review pages while their author session was gone:\n\n" + "\n\n".join(mine))


if __name__ == "__main__":
    if sys.argv[1:] == ["--session-start"]:
        session_start()
    else:
        HTTPServer(("127.0.0.1", PORT), Feedback).serve_forever()
