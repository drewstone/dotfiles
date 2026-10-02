#!/usr/bin/env bash
# Install the Mac disk guard. Idempotent. No sudo.
# Runs every 15 minutes. Also disables com.drew.disk-guard (storage_lifecycle), which fails on macOS.
# Log: ~/.local/state/mac-disk-guard/launchd.out
set -euo pipefail
[ "$(uname -s)" = Darwin ] || { echo "mac-disk-guard: macOS only"; exit 0; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
label=com.drew.mac-disk-guard
install -d "$HOME/.local/bin" "$HOME/.local/state/mac-disk-guard" "$HOME/Library/LaunchAgents"
install -m 0755 "$SCRIPT_DIR/mac-disk-guard" "$HOME/.local/bin/mac-disk-guard"
install -m 0755 "$SCRIPT_DIR/../tm-snapshot-trim/tm-snapshot-trim" "$HOME/.local/bin/tm-snapshot-trim"
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
# The trimmer used to run as its own agent; the guard runs it now.
launchctl bootout "gui/$(id -u)/com.drew.tm-snapshot-trim" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.drew.tm-snapshot-trim.plist"
# storage_lifecycle's disk-guard is Linux-first and exits 1 on the Mac; this guard replaces it here.
launchctl bootout "gui/$(id -u)/com.drew.disk-guard" 2>/dev/null || true
launchctl disable "gui/$(id -u)/com.drew.disk-guard" 2>/dev/null || true
echo "mac-disk-guard installed: $HOME/.local/bin/mac-disk-guard"
