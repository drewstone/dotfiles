#!/usr/bin/env bash
# PreToolUse(Bash) nudge for waits that throw away their own answer.
#
# When a Bash call passes its timeout the harness either moves it to the
# background, which keeps the work and notifies later, or kills it. A killed
# call returns only the bytes it had already written to stdout. So a wait loop
# that prints after `done` returns nothing at all, while one that prints each
# iteration keeps its progress.
#
# Measured 2026-08-26 over 1,830 transcripts, 80 capped wait loops (66 parsed):
#   silent loop body  -> lost all output 29 of 30  (96.7%)
#   printing body     -> lost all output 13 of 36  (36.1%)
#   delta +60.6pp, bootstrap 95% CI [+43.3, +77.8], Cohen's h 1.485, p < 1e-5
#
# Cost, counting only output no log could recover: 479 min over 55 days, which
# is 8.7 min/day. 228 min silent wait loops, 143 min long work with no log,
# 108 min printing wait loops. The two triggers below cover 371 of the 479.
# The loss concentrates: 60 of 1,830 transcripts hold all of it, worst 125 min.
#
# Three triggers, all advisory:
#   silent-wait : a loop that sleeps and never writes to stdout in its body.
#   ci-poll     : repeated hand-polling of CI, which a single blocking wait beats.
#   long-work   : a command known to outlast the cap, started in the foreground.
#
# Of the 72 dead calls that were not waits at all, 0 used run_in_background.
# 123 min were nested claude/codex/opencode runs, 31 min git push and gh pr
# create, 48 min builds and installs, 18 min test suites. long-work stays quiet
# when the command already writes to a file, because that log survives the kill.
#
# Fail-open by contract: any missing dependency, parse failure, or unexpected
# input exits 0 with no output, so this can never block normal Bash use.

set -uo pipefail
exec 2>/dev/null

payload="$(cat 2>/dev/null || true)"
[ -z "$payload" ] && exit 0

# Cheap pre-filter. This hook runs on every Bash call and starting python3 costs
# ~40 ms, so skip the parser unless the payload could possibly match a trigger.
# Deliberately loose: it may pass a command the parser then rejects, but it must
# never drop one the parser would have flagged.
printf '%s' "$payload" | grep -Eq \
  'sleep|gh[a-z-]* (run|pr) |run view |claude|codex|opencode|pnpm|npm|yarn|bun|npx|cargo|docker|vitest|jest|pytest|tsc|tsx|ts-node|make|poetry|[a-zA-Z0-9_-]\.sh|git push|git clone|go test|pip3? install|uv (run|pip)' \
  || exit 0
command -v python3 >/dev/null || exit 0

# The payload goes on stdin, not argv: a Bash command can carry a whole heredoc
# script and an argv-sized payload would hit ARG_MAX and fail the hook.
read -r -d '' GUARD_PY <<'PY'
import json
import re
import sys

try:
    d = json.loads(sys.stdin.read())
except Exception:
    sys.exit(0)

cmd = ((d.get("tool_input") or {}).get("command") or "")
sid = d.get("session_id") or "nosess"
if not cmd:
    sys.exit(0)

notes = []

# --- trigger 1: a wait loop whose body never writes to stdout ---------------
# Only loops that actually sleep are in scope; a busy loop is a different bug.
LOOP_BODY = re.compile(r"\b(?:for|while|until)\b[^\n;]*(?:;|\n)\s*do\b(.*?)\bdone\b", re.S | re.I)
EMIT = re.compile(r"\b(?:echo|printf|tee|cat)\b")
SLEEP = re.compile(r"\bsleep\s+[0-9.]+")

bodies = LOOP_BODY.findall(cmd)
silent = [b for b in bodies if SLEEP.search(b) and not EMIT.search(b)]
if silent and not (d.get("tool_input") or {}).get("run_in_background"):
    notes.append(
        "HALO silent-wait: this loop sleeps but never writes to stdout inside the "
        "loop body. If the call passes its timeout the harness kills it and you get "
        "back only what was already printed, which here is nothing. Measured over "
        "1,711 transcripts: silent capped wait loops lost all output 29 of 30 times, "
        "printing ones 13 of 36 (delta +61pp, 95% CI [+43,+78]). Either echo the "
        "state each iteration, or set run_in_background:true and let the completion "
        "notification wake you."
    )

