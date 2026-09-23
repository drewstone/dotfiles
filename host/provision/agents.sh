# shellcheck shell=bash
# agents: the Claude Code and Codex CLIs, rtk (the Claude hooks call it), then
# claude/install.sh with ~/.local/bin on PATH so its plugin sync finds claude.

RTK_VERSION=0.30.1
CLAUDE_TRUST_DIRS="${CLAUDE_TRUST_DIRS:-$HOME/code $HOME/company /tmp}"

claude_ok() { [ -x "$HOME/.local/bin/claude" ]; }
codex_ok() { [ -x "$HOME/.local/bin/codex" ]; }

install_claude() {
  fetch https://claude.ai/install.sh "$WORK/claude-install.sh" && quiet bash "$WORK/claude-install.sh"
}

install_codex() {
  fetch https://chatgpt.com/codex/install.sh "$WORK/codex-install.sh" &&
    quiet env CODEX_NON_INTERACTIVE=1 sh "$WORK/codex-install.sh"
}

rtk_ok() {
  [ -x "$HOME/.local/bin/rtk" ] && [ "$("$HOME/.local/bin/rtk" --version 2>/dev/null)" = "rtk $RTK_VERSION" ]
}

# rtk is pinned: the hook tests in this repository run against this version.
install_rtk() {
  local base="https://github.com/rtk-ai/rtk/releases/download/v$RTK_VERSION"
  local asset=rtk-x86_64-unknown-linux-musl.tar.gz want
  fetch "$base/$asset" "$WORK/$asset" && fetch "$base/checksums.txt" "$WORK/rtk-checksums.txt" || return 1
  want="$(awk -v a="$asset" '$2 == a || $2 == "*" a { print $1 }' "$WORK/rtk-checksums.txt")"
  if [ -z "$want" ] || ! sha256_ok "$WORK/$asset" "$want"; then
    printf '%s does not match the release checksum\n' "$asset" >&2
    return 1
  fi
  mkdir -p "$WORK/rtk" && tar -xzf "$WORK/$asset" -C "$WORK/rtk" &&
    install -D -m 0755 "$(find "$WORK/rtk" -type f -name rtk | head -1)" "$HOME/.local/bin/rtk"
}

