# shellcheck shell=bash
# Shared helpers for host/provision.sh. Sourced, not executed.
#
# Every step tests the box first. A step that already holds reports "ok". In
# check mode a failed test reports "drift" and nothing changes. In apply mode
# the step runs its fix, tests again, and reports "changed" (or "FAILED" when
# the second test still fails). So a second apply run reports no "changed".

PROVISION_MODE="${PROVISION_MODE:-apply}"
N_OK=0
N_CHANGED=0
N_DRIFT=0
N_FAILED=0
MANUAL_STEPS=()
MANUAL_AFTER_SIGNIN=()
APT_UPDATED=0

section() { printf '\n== %s\n' "$*"; }
ok() { N_OK=$((N_OK + 1)); printf '  ok       %s\n' "$*"; }
changed() { N_CHANGED=$((N_CHANGED + 1)); printf '  changed  %s\n' "$*"; }
drift() { N_DRIFT=$((N_DRIFT + 1)); printf '  drift    %s\n' "$*"; }
skip() { printf '  skip     %s\n' "$*"; }
failed() { N_FAILED=$((N_FAILED + 1)); printf '  FAILED   %s\n' "$*"; }
info() { printf '           %s\n' "$*"; }

# manual WHAT COMMAND...: a step that only a person may do. It prints now and
# again in the closing list. Each COMMAND argument is one line to run.
manual() {
  local what="$1" line entry
  shift
  entry="$what"
  printf '  manual   %s\n' "$what"
  for line in "$@"; do
    printf '             %s\n' "$line"
    entry+=$'\n'"    $line"
  done
  MANUAL_STEPS+=("$entry")
}

# manual_after_signin WHAT COMMAND...: a step that waits on the sign-ins. The
# closing list puts it after every other step.
manual_after_signin() {
  local -a before=("${MANUAL_STEPS[@]}")
  manual "$@"
  MANUAL_AFTER_SIGNIN+=("${MANUAL_STEPS[${#MANUAL_STEPS[@]} - 1]}")
  MANUAL_STEPS=("${before[@]}")
}

checking() { [ "$PROVISION_MODE" = check ]; }

# quiet CMD...: run CMD and show its output only when it fails.
quiet() {
  local out rc=0
  out="$("$@" 2>&1)" || rc=$?
  [ "$rc" = 0 ] || printf '%s\n' "$out" | tail -20 | sed 's/^/    | /'
  return "$rc"
}

# indent CMD...: run a sub-installer with its output indented under the step.
indent() {
  "$@" 2>&1 | sed 's/^/    | /'
  return "${PIPESTATUS[0]}"
}

