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
  try {
    let r = sh("tmux", ["-L", sock, "-f", "tmux/tmux.conf", "new-session", "-d", "-s", "t"], { env });
    assert.equal(r.status, 0, r.stderr);
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
