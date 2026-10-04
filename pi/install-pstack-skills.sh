#!/usr/bin/env bash
# Install the curated pstack skill set into the canonical agent skill store
# (~/.agents/skills) and expose it to pi (~/.pi/agent/skills), following the
# existing symlink pattern. Safe to re-run.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/pstack-skills" && pwd)"
AGENTS_SKILLS="$HOME/.agents/skills"
PI_SKILLS="$HOME/.pi/agent/skills"

mkdir -p "$AGENTS_SKILLS" "$PI_SKILLS"

for dir in "$SRC"/*/; do
  name=$(basename "$dir")
  [ "$name" = "LICENSE" ] && continue
  # Canonical store gets a real copy.
  rm -rf "$AGENTS_SKILLS/$name"
  cp -r "$dir" "$AGENTS_SKILLS/$name"
  # pi gets the standard symlink: ~/.pi/agent/skills/<name> -> ../../../.agents/skills/<name>
  rm -f "$PI_SKILLS/$name"
  ln -s "../../../.agents/skills/$name" "$PI_SKILLS/$name"
  echo "installed: $name"
done

echo "done: $(ls -d "$SRC"/*/ | wc -l | tr -d ' ') skills"
