#!/usr/bin/env bash
# Trigger remote GPU deployment via the Blueprint Manager's remote-providers integration.
# Usage: deploy-remote.sh <provider> [blueprint-id]
#
# Providers: hetzner | runpod | lambda | prime-intellect | vast | crusoe | aws
#
# Loads credentials from ~/company/agent-secrets/cloud-operators.env, sets the right
# env vars, then triggers a service event by calling submit-job.sh (the manager will
# route to remote provisioning if GPU requirements are set on the blueprint).

set -euo pipefail
source "$(dirname "$0")/_common.sh"

PROVIDER="${1:-}"
BP_ID="${2:-$BLUEPRINT_ID}"

if [ -z "$PROVIDER" ]; then
  die "Usage: $0 <provider> [blueprint-id]
Supported: hetzner, runpod, lambda, prime-intellect, vast, crusoe, aws"
fi

CREDS_FILE="$HOME/company/agent-secrets/cloud-operators.env"
if [ ! -f "$CREDS_FILE" ]; then
  die "Cloud credentials not found at $CREDS_FILE"
fi

# shellcheck disable=SC1090
source "$CREDS_FILE"

case "$PROVIDER" in
  hetzner)
    [ -n "${HETZNER_API_TOKEN:-}" ] || die "HETZNER_API_TOKEN not set in $CREDS_FILE"
    export HETZNER_API_TOKEN
    export BLUEPRINT_PREFERRED_PROVIDER="Hetzner"
    log_info "Configured Hetzner (CPU-only, region: ${HETZNER_REGION:-fsn1})"
    ;;
  runpod)
    [ -n "${RUNPOD_API_KEY:-}" ] || die "RUNPOD_API_KEY not set in $CREDS_FILE"
    export RUNPOD_API_KEY
    export BLUEPRINT_PREFERRED_PROVIDER="RunPod"
    log_info "Configured RunPod (GPU, region: ${RUNPOD_REGION:-US})"
    ;;
  lambda)
    [ -n "${LAMBDA_API_KEY:-}" ] || die "LAMBDA_API_KEY not set in $CREDS_FILE"
    export LAMBDA_LABS_API_KEY="$LAMBDA_API_KEY"
    export BLUEPRINT_PREFERRED_PROVIDER="LambdaLabs"
    log_info "Configured Lambda Labs (GPU)"
    ;;
  prime-intellect)
    [ -n "${PRIME_INTELLECT_API_KEY:-}" ] || die "PRIME_INTELLECT_API_KEY not set"
    export PRIME_INTELLECT_API_KEY
    export BLUEPRINT_PREFERRED_PROVIDER="PrimeIntellect"
    log_info "Configured Prime Intellect (GPU)"
    ;;
  vast)
    [ -n "${VAST_API_KEY:-}" ] || die "VAST_API_KEY not set"
    export VAST_AI_API_KEY="$VAST_API_KEY"
    export BLUEPRINT_PREFERRED_PROVIDER="VastAi"
    log_info "Configured Vast.ai (GPU)"
    ;;
  crusoe)
    [ -n "${CRUSOE_ACCESS_KEY_ID:-}" ] || die "CRUSOE_ACCESS_KEY_ID not set"
    [ -n "${CRUSOE_SECRET_KEY:-}" ] || die "CRUSOE_SECRET_KEY not set"
    export CRUSOE_ACCESS_KEY_ID CRUSOE_SECRET_KEY
    export BLUEPRINT_PREFERRED_PROVIDER="Crusoe"
    log_info "Configured Crusoe (GPU)"
    ;;
  aws)
    [ -n "${AWS_ACCESS_KEY_ID:-}" ] || die "AWS_ACCESS_KEY_ID not set"
    export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
    export BLUEPRINT_PREFERRED_PROVIDER="AWS"
    log_info "Configured AWS (GPU, TEE-capable)"
    ;;
  *)
    die "Unknown provider: $PROVIDER"
    ;;
esac

# These turn on remote deployment in the manager.
export BLUEPRINT_REMOTE_DEPLOYMENT_ENABLED=true
export BLUEPRINT_AUTO_SELECT_CHEAPEST="${BLUEPRINT_AUTO_SELECT_CHEAPEST:-false}"

log_info "Boot the manager with these env vars to enable remote provisioning."
log_info "The next ServiceInitiated event will route through $BLUEPRINT_PREFERRED_PROVIDER."
echo
echo "Next steps:"
echo "  bash $(dirname "$0")/boot-manager.sh   # uses these exported vars"
echo "  bash $(dirname "$0")/submit-job.sh 0 <payload>   # triggers remote provisioning"
echo
log_warn "Remote provisioning will create a REAL VM and bill your account. SKIP_CLEANUP=1 to inspect."
