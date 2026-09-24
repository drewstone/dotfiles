#!/usr/bin/env bash
# Provision a Beelink (Ubuntu 24.04, x86_64) as an agent box like drew-gtr-pro.
# Every step tests the box first, so a second run changes nothing.
#
# Usage: host/provision.sh [--check] [options] [MODULE...]
#
# Modules, in the order a full run takes them:
#   guards        root wrappers, sudoers, frozen-root watchdog (host/install.sh)
#   tools         base packages, OpenSSH (keys only, off the LAN), Google Chrome, Tailscale, GitHub CLI, uv
#   desktop       GDM kiosk, shared :1 VNC, cage, Remmina, NetworkManager, font
#   wifi          Wi-Fi power save off, system-wide passphrase, reconnect watchdog
#   nosleep       masked sleep targets, logind, login screen, GNOME session
#   shell         starship prompt; the Linux console keeps the plain prompt
#   git           global Git hooks (git/install.sh)
#   tmux          ~/.tmux.conf, plugins, tmux-heal (tmux/install.sh, install-heal.sh)
#   agents        Claude Code, Codex, rtk, then claude/install.sh
#   traces        mount the drive labelled traces at /mnt/traces
#   tangle-tools  acct, fleet, one pages view on :1, chatgpt-fleet
#   handoff       print the sign-ins and other steps for a person
#
# Options:
#   --check                report drift and change nothing
#   --skip MODULE[,...]    leave these modules out
#   --wifi-ssid SSID       store this Wi-Fi network system-wide (wifi)
#   --wifi-psk-file FILE   read its passphrase from FILE (/dev/stdin works);
#                          without it the wifi module asks on the terminal
#   --replace-psk          replace a different passphrase the profile stores
#   --no-autologin         GDM waits for a person to log in (desktop); by
#                          default it logs this user in at boot
#   --list                 print the module names and exit
#
# Exit status: 0 when every step holds or was fixed, 1 when a step failed or
# (with --check) drifted, 2 for a usage or platform error.
#
# No set -e: a failed step is recorded and the run goes on to the next one.
set -uo pipefail

DOTFILES="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_DIR="$DOTFILES/host"
# desktop comes before wifi and nosleep: it installs NetworkManager on Server,
# and nosleep configures the login session after GDM is installed.
ALL_MODULES=(guards tools desktop wifi nosleep shell git tmux agents traces tangle-tools handoff)

# shellcheck source=provision/lib.sh
. "$HOST_DIR/provision/lib.sh"
for m in "${ALL_MODULES[@]}"; do
  # shellcheck source=/dev/null
  . "$HOST_DIR/provision/$m.sh"
done

usage() { sed -n '2,33p' "$0" | sed 's/^# \{0,1\}//'; }

SELECTED=()
SKIPPED=()
# shellcheck disable=SC2034 # the sourced module files read these options
while [ $# -gt 0 ]; do
  case "$1" in
    --check) PROVISION_MODE=check ;;
    --skip)
      IFS=',' read -r -a more <<<"${2:?--skip needs a module list}"
      SKIPPED+=("${more[@]}")
      shift
      ;;
    --wifi-ssid) WIFI_SSID="${2:?--wifi-ssid needs an SSID}"; shift ;;
    --wifi-psk-file) WIFI_PSK_FILE="${2:?--wifi-psk-file needs a file}"; shift ;;
    --replace-psk) REPLACE_PSK=1 ;;
    --no-autologin) AUTOLOGIN=0 ;;
    --list) printf '%s\n' "${ALL_MODULES[@]}"; exit 0 ;;
    -h | --help) usage; exit 0 ;;
    -*) printf 'unknown option: %s\n' "$1" >&2; usage >&2; exit 2 ;;
    *) SELECTED+=("$1") ;;
  esac
  shift
done

known() { local m; for m in "${ALL_MODULES[@]}"; do [ "$m" = "$1" ] && return 0; done; return 1; }
for m in ${SELECTED[@]+"${SELECTED[@]}"} ${SKIPPED[@]+"${SKIPPED[@]}"}; do
  known "$m" || { printf 'unknown module: %s (try --list)\n' "$m" >&2; exit 2; }
done
[ ${#SELECTED[@]} -gt 0 ] || SELECTED=("${ALL_MODULES[@]}")
listed() { local m n="$1"; shift; for m in "$@"; do [ "$m" = "$n" ] && return 0; done; return 1; }

# ── preflight ───────────────────────────────────────────────────────────────
[ "$(uname -s)" = Linux ] || { echo "host/provision.sh runs on the Linux box it provisions" >&2; exit 2; }
[ "$(id -u)" != 0 ] || { echo "Run as the user who owns the box, not as root; steps that need root use sudo." >&2; exit 2; }
[ "$(uname -m)" = x86_64 ] || { echo "The pinned downloads are x86_64 builds; this box is $(uname -m)." >&2; exit 2; }
USER="${USER:-$(id -un)}"
export USER
# shellcheck source=/dev/null
. /etc/os-release
if [ "${ID:-}" != ubuntu ] || [ "${VERSION_ID:-}" != 24.04 ]; then
  printf 'warning: written for Ubuntu 24.04; this is %s\n' "${PRETTY_NAME:-unknown}"
fi
if [ "$DOTFILES" != "$HOME/code/dotfiles" ]; then
  printf 'warning: links will point into %s; the durable checkout is ~/code/dotfiles\n' "$DOTFILES"
fi
# sudo -v asks for a password even under a NOPASSWD rule when another rule
# (the sudo group) needs one, so try a command first.
if ! checking && ! sudo -n true 2>/dev/null; then
  sudo -v || { echo "sudo is required" >&2; exit 2; }
fi
# Installers skip their shell-profile edits when ~/.local/bin is on PATH, and
# claude/install.sh needs claude on PATH for its plugin sync.
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$HOME/.local/bin:$PATH" ;; esac
WORK="$(mktemp -d)"
chmod 0755 "$WORK"
trap 'rm -rf "$WORK"' EXIT

printf 'Provisioning %s (%s mode) from %s\n' "$(hostname)" "$PROVISION_MODE" "$DOTFILES"
for m in "${ALL_MODULES[@]}"; do
  listed "$m" "${SELECTED[@]}" || continue
  if [ ${#SKIPPED[@]} -gt 0 ] && listed "$m" "${SKIPPED[@]}"; then continue; fi
  "module_${m//-/_}"
done

# ── summary ─────────────────────────────────────────────────────────────────
printf '\n== summary: %d ok, %d changed, %d drift, %d failed\n' "$N_OK" "$N_CHANGED" "$N_DRIFT" "$N_FAILED"
ALL_MANUAL=(${MANUAL_STEPS[@]+"${MANUAL_STEPS[@]}"} ${MANUAL_AFTER_SIGNIN[@]+"${MANUAL_AFTER_SIGNIN[@]}"})
if [ ${#ALL_MANUAL[@]} -gt 0 ]; then
  printf '\n== steps for a person, in this order (%d)\n' "${#ALL_MANUAL[@]}"
  i=0
  for step in "${ALL_MANUAL[@]}"; do
    i=$((i + 1))
    printf '%d. %s\n' "$i" "$step"
  done
fi
if [ "$N_FAILED" -gt 0 ] || { checking && [ "$N_DRIFT" -gt 0 ]; }; then
  exit 1
fi
exit 0
