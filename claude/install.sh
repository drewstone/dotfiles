#!/usr/bin/env bash
# Install Claude Code configuration (CLAUDE.md, settings, skills, hooks, commands, tools)
# Usage: ./install.sh [--force]
#
# Symlinks config from this repo into ~/.claude/
# Generates platform-specific settings.local.json (trustedDirectories)
# Safe to re-run — only replaces symlinks, never overwrites real files unless --force
#
# Self-heals settings.json when Claude Code replaces the symlink with a regular
# file (happens whenever Claude Code writes a setting via its UI): any runtime
# keys that diverge from canonical are migrated to settings.local.json, and the
# symlink is restored. Re-run this script any time plugins/hooks appear missing.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
CODEX_DIR="$HOME/.codex"
OPENCODE_DIR="$HOME/.config/opencode"
AGENTS_SRC="$SCRIPT_DIR/AGENTS.md"
FORCE="${1:-}"

link() {
  local src="$1" dst="$2"
  if [ -L "$dst" ]; then
    rm "$dst"
  elif [ -e "$dst" ]; then
    if [ "$FORCE" = "--force" ]; then
      echo "  OVERWRITE $dst"
      rm -rf "$dst"
    else
      echo "  SKIP $dst (exists, use --force to overwrite)"
      return
    fi
  fi
  ln -sf "$src" "$dst"
  echo "  LINK $dst -> $src"
}

# settings.json is special: Claude Code writes to it atomically (rename), which
# replaces our symlink with a regular file and silently drops enabledPlugins,
# extraKnownMarketplaces, hooks, etc. Before (re-)linking, migrate any keys
# that diverge from canonical into settings.local.json, then restore the link.
link_settings() {
  local src="$SCRIPT_DIR/settings.json"
  local dst="$CLAUDE_DIR/settings.json"
  local local_file="$CLAUDE_DIR/settings.local.json"

  if [ -f "$dst" ] && [ ! -L "$dst" ]; then
    echo "  REPAIR $dst (symlink was replaced by Claude Code; migrating runtime keys)"
    python3 - "$src" "$dst" "$local_file" <<'PYEOF'
import json, os, sys
canonical_path, live_path, local_path = sys.argv[1:4]
try:
    canonical = json.load(open(canonical_path))
    live = json.load(open(live_path))
except (OSError, json.JSONDecodeError) as e:
    print(f"    WARN: could not parse settings ({e}); leaving live file intact")
    sys.exit(1)
extras = {k: v for k, v in live.items() if canonical.get(k) != v}
if not extras:
    print("    No runtime-divergent keys to preserve.")
    sys.exit(0)
local = {}
if os.path.exists(local_path):
    try:
        local = json.load(open(local_path))
    except json.JSONDecodeError:
        print(f"    WARN: {local_path} is malformed; starting fresh")
local.update(extras)
with open(local_path, "w") as f:
    json.dump(local, f, indent=2)
    f.write("\n")
print(f"    Migrated to settings.local.json: {sorted(extras.keys())}")
PYEOF
    # Only remove the clobbered file if the migration didn't bail out with an error.
    # A non-zero exit from python3 above trips `set -e` and we never get here.
    rm "$dst"
  fi

  link "$src" "$dst"
}

echo "Installing Claude config from $SCRIPT_DIR"

# Global config
mkdir -p "$CLAUDE_DIR"
link "$SCRIPT_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
link_settings
[ -f "$SCRIPT_DIR/RTK.md" ] && link "$SCRIPT_DIR/RTK.md" "$CLAUDE_DIR/RTK.md"

# Shared agent instructions
if [ -f "$AGENTS_SRC" ]; then
  mkdir -p "$CLAUDE_DIR" "$CODEX_DIR" "$OPENCODE_DIR"
  link "$AGENTS_SRC" "$CLAUDE_DIR/AGENTS.md"
  link "$AGENTS_SRC" "$CODEX_DIR/AGENTS.md"
  link "$AGENTS_SRC" "$OPENCODE_DIR/AGENTS.md"
fi

