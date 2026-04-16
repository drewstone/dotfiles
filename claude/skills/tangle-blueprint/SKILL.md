---
name: tangle-blueprint
description: "Full end-to-end Blueprint orchestration on the Tangle Network. Boots a local anvil with pre-seeded Tangle contracts, runs the real Blueprint Manager, spawns a real blueprint binary (native or container), and lets you submit real jobs — or deploys to real GPU clouds (Hetzner, RunPod, Lambda Labs, Crusoe, etc.) via blueprint-remote-providers. Use when the user says 'run a blueprint end-to-end', 'boot the blueprint manager', 'deploy a blueprint to a GPU cloud', 'test an operator', 'submit a real job to a blueprint', 'stand up a local Tangle chain', or any variant of running Tangle blueprints with real infrastructure. Works for any blueprint in ~/webb/*-blueprint/. No mocks. No stubs. Real chain, real binary, real jobs."
---

# Tangle Blueprint — Full E2E Orchestration

Drive a blueprint from zero to executing real jobs against a real chain — local anvil for fast iteration, or testnet/mainnet for the real thing. Can also deploy blueprints to real GPU clouds via the manager's remote-providers integration.

## Core principle: no mocks, real infrastructure

Every step of this skill hits real systems:
- Real anvil with real pre-seeded Tangle state (not a stub)
- Real Blueprint Manager binary (not a test harness)
- Real blueprint binary (native Rust or container pulled from a registry)
- Real on-chain job submissions (you'll see the tx hash + block number + gas used)
- Real GPU cloud provisioning (Hetzner/RunPod/Lambda/Crusoe API calls, real VMs, real SSH)

If a step can't be verified against a real system, this skill does not claim success. No "smoke test passed" without the actual result printed on chain.

## When to use

Trigger on any of:
- "run a blueprint end-to-end"
- "boot the blueprint manager"
- "test an operator for X blueprint"
- "deploy blueprint X to GPU cloud Y"
- "submit a real job to blueprint X"
- "stand up a local Tangle chain"
- "RFQ flow for blueprint X"
- "operator lifecycle for X"

## Prerequisites (one-time per machine)

1. **Foundry installed** — `anvil`, `cast`, `forge` on PATH (`~/.foundry/bin/`)
2. **blueprint-sdk cloned** at `~/webb/blueprint-sdk/`
3. **Blueprint Manager + cargo-tangle built:**
   ```bash
   cd ~/webb/blueprint-sdk
   cargo build -p blueprint-manager --features macos-dev
   cargo build --bin cargo-tangle
   ```
4. **Cloud credentials** (only for remote deployment) at `~/company/agent-secrets/cloud-operators.env`

## Scripts in this skill

All under `~/.claude/skills/tangle-blueprint/scripts/` (symlinked from dotfiles). Invoke with `bash <script>`.

### `boot-local-chain.sh`
Starts anvil with the pre-seeded Tangle state (block 245, seeded blueprint 0 / service 0 / operator 1). Writes PID to `/tmp/tangle-e2e/anvil.pid`.

```bash
bash ~/.claude/skills/tangle-blueprint/scripts/boot-local-chain.sh
# => anvil running on 127.0.0.1:8545, contracts deployed, operator1 pre-registered
```

### `setup-keystore.sh <path> <private-key-hex>`
Imports an ECDSA key into a keystore directory via `cargo-tangle key import`. Defaults to operator1 private key if only path is given.

```bash
bash ~/.claude/skills/tangle-blueprint/scripts/setup-keystore.sh /tmp/tangle-e2e/keystore
```

### `boot-manager.sh [options]`
Starts the Blueprint Manager against the local anvil. Handles port conflicts, data dir cleanup, native fallback via `BLUEPRINT_CARGO_BIN`. Writes PID to `/tmp/tangle-e2e/manager.pid`, tail-able log at `/tmp/tangle-e2e/manager.log`.

Environment / flags:
- `BLUEPRINT_CARGO_BIN` — binary name for native fallback (default: `incredible-squaring-blueprint-bin`)
- `BLUEPRINT_ID` / `SERVICE_ID` — defaults 0/0
- `AUTH_PROXY_PORT` — default 9276

```bash
BLUEPRINT_CARGO_BIN=llm-operator bash ~/.claude/skills/tangle-blueprint/scripts/boot-manager.sh
```

### `grant-permitted-caller.sh <caller-address>`
Calls `addPermittedCaller(serviceId=0, caller)` on the Tangle contract using the service owner's key. Required before the caller can submit jobs. Defaults to operator1 address.

```bash
bash ~/.claude/skills/tangle-blueprint/scripts/grant-permitted-caller.sh
```

### `submit-job.sh <job-index> <hex-payload>`
Submits a job to service 0 via `cargo-tangle blueprint jobs submit --watch` and prints the result. Uses the service-owner keystore by default.

```bash
# Submit job 0 with input 42 (0x2a padded to uint256)
bash ~/.claude/skills/tangle-blueprint/scripts/submit-job.sh 0 000000000000000000000000000000000000000000000000000000000000002a
# => Job result ready (32 bytes): 0x6e4  (= 1764 = 42^2)
```

### `cleanup.sh`
Kills anvil, manager, and any blueprint child processes. Removes `/tmp/tangle-e2e/`.

```bash
bash ~/.claude/skills/tangle-blueprint/scripts/cleanup.sh
```

### `deploy-remote.sh <provider> <blueprint-id>`
Triggers the Blueprint Manager's remote-providers integration. Reads credentials from `~/company/agent-secrets/cloud-operators.env` and provisions a real VM on the specified provider. Supports: `hetzner`, `runpod`, `lambda`, `prime-intellect`, `vast`, `crusoe`.

```bash
bash ~/.claude/skills/tangle-blueprint/scripts/deploy-remote.sh hetzner 1
```

### `register-blueprint.sh <metadata-json>`
Registers a new blueprint on the local chain (creates the on-chain metadata the manager reads). Needed to deploy any blueprint beyond the pre-seeded `blueprint_id=0`.

## Workflow: Incredible Squaring Demo (sanity check)

Use this to verify the whole stack is healthy before touching real blueprints.

```bash
bash ~/.claude/skills/tangle-blueprint/scripts/cleanup.sh
bash ~/.claude/skills/tangle-blueprint/scripts/boot-local-chain.sh
bash ~/.claude/skills/tangle-blueprint/scripts/setup-keystore.sh /tmp/tangle-e2e/keystore
bash ~/.claude/skills/tangle-blueprint/scripts/setup-keystore.sh /tmp/tangle-e2e/submitter-keystore ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
BLUEPRINT_CARGO_BIN=incredible-squaring-blueprint-bin bash ~/.claude/skills/tangle-blueprint/scripts/boot-manager.sh
bash ~/.claude/skills/tangle-blueprint/scripts/grant-permitted-caller.sh
bash ~/.claude/skills/tangle-blueprint/scripts/submit-job.sh 0 000000000000000000000000000000000000000000000000000000000000002a
# Expected: 0x00000000000000000000000000000000000000000000000000000000000006e4  (1764)
```

Total time: ~10s from clean (binaries already built).

## Workflow: Real Blueprint (e.g., LLM Inference)

1. **Ensure the blueprint operator binary is built:**
   ```bash
   cd ~/webb/llm-inference-blueprint && cargo build --release -p llm-inference
   ```
   OR ensure the container image exists locally (`docker images | grep llm-inference`).

2. **If the blueprint isn't blueprint_id=0 on the seeded chain, register it:**
   ```bash
   bash ~/.claude/skills/tangle-blueprint/scripts/register-blueprint.sh \
     '{"name":"llm-inference","source":{"type":"container","registry":"ghcr.io","image":"tangle-network/llm-inference","tag":"latest"},"gpu_requirements":{"count":1,"min_vram_mib":16384}}'
   ```

3. **Boot the manager with the real blueprint binary:**
   ```bash
   BLUEPRINT_CARGO_BIN=llm-operator \
     bash ~/.claude/skills/tangle-blueprint/scripts/boot-manager.sh
   ```

4. **Submit a real inference job:**
   ```bash
   # Payload encodes the inference request per the blueprint's job schema
   bash ~/.claude/skills/tangle-blueprint/scripts/submit-job.sh 0 "$(cast abi-encode 'f(string,string)' 'gpt-oss-20b' 'What is the capital of France?')"
   ```

## Workflow: Automatic Remote GPU Deployment

The Blueprint Manager handles GPU provisioning **automatically** when these conditions are met:

1. A blueprint is registered on-chain with `profilingData` containing GPU requirements
2. A `ServiceActivated` event fires for that blueprint
3. The manager has cloud credentials in its environment
4. The manager was built with `--features macos-dev` (or `remote-providers`)

### How the manager decides to provision a GPU

When the manager sees `ServiceActivated`, it calls `resolve_service()` which reads the blueprint's
`profilingData` field from on-chain. This is a JSON string stored in `BlueprintMetadata.profilingData`:

```json
{
  "execution_profile": {
    "confidentiality": "any",
    "gpu": {
      "policy": "required",
      "min_count": 1,
      "min_vram_gb": 8
    }
  }
}
```

If `gpu.policy == "required"`, the manager calls `RemoteProviderManager::on_service_initiated()` which:
1. Reads `CloudConfig::from_env()` to find configured providers
2. Builds a candidate list (RunPod → VastAi → Fluidstack → TensorDock → LambdaLabs → ... → hyperscalers)
3. Provisions the cheapest available via the adapter's `provision_instance()`
4. SSHs in and deploys the blueprint binary
5. Health-checks the deployed service
6. Manages TTL (default 1hr) and cleanup

### Step-by-step: GPU deployment from zero

```bash
# 1. Start devnet with InferenceBSM contracts deployed
cargo-tangle dev up
cd ~/webb/llm-inference-blueprint/contracts
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
TANGLE_CORE_ADDRESS=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast --slow --skip-simulation

# 2. Register the LLM blueprint with GPU requirements via cargo-tangle
cargo-tangle blueprint deploy tangle --network devnet \
  --definition /path/to/llm-blueprint-definition.json

# 3. Register as operator for the new blueprint
cargo-tangle blueprint register --blueprint-id 1

# 4. Request + approve a service (triggers ServiceActivated event)
cargo-tangle blueprint service request --blueprint-id 1
cargo-tangle blueprint service approve --service-id 1

# 5. Boot manager with cloud creds — it picks up ServiceActivated and auto-provisions
source ~/company/agent-secrets/cloud-operators.env
export LAMBDA_LABS_API_KEY="$LAMBDA_API_KEY"
export VAST_AI_API_KEY="$VAST_API_KEY"
# ... plus HETZNER_API_TOKEN, PRIME_INTELLECT_API_KEY, etc.
BLUEPRINT_CARGO_BIN=llm-operator \
  bash ~/.claude/skills/tangle-blueprint/scripts/boot-manager.sh

# Manager log will show:
#   notify_remote_service_initiated → provider selection → provision_instance → deploy → health check
```

### What the manager does NOT handle (you must do manually)

- **Deploying the BSM contract** — `forge script` with the correct constructor args
- **Creating the blueprint on-chain** — `cargo-tangle blueprint deploy tangle --definition ...`
- **Registering the operator** — `cargo-tangle blueprint register --blueprint-id N`
- **Creating + approving a service** — `cargo-tangle blueprint service request/approve`
- **Loading cloud credentials** — must be in the manager's environment at startup
- **Building the binary** — the manager will try to build via `BLUEPRINT_CARGO_BIN` fallback if on-chain source fails

### Critical: the profilingData JSON format

This is the string stored on-chain in `BlueprintMetadata.profilingData`. It must be valid JSON:

```json
{"execution_profile":{"confidentiality":"any","gpu":{"policy":"required","min_count":1,"min_vram_gb":8}}}
```

Without this, the manager treats the blueprint as CPU-only and never triggers remote provisioning.

### Cloud credential env vars (from ~/company/agent-secrets/cloud-operators.env)

| Provider | Env Var | Status | GPU? |
|---|---|---|---|
| Lambda Labs | `LAMBDA_LABS_API_KEY` (note: env file has `LAMBDA_API_KEY`, rename!) | Works, needs SSH key + billing address | GPU |
| Vast.ai | `VAST_AI_API_KEY` (note: env file has `VAST_API_KEY`, rename!) | Works, needs credit | GPU |
| Prime Intellect | `PRIME_INTELLECT_API_KEY` | Works, needs $1+ balance | GPU |
| Hetzner | `HETZNER_API_TOKEN` | Works, billable | CPU only |
| RunPod | `RUNPOD_API_KEY` | $0 balance (prepaid) | GPU |
| Crusoe | `CRUSOE_API_KEY` + `_SECRET` + `_PROJECT_ID` | 401 auth failure | GPU |

**Important:** The env var names in `cloud-operators.env` don't match what `CloudConfig::from_env()` expects.
Map them: `LAMBDA_API_KEY` → `LAMBDA_LABS_API_KEY`, `VAST_API_KEY` → `VAST_AI_API_KEY`.

### Billing status of providers (as of 2026-04-14)

- Lambda Labs: CC added, `gpu_1x_a10` ($1.29/hr) available in us-west-1. Needs billing address fix for API launch (works via dashboard).
- Vast.ai: CC added, 64+ GPUs verified under $0.30/hr. Cheapest: V100 $0.021/hr.
- Prime Intellect: $0 balance, A6000 $0.54/hr available via massedcompute. Needs $1+ deposited.
- RunPod: $0 balance (prepaid model). Needs funding.
- Hetzner: Works immediately, cax11 $0.0064/hr (ARM CPU).

## Known chain state (pre-seeded)

From `~/webb/blueprint-sdk/crates/chain-setup/anvil/snapshots/localtestnet-state.json`:

| Item | Value |
|---|---|
| Chain | Anvil localtestnet, chain_id 31337 |
| Block | 245 (after seeding) |
| Tangle core | `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9` |
| Restaking | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| Status Registry | `0x8f86403A4DE0bb5791fa46B8e795C547942fE4Cf` |
| Blueprint 0 | pre-registered |
| Service 0 | pre-activated, assigned to Operator 1 |
| Operator 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (priv `59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`) |
| Service Owner | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (priv `ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`) |

Well-known Anvil mnemonic: `test test test test test test test test test test test junk`

## Known blueprints at ~/webb/

| Repo | Binary | Backend | GPU req | Container |
|---|---|---|---|---|
| blueprint-sdk/examples/incredible-squaring | incredible-squaring-blueprint-bin | CPU (Rust native) | None | No (native only) |
| llm-inference-blueprint | llm-operator | vLLM / Together AI | 1 GPU, 16GB VRAM | Yes (CUDA 12.4) |
| voice-inference-blueprint | voice-operator | vLLM-Omni | 1 GPU | Yes |
| video-gen-inference-blueprint | video-gen-operator | ComfyUI / Modal / Replicate | Varies | Needs Dockerfile |
| avatar-inference-blueprint | avatar-operator | HeyGen / D-ID / Replicate | CPU ok | Needs Dockerfile |
| modal-inference-blueprint | modal-operator | Modal (Python) | Varies | Yes (Rust-only) |
| training-blueprint | training-operator | Local + libp2p | 1+ GPU | No |
| vector-store-blueprint | vector-store-operator | Qdrant / Chroma | CPU ok | No |
| embedding-inference-blueprint | embedding-operator | HF TEI | 1 GPU, 8GB | Needs Dockerfile |

## Gotchas

- **Port conflicts**: default Auth Proxy port (8276) + mTLS (8277) leak between runs. `boot-manager.sh` automatically kills stale processes and uses 9276 for Auth Proxy.
- **RocksDB lock**: `data/private/auth-proxy/db/LOCK` persists if the manager crashes. The `boot-manager.sh` script `rm -rf`s the data dir on each boot.
- **TOML schema is strict**: `BlueprintEnvironment` is `#[non_exhaustive]`, so all fields must be present. `configs/blueprint-env.toml.tmpl` has the full skeleton.
- **Container source first**: the seeded chain has `registry.tangle.local/blueprint:latest` as the preferred source. Without Docker, the manager falls back to the `BLUEPRINT_CARGO_BIN` env var for a native binary.
- **addPermittedCaller is required** before an address can submit jobs (even the operator themselves). `grant-permitted-caller.sh` handles this.
- **uint64 not uint256** for `addPermittedCaller(uint64 serviceId, address caller)`. Using the wrong signature in cast will fail with UnknownSelector.
- **Binary name ≠ crate name**: `incredible-squaring-blueprint-bin` is the package name; the actual binary is the same. `llm-operator` is the binary for the `llm-inference` package.
- **Hetzner is CPU-only.** For GPU blueprints use RunPod, Lambda Labs, or Crusoe.

## Verification standard

A blueprint run is NOT complete unless:

1. The manager log shows `Tangle client initialized at block N`
2. The manager log shows `Spawning native process` OR `Pulled image X` followed by container start
3. A job submission shows `tx_confirmed` with `success: true`
4. A job result comes back as `Job result ready (N bytes): 0x...`
5. The result is decoded and matches expected output

If any of these is missing, the run is incomplete — investigate, do not claim success.

## Do NOT

- Do NOT mock anvil, the manager, or the blueprint binary
- Do NOT hand-encode ABI payloads with `cast` when `cargo-tangle jobs submit` can do it
- Do NOT suppress `grant-permitted-caller.sh` failures — if it fails, job submission will fail silently
- Do NOT leave anvil/manager running between sessions (use `cleanup.sh`)
- Do NOT commit anything under `/tmp/tangle-e2e/` — that's ephemeral state
