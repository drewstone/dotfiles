#!/usr/bin/env bash
# Complete, validated source bundling, transport reception and job staging.
# Sourced by beelink-gate and embedded into every submitted script.

emit_gate_source() {
  local generated status
  generated=$(mktemp) || return "$TEMPFAIL"
  if ! awk -v installer="${gate_installer_source:-}" -v staging="${gate_staging_source:-}" '
    function append(file, line, status, count) {
      while ((status = getline line < file) > 0) { print line; count++ }
      close(file)
      if (status < 0 || count == 0) exit 1
    }
    { last = $0 }
    $0 == "# BEELINK_GATE_INSTALLER_START" {
      starts++; append(installer); append(staging)
      skip = 1; next
    }
    $0 == "# BEELINK_GATE_INSTALLER_END" { ends++; skip = 0; next }
    !skip { print }
    END {
      if (skip || starts != ends || starts > 1 || last != "# BEELINK_GATE_SOURCE_END") exit 1
    }
  ' "$0" > "$generated"; then
    rm -f "$generated"
    tempfail_line "$(utc_in_minutes 5)" "cannot generate complete gate source; nothing submitted"
    return "$TEMPFAIL"
  fi
  cat "$generated"; status=$?
  rm -f "$generated"
  [ "$status" = 0 ] || return "$TEMPFAIL"
}
# Read the whole payload before Bash executes any of it. The footer also
# delimits the script when heartbeat data follows on the same open stdin.
receive_gate_source() {
  local generated line complete=0 status
  generated=$(mktemp) || return 75
  while IFS= read -r line; do
    printf '%s\n' "$line" >> "$generated" || { rm -f "$generated"; return 75; }
    if [ "$line" = "# BEELINK_GATE_SOURCE_END" ]; then complete=1; break; fi
  done
  if [ "$complete" != 1 ] || ! bash -n "$generated"; then
    rm -f "$generated"
    echo "beelink-gate: TEMPFAIL incomplete or invalid received gate source" >&2
    return 75
  fi
  bash "$generated" "$@"; status=$?
  rm -f "$generated"
  return "$status"
}


stage_job() {
  local target=$1 id=$2 dir marker source_file status
  source_file=$(mktemp) || return "$TEMPFAIL"
  emit_gate_source > "$source_file" || { rm -f "$source_file"; return "$TEMPFAIL"; }
  dir="$STATE_DIR/jobs/$id"
  if [ "$target" = "$SELF" ]; then
    mkdir -p "$STATE_DIR/jobs" && mkdir -m 700 "$dir" && cp -- "$source_file" "$dir/gate.sh" && chmod 700 "$dir/gate.sh"
    status=$?
    rm -f "$source_file"
    return "$status"
  fi
  marker="__BEELINK_GATE_SOURCE_${id//-/_}__"
  {
    printf 'id=%q\n' "$id"
    cat <<'BOOT'
set -euo pipefail
umask 077
root="${BEELINK_GATE_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/beelink-gate}/jobs"
mkdir -p "$root"
dir="$root/$id"
mkdir -m 700 "$dir"
complete_source() { [ "$(tail -n 1 "$dir/gate.sh")" = '# BEELINK_GATE_SOURCE_END' ] && bash -n "$dir/gate.sh"; }
trap 'complete_source || exit 75' EXIT
BOOT
    printf "cat > \"\$dir/gate.sh\" <<'%s'\n" "$marker"
    cat "$source_file" || exit "$TEMPFAIL"
    printf '%s\ncomplete_source || exit 75\nchmod 700 "$dir/gate.sh"\n' "$marker"
  } | bounded_transport "$target stage $id" ssh "${SSH_OPTIONS[@]}" "${BEELINK_IPS[$target]}" wsl.exe -- bash -s
  status=$?
  rm -f "$source_file"
  return "$status"
}

