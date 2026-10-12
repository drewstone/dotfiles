#!/usr/bin/env bash
# Install the pinned fff-mcp release and register it as a user-scope MCP server for Claude Code.
#
# fff-mcp keeps an in-memory index of the working tree, so repeated grep and file-name searches
# in one session skip the per-call directory walk that ripgrep repeats. The release asset's
# sha256 is pinned below; the installer never runs a remote script and never accepts a binary
# whose digest differs. Bump the pin by copying the digests from the release's .sha256 assets
# for the new tag and re-running the check below.
#
# macOS runs the same script: it installs the apple-darwin asset for the machine's architecture
# to ~/.local/share/fff-mcp/<tag>/fff-mcp and registers that path. Homebrew's fff-mcp formula
# tracks the latest release instead of a pin, so the pinned binary is the supported path.
#
# usage: install-fff-mcp.sh [--check]
#   --check   print the target asset and pinned digest, install nothing
# environment: FFF_MCP_SKIP=1 skips the install; FFF_MCP_HOME moves the store
#   (default ~/.local/share/fff-mcp).
# Exit status is 0 when the server is installed and registered or when the step is skipped
# (no claude CLI, unsupported platform, download failure): a failed optional tool must not
# fail the whole installer.

set -uo pipefail

TAG="v0.11.0"
COMMIT="95fd777c2529fc7b4d7572dabff64cc07268f2c5"
RELEASE_URL="https://github.com/dmtrKovalenko/fff/releases/download/$TAG"
STORE="${FFF_MCP_HOME:-$HOME/.local/share/fff-mcp}"
NAME="fff"

# Digests from the release's fff-mcp-<target>.sha256 assets at $TAG.
digest_for() {
  case "$1" in
    x86_64-unknown-linux-musl)  echo d1e8671f40c89c445aaa1728a21ec04b74be2e5f99091485caeabcc97f99aceb ;;
    aarch64-unknown-linux-musl) echo 35f8e05d6c865266bf451d13bfa5e1b0d98438fda7dc1c9bdbc1c6a83484577d ;;
    aarch64-apple-darwin)       echo cc606d9418cfa7764376dcd7b32a33e6459a6cb9a4718be366b024dca6e9fead ;;
    x86_64-apple-darwin)        echo 33377a8f96442ebc8b06d3bd2863cf66a520f97a33700e0fb85a09dd7988e862 ;;
    *) return 1 ;;
  esac
}

# Linux uses the static musl build: no glibc floor, so one asset serves every distribution
# and the Nix-profile boxes.
target() {
  local os arch
  os="$(uname -s)"; arch="$(uname -m)"
  case "$arch" in arm64) arch=aarch64 ;; amd64) arch=x86_64 ;; esac
  case "$os" in
    Linux)  echo "$arch-unknown-linux-musl" ;;
    Darwin) echo "$arch-apple-darwin" ;;
    *) return 1 ;;
  esac
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

say() { echo "  fff-mcp: $*"; }

[ "${FFF_MCP_SKIP:-}" = 1 ] && { say "skipped (FFF_MCP_SKIP=1)"; exit 0; }

TARGET="$(target)" && WANT="$(digest_for "$TARGET")" || { say "no pinned release for $(uname -s) $(uname -m); skipped"; exit 0; }

if [ "${1:-}" = "--check" ]; then
  echo "$TAG ($COMMIT) fff-mcp-$TARGET $WANT"
  exit 0
fi

BIN="$STORE/$TAG/fff-mcp"
if [ -x "$BIN" ] && [ "$(sha256_of "$BIN")" = "$WANT" ]; then
  say "$TAG already installed"
else
  tmp="$(mktemp -d)" || { say "no temporary directory; skipped"; exit 0; }
  trap 'rm -rf "$tmp"' EXIT
  if ! curl -fsSL --retry 2 --max-time 120 -o "$tmp/fff-mcp" "$RELEASE_URL/fff-mcp-$TARGET"; then
    say "WARN download of $TAG failed; not installed"
    exit 0
  fi
  got="$(sha256_of "$tmp/fff-mcp")"
  if [ "$got" != "$WANT" ]; then
    say "WARN digest mismatch for fff-mcp-$TARGET (got $got, pinned $WANT); not installed"
    exit 0
  fi
  chmod +x "$tmp/fff-mcp"
  mkdir -p "$STORE/$TAG" && mv "$tmp/fff-mcp" "$BIN" || { say "WARN could not write $STORE/$TAG; not installed"; exit 0; }
  say "installed $TAG ($TARGET, sha256 $WANT)"
fi

command -v claude >/dev/null 2>&1 || { say "claude CLI not on PATH; server not registered"; exit 0; }

# --no-update-check: the server otherwise asks GitHub for a newer release at startup and
# prints a curl-pipe-shell upgrade hint into the session.
current="$(claude mcp get "$NAME" 2>/dev/null || true)"
if printf '%s\n' "$current" | grep -qF -- "Command: $BIN" && printf '%s\n' "$current" | grep -qF -- "Args: --no-update-check"; then
  say "registered for Claude Code"
else
  claude mcp remove --scope user "$NAME" >/dev/null 2>&1 || true
  if claude mcp add --scope user "$NAME" -- "$BIN" --no-update-check >/dev/null 2>&1; then
    say "registered for Claude Code ($BIN)"
  else
    say "WARN 'claude mcp add' failed; run it by hand: claude mcp add --scope user $NAME -- $BIN --no-update-check"
  fi
fi
exit 0
