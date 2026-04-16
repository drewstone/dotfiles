#!/usr/bin/env bash
# Import an ECDSA key into a keystore directory via cargo-tangle.
# Usage: setup-keystore.sh <path> [private-key-hex]
# Default key: operator1 private key.

set -euo pipefail
source "$(dirname "$0")/_common.sh"

ensure_cargo_tangle_built

KEYSTORE_PATH="${1:-}"
PRIVATE_KEY="${2:-$OPERATOR1_PRIVATE_KEY}"

if [ -z "$KEYSTORE_PATH" ]; then
  die "Usage: $0 <keystore-path> [private-key-hex]"
fi

mkdir -p "$KEYSTORE_PATH"

# Skip if already seeded (idempotent).
if [ -n "$(ls -A "$KEYSTORE_PATH" 2>/dev/null)" ]; then
  log_info "Keystore at $KEYSTORE_PATH already has contents, skipping import"
  exit 0
fi

log_info "Importing ECDSA key into $KEYSTORE_PATH..."
"$CARGO_TANGLE_BIN" key import \
  --key-type ecdsa \
  --secret "$PRIVATE_KEY" \
  --keystore-path "$KEYSTORE_PATH" \
  --protocol tangle

log_ok "Keystore ready at $KEYSTORE_PATH"
