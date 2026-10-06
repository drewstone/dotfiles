#!/usr/bin/env bash
# Install gate-run, its shims and the gates and prod slices as systemd user units. Every Linux host.
# Idempotent: changes only what differs and reloads only when something changed.
#
#   ~/.local/bin/gate-run                         -> host/gates/gate-run
#   ~/.local/share/gate-run/shims                 -> host/gates/shims (pnpm npm npx turbo vitest tsc)
#   ~/.config/gate-run/config.json                slots and gate CPUs for this host
#   ~/.config/systemd/user/gates.slice            about half the CPUs, a memory ceiling
#   ~/.config/systemd/user/prod.slice             first claim on CPU and memory
#   ~/.config/systemd/user/<unit>.d/60-prod-slice.conf   for each production unit installed here
#
# A production service moves into prod.slice the next time it starts. Restart it when convenient.
#
# Usage: host/install-gates.sh [--check]
set -euo pipefail
CHECK=0
case "${1:-}" in
  --check) CHECK=1 ;;
  '') ;;
  *) echo "usage: $0 [--check]" >&2; exit 2 ;;
esac
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES="$(cd "$SCRIPT_DIR/.." && pwd)"
[ "$(uname -s)" = Linux ] || { echo "gates: Linux only, skipped"; exit 0; }
[ "$(id -u)" != 0 ] || { echo "gates: run as the desktop user, not root; skipped"; exit 0; }
UNITS="$HOME/.config/systemd/user"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

cpus="$(nproc)"
mem_gb="$(awk '/MemTotal/ {printf "%d", $2 / 1048576}' /proc/meminfo)"
half=$((cpus / 2))
slots=1; [ "$cpus" -ge 32 ] && slots=2
gate_mem=$((mem_gb * 40 / 100)); [ "$gate_mem" -gt 40 ] && gate_mem=40
prod_low=8; [ "$mem_gb" -ge 110 ] && prod_low=12
# Production units this host may run. A unit not installed here is skipped.
PROD_UNITS=(tangle-solve-aggregation.service tangle-solve-indexer.service tangle-solve-operator@.service
  tangle-solve-sponsor.service trace-archive.service trace-archive-drive-trees.service fleet-pages.service
  fleet-report-http.service fleet-report.service discovery-records-watch.service)

drift=0 changed=0
put() {  # put CONTENT DEST
  if [ "$(cat "$2" 2>/dev/null)" != "$1" ]; then
    if [ "$CHECK" = 1 ]; then echo "  drift $2"; drift=1; return 0; fi
    mkdir -p "$(dirname "$2")"; printf '%s\n' "$1" >"$2"; echo "  installed $2"; changed=1
  fi
}
link() {  # link TARGET DEST
  if [ "$(readlink "$2" 2>/dev/null)" != "$1" ]; then
    if [ "$CHECK" = 1 ]; then echo "  drift $2"; drift=1; return 0; fi
    mkdir -p "$(dirname "$2")"; ln -sfn "$1" "$2"; echo "  linked $2 -> $1"
  fi
}
render() { sed -e "s#@DOTFILES@#$DOTFILES#g" -e "s#@CPU_QUOTA@#$((half * 100))%#g" \
  -e "s#@MEMORY_MAX@#${gate_mem}G#g" -e "s#@MEMORY_LOW@#${prod_low}G#g" "$1"; }

link "$SCRIPT_DIR/gates/gate-run" "$HOME/.local/bin/gate-run"
link "$SCRIPT_DIR/gates/shims" "$HOME/.local/share/gate-run/shims"
put "{\"slots\": $slots, \"cpus\": \"$half-$((cpus - 1))\"}" "$HOME/.config/gate-run/config.json"
put "$(render "$SCRIPT_DIR/gates/gates.slice.in")" "$UNITS/gates.slice"
put "$(render "$SCRIPT_DIR/gates/prod.slice.in")" "$UNITS/prod.slice"
for unit in "${PROD_UNITS[@]}"; do
  [ -e "$UNITS/$unit" ] || continue
  put "$(cat "$SCRIPT_DIR/gates/prod-slice.conf")" "$UNITS/$unit.d/60-prod-slice.conf"
done
if [ "$CHECK" = 1 ]; then [ "$drift" = 0 ] || exit 1; fi
[ "$changed" = 0 ] || systemctl --user daemon-reload

quota="$(systemctl --user show gates.slice -p CPUQuotaPerSecUSec --value)"
max="$(systemctl --user show gates.slice -p MemoryMax --value)"
echo "gates.slice: CPUQuotaPerSecUSec=$quota MemoryMax=$max; $slots slot(s) on CPUs $half-$((cpus - 1))"
[ "$quota" = "${half}s" ] || { echo "  FAIL: expected CPUQuotaPerSecUSec=${half}s"; exit 1; }