# Directory-level instructions for the ~/code tree. Scope differs from the
# shared file above: that one states how to behave in any session, this one
# states where work lives across the repos under ~/code and how to route it.
# CLAUDE.md is the one-line import so the two spellings cannot drift.
CODE_TREE_SRC="$SCRIPT_DIR/code-tree-AGENTS.md"
if [ -f "$CODE_TREE_SRC" ] && [ -d "$HOME/code" ]; then
  link "$CODE_TREE_SRC" "$HOME/code/AGENTS.md"
  printf '@AGENTS.md\n' > "$HOME/code/CLAUDE.md"
fi

# Reflections (cross-project analysis)
link "$SCRIPT_DIR/reflections" "$CLAUDE_DIR/reflections"

# Directives (per-response interaction-style layer; read by hooks/inject-directive.sh)
link "$SCRIPT_DIR/directives" "$CLAUDE_DIR/directives"

# Skills. A skill can be a symlink into another repo's checkout, so a missing
# target just means that repo isn't cloned here — install the rest, but say which
# one vanished. Skipping silently is how build-with-agent-runtime went missing for
# eleven days.
mkdir -p "$CLAUDE_DIR/skills" "$CODEX_DIR/skills"
for skill_dir in "$SCRIPT_DIR/skills"/*/; do
  skill="$(basename "$skill_dir")"
  if [ ! -f "$skill_dir/SKILL.md" ]; then
    if [ -L "${skill_dir%/}" ]; then
      echo "  WARN skill '$skill' skipped: link target missing ($(readlink "${skill_dir%/}"))"
    elif [ -d "$skill_dir" ]; then
      echo "  WARN skill '$skill' skipped: SKILL.md missing"
    fi
    continue
  fi
  link "$skill_dir" "$CLAUDE_DIR/skills/$skill"
  link "$skill_dir" "$CODEX_DIR/skills/$skill"
done

# Skills owned by a sibling repo are resolved here, not committed as a symlink.
# An absolute link checked into the repo cannot be right on more than one machine:
# agent-runtime sits at ~/webb/agent-runtime on the laptop and ~/code/agent-runtime
# on the dev box, so whichever path is committed dangles on the other and the skill
# silently disappears.
RUNTIME_SKILLS_DIR=""
for candidate in \
  "${AGENT_RUNTIME_DIR:+$AGENT_RUNTIME_DIR/skills}" \
  "$HOME/webb/agent-runtime/skills" \
  "$HOME/code/agent-runtime/skills"; do
  [ -d "$candidate" ] || continue
  RUNTIME_SKILLS_DIR="$candidate"
  for ext in "$candidate"/*/; do
    [ -f "$ext/SKILL.md" ] || continue
    name="$(basename "$ext")"
    [ -e "$SCRIPT_DIR/skills/$name" ] && continue   # a local skill of the same name wins
    link "$ext" "$CLAUDE_DIR/skills/$name"
    link "$ext" "$CODEX_DIR/skills/$name"
  done
  break
done

