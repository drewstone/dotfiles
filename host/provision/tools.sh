# shellcheck shell=bash
# tools: base packages, the OpenSSH server with key-only login, Google Chrome,
# Tailscale, GitHub CLI and uv.

# hostlab (the VM lane in AGENTS.md) needs the qemu packages and /dev/kvm.
# iw reads the Wi-Fi driver's own state (iw dev <dev> link, iw dev <dev> get
# power_save) when the mt7925e drops off; NetworkManager does not show it.
# Ubuntu Desktop has no SSH server; agents reach the box over LAN ssh.
BASE_PACKAGES="curl ca-certificates git jq unzip xz-utils fontconfig tmux psmisc dconf-cli wl-clipboard iw python3-venv qemu-system-x86 qemu-utils cloud-image-utils openssh-server"
SSHD_KEYS_ONLY=/etc/ssh/sshd_config.d/10-dotfiles-keys-only.conf
SSHD_BIN="${SSHD_BIN:-/usr/sbin/sshd}"
SSHD_CONFIG="${SSHD_CONFIG:-/etc/ssh/sshd_config}"
SSHD_CONFIG_D="${SSHD_CONFIG_D:-/etc/ssh/sshd_config.d}"

linger_on() { [ -e "/var/lib/systemd/linger/$USER" ]; }
in_group() { id -nG "$USER" | tr ' ' '\n' | grep -x "$1" >/dev/null; }

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

# Ubuntu's own gh build is years behind GitHub's; GitHub's builds carry no
# "ubuntu" in their version.
gh_from_github() {
  pkg_installed gh && ! dpkg-query -W -f='${Version}' gh 2>/dev/null | grep -E 'ubuntu|build' >/dev/null
}

install_gh() { apt_update_once && apt_get install -y gh; }

# A drop-in that sshd cannot read would stop the next sshd start, so a failed
# test removes it again. sshd -t needs /run/sshd, which a socket-activated
# ssh.service creates only on the first connection.
install_sshd_keys_only() {
  root_install 0644 "$HOST_DIR/ssh/10-dotfiles-keys-only.conf" "$SSHD_KEYS_ONLY" || return 1
  if ! as_root install -d -m 0755 /run/sshd || ! quiet as_root sshd -t; then
    as_root rm -f "$SSHD_KEYS_ONLY"
    return 1
  fi
  as_root systemctl try-reload-or-restart ssh.service || return 1
  if ! sshd_keys_only_effective; then
    printf 'sshd still allows passwords, or the run cannot tell. sshd keeps the first value it reads; change these by hand:\n' >&2
    as_root "$SSHD_BIN" -G 2>&1 | grep -E '^(passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication) ' >&2
    sshd_unverified_lines >&2
    return 1
  fi
}

