#!/usr/bin/env bash
# Repository Node/package-manager selection and frozen dependency installation.
# Sourced by beelink-gate and bundled into its staged source; never run alone.
gate_shared_turbo_install=1

# The pnpm version the repo's own CI installs with: package.json packageManager
# (what corepack and pnpm/action-setup read), else the version pinned on
# pnpm/action-setup in a workflow. Only an exact x.y.z is used.
repo_pnpm_version() {
  local version
  version=$(node -e 'const m = /^pnpm@([^+]+)/.exec(require("./package.json").packageManager || ""); if (m) console.log(m[1])' 2>/dev/null)
  local -a workflows=()
  local had_nullglob=0
  shopt -q nullglob && had_nullglob=1
  shopt -s nullglob; workflows=(.github/workflows/*.yml .github/workflows/*.yaml)
  [ "$had_nullglob" = 1 ] || shopt -u nullglob
  if [ -z "$version" ] && [ "${#workflows[@]}" -gt 0 ]; then
    version=$(awk '/uses:[[:space:]]*pnpm\/action-setup/ { inside = 1; next }
      inside && /^[[:space:]]*-[[:space:]]/ { inside = 0 }
      inside && $1 == "version:" { gsub(/["\047]/, "", $2); print $2; exit }' "${workflows[@]}" 2>/dev/null)
  fi
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$ ]] && echo "$version"
}

# Corepack owns the repository's exact Yarn version/hash. The shim also keeps
# later `yarn` commands on that version without changing host-wide shims or
# letting Corepack add packageManager to an otherwise unchanged repository.
prepare_yarn_launcher() {
  local corepack_bin
  corepack_bin=$(command -v corepack) || die "corepack unavailable on beelink for Yarn"
  mkdir -p "$checkout/.git/beelink-gate-bin" || return $?
  printf '#!/usr/bin/env bash\nexport COREPACK_ENABLE_AUTO_PIN=0 COREPACK_ENABLE_PROJECT_SPEC=1 COREPACK_ENABLE_STRICT=1\nexec %q yarn "$@"\n' "$corepack_bin" > "$checkout/.git/beelink-gate-bin/yarn" || return $?
  chmod +x "$checkout/.git/beelink-gate-bin/yarn" || return $?
  export PATH="$checkout/.git/beelink-gate-bin:$PATH"
}

install_yarn_dependencies() {
  [ -f yarn.lock ] || die "Yarn packageManager requires yarn.lock for a frozen install"
  local yarn_version yarn_major classic=0 version_file="$checkout/.git/beelink-gate-bin/yarn-version"
  prepare_yarn_launcher || return $?
  # Corepack can download or prompt on its first invocation: keep this inside
  # the admitted step budget, with closed stdin, process reaping and timing.
  install_step timeout 120 yarn --version > "$version_file" || return $?
  yarn_version=$(cat "$version_file") || return $?
  [[ "$yarn_version" =~ ^([0-9]+)\.[0-9]+\.[0-9]+ ]] || die "cannot determine the repository's Yarn version"
  yarn_major=${BASH_REMATCH[1]}
  grep -q '^# yarn lockfile v1' yarn.lock && classic=1
  if (( yarn_major == 1 )); then
    (( classic )) || die "Yarn 1 cannot freeze a modern yarn.lock; declare packageManager in package.json"
    install_step yarn install --frozen-lockfile || return $?
  else
    (( ! classic )) || die "modern Yarn cannot freeze a Yarn 1 lock; declare the matching packageManager in package.json"
    install_step yarn install --immutable || return $?
  fi
  echo "beelink-gate: frozen Yarn $yarn_version install completed" >&2
}

# The Node the repo's scripts run under: gate_abi, gate_node ("v24.1.0 via pnpm")
# and gate_node_bin. pnpm may launch its own Node, so on 2026-10-21 a gate read
# plain node=v22.23.3, rebuilt nothing, and pnpm's Node 24 failed better-sqlite3
# (ABI 127 vs 137). Probe Yarn through its launcher too (including PnP); npm
# uses the PATH node.
resolve_gate_node() {
  local probe='process.versions.modules+" "+process.version+" "+process.execPath' out="" via=node
  if [ "${repo_manager:-}" != yarn ] && [ -d node_modules/.pnpm ] && [ "$install_mode" != no-install ] && [ "$install_mode" != light ]; then
    out=$(timeout 120 pnpm exec node -p "$probe" </dev/null 2>/dev/null) || out=""
    out=${out##*$'\n'}
    if [[ $out =~ ^[0-9]+\ v[0-9] ]]; then via=pnpm; else via="node (pnpm exec failed)" out=""; fi
  fi
  if [ -z "$out" ] && [ "${repo_manager:-}" = yarn ] && [ "$install_mode" != no-install ] && [ "$install_mode" != light ]; then
    out=$(timeout 120 yarn node -p "$probe" </dev/null 2>/dev/null) || out=""
    # Yarn Classic prints a banner and a trailing timing line around node.
    out=$(printf '%s\n' "$out" | sed -nE '/^[0-9]+ v[0-9]/p' | tail -n 1)
    if [[ $out =~ ^[0-9]+\ v[0-9] ]]; then via=yarn; else via="node (yarn node failed)" out=""; fi
  fi
  [ -n "$out" ] || out=$(node -p "$probe" </dev/null 2>/dev/null) || out=""
  read -r gate_abi gate_node gate_node_bin <<< "$out"
  [[ $gate_abi =~ ^[0-9]+$ ]] || gate_abi=""
  gate_node="${gate_node:-unknown} via $via"
}

prepare_gate_dependencies() {
  # Install and run with the repo's Node (.nvmrc), as its CI does, so the install
  # and the command load the same native addon ABI. pnpm keys a native package's
  # build on the Node that installs it: on 2026-10-11 agent-app#1036 installed under
  # the beelink's default Node 22, its `bash -lc` command ran under nvm's default 24,
  # and better-sqlite3 failed with "Module did not self-register". With an nvm Node
  # first on PATH, a login shell keeps it.
  if [ -s .nvmrc ]; then
    if [ -s "$HOME/.nvm/nvm.sh" ]; then
      # shellcheck disable=SC1091
      . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
      nvm use >/dev/null 2>&1 || nvm install >/dev/null 2>&1 || die "cannot select Node $(cat .nvmrc) with nvm on $beelink"
    else
      die ".nvmrc asks for Node $(cat .nvmrc) and $beelink has no nvm to select it"
    fi
  elif [[ "${command[0]##*/}" =~ ^(sh|dash|bash)$ && "${command[1]:-}" =~ ^-[A-Za-z]*l[A-Za-z]*$ && "${command[1]}" == *c* ]]; then
    # A login-shell command runs under the Node its profile selects (nvm's default, 24, on both Beelinks), while this
    # unit's PATH starts at /usr/local/bin/node (22). On 2026-10-21 agent-knowledge installed better-sqlite3 for ABI 127
    # and its `sh -lc` tests ran under 137, three rounds in a row. Install and probe with the login shell's Node.
    local login_node
    login_node=$(/usr/bin/bash -lc 'command -v node' </dev/null 2>/dev/null | tail -1)
    if [ -x "$login_node" ] && [ "$login_node" != "$(command -v node)" ]; then
      export PATH="${login_node%/*}:$PATH"
      echo "beelink-gate: using the login shell's node $("$login_node" -v 2>/dev/null) for the install and the command" >&2
    fi
  fi
  # Install and run with the repo's pnpm, not the beelink's: pnpm 11 enforces
  # minimumReleaseAge and pnpm 10 ignores it, so a gate on 10 passed an install
  # that CI on 11 refused. The shim covers the install, the command and ship.sh.
  local want_pnpm have_pnpm repo_manager
  # This private cache directory survives git clean; never reuse another
  # revision's package-manager shim, even when its manager has changed.
  rm -f "$checkout/.git/beelink-gate-bin/pnpm" "$checkout/.git/beelink-gate-bin/yarn" "$checkout/.git/beelink-gate-bin/yarn-version" || return $?
  repo_manager=$(node -e 'const p=require("./package.json"); console.log((p.packageManager||"").split("@")[0] || p.devEngines?.packageManager?.name || "")' 2>/dev/null) || repo_manager=""
  if [ -n "$repo_manager" ] && [ "$repo_manager" != yarn ] && [ -f yarn.lock ] && [ ! -f pnpm-lock.yaml ] && [ ! -f package-lock.json ] && [ ! -f npm-shrinkwrap.json ]; then
    die "packageManager declares $repo_manager but only yarn.lock exists; provide its matching lockfile or declare Yarn"
  fi
  if [ "$repo_manager" != yarn ] && [ -f pnpm-lock.yaml ] && want_pnpm=$(repo_pnpm_version); then
    have_pnpm=$(pnpm --version 2>/dev/null || true)
    if [ "$want_pnpm" != "$have_pnpm" ]; then
      mkdir -p "$checkout/.git/beelink-gate-bin" || exit $?
      printf '#!/usr/bin/env bash\nexec npx --yes "pnpm@%s" "$@"\n' "$want_pnpm" > "$checkout/.git/beelink-gate-bin/pnpm" || exit $?
      chmod +x "$checkout/.git/beelink-gate-bin/pnpm" || exit $?
      export PATH="$checkout/.git/beelink-gate-bin:$PATH"
      echo "beelink-gate: using the repo's pnpm $want_pnpm (beelink has ${have_pnpm:-none})" >&2
    fi
  fi
  if [ "$install_mode" = ship ]; then
    [ -f scripts/ship.sh ] || die "--ship: $owner/$repo at ${sha:0:12} has no scripts/ship.sh"
    # Size the test pool to the cores the host has spare: other gates and lanes
    # share it, and a real-browser test starved beside eight workers on a host
    # at load 50 timed out at 120 s.
    local cores load spare workers
    cores=$(nproc)
    load=${BEELINK_GATE_LOAD:-$(cut -d' ' -f1 /proc/loadavg)}
    spare=$(( cores - ${load%.*} ))
    workers=${ship_workers:-$spare}
    (( workers <= cores / 2 )) || workers=$(( cores / 2 ))
    # Two workers stretched a GTM verify to 15 min at load 23; four keeps most of
    # the relief now that the real-browser test has a budget sized to load.
    (( workers >= 4 )) || workers=4
    if [ "${starved:-0}" = 1 ]; then workers=$(( workers / 2 )); (( workers >= 2 )) || workers=2; fi
    # Ship's default pool must fit the same verified budget as other commands.
    if worker_capacity 1 >/dev/null; then
      (( workers <= gate_workers )) || workers=$gate_workers
    fi
    export SHIP_MAX_WORKERS=$workers
    if [ "$repo_manager" = yarn ]; then prepare_yarn_launcher || return $?; fi
    resolve_gate_node
    echo "beelink-gate: --ship runs scripts/ship.sh verify with node $gate_node and SHIP_MAX_WORKERS=$workers (load $load on $cores cores)" >&2
  elif [ "$install_mode" = no-install ] || [ "$install_mode" = light ]; then
    export BEELINK_GATE_INSTALL_S=0
    echo "beelink-gate: skipping dependency install for this check" >&2
  elif [ "$repo_manager" = yarn ] || { [ -f yarn.lock ] && [ ! -f pnpm-lock.yaml ] && [ ! -f package-lock.json ] && [ ! -f npm-shrinkwrap.json ]; }; then
    repo_manager=yarn
    install_yarn_dependencies || return $?
  elif [ -f pnpm-lock.yaml ]; then
    command -v pnpm >/dev/null || die "pnpm unavailable on beelink"
    install_step pnpm install --frozen-lockfile --store-dir "$HOME/.local/share/pnpm/store" || exit $?
  elif [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then
    command -v npm >/dev/null || die "npm unavailable on beelink"
    install_step npm ci --cache "$HOME/.npm" || exit $?
  elif [ -f package.json ]; then
    # A dependency-free package needs no install. A package with dependencies
    # and no lock cannot have a frozen install, so fail the gate.
    node -e 'const p=require("./package.json"); process.exit(Object.keys(p.dependencies||{}).length || Object.keys(p.devDependencies||{}).length || Object.keys(p.optionalDependencies||{}).length ? 1 : 0)' \
      || die "package.json has dependencies but no pnpm/npm/Yarn lockfile"
    echo "beelink-gate: dependency-free package; no frozen install needed" >&2
    export BEELINK_GATE_INSTALL_S=0
  fi
  [ "$install_mode" = ship ] || resolve_gate_node
  # Only normal frozen-install gates share archives across checkout slots.
  # Other modes retain their private cache; Turbo alone owns invalidation.
  local turbo_default="$checkout/.git/beelink-gate-turbo/${gate_node%% *}"
  if [ -n "${gate_turbo_root:-}" ] && [[ "${gate_node%% *}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([-.][A-Za-z0-9.]+)?$ ]]; then
    turbo_default=$(gate_turbo_node_cache "${gate_node%% *}") || return 75
  fi
  [ "$install_mode" = ship ] || export TURBO_CACHE_DIR="${TURBO_CACHE_DIR:-$turbo_default}"
  export BEELINK_GATE_TURBO_REQUESTED_DIR="${TURBO_CACHE_DIR:-}"
  export TURBO_RUN_SUMMARY="${TURBO_RUN_SUMMARY:-true}"
  if [ "$install_mode" != ship ] && [ "$repo_manager" != yarn ] && [ -d node_modules/.pnpm ]; then
    rebuild_native_addons || exit $?
  fi
}

# The reserve a receipt records is the 10 GiB headroom plus the most this gate's
# own bytes grew since just before its fetch (gate_bytes); host free space also
# moves with other lanes' writes and decides only the floor. A measurement that
# fails records the cold reserve, never less.
observe_install_reserve() {  # <when>
  (( install_reserve_bytes > 0 )) || return 0
  local now started grown observed
  started=$(date +%s%3N)
  if [ -n "$reserve_bytes_before" ] && now=$(disk_snapshot_phase=after_install measure_gate_bytes); then
    reserve_du_ms=$(( $(date +%s%3N) - started ))
    grown=$((now - reserve_bytes_before))
    (( grown > ${reserve_gate_bytes:-0} )) && reserve_gate_bytes=$grown
    : "${reserve_gate_bytes:=0}"
    observed=$((10 * 1024 * 1024 * 1024 + reserve_gate_bytes))
    [ "$reserve_basis" = cold_fallback ] || reserve_basis=measured
  else
    reserve_basis=cold_fallback
    echo "beelink-gate: could not measure this gate's own bytes $1; recording the cold reserve" >&2
    observed=$(last_install_reserve_bytes "$beelink" "$host/$owner/$repo" "$install_mode" "$reserve_spec" "$peer_reserve" "$peer_warm_reserve" cold) \
      || observed=$((10 * 1024 * 1024 * 1024))
  fi
  [ -z "$reserve_free_before" ] || reserve_host_drop=$((reserve_free_before - last_floor_available))
  (( observed > observed_install_reserve_bytes )) && observed_install_reserve_bytes=$observed
  echo "beelink-gate: install reserve $1: gate bytes +${reserve_gate_bytes:-?} (checkout and package stores, du ${reserve_du_ms:-?} ms); host free fell ${reserve_host_drop:-?} bytes over the same window; records $observed_install_reserve_bytes ($reserve_basis)" >&2
  return 0
}

# Disk lifecycle stays with install-reserve accounting; Python owns observations.
start_disk_observation() {
  disk_fallback_reserve=$(last_install_reserve_bytes "$beelink" "$host/$owner/$repo" "$install_mode" "${reserve_spec:-}" "${peer_reserve:-}" "${peer_warm_reserve:-}" cold) || disk_fallback_reserve=${install_reserve_bytes:-0}
  if mkdir -p "$STATE_DIR" 2>/dev/null && disk_dir=$(mktemp -d "$STATE_DIR/disk.XXXXXXXX" 2>/dev/null); then
    disk_paths=("$checkout" "${package_stores[@]}") disk_deadline=$deadline
    disk_grace_s=$(gate_disk grace) || disk_grace_s=0
    python3 -c "$beelink_gate_disk_source" observe "$disk_dir" "$$" "$((deadline - SECONDS))" "$HOME" "${disk_paths[@]}" {lock_fd}>&- {slot_fd}>&- </dev/null 2>/dev/null &
    disk_pid=$!
    # 5 s: the baseline now waits for up to three 1 s Docker identity queries.
    for ((disk_try=0; disk_try<100; disk_try++)); do
      [ ! -f "$disk_dir/ready" ] || { disk_ready=1; break; }
      kill -0 "$disk_pid" 2>/dev/null || break
      sleep 0.05
    done
    [ "$disk_ready" = 1 ] || : > "$disk_dir/late_start"
  fi
}

finish_disk_observation() {
  if [ -n "$disk_dir" ]; then
    # Relocated from post-checkout: same three bounded du scans, now with end bytes.
    if (( ${install_reserve_bytes:-0} > 0 )); then
      disk_left=$((disk_deadline - SECONDS)); (( disk_left < 60 )) || disk_left=60
      disk_snapshot_phase=end gate_bytes "$disk_left" "${disk_paths[@]}" >/dev/null || true
      if (( observed_install_reserve_bytes == 0 )); then
        observed_install_reserve_bytes=$disk_fallback_reserve reserve_basis=cold_fallback
      fi
    fi
    : > "$disk_dir/stop"  # Cooperative stop also works without pidfd support.
    gate_disk signal "$disk_dir" "$disk_pid" USR1 2>/dev/null || true
    disk_stop_by=$((SECONDS + disk_grace_s))
    while (( SECONDS < disk_stop_by )) && kill -0 "$disk_pid" 2>/dev/null; do sleep 0.1; done
    gate_disk signal "$disk_dir" "$disk_pid" KILL 2>/dev/null || true
    # Never block on a child whose safe escalation failed or has not completed.
    if ! kill -0 "$disk_pid" 2>/dev/null; then wait "$disk_pid" 2>/dev/null || true
    else
      : > "$disk_dir/ownership_lost"
      echo "beelink-gate: disk observer stop incomplete; retaining partial state" >&2
    fi
    BEELINK_GATE_DISK_OBSERVATION=$(gate_disk collect "$disk_dir" 2>/dev/null) || BEELINK_GATE_DISK_OBSERVATION=""
    export BEELINK_GATE_DISK_OBSERVATION
    kill -0 "$disk_pid" 2>/dev/null || rm -rf -- "$disk_dir"
  fi
}
