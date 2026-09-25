#!/usr/bin/env bash
# Install the Time Machine local-snapshot trimmer on macOS. Idempotent. No sudo.
# Runs every 20 minutes; deletes local snapshots only while no backup disk is attached.
# Log: ~/.local/state/tm-snapshot-trim/launchd.out
set -euo pipefail
[ "$(uname -s)" = Darwin ] || { echo "tm-snapshot-trim: macOS only"; exit 0; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
label=com.drew.tm-snapshot-trim
install -d "$HOME/.local/bin" "$HOME/.local/state/tm-snapshot-trim" "$HOME/Library/LaunchAgents"
install -m 0755 "$SCRIPT_DIR/tm-snapshot-trim" "$HOME/.local/bin/tm-snapshot-trim"
plist="$HOME/Library/LaunchAgents/$label.plist"
tmp="$(mktemp)"
sed "s#@HOME@#$HOME#g" "$SCRIPT_DIR/launchd/$label.plist.in" > "$tmp"
plutil -lint "$tmp" >/dev/null
if ! cmp -s "$tmp" "$plist" 2>/dev/null; then
  install -m 0644 "$tmp" "$plist"
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
fi
rm -f "$tmp"
launchctl print "gui/$(id -u)/$label" >/dev/null 2>&1 || launchctl bootstrap "gui/$(id -u)" "$plist"
launchctl print "gui/$(id -u)/$label" | grep -E '^\s*state =' || true
echo "tm-snapshot-trim installed: $HOME/.local/bin/tm-snapshot-trim"
