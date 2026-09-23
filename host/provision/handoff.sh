# shellcheck shell=bash
# handoff: the steps only a person can do, as exact commands. Each step shows
# only while the box still needs it. This module signs in to nothing.

SECRETS_KEYS="$HOME/company/devops/secrets/.env.keys"

# readme_section FILE HEADING: print the "## HEADING" section of a README.
readme_section() {
  awk -v h="## $2" '
    $0 == h { on = 1; next }
    on && /^## / { exit }
    on { print }
  ' "$1" 2>/dev/null
}

print_tt_section() {
  local file="$TT_DIR/$1" body
  body="$(readme_section "$file" "$2")"
  if [ -z "$body" ]; then
    printf '    (%s has no "## %s" section; read the file)\n' "$file" "$2"
    return 0
  fi
  printf '\n    ---- %s, "%s" ----\n' "${file#"$HOME"/}" "$2"
  printf '%s\n' "$body" | sed 's/^/    /'
}

mode_600() { [ "$(stat -c %a "$1")" = 600 ]; }

module_handoff() {
  section "handoff: sign-ins and other steps for a person"

  if ! gh auth status >/dev/null 2>&1; then
    manual "Sign in the GitHub CLI as drewstone (a browser or device code):" \
      "gh auth login --hostname github.com --git-protocol https --web" \
      "gh auth setup-git"
  fi
  if ! github_ssh_ok; then
    # shellcheck disable=SC2016 # the person's shell expands these
    manual "GitHub does not accept an SSH key from this box yet:" \
      '[ -f ~/.ssh/id_ed25519 ] || ssh-keygen -t ed25519 -C "$USER@$(hostname -s)" -f ~/.ssh/id_ed25519' \
      'gh auth refresh --hostname github.com --scopes admin:public_key' \
      'gh ssh-key add ~/.ssh/id_ed25519.pub --title "$(hostname -s)"'
  fi
  if command -v tailscale >/dev/null 2>&1 && ! tailscale status >/dev/null 2>&1; then
    manual "Join the tailnet (a browser sign-in; the box then answers as \$(hostname -s) over MagicDNS):" \
      "sudo tailscale up --ssh --operator=$USER"
  fi
  # Credential files, not the CLIs: a status call can refresh a token, and
  # --check must not change anything.
  if [ -x "$HOME/.local/bin/claude" ] && [ ! -s "$HOME/.claude/.credentials.json" ]; then
    manual "Sign in Claude Code for interactive use (fleet agents use acct tokens instead):" \
      "claude auth login"
  fi
  if [ -x "$HOME/.local/bin/codex" ] && [ ! -s "$HOME/.codex/auth.json" ]; then
    manual "Sign in Codex (device code; open the URL on any machine):" \
      "codex login --device-auth"
  fi
  if [ -d "$HOME/company/devops" ] && [ ! -e "$SECRETS_KEYS" ]; then
    manual "Copy the dotenvx keys from a configured box (never commit them):" \
      "scp drew-gtr-pro:company/devops/secrets/.env.keys $SECRETS_KEYS && chmod 600 $SECRETS_KEYS"
  fi
  local keys
  for keys in "$SECRETS_KEYS" "$HOME/.env.keys"; do
    [ -e "$keys" ] || continue
    ensure "$keys readable only by $USER" mode_600 "$keys" -- chmod 600 "$keys"
  done
  if ! grep -qs '^export AGENT_BUS_PEER=' "$HOME/.bashrc"; then
    manual "Give this box its own agent-bus name (gtr is taken):" \
      "echo 'export AGENT_BUS_PEER=$(hostname -s | tr '[:upper:]' '[:lower:]')' >> ~/.bashrc"
  fi
  if [ -d "$HOME/code/cli-bridge" ] && ! grep -qs '^CLI_BRIDGE_SCOPE_MEMORY_MAX=' "$HOME/code/cli-bridge/.env"; then
    manual "cli-bridge's 3G scope default kills Kimi and Python review lanes; raise it until the cli-bridge repo does:" \
      "echo CLI_BRIDGE_SCOPE_MEMORY_MAX=8G >> ~/code/cli-bridge/.env"
  fi

  if [ -d "$TT_DIR" ]; then
    manual "Sign in the agent accounts and set up the fleet with the tangle-tools steps printed below, from:" \
      "$TT_DIR/agent-accounts/README.md" "$TT_DIR/fleet/README.md" "$TT_DIR/chatgpt-fleet/README.md"
    print_tt_section agent-accounts/README.md "Provision a machine"
    print_tt_section fleet/README.md "Install on a machine"
    print_tt_section chatgpt-fleet/README.md "Set up a machine"
  fi
}
