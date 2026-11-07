# shellcheck shell=bash
# tmux: ~/.tmux.conf links to tmux/tmux.conf, every listed plugin is cloned,
# and tmux-heal watches the server. A running server is never reloaded here.

tmux_plugins_present() {
  local spec repo
  while read -r spec; do
    repo="${spec%%#*}"
    [ -d "$HOME/.tmux/plugins/$(basename "$repo")" ] || return 1
  done < <(sed -n "s/^set -g @plugin '\([^']*\)'.*/\1/p" "$DOTFILES/tmux/tmux.conf")
}

tmux_conf_current() {
  link_is "$DOTFILES/tmux/tmux.conf" "$HOME/.tmux.conf" && tmux_plugins_present
}

tmux_heal_current() {
  user_bus || true
  cmp -s "$DOTFILES/tmux/tmux-heal" "$HOME/.local/bin/tmux-heal" &&
    systemctl --user is-enabled --quiet tmux-heal.service 2>/dev/null &&
    systemctl --user is-active --quiet tmux-heal.service 2>/dev/null
}

install_tmux_conf() {
  indent bash "$DOTFILES/tmux/install.sh" --force --no-reload || return 1
  if tmux list-sessions >/dev/null 2>&1; then
    manual "The running tmux server keeps its old settings. Reload it when no agent depends on window numbers (base-index is 1):" \
      "tmux source-file ~/.tmux.conf"
  fi
}

install_tmux_heal() {
  user_bus || true
  indent bash "$DOTFILES/tmux/install-heal.sh"
}

module_tmux() {
  section "tmux: dotfiles tmux.conf, plugins, tmux-heal"
  ensure "$HOME/.tmux.conf -> $DOTFILES/tmux/tmux.conf with every plugin" tmux_conf_current -- install_tmux_conf
  ensure "tmux-heal watcher installed and running" tmux_heal_current -- install_tmux_heal
}
