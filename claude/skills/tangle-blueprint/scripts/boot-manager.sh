#!/usr/bin/env bash
# Boot the Blueprint Manager against the local anvil chain.
# Handles port conflicts, config generation, and process management.
#
# Env vars:
#   BLUEPRINT_CARGO_BIN   — binary name for native fallback (required for local dev)
#   BLUEPRINT_ID          — default 0
#   SERVICE_ID            — default 0
#   AUTH_PROXY_PORT       — default 9276
#   KEYSTORE_DIR          — default $TANGLE_E2E_DIR/keystore

set -euo pipefail
source "$(dirname "$0")/_common.sh"

ensure_dirs
ensure_manager_built

KEYSTORE_DIR="${KEYSTORE_DIR:-$TANGLE_E2E_DIR/keystore}"
DATA_DIR="$TANGLE_E2E_DIR/data"
CONFIG_FILE="$TANGLE_E2E_DIR/blueprint.toml"
MANAGER_PID_FILE="$TANGLE_E2E_DIR/manager.pid"
MANAGER_LOG="$TANGLE_E2E_DIR/manager.log"

if [ ! -d "$KEYSTORE_DIR" ]; then
  die "Keystore not found at $KEYSTORE_DIR. Run setup-keystore.sh first."
fi

if [ -z "${BLUEPRINT_CARGO_BIN:-}" ]; then
  log_warn "BLUEPRINT_CARGO_BIN not set — if the on-chain source is a missing Docker image, the manager will fail."
  log_warn "For the pre-seeded blueprint 0, set BLUEPRINT_CARGO_BIN=incredible-squaring-blueprint-bin"
fi

# Kill any stale manager from previous runs.
kill_pid_file "$MANAGER_PID_FILE"
kill_port 8276
kill_port 8277
kill_port "$AUTH_PROXY_PORT"

# Fresh data dir — RocksDB lock files don't release cleanly on kill -9.
rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR"

# Verify anvil is reachable before proceeding.
if ! curl -s "$RPC_URL" -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' >/dev/null 2>&1; then
  die "Anvil is not reachable at $RPC_URL. Run boot-local-chain.sh first."
fi

# Write the BlueprintEnvironment TOML (struct is #[non_exhaustive], need all fields).
cat > "$CONFIG_FILE" <<EOF
test_mode = true
dry_run = false
http_rpc_endpoint = "$RPC_URL"
ws_rpc_endpoint = "$WS_URL"
keystore_uri = "$KEYSTORE_DIR"
data_dir = "$DATA_DIR"
registration_mode = false
registration_capture_only = false
kms_url = "https://kms.tangle.tools"
bootnodes = []
network_bind_port = 0
enable_mdns = false
enable_kademlia = false
target_peer_count = 0

[protocol_settings.Tangle]
blueprint_id = $BLUEPRINT_ID
service_id = $SERVICE_ID
tangle_contract = "$TANGLE_CONTRACT"
restaking_contract = "$RESTAKING_CONTRACT"
status_registry_contract = "$STATUS_REGISTRY_CONTRACT"
EOF

log_info "Booting Blueprint Manager (auth-proxy port $AUTH_PROXY_PORT, binary fallback: ${BLUEPRINT_CARGO_BIN:-<none>})..."

cd "$BLUEPRINT_SDK_DIR"
env \
  BLUEPRINT_ID="$BLUEPRINT_ID" \
  SERVICE_ID="$SERVICE_ID" \
  TANGLE_CONTRACT="$TANGLE_CONTRACT" \
  RESTAKING_CONTRACT="$RESTAKING_CONTRACT" \
  STATUS_REGISTRY_CONTRACT="$STATUS_REGISTRY_CONTRACT" \
  ${BLUEPRINT_CARGO_BIN:+BLUEPRINT_CARGO_BIN="$BLUEPRINT_CARGO_BIN"} \
  "$MANAGER_BIN" \
    -c "$CONFIG_FILE" \
    -k "$KEYSTORE_DIR" \
    -d "$DATA_DIR" \
    -t \
    --allow-unchecked-attestations \
    -s native \
    --auth-proxy-port "$AUTH_PROXY_PORT" \
    -vv \
    > "$MANAGER_LOG" 2>&1 &

echo $! > "$MANAGER_PID_FILE"

# Wait for the manager to connect to the chain and spawn (or fail).
for i in $(seq 1 30); do
  if grep -q "Tangle client initialized at block" "$MANAGER_LOG" 2>/dev/null; then
    BLOCK=$(grep "Tangle client initialized at block" "$MANAGER_LOG" | head -1 | grep -oE '[0-9]+$' || true)
    log_ok "Manager connected to chain at block $BLOCK"
    break
  fi
  if ! kill -0 "$(cat "$MANAGER_PID_FILE")" 2>/dev/null; then
    log_err "Manager exited unexpectedly. Last 20 log lines:"
    tail -20 "$MANAGER_LOG" >&2
    exit 1
  fi
  sleep 0.5
done

# Give it another couple seconds to spawn the blueprint.
sleep 2

if grep -q "Starting process execution" "$MANAGER_LOG" 2>/dev/null; then
  log_ok "Blueprint binary spawned"
elif grep -q "Pulled image" "$MANAGER_LOG" 2>/dev/null; then
  log_ok "Blueprint container started"
else
  log_warn "Manager started but no spawn confirmation yet. Tail: $MANAGER_LOG"
fi

echo
echo "Manager PID:  $(cat "$MANAGER_PID_FILE")"
echo "Log:          $MANAGER_LOG"
echo "Auth Proxy:   http://127.0.0.1:$AUTH_PROXY_PORT"
echo
echo "Tail with:    tail -f $MANAGER_LOG"
