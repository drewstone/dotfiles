#!/usr/bin/env bash
# Install Claude Code configuration (CLAUDE.md, settings, skills, hooks, tools) and the optional private layer
# Usage: ./install.sh [--force]
#
# Symlinks config from this repo into ~/.claude/
# Generates platform-specific settings.local.json (trustedDirectories)
# Safe to re-run — only replaces symlinks, never overwrites real files unless --force
#
# ~/.claude/settings.json is machine state, never a link into this checkout, because Claude Code
# writes to it: this repo's settings merged with ~/.claude/settings.machine.json (install-settings.py).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
CODEX_DIR="$HOME/.codex"
OPENCODE_DIR="$HOME/.config/opencode"
AGENTS_SRC="$SCRIPT_DIR/AGENTS.md"
FORCE="${1:-}"
# The optional private layer, a repository shaped like this one, adds instructions, skills, hooks, tools and a settings
# overlay; absent, each step reading it is a no-op.
DOTFILES_PRIVATE="${DOTFILES_PRIVATE:-$HOME/.local/share/dotfiles-private}"
LAYER="$DOTFILES_PRIVATE/claude"

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

# layer_link FILE DST [PUBLIC]: link the private layer's FILE at DST, else PUBLIC, else retire DST's stale link.
layer_link() {
  if [ -e "$LAYER/$1" ]; then link "$LAYER/$1" "$2"
  elif [ -n "${3:-}" ]; then link "$3" "$2"
  elif [ -L "$2" ]; then rm "$2"; echo "  RETIRE $2 (no private layer)"; fi
}

echo "Installing Claude config from $SCRIPT_DIR"

# Global config
mkdir -p "$CLAUDE_DIR"
link "$SCRIPT_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
python3 "$SCRIPT_DIR/install-settings.py" --base "$SCRIPT_DIR/settings.json" --overlay "$LAYER/settings.json" --claude-dir "$CLAUDE_DIR"
python3 "$SCRIPT_DIR/install-codex-config.py"
[ -f "$SCRIPT_DIR/RTK.md" ] && link "$SCRIPT_DIR/RTK.md" "$CLAUDE_DIR/RTK.md"

# Shared agent instructions
if [ -f "$AGENTS_SRC" ]; then
  mkdir -p "$CLAUDE_DIR" "$CODEX_DIR" "$OPENCODE_DIR"
  link "$AGENTS_SRC" "$CLAUDE_DIR/AGENTS.md"
  link "$AGENTS_SRC" "$CODEX_DIR/AGENTS.md"
  link "$AGENTS_SRC" "$OPENCODE_DIR/AGENTS.md"
fi
layer_link AGENTS.md "$CLAUDE_DIR/AGENTS.private.md"   # CLAUDE.md imports it; Claude Code skips a missing import
layer_link guard-config.json "$CLAUDE_DIR/guard-config.json"

# Directory-level instructions for the ~/code tree. Scope differs from the
# shared file above: that one states how to behave in any session, this one
# states where work lives across the repos under ~/code and how to route it.
# CLAUDE.md is the one-line import so the two spellings cannot drift.
CODE_TREE_SRC="$SCRIPT_DIR/code-tree-AGENTS.md"
if [ -f "$CODE_TREE_SRC" ] && [ -d "$HOME/code" ]; then
  link "$CODE_TREE_SRC" "$HOME/code/AGENTS.md"
  printf '@AGENTS.md\n' > "$HOME/code/CLAUDE.md"
fi

