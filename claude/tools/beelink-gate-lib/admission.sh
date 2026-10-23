#!/usr/bin/env bash
# Host admission policy, bundled into immutable gates. Running commands never
# recheck this owner: a release hold stops new work and lets admitted work finish.
release_priority_reason() {
  local observation status=0 parsed=0 reason
  observation=$(python3 -c "$beelink_gate_release_source" "$1" "$(limits_file)" "$STATE_DIR" "$(command -v gh-drew || true)") || status=$?
  reason=$(python3 - "$status" "$observation" <<'PYTHON'
import json
import re
import sys

try:
    row = json.loads(sys.argv[2])
    state, reason = row["state"], row["reason"]
    if not isinstance(reason, str) or not re.fullmatch(r"[a-z_]{1,80}", reason):
        raise ValueError()
    if sys.argv[1] == "3" and state == "held":
        print("release priority held: " + reason)
        raise SystemExit(3)
    if sys.argv[1] != "0" or state not in ("open", "unknown"):
        raise ValueError()
    # The owner already logs and persists a valid unknown observation.
except (ValueError, TypeError, KeyError, IndexError, RecursionError):
    print("release_evidence_invalid_or_crashed")
PYTHON
  ) || parsed=$?
  if [ "$parsed" = 3 ]; then
    printf '%s\n' "$reason"
    return 3
  fi
  if [ "$parsed" != 0 ] || [ -n "$reason" ]; then
    echo 'beelink-gate: release priority unknown: release_evidence_invalid_or_crashed; using host PSI admission' >&2
  fi
  return 0
}

admit_release_priority() {
  local reason
  reason=$(release_priority_reason "$1") || tempfail "$(utc_in_minutes 5)" "$1 $reason"
}

# Windows owns the update policy; WSL owns the local clock and time-zone rules.
# Check again after waiting for the repo lock, before any checkout is touched.
# A gate admitted before the window keeps running, including its install.
check_update_window() {
  python3 - "$@" <<'PY'
from datetime import datetime, time, timedelta, timezone
import os
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

host, raw_day, raw_hour = sys.argv[1:4]
try:
    day, hour = int(raw_day), int(raw_hour)
    if not 0 <= day <= 7 or not 0 <= hour <= 23:
        raise ValueError("day or hour out of range")
    if len(sys.argv) > 4:
        zone = ZoneInfo(sys.argv[4])
    elif os.environ.get("TZ"):
        zone = ZoneInfo(os.environ["TZ"])
    else:
        with Path("/etc/localtime").open("rb") as zonefile:
            zone = ZoneInfo.from_file(zonefile)
    now = (datetime.fromisoformat(sys.argv[5].replace("Z", "+00:00"))
           if len(sys.argv) > 5 else datetime.now(timezone.utc))
    if now.tzinfo is None:
        raise ValueError("probe time requires a UTC offset")
    now = now.astimezone(timezone.utc)
except (OSError, ValueError, IndexError) as exc:
    print(f"beelink-gate: cannot evaluate Windows Update window: {exc}", file=sys.stderr)
    sys.exit(2)

local_day = now.astimezone(zone).date()
for offset in range(-7, 8):
    candidate = local_day + timedelta(days=offset)
    # Registry day 0 is daily; 1=Sunday through 7=Saturday.
    if day and candidate.isoweekday() % 7 + 1 != day:
        continue
    scheduled_local = datetime.combine(candidate, time(hour), zone)
    scheduled = scheduled_local.astimezone(timezone.utc)
    start = scheduled - timedelta(minutes=60)
    end = scheduled + timedelta(minutes=30)
    if start <= now < end:
        next_local = end.astimezone(zone)
        print(
            f"beelink-gate: REFUSED {host} Windows Update is scheduled "
            f"{scheduled.astimezone(zone):%A %Y-%m-%d %H:%M %Z}; "
            f"new gates are blocked from {start.astimezone(zone):%Y-%m-%d %H:%M %Z} "
            f"until {next_local:%Y-%m-%d %H:%M %Z}; "
            f"next allowed {next_local:%Y-%m-%d %H:%M %Z} "
            f"({end:%Y-%m-%d %H:%M} UTC)",
            file=sys.stderr,
        )
        print(f"{end:%Y-%m-%dT%H:%M:%SZ}")
        sys.exit(3)
PY
}

# Starts only outside the update window; inside it, a TEMPFAIL until it ends.
admit_window() {
  local next rc
  next=$(check_update_window "$@"); rc=$?
  case "$rc" in
    0) ;;
    3) tempfail "$next" "$1 is in its Windows Update window" ;;
    *) exit "$rc" ;;
  esac
}
