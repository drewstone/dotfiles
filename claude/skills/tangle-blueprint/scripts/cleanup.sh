#!/usr/bin/env bash
# Kill anvil, the Blueprint Manager, and any blueprint child processes.
# Clears /tmp/tangle-e2e/.

set -euo pipefail
source "$(dirname "$0")/_common.sh"

log_info "Cleaning up tangle-blueprint e2e state..."

# Kill via PID files if present.
kill_pid_file "$TANGLE_E2E_DIR/manager.pid"
kill_pid_file "$TANGLE_E2E_DIR/anvil.pid"

# Fallback: pattern-kill any stragglers.
pkill -f "blueprint-manager" 2>/dev/null || true
pkill -f "anvil.*load-state" 2>/dev/null || true
# Kill any blueprint binary children the manager spawned.
for bin in incredible-squaring-blueprint-bin llm-operator voice-operator video-gen-operator avatar-operator modal-operator training-operator vector-store-operator embedding-operator; do
  pkill -f "$bin" 2>/dev/null || true
done

# Free known ports.
for port in 8545 8276 8277 9276; do
  kill_port "$port"
done

# Remove working dir.
if [ -d "$TANGLE_E2E_DIR" ]; then
  rm -rf "$TANGLE_E2E_DIR"
fi

log_ok "Cleanup complete"