# Directives (interaction-style layer, read by hooks/inject-directive.sh): per-file links, so the private
# layer's variants sit beside the public ones and its `active`, when it has one, wins.
[ -L "$CLAUDE_DIR/directives" ] && rm "$CLAUDE_DIR/directives"
mkdir -p "$CLAUDE_DIR/directives/variants"
for variant in "$SCRIPT_DIR"/directives/variants/*.md "$LAYER"/directives/variants/*.md; do
  [ -f "$variant" ] && link "$variant" "$CLAUDE_DIR/directives/variants/$(basename "$variant")"
done
layer_link directives/active "$CLAUDE_DIR/directives/active" "$SCRIPT_DIR/directives/active"

# Skills. A skill can be a symlink into another repo's checkout, so a missing
# target just means that repo isn't cloned here — install the rest, but say which
# one vanished. A private layer skill of a public skill's name replaces it.
mkdir -p "$CLAUDE_DIR/skills" "$CODEX_DIR/skills"
for skill_dir in "$SCRIPT_DIR/skills"/*/ "$LAYER"/skills/*/; do
  skill="$(basename "$skill_dir")"
  case "$skill" in _*) continue ;; esac   # shared material for authors (_probes), not a skill
  if [ ! -f "$skill_dir/SKILL.md" ]; then
    if [ -L "${skill_dir%/}" ]; then
      echo "  WARN skill '$skill' skipped: link target missing ($(readlink "${skill_dir%/}"))"
    elif [ -d "$skill_dir" ]; then
      echo "  WARN skill '$skill' skipped: SKILL.md missing"
    fi
    continue
  fi
  case "$skill_dir" in "$LAYER"/*) [ ! -f "$SCRIPT_DIR/skills/$skill/SKILL.md" ] || echo "  PRIVATE skill '$skill' replaces the public one" ;; esac
  link "$skill_dir" "$CLAUDE_DIR/skills/$skill"
  link "$skill_dir" "$CODEX_DIR/skills/$skill"
done

# Runtime skills come from a published npm version (checkouts drifted: 2026-09-27 the laptop
# sat 316 commits behind). The installer checks the tarball, records each SKILL.md sha256 in the store's
# manifest.json and keeps the installed version offline. AGENT_RUNTIME_SKILLS_VERSION picks a version.
RUNTIME_SKILLS_HOME="$HOME/.local/share/runtime-skills"
# Not linked: Runtime skills with no run in 30 days (skill-run-log ledgers, 2026-10-07..11-06).
runtime_skill_skipped() { case " graph-designer loop-writer supervise codemode generate-eval " in *" $1 "*) return 0 ;; esac; return 1; }
RUNTIME_SKILLS_DIR=""
if runtime_release=$(python3 "$SCRIPT_DIR/install-runtime-skills.py" --store "$RUNTIME_SKILLS_HOME"); then
  RUNTIME_SKILLS_DIR="$RUNTIME_SKILLS_HOME/current/skills"
  echo "  Runtime skills: version $(python3 -c 'import json, sys; print(json.loads(sys.argv[1])["version"])' "$runtime_release")"
  for ext in "$RUNTIME_SKILLS_DIR"/*/; do
    [ -f "$ext/SKILL.md" ] || continue
    name="$(basename "$ext")"
    { [ -e "$SCRIPT_DIR/skills/$name" ] || runtime_skill_skipped "$name"; } && continue   # a local skill of the same name wins
    link "$ext" "$CLAUDE_DIR/skills/$name"
    link "$ext" "$CODEX_DIR/skills/$name"
  done
else
  echo "  WARN Runtime skills not installed; existing Runtime skill links are left in place"
fi

