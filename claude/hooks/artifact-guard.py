#!/usr/bin/env python3
"""PreToolUse(Artifact) block on publishing a claude.ai artifact.

An artifact lives in one claude.ai account, so after an account switch its link opens nothing.

Publishing is denied: a page is a local HTML file under ~/reviews, linked by absolute path.
Reading, listing and deleting artifacts stay allowed, so a link Drew pastes can still be read.

Fail-open: any parse failure exits 0 so normal tool use is never blocked.
"""
import json
import sys

REASON = (
    "Artifacts go unreadable after an account switch. Write the page to ~/reviews/<YYYY-MM-DD>-<slug>.html instead: a whole document starting with "
    "<!doctype html>, CSS and data inline (a viz brief page: `viz brief spec.json -o ~/reviews/<file>.html`), "
    "then give its absolute path and run `open <path>`."
)
BLOCKED = {"publish", "pin", "unpin"}


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read())
    except Exception:
        return
    if payload.get("tool_name") != "Artifact":
        return
    action = (payload.get("tool_input") or {}).get("action") or "publish"
    if action not in BLOCKED:
        return
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": REASON,
    }}))


if __name__ == "__main__":
    main()
