#!/usr/bin/env bash
# Install the main-checkout fast-forward job. Idempotent. No sudo.
#
#   Linux: ~/.local/bin/main-checkout-ff + systemd user main-checkout-ff.{service,timer} (every 30 min)
#   macOS: ~/.local/bin/main-checkout-ff + ~/Library/LaunchAgents/com.drew.main-checkout-ff.plist (every 30 min)
#
# Files are copied, so the installed job does not depend on this checkout.
# Preview on a new machine with `main-checkout-ff --dry-run`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$HOME/.local/bin/main-checkout-ff"

install -d "$HOME/.local/bin" "$HOME/.local/state/main-checkout-ff"
install -m 0755 "$SCRIPT_DIR/main-checkout-ff" "$BIN"
bash -n "$BIN"

case "$(uname -s)" in
  Linux)
    unit_dir="$HOME/.config/systemd/user"
    install -d "$unit_dir"
    install -m 0644 "$SCRIPT_DIR/systemd/main-checkout-ff.service" "$unit_dir/main-checkout-ff.service"
    install -m 0644 "$SCRIPT_DIR/systemd/main-checkout-ff.timer" "$unit_dir/main-checkout-ff.timer"
    systemctl --user daemon-reload
    systemctl --user enable --now main-checkout-ff.timer >/dev/null
    systemctl --user is-active --quiet main-checkout-ff.timer
    echo "main-checkout-ff timer: $(systemctl --user show main-checkout-ff.timer -p NextElapseUSecRealtime --value)"
    ;;
  Darwin)
    label=com.drew.main-checkout-ff
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
    ;;
  *)
    echo "main-checkout-ff: unsupported OS $(uname -s)"; exit 1 ;;
esac
echo "main-checkout-ff installed: $BIN (log ~/.local/state/main-checkout-ff/main-checkout-ff.log)"
