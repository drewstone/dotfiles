#!/usr/bin/env bash
# harden inventory: map the project's existing test/eval/bench/observability infra.
#
# Phase 0 of /harden. You extend what already exists — never fork. This
# script surfaces what's there so you know what to plug into.

set -euo pipefail

echo "# Project Infrastructure Inventory"
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo

# ─── Test infra ───────────────────────────────────────────────────────────
echo "## Test infra"
echo

runners=()
for f in vitest.config.ts vitest.config.js vitest.config.mts jest.config.js jest.config.ts playwright.config.ts karma.conf.js pytest.ini pyproject.toml Cargo.toml; do
  matches=$(find . -maxdepth 4 -name "$f" -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | head -5)
  if [ -n "$matches" ]; then
    runners+=("$f")
    echo "- \`$f\`:"
    echo "$matches" | sed 's/^/  - /'
  fi
done
[ ${#runners[@]} -eq 0 ] && echo "- (no standard test runner config found — check package.json scripts)"
echo

echo "### Test directories"
find . -maxdepth 4 -type d \( -name 'tests' -o -name '__tests__' -o -name 'test' -o -name 'e2e' -o -name 'integration' \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" 2>/dev/null | sort -u | head -20 | sed 's/^/- /'
echo

# ─── Eval infra ────────────────────────────────────────────────────────────
echo "## Eval infra"
echo

if [ -d .evolve ]; then
  echo "- \`.evolve/\` present"
  [ -f .evolve/current.json ] && echo "  - current.json: $(cat .evolve/current.json | head -c 200)..."
  [ -d .evolve/pursuits ] && echo "  - pursuits: $(ls .evolve/pursuits 2>/dev/null | wc -l | tr -d ' ') files"
  [ -f .evolve/experiments.jsonl ] && echo "  - experiments.jsonl: $(wc -l < .evolve/experiments.jsonl | tr -d ' ') records"
fi

evals_dirs=$(find . -maxdepth 5 -type d -name 'evals' -not -path "*/node_modules/*" 2>/dev/null | head -5)
if [ -n "$evals_dirs" ]; then
  echo "- Eval suite directories:"
  echo "$evals_dirs" | sed 's/^/  - /'
  for d in $evals_dirs; do
    if [ -f "$d/suite.ts" ] || [ -f "$d/suite.js" ]; then
      echo "  - $d/suite.{ts,js} — treat as canonical suite index"
    fi
    scenarios=$(find "$d" -maxdepth 3 -name '*scenario*' -o -name 'scenarios' -type d 2>/dev/null | head -3)
    [ -n "$scenarios" ] && echo "$scenarios" | sed 's/^/    - scenarios: /'
  done
fi
[ -z "$evals_dirs" ] && [ ! -d .evolve ] && echo "- (no eval infra detected — flag for /pursue if this is a project that should have one)"
echo

# ─── Benchmark infra ──────────────────────────────────────────────────────
echo "## Benchmark infra"
echo

bench_files=$(find . -maxdepth 4 -type f \( -name '*.bench.ts' -o -name '*.bench.js' -o -name 'benchmark.*' -o -name 'bench.*' \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" 2>/dev/null | head -10)
if [ -n "$bench_files" ]; then
  echo "- Benchmark files:"
  echo "$bench_files" | sed 's/^/  - /'
else
  echo "- (no .bench files detected)"
fi

bench_scripts=$(find . -maxdepth 2 -name 'package.json' -not -path "*/node_modules/*" -exec grep -l '"bench' {} \; 2>/dev/null | head -5)
if [ -n "$bench_scripts" ]; then
  echo "- package.json scripts with 'bench':"
  for f in $bench_scripts; do
    scripts=$(grep -E '"[^"]*bench[^"]*":' "$f" 2>/dev/null | head -3 | sed 's/^/    /')
    [ -n "$scripts" ] && echo "  - $f:" && echo "$scripts"
  done
fi
echo

# ─── Observability ─────────────────────────────────────────────────────────
echo "## Observability"
echo

obs_patterns=(
  "OpenTelemetry:@opentelemetry"
  "Sentry:@sentry"
  "Langfuse:langfuse"
  "Datadog:dd-trace\\|datadog"
  "Prometheus:prom-client"
  "OpenLLMetry:@traceloop"
)
for pattern in "${obs_patterns[@]}"; do
  name="${pattern%%:*}"
  re="${pattern#*:}"
  hits=$(grep -rE "\"$re" --include='package.json' --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null | head -3)
  [ -n "$hits" ] && echo "- $name: detected" && echo "$hits" | sed 's/^/  /'
done
echo

# ─── CI ────────────────────────────────────────────────────────────────────
echo "## CI workflows"
echo

if [ -d .github/workflows ]; then
  for wf in .github/workflows/*.yml .github/workflows/*.yaml; do
    [ -f "$wf" ] || continue
    name=$(grep -m1 '^name:' "$wf" 2>/dev/null | sed 's/name: *//')
    echo "- \`$(basename "$wf")\` — $name"
  done | head -20
fi
echo

# ─── Languages ─────────────────────────────────────────────────────────────
echo "## Languages / runtimes"
echo
[ -f package.json ] && echo "- Node/TypeScript (package.json)"
[ -f Cargo.toml ] && echo "- Rust (Cargo.toml)"
[ -f pyproject.toml ] && echo "- Python (pyproject.toml)"
[ -f go.mod ] && echo "- Go (go.mod)"
[ -f build.gradle ] || [ -f pom.xml ] && echo "- JVM (gradle/maven)"
echo

# ─── Summary ───────────────────────────────────────────────────────────────
echo "## Next"
echo "1. Read each canonical entry point above to understand the extension point."
echo "2. Derive adversarial targets (Phase 1 of /harden)."
echo "3. Add findings to the harnesses identified here — never fork parallel ones."
