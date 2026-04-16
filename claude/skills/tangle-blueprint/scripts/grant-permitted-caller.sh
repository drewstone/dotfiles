#!/usr/bin/env bash
# Grant addPermittedCaller(serviceId, caller) on the Tangle contract so an address can submit jobs.
# Uses the service owner's private key.
# Usage: grant-permitted-caller.sh [caller-address] [service-id]

set -euo pipefail
source "$(dirname "$0")/_common.sh"

CALLER="${1:-$OPERATOR1_ADDRESS}"
SERVICE="${2:-$SERVICE_ID}"

if ! command -v cast >/dev/null 2>&1; then
  die "cast not found on PATH. Install Foundry."
fi

log_info "Granting addPermittedCaller(serviceId=$SERVICE, caller=$CALLER)..."

RESULT=$(cast send "$TANGLE_CONTRACT" \
  "addPermittedCaller(uint64,address)" \
  "$SERVICE" "$CALLER" \
  --private-key "0x$SERVICE_OWNER_PRIVATE_KEY" \
  --rpc-url "$RPC_URL" 2>&1)

if ! echo "$RESULT" | grep -q "status.*1 (success)"; then
  log_err "Transaction failed:"
  echo "$RESULT" >&2
  exit 1
fi

TX=$(echo "$RESULT" | grep -oE '0x[a-f0-9]{64}' | head -1)
log_ok "Permitted caller granted (tx $TX)"
