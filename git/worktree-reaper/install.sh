#!/usr/bin/env bash
# Install the worktree reaper. Idempotent. No sudo.
#
#   Linux: ~/.local/bin/wt-reaper + systemd user wt-reaper.{service,timer} (hourly)
#   macOS: ~/.local/bin/wt-reaper + ~/Library/LaunchAgents/com.drew.wt-reaper.plist (04:15 daily)
#
# Linux runs hourly: the beelinks gain worktrees by the hour, and a nightly pass let beelink2
# fall below its gate floor between runs (2026-10-10).
#
# Files are copied, so the installed reaper does not depend on this checkout.
# Before enabling on a new machine, run `wt-reaper --dry-run` and read the list.
# Log: ~/.local/state/wt-reaper/wt-reaper.log (plus the journal on Linux).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$HOME/.local/bin/wt-reaper"

# Where tangle-tools storage_lifecycle runs its worktrees tier, that package owns worktree removal
# (with salvage archives) and wt-reaper stays off. Its tiers default to every archive tier, worktrees
# included; a host without an archive drive (the beelinks) lists only Docker and /tmp tiers, and there
# wt-reaper is what reaps worktrees (tangle-tools #948).
lifecycle_owns_worktrees() {
  local cfg="$HOME/.local/share/tangle-tools/storage_lifecycle/hosts/$(hostname).json"
  [ -f "$cfg" ] || return 1
  python3 -c 'import json, sys; t = json.load(open(sys.argv[1])).get("tiers"); sys.exit(0 if t is None or "worktrees" in t else 1)' "$cfg"
}
if [ "$(uname -s)" = Linux ] && lifecycle_owns_worktrees; then
  echo "wt-reaper: skipped; tangle-tools storage_lifecycle runs the worktrees tier on this host"
  exit 0
fi

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
    install -d "$HOME/Library/LaunchAgents"
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
    # The reaper removes nothing unless lsof can see every process, which needs root.
    if ! sudo -n /usr/sbin/lsof -n -P -w -F pn -p $$ >/dev/null 2>&1; then
      echo "wt-reaper: sudo -n lsof unavailable; the agent will skip every worktree until you run once:"
      echo "  echo '$(id -un) ALL=(root) NOPASSWD: /usr/sbin/lsof' | sudo tee /etc/sudoers.d/wt-reaper && sudo chmod 0440 /etc/sudoers.d/wt-reaper && sudo visudo -c"
    fi
    ;;
  *)
    echo "wt-reaper: unsupported OS $(uname -s)"; exit 1 ;;
esac
echo "wt-reaper installed: $BIN (log ~/.local/state/wt-reaper/wt-reaper.log)"
