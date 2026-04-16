#!/usr/bin/env bash
# Boot a local anvil chain with pre-seeded Tangle contract state.
# Writes PID to $TANGLE_E2E_DIR/anvil.pid and log to $TANGLE_E2E_DIR/anvil.log.

set -euo pipefail
source "$(dirname "$0")/_common.sh"

ensure_dirs

if ! command -v anvil >/dev/null 2>&1; then
  die "anvil not found on PATH. Install Foundry: curl -L https://foundry.paradigm.xyz | bash && foundryup"
fi

if [ ! -f "$ANVIL_STATE" ]; then
  die "Anvil state snapshot not found at $ANVIL_STATE"
fi

ANVIL_PID_FILE="$TANGLE_E2E_DIR/anvil.pid"
ANVIL_LOG="$TANGLE_E2E_DIR/anvil.log"

if is_running "$ANVIL_PID_FILE"; then
  log_info "Anvil already running (PID $(cat "$ANVIL_PID_FILE"))"
else
  # Kill anything squatting on 8545 first.
  kill_port 8545

  log_info "Starting anvil with seeded Tangle state..."
  anvil \
    --load-state "$ANVIL_STATE" \
    --port 8545 \
    --host 127.0.0.1 \
    --base-fee 0 \
    --gas-price 0 \
    --gas-limit 100000000 \
    --hardfork cancun \
    > "$ANVIL_LOG" 2>&1 &
  echo $! > "$ANVIL_PID_FILE"

  # Wait up to 10s for anvil to respond.
  for i in $(seq 1 20); do
    if curl -s "$RPC_URL" -X POST -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
fi

# Verify the chain actually loaded the seeded state.
BLOCK=$(curl -s "$RPC_URL" -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  | python3 -c "import sys,json; print(int(json.load(sys.stdin)['result'],16))" 2>/dev/null)

if [ -z "$BLOCK" ] || [ "$BLOCK" -lt 200 ]; then
  log_err "Anvil did not load the seeded state (block=$BLOCK, expected >=200)"
  tail -20 "$ANVIL_LOG" >&2
  exit 1
fi

log_ok "Anvil running at $RPC_URL (block $BLOCK, Tangle contract $TANGLE_CONTRACT)"
