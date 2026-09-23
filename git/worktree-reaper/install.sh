#!/usr/bin/env bash
# Install the nightly worktree reaper. Idempotent. No sudo.
#
#   Linux: ~/.local/bin/wt-reaper + systemd user wt-reaper.{service,timer} (04:15 daily)
#   macOS: ~/.local/bin/wt-reaper + ~/Library/LaunchAgents/com.drew.wt-reaper.plist (04:15 daily)
#
# Files are copied, so the installed reaper does not depend on this checkout.
# Before enabling on a new machine, run `wt-reaper --dry-run` and read the list.
# Log: ~/.local/state/wt-reaper/wt-reaper.log (plus the journal on Linux).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$HOME/.local/bin/wt-reaper"

install -d "$HOME/.local/bin" "$HOME/.local/state/wt-reaper"
install -m 0755 "$SCRIPT_DIR/wt-reaper" "$BIN"
/usr/bin/python3 "$BIN" --help >/dev/null

case "$(uname -s)" in
  Linux)
    unit_dir="$HOME/.config/systemd/user"
    install -d "$unit_dir"
    install -m 0644 "$SCRIPT_DIR/systemd/wt-reaper.service" "$unit_dir/wt-reaper.service"
    install -m 0644 "$SCRIPT_DIR/systemd/wt-reaper.timer" "$unit_dir/wt-reaper.timer"
    systemctl --user daemon-reload
    systemctl --user enable --now wt-reaper.timer >/dev/null
    systemctl --user is-active --quiet wt-reaper.timer
    echo "wt-reaper timer: $(systemctl --user show wt-reaper.timer -p NextElapseUSecRealtime --value)"
    ;;
  Darwin)
    label=com.drew.wt-reaper
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
    launchctl print "gui/$(id -u)/$label" | grep -E '^\s*(state|path) =' || true
    ;;
  *)
    echo "wt-reaper: unsupported OS $(uname -s)"; exit 1 ;;
esac
echo "wt-reaper installed: $BIN (log ~/.local/state/wt-reaper/wt-reaper.log)"
