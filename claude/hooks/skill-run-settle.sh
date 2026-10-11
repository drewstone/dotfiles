#!/usr/bin/env bash
# SessionEnd hook: judge the ended session's operator corrections into skill-run-events.jsonl and,
# at most once every 20 hours on this host, refresh pull request outcomes on GitHub and settle the
# correction windows of every session (Codex has no SessionEnd, so its runs settle here).
# skill-run-log reads the hook payload (session_id) from stdin. Never blocks or fails a session.
tool="$HOME/bin/skill-run-log"
[ -x "$tool" ] || exit 0
"$tool" --settle --hook >/dev/null 2>&1 || true
exit 0
