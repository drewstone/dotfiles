# shellcheck shell=bash
# tools: base packages, the OpenSSH server (key-only login, off the LAN), Google Chrome,
# Tailscale, GitHub CLI and uv.

# hostlab (the VM lane in AGENTS.md) needs the qemu packages and /dev/kvm.
# iw reads the Wi-Fi driver's own state (iw dev <dev> link, iw dev <dev> get
# power_save) when the mt7925e drops off; NetworkManager does not show it.
# Ubuntu Desktop has no SSH server. Agents reach the box over Tailscale SSH;
# OpenSSH is the key-only way in on loopback and the tailnet, never the LAN.
BASE_PACKAGES="curl ca-certificates git jq unzip xz-utils fontconfig tmux psmisc dconf-cli wl-clipboard iw python3-venv qemu-system-x86 qemu-utils cloud-image-utils openssh-server"
SSHD_KEYS_ONLY=/etc/ssh/sshd_config.d/10-dotfiles-keys-only.conf
SSHD_BIN="${SSHD_BIN:-/usr/sbin/sshd}"
SSHD_CONFIG="${SSHD_CONFIG:-/etc/ssh/sshd_config}"
SSHD_CONFIG_D="${SSHD_CONFIG_D:-/etc/ssh/sshd_config.d}"
SSHD_LISTEN="$SSHD_CONFIG_D/10-dotfiles-listen.conf"
# Tailscale SSH claims port 22 on the tailnet address, so OpenSSH is reachable
# there only on 2200: the way in when Tailscale SSH itself fails.
SSHD_PORTS="22 2200"

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
# PubkeyAuthentication to anything but yes (after quotes and case). An Include
# inside Match keeps that context in included files, so it always counts as
# unverified. Other Includes count unless they name the checked drop-in directory.
# The run vouches only for files it reads. It fails
# when a file cannot be read, so an unread file never counts as clean.
sshd_unverified_lines() {
  local f
  local -a files=("$SSHD_CONFIG")
  for f in "$SSHD_CONFIG_D"/*.conf; do [ -e "$f" ] && files+=("$f"); done
  # shellcheck disable=SC2016 # $1, $2 and $0 are awk fields
  as_root awk -F '[ \t=]+' -v dropins="$SSHD_CONFIG_D/*.conf" '
    FNR == 1 { match_block = 0 }
    { sub(/^[ \t]+/, ""); value = tolower($2); gsub(/"/, "", value) }
    tolower($1) == "include" { if (match_block || !(NF == 2 && value == tolower(dropins))) print FILENAME ": " $0; next }
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

# tailnet_addrs: this box's tailnet addresses, one per line. It prints nothing
# before the tailnet join or while tailscaled is down.
tailnet_addrs() {
  command -v tailscale >/dev/null 2>&1 || return 0
  { tailscale ip -4 2>/dev/null; tailscale ip -6 2>/dev/null; } | grep -E '^[0-9A-Fa-f:.]+$' || true
}

# sshd_listen_text ADDR...: the drop-in for these tailnet addresses.
sshd_listen_text() {
  printf '%s\n' \
    '# Installed by ~/dotfiles/host/provision.sh (tools module).' \
    "# OpenSSH answers only on loopback and this box's tailnet addresses, never" \
    '# on the LAN. Tailscale SSH claims port 22 on the tailnet address, so 2200' \
    '# is the key-only way in when Tailscale SSH itself fails. ssh.socket binds' \
    '# these with FreeBind, so the tailnet address can appear after boot.'
  # shellcheck disable=SC2086 # the list splits on purpose
  printf 'Port %s\n' $SSHD_PORTS
  printf 'ListenAddress %s\n' 127.0.0.1 ::1 "$@"
}

# sshd_listen_want ADDR...: every address:port pair, as sshd -G and ss print it.
sshd_listen_want() {
  local a p
  for a in 127.0.0.1 ::1 "$@"; do
    for p in $SSHD_PORTS; do
      case "$a" in
        *:*) printf '[%s]:%s\n' "$a" "$p" ;;
        *) printf '%s:%s\n' "$a" "$p" ;;
      esac
    done
  done | sort
}

# sshd_foreign_listen_lines: Port and ListenAddress lines outside the dotfiles
# drop-in. sshd adds them up across files, so another copy would open the LAN
# again or ask ssh.socket for the same address twice.
sshd_foreign_listen_lines() {
  local f
  local -a files=("$SSHD_CONFIG")
  for f in "$SSHD_CONFIG_D"/*.conf; do [ -e "$f" ] && [ "$f" != "$SSHD_LISTEN" ] && files+=("$f"); done
  # shellcheck disable=SC2016 # $1 and $0 are awk fields
  as_root awk -F '[ \t=]+' '
    { sub(/^[ \t]+/, "") }
    tolower($1) ~ /^(port|listenaddress)$/ { print FILENAME ": " $0 }
  ' "${files[@]}"
}

# sshd_port_filter: an ss filter for the ssh ports.
sshd_port_filter() {
  local p filter=""
  for p in $SSHD_PORTS; do filter="${filter:+$filter or }sport = :$p"; done
  printf '( %s )\n' "$filter"
}

# sshd_stray_listeners: listeners on an ssh port held by a process other than
# PID 1 (ssh.socket) and ssh.service's main sshd. Stopping ssh.service leaves
# them bound, and ssh.socket then cannot bind next to them. A socket-activated
# sshd that loses its unit, as when ssh.socket stops before ssh.service, is one.
sshd_stray_listeners() {
  local main
  main="$(systemctl show -p MainPID --value ssh.service 2>/dev/null)" || return 1
  # shellcheck disable=SC2016 # $0 and $4 are awk fields
  as_root ss -Hltnp "$(sshd_port_filter)" | awk -v main="$main" '
    { n = split($0, part, /pid=/)
      for (i = 2; i <= n; i++) { pid = part[i] + 0; if (pid != 1 && pid != main) print $4 " held by pid " pid } }
  ' | sort -u
}

# sshd_listen_effective ADDR...: sshd's effective ports and addresses, the
# socket units, and the live listeners all match the drop-in. The listeners
# are the proof: an address missing from them is a LAN door or a lost way in.
sshd_listen_effective() {
  local want t
  want="$(sshd_listen_want "$@")"
  t="$(as_root "$SSHD_BIN" -G 2>/dev/null)" || return 1
  # shellcheck disable=SC2086 # the list splits on purpose
  [ "$(awk '$1 == "port" { print $2 }' <<<"$t" | sort)" = "$(printf '%s\n' $SSHD_PORTS | sort)" ] || return 1
  [ "$(awk '$1 == "listenaddress" { print $2 }' <<<"$t" | sort)" = "$want" ] || return 1
  systemctl is-enabled --quiet ssh.socket && systemctl is-active --quiet ssh.socket || return 1
  ! systemctl is-enabled --quiet ssh.service || return 1
  [ "$(ss -Hltn "$(sshd_port_filter)" | awk '{ print $4 }' | sort -u)" = "$want" ]
}

sshd_listen() {
  sshd_listen_text "$@" | as_root cmp -s - "$SSHD_LISTEN" &&
    [ "$(as_root stat -c '%a %U' "$SSHD_LISTEN" 2>/dev/null)" = "644 root" ] &&
    sshd_listen_effective "$@"
}

# install_sshd_listen ADDR...: write the drop-in and serve sshd from
# ssh.socket. The socket binds with FreeBind, so it holds the tailnet address
# before tailscaled brings it up at boot; ssh.service binds by itself, fails
# on an address that does not exist yet, and never tries again. Open sessions
# survive the switch (KillMode=process), and Tailscale SSH never uses sshd.
install_sshd_listen() {
  local foreign stray
  foreign="$(sshd_foreign_listen_lines)" || return 1
  if [ -n "$foreign" ]; then
    printf 'Other sshd files set ports or addresses. %s owns them; delete these lines, then run again:\n%s\n' "$SSHD_LISTEN" "$foreign" >&2
    return 1
  fi
  stray="$(sshd_stray_listeners)" || return 1
  if [ -n "$stray" ]; then
    printf 'Processes outside ssh.service hold an ssh port, so ssh.socket could not bind; stop them, then run again:\n%s\n' "$stray" >&2
    return 1
  fi
  sshd_listen_text "$@" >"$WORK/sshd-listen.conf" || return 1
  root_install 0644 "$WORK/sshd-listen.conf" "$SSHD_LISTEN" || return 1
  if ! as_root install -d -m 0755 /run/sshd || ! quiet as_root "$SSHD_BIN" -t; then
    as_root rm -f "$SSHD_LISTEN"
    return 1
  fi
  # The generator turns the drop-in into ssh.socket's ListenStream lines.
  as_root systemctl daemon-reload &&
    as_root systemctl disable --quiet --now ssh.service &&
    as_root systemctl enable --quiet ssh.socket || return 1
  if ! as_root systemctl restart ssh.socket; then
    printf 'ssh.socket did not start, so OpenSSH is off; Tailscale SSH still answers. Read: journalctl -u ssh.socket\n' >&2
    return 1
  fi
}

# want_sshd_listen: close the LAN door once the box has a tailnet address.
# Before the tailnet join, closing it would leave only the console.
want_sshd_listen() {
  local -a addrs
  mapfile -t addrs < <(tailnet_addrs)
  if [ ${#addrs[@]} -gt 0 ]; then
    ensure "ssh answers only on loopback and the tailnet (${addrs[*]}; ports $SSHD_PORTS)" \
      sshd_listen "${addrs[@]}" -- install_sshd_listen "${addrs[@]}"
  elif as_root test -e "$SSHD_LISTEN"; then
    skip "ssh listen addresses: Tailscale reports no address now, so $SSHD_LISTEN stays as it is"
  else
    manual_after_signin "ssh still answers on every address, the LAN included. After the tailnet join, close the LAN door:" \
      "$HOST_DIR/provision.sh tools"
  fi
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
  section "tools: base packages, OpenSSH (keys only, off the LAN), Google Chrome, Tailscale, GitHub CLI, uv"
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
  want_sshd_listen
  ensure "GitHub CLI apt source" gh_source_ok -- add_gh_source
  ensure "gh from GitHub's apt source" gh_from_github -- install_gh
  ensure "uv in ~/.local/bin" test -x "$HOME/.local/bin/uv" -- install_uv
}
