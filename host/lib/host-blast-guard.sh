#!/usr/bin/env bash
# Shared checks for the root wrappers in /usr/local/sbin.
# Every wrapper sources this file, decides, then execs the real binary.
#
# Why: two outages came from root storage commands that look scoped and act on
# the whole host. 2026-08-20: `unshare --mount` then `rmdir /proc` deleted the
# real /proc directory (5 days down). 2026-09-02: `fsfreeze -f` on a directory
# whose mount had failed froze the root filesystem (16 days down).
#
# Policy: a command may touch a loop device, a device-mapper device on a loop
# device, or a scratch mount. It may not touch the disk that holds /, the
# kernel filesystems (/proc /sys /dev /run), or /boot.
#
# Fail closed: a check that cannot decide refuses.
# Bypass for a human, one call: HOST_BLAST_GUARD=off. Agents must not set it.

hbg_real() {
  # Print the real binary for a wrapper name, skipping /usr/local.
  local n="$1" d
  for d in /usr/sbin /usr/bin /sbin /bin; do
    if [ -x "$d/$n" ]; then
      printf '%s\n' "$d/$n"
      return 0
    fi
  done
  return 1
}

hbg_off() { [ "${HOST_BLAST_GUARD:-}" = "off" ]; }

hbg_refuse() {
  local verb="$1"
  shift
  {
    printf 'host-blast-guard: refused %s: %s\n' "$verb" "$*"
    printf 'This class of command took this host down on 2026-08-20 and 2026-09-02.\n'
    printf 'Run it in a throwaway VM instead:  hostlab run -- %s ...   (hostlab --help)\n' "$verb"
    printf 'A human may bypass one call with HOST_BLAST_GUARD=off. An agent must not.\n'
  } >&2
  exit 125
}

hbg_root_disk() {
  # Print the whole-disk name that holds / (for example nvme0n1).
  local src pk
  src="$(findmnt -no SOURCE / 2>/dev/null)" || return 1
  src="${src%%\[*}"
  pk="$(lsblk -lno PKNAME "$src" 2>/dev/null | head -1)"
  if [ -n "$pk" ]; then
    printf '%s\n' "$pk"
    return 0
  fi
  lsblk -lno NAME "$src" 2>/dev/null | head -1
}

hbg_on_root_disk() {
  # Return 0 when the block device or any ancestor is the root disk.
  # A loop device has no block ancestor, so loop-backed work passes.
  local dev="$1" root n
  root="$(hbg_root_disk)" || return 0
  [ -e "$dev" ] || return 1
  for n in $(lsblk -slno NAME "$dev" 2>/dev/null); do
    [ "$n" = "$root" ] && return 0
  done
  return 1
}

hbg_path_on_root_disk() {
  # Return 0 when the filesystem that holds the path lives on the root disk.
  local src
  src="$(findmnt -no SOURCE --target "$1" 2>/dev/null)" || return 0
  src="${src%%\[*}"
  case "$src" in
    /dev/*) hbg_on_root_disk "$src" ;;
    *) return 1 ;;
  esac
}

hbg_is_kernel_dir() {
  # Return 0 for the mountpoints the host cannot lose.
  local p="${1%/}"
  [ -z "$p" ] && p=/
  case "$p" in
    /|/proc|/sys|/dev|/run|/boot|/boot/efi) return 0 ;;
    /proc/*|/sys/*|/dev/pts|/dev/shm|/run/lock|/run/user) return 0 ;;
  esac
  return 1
}

hbg_check_dev_arg() {
  # Refuse when a /dev path argument sits on the root disk.
  local verb="$1" dev="$2"
  case "$dev" in
    /dev/*) hbg_on_root_disk "$dev" && hbg_refuse "$verb" "$dev is on the root disk" ;;
  esac
  return 0
}