# ensure WHAT TEST... -- FIX...
# TEST and FIX are commands (usually functions) with their arguments. It
# always returns 0; a failure is counted and the run goes on.
ensure() {
  local what="$1"
  shift
  local -a test_cmd=() fix_cmd=()
  while [ $# -gt 0 ] && [ "$1" != -- ]; do
    test_cmd+=("$1")
    shift
  done
  [ "${1:-}" = -- ] && shift
  fix_cmd=("$@")
  if "${test_cmd[@]}"; then
    ok "$what"
  elif checking; then
    drift "$what"
  elif [ ${#fix_cmd[@]} -gt 0 ] && "${fix_cmd[@]}" && "${test_cmd[@]}"; then
    changed "$what"
  else
    failed "$what"
  fi
  return 0
}

# grep -q in a pipeline: grep exits at the first match, the writer can then die
# of SIGPIPE, and pipefail turns a match into a failure. So a pipeline ends in
# grep >/dev/null, which reads all of its input.

# ── root ────────────────────────────────────────────────────────────────────

# as_root CMD...: run as root. Check mode uses sudo -n, so it never prompts;
# a read that needs a password then fails and reports drift.
as_root() {
  if [ "$(id -u)" = 0 ]; then
    "$@"
  elif checking; then
    sudo -n "$@"
  else
    sudo "$@"
  fi
}

# root_file_is MODE SRC DST: DST is a root-owned copy of SRC with MODE.
root_file_is() {
  as_root cmp -s "$2" "$3" 2>/dev/null &&
    [ "$(as_root stat -c '%a %U' "$3" 2>/dev/null)" = "${1#0} root" ]
}

root_install() {
  as_root install -D -m "$1" -o root -g root "$2" "$3"
}

# want_root_file MODE SRC DST [WHAT]
want_root_file() {
  ensure "${4:-$3}" root_file_is "$1" "$2" "$3" -- root_install "$1" "$2" "$3"
}

pkg_installed() {
  local p
  for p in "$@"; do
    dpkg-query -W -f='${Status}' "$p" 2>/dev/null | grep 'ok installed' >/dev/null || return 1
  done
}

# apt_get ARGS...: apt-get that waits for the dpkg lock (a fresh install runs
# unattended-upgrades at first boot) and never lets needrestart restart a
# service, because a live box runs agents under those services.
apt_get() {
  quiet as_root env DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1 \
    apt-get -q -o DPkg::Lock::Timeout=900 "$@"
}

# A mirror in the middle of a sync fails an index download ("File has
# unexpected size ... Mirror sync in progress?"), so the update is retried.
apt_update_once() {
  local i
  [ "$APT_UPDATED" = 1 ] && return 0
  for i in 1 2 3; do
    if apt_get update; then
      APT_UPDATED=1
      return 0
    fi
    [ "$i" = 3 ] || sleep 20
  done
  return 1
}

# apt_source_added: the next install refreshes the package lists first.
apt_source_added() { APT_UPDATED=0; }

apt_install() {
  local -a missing=()
  local p
  for p in "$@"; do pkg_installed "$p" || missing+=("$p"); done
  [ ${#missing[@]} -eq 0 ] && return 0
  apt_update_once || return 1
  apt_get install -y "${missing[@]}"
}

# want_pkgs PKG...: one line per package, one apt transaction for the misses.
want_pkgs() {
  local p
  local -a missing=()
  for p in "$@"; do
    if pkg_installed "$p"; then ok "package $p"; else missing+=("$p"); fi
  done
  [ ${#missing[@]} -eq 0 ] && return 0
  ensure "packages ${missing[*]}" pkg_installed "${missing[@]}" -- apt_install "${missing[@]}"
}

unit_masked() {
  local u
  for u in "$@"; do [ "$(systemctl is-enabled "$u" 2>/dev/null)" = masked ] || return 1; done
}

# ── user ────────────────────────────────────────────────────────────────────

# link_is SRC DST: DST is a symlink to SRC.
link_is() { [ -L "$2" ] && [ "$(readlink "$2")" = "$1" ]; }

# link_into SRC DST: link DST to SRC. A regular file already at DST moves to
# DST.pre-dotfiles.<time> first, so nothing a person wrote is lost.
link_into() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")" || return 1
  if [ -e "$dst" ] && [ ! -L "$dst" ]; then
    mv "$dst" "$dst.pre-dotfiles.$(date +%Y%m%d%H%M%S)" || return 1
    info "moved the old $dst aside"
  fi
  ln -sfn "$src" "$dst"
}

# want_link SRC DST
want_link() {
  ensure "$2 -> $1" link_is "$1" "$2" -- link_into "$1" "$2"
}

# user_bus: gsettings and systemctl --user need the session bus. Over ssh or
# sudo -i the variables can be missing while the user manager runs (linger).
user_bus() {
  local run
  run="/run/user/$(id -u)"
  [ -n "${XDG_RUNTIME_DIR:-}" ] || { [ -d "$run" ] && export XDG_RUNTIME_DIR="$run"; }
  [ -n "${DBUS_SESSION_BUS_ADDRESS:-}" ] || { [ -S "$run/bus" ] && export DBUS_SESSION_BUS_ADDRESS="unix:path=$run/bus"; }
  [ -n "${DBUS_SESSION_BUS_ADDRESS:-}" ]
}

# fetch URL DEST: download over HTTPS with retries.
fetch() {
  curl -fsSL --proto '=https' --retry 3 --retry-delay 2 -o "$2" "$1"
}

# sha256_ok FILE SUM
sha256_ok() {
  [ "$(sha256sum "$1" | awk '{print $1}')" = "$2" ]
}