# Commands
if [ -d "$SCRIPT_DIR/commands" ] && [ "$(ls -A "$SCRIPT_DIR/commands" 2>/dev/null)" ]; then
  mkdir -p "$CLAUDE_DIR/commands"
  for cmd in "$SCRIPT_DIR/commands"/*; do
    [ -f "$cmd" ] || continue
    link "$cmd" "$CLAUDE_DIR/commands/$(basename "$cmd")"
  done
fi

# Output styles (Claude-only: Codex and OpenCode have no equivalent)
if [ -d "$SCRIPT_DIR/output-styles" ] && [ "$(ls -A "$SCRIPT_DIR/output-styles" 2>/dev/null)" ]; then
  mkdir -p "$CLAUDE_DIR/output-styles"
  for style in "$SCRIPT_DIR/output-styles"/*.md; do
    [ -f "$style" ] || continue
    link "$style" "$CLAUDE_DIR/output-styles/$(basename "$style")"
  done
fi

# Hooks
if [ -d "$SCRIPT_DIR/hooks" ] && [ "$(ls -A "$SCRIPT_DIR/hooks" 2>/dev/null)" ]; then
  mkdir -p "$CLAUDE_DIR/hooks"
  for hook in "$SCRIPT_DIR/hooks"/*; do
    [ -f "$hook" ] || continue
    link "$hook" "$CLAUDE_DIR/hooks/$(basename "$hook")"
  done
fi

# Tools (bin symlinks)
if [ -d "$SCRIPT_DIR/tools" ] && [ "$(ls -A "$SCRIPT_DIR/tools" 2>/dev/null)" ]; then
  mkdir -p "$HOME/bin"
  for tool in "$SCRIPT_DIR/tools"/*; do
    [ -f "$tool" ] || continue
    base="$(basename "$tool")"
    [[ "$base" == "README.md" ]] && continue
    link "$tool" "$HOME/bin/$base"
    chmod +x "$tool"
  done
fi

# The sweep crons redirect into $HOME/attic/sweep.log. A missing directory makes
# the redirect fail before the script runs, so the sweeps go silently inert.
mkdir -p "$HOME/attic"

# Platform-specific settings.local.json (trustedDirectories)
# Uses $HOME so it works on any machine/user without hardcoded paths.
LOCAL_SETTINGS="$CLAUDE_DIR/settings.local.json"
if [ ! -e "$LOCAL_SETTINGS" ]; then
  echo ""
  echo "Generating platform-specific settings.local.json..."
  cat > "$LOCAL_SETTINGS" <<EOF
{
  "trustedDirectories": [
    "$HOME",
    "$HOME/code",
    "/tmp"
  ]
}
EOF
  echo "  CREATED $LOCAL_SETTINGS ($(uname -s), user: $(whoami))"
else
  echo "  SKIP $LOCAL_SETTINGS (exists)"
fi

# Pi skills (subset — only skills that work in conversation, not coding)
PI_SKILLS_DIR="$HOME/.pi/agent/skills"
PI_SKILLS=(reflect hypothesize evolve)
if [ -d "$HOME/.pi/agent" ]; then
  mkdir -p "$PI_SKILLS_DIR"
  for skill in "${PI_SKILLS[@]}"; do
    skill_dir="$SCRIPT_DIR/skills/$skill"
    if [ -d "$skill_dir" ]; then
      link "$skill_dir" "$PI_SKILLS_DIR/$skill"
    fi
  done
  # Prune dead Pi skill symlinks
  find "$PI_SKILLS_DIR" -maxdepth 1 -type l ! -exec test -e {} \; -print 2>/dev/null | while read -r stale; do
    echo "  PRUNE $stale (dead Pi skill symlink)"
    rm "$stale"
  done
  pi_skill_count=$(find "$PI_SKILLS_DIR" -maxdepth 1 -type l 2>/dev/null | wc -l | tr -d ' ')
  echo "  Pi: ${pi_skill_count} skills synced"
fi

# Codex prompts share the Claude command sources.
if [ -d "$SCRIPT_DIR/commands" ]; then
  mkdir -p "$CODEX_DIR/prompts"
  for cmd in "$SCRIPT_DIR/commands"/*.md; do
    [ -f "$cmd" ] || continue
    link "$cmd" "$CODEX_DIR/prompts/$(basename "$cmd")"
  done
  find "$CODEX_DIR/prompts" -maxdepth 1 -type l ! -exec test -e {} \; -print | while read -r stale; do
    echo "  PRUNE $stale (dead Codex prompt symlink)"
    rm "$stale"
  done
fi

# Generic AgentProfile exports for cli-bridge/autopilot and any other
# harness that can consume a transport-neutral profile object.
PROFILE_DIR="$HOME/.config/agent-profiles"
mkdir -p "$PROFILE_DIR"
ALL_SKILLS=$(find "$SCRIPT_DIR/skills" -maxdepth 1 -mindepth 1 -type d -exec test -f "{}/SKILL.md" \; -print | xargs -n1 basename 2>/dev/null | paste -sd, -)
python3 "$SCRIPT_DIR/tools/emit-agent-profile.py" \
  --source "$SCRIPT_DIR" \
  --out "$PROFILE_DIR/drew-default.json" \
  --name "drew-default" \
  --description "Global Drew coding profile compiled from Claude dotfiles." \
  --include-prompt \
  --skills "$ALL_SKILLS" \
  --permission Bash=allow \
  --permission Read=allow \
  --permission Edit=allow \
  --permission Write=allow
python3 "$SCRIPT_DIR/tools/emit-agent-profile.py" \
  --source "$SCRIPT_DIR" \
  --out "$PROFILE_DIR/drew-conversation.json" \
  --name "drew-conversation" \
  --description "Conversation-safe subset compiled from Claude dotfiles." \
  --include-prompt \
  --skills "$(IFS=,; echo "${PI_SKILLS[*]}")"
echo "  Agent profiles exported to $PROFILE_DIR"

# Return a Git common directory for a path inside a checkout.
repository_common_dir() {
  local path="$1"
  command -v git >/dev/null 2>&1 || return 1
  git -C "$path" rev-parse --path-format=absolute --git-common-dir 2>/dev/null
}

# Return the origin that identifies separate clones of one source repository.
repository_origin() {
  local path="$1"
  command -v git >/dev/null 2>&1 || return 1
  git -C "$path" remote get-url origin 2>/dev/null
}

DOTFILES_COMMON_DIR=$(repository_common_dir "$SCRIPT_DIR" || true)
DOTFILES_ORIGIN=$(repository_origin "$SCRIPT_DIR" || true)
RUNTIME_COMMON_DIR=""
RUNTIME_ORIGIN=""
if [ -n "$RUNTIME_SKILLS_DIR" ]; then
  RUNTIME_COMMON_DIR=$(repository_common_dir "$RUNTIME_SKILLS_DIR" || true)
  RUNTIME_ORIGIN=$(repository_origin "$RUNTIME_SKILLS_DIR" || true)
fi

skill_is_current() {
  local name="$1"
  [ -f "$SCRIPT_DIR/skills/$name/SKILL.md" ] || \
    { [ -n "$RUNTIME_SKILLS_DIR" ] && [ -f "$RUNTIME_SKILLS_DIR/$name/SKILL.md" ]; }
}

skill_link_is_managed() {
  local link_path="$1"
  local common_dir origin
  common_dir=$(repository_common_dir "$link_path" || true)
  origin=$(repository_origin "$link_path" || true)
  { [ -n "$common_dir" ] && [ "$common_dir" = "$DOTFILES_COMMON_DIR" ]; } || \
    { [ -n "$origin" ] && [ "$origin" = "$DOTFILES_ORIGIN" ]; } || \
    { [ -n "$common_dir" ] && [ "$common_dir" = "$RUNTIME_COMMON_DIR" ]; } || \
    { [ -n "$origin" ] && [ "$origin" = "$RUNTIME_ORIGIN" ]; }
}

# A missing SKILL.md is invalid. A managed link absent from the current source
# is retired, even when an older checkout still makes its target look valid.
for dir in "$CLAUDE_DIR/skills" "$CODEX_DIR/skills"; do
  [ -d "$dir" ] || continue
  find "$dir" -maxdepth 1 -type l -print | while read -r stale; do
    if [ ! -f "$stale/SKILL.md" ]; then
      echo "  PRUNE $stale (invalid skill symlink)"
      rm "$stale"
      continue
    fi
    name=$(basename "$stale")
    if ! skill_is_current "$name" && skill_link_is_managed "$stale"; then
      echo "  PRUNE $stale (retired managed skill)"
      rm "$stale"
    fi
  done
done

# Clean up stale symlinks in commands and hooks.
for dir in "$CLAUDE_DIR/commands" "$CLAUDE_DIR/hooks"; do
  [ -d "$dir" ] || continue
  find "$dir" -maxdepth 1 -type l ! -exec test -e {} \; -print | while read -r stale; do
    echo "  PRUNE $stale (dead symlink)"
    rm "$stale"
  done
done

# Clean up stale tool symlinks previously installed into ~/bin from this repo
if [ -d "$HOME/bin" ]; then
  find "$HOME/bin" -maxdepth 1 -type l -print | while read -r link_path; do
    target=$(readlink "$link_path" 2>/dev/null || true)
    case "$target" in
      "$SCRIPT_DIR/tools/"*)
        if [ ! -e "$target" ]; then
          echo "  PRUNE $link_path (dead tool symlink)"
          rm "$link_path"
        fi
        ;;
    esac
  done
fi

# ── Plugin sync ──────────────────────────────────────────────────────
#
# Every plugin listed under `enabledPlugins` in our canonical
# settings.json needs its cache dir at ~/.claude/plugins/cache/<mp>/<name>/<v>.
# When a Mac is fresh / wiped / has had Claude Code clobber the cache,
# the Stop/precmd hook fires "Plugin directory does not exist" loops.
#
# Claude Code exposes `claude plugin install <name>@<marketplace>` as a
# headless command, so we drive it from here. Idempotent: `details`
# succeeds when a plugin is already installed at any version, so we
# only install the misses.
sync_plugins() {
  local settings="$SCRIPT_DIR/settings.json"
  [ -f "$settings" ] || return 0
  command -v claude >/dev/null 2>&1 || {
    echo "  SKIP plugin sync — claude CLI not on PATH"
    return 0
  }

  # Step 1: register every marketplace listed in settings.json. Claude
  # Code reads `extraKnownMarketplaces` at startup but doesn't actually
  # register them with the plugin CLI; install fails until we tell it.
  local marketplaces_json
  if command -v jq >/dev/null 2>&1; then
    marketplaces_json=$(jq -c '.extraKnownMarketplaces // {} | to_entries[] | {name: .key, repo: .value.source.repo}' "$settings" 2>/dev/null || true)
  else
    marketplaces_json=$(python3 -c "
import json
d = json.load(open('$settings')).get('extraKnownMarketplaces', {})
for k, v in d.items():
    repo = v.get('source', {}).get('repo')
    if repo: print(json.dumps({'name': k, 'repo': repo}))
" 2>/dev/null || true)
  fi
  local known
  known=$(claude plugin marketplace list 2>/dev/null | tr -d ' ' || true)
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    local name repo
    name=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin)['name'])" 2>/dev/null)
    repo=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin)['repo'])" 2>/dev/null)
    [ -z "$name" ] || [ -z "$repo" ] && continue
    if echo "$known" | grep -q "^${name}\$\|^${name}[^a-zA-Z0-9_-]"; then
      continue
    fi
    if claude plugin marketplace add "$repo" >/dev/null 2>&1; then
      echo "  ADD marketplace $name ($repo)"
    else
      echo "  WARN  marketplace add $name failed"
    fi
  done <<<"$marketplaces_json"

  # Step 2: install every enabledPlugin. Idempotent — `details` returns
  # 0 when present at any version.
  local keys
  if command -v jq >/dev/null 2>&1; then
    keys=$(jq -r '.enabledPlugins // {} | keys[] | select(. != "")' "$settings" 2>/dev/null || true)
  else
    keys=$(python3 -c "import json,sys; d=json.load(open('$settings')); [print(k) for k in d.get('enabledPlugins',{}) if k]" 2>/dev/null || true)
  fi
  [ -z "$keys" ] && return 0
  local installed=0 skipped=0 failed=0
  while IFS= read -r key; do
    [ -z "$key" ] && continue
    if claude plugin details "$key" >/dev/null 2>&1; then
      skipped=$((skipped + 1))
      continue
    fi
    if claude plugin install "$key" --scope user >/dev/null 2>&1; then
      echo "  INSTALL plugin $key"
      installed=$((installed + 1))
    else
      echo "  WARN  plugin $key install failed — run 'claude plugin install $key' manually"
      failed=$((failed + 1))
    fi
  done <<<"$keys"
  if [ "$installed" -gt 0 ] || [ "$failed" -gt 0 ]; then
    echo "  Plugins: $installed installed, $skipped already-present, $failed failed"
  fi
}
sync_plugins

# Summary
skill_count=$(find "$SCRIPT_DIR/skills" -maxdepth 1 -type d ! -name skills | wc -l | tr -d ' ')
cmd_count=$(find "$SCRIPT_DIR/commands" -type f 2>/dev/null | wc -l | tr -d ' ')
hook_count=$(find "$SCRIPT_DIR/hooks" -type f 2>/dev/null | wc -l | tr -d ' ')
tool_count=$(find "$SCRIPT_DIR/tools" -type f ! -name README.md 2>/dev/null | wc -l | tr -d ' ')

echo ""
echo "Done. ${skill_count} skills, ${cmd_count} commands, ${hook_count} hooks, ${tool_count} tools installed."