# claude_links_current: every shared file claude/install.sh links points into
# this checkout.
claude_links_current() {
  local c="$DOTFILES/claude" f name
  link_is "$c/CLAUDE.md" "$HOME/.claude/CLAUDE.md" &&
    link_is "$c/settings.json" "$HOME/.claude/settings.json" &&
    link_is "$c/AGENTS.md" "$HOME/.claude/AGENTS.md" &&
    link_is "$c/AGENTS.md" "$HOME/.codex/AGENTS.md" || return 1
  for f in "$c"/skills/*/SKILL.md; do
    name="$(basename "$(dirname "$f")")"
    link_is "$c/skills/$name/" "$HOME/.claude/skills/$name" || return 1
  done
  for f in "$c"/hooks/*; do
    [ -f "$f" ] || continue
    link_is "$f" "$HOME/.claude/hooks/$(basename "$f")" || return 1
  done
  for f in "$c"/tools/*; do
    [ -f "$f" ] && [ "$(basename "$f")" != README.md ] || continue
    link_is "$f" "$HOME/bin/$(basename "$f")" || return 1
  done
}

run_claude_install() {
  quiet bash "$DOTFILES/claude/install.sh"
}

# claude_plugins_missing: print each enabledPlugins key whose cache directory
# (~/.claude/plugins/cache/<marketplace>/<name>) is absent.
claude_plugins_missing() {
  python3 - "$DOTFILES/claude/settings.json" "$HOME/.claude/plugins/cache" <<'PY'
import json, os, sys
for key in json.load(open(sys.argv[1])).get("enabledPlugins", {}):
    name, _, market = key.partition("@")
    if market and not os.path.isdir(os.path.join(sys.argv[2], market, name)):
        print(key)
PY
}

signed_in() { gh auth status >/dev/null 2>&1 && "$HOME/.local/bin/claude" auth status >/dev/null 2>&1; }

claude_plugins_complete() { [ -z "$(claude_plugins_missing)" ]; }

# Private marketplaces need GitHub access, so before the sign-ins a missing
# plugin is a step for a person, not drift.
claude_plugins() {
  if claude_plugins_complete || signed_in; then
    ensure "Claude plugins in settings.json" claude_plugins_complete -- run_claude_install
    return 0
  fi
  manual "Claude plugins wait for the GitHub and Claude sign-ins ($(claude_plugins_missing | tr '\n' ' ')). After them, run:" \
    "$DOTFILES/claude/install.sh"
}

codex_fallback_ok() {
  grep -Eq '^project_doc_fallback_filenames *=.*"CLAUDE\.md"' "$HOME/.codex/config.toml" 2>/dev/null
}

# A top-level TOML key must come before the first [table], so prepend it.
add_codex_fallback() {
  local cfg="$HOME/.codex/config.toml"
  if grep -Eq '^project_doc_fallback_filenames *=' "$cfg" 2>/dev/null; then
    printf 'project_doc_fallback_filenames in %s has no "CLAUDE.md"; add it to that list by hand\n' "$cfg" >&2
    return 1
  fi
  mkdir -p "$HOME/.codex" && touch "$cfg" &&
    { printf 'project_doc_fallback_filenames = ["CLAUDE.md"]\n'; cat "$cfg"; } >"$cfg.new" &&
    mv "$cfg.new" "$cfg"
}

claude_running() { pgrep -u "$USER" -f '(^|/)claude( |$)' >/dev/null 2>&1; }

claude_trust_ok() {
  [ -f "$HOME/.claude.json" ] || return 1
  # shellcheck disable=SC2086 # one argument per directory
  python3 - "$HOME/.claude.json" $CLAUDE_TRUST_DIRS <<'PY'
import json, sys
projects = json.load(open(sys.argv[1])).get("projects", {})
sys.exit(0 if all(projects.get(d, {}).get("hasTrustDialogAccepted") for d in sys.argv[2:]) else 1)
PY
}

# Claude rewrites ~/.claude.json while it runs, so an edit races a live
# session. Change it only when no claude process runs.
add_claude_trust() {
  if claude_running; then
    printf 'a claude process is running; stop it and re-run, or accept the trust prompt in each folder\n' >&2
    return 1
  fi
  # shellcheck disable=SC2086
  python3 - "$HOME/.claude.json" $CLAUDE_TRUST_DIRS <<'PY'
import json, os, sys
path = sys.argv[1]
data = json.load(open(path))
projects = data.setdefault("projects", {})
for d in sys.argv[2:]:
    projects.setdefault(d, {})["hasTrustDialogAccepted"] = True
tmp = path + ".provision-tmp"
with open(tmp, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
os.chmod(tmp, os.stat(path).st_mode & 0o777)
os.replace(tmp, path)
PY
}

module_agents() {
  section "agents: Claude Code, Codex, rtk, claude/install.sh"
  ensure "Claude Code native install in ~/.local/bin" claude_ok -- install_claude
  ensure "Codex standalone install in ~/.local/bin" codex_ok -- install_codex
  ensure "rtk $RTK_VERSION in ~/.local/bin" rtk_ok -- install_rtk
  ensure "claude/install.sh links (instructions, settings, skills, hooks, tools)" claude_links_current -- run_claude_install
  claude_plugins
  ensure "Codex reads CLAUDE.md when a folder has no AGENTS.md" codex_fallback_ok -- add_codex_fallback
  if [ -f "$HOME/.claude.json" ]; then
    ensure "Claude trusts $CLAUDE_TRUST_DIRS" claude_trust_ok -- add_claude_trust
  else
    skip "$HOME/.claude.json appears after the first claude run; re-run this module after sign-in to trust $CLAUDE_TRUST_DIRS"
  fi
}