# sshd_unverified_lines: the lines that can turn password login back on, or
# key login off, where sshd -G does not look. sshd -G applies no Match block
# unless given one connection, so a Match block counts, for any user or
# address, when it sets either password key to anything but no, or
# PubkeyAuthentication to anything but yes (after quotes and case). An Include other than the drop-in directory can reach any
# file, so it counts too: the run vouches only for files it reads. It fails
# when a file cannot be read, so an unread file never counts as clean.
sshd_unverified_lines() {
  local f
  local -a files=("$SSHD_CONFIG")
  for f in "$SSHD_CONFIG_D"/*.conf; do [ -e "$f" ] && files+=("$f"); done
  # shellcheck disable=SC2016 # $1, $2 and $0 are awk fields
  as_root awk -F '[ \t=]+' -v dropins="$SSHD_CONFIG_D/*.conf" '
    FNR == 1 { match_block = 0 }
    { sub(/^[ \t]+/, ""); value = tolower($2); gsub(/"/, "", value) }
    tolower($1) == "include" && !(NF == 2 && value == tolower(dropins)) { print FILENAME ": " $0; next }
    tolower($1) == "match" { match_block = 1; next }
    match_block && tolower($1) ~ /^(passwordauthentication|kbdinteractiveauthentication)$/ && value != "no" { print FILENAME ": " $0 }
    match_block && tolower($1) == "pubkeyauthentication" && value != "yes" { print FILENAME ": " $0 }
  ' "${files[@]}"
}

# sshd_keys_only_effective: sshd's effective settings, not only the drop-in:
# an earlier drop-in can still allow passwords. sshd -G prints the global
# configuration without host keys or /run/sshd, and it runs as root because a
# drop-in can be root-only (cloud-init writes 50-cloud-init.conf with mode
# 600).
sshd_keys_only_effective() {
  local t u
  t="$(as_root "$SSHD_BIN" -G 2>/dev/null)" || return 1
  grep -qx 'passwordauthentication no' <<<"$t" && grep -qx 'kbdinteractiveauthentication no' <<<"$t" &&
    grep -qx 'pubkeyauthentication yes' <<<"$t" || return 1
  u="$(sshd_unverified_lines 2>/dev/null)" || return 1
  [ -z "$u" ]
}

sshd_keys_only() {
  root_file_is 0644 "$HOST_DIR/ssh/10-dotfiles-keys-only.conf" "$SSHD_KEYS_ONLY" && sshd_keys_only_effective
}

# key_path_ok PATH: owned by the user or root and writable by neither group
# nor others. sshd's StrictModes ignores authorized_keys otherwise, and it
# checks the file, ~/.ssh and the home directory.
key_path_ok() {
  [ -n "$(find "$1" -maxdepth 0 \( -user "$USER" -o -user root \) ! -perm -020 ! -perm -002 2>/dev/null)" ]
}

# ssh_key_authorized: an active key line that sshd will read; a commented-out
# key, or one behind a path that StrictModes rejects, does not count.
ssh_key_authorized() {
  key_path_ok "$HOME" && key_path_ok "$HOME/.ssh" && key_path_ok "$HOME/.ssh/authorized_keys" || return 1
  grep -vE '^[[:space:]]*#' "$HOME/.ssh/authorized_keys" 2>/dev/null |
    grep -E '(^|[[:space:]])(ssh-|ecdsa-|sk-)[^[:space:]]+[[:space:]]+AAAA' >/dev/null
}

# uv's installer edits shell profiles unless told not to; the shell module
# already puts ~/.local/bin on PATH.
install_uv() {
  fetch https://astral.sh/uv/install.sh "$WORK/uv-install.sh" &&
    env UV_NO_MODIFY_PATH=1 sh "$WORK/uv-install.sh" >/dev/null 2>&1
}

module_tools() {
  section "tools: base packages, OpenSSH (keys only), Google Chrome, Tailscale, GitHub CLI, uv"
  # shellcheck disable=SC2086 # the list splits on purpose
  want_pkgs $BASE_PACKAGES
  ensure "ssh accepts keys only ($SSHD_KEYS_ONLY, effective in sshd -G)" sshd_keys_only -- install_sshd_keys_only
  if ! ssh_key_authorized; then
    manual_after_signin "ssh accepts keys only, and no usable key is authorized for $USER yet (an active line in ~/.ssh/authorized_keys; the file, ~/.ssh and the home directory writable only by $USER). From the Mac, after the tailnet join (Tailscale SSH carries the copy):" \
      "ssh-copy-id $USER@$(hostname -s | tr '[:upper:]' '[:lower:]')"
  fi
  ensure "user services run without a login (linger)" linger_on -- as_root loginctl enable-linger "$USER"
  ensure "$USER may use /dev/kvm (group kvm; applies at next login)" in_group kvm -- as_root usermod -aG kvm "$USER"
  ensure "package google-chrome-stable" pkg_installed google-chrome-stable -- install_chrome
  ensure "Tailscale apt source" tailscale_source_ok -- add_tailscale_source
  want_pkgs tailscale
  ensure "GitHub CLI apt source" gh_source_ok -- add_gh_source
  ensure "gh from GitHub's apt source" gh_from_github -- install_gh
  ensure "uv in ~/.local/bin" test -x "$HOME/.local/bin/uv" -- install_uv
}
