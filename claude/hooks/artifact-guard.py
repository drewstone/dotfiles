#!/usr/bin/env python3
"""PreToolUse block on publishing a claude.ai artifact, by the Artifact tool or the claude-artifacts MCP tools.

An artifact lives in one claude.ai account, so after an account switch its link opens nothing.

Publishing is denied: a page is a local HTML file under ~/reviews, linked by absolute path.
Reading, listing and deleting artifacts stay allowed, so a link the owner pastes can still be read.

Fail-open: any parse failure exits 0 so normal tool use is never blocked.
"""
import json
import sys

REASON = (
    "Artifacts go unreadable after an account switch. Write the page to ~/reviews/<YYYY-MM-DD>-<slug>.html instead: a whole document starting with "
    "<!doctype html>, CSS and data inline, then give its absolute path and run `open <path>`."
)
BLOCKED = {"publish", "pin", "unpin", "publish_version", "publish_files", "edit_version", "create_from_type", "pin_artifact", "unpin_artifact"}


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read())
    except Exception:
        return
    name = payload.get("tool_name") or ""
    action = ((payload.get("tool_input") or {}).get("action") or "publish") if name == "Artifact" else name.removeprefix("mcp__claude-artifacts__")
    if action not in BLOCKED:
        return
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": REASON,
    }}))


if __name__ == "__main__":
    main()
