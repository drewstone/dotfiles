# shellcheck shell=bash
# traces: mount the ext4 drive labelled "traces" at /mnt/traces, owned by the
# user, from an fstab line that lets the box boot without the drive.
# Formatting a drive is a human step: host/bin/format-traces-drive.

TRACES_MNT=/mnt/traces
TRACES_OPTS="defaults,noatime,nofail,x-systemd.device-timeout=10s"

traces_dev() { readlink -f /dev/disk/by-label/traces 2>/dev/null; }
traces_uuid() { lsblk -no UUID "$(traces_dev)" 2>/dev/null | head -1; }
traces_line() { printf 'UUID=%s %s ext4 %s 0 2' "$(traces_uuid)" "$TRACES_MNT" "$TRACES_OPTS"; }

# fstab_traces_lines: the uncommented fstab lines that mount at /mnt/traces.
# Fields are rejoined with single spaces, so spacing never counts as drift.
fstab_traces_lines() { awk -v m="$TRACES_MNT" '$1 !~ /^#/ && $2 == m { $1 = $1; print }' /etc/fstab; }

fstab_ok() { [ "$(fstab_traces_lines)" = "$(traces_line)" ]; }

# A /mnt/traces line whose UUID no longer exists (a reformatted drive) is
# replaced. A line for a device that exists is someone else's; leave it.
fix_fstab() {
  local line uuid
  line="$(fstab_traces_lines)"
  if [ -n "$line" ]; then
    uuid="$(printf '%s\n' "$line" | sed -n 's/^UUID=\([^ \t]*\).*/\1/p' | head -1)"
    if [ -z "$uuid" ] || [ -e "/dev/disk/by-uuid/$uuid" ] || [ "$(printf '%s\n' "$line" | wc -l)" != 1 ]; then
      printf '/etc/fstab has another %s line; change it by hand:\n%s\n' "$TRACES_MNT" "$line" >&2
      return 1
    fi
    as_root cp -p /etc/fstab "/etc/fstab.pre-dotfiles.$(date +%Y%m%d%H%M%S)" || return 1
    awk -v m="$TRACES_MNT" '!($1 !~ /^#/ && $2 == m)' /etc/fstab >"$WORK/fstab.new" || return 1
  else
    cp /etc/fstab "$WORK/fstab.new" || return 1
  fi
  printf '%s\n' "$(traces_line)" >>"$WORK/fstab.new"
  as_root install -m 0644 -o root -g root "$WORK/fstab.new" /etc/fstab && as_root systemctl daemon-reload
}

traces_mounted() { [ "$(findmnt -rno SOURCE "$TRACES_MNT" 2>/dev/null)" = "$(traces_dev)" ]; }
traces_owned() { traces_mounted && [ "$(stat -c %U "$TRACES_MNT")" = "$USER" ]; }

candidate_disks() {
  lsblk -dnpo NAME,MODEL,SERIAL,TRAN,SIZE,TYPE 2>/dev/null | awk '$NF == "disk"' | sed 's/ disk$//'
}

module_traces() {
  section "traces: ext4 drive labelled traces at $TRACES_MNT"
  local dev
  dev="$(traces_dev)"
  if [ -z "$dev" ] || [ ! -b "$dev" ]; then
    local -a disks=()
    mapfile -t disks < <(candidate_disks | sed 's/^/  /')
    manual "No drive is labelled traces. To erase one and make it the trace drive, Drew runs (it asks for ERASE on the terminal):" \
      "sudo $DOTFILES/host/bin/format-traces-drive --model '<MODEL>' --serial '<SERIAL>' [--transport usb]" \
      "Disks here (NAME MODEL SERIAL TRAN SIZE):" "${disks[@]}"
    return 0
  fi
  if [ "$(lsblk -no FSTYPE "$dev")" != ext4 ]; then
    failed "$dev is labelled traces but is not ext4"
    return 1
  fi
  ensure "$TRACES_MNT exists" test -d "$TRACES_MNT" -- as_root mkdir -p "$TRACES_MNT"
  ensure "/etc/fstab mounts $dev (UUID $(traces_uuid)) at $TRACES_MNT with nofail" fstab_ok -- fix_fstab
  ensure "$dev mounted at $TRACES_MNT" traces_mounted -- as_root mount "$TRACES_MNT"
  ensure "$TRACES_MNT owned by $USER" traces_owned -- as_root chown "$USER:$USER" "$TRACES_MNT"
}
