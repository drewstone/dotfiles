#!/usr/bin/env bash
# HALO SessionEnd hook: extract a loop-profile from the just-ended session and
# append it to a rolling log. Deterministic, cheap (~constant memory, streams).
# This is the L0→L1 capture: every session profiled, so loop-waste compounds
# into a corpus instead of evaporating. Fail-silent — never blocks session end.
#
# Reads the Claude Code SessionEnd hook payload (JSON on stdin) for
# transcript_path. Routes profiles to ~/.claude/halo/profiles.jsonl.

set -uo pipefail

EXTRACT="$HOME/dotfiles/claude/tools/halo-extract.mjs"
OUT_DIR="$HOME/.claude/halo"
OUT="$OUT_DIR/profiles.jsonl"

# Resolve a real node binary — the login shell's `node` is an nvm function
# wrapper that emits noise / fails in non-interactive hooks (a recurring
# friction the corpus flagged). Prefer concrete paths.
NODE=""
for c in /opt/homebrew/bin/node /usr/local/bin/node "$HOME"/.nvm/versions/node/*/bin/node; do
  [ -x "$c" ] && NODE="$c" && break
done
[ -z "$NODE" ] && NODE="$(command -v node 2>/dev/null || true)"
[ -z "$NODE" ] && exit 0
[ -x "$EXTRACT" ] || [ -f "$EXTRACT" ] || exit 0

payload="$(cat 2>/dev/null || true)"
transcript="$(printf '%s' "$payload" | "$NODE" -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  try{const j=JSON.parse(s);process.stdout.write(j.transcript_path||"")}catch{process.stdout.write("")}
})' 2>/dev/null || true)"

[ -z "$transcript" ] && exit 0
[ -f "$transcript" ] || exit 0

mkdir -p "$OUT_DIR" 2>/dev/null || true
"$NODE" "$EXTRACT" "$transcript" >> "$OUT" 2>/dev/null || true
exit 0
