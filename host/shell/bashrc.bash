# shellcheck shell=bash
# Managed by ~/dotfiles (host/provision.sh shell module).
# Linked to ~/.config/bash/dotfiles.bash and sourced from the end of ~/.bashrc.

case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) PATH="$HOME/.local/bin:$PATH" ;;
esac

# Heavy agent gates (pnpm install, turbo, vitest, tsc, typecheck, test) run through gate-run, capped and queued
# so they never starve the host (host/gates). The shims come first; the real tools stay where they are.
if [ -d "$HOME/.local/share/gate-run/shims" ]; then
  case ":$PATH:" in
    *":$HOME/.local/share/gate-run/shims:"*) ;;
    *) PATH="$HOME/.local/share/gate-run/shims:$PATH" ;;
  esac
fi

# Powerline glyphs and truecolor need a terminal emulator. The Linux text
# console (TERM=linux) has neither, so it keeps the plain prompt. A ~/.bashrc
# that already runs starship init (drew-gtr-pro's did) is left alone.
if [ "$TERM" != linux ] && command -v starship >/dev/null 2>&1 && ! declare -F starship_precmd >/dev/null; then
  export COLORTERM=truecolor
  eval "$(starship init bash)"
fi
