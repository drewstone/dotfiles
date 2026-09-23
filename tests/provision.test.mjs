import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from "node:fs";
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
  writeFileSync(conf, "# GDM configuration\n[daemon]\n#  AutomaticLoginEnable = true\n AutomaticLoginEnable=false\nTimedLoginEnable=true\nTimedLogin=guest\nTimedLoginDelay=10\nWaylandEnable=true\n\n[security]\n");
  const script = `
    . host/provision/lib.sh
    . host/provision/desktop.sh
    as_root() { "$@"; }
    root_install() { cp "$2" "$3"; }
    USER=drew WORK="${dir}" GDM_CUSTOM="${conf}"
    echo "default=$AUTOLOGIN"
    autologin_on && echo ON0
    autologin_off && echo OFF0
    write_gdm_custom 1
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
  assert.deepEqual(r.stdout.trim().split("\n"), ["default=1", "ON1", "OFF2"]);
  const after = readFileSync(conf, "utf8");
  assert.match(after, /#  AutomaticLoginEnable = true/);
  assert.match(after, /WaylandEnable=true/);
  assert.doesNotMatch(after, /^\s*(Automatic|Timed)Login/m);
  assert.ok(readdirSync(dir).some((f) => f.startsWith("custom.conf.pre-dotfiles.")));
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
