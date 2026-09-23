#!/usr/bin/env bash
# Install the cli-bridge LLM slice and its CPU cap as systemd user units. GTR only.
# Idempotent: copies only changed files and reloads only when something changed.
#
#   ~/.config/systemd/user/cli-bridge-llm.slice
#   ~/.config/systemd/user/cli-bridge-llm.slice.d/10-cpu-cap.conf
#
# The cap (CPUQuota=2400%, CPUWeight=50) keeps every cli-bridge LLM scope,
# including discovery-lab's kissat solver campaign, to 24 of 32 cores.
#
# Usage: host/install-cli-bridge-slice.sh [--check]
#   --check   report drift and change nothing; exit 1 when anything differs.
set -euo pipefail
CHECK=0
case "${1:-}" in
  --check) CHECK=1 ;;
  '') ;;
  *) echo "usage: $0 [--check]" >&2; exit 2 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/cli-bridge"
[ "$(uname -s)" = Linux ] || { echo "cli-bridge slice: Linux only, skipped"; exit 0; }
if [ "$(id -u)" = 0 ]; then
  echo "cli-bridge slice: run as the desktop user, not root; skipped"; exit 0
fi
DEST="$HOME/.config/systemd/user"

changed=0
put() {
  local rel="$1"
  if ! cmp -s "$SRC/$rel" "$DEST/$rel"; then
    if [ "$CHECK" = 1 ]; then echo "  drift $DEST/$rel"; changed=1; return 0; fi
    install -D -m 0644 "$SRC/$rel" "$DEST/$rel"
    echo "  installed $DEST/$rel"
    changed=1
  fi
}
put cli-bridge-llm.slice
put cli-bridge-llm.slice.d/10-cpu-cap.conf
if [ "$CHECK" = 1 ] && [ "$changed" = 1 ]; then exit 1; fi
if [ "$changed" = 1 ]; then systemctl --user daemon-reload; fi

# Verify what systemd loaded from our files. A higher-numbered
# `systemctl set-property` drop-in (user.control/50-*.conf) would override
# them; report that instead of fighting it.
quota="$(systemctl --user show cli-bridge-llm.slice -p CPUQuotaPerSecUSec --value)"
weight="$(systemctl --user show cli-bridge-llm.slice -p CPUWeight --value)"
echo "cli-bridge-llm.slice: CPUQuotaPerSecUSec=$quota CPUWeight=$weight"
if [ "$quota" != 24s ] || [ "$weight" != 50 ]; then
  echo "  FAIL: expected CPUQuotaPerSecUSec=24s CPUWeight=50"
  systemctl --user show cli-bridge-llm.slice -p DropInPaths --value | tr ' ' '\n' | sed 's/^/  drop-in: /'
  exit 1
fi