# Saved workflows (Claude-only): the Workflow tool resolves a name from ~/.claude/workflows/<name>.js.
if [ -d "$SCRIPT_DIR/workflows" ] && [ "$(ls -A "$SCRIPT_DIR/workflows" 2>/dev/null)" ]; then
  mkdir -p "$CLAUDE_DIR/workflows"
  for wf in "$SCRIPT_DIR/workflows"/*.js; do
    [ -f "$wf" ] || continue
    link "$wf" "$CLAUDE_DIR/workflows/$(basename "$wf")"
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

# Hooks: settings.json and the layer's overlay name them by their ~/.claude/hooks path.
mkdir -p "$CLAUDE_DIR/hooks"
for hook in "$SCRIPT_DIR/hooks"/* "$LAYER"/hooks/*; do
  [ -f "$hook" ] || continue
  link "$hook" "$CLAUDE_DIR/hooks/$(basename "$hook")"
done
# OpenCode loads ~/.config/opencode/plugins/*.js; each one adapts a Claude hook above.
mkdir -p "$OPENCODE_DIR/plugins"
for plugin in "$SCRIPT_DIR/opencode-plugins"/*.js; do
  link "$plugin" "$OPENCODE_DIR/plugins/$(basename "$plugin")"
done

# Tools (bin symlinks)
if [ -d "$SCRIPT_DIR/tools" ] && [ "$(ls -A "$SCRIPT_DIR/tools" 2>/dev/null)" ]; then
  mkdir -p "$HOME/bin"
  for tool in "$SCRIPT_DIR/tools"/* "$LAYER"/tools/*; do
    [ -f "$tool" ] || continue
    base="$(basename "$tool")"
    [[ "$base" == "README.md" ]] && continue
    # Git's file mode decides what is a tool: library modules stay 644.
    # A chmod here dirtied the installed checkout, and its deploy then refused every update.
    if [ ! -x "$tool" ]; then echo "  SKIP $tool (not executable in git: a module, not a tool)"; continue; fi
    link "$tool" "$HOME/bin/$base"
  done
fi

# Codex runs process_guard.py, which loads the layer's rule modules, and trusts it by the hash it reports.
# A changed file stays untrusted until the next review.
for codex_home in "$CODEX_DIR" "$HOME"/.config/agent-accounts/codex/*; do
  [ -d "$codex_home" ] && python3 "$SCRIPT_DIR/hooks/codex-trust-managed.py" "$codex_home" "$CLAUDE_DIR/hooks/process_guard.py"
done

# The home-sweep cron redirects into $HOME/attic/sweep.log. A missing directory makes
# the redirect fail before the script runs, so the sweep goes silently inert.
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
    "$HOME/code"
  ]
}
EOF
  echo "  CREATED $LOCAL_SETTINGS ($(uname -s), user: $(whoami))"
else
  echo "  SKIP $LOCAL_SETTINGS (exists)"
fi
python3 "$SCRIPT_DIR/tools/claude-trust.py" sanitize-local "$LOCAL_SETTINGS"

# Pi skills (subset — only skills that work in conversation, not coding)
PI_SKILLS_DIR="$HOME/.pi/agent/skills"
PI_SKILLS=(reflect hypothesize evolve)
if [ -d "$HOME/.pi/agent" ]; then
  mkdir -p "$PI_SKILLS_DIR"
  for skill in "${PI_SKILLS[@]}"; do
    for skill_dir in "$SCRIPT_DIR/skills/$skill" "$LAYER/skills/$skill"; do
      if [ -d "$skill_dir" ]; then link "$skill_dir" "$PI_SKILLS_DIR/$skill"; fi
    done
  done
  # Prune dead Pi skill symlinks
  find "$PI_SKILLS_DIR" -maxdepth 1 -type l ! -exec test -e {} \; -print 2>/dev/null | while read -r stale; do
    echo "  PRUNE $stale (dead Pi skill symlink)"
    rm "$stale"
  done
  pi_skill_count=$(find "$PI_SKILLS_DIR" -maxdepth 1 -type l 2>/dev/null | wc -l | tr -d ' ')
  echo "  Pi: ${pi_skill_count} skills synced"
fi

# Publish the sandbox profile from pinned source; authoring owns SDK validation.
PROFILE_DIR="$HOME/.config/agent-profiles"
mkdir -p "$PROFILE_DIR"
python3 "$SCRIPT_DIR/tools/emit-agent-profile.py" --out "$PROFILE_DIR/.profile.json.new"
mv "$PROFILE_DIR/.profile.json.new" "$PROFILE_DIR/$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["name"])' "$PROFILE_DIR/.profile.json.new").json"

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

skill_is_current() {
  local name="$1"
  [ -f "$SCRIPT_DIR/skills/$name/SKILL.md" ] || [ -f "$LAYER/skills/$name/SKILL.md" ] || \
    { [ -n "$RUNTIME_SKILLS_DIR" ] && [ -f "$RUNTIME_SKILLS_DIR/$name/SKILL.md" ] && ! runtime_skill_skipped "$name"; }
}

# A Runtime link into the store counts as managed only after an install succeeded, so an offline run never prunes one.
runtime_link_is_managed() {
  [ -n "$RUNTIME_SKILLS_DIR" ] || return 1
  case "$(readlink "$1")" in "$RUNTIME_SKILLS_HOME"/*) return 0 ;; esac
  return 1
}

skill_link_is_managed() {
  local link_path="$1"
  local common_dir origin
  common_dir=$(repository_common_dir "$link_path" || true)
  origin=$(repository_origin "$link_path" || true)
  { [ -n "$common_dir" ] && [ "$common_dir" = "$DOTFILES_COMMON_DIR" ]; } || \
    { [ -n "$origin" ] && [ "$origin" = "$DOTFILES_ORIGIN" ]; } || \
    runtime_link_is_managed "$link_path"
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

# Prune dead links: retired commands and Codex prompts, hooks, directive variants and OpenCode plugins.
for dir in "$CLAUDE_DIR/commands" "$CODEX_DIR/prompts" "$CLAUDE_DIR/hooks" "$CLAUDE_DIR/directives/variants" "$OPENCODE_DIR/plugins"; do
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
      "$SCRIPT_DIR/tools/"* | "$LAYER/tools/"*)
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
# Every plugin listed under `enabledPlugins` in the installed settings.json
# (ours, the layer's overlay and the machine's, merged above) needs its cache
# dir at ~/.claude/plugins/cache/<mp>/<name>/<v>.
# When a Mac is fresh / wiped / has had Claude Code clobber the cache,
# the Stop/precmd hook fires "Plugin directory does not exist" loops.
#
# Claude Code exposes `claude plugin install <name>@<marketplace>` as a
# headless command, so we drive it from here. Idempotent: `details`
# succeeds when a plugin is already installed at any version, so we
# only install the misses.
sync_plugins() {
  local settings="$CLAUDE_DIR/settings.json"
  [ -f "$settings" ] || return 0
  command -v claude >/dev/null 2>&1 || {
    echo "  SKIP plugin sync — claude CLI not on PATH"
    return 0
  }

  # Step 1: register every marketplace a plugin needs. Claude Code reads
  # `extraKnownMarketplaces` at startup but doesn't register them with the
  # plugin CLI; install fails until we tell it. The official marketplace is
  # not listed there, and a fresh box does not have it either, so a plugin
  # that names it adds it from its fixed repository.
  local wanted known name repo
  wanted=$(python3 - "$settings" <<'PY' 2>/dev/null || true
import json, sys
d = json.load(open(sys.argv[1]))
builtin = {"claude-plugins-official": "anthropics/claude-plugins-official"}
repos = {k: v.get("source", {}).get("repo") for k, v in d.get("extraKnownMarketplaces", {}).items()}
for key in d.get("enabledPlugins", {}):
    market = key.partition("@")[2]
    if market in builtin and market not in repos:
        repos[market] = builtin[market]
for name, repo in repos.items():
    if repo:
        print(name + "\t" + repo)
PY
)
  # The text listing decorates each name; the JSON listing does not.
  known=$(claude plugin marketplace list --json 2>/dev/null | python3 -c '
import json, sys
for m in json.load(sys.stdin):
    print(m.get("name", ""))
' 2>/dev/null || true)
  while IFS=$'\t' read -r name repo; do
    [ -z "$name" ] || [ -z "$repo" ] && continue
    if printf '%s\n' "$known" | grep -xF "$name" >/dev/null; then
      continue
    fi
    if claude plugin marketplace add "$repo" >/dev/null 2>&1; then
      echo "  ADD marketplace $name ($repo)"
    else
      echo "  WARN  marketplace add $name failed"
    fi
  done <<<"$wanted"

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

# fff-mcp: a pinned, checksummed release plus a user-scope MCP registration for Claude Code.
bash "$SCRIPT_DIR/install-fff-mcp.sh" || true

# Summary
skill_count=$(find "$SCRIPT_DIR/skills" -maxdepth 1 -type d ! -name skills ! -name '_*' | wc -l | tr -d ' ')
hook_count=$(find "$SCRIPT_DIR/hooks" -type f 2>/dev/null | wc -l | tr -d ' ')
tool_count=$(find "$SCRIPT_DIR/tools" -type f ! -name README.md 2>/dev/null | wc -l | tr -d ' ')

echo ""
echo "Done. ${skill_count} skills, ${hook_count} hooks, ${tool_count} tools installed."
