# shellcheck shell=bash
# tools: base packages, Google Chrome, Tailscale, GitHub CLI and uv.

# hostlab (the VM lane in AGENTS.md) needs the qemu packages and /dev/kvm.
BASE_PACKAGES="curl ca-certificates git jq unzip xz-utils fontconfig tmux psmisc dconf-cli wl-clipboard iw python3-venv qemu-system-x86 qemu-utils cloud-image-utils"

linger_on() { [ -e "/var/lib/systemd/linger/$USER" ]; }
in_group() { id -nG "$USER" | tr ' ' '\n' | grep -qx "$1"; }

install_chrome() {
  local deb="$WORK/google-chrome-stable_current_amd64.deb"
  fetch https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb "$deb" || return 1
  chmod 0644 "$deb"
  apt_update_once || return 1
  # The package adds Google's apt source, so apt upgrades Chrome from then on.
  apt_get install -y "$deb"
}

# shellcheck source=/dev/null
codename() { . /etc/os-release && printf '%s\n' "$VERSION_CODENAME"; }

tailscale_source_ok() {
  [ -s /usr/share/keyrings/tailscale-archive-keyring.gpg ] &&
    grep -qs 'pkgs.tailscale.com' /etc/apt/sources.list.d/tailscale.list
}

add_tailscale_source() {
  local base
  base="https://pkgs.tailscale.com/stable/ubuntu/$(codename)"
  fetch "$base.noarmor.gpg" "$WORK/tailscale.gpg" &&
    fetch "$base.tailscale-keyring.list" "$WORK/tailscale.list" &&
    root_install 0644 "$WORK/tailscale.gpg" /usr/share/keyrings/tailscale-archive-keyring.gpg &&
    root_install 0644 "$WORK/tailscale.list" /etc/apt/sources.list.d/tailscale.list &&
    apt_source_added
}

gh_source_ok() {
  [ -s /etc/apt/keyrings/githubcli-archive-keyring.gpg ] &&
    grep -qs 'cli.github.com/packages' /etc/apt/sources.list.d/github-cli.list
}

add_gh_source() {
  fetch https://cli.github.com/packages/githubcli-archive-keyring.gpg "$WORK/gh.gpg" || return 1
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main\n' \
    "$(dpkg --print-architecture)" >"$WORK/github-cli.list"
  root_install 0644 "$WORK/gh.gpg" /etc/apt/keyrings/githubcli-archive-keyring.gpg &&
    root_install 0644 "$WORK/github-cli.list" /etc/apt/sources.list.d/github-cli.list &&
    apt_source_added
}

# uv's installer edits shell profiles unless told not to; the shell module
# already puts ~/.local/bin on PATH.
install_uv() {
  fetch https://astral.sh/uv/install.sh "$WORK/uv-install.sh" &&
    env UV_NO_MODIFY_PATH=1 sh "$WORK/uv-install.sh" >/dev/null 2>&1
}

module_tools() {
  section "tools: base packages, Google Chrome, Tailscale, GitHub CLI, uv"
  # shellcheck disable=SC2086 # the list splits on purpose
  want_pkgs $BASE_PACKAGES
  ensure "user services run without a login (linger)" linger_on -- as_root loginctl enable-linger "$USER"
  ensure "$USER may use /dev/kvm (group kvm; applies at next login)" in_group kvm -- as_root usermod -aG kvm "$USER"
  ensure "package google-chrome-stable" pkg_installed google-chrome-stable -- install_chrome
  ensure "Tailscale apt source" tailscale_source_ok -- add_tailscale_source
  want_pkgs tailscale
  ensure "GitHub CLI apt source" gh_source_ok -- add_gh_source
  want_pkgs gh
  ensure "uv in ~/.local/bin" test -x "$HOME/.local/bin/uv" -- install_uv
}
