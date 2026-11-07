# shellcheck shell=bash
# handoff: the steps only a person can do, as exact commands. Each step shows
# only while the box still needs it. This module signs in to nothing.

module_handoff() {
  section "handoff: sign-ins and other steps for a person"

  if ! gh auth status >/dev/null 2>&1; then
    manual "Sign in the GitHub CLI (a browser or device code):" \
      "gh auth login --hostname github.com --git-protocol https --web" \
      "gh auth setup-git"
  fi
  # Credential files, not the CLIs: a status call can refresh a token, and
  # --check must not change anything.
  if [ -x "$HOME/.local/bin/claude" ] && [ ! -s "$HOME/.claude/.credentials.json" ]; then
    manual "Sign in Claude Code for interactive use:" \
      "claude auth login"
  fi
  if [ -x "$HOME/.local/bin/codex" ] && [ ! -s "$HOME/.codex/auth.json" ]; then
    manual "Sign in Codex (device code; open the URL on any machine):" \
      "codex login --device-auth"
  fi
}
