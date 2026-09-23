# shellcheck shell=bash
# shell: starship prompt with the catppuccin-powerline preset in bash. A
# managed drop-in keeps it off the Linux text console.

STARSHIP_VERSION=1.26.0
STARSHIP="$HOME/.local/bin/starship"
STARSHIP_TOML="$HOME/.config/starship.toml"
BASH_DROPIN="$HOME/.config/bash/dotfiles.bash"
# shellcheck disable=SC2016 # expands when ~/.bashrc runs, not here
BASHRC_LINE='[ -r "$HOME/.config/bash/dotfiles.bash" ] && . "$HOME/.config/bash/dotfiles.bash"  # dotfiles host/provision.sh'

starship_ok() {
  [ -x "$STARSHIP" ] && [ "$("$STARSHIP" --version 2>/dev/null | head -1)" = "starship $STARSHIP_VERSION" ]
}

install_starship() {
  local base="https://github.com/starship/starship/releases/download/v$STARSHIP_VERSION"
  local asset=starship-x86_64-unknown-linux-musl.tar.gz
  fetch "$base/$asset" "$WORK/$asset" && fetch "$base/$asset.sha256" "$WORK/$asset.sha256" || return 1
  if ! sha256_ok "$WORK/$asset" "$(tr -d ' \n' <"$WORK/$asset.sha256")"; then
    printf '%s does not match the release checksum\n' "$asset" >&2
    return 1
  fi
  tar -xzf "$WORK/$asset" -C "$WORK" starship && install -D -m 0755 "$WORK/starship" "$STARSHIP"
}

preset_ok() {
  [ -f "$STARSHIP_TOML" ] && "$STARSHIP" preset catppuccin-powerline 2>/dev/null | cmp -s - "$STARSHIP_TOML"
}

write_preset() {
  mkdir -p "$(dirname "$STARSHIP_TOML")" || return 1
  if [ -e "$STARSHIP_TOML" ]; then
    mv "$STARSHIP_TOML" "$STARSHIP_TOML.pre-dotfiles.$(date +%Y%m%d%H%M%S)" || return 1
  fi
  "$STARSHIP" preset catppuccin-powerline -o "$STARSHIP_TOML"
}

bashrc_sources_dropin() { grep -qxF "$BASHRC_LINE" "$HOME/.bashrc" 2>/dev/null; }
add_bashrc_line() { printf '\n%s\n' "$BASHRC_LINE" >>"$HOME/.bashrc"; }

module_shell() {
  section "shell: starship $STARSHIP_VERSION, catppuccin-powerline, bash drop-in"
  ensure "starship $STARSHIP_VERSION in ~/.local/bin" starship_ok -- install_starship
  ensure "$STARSHIP_TOML is the catppuccin-powerline preset" preset_ok -- write_preset
  want_link "$HOST_DIR/shell/bashrc.bash" "$BASH_DROPIN"
  ensure "$HOME/.bashrc sources $BASH_DROPIN" bashrc_sources_dropin -- add_bashrc_line
}
