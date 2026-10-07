#!/usr/bin/env bash
# PreToolUse(Bash) block for recursive searches over the whole home or state trees.
#
# On 2026-10-02/03 agents ran `find /Users/drew ...`, `grep -rl <key> ~/.config
# ~/.local/state ...` and `grep -rl clef-flash ~/.local/state` on the Mac. Each ran
# 4-10 min at ~100% CPU and heavy I/O while the Mac sat at load 50-110 with swap
# full, and each answer was available from a narrower path (the repo, the owning
# state file, or the vault by key name).
#
# Scope: grep -r/-R, rg, find, du and fd whose search roots include the home
# directory itself or a broad state/cache/config tree under it. Searches inside a
# repository or a named subdirectory stay allowed.
#
# Fail-open: any parse failure exits 0 so normal Bash use is never blocked.

set -uo pipefail
exec 2>/dev/null

payload="$(cat 2>/dev/null || true)"
[ -z "$payload" ] && exit 0
printf '%s' "$payload" | grep -qE '\b(grep|rg|find|fd|du)\b' || exit 0
command -v python3 >/dev/null || exit 0

read -r -d '' GUARD_PY <<'PY'
import json, os, re, shlex, sys
try:
    d = json.loads(sys.stdin.read())
except Exception:
    sys.exit(0)
cmd = (d.get("tool_input") or {}).get("command") or ""
home = os.path.expanduser("~")
# Roots too broad to scan: the home itself and its sprawling hidden trees.
BROAD = {home, home + "/", home + "/.local", home + "/.local/state", home + "/.local/share",
         home + "/.config", home + "/.cache", home + "/Library", home + "/.codex", home + "/.claude"}

def norm(tok):
    tok = tok.strip("'\"")
    tok = tok.replace("$HOME", home).replace("${HOME}", home)
    if tok == "~" or tok.startswith("~/"):
        tok = home + tok[1:]
    return tok.rstrip("/") or "/"

def broad_roots(seg):
    try:
        toks = shlex.split(seg)
    except ValueError:
        return []
    if not toks:
        return []
    prog = os.path.basename(toks[0])
    if prog not in ("grep", "rg", "find", "fd", "du"):
        return []
    if prog == "grep" and not any(t.startswith("-") and ("r" in t or "R" in t) and not t.startswith("--") for t in toks[1:]) \
            and "--recursive" not in toks:
        return []
    return [t for t in toks[1:] if not t.startswith("-") and norm(t) in {b.rstrip("/") for b in BROAD}]

hits = []
for seg in re.split(r"\|\||&&|;|\||\n", cmd):
    hits += broad_roots(seg.strip())
if hits:
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": (
            f"scan-guard: recursive search over a broad home tree ({', '.join(sorted(set(hits)))}) is blocked. "
            "On the Mac these ran 4-10 min at full CPU while load was 50-110. Search the owning repo, "
            "a named subdirectory, the specific state file, or look up vault secrets by key name "
            "(dotenvx get -f <file>)."
        ),
    }}))
sys.exit(0)
PY

printf '%s' "$payload" | python3 -c "$GUARD_PY" 2>/dev/null || exit 0
exit 0