# --- trigger 2: repeated hand-polling of CI --------------------------------
if re.search(r"gh[a-z-]* (?:run (?:view|list)|pr (?:checks|view))|run view ", cmd):
    ctr = "/tmp/halo-pollguard-%s.cnt" % re.sub(r"[^A-Za-z0-9-]", "", sid)
    n = 0
    try:
        with open(ctr) as fh:
            n = int((fh.read() or "0").strip() or 0)
    except Exception:
        n = 0
    n += 1
    try:
        with open(ctr, "w") as fh:
            fh.write(str(n))
    except Exception:
        pass
    # Speak on the 3rd poll, then every 10th. The old hook spoke exactly once;
    # in session ff995b36 it fired at poll 3 and stayed silent through 51 more
    # waits, 12 of which hit the cap.
    if n == 3 or (n > 3 and n % 10 == 0):
        notes.append(
            "HALO ci-poll: %d hand-polls of CI this session. A single blocking wait "
            "beats a poll loop: `gh run watch <id> --exit-status` returns on the "
            "terminal state. For one answer use Bash run_in_background with an "
            "`until` loop; reserve Monitor for a stream of events." % n
        )

# --- trigger 3: long work started in the foreground -------------------------
# Match on the command word of each shell segment, never on a substring: the
# literal "claude" appears inside ~/.claude/... in a large share of commands and
# a substring match would fire on nearly everything.
SEGMENT = re.compile(r"(?:\|\||&&|[;|\n&]|\bthen\b|\bdo\b|\$\(|`)")
ENVASSIGN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=\S*$")

# Always slow, whatever they are asked to do.
ALWAYS = {"claude", "codex", "opencode", "vitest", "jest", "pytest", "tsc",
          "make", "tsx", "ts-node"}

# Package managers run project scripts whose names cannot be enumerated:
# `pnpm signoff` and `pnpm exec tsx ...` both outlast the cap. So allowlist the
# handful of fast read-only subcommands and treat everything else as slow.
PKG = {"pnpm", "npm", "yarn", "bun", "npx", "pip", "pip3", "uv", "poetry"}
PKG_FAST = {"ls", "list", "why", "view", "info", "config", "bin", "root",
            "prefix", "version", "--version", "-v", "help", "--help", "outdated",
            "whoami", "ping", "show"}

# Slow only for specific subcommands.
SUBCMD = {
    "cargo": {"build", "test", "check", "run", "clippy", "bench", "doc"},
    "docker": {"build", "run", "compose", "pull", "push"},
    "git": {"push", "clone"},
    "go": {"test", "build"},
}
GH = re.compile(r"^gh[a-z-]*$")
SHELL = {"bash", "sh", "zsh"}

# A command that already sends stdout to a file keeps its output when the call
# is killed, so it needs no warning. Matches `> f`, `>> f`, `&> f`, `| tee f`,
# but not `>&2`, `>/dev/null`, or a redirect of a plain file descriptor.
REDIRECTED = re.compile(r"(?:&?>>?\s*(?!&|/dev/null)\S+)|(?:\|\s*tee\b)")


def long_work(text):
    for seg in SEGMENT.split(text):
        words = seg.strip().split()
        while words and (ENVASSIGN.match(words[0]) or words[0] in
                         ("sudo", "time", "exec", "command", "nohup", "unset", "export")):
            words = words[1:]
        if not words:
            continue
        head = words[0].rsplit("/", 1)[-1]
        arg = words[1] if len(words) > 1 else ""
        if head in ALWAYS:
            return head
        if GH.match(head):
            rest = " ".join(words[1:3])
            if rest.startswith("pr create") or rest.startswith("run watch"):
                return "%s %s" % (head, rest)
            continue
        if head in PKG:
            if arg and arg not in PKG_FAST:
                return "%s %s" % (head, arg)
            continue
        if head in SUBCMD and arg in SUBCMD[head]:
            return "%s %s" % (head, arg)
        # `bash scripts/preflight.sh` runs an arbitrary project script.
        if head in SHELL and arg.endswith(".sh"):
            return "%s %s" % (head, arg)
    return None


hit = long_work(cmd)
if hit and not (d.get("tool_input") or {}).get("run_in_background") \
        and not REDIRECTED.search(cmd):
    notes.append(
        "HALO long-work: `%s` regularly outlasts the call timeout. Measured over "
        "1,711 transcripts: 72 capped calls were long work rather than waits, they "
        "burned 303 min returning nothing, and 0 of 72 had set run_in_background. "
        "Set run_in_background:true and let the completion notification wake you, "
        "or tee the output to a file so a kill still leaves you the log." % hit
    )

if notes:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": " ".join(notes),
        }
    }))
sys.exit(0)
PY

printf '%s' "$payload" | python3 -c "$GUARD_PY" 2>/dev/null || exit 0
exit 0
