# shellcheck shell=bash
# guards: root wrappers, sudoers and the frozen-root watchdog. host/install.sh
# owns the file list; this module asks it for drift and runs it on drift.

module_guards() {
  section "guards: root wrappers, sudoers, frozen-root watchdog (host/install.sh)"
  local out line
  local -a lines=()
  if out="$(bash "$HOST_DIR/install.sh" --check 2>&1)"; then
    ok "host guards match host/"
    return 0
  fi
  mapfile -t lines < <(printf '%s\n' "$out" | sed -n 's/^  drift *//p')
  if checking; then
    for line in "${lines[@]}"; do drift "$line"; done
    [ ${#lines[@]} -gt 0 ] || drift "host/install.sh --check failed: $(printf '%s' "$out" | tail -1)"
    return 0
  fi
  if indent bash "$HOST_DIR/install.sh"; then
    changed "host guards installed (host/install.sh)"
  else
    failed "host/install.sh"
  fi
}
