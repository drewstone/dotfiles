# shellcheck shell=bash
# Managed by ~/dotfiles (host/provision.sh shell module).
# Linked to ~/.config/bash/dotfiles.bash and sourced from the end of ~/.bashrc.

case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) PATH="$HOME/.local/bin:$PATH" ;;
esac

# Powerline glyphs and truecolor need a terminal emulator. The Linux text
# console (TERM=linux) has neither, so it keeps the plain prompt.
if [ "$TERM" != linux ] && command -v starship >/dev/null 2>&1; then
  export COLORTERM=truecolor
  eval "$(starship init bash)"
fi
