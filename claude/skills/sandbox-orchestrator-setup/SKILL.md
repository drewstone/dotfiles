---
name: sandbox-orchestrator-setup
description: "Register a product with the Tangle sandbox orchestrator and configure a Cloudflare Worker to provision containers. Use when connecting a new product to the orchestrator, creating product API keys, setting up staging/production orchestrator secrets, or debugging provisioning failures."
metadata:
  author: drew
  version: "1.0.0"
---

# Sandbox Orchestrator Product Setup

## What This Does

Registers a new product with the Tangle sandbox orchestrator so it can provision isolated containers for users. Each product gets an API key, signing secret, and product ID.

## Architecture

```
Product (CF Worker) → Orchestrator (Hetzner) → Host Agent → Docker Container
                                                                ↓
                                                         Sidecar + Agent
```

## Infrastructure

### Staging
| Host | IP | Role |
|------|-----|------|
| `staging-orchestrator-01` | `138.201.133.55` | Orchestrator (Germany) |
| `staging-host-agent-01` | `138.201.222.180` | Docker host (Germany) |

Orchestrator HTTPS: port 443 (maps to internal 4095). Admin portal: port 4096 (localhost only).

### Production
| Host | IP | Role |
|------|-----|------|
| `production-orchestrator-01` | `95.216.8.253` | Orchestrator (Finland) |
| `production-host-agent-01` | `95.217.35.250` | Docker host (Finland) |

### SSH Access
```bash
ssh root@138.201.133.55   # staging orchestrator
ssh root@138.201.222.180  # staging docker host
ssh root@95.216.8.253     # prod orchestrator
ssh root@95.217.35.250    # prod docker host
```

SSH keys are in `~/devops/tangle/ssh-keys/` (gitignored).

## Step 1: Create the Product

Products are registered via `SEED_PRODUCTS` in the orchestrator `.env`:

```bash
# SSH into orchestrator
ssh root@138.201.133.55

# Generate a signing secret
SIGNING_SECRET=$(openssl rand -hex 32)

# Add product to SEED_PRODUCTS
cd /opt/orchestrator
# Edit .env — set SEED_PRODUCTS to include your product:
SEED_PRODUCTS='[{"product_id":"YOUR_PRODUCT_ID","name":"Your Product Name","signing_secret":"GENERATED_SECRET"}]'

# If SEED_PRODUCTS already has products, append to the JSON array

# Clear Redis products and restart to force re-seeding
docker exec orchestrator-redis-1 redis-cli del 'orchestrator:products'
docker compose restart orchestrator

# Wait for startup, then verify
sleep 5
docker logs orchestrator --tail 10 | grep -i product
```

## Step 2: Get the API Key

After seeding, the orchestrator generates the API key. Retrieve it from Redis:

```bash
ssh root@138.201.133.55 "docker exec orchestrator-redis-1 redis-cli hget 'orchestrator:products' 'YOUR_PRODUCT_ID'" | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
print('API Key:', d['api_key'])
print('Signing Secret:', d['secrets']['current']['secret'])
print('Product ID:', d['product_id'])
"
```

The API key has prefix `orch_prod_`. The signing secret is used for JWT token signing for WebSocket auth.

## Step 3: Test Project Creation

```bash
API_KEY="orch_prod_YOUR_KEY_HERE"

# From orchestrator host (HTTPS required)
ssh root@138.201.133.55 "curl -sk https://127.0.0.1:443/projects -X POST \
  -H 'Authorization: Bearer $API_KEY' \
  -H 'Content-Type: application/json' \
  -H 'x-user-id: test-user' \
  -d '{\"projectRef\":\"test-001\",\"container\":{\"image\":\"stylus\"},\"backend\":{\"type\":\"opencode\",\"model\":\"claude-sonnet-4-6\"}}'"
```

A successful response includes `"success": true` and container/networking details.

**Clean up test projects:**
```bash
ssh root@138.201.133.55 "curl -sk -X DELETE 'https://127.0.0.1:443/projects/test-001' \
  -H 'Authorization: Bearer $API_KEY'"
```

## Step 4: Configure the CF Worker

Set these secrets on the Cloudflare Worker:

```bash
cd packages/api-worker

# Orchestrator URL (use IP:443 for staging, or domain for prod)
# If it's a wrangler.toml [vars], edit the file instead
echo "https://138.201.133.55:443" | pnpm wrangler secret put TANGLE_ORCHESTRATOR_URL

# Product API key
echo "orch_prod_YOUR_KEY" | pnpm wrangler secret put TANGLE_API_KEY

# Product ID
echo "your-product-id" | pnpm wrangler secret put ORCHESTRATOR_PRODUCT_ID

# Signing secret (for JWT tokens)
echo "your-signing-secret" | pnpm wrangler secret put ORCHESTRATOR_SIGNING_SECRET
```

