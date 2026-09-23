import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Offline checks for host/provision.sh and the files it installs. The
// end-to-end run on a real Ubuntu VM is tests/provision.hostlab.sh.

const root = resolve(".");
const scripts = [
  "host/provision.sh",
  "host/install.sh",
  "host/bin/format-traces-drive",
  "host/wifi/wifi-watchdog",
  "host/shell/bashrc.bash",
  "tmux/install.sh",
  ...readdirSync("host/provision").map((f) => `host/provision/${f}`),
];

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", ...opts });
}

function have(bin) {
  return sh("sh", ["-c", `command -v ${bin}`]).status === 0;
}

test("every provisioning script parses", () => {
  for (const f of scripts) {
    const r = sh("bash", ["-n", f]);
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});

test("shellcheck passes", { skip: !have("shellcheck") && "shellcheck not installed" }, () => {
  const r = sh("shellcheck", ["-x", "-P", "host", ...scripts, "tests/provision.hostlab.sh"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("each listed module has a file that defines it", () => {
  const r = sh("bash", ["host/provision.sh", "--list"]);
  assert.equal(r.status, 0, r.stderr);
  const modules = r.stdout.trim().split("\n");
  assert.ok(modules.length >= 12, r.stdout);
  for (const m of modules) {
    const body = readFileSync(`host/provision/${m}.sh`, "utf8");
    assert.match(body, new RegExp(`^module_${m.replaceAll("-", "_")}\\(\\) \\{`, "m"), m);
  }
});

test("an unknown module is a usage error", () => {
  const r = sh("bash", ["host/provision.sh", "--check", "nosuchmodule"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown module/);
});

// The core promise: check mode reports and never fixes; apply fixes, re-tests,
// and reports; a step that already holds is only "ok".
test("ensure: check never fixes, apply fixes and re-tests", () => {
  const dir = mkdtempSync(join(tmpdir(), "provision-lib-"));
  const flag = join(dir, "fixed");
  const script = `
    . host/provision/lib.sh
    holds() { [ -e "${flag}" ]; }
    fix() { touch "${flag}"; }
    broken_fix() { true; }
    PROVISION_MODE=check; ensure "step" holds -- fix
    [ -e "${flag}" ] && echo "CHECK FIXED"
    PROVISION_MODE=apply; ensure "step" holds -- fix
    ensure "step" holds -- fix
    rm -f "${flag}"; ensure "bad" holds -- broken_fix
    ensure "nofix" holds
    echo "counts $N_OK $N_CHANGED $N_DRIFT $N_FAILED"
  `;
  const r = sh("bash", ["-c", script]);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /CHECK FIXED/);
  assert.match(r.stdout, /drift +step/);
  assert.match(r.stdout, /changed +step/);
  assert.match(r.stdout, /ok +step/);
  assert.match(r.stdout, /FAILED +bad/);
  assert.match(r.stdout, /FAILED +nofix/);
  assert.match(r.stdout, /counts 1 1 1 2/);
});

test("steps that wait on a sign-in come after the other steps for a person", () => {
  const script = `
    . host/provision/lib.sh
    manual_after_signin "later" "run it again"
    manual "first" "cmd"
    manual "second" "cmd"
    printf '%s|' "\${MANUAL_STEPS[@]%%$'\\n'*}" "--" "\${MANUAL_AFTER_SIGNIN[@]%%$'\\n'*}"
  `;
  const r = sh("bash", ["-c", script]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /first\|second\|--\|later\|$/);
});

test("the watchdog daemon and PID 1 use the udev names, never a probe-order number", () => {
  const rules = readFileSync("host/watchdog/60-host-guard-watchdog.rules", "utf8");
  const conf = readFileSync("host/watchdog/watchdog.conf", "utf8");
  const pid1 = readFileSync("host/watchdog/system.conf.d.conf", "utf8");
  assert.match(rules, /identity}=="Software Watchdog", SYMLINK\+="watchdog-softdog"/);
  assert.match(rules, /identity}!="Software Watchdog", SYMLINK\+="watchdog-hw"/);
  assert.match(conf, /^watchdog-device = \/dev\/watchdog-softdog$/m);
  assert.match(pid1, /^WatchdogDevice=\/dev\/watchdog-hw$/m);
  assert.doesNotMatch(pid1, /^RuntimeWatchdogSec/m, "dotfiles pins the device; it does not turn PID 1's watchdog on");
  assert.doesNotMatch(conf + readFileSync("host/install.sh", "utf8"), /\/dev\/watchdog[0-9]/);
});

test("format-traces-drive needs a model and a serial, then root", () => {
  let r = sh("bash", ["host/bin/format-traces-drive"]);
  assert.equal(r.status, 2);
  r = sh("bash", ["host/bin/format-traces-drive", "--model", "M"]);
  assert.equal(r.status, 2);
  if (process.getuid() !== 0) {
    r = sh("bash", ["host/bin/format-traces-drive", "--model", "M", "--serial", "S"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /run with sudo/);
  }
});

test("tmux/install.sh links the config, keeps an old file, and clones each listed plugin", () => {
  const home = mkdtempSync(join(tmpdir(), "tmux-install-"));
  const bin = join(home, "bin");
  mkdirSync(bin);
  // Stand-in git: record the clone and create the target directory.
  writeFileSync(join(bin, "git"), `#!/bin/sh\necho "$@" >> "${home}/clones"\nfor a; do last="$a"; done\nmkdir -p "$last"\n`);
  chmodSync(join(bin, "git"), 0o755);
  writeFileSync(join(home, ".tmux.conf"), "# hand-made\n");
  const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` };

  let r = sh("bash", ["tmux/install.sh", "--no-reload"], { env });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /SKIP/);
  assert.ok(!lstatSync(join(home, ".tmux.conf")).isSymbolicLink(), "without --force the old file stays");

  r = sh("bash", ["tmux/install.sh", "--force", "--no-reload"], { env });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readlinkSync(join(home, ".tmux.conf")), join(root, "tmux/tmux.conf"));
  const kept = readdirSync(home).filter((f) => f.startsWith(".tmux.conf.pre-dotfiles."));
  assert.equal(kept.length, 1, "the old file moves aside");
  const clones = readFileSync(join(home, "clones"), "utf8");
  for (const p of ["tmux-plugins/tpm", "tmux-plugins/tmux-resurrect", "tmux-plugins/tmux-yank", "drewstone/clipboard-bridge"]) {
    assert.match(clones, new RegExp(`https://github.com/${p} `), p);
  }

  // A second run clones nothing.
  writeFileSync(join(home, "clones"), "");
  r = sh("bash", ["tmux/install.sh", "--force", "--no-reload"], { env });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(home, "clones"), "utf8"), "");
  assert.ok(existsSync(join(home, ".tmux/plugins/tmux-resurrect")));
});

test("tmux.conf loads without errors and keeps the resurrect safety list", { skip: !have("tmux") && "tmux not installed" }, () => {
  const home = mkdtempSync(join(tmpdir(), "tmux-conf-"));
  const sock = `provtest-${process.pid}`;
  const env = { ...process.env, HOME: home };
  delete env.FORCE_COLOR; // the server copies its own environment first
  // A stand-in TPM: the real one clones plugins. new-session -d keeps config
  // errors to itself and exits 0, so the config loads through source-file,
  // which exits non-zero on an unknown option or command.
  mkdirSync(join(home, ".tmux/plugins/tpm"), { recursive: true });
  writeFileSync(join(home, ".tmux/plugins/tpm/tpm"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(home, ".tmux/plugins/tpm/tpm"), 0o755);
  try {
    let r = sh("tmux", ["-L", sock, "-f", "/dev/null", "new-session", "-d", "-s", "t"], { env });
    assert.equal(r.status, 0, r.stderr);
    writeFileSync(join(home, "broken.conf"), "set -g nosuchoption on\n");
    r = sh("tmux", ["-L", sock, "source-file", join(home, "broken.conf")], { env });
    assert.notEqual(r.status, 0, "source-file must report a broken config, or this test proves nothing");
    r = sh("tmux", ["-L", sock, "source-file", "tmux/tmux.conf"], { env });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    r = sh("tmux", ["-L", sock, "show", "-g", "@resurrect-processes"], { env });
    assert.match(r.stdout, /'?ssh,npm,pnpm,yarn,bun,python3,bash,zsh,fish'?/);
    assert.doesNotMatch(r.stdout, /node/);
    r = sh("tmux", ["-L", sock, "show", "-g", "terminal-overrides"], { env });
    assert.doesNotMatch(r.stdout, /^terminal-overrides\[\d+\] \*:Tc$/m, "'*:Tc' breaks the Linux console");
    assert.match(r.stdout, /^terminal-overrides\[\d+\] xterm\*:Tc$/m);
    r = sh("tmux", ["-L", sock, "show-environment", "-g", "FORCE_COLOR"], { env });
    assert.notEqual(r.status, 0, "FORCE_COLOR must stay unset");
  } finally {
    sh("tmux", ["-L", sock, "kill-server"], { env });
  }
});

test("desktop runs before wifi and nosleep, so a Server install has NetworkManager for wifi", () => {
  const r = sh("bash", ["host/provision.sh", "--list"]);
  const order = r.stdout.trim().split("\n");
  assert.ok(order.indexOf("desktop") < order.indexOf("wifi"), order.join(" "));
  assert.ok(order.indexOf("desktop") < order.indexOf("nosleep"), order.join(" "));
});

// wifi-watchdog with a stand-in nmcli: STATE is the general state, DEVICES the
// TYPE:STATE lines. It must reconnect only when no Wi-Fi device is up and
// nothing else gives full connectivity.
function watchdog(state, devices) {
  const dir = mkdtempSync(join(tmpdir(), "wifi-watchdog-"));
  const calls = join(dir, "calls");
  writeFileSync(join(dir, "nmcli"), `#!/bin/sh
echo "$*" >> "${calls}"
case "$*" in
  "-t -f RUNNING general") echo running ;;
  "-t -f STATE general") echo "$STATE" ;;
  "-t -f TYPE,STATE device") printf '%b\\n' "$DEVICES" ;;
  "-t -f TIMESTAMP,UUID,TYPE,AUTOCONNECT connection show") echo "1700000000:u-home:802-11-wireless:yes" ;;
  "-g connection.id connection show uuid u-home") echo home ;;
  *"connection up uuid u-home"*) exit 0 ;;
esac
`);
  writeFileSync(join(dir, "logger"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(dir, "nmcli"), 0o755);
  chmodSync(join(dir, "logger"), 0o755);
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, STATE: state, DEVICES: devices };
  const r = sh("sh", ["host/wifi/wifi-watchdog"], { env });
  assert.equal(r.status, 0, r.stderr);
  return existsSync(calls) && readFileSync(calls, "utf8").includes("connection up uuid u-home");
}

test("wifi-watchdog reconnects when only tailscale0 or docker0 keep a local connection", () => {
  assert.equal(watchdog("connected (local only)", "wifi:disconnected\\ntun:connected (externally)\\nbridge:connected (externally)"), true);
  assert.equal(watchdog("connected (site only)", "wifi:unavailable\\nbridge:connected (externally)"), true);
  assert.equal(watchdog("disconnected", "wifi:disconnected"), true);
});

test("wifi-watchdog leaves a working or connecting link alone", () => {
  assert.equal(watchdog("connected", "wifi:connected\\ntun:connected (externally)"), false);
  assert.equal(watchdog("connected", "ethernet:connected\\nwifi:disconnected"), false, "Ethernet gives full connectivity");
  assert.equal(watchdog("connected (site only)", "wifi:connected"), false, "an upstream outage must not bounce Wi-Fi");
  assert.equal(watchdog("connecting", "wifi:connecting (getting IP configuration)"), false);
  assert.equal(watchdog("connected (local only)", "wifi:connecting (need authentication)\\ntun:connected (externally)"), false);
  assert.equal(watchdog("disconnected", "wifi-p2p:disconnected\\nwifi:connected"), false);
});

// sudo logs every command line to the journal and auth.log, so the passphrase
// may reach nmcli only on stdin.
test("the Wi-Fi passphrase never appears in a command line", () => {
  const dir = mkdtempSync(join(tmpdir(), "wifi-psk-"));
  const psk = " c:orrect \\\\horse 'battery' ";
  writeFileSync(join(dir, "psk"), psk + "\n");
  const script = `
    . host/provision/lib.sh
    . host/provision/wifi.sh
    PROVISION_MODE=apply
    as_root() { printf '%s\\n' "ARGV: $*" >>"${dir}/argv"; [ "$1 $2 $3" = "nmcli connection edit" ] && cat >>"${dir}/stdin"; return 0; }
    nmcli() { case "$*" in *"UUID,TYPE connection show"*) echo "u-1:802-11-wireless" ;; *"802-11-wireless.ssid"*) echo home ;; esac; }
    WIFI_SSID=home-new WIFI_PSK_FILE="${dir}/psk"
    wifi_add_profile
    WIFI_SSID=home
    nm_store_psk u-1
    REPLACE_PSK=1; wifi_replace_psk
  `;
  const r = sh("bash", ["-c", script]);
  assert.equal(r.status, 0, r.stderr);
  const argv = readFileSync(join(dir, "argv"), "utf8");
  assert.match(argv, /nmcli connection add type wifi/);
  assert.match(argv, /nmcli connection edit uuid u-1/);
  assert.ok(!argv.includes("orrect"), `passphrase in argv:\n${argv}`);
  const stdin = readFileSync(join(dir, "stdin"), "utf8");
  assert.ok(stdin.includes(`set 802-11-wireless-security.psk\n${psk}\nsave persistent\n`), stdin);
});

test("a different stored passphrase stays without --replace-psk", () => {
  const script = `
    . host/provision/lib.sh
    . host/provision/wifi.sh
    as_root() { echo "ROOT $*"; }
    wifi_uuid_for_ssid() { echo u-1; }
    WIFI_SSID=home WIFI_PSK_FILE=/dev/null
    wifi_replace_psk && echo REPLACED
  `;
  const r = sh("bash", ["-c", script]);
  assert.doesNotMatch(r.stdout, /REPLACED|ROOT/);
  assert.match(r.stderr, /--replace-psk/);
});

test("check mode never adds a host key to known_hosts", () => {
  const dir = mkdtempSync(join(tmpdir(), "ssh-check-"));
  const script = `
    . host/provision/lib.sh
    . host/provision/tangle-tools.sh
    git() { printf '%s\\n' "$GIT_SSH_COMMAND" >>"${dir}/ssh"; return 1; }
    PROVISION_MODE=check; github_ssh_ok
    PROVISION_MODE=apply; github_ssh_ok
    true
  `;
  const r = sh("bash", ["-c", script]);
  assert.equal(r.status, 0, r.stderr);
  const [check, apply] = readFileSync(join(dir, "ssh"), "utf8").trim().split("\n");
  assert.match(check, /StrictHostKeyChecking=yes\b/);
  assert.match(apply, /StrictHostKeyChecking=accept-new\b/);
});

test("desktop turns GDM automatic login on by default and off with --no-autologin", () => {
  const dir = mkdtempSync(join(tmpdir(), "gdm-custom-"));
  const conf = join(dir, "custom.conf");
  const accounts = join(dir, "accounts-user");
  const session = join(dir, "gtr-kiosk.desktop");
  const launcher = join(dir, "gtr-kiosk");
  writeFileSync(conf, "# GDM configuration\n[daemon]\nDefaultSession=ubuntu.desktop\n#  AutomaticLoginEnable = true\n AutomaticLoginEnable=false\nTimedLoginEnable=true\nTimedLogin=guest\nTimedLoginDelay=10\nWaylandEnable=true\n\n[security]\n");
  writeFileSync(accounts, "[User]\nSession=ubuntu\nXSession=ubuntu\nSystemAccount=false\n\n[InputSource0]\nName=us\n");
  writeFileSync(session, "[Desktop Entry]\nName=GTR shared desktop\n");
  writeFileSync(launcher, "#!/bin/sh\nexit 0\n");
  chmodSync(launcher, 0o755);
  const script = `
    . host/provision/lib.sh
    . host/provision/desktop.sh
    as_root() { "$@"; }
    root_install() { cp "$2" "$3"; }
    USER=drew WORK="${dir}" GDM_CUSTOM="${conf}" ACCOUNTS_USER="${accounts}"
    KIOSK_SESSION_FILE="${session}" KIOSK_LAUNCHER="${launcher}"
    echo "default=$AUTOLOGIN"
    autologin_on && echo ON0
    autologin_off && echo OFF0
    write_gdm_custom 1
    gdm_session_on && echo KIOSK
    set_accounts_session
    accounts_session_on && echo ACCOUNT
    autologin_on && echo ON1
    autologin_off && echo OFF1
    write_gdm_custom 0
    autologin_on && echo ON2
    autologin_off && echo OFF2
    true
  `;
  const r = sh("bash", ["-c", script]);
  assert.equal(r.status, 0, r.stderr);
  // A timed login is not "off" either, so OFF0 never prints.
  assert.deepEqual(r.stdout.trim().split("\n"), ["default=1", "KIOSK", "ACCOUNT", "ON1", "OFF2"]);
  const after = readFileSync(conf, "utf8");
  assert.match(after, /^DefaultSession=gtr-kiosk\.desktop$/m);
  assert.equal((after.match(/^DefaultSession=/gm) || []).length, 1);
  assert.match(after, /#  AutomaticLoginEnable = true/);
  assert.match(after, /WaylandEnable=true/);
  assert.doesNotMatch(after, /^\s*(Automatic|Timed)Login/m);
  const user = readFileSync(accounts, "utf8");
  assert.match(user, /^Session=gtr-kiosk$/m);
  assert.match(user, /^XSession=$/m);
  assert.match(user, /^SystemAccount=false$/m);
  assert.match(user, /^\[InputSource0\]$/m);
  assert.ok(readdirSync(dir).some((f) => f.startsWith("custom.conf.pre-dotfiles.")));
  assert.ok(readdirSync(dir).some((f) => f.startsWith("accounts-user.pre-dotfiles.")));
});

test("one desktop apply installs kiosk assets before selecting the GDM session", () => {
  const home = mkdtempSync(join(tmpdir(), "prov-gdm-kiosk-"));
  const conf = join(home, "custom.conf");
  const accounts = join(home, "user.conf");
  const launcher = join(home, "gtr-kiosk");
  const session = join(home, "gtr-kiosk.desktop");
  writeFileSync(conf, "[daemon]\nDefaultSession=ubuntu.desktop\nAutomaticLoginEnable=false\n");
  writeFileSync(accounts, "[User]\nSession=ubuntu\nXSession=ubuntu\n");
  const r = sh("bash", ["-c", `
    USER=drew WORK="${home}" HOST_DIR="$PWD/host"
    . host/provision/lib.sh; . host/provision/desktop.sh
    GDM_CUSTOM="${conf}" ACCOUNTS_USER="${accounts}"
    KIOSK_LAUNCHER="${launcher}" KIOSK_SESSION_FILE="${session}"
    as_root() { "$@"; }
    root_install() { cp "$2" "$3"; chmod "$1" "$3"; }
    root_file_is() { [ -f "$3" ] && cmp -s "$2" "$3"; }
    pkg_installed() { return 0; }
    boots_graphical() { return 0; }
    networkd_wait_off() { return 0; }
    font_present() { return 0; }
    login_keyring_has_password() { return 1; }
    systemctl() { [ "$*" = "is-active --quiet gdm" ]; }
    module_desktop
    [ "$N_FAILED" = 0 ] && gdm_session_on && accounts_session_on
  `]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(readFileSync(launcher, "utf8"), readFileSync("host/desktop/gtr-kiosk", "utf8"));
  assert.equal(readFileSync(session, "utf8"), readFileSync("host/desktop/gtr-kiosk.desktop", "utf8"));
  assert.match(readFileSync(conf, "utf8"), /^DefaultSession=gtr-kiosk\.desktop$/m);
  assert.match(readFileSync(accounts, "utf8"), /^Session=gtr-kiosk$/m);
});

test("desktop module can be sourced when USER is unset", () => {
  const r = sh("bash", ["-u", "-c", "unset USER; . host/provision/desktop.sh; [ -n \"$ACCOUNTS_USER\" ]"]);
  assert.equal(r.status, 0, r.stderr);
});

test("the keyring step shows only for a login keyring with a password", () => {
  const dir = mkdtempSync(join(tmpdir(), "keyring-"));
  writeFileSync(join(dir, "binary"), Buffer.from("GnomeKeyring\n\r\0\n\0\0\0\0", "binary"));
  writeFileSync(join(dir, "text"), "[keyring]\ndisplay-name=Login\n");
  const script = `
    . host/provision/lib.sh
    . host/provision/desktop.sh
    for k in binary text missing; do
      LOGIN_KEYRING="${dir}/$k"; login_keyring_has_password && echo "$k"
    done
    true
  `;
  const r = sh("bash", ["-c", script]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "binary");
});

test("nosleep moves logind keys out of logind.conf only after the drop-in holds them", () => {
  const dir = mkdtempSync(join(tmpdir(), "logind-"));
  const main = join(dir, "logind.conf");
  writeFileSync(main, "[Login]\n#HandleLidSwitch=suspend\nHandleLidSwitch=ignore\nKillUserProcesses=no\n IdleAction=ignore\n");
  const script = `
    . host/provision/lib.sh
    . host/provision/nosleep.sh
    as_root() { "$@"; }
    root_install() { cp "$2" "$3"; }
    HOST_DIR=host WORK="${dir}" LOGIND_MAIN="${main}" LOGIND_DROPIN="${dir}/dropin"
    echo "keys=$(logind_keys)"
    root_file_is() { false; }
    comment_logind_main || echo "REFUSED without the drop-in"
    logind_main_clean || echo "HAS KEYS"
    root_file_is() { true; }
    comment_logind_main && logind_main_clean && echo CLEAN
  `;
  const r = sh("bash", ["-c", script]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "keys=HandleLidSwitch|IdleAction\nREFUSED without the drop-in\nHAS KEYS\nCLEAN\n");
  assert.equal(readFileSync(main, "utf8"), "[Login]\n#HandleLidSwitch=suspend\n#HandleLidSwitch=ignore\nKillUserProcesses=no\n# IdleAction=ignore\n");
});

test("the trace-drive eraser reads every mount stacked on /, /boot and /boot/efi", () => {
  const body = readFileSync("host/bin/format-traces-drive", "utf8");
  assert.match(body, /done < <\(findmnt -nro SOURCE --mountpoint "\$m"/);
  assert.match(body, /lsblk -snlpo NAME/);
});

test("ssh counts as keys only when sshd's effective settings say so, not when the drop-in exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "sshd-"));
  const stub = join(dir, "sshd");
  writeFileSync(stub, '#!/bin/sh\n[ "$1" = -G ] || exit 2\ncat "$(dirname "$0")/effective"\n');
  chmodSync(stub, 0o755);
  const script = `
    . host/provision/lib.sh
    . host/provision/tools.sh
    SSHD_BIN="${stub}" HOST_DIR=host SSHD_CONFIG="${dir}/sshd_config" SSHD_CONFIG_D="${dir}/sshd_config.d"
    mkdir -p "$SSHD_CONFIG_D"
    printf 'Include %s/*.conf\\nUsePAM yes\\n' "$SSHD_CONFIG_D" >"$SSHD_CONFIG"
    as_root() { [ "$1" = "${stub}" ] && echo "AS ROOT" >>"${dir}/calls"; "$@"; }
    root_file_is() { true; }
    printf 'usepam yes\\npasswordauthentication yes\\nkbdinteractiveauthentication no\\n' >"${dir}/effective"
    sshd_keys_only && echo "PASSWORDS COUNTED AS KEYS ONLY"
    printf 'passwordauthentication no\\nkbdinteractiveauthentication no\\npubkeyauthentication no\\n' >"${dir}/effective"
    sshd_keys_only && echo "KEY LOGIN OFF COUNTED AS KEYS ONLY"
    printf 'passwordauthentication no\\nkbdinteractiveauthentication no\\npubkeyauthentication yes\\n' >"${dir}/effective"
    sshd_keys_only && echo "keys only"
    printf 'Match User drew\\n  PasswordAuthentication=yes\\n' >"$SSHD_CONFIG_D/20-match.conf"
    sshd_keys_only || echo "a Match block allows passwords"
    printf 'Match User drew\\n  KbdInteractiveAuthentication "Yes"\\n' >"$SSHD_CONFIG_D/20-match.conf"
    sshd_keys_only || echo "a quoted value counts too"
    printf 'Match User drew\\n  PasswordAuthentication "no"\\n' >"$SSHD_CONFIG_D/20-match.conf"
    sshd_keys_only && echo "a Match block that says no is fine"
    printf 'Match Address 10.0.0.0/8\\n  PubkeyAuthentication no\\n' >"$SSHD_CONFIG_D/20-match.conf"
    sshd_keys_only || echo "a Match block that turns key login off counts"
    rm "$SSHD_CONFIG_D/20-match.conf"
    printf 'Include /etc/ssh/local/*.cfg\\n' >"$SSHD_CONFIG_D/30-include.conf"
    sshd_keys_only || echo "an Include the run does not read"
    rm "$SSHD_CONFIG_D/30-include.conf"
    sshd_keys_only && echo "the drop-in Include is fine"
    root_file_is() { false; }
    sshd_keys_only || echo "no drop-in"
  `;
  const r = sh("bash", ["-c", script]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "keys only\na Match block allows passwords\na quoted value counts too\na Match block that says no is fine\na Match block that turns key login off counts\nan Include the run does not read\nthe drop-in Include is fine\nno drop-in\n");
  // A drop-in can be root-only, so sshd -G runs as root.
  assert.equal(readFileSync(join(dir, "calls"), "utf8"), "AS ROOT\n".repeat(9));
});

test("--replace-psk without a file compares with the prompt's passphrase, and check mode never prompts", () => {
  const script = `
    . host/provision/lib.sh
    . host/provision/wifi.sh
    nmcli() { :; }
    root_file_is() { true; }
    wifi_timer_on() { true; }
    wifi_uuids() { :; }
    wifi_profile_exists() { true; }
    wifi_psk_is_stored() { true; }
    wifi_psk_matches() { echo "COMPARED"; }
    WIFI_SSID=home WIFI_PSK_FILE="" REPLACE_PSK=1
    PROVISION_MODE=apply; module_wifi
    PROVISION_MODE=check; module_wifi | grep -c COMPARED
    true
  `;
  const r = sh("bash", ["-c", script]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /COMPARED\n\s+ok\s+'home' holds the passphrase given on the terminal/);
  assert.match(r.stdout, /\n0\n$/);
});

// The kiosk desktop replaces the old Ghostty autostart after its unit is enabled.
test("desktop drops the old Ghostty autostart after the deployed kiosk unit is enabled", () => {
  const home = mkdtempSync(join(tmpdir(), "prov-wall-"));
  const entry = join(home, ".config/autostart/ghostty.desktop");
  mkdirSync(join(home, ".config/autostart"), { recursive: true });
  writeFileSync(entry, "[Desktop Entry]\nComment=Full-screen terminal on the agent tmux session (dotfiles host/provision.sh)\n");
  const run = (mode) => sh("bash", ["-c", `
    DOTFILES="$PWD"; HOST_DIR="$PWD/host"; HOME="${home}"; PROVISION_MODE=${mode}
    . host/provision/lib.sh; . host/provision/desktop.sh; . host/provision/tangle-tools.sh
    systemctl() {
      case "$*" in
        "--user is-enabled --quiet fleet-wall.service") [ -e "$HOME/wall-enabled" ] ;;
        "--user is-enabled --quiet gtr-desktop.service") [ -e "$HOME/desktop-enabled" ] ;;
        "--user is-enabled --quiet vnc-desktop.service") [ -e "$HOME/vnc-enabled" ] ;;
      esac
    }
    user_bus() { return 0; }
    ensure "old autostart" no_old_autostart -- drop_old_autostart
    ensure "wall unit" wall_unit_on -- false
    ensure "desktop unit" desktop_unit_on -- false`]);
  const check = run("check");
  assert.match(check.stdout, /drift +old autostart/);
  assert.match(check.stdout, /drift +wall unit/);
  assert.match(check.stdout, /drift +desktop unit/);
  assert.ok(existsSync(entry), "check mode must not remove the entry");
  assert.match(run("apply").stdout, /FAILED +old autostart/);
  assert.ok(existsSync(entry), "the entry stays while the desktop unit is not enabled");
  writeFileSync(join(home, "wall-enabled"), "");
  writeFileSync(join(home, "desktop-enabled"), "");
  assert.match(run("apply").stdout, /FAILED +old autostart/);
  assert.ok(existsSync(entry), "the entry stays while VNC is not enabled");
  writeFileSync(join(home, "vnc-enabled"), "");
  assert.match(run("apply").stdout, /changed +old autostart/);
  assert.ok(!existsSync(entry), "apply removes the entry dotfiles installed");
  const unit = join(home, ".local/share/tangle-tools/fleet/systemd/fleet-wall.service");
  const desktopUnit = join(home, ".local/share/tangle-tools/fleet/systemd/gtr-desktop.service");
  mkdirSync(join(home, ".local/share/tangle-tools/fleet/systemd"), { recursive: true });
  mkdirSync(join(home, ".config/systemd/user"), { recursive: true });
  mkdirSync(join(home, ".config/systemd/user/vnc-desktop.service.wants"), { recursive: true });
  writeFileSync(unit, "[Unit]\n");
  writeFileSync(desktopUnit, "[Unit]\n");
  symlinkSync(unit, join(home, ".config/systemd/user/fleet-wall.service"));
  symlinkSync(desktopUnit, join(home, ".config/systemd/user/gtr-desktop.service"));
  symlinkSync(unit, join(home, ".config/systemd/user/vnc-desktop.service.wants/fleet-wall.service"));
  symlinkSync(desktopUnit, join(home, ".config/systemd/user/vnc-desktop.service.wants/gtr-desktop.service"));
  // A person's own entry, as a file or as a link elsewhere, is not drift and stays.
  const own = join(home, "own.desktop");
  writeFileSync(own, "[Desktop Entry]\nExec=ghostty\n");
  symlinkSync(own, entry);
  const clean = run("apply");
  assert.ok(lstatSync(entry).isSymbolicLink(), "a person's link stays");
  assert.match(clean.stdout, /ok +old autostart/);
  rmSync(entry);
  symlinkSync(join(process.cwd(), "host/desktop/ghostty.desktop"), entry);
  assert.match(run("apply").stdout, /changed +old autostart/);
  assert.throws(() => lstatSync(entry), "the old managed link is removed");
  assert.match(clean.stdout, /ok +wall unit/);
  assert.match(clean.stdout, /ok +desktop unit/);
});

test("one provision pass removes the old autostart after kiosk unit repair", () => {
  const home = mkdtempSync(join(tmpdir(), "prov-kiosk-order-"));
  const entry = join(home, ".config/autostart/ghostty.desktop");
  mkdirSync(join(home, ".config/autostart"), { recursive: true });
  writeFileSync(entry, "[Desktop Entry]\nComment=Full-screen terminal on the agent tmux session (dotfiles host/provision.sh)\n");
  const r = sh("bash", ["-c", `
    HOME="${home}"; USER=drew; HOST_DIR="$PWD/host"; PROVISION_MODE=apply
    . host/provision/lib.sh; . host/provision/desktop.sh; . host/provision/tangle-tools.sh
    pkg_installed() { return 0; }
    boots_graphical() { return 0; }
    networkd_wait_off() { return 0; }
    font_present() { return 0; }
    root_file_is() { return 0; }
    gdm_session_on() { return 0; }
    accounts_session_on() { return 0; }
    autologin_on() { return 0; }
    login_keyring_has_password() { return 1; }
    tt_installed() { return 0; }
    github_ssh_ok() { return 0; }
    wall_unit_on() { [ -e "$HOME/wall-enabled" ]; }
    desktop_unit_on() { [ -e "$HOME/desktop-enabled" ]; }
    install_wall_unit() { touch "$HOME/wall-enabled"; }
    install_desktop_unit() { touch "$HOME/desktop-enabled" "$HOME/vnc-enabled"; }
    systemctl() {
      case "$*" in
        "is-active --quiet gdm") return 0 ;;
        "--user is-enabled --quiet gtr-desktop.service") [ -e "$HOME/desktop-enabled" ] ;;
        "--user is-enabled --quiet vnc-desktop.service") [ -e "$HOME/vnc-enabled" ] ;;
        *) return 1 ;;
      esac
    }
    module_desktop; module_tangle_tools
    [ "$N_FAILED" = 0 ] && [ ! -e "$OLD_AUTOSTART" ]
  `]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(!existsSync(entry));
});

test("tangle-tools updates an existing deploy clone before running its installer", () => {
  const home = mkdtempSync(join(tmpdir(), "prov-tt-upgrade-"));
  const deploy = join(home, ".local/share/tangle-tools/deploy");
  mkdirSync(join(home, ".local/share/tangle-tools/.git"), { recursive: true });
  mkdirSync(deploy, { recursive: true });
  const installer = join(deploy, "tangle-tools-deploy");
  const next = join(home, "new-deploy");
  writeFileSync(installer, '#!/bin/sh\n[ "$1" = update ] || exit 1\ncp "$TT_NEW" "$0.new" && chmod +x "$0.new" && mv "$0.new" "$0"\n');
  writeFileSync(next, '#!/bin/sh\n[ "$1" = install ] || exit 1\nmkdir -p "$HOME/.local/bin"\nln -s "$HOME/.local/share/tangle-tools/fleet/gtr-desktop" "$HOME/.local/bin/gtr-desktop"\n');
  chmodSync(installer, 0o755);
  chmodSync(next, 0o755);
  const r = sh("bash", ["-c", `
    HOME="${home}" TT_NEW="${next}"; export TT_NEW
    . host/provision/lib.sh; . host/provision/tangle-tools.sh
    github_ssh_ok() { return 0; }
    user_bus() { return 0; }
    install_tt
  `]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readlinkSync(join(home, ".local/bin/gtr-desktop")),
    join(home, ".local/share/tangle-tools/fleet/gtr-desktop"));
});

test("kiosk repair re-enables an installed VNC unit", () => {
  const home = mkdtempSync(join(tmpdir(), "prov-vnc-repair-"));
  const unit = join(home, ".local/share/tangle-tools/fleet/systemd/gtr-desktop.service");
  mkdirSync(join(home, ".local/share/tangle-tools/fleet/systemd"), { recursive: true });
  writeFileSync(unit, "[Unit]\n");
  const r = sh("bash", ["-c", `
    HOME="${home}"
    . host/provision/lib.sh; . host/provision/tangle-tools.sh
    user_bus() { return 0; }
    systemctl() {
      case "$*" in
        "--user is-enabled --quiet vnc-desktop.service") [ -e "$HOME/vnc-enabled" ] ;;
        "--user enable --quiet vnc-desktop.service") touch "$HOME/vnc-enabled" ;;
        "--user is-enabled --quiet gtr-desktop.service") [ -e "$HOME/desktop-enabled" ] ;;
        "--user reenable --quiet gtr-desktop.service")
          mkdir -p "$HOME/.config/systemd/user/vnc-desktop.service.wants"
          ln -s "$DESKTOP_UNIT_SRC" "$HOME/.config/systemd/user/vnc-desktop.service.wants/gtr-desktop.service"
          touch "$HOME/desktop-enabled" ;;
        "--user daemon-reload") return 0 ;;
        *) return 1 ;;
      esac
    }
    install_desktop_unit && desktop_unit_on
  `]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(home, "vnc-enabled")));
  assert.equal(readlinkSync(join(home, ".config/systemd/user/gtr-desktop.service")), unit);
});

test("fleet wall enablement moves from the old graphical target to VNC", () => {
  const home = mkdtempSync(join(tmpdir(), "prov-wall-target-"));
  const source = join(home, ".local/share/tangle-tools/fleet/systemd/fleet-wall.service");
  const installed = join(home, ".config/systemd/user/fleet-wall.service");
  const old = join(home, ".config/systemd/user/graphical-session.target.wants/fleet-wall.service");
  const next = join(home, ".config/systemd/user/vnc-desktop.service.wants/fleet-wall.service");
  mkdirSync(join(home, ".local/share/tangle-tools/fleet/systemd"), { recursive: true });
  mkdirSync(join(home, ".config/systemd/user/graphical-session.target.wants"), { recursive: true });
  writeFileSync(source, "[Unit]\n");
  symlinkSync(source, installed);
  symlinkSync(source, old);
  const r = sh("bash", ["-c", `
    HOME="${home}"
    . host/provision/lib.sh; . host/provision/tangle-tools.sh
    user_bus() { return 0; }
    systemctl() {
      case "$*" in
        "--user is-enabled --quiet fleet-wall.service") [ -L "${old}" ] || [ -L "${next}" ] ;;
        "--user daemon-reload") return 0 ;;
        "--user reenable --quiet fleet-wall.service")
          rm "${old}"; mkdir -p "$HOME/.config/systemd/user/vnc-desktop.service.wants"; ln -s "${source}" "${next}" ;;
        *) return 1 ;;
      esac
    }
    wall_unit_on && exit 9
    install_wall_unit && wall_unit_on
  `]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(!existsSync(old));
  assert.equal(readlinkSync(next), source);
});

test("a commented-out authorized key does not hide the ssh-copy-id step", () => {
  const home = mkdtempSync(join(tmpdir(), "authkeys-"));
  mkdirSync(join(home, ".ssh"));
  const keys = join(home, ".ssh/authorized_keys");
  const script = `
    . host/provision/lib.sh
    . host/provision/tools.sh
    HOME="${home}"
    ssh_key_authorized && echo active
    true
  `;
  writeFileSync(keys, "# ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexample old-laptop\n");
  assert.equal(sh("bash", ["-c", script]).stdout, "");
  writeFileSync(keys, 'from="10.0.0.0/8" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexample mac\n');
  assert.equal(sh("bash", ["-c", script]).stdout, "active\n");
  // StrictModes: sshd ignores the file when it or ~/.ssh is writable by others.
  chmodSync(keys, 0o666);
  assert.equal(sh("bash", ["-c", script]).stdout, "", "a world-writable authorized_keys");
  chmodSync(keys, 0o600);
  chmodSync(join(home, ".ssh"), 0o775);
  assert.equal(sh("bash", ["-c", script]).stdout, "", "a group-writable ~/.ssh");
  chmodSync(join(home, ".ssh"), 0o700);
  assert.equal(sh("bash", ["-c", script]).stdout, "active\n");
});
