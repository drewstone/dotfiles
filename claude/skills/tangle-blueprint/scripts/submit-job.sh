#!/usr/bin/env bash
# Submit a job to the running blueprint service and watch for the result.
# Usage: submit-job.sh <job-index> <hex-payload> [service-id]
# Example: submit-job.sh 0 000000000000000000000000000000000000000000000000000000000000002a
#
# The submitter keystore at $TANGLE_E2E_DIR/submitter-keystore is used. If it doesn't exist,
# it's auto-created with the service owner's key.

set -euo pipefail
source "$(dirname "$0")/_common.sh"

ensure_cargo_tangle_built

JOB_INDEX="${1:-}"
PAYLOAD_HEX="${2:-}"
SERVICE="${3:-$SERVICE_ID}"

if [ -z "$JOB_INDEX" ] || [ -z "$PAYLOAD_HEX" ]; then
  die "Usage: $0 <job-index> <hex-payload> [service-id]"
fi

SUBMITTER_KEYSTORE="$TANGLE_E2E_DIR/submitter-keystore"
if [ ! -d "$SUBMITTER_KEYSTORE" ] || [ -z "$(ls -A "$SUBMITTER_KEYSTORE" 2>/dev/null)" ]; then
  log_info "Creating submitter keystore (service owner key)..."
  bash "$(dirname "$0")/setup-keystore.sh" "$SUBMITTER_KEYSTORE" "$SERVICE_OWNER_PRIVATE_KEY"
fi

log_info "Submitting job (service=$SERVICE, job=$JOB_INDEX)..."

RESULT=$("$CARGO_TANGLE_BIN" blueprint jobs submit \
  --http-rpc-url "$RPC_URL" \
  --ws-rpc-url "$WS_URL" \
  --keystore-path "$SUBMITTER_KEYSTORE" \
  --tangle-contract "$TANGLE_CONTRACT" \
  --restaking-contract "$RESTAKING_CONTRACT" \
  --status-registry-contract "$STATUS_REGISTRY_CONTRACT" \
  --blueprint-id "$BLUEPRINT_ID" \
  --service-id "$SERVICE" \
  --job "$JOB_INDEX" \
  --payload-hex "$PAYLOAD_HEX" \
  --watch \
  --timeout-secs 60 \
  --json 2>&1)

echo "$RESULT"

# Extract and verify the result.
if ! echo "$RESULT" | grep -q "Job result ready"; then
  log_err "Job did not produce a result within timeout"
  exit 1
fi

RESULT_LINE=$(echo "$RESULT" | grep "Job result ready")
log_ok "$RESULT_LINE"