## Step 5: Update Orchestrator Client Code

The Worker's `OrchestratorClient` needs to match the orchestrator's API:

```typescript
// In services/orchestrator.ts
const project = await this.orchestrator.createProject({
  image: "stylus",  // Must exist on docker host
  env: { YOUR_ENV_VARS: "value" },
  backend: {
    type: "opencode",  // Staging only supports "opencode"
    apiKey: userApiKey,  // LiteLLM key or direct provider key
    baseUrl: litellmUrl, // LiteLLM proxy URL (optional)
    model: "claude-sonnet-4-6",
  },
});
```

## Backend Types

The orchestrator supports multiple agent backends (from `develop` branch, `apps/orchestrator/src/routes/projects.ts:215`):

```typescript
type: z.enum(["opencode", "claude-code", "codex", "amp", "factory-droids"])
```

| Type | Description | When to Use |
|------|-------------|-------------|
| `opencode` | OpenCode SDK agent. Default, works with any model via apiKey + baseUrl. | General-purpose. Works on all orchestrator builds. |
| `claude-code` | Claude Code CLI agent with OAuth or API key auth. | When you need Claude Code's specific tools/capabilities. |
| `codex` | OpenAI Codex CLI agent. | For OpenAI-native coding agents. |
| `amp` | Amp agent backend. | For Amp-based agents. |
| `factory-droids` | Factory Droids backend. | For Factory Droids agents. |

Each backend supports these config fields:
```typescript
backend: {
  type: "opencode" | "claude-code" | "codex" | "amp" | "factory-droids",
  profile: string | Record<string, unknown>,  // Named or inline profile
  provider: string,       // e.g. "anthropic", "openai"
  model: string,          // e.g. "claude-sonnet-4-6"
  apiKey: string,         // Provider or LiteLLM proxy key
  baseUrl: string,        // Custom API endpoint (LiteLLM proxy URL)
  mode: "api" | "cli",    // API mode or CLI mode
  authMode: "api-key" | "oauth",  // Auth strategy
  authFiles: [{ path, content, mode }],  // OAuth credential files
}
```

**Note**: The staging orchestrator may be running an older build that only supports `"opencode"`. Check by trying your desired backend type — if you get `"Invalid input: expected \"opencode\""`, the staging build needs to be updated from the `develop` branch.

**To update staging**: Build and deploy from `~/code/agent-dev-container` `develop` branch.

## Available Container Images

Check images on the docker host:
```bash
ssh root@138.201.222.180 "docker images --format '{{.Repository}}:{{.Tag}}' | grep ghcr | head -20"
```

Common images: `stylus`, `near`, `polygon`, `arbitrum`, etc. These are blockchain dev containers. For custom images, build and push to the docker host.

## Common Failures

### "Provision failed (530): unknown"
**Cause**: Orchestrator unreachable. Check DNS/IP, port 443, and firewall.
**Fix**: Verify with `curl -sk https://IP:443/health`

### "Invalid product API key"
**Cause**: Product not registered or orchestrator cache stale.
**Fix**: Clear Redis and restart: `redis-cli del orchestrator:products && docker compose restart orchestrator`

### "BASE_IMAGE_NOT_FOUND"
**Cause**: Container image doesn't exist on docker host.
**Fix**: Check available images: `docker images | grep ghcr`

### "Invalid input: expected \"opencode\""
**Cause**: Backend type not supported by this orchestrator build.
**Fix**: Use `"opencode"` as the backend type.

### "Empty reply from server" on localhost:4095
**Cause**: Orchestrator requires HTTPS even on localhost.
**Fix**: Use port 443 with `-k` flag: `curl -sk https://127.0.0.1:443/health`

### Cloudflared tunnel routing to 404
**Cause**: Tunnel config in Cloudflare dashboard may route to wrong port/service.
**Fix**: Check Cloudflare Zero Trust dashboard → Tunnels → verify ingress rules point to `https://localhost:4095`

## Security Notes

- Product API keys (`orch_prod_*`) should be stored as CF Worker secrets, never in code
- Signing secrets are used for HMAC-SHA256 JWT signing — rotate periodically
- The orchestrator admin key is separate from product keys — never expose it
- Containers run with `noNewPrivileges: true` and dropped capabilities
- Each product is isolated — one product's API key cannot access another product's containers
