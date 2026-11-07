#!/usr/bin/env bash
set -euo pipefail
script="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/git/main-checkout-ff/main-checkout-ff"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/bin" "$fixture/roots"
printf '%s\n' '#!/usr/bin/env bash' 'printf "mkdir\n" >> "$MAIN_CHECKOUT_ARGV_TRACE"' > "$fixture/bin/mkdir"
chmod +x "$fixture/bin/mkdir"
check() {
  local expected=$1 setup=$2 status=0
  shift 2
  : > "$fixture/trace"
  MAIN_CHECKOUT_ROOTS="$fixture/roots" MAIN_CHECKOUT_ARGV_TRACE="$fixture/trace" PATH="$fixture/bin:$PATH" \
    bash "$script" "$@" > "$fixture/out" 2> "$fixture/err" || status=$?
  [[ $status == "$expected" ]] || { echo "argv status $status, expected $expected" >&2; exit 1; }
  [[ $(wc -l < "$fixture/trace") == "$setup" ]] || { echo 'argv entered maintenance setup' >&2; exit 1; }
  if [[ $setup == 0 ]]; then
    cat "$fixture/out" "$fixture/err" | grep -q 'Usage: main-checkout-ff'
  fi
}
check 0 0 --help
check 0 0 -h
check 2 0 --unknown
check 2 0 --key=ARGUMENT_SENTINEL
! grep -q ARGUMENT_SENTINEL "$fixture/out" "$fixture/err"
check 2 0 --dry-run --unknown
check 2 0 --help extra
check 2 0 --dry-run --dry-run
check 2 0 --
check 0 1
check 0 1 --dry-run
printf 'PASS: help/invalid argv cannot enter maintenance; normal and dry-run enter it\n'
