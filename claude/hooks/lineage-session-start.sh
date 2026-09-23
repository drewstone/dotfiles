#!/usr/bin/env bash
# SessionStart hook: bind this Claude process to a lineage run and export the run's TANGLE_* ids
# (and OTEL_RESOURCE_ATTRIBUTES) through CLAUDE_ENV_FILE to every command the session runs.
# The lineage tool (tangle-tools lineage/, installed at ~/.local/bin/lineage) owns the logic and
# the ID contract; this wrapper only finds it. Never blocks a session: a missing tool or any
# failure exits 0.
LINEAGE="${LINEAGE_BIN:-$HOME/.local/bin/lineage}"
[ -x "$LINEAGE" ] || exit 0
"$LINEAGE" hook claude-session-start || true
exit 0
