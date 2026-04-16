#!/usr/bin/env bash
# Shared constants and helpers for tangle-blueprint scripts.

set -euo pipefail

# Workspace paths
export TANGLE_E2E_DIR="${TANGLE_E2E_DIR:-/tmp/tangle-e2e}"
export BLUEPRINT_SDK_DIR="${BLUEPRINT_SDK_DIR:-$HOME/webb/blueprint-sdk}"
export MANAGER_BIN="${MANAGER_BIN:-$BLUEPRINT_SDK_DIR/target/debug/blueprint-manager}"
export CARGO_TANGLE_BIN="${CARGO_TANGLE_BIN:-$BLUEPRINT_SDK_DIR/target/debug/cargo-tangle}"
export ANVIL_STATE="${ANVIL_STATE:-$BLUEPRINT_SDK_DIR/crates/chain-setup/anvil/snapshots/localtestnet-state.json}"

# Seeded chain constants (from crates/testing-utils/anvil/src/tangle.rs)
export TANGLE_CONTRACT="0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"
export RESTAKING_CONTRACT="0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
export STATUS_REGISTRY_CONTRACT="0x8f86403A4DE0bb5791fa46B8e795C547942fE4Cf"

# Anvil test accounts
export OPERATOR1_ADDRESS="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
export OPERATOR1_PRIVATE_KEY="59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
export SERVICE_OWNER_ADDRESS="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
export SERVICE_OWNER_PRIVATE_KEY="ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Defaults
export RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
export WS_URL="${WS_URL:-ws://127.0.0.1:8545}"
export BLUEPRINT_ID="${BLUEPRINT_ID:-0}"
export SERVICE_ID="${SERVICE_ID:-0}"
export AUTH_PROXY_PORT="${AUTH_PROXY_PORT:-9276}"

# Color output
if [ -t 1 ]; then
  RED=$'\033[0;31m'
  GREEN=$'\033[0;32m'
  YELLOW=$'\033[0;33m'
  BLUE=$'\033[0;34m'
  RESET=$'\033[0m'
else
  RED="" GREEN="" YELLOW="" BLUE="" RESET=""
fi

log_info() { echo "${BLUE}==>${RESET} $*"; }
log_ok()   { echo "${GREEN}✓${RESET} $*"; }
log_warn() { echo "${YELLOW}⚠${RESET} $*" >&2; }
log_err()  { echo "${RED}✗${RESET} $*" >&2; }
die() { log_err "$*"; exit 1; }

ensure_dirs() {
  mkdir -p "$TANGLE_E2E_DIR"
}

ensure_manager_built() {
  if [ ! -x "$MANAGER_BIN" ]; then
    die "Blueprint Manager binary not found at $MANAGER_BIN. Run: cd $BLUEPRINT_SDK_DIR && cargo build -p blueprint-manager --features macos-dev"
  fi
}

ensure_cargo_tangle_built() {
  if [ ! -x "$CARGO_TANGLE_BIN" ]; then
    die "cargo-tangle binary not found at $CARGO_TANGLE_BIN. Run: cd $BLUEPRINT_SDK_DIR && cargo build --bin cargo-tangle"
  fi
}

is_running() {
  local pid_file="$1"
  [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

kill_pid_file() {
  local pid_file="$1"
  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  fi
}

kill_port() {
  local port="$1"
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
}
