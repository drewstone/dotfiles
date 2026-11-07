import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Offline checks for host/provision.sh and the files it installs.

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
  const r = sh("shellcheck", ["-x", "-P", "host", ...scripts]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("each listed module has a file that defines it", () => {
  const r = sh("bash", ["host/provision.sh", "--list"], { env: { ...process.env, DOTFILES_PRIVATE: "/nonexistent" } });
  assert.equal(r.status, 0, r.stderr);
  const modules = r.stdout.trim().split("\n");
  assert.ok(modules.length >= 10, r.stdout);
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

test("Codex fallback preserves a private config file", () => {
  const home = mkdtempSync(join(tmpdir(), "codex-fallback-"));
  try {
    const dir = join(home, ".codex");
    const cfg = join(dir, "config.toml");
    mkdirSync(dir);
    writeFileSync(cfg, 'model = "example"\n');
    chmodSync(cfg, 0o600);
    const result = sh("bash", ["-c", "umask 022; . host/provision/agents.sh; add_codex_fallback; codex_fallback_ok"], {
      env: { ...process.env, HOME: home },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(lstatSync(cfg).mode & 0o777, 0o600);
    assert.equal(readFileSync(cfg, "utf8"), 'project_doc_fallback_filenames = ["CLAUDE.md"]\nmodel = "example"\n');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Codex fallback removes an inherited named ACL", { skip: !have("setfacl") || !have("getfacl") }, () => {
  const home = mkdtempSync(join(tmpdir(), "codex-fallback-acl-"));
  try {
    const dir = join(home, ".codex");
    const cfg = join(dir, "config.toml");
    mkdirSync(dir);
    writeFileSync(cfg, 'model = "example"\n');
    chmodSync(cfg, 0o640);
    const set = sh("setfacl", ["-m", "d:u:65534:r--", dir]);
    assert.equal(set.status, 0, set.stderr);
    const result = sh("bash", ["-c", "umask 022; . host/provision/agents.sh; add_codex_fallback"], {
      env: { ...process.env, HOME: home },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(lstatSync(cfg).mode & 0o777, 0o600);
    const acl = sh("getfacl", ["-cpn", cfg]);
    assert.equal(acl.status, 0, acl.stderr);
    assert.doesNotMatch(acl.stdout, /^user:65534:/m);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
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

test("watchdog flushes only its probe file and keeps failure semantics", () => {
  const script = readFileSync("host/watchdog/root-write", "utf8");
  assert.doesNotMatch(script, /^\s*sync(?:\s|$)/m, "sync -f calls syncfs and flushes unrelated filesystem writes");
  assert.match(script, /dd of="\$d\/root-write" conv=fsync status=none/);
  assert.equal(sh("sh", ["host/watchdog/root-write", "repair"]).status, 1);
  assert.equal(sh("sh", ["host/watchdog/root-write", "unknown"]).status, 0);
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

test("wifi-watchdog reconnects when only a VPN tunnel or docker0 keep a local connection", () => {
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
    printf 'Match User me\\n  PasswordAuthentication=yes\\n' >"$SSHD_CONFIG_D/20-match.conf"
    sshd_keys_only || echo "a Match block allows passwords"
    printf 'Match User me\\n  KbdInteractiveAuthentication "Yes"\\n' >"$SSHD_CONFIG_D/20-match.conf"
    sshd_keys_only || echo "a quoted value counts too"
    printf 'Match User me\\n  PasswordAuthentication "no"\\n' >"$SSHD_CONFIG_D/20-match.conf"
    sshd_keys_only && echo "a Match block that says no is fine"
    printf 'Match Address 10.0.0.0/8\\n  PubkeyAuthentication no\\n' >"$SSHD_CONFIG_D/20-match.conf"
    sshd_keys_only || echo "a Match block that turns key login off counts"
    rm "$SSHD_CONFIG_D/20-match.conf"
    printf 'Include /etc/ssh/local/*.cfg\\n' >"$SSHD_CONFIG_D/30-include.conf"
    sshd_keys_only || echo "an Include the run does not read"
    rm "$SSHD_CONFIG_D/30-include.conf"
    sshd_keys_only && echo "the drop-in Include is fine"
    printf 'Match User me\\nInclude %s/*.conf\\n' "$SSHD_CONFIG_D" >"$SSHD_CONFIG"
    printf 'PasswordAuthentication yes\\n' >"$SSHD_CONFIG_D/40-match-include.conf"
    sshd_keys_only || echo "an allowed Include inside Match is unverified"
    rm "$SSHD_CONFIG_D/40-match-include.conf"
    root_file_is() { false; }
    sshd_keys_only || echo "no drop-in"
  `;
  const r = sh("bash", ["-c", script]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "keys only\na Match block allows passwords\na quoted value counts too\na Match block that says no is fine\na Match block that turns key login off counts\nan Include the run does not read\nthe drop-in Include is fine\nan allowed Include inside Match is unverified\nno drop-in\n");
  // A drop-in can be root-only, so sshd -G runs as root.
  assert.equal(readFileSync(join(dir, "calls"), "utf8"), "AS ROOT\n".repeat(10));
});

test("Claude install and provisioning remove temporary trust without losing other settings", () => {
  const home = mkdtempSync(join(root, ".claude-trust-test-"));
  const claudeDir = join(home, ".claude");
  mkdirSync(claudeDir);
  mkdirSync(join(home, "code"));
  const local = join(claudeDir, "settings.local.json");
  const global = join(home, ".claude.json");
  try {
    writeFileSync(local, JSON.stringify({ trustedDirectories: [home, "/tmp", "/private/tmp", join(home, "code")], theme: "dark" }));
    writeFileSync(global, JSON.stringify({ projects: { "/tmp": { hasTrustDialogAccepted: true, history: 1 }, [join(home, "code")]: { hasTrustDialogAccepted: true } }, other: 42 }));
    const install = sh("bash", ["claude/install.sh"], { env: { ...process.env, HOME: home, PATH: "/usr/bin:/bin" } });
    assert.equal(install.status, 0, install.stderr);
    assert.deepEqual(JSON.parse(readFileSync(local, "utf8")), { trustedDirectories: [home, join(home, "code")], theme: "dark" });
    writeFileSync(local, JSON.stringify({ trustedDirectories: [home, "/tmp"], theme: "dark" }));
    const script = `
      . host/provision/agents.sh
      DOTFILES="$PWD"
      claude_running() { return 1; }
      claude_local_trust_ok && echo "unsafe local trust passed"
      sanitize_claude_local_trust
      claude_local_trust_ok && echo "safe local trust passed"
      claude_trust_ok && echo "unsafe trust passed"
      add_claude_trust
      claude_trust_ok && echo "safe trust passed"
      CLAUDE_TRUST_DIRS=/tmp
      add_claude_trust && echo "unsafe request passed"
      true
    `;
    const provision = sh("bash", ["-c", script], { env: { ...process.env, HOME: home } });
    assert.equal(provision.status, 0, provision.stderr);
    assert.doesNotMatch(provision.stdout, /unsafe local trust passed|unsafe trust passed|unsafe request passed/);
    assert.match(provision.stdout, /safe local trust passed/);
    assert.match(provision.stdout, /safe trust passed/);
    assert.deepEqual(JSON.parse(readFileSync(local, "utf8")), { trustedDirectories: [home], theme: "dark" });
    const config = JSON.parse(readFileSync(global, "utf8"));
    assert.equal(config.projects["/tmp"].hasTrustDialogAccepted, undefined);
    assert.equal(config.projects["/tmp"].history, 1);
    assert.equal(config.other, 42);
    writeFileSync(global, JSON.stringify({ other: 42 }));
    const fresh = sh("bash", ["-c", '. host/provision/agents.sh; DOTFILES="$PWD"; claude_running() { return 1; }; add_claude_trust; claude_trust_ok'], { env: { ...process.env, HOME: home } });
    assert.equal(fresh.status, 0, fresh.stderr);
    assert.equal(JSON.parse(readFileSync(global, "utf8")).projects[join(home, "code")].hasTrustDialogAccepted, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Claude provisioning recreates deleted local trust settings", () => {
  const home = mkdtempSync(join(root, ".claude-trust-missing-"));
  try {
    mkdirSync(join(home, ".claude"));
    mkdirSync(join(home, "code"));
    const script = `
      . host/provision/lib.sh
      . host/provision/agents.sh
      DOTFILES="$PWD"
      sanitize_claude_local_trust
      claude_local_trust_ok
    `;
    const result = sh("bash", ["-c", script], { env: { ...process.env, HOME: home, PATH: "/usr/bin:/bin" } });
    assert.equal(result.status, 0, result.stderr);
    const local = JSON.parse(readFileSync(join(home, ".claude/settings.local.json"), "utf8"));
    assert.deepEqual(local.trustedDirectories, [home, join(home, "code")]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
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

test("a commented-out authorized key does not hide the ssh-copy-id step", () => {
  const home = mkdtempSync(join(tmpdir(), "authkeys-"));
  // Hermetic perms: a group-writable umask (agent shells run 002) would otherwise
  // make the home directory and ~/.ssh group-writable and fail StrictModes
  // before the assertions run.
  chmodSync(home, 0o700);
  mkdirSync(join(home, ".ssh"));
  chmodSync(join(home, ".ssh"), 0o700);
  const keys = join(home, ".ssh/authorized_keys");
  const script = `
    . host/provision/lib.sh
    . host/provision/tools.sh
    USER="$(id -un)"
    HOME="${home}"
    ssh_key_authorized && echo active
    true
  `;
  writeFileSync(keys, "# ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexample old-laptop\n");
  chmodSync(keys, 0o600);
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
