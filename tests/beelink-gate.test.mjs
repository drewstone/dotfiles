import assert from "node:assert/strict";
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn as spawnProcess, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";

const gate = resolve("claude/tools/beelink-gate");
// A gate started directly with --remote runs inside a managed unit of its own, as its runner would start it.
const inOwnUnit = (bin, args, options) => {
  const env = options.env;
  if (bin !== "bash" || args[0] !== gate || args[1] !== "--remote" || !env?.BEELINK_GATE_STATE_DIR || env.BEELINK_GATE_ID) return options;
  return { ...options, env: { ...env, ...inUnit(dirname(env.BEELINK_GATE_STATE_DIR), env.BEELINK_GATE_CLASS === "dev" ? "beelinkgate-dev.slice" : undefined) } };
};
const run = (bin, args, options = {}) => spawnSync(bin, args, { encoding: "utf8", ...inOwnUnit(bin, args, options) });
const spawn = (bin, args, options = {}) => spawnProcess(bin, args, inOwnUnit(bin, args, options));
const encode = (arg) => Buffer.from(String(arg)).toString("base64");
const sleepMs = (ms) => new Promise((resolveDone) => setTimeout(resolveDone, ms));
// The UTC end of the update window scheduled at `at`'s hour: 30 minutes past it.
// A gate runs inside its managed system unit; a gate the test starts with --remote gets a unit of its own.
function inUnit(root, slice = "beelinkgate-normal.slice") {
  const id = `beelink2-${randomBytes(16).toString("hex")}`;
  const self = join(root, "host", "self", `beelink-gate-${id}`);
  writeFileSync(self, `0::/beelinkgate.slice/${slice}/beelink-gate-${id}.service\n`);
  mkdirSync(join(root, "state", "jobs", id), { recursive: true });
  return { BEELINK_GATE_ID: id, BEELINK_GATE_SELF_CGROUP: self };
}
// A unit is active while the pid FAKE_UNITS_DIR recorded for it lives and no stop was asked.
const FAKE_SYSTEMCTL = `#!/usr/bin/env bash
[[ "$1" == --user ]] && shift
case "$1" in
  list-units) exit 0 ;;
  show)
    if [[ " $* " == *" IOWeight "* ]]; then echo 100; exit 0; fi
    unit=\${2%.service}; pid=$(cat "\${FAKE_UNITS_DIR:-/nonexistent}/$unit" 2>/dev/null)
    if [[ -n "$pid" && ! -e "$FAKE_UNITS_DIR/$unit.stopped" ]] && kill -0 "$pid" 2>/dev/null; then echo active; else echo inactive; fi
    exit 0 ;;
  stop)
    unit=\${2%.service}; pid=$(cat "\${FAKE_UNITS_DIR:-/nonexistent}/$unit" 2>/dev/null) || exit 0
    kill -TERM "$pid" 2>/dev/null || true
    touch "$FAKE_UNITS_DIR/$unit.stopped"
    exit 0 ;;
esac
exit 1
`;
// The lifecycle admission minimum the fixture provider publishes unless a test moves it.
const FLOOR = 150 * 1024 ** 3;
// Publish a fixture admission minimum and live reservations through the provider's own record.
const setAdmission = (f, floor = FLOOR, reserved = 0, hosts = {}) =>
  writeFileSync(join(f.root, "disk-policy", "admission.json"), JSON.stringify({ admission_floor_bytes: floor, reserved_bytes: reserved, hosts }));
const receipts = (f) => readFileSync(join(f.root, "state", "receipts.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const windowEnd = (at) => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), at.getUTCHours(), 30)).toISOString().replace(".000Z", "Z");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "beelink-gate-"));
  const owner = join(root, "owner");
  const source = join(root, "source");
  const bare = join(owner, "repo.git");
  const cache = join(root, "cache");
  const bin = join(root, "bin");
  const home = join(root, "home");
  mkdirSync(owner); mkdirSync(source); mkdirSync(bin); mkdirSync(home);
  const git = (args, cwd = source) => {
    const result = run("git", args, { cwd });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git(["init", "-q"]);
  writeFileSync(join(source, "package.json"), '{"name":"gate-test","version":"1.0.0"}\n');
  writeFileSync(join(source, "package-lock.json"), '{"name":"gate-test","version":"1.0.0","lockfileVersion":3,"packages":{"":{"name":"gate-test","version":"1.0.0"}}}\n');
  writeFileSync(join(source, "value.txt"), "first\n");
  git(["add", "."]); git(["commit", "-qm", "first"]);
  const first = git(["rev-parse", "HEAD"]);
  writeFileSync(join(source, "value.txt"), "second\n");
  git(["commit", "-qam", "second"]);
  const second = git(["rev-parse", "HEAD"]);
  git(["clone", "-q", "--bare", source, bare], root);
  const npmLog = join(root, "npm.log");
  const pnpmLog = join(root, "pnpm.log");
  const fakeNpm = join(bin, "npm");
  writeFileSync(fakeNpm, '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$NPM_LOG"\n');
  chmodSync(fakeNpm, 0o755);
  const fakePnpm = join(bin, "pnpm");
  writeFileSync(fakePnpm, '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$PNPM_LOG"\n');
  chmodSync(fakePnpm, 0o755);
  const fakeSystemdRun = join(bin, "systemd-run");
  // --wait --pipe (a probe) runs in the foreground with its streams; a job detaches like a unit.
  writeFileSync(fakeSystemdRun, '#!/usr/bin/env bash\nwait=0\nwhile [[ "$1" == --* ]]; do [[ "$1" == --wait ]] && wait=1; shift; done\n(( wait )) && exec "$@"\nnohup "$@" </dev/null >/dev/null 2>&1 &\necho "Running as unit: fake"\n');
  chmodSync(fakeSystemdRun, 0o755);
  // The host a gate runs on: root's resource policy and the kernel cgroup tree it audits.
  const host = join(root, "host");
  const slices = join(host, "cgroup", "beelinkgate.slice");
  const policy = { cpu_weight: 100, io_weight: 100, normal_cpu_percent_per_host_cpu: 75, normal_memory_bytes: 25769803776, dev_memory_bytes: 8589934592 };
  mkdirSync(join(slices, "beelinkgate-normal.slice"), { recursive: true });
  mkdirSync(join(slices, "beelinkgate-dev.slice"));
  mkdirSync(join(host, "self"));
  writeFileSync(join(host, "resource-policy.json"), JSON.stringify(policy), { mode: 0o644 });
  writeFileSync(join(slices, "cpu.weight"), "100\n");
  writeFileSync(join(slices, "io.weight"), "default 100\n");
  writeFileSync(join(slices, "beelinkgate-normal.slice", "memory.max"), `${policy.normal_memory_bytes}\n`);
  writeFileSync(join(slices, "beelinkgate-normal.slice", "cpu.max"), `${cpus().length * policy.normal_cpu_percent_per_host_cpu * 1000} 100000\n`);
  writeFileSync(join(slices, "beelinkgate-dev.slice", "memory.max"), `${policy.dev_memory_bytes}\n`);
  writeFileSync(join(slices, "beelinkgate-dev.slice", "cpu.max"), "max 100000\n");
  // sudo -n /usr/bin/systemd-run starts the gate in its managed system unit; the unit's cgroup is the one it names.
  writeFileSync(join(bin, "sudo"), `#!/usr/bin/env bash
[[ "$1" == -n ]] && shift
command=\${1##*/}; shift
if [[ "$command" == systemd-run ]]; then
  for arg in "$@"; do
    case "$arg" in --slice=*) slice=\${arg#--slice=} ;; --unit=*) unit=\${arg#--unit=} ;; --) break ;; esac
  done
  if [[ -n "\${slice:-}" && -n "\${unit:-}" ]]; then
    printf '0::/beelinkgate.slice/%s/%s.service\\n' "$slice" "$unit" > '${join(host, "self")}'/"$unit"
    export BEELINK_GATE_SELF_CGROUP='${join(host, "self")}'/"$unit"
  fi
fi
exec "$command" "$@"
`);
  chmodSync(join(bin, "sudo"), 0o755);
  // systemctl answers for the managed slices' IOWeight, no legacy user units, and the units FAKE_UNITS_DIR records.
  writeFileSync(join(bin, "systemctl"), FAKE_SYSTEMCTL);
  chmodSync(join(bin, "systemctl"), 0o755);
  const fakeDf = join(bin, "df");
  writeFileSync(fakeDf, '#!/usr/bin/env bash\nprintf "Avail\\n%s\\n" "$(cat "${FAKE_AVAIL_FILE:-/nonexistent}" 2>/dev/null || echo "${FAKE_AVAIL:-1099511627776}")"\n');
  chmodSync(fakeDf, 0o755);
  // Keep ordinary fixture gates far from the synthetic weekly update window.
  const windowDay = (new Date().getUTCDay() + 3) % 7 + 1;
  const windowHour = 12;
  // A gate running these tests exports its own Rust settings, and the outer test runner its
  // NODE_TEST_CONTEXT, which makes a nested `node --test` skip its files and exit 0; start clean.
  const { CARGO_TARGET_DIR: _target, CARGO_INCREMENTAL: _incremental, BEELINK_GATE_CACHE_MAX_BYTES: _cacheCap, BEELINK_GATE_MAX_CONCURRENT: _slots, BEELINK_GATE_HEARTBEAT: _heartbeat, BEELINK_GATE_LAUNCHER: _launcher, BEELINK_GATE_MAX_HOLD: _hold, BEELINK_GATE_SHIP_WORKERS: _workers, BEELINK_GATE_ADMITTED: _admitted, BEELINK_GATE_AUTO: _auto, BEELINK_GATE_HOST_PRESSURE_CEILING: _ceiling, npm_config_store_dir: _store, npm_config_confirm_modules_purge: _purge, VITEST_MAX_WORKERS: _vw, VITEST_MAX_THREADS: _vt, VITEST_MAX_FORKS: _vf, TURBO_CONCURRENCY: _tc, CARGO_BUILD_JOBS: _cj, NODE_TEST_CONTEXT: _testContext, ...inherited } = process.env;
  // Fixture gates see a light host unless a test sets the load.
  const loadavg = join(root, "loadavg");
  writeFileSync(loadavg, "0.50 0.50 0.50 1/100 1\n");
  // The admission provider is Tangle Tools' contract; fixtures publish their own minimum through it.
  const diskPolicy = join(root, "disk-policy");
  mkdirSync(diskPolicy);
  writeFileSync(join(diskPolicy, "disk_policy.py"), readFileSync(resolve("tests/fixtures/beelink-gate/disk_policy.py")), { mode: 0o644 });
  writeFileSync(join(diskPolicy, "admission.json"), JSON.stringify({ admission_floor_bytes: FLOOR, reserved_bytes: 0 }));
  // Host CPU PSI admits every class; an unreadable one holds admission, so fixture hosts are idle unless a test loads them.
  const hostPressure = join(root, "host-pressure");
  writeFileSync(hostPressure, "some avg10=0.00 avg60=0.00 avg300=0.00 total=0\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n");
  const env = { ...inherited, FAKE_WU_DAY: String(windowDay), FAKE_WU_HOUR: String(windowHour), BEELINK_GATE_LOADAVG: loadavg, BEELINK_GATE_HOST_PRESSURE: hostPressure, BEELINK_GATE_LIMITS_FILE: join(root, "no-limits"), BEELINK_GATE_DISK_POLICY: join(diskPolicy, "disk_policy.py"), BEELINK_GATE_RESOURCE_POLICY: join(host, "resource-policy.json"), BEELINK_GATE_CGROUP_ROOT: join(host, "cgroup"), HOME: home, XDG_CACHE_HOME: join(home, ".cache"), TZ: "Etc/UTC", BEELINK_GATE_CACHE_ROOT: cache, BEELINK_GATE_SELF: "none", BEELINK_GATE_STATE_DIR: join(root, "state"), NPM_LOG: npmLog, PNPM_LOG: pnpmLog, PATH: `${bin}:${process.env.PATH}` };
  const url = `file://${bare}`;
  const call = (sha, args, options = {}) => run("bash", [gate, "--remote", ...[options.host ?? "beelink2", url, sha, options.noInstall ? "no-install" : "install", options.windowDay ?? windowDay, options.windowHour ?? windowHour, ...args].map(encode)], { env: { ...env, ...options.env } });
  return { root, home, cache, npmLog, pnpmLog, source, bare, env, url, windowDay, windowHour, first, second, call, git };
}

function installFakeSsh(f) {
  const fakeSsh = join(f.root, "bin", "ssh");
  writeFileSync(fakeSsh, `#!/usr/bin/env bash
args=("$@"); i=0
while [[ "\${args[$i]}" == -o ]]; do i=$((i + 2)); done
host=\${args[$i]}; rest=("\${args[@]:$((i + 1))}")
if [[ "\${rest[0]}" == reg ]]; then
  [[ "\${FAKE_REG_FAIL:-0}" == 0 ]] || exit 1
  printf '    ScheduledInstallDay    REG_DWORD    0x%x\\r\\n' "$FAKE_WU_DAY"
  printf '    ScheduledInstallTime   REG_DWORD    0x%x\\r\\n' "$FAKE_WU_HOUR"
  exit 0
fi
# Windows OpenSSH refuses an exec request whose command line passes about 32 KB.
if (( $(printf '%s ' "\${rest[@]}" | wc -c) > \${FAKE_SSH_ARGV_LIMIT:-32767} )); then
  echo "exec request failed on channel 0" >&2; exit 255
fi
printf '%s\\n' "$host \${rest[*]:0:3}" > '${join(f.root, "ssh-transport")}'
printf '%s\\n' "\${rest[*]:2}" > '${join(f.root, "ssh-remote-command")}'
printf '%s\\n' "\${rest[*]:2}" >> '${join(f.root, "ssh-remote-commands")}'
# FAKE_PROBE_DROPS names a file holding how many probe connections to drop, like a busy sshd.
if [[ -n "\${FAKE_PROBE_DROPS:-}" && " \${rest[*]} " == *" --probe "* ]]; then
  n=$(cat "$FAKE_PROBE_DROPS" 2>/dev/null || echo 0)
  if (( n > 0 )); then echo $((n - 1)) > "$FAKE_PROBE_DROPS"; exit 255; fi
fi
# FAKE_RECEIPT_DROPS names a file holding how many beelink1 receipt reads to drop. The request
# travels in the argv or, staged, on stdin.
if [[ -n "\${FAKE_RECEIPT_DROPS:-}" && "$host" == 100.98.195.7 ]]; then
  request=$(mktemp); cat > "$request"
  if [[ " \${rest[*]} " == *" --receipts "* ]] || grep -q -- --receipts "$request"; then
    n=$(cat "$FAKE_RECEIPT_DROPS" 2>/dev/null || echo 0)
    if (( n > 0 )); then echo $((n - 1)) > "$FAKE_RECEIPT_DROPS"; rm -f "$request"; exit 255; fi
  fi
  exec < "$request"; rm -f "$request"
fi
if [[ -n "\${FAKE_STAGE_PAUSE:-}" && "\${rest[*]}" == "wsl.exe -- bash -s" ]]; then
  touch "$FAKE_STAGE_PAUSE"
  while [[ ! -e "$FAKE_STAGE_PAUSE.release" ]]; do sleep 0.05; done
fi
[[ -z "\${FAKE_CACHE_PREFIX:-}" ]] || export BEELINK_GATE_CACHE_ROOT="$FAKE_CACHE_PREFIX-$host"
[[ -z "\${FAKE_AVAIL_PREFIX:-}" ]] || export FAKE_AVAIL_FILE="$FAKE_AVAIL_PREFIX-$host"
[[ -z "\${FAKE_LOAD_PREFIX:-}" ]] || export BEELINK_GATE_HOST_PRESSURE="$FAKE_LOAD_PREFIX-$host"
[[ -z "\${FAKE_HOST_PRESSURE_PREFIX:-}" ]] || export BEELINK_GATE_HOST_PRESSURE="$FAKE_HOST_PRESSURE_PREFIX-$host"
exec "\${rest[@]:2}"
`);
  chmodSync(fakeSsh, 0o755);
}

function installFakeUnits(f) {
  const units = join(f.root, "units");
  mkdirSync(units);
  writeFileSync(join(f.root, "bin", "systemd-run"), `#!/usr/bin/env bash
while [[ "$1" == --* ]]; do
  [[ "$1" == --unit=* ]] && unit=\${1#--unit=}
  shift
done
nohup "$@" </dev/null >/dev/null 2>&1 &
printf '%s\n' "$!" > "$FAKE_UNITS_DIR/$unit"
echo "Running as unit: $unit"
`);
  chmodSync(join(f.root, "bin", "systemd-run"), 0o755);
  return units;
}

test("reuses one checkout, cleans prior outputs, and receipts the requested SHA and command", () => {
  const f = fixture();
  try {
    const first = f.call(f.first, ["bash", "-c", "cat value.txt; touch generated.txt"]);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /first/);
    assert.match(first.stderr, new RegExp(`sha=${f.first} install=install command=bash -c`));
    assert.match(first.stderr, /exit=0 duration=\d+s/);
    const second = f.call(f.second, ["bash", "-c", "cat value.txt; test ! -e generated.txt"]);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /second/);
    assert.equal(f.git(["-C", join(f.cache, "local", "owner", "repo"), "rev-parse", "HEAD"]), f.second);
    assert.deepEqual(readdirSync(join(f.cache, "local", "owner")), ["repo"]);
    assert.deepEqual(readFileSync(f.npmLog, "utf8").trim().split("\n"), ["ci --cache " + f.home + "/.npm", "ci --cache " + f.home + "/.npm"]);
    const row = receipts(f).at(-1);
    assert.equal(row.reserve_basis, "measured");
    assert.equal(row.install_reserve_bytes, 10 * 1024 ** 3 + row.reserve_gate_bytes);
    assert.ok(row.reserve_gate_bytes >= 0 && row.reserve_gate_bytes < 1024 ** 2, JSON.stringify(row));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("gate command uses a safe default umask when the remote user unit inherits 0002", () => {
  const f = fixture();
  try {
    const remote = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour,
      "bash", "-c", "umask; mkdir probe-dir; stat -c %a probe-dir"].map(encode);
    const result = run("bash", ["-c", 'umask 0002; exec "$@"', "gate-test", "bash", gate, "--remote", ...remote], { env: { ...f.env, ...inUnit(f.root) } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /(?:^|\n)0022\n755(?:\n|$)/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("receipts identify the base, PR, lane, and observable reason for a repeated gate", () => {
  const f = fixture();
  try {
    const env = { BEELINK_GATE_PR: "417", FLEET_STATUS_FILE: "/tmp/op-company--beelink-gate-caps.md" };
    const failed = f.call(f.first, ["bash", "-c", "exit 7"], { env });
    assert.equal(failed.status, 7, failed.stderr);
    assert.equal(f.call(f.first, ["bash", "-c", "exit 7"], { env }).status, 7);
    assert.equal(f.call(f.first, ["true"], { env }).status, 0);
    assert.equal(f.call(f.first, ["true"], { env }).status, 0);

    writeFileSync(join(f.source, "value.txt"), "third\n");
    f.git(["commit", "-qam", "third"]);
    const third = f.git(["rev-parse", "HEAD"]);
    const defaultBranch = f.git(["--git-dir", f.bare, "symbolic-ref", "HEAD"], f.root);
    f.git(["--git-dir", f.bare, "fetch", f.source, third], f.root);
    f.git(["--git-dir", f.bare, "update-ref", defaultBranch, third], f.root);
    assert.equal(f.call(f.first, ["true"], { env }).status, 0);

    const rows = receipts(f);
    assert.deepEqual(rows.map((r) => r.reason), ["first", "after_red", "different_command", "after_green", "after_base_move"]);
    assert.deepEqual(rows.map((r) => r.base_sha), [f.second, f.second, f.second, f.second, third]);
    assert.ok(rows.every((r) => r.pr_number === 417 && r.lane === "op-company:beelink-gate-caps" && r.reason_scope === "host_last_10000_receipts"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("refreshes default, main, develop, and requested-head tracking refs without moving detached HEAD", () => {
  const f = fixture();
  try {
    f.git(["--git-dir", f.bare, "branch", "main", f.second], f.root);
    f.git(["--git-dir", f.bare, "branch", "develop", f.first], f.root);
    f.git(["--git-dir", f.bare, "branch", "fix/requested", f.first], f.root);
    f.git(["--git-dir", f.bare, "branch", "fix/unrelated", f.second], f.root);
    const defaultBranch = f.git(["--git-dir", f.bare, "symbolic-ref", "HEAD"], f.root).split("/").at(-1);
    const checkout = join(f.cache, "local", "owner", "repo");
    const firstGate = f.call(f.first, ["git", "rev-parse", "HEAD"]);
    assert.equal(firstGate.status, 0, firstGate.stderr);
    assert.equal(firstGate.stdout.trim(), f.first);
    for (const [branch, expected] of [[defaultBranch, f.second], ["main", f.second], ["develop", f.first], ["fix/requested", f.first]]) {
      assert.equal(f.git(["-C", checkout, "rev-parse", `refs/remotes/origin/${branch}`], f.root), expected);
    }
    const unrelated = run("git", ["-C", checkout, "show-ref", "--verify", "--quiet", "refs/remotes/origin/fix/unrelated"]);
    assert.equal(unrelated.status, 1);

    writeFileSync(join(f.source, "value.txt"), "third\n");
    f.git(["commit", "-qam", "third"]);
    const third = f.git(["rev-parse", "HEAD"]);
    f.git(["--git-dir", f.bare, "fetch", f.source, third], f.root);
    f.git(["--git-dir", f.bare, "update-ref", "refs/heads/main", third], f.root);
    const secondGate = f.call(f.first, ["true"]);
    assert.equal(secondGate.status, 0, secondGate.stderr);
    assert.equal(f.git(["-C", checkout, "rev-parse", "refs/remotes/origin/main"], f.root), third);
    assert.equal(f.git(["-C", checkout, "rev-parse", "HEAD"], f.root), f.first);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a failed command reports its exit code and an unsafe repository path is rejected", () => {
  const f = fixture();
  try {
    const result = f.call(f.first, ["bash", "-c", "exit 7"]);
    assert.equal(result.status, 7, result.stderr);
    assert.match(result.stderr, /exit=7 duration=\d+s/);
    // A failing stage of a piped test fails the gate, as discovery-lab #2097's `node --test ... | tail` did not.
    assert.equal(f.call(f.first, ["sh", "-c", "exit 5 | cat"]).status, 5);
    assert.equal(f.call(f.first, ["sh", "-c", "echo piped | cat"]).status, 0);
    assert.equal(f.call(f.first, ["bash", "-lc", "exit 5 | cat"]).status, 5);
    const invalid = run("bash", [gate, "--remote", ...["beelink2", "https://github.com/../repo.git", f.first, "install", f.windowDay, f.windowHour, "true"].map(encode)], { env: f.env });
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /unsafe repository path/);
    const wrongSha = run("bash", [gate, "beelink2", f.url, "abc", "--", "true"], { env: f.env });
    assert.equal(wrongSha.status, 2);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("concurrent gates for one repo serialize the entire command", async () => {
  const f = fixture();
  const events = join(f.root, "events");
  const launch = (id) => new Promise((resolveDone) => {
    const args = ["beelink2", f.url, f.first, "install", f.windowDay, f.windowHour, "bash", "-c", `echo start-${id} >> '${events}'; sleep 0.3; echo end-${id} >> '${events}'`].map(encode);
    const child = spawn("bash", [gate, "--remote", ...args], { env: { ...f.env, BEELINK_GATE_REPO_CHECKOUTS: "1" } });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolveDone({ status, stderr }));
  });
  try {
    const results = await Promise.all([launch("a"), launch("b")]);
    assert.ok(results.every((r) => r.status === 0), JSON.stringify(results));
    const lines = readFileSync(events, "utf8").trim().split("\n");
    assert.ok(["start-a,end-a,start-b,end-b", "start-b,end-b,start-a,end-a"].includes(lines.join(",")), lines.join(","));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("the GTR entrypoint sends the script and encoded arguments through WSL SSH", () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    const transportEnv = { ...f.env, FAKE_WU_DAY: String(f.windowDay), FAKE_WU_HOUR: String(f.windowHour) };
    const result = run(gate, ["beelink2", f.url, f.first, "--", "bash", "-c", "printf '%s' 'hello world'"], { env: transportEnv });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "hello world");
    assert.equal(readFileSync(join(f.root, "ssh-transport"), "utf8").trim(), "100.127.22.51 wsl.exe -- env");
    assert.match(result.stderr, /receipt: sha=/);
    const docs = run(gate, ["--no-install", "beelink2", f.url, f.first, "--", "cat", "value.txt"], { env: transportEnv });
    assert.equal(docs.status, 0, docs.stderr);
    assert.equal(docs.stdout, "first\n");
    assert.match(docs.stderr, /install=no-install/);
    assert.equal(readFileSync(f.npmLog, "utf8").trim().split("\n").length, 1);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a submitted gate survives its launcher and --attach replays its result", async () => {
  const f = fixture();
  installFakeSsh(f);
  const child = spawn(gate, ["--no-install", "beelink2", f.url, f.first, "--", "bash", "-c", "sleep 2; echo attached; exit 7"], { env: f.env });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    for (let i = 0; i < 2400 && !/submitted gate_id=/.test(stderr); i++) await sleepMs(25);
    const id = stderr.match(/submitted gate_id=(beelink2-[0-9a-f]{32})/)?.[1];
    assert.ok(id, stderr);
    child.kill("SIGTERM");
    await new Promise((done) => child.once("close", done));
    const attached = run(gate, ["--attach", id], { env: f.env });
    assert.equal(attached.status, 7, attached.stderr);
    assert.equal(attached.stdout.trim(), "attached");
    assert.match(attached.stderr, /receipt: .*exit=7 .*watchdog=0/);
    const receipt = JSON.parse(readFileSync(join(f.root, "state", "jobs", id, "receipt.json"), "utf8"));
    assert.equal(receipt.gate_id, id);
    assert.equal(receipt.exit, 7);
    assert.equal(receipt.watchdog, false);
    const oldExit = join(f.root, "state", "jobs", id, "exit");
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000);
    utimesSync(oldExit, yesterday, yesterday);
    const next = run(gate, ["--no-install", "beelink2", f.url, f.first, "--", "true"], { env: f.env });
    assert.equal(next.status, 0, next.stderr);
    assert.equal(existsSync(join(f.root, "state", "jobs", id)), false, "a later submission prunes expired reconnect logs");
    assert.equal(receipts(f).length, 2, "receipt history remains after reconnect logs expire");
  } finally {
    child.kill("SIGKILL");
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("opt-in launcher termination cancels its queued remote gate", async () => {
  const f = fixture();
  installFakeSsh(f);
  const units = join(f.root, "units");
  mkdirSync(units);
  writeFileSync(join(f.root, "bin", "systemd-run"), `#!/usr/bin/env bash
while [[ "$1" == --* ]]; do
  [[ "$1" == --unit=* ]] && unit=\${1#--unit=}
  shift
done
nohup setsid "$@" </dev/null >/dev/null 2>&1 &
printf '%s\\n' "$!" > "$FAKE_UNITS_DIR/$unit"
echo "Running as unit: $unit"
`);
  writeFileSync(join(f.root, "bin", "systemctl"), `#!/usr/bin/env bash
[[ "$1" == --user ]] && shift
# The managed slices' IOWeight and no legacy user units, as FAKE_SYSTEMCTL answers.
[[ "$1" == list-units ]] && exit 0
[[ " $* " == *" IOWeight "* ]] && { echo 100; exit 0; }
if [[ "$1" == stop ]]; then
  unit=\${2%.service}
  pid=$(cat "$FAKE_UNITS_DIR/$unit" 2>/dev/null) || exit 0
  kill -TERM "$pid" 2>/dev/null || true # gate.sh may have left the unit cgroup
  touch "$FAKE_UNITS_DIR/$unit.stopped"
  exit 0
fi
if [[ "$1" == show ]]; then
  unit=\${2%.service}
  [[ -e "$FAKE_UNITS_DIR/$unit.stopped" ]] && echo inactive || echo active
  exit 0
fi
exit 1
`);
  chmodSync(join(f.root, "bin", "systemctl"), 0o755);
  const env = { ...f.env, FAKE_UNITS_DIR: units, BEELINK_GATE_REPO_CHECKOUTS: "1" };
  const held = join(f.root, "held");
  const release = join(f.root, "release");
  const started = join(f.root, "started");
  const holder = spawn(gate, ["--no-install", "beelink2", f.url, f.first, "--", "bash", "-c", `touch '${held}'; while [ ! -e '${release}' ]; do sleep 0.1; done`], { env });
  const holderDone = new Promise((done) => holder.once("close", done));
  let holderErr = "";
  holder.stderr.on("data", (chunk) => { holderErr += chunk; });
  let waiter;
  try {
    for (let i = 0; i < 2400 && !existsSync(held); i++) await sleepMs(25);
    assert.ok(existsSync(held), holderErr);
    waiter = spawn(gate, ["--cancel-on-term", "--no-install", "beelink2", f.url, f.first, "--", "bash", "-c", `touch '${started}'`], { env, detached: true });
    const waiterDone = new Promise((done) => waiter.once("close", done));
    let waiterErr = "";
    waiter.stderr.on("data", (chunk) => { waiterErr += chunk; });
    for (let i = 0; i < 2400 && !/submitted gate_id=/.test(waiterErr); i++) await sleepMs(25);
    const id = waiterErr.match(/submitted gate_id=(beelink2-[0-9a-f]{32})/)?.[1];
    assert.ok(id, waiterErr);
    process.kill(-waiter.pid, "SIGTERM"); // systemd's default KillMode=control-group
    await waiterDone;
    const cancelMarker = join(f.root, "state", "jobs", ".canceled", id);
    for (let i = 0; i < 2400 && !existsSync(cancelMarker); i++) await sleepMs(25);
    assert.ok(existsSync(cancelMarker), `missing cancellation marker for ${id}: ${waiterErr}`);
    const attached = run(gate, ["--attach", id], { env, timeout: 10_000 });
    assert.equal(attached.status, 75, attached.stderr);
    assert.equal(existsSync(started), false, "cancellation reached the queued gate before admission");
    writeFileSync(release, "\n");
    await holderDone;
    assert.equal(existsSync(started), false, "the canceled gate must not run after the holder releases the checkout");
  } finally {
    writeFileSync(release, "\n");
    holder.kill("SIGKILL");
    waiter?.kill("SIGKILL");
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("stopping a queued remote unit terminates its gate after it leaves the unit cgroup", async () => {
  const f = fixture();
  installFakeSsh(f);
  const units = installFakeUnits(f);
  const env = { ...f.env, FAKE_UNITS_DIR: units, BEELINK_GATE_REPO_CHECKOUTS: "1" };
  const held = join(f.root, "held");
  const release = join(f.root, "release");
  const started = join(f.root, "started");
  const holder = spawn(gate, ["--no-install", "beelink2", f.url, f.first, "--", "bash", "-c", `touch '${held}'; while [ ! -e '${release}' ]; do sleep 0.1; done`], { env });
  const holderDone = new Promise((done) => holder.once("close", done));
  let holderErr = "";
  holder.stderr.on("data", (chunk) => { holderErr += chunk; });
  let waiter;
  try {
    for (let i = 0; i < 2400 && !existsSync(held); i++) await sleepMs(25);
    assert.ok(existsSync(held), holderErr);
    waiter = spawn(gate, ["--no-install", "beelink2", f.url, f.first, "--", "bash", "-c", `touch '${started}'`], { env });
    let waiterErr = "";
    waiter.stderr.on("data", (chunk) => { waiterErr += chunk; });
    for (let i = 0; i < 2400 && !/submitted gate_id=/.test(waiterErr); i++) await sleepMs(25);
    const id = waiterErr.match(/submitted gate_id=(beelink2-[0-9a-f]{32})/)?.[1];
    assert.ok(id, waiterErr);
    const job = join(f.root, "state", "jobs", id);
    for (let i = 0; i < 2400 && !(existsSync(join(job, "stderr.log")) && readFileSync(join(job, "stderr.log"), "utf8").includes("checkouts on beelink2")); i++) await sleepMs(25);
    assert.match(readFileSync(join(job, "stderr.log"), "utf8"), /checkouts on beelink2/);
    const runnerPid = Number(readFileSync(join(units, `beelink-gate-${id}`), "utf8"));
    process.kill(runnerPid, "SIGTERM"); // systemd stops the runner; the gate has moved to another cgroup.
    writeFileSync(release, "\n");
    await holderDone;
    for (let i = 0; i < 2400 && !existsSync(join(job, "exit")); i++) await sleepMs(25);
    assert.equal(existsSync(started), false, "the stopped unit's gate must not run after checkout release");
    assert.equal(readFileSync(join(job, "exit"), "utf8").trim(), "75");
    const attached = run(gate, ["--attach", id], { env, timeout: 10_000 });
    assert.equal(attached.status, 75, attached.stderr);
  } finally {
    writeFileSync(release, "\n");
    holder.kill("SIGKILL");
    waiter?.kill("SIGKILL");
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("job cancellation does not mark a moved gate terminal until its child stops", async () => {
  const f = fixture();
  installFakeSsh(f);
  const units = installFakeUnits(f);
  writeFileSync(join(f.root, "bin", "systemctl"), `#!/usr/bin/env bash
[[ "$1" == --user ]] && shift
# The managed slices' IOWeight and no legacy user units, as FAKE_SYSTEMCTL answers.
[[ "$1" == list-units ]] && exit 0
[[ " $* " == *" IOWeight "* ]] && { echo 100; exit 0; }
if [[ "$1" == stop ]]; then
  unit=\${2%.service}
  pid=$(cat "$FAKE_UNITS_DIR/$unit" 2>/dev/null) || exit 0
  kill -TERM "$pid" 2>/dev/null || true
  exit 0
fi
[[ "$1" == show ]] && { echo inactive; exit 0; }
exit 1
`);
  chmodSync(join(f.root, "bin", "systemctl"), 0o755);
  const env = { ...f.env, FAKE_UNITS_DIR: units, BEELINK_GATE_REPO_CHECKOUTS: "1" };
  const held = join(f.root, "held");
  const release = join(f.root, "release");
  const started = join(f.root, "started");
  const holder = spawn(gate, ["--no-install", "beelink2", f.url, f.first, "--", "bash", "-c", `touch '${held}'; while [ ! -e '${release}' ]; do sleep 0.1; done`], { env });
  const holderDone = new Promise((done) => holder.once("close", done));
  let holderErr = "";
  holder.stderr.on("data", (chunk) => { holderErr += chunk; });
  let waiter;
  try {
    for (let i = 0; i < 2400 && !existsSync(held); i++) await sleepMs(25);
    assert.ok(existsSync(held), holderErr);
    waiter = spawn(gate, ["--no-install", "beelink2", f.url, f.first, "--", "bash", "-c", `touch '${started}'`], { env });
    let waiterErr = "";
    waiter.stderr.on("data", (chunk) => { waiterErr += chunk; });
    for (let i = 0; i < 2400 && !/submitted gate_id=/.test(waiterErr); i++) await sleepMs(25);
    const id = waiterErr.match(/submitted gate_id=(beelink2-[0-9a-f]{32})/)?.[1];
    assert.ok(id, waiterErr);
    const job = join(f.root, "state", "jobs", id);
    for (let i = 0; i < 2400 && !(existsSync(join(job, "gate.pid")) && existsSync(join(job, "stderr.log")) && readFileSync(join(job, "stderr.log"), "utf8").includes("checkouts on beelink2")); i++) await sleepMs(25);
    assert.match(readFileSync(join(job, "stderr.log"), "utf8"), /checkouts on beelink2/);
    const runnerPid = Number(readFileSync(join(units, `beelink-gate-${id}`), "utf8"));
    process.kill(runnerPid, "SIGKILL"); // Simulates a runner that cannot run its TERM trap.
    const cancel = run(gate, ["--cancel-job", id], { env, timeout: 20_000 });
    assert.equal(cancel.status, 0, cancel.stderr);
    assert.equal(readFileSync(join(job, "exit"), "utf8").trim(), "75");
    writeFileSync(release, "\n");
    await holderDone;
    assert.equal(existsSync(started), false, "the canceled child must not run after checkout release");
  } finally {
    writeFileSync(release, "\n");
    holder.kill("SIGKILL");
    waiter?.kill("SIGKILL");
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("cancellation before staging finishes prevents a later submission", async () => {
  const f = fixture();
  installFakeSsh(f);
  const pause = join(f.root, "stage-pause");
  const started = join(f.root, "started");
  const env = { ...f.env, FAKE_STAGE_PAUSE: pause };
  const child = spawn(gate, ["--cancel-on-term", "--no-install", "beelink2", f.url, f.first, "--", "bash", "-c", `touch '${started}'`], { env });
  const exited = new Promise((done) => child.once("exit", done));
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    for (let i = 0; i < 2400 && !existsSync(pause); i++) await sleepMs(25);
    assert.ok(existsSync(pause), stderr);
    const id = stderr.match(/gate_id=(beelink2-[0-9a-f]{32})/)?.[1];
    assert.ok(id, stderr);
    child.kill("SIGTERM");
    await exited;
    const marker = join(f.root, "state", "jobs", ".canceled", id);
    for (let i = 0; i < 2400 && !existsSync(marker); i++) await sleepMs(25);
    assert.ok(existsSync(marker), stderr);
    writeFileSync(`${pause}.release`, "\n");
    const staged = join(f.root, "state", "jobs", id, "gate.sh");
    for (let i = 0; i < 2400 && !existsSync(staged); i++) await sleepMs(25);
    assert.ok(existsSync(staged), stderr);
    const args = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "bash", "-c", `touch '${started}'`].map(encode);
    const submission = run("bash", [gate, "--job-submit", id, ...args], { env, timeout: 10_000 });
    assert.equal(submission.status, 75, submission.stderr);
    assert.equal(existsSync(started), false);
  } finally {
    writeFileSync(`${pause}.release`, "\n");
    child.kill("SIGKILL");
    rmSync(f.root, { recursive: true, force: true });
  }
});

// #705: SSH exits 255 when the transport drops; the launcher asks the job's own exit file, then re-attaches
// to the same gate with backoff instead of handing its caller a TEMPFAIL or submitting a second gate.
test("a dropped attach connection re-attaches to the same gate and returns its output and exit once", () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    const drops = join(f.root, "attach-drops");
    const front = join(f.root, "front");
    mkdirSync(front);
    writeFileSync(join(front, "ssh"), `#!/usr/bin/env bash
for arg in "$@"; do
  if [[ "$arg" == --job-attach ]]; then
    n=$(cat '${drops}' 2>/dev/null || echo 0)
    if (( n > 0 )); then echo $((n - 1)) > '${drops}'; exit 255; fi
  fi
done
exec '${join(f.root, "bin", "ssh")}' "$@"
`);
    chmodSync(join(front, "ssh"), 0o755);
    const env = { ...f.env, PATH: `${front}:${f.env.PATH}` };
    writeFileSync(drops, "2\n");
    const result = run(gate, ["--pin-host", "--no-install", "beelink2", f.url, f.first, "--", "bash", "-c", "cat value.txt; exit 7"], { env, timeout: 120_000 });
    assert.equal(result.status, 7, result.stderr);
    assert.equal(result.stdout, "first\n");
    const id = result.stderr.match(/submitted gate_id=(beelink2-[0-9a-f]{32})/)?.[1];
    assert.ok(id, result.stderr);
    assert.match(result.stderr, new RegExp(`attach connection lost for ${id}; re-attaching \\(attempt 1 of 6\\)`));
    assert.match(result.stderr, new RegExp(`attach connection lost for ${id}; re-attaching \\(attempt 2 of 6\\)`));
    assert.doesNotMatch(result.stderr, /attempt 3 of 6|TEMPFAIL/);
    const submits = readFileSync(join(f.root, "ssh-remote-commands"), "utf8").split("\n").filter((line) => line.includes("--job-submit"));
    assert.equal(submits.length, 1, "the re-attach replays the submitted gate instead of submitting another");
    assert.equal(receipts(f).length, 1);
    // An explicit --attach whose connection drops re-attaches the same way.
    writeFileSync(drops, "1\n");
    const attached = run(gate, ["--attach", id], { env, timeout: 60_000 });
    assert.equal(attached.status, 7, attached.stderr);
    assert.equal(attached.stdout, "first\n");
    assert.match(attached.stderr, new RegExp(`attach connection lost for ${id}; re-attaching \\(attempt 1 of 6\\)`));
    assert.equal(receipts(f).length, 1);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a command exit of 255 is not reported as a lost attach connection", () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    const result = run(gate, ["--no-install", "beelink2", f.url, f.first, "--", "bash", "-c", "exit 255"], { env: f.env });
    assert.equal(result.status, 255, result.stderr);
    assert.match(result.stderr, /receipt: .*exit=255 .*watchdog=0/);
    assert.doesNotMatch(result.stderr, /attach connection lost/);
    const id = result.stderr.match(/submitted gate_id=(beelink2-[0-9a-f]{32})/)?.[1];
    assert.ok(id, result.stderr);
    const attached = run(gate, ["--attach", id], { env: f.env });
    assert.equal(attached.status, 255, attached.stderr);
    assert.match(attached.stderr, /receipt: .*exit=255 .*watchdog=0/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a post-admission disk refusal receipts cleanup in a detached job", () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    const dfCount = join(f.root, "df-count");
    writeFileSync(join(f.root, "bin", "df"), `#!/usr/bin/env bash
count=0
[[ -r '${dfCount}' ]] && read -r count < '${dfCount}'
count=$((count + 1))
printf '%s\\n' "$count" > '${dfCount}'
if (( count < 7 )); then available=1099511627776; else available=128849018880; fi
printf 'Avail\\n%s\\n' "$available"
`);
    chmodSync(join(f.root, "bin", "df"), 0o755);
    const env = { ...f.env, FAKE_WU_DAY: String(f.windowDay), FAKE_WU_HOUR: String(f.windowHour) };
    const result = run(gate, ["beelink2", f.url, f.first, "--", "true"], { env, timeout: 10_000 });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 75, result.stderr);
    assert.match(result.stderr, /lock, host slot and admission .* admitted on beelink2 after \d+s/);
    assert.match(result.stderr, /REFUSED beelink2 has \d+ bytes free - 0 bytes reserved - \d+ bytes requested = -?\d+, below its 161061273600 byte disk floor/);
    assert.match(result.stderr, /TEMPFAIL next_allowed=\S+Z beelink2 is below its (operational )?disk floor/);
    assert.equal(readFileSync(dfCount, "utf8").trim(), "8", "the floor changed after the probe, initial and pre-lock admission checks");
    assert.match(result.stderr, new RegExp(`receipt: sha=${f.first} .*exit=75`));
    const [receipt] = receipts(f);
    assert.equal(receipt.exit, 75);
    assert.equal(existsSync(join(f.cache, ".locks", "local-owner-repo.lock.holder")), false);
    assert.equal(readFileSync(join(f.root, "state", "jobs", receipt.gate_id, "exit"), "utf8").trim(), "75");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("Windows policy is required and a blocked start reports the next allowed time", () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    const now = new Date();
    const nextHour = new Date(now.getTime() + 60 * 60_000);
    const day = nextHour.getUTCDay() + 1;
    const hour = nextHour.getUTCHours();
    const env = { ...f.env, FAKE_WU_DAY: String(day), FAKE_WU_HOUR: String(hour) };
    const refused = run(gate, ["beelink2", f.url, f.first, "--", "true"], { env });
    assert.equal(refused.status, 75, refused.stderr);
    assert.match(refused.stderr, /REFUSED beelink2 Windows Update is scheduled/);
    assert.match(refused.stderr, /next allowed .* UTC\)/);
    assert.match(refused.stderr.trim().split("\n").at(-1), new RegExp(`^beelink-gate: TEMPFAIL next_allowed=${windowEnd(nextHour)} beelink2 is in its Windows Update window$`));
    assert.equal(existsSync(f.cache), false);
    // The refused start cached the policy; a failed read then uses it.
    const cached = run(gate, ["beelink2", f.url, f.first, "--", "true"], { env: { ...env, FAKE_REG_FAIL: "1" } });
    assert.equal(cached.status, 75, cached.stderr);
    assert.match(cached.stderr, /using the cached Windows Update policy for beelink2/);
    const unreadable = run(gate, ["beelink2", f.url, f.first, "--", "true"], { env: { ...env, FAKE_REG_FAIL: "1", BEELINK_GATE_STATE_DIR: join(f.root, "fresh-state") } });
    assert.equal(unreadable.status, 75);
    assert.match(unreadable.stderr, /cannot read Windows Update schedule.*refusing to start/);
    assert.match(unreadable.stderr, /TEMPFAIL next_allowed=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ cannot read the Windows Update schedule of beelink2/);
    assert.equal(existsSync(f.cache), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// 2026-10-11 08:00Z: both beelinks were in their update windows, auto printed
// "no beelink can start this gate" with exit 3, and the landing chain recorded
// "FAIL pre-gate red" (L1 queue.result, r1527 at 5980b3a8).
test("no gate, urgent included, is admitted while host-wide CPU pressure is over its ceiling", () => {
  const f = fixture();
  try {
    const host = join(f.root, "host-pressure");
    const hostLine = (avg10) => `some avg10=${avg10.toFixed(2)} avg60=0.00 avg300=0.00 total=1\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=1\n`;
    writeFileSync(host, hostLine(90));
    const wait = { BEELINK_GATE_HOST_PRESSURE: host, BEELINK_GATE_LOAD_WAIT: "2s", BEELINK_GATE_LOAD_POLL_SECONDS: "1" };
    const urgent = f.call(f.first, ["true"], { noInstall: true, env: { ...wait, BEELINK_GATE_URGENT: "1" } });
    assert.equal(urgent.status, 75, urgent.stderr);
    assert.match(urgent.stderr, /REFUSED beelink2 host CPU PSI some avg10 holds admission: \{[^\n]*"some_avg10":90\.0,"limit":20\.0,"held":true/);
    assert.doesNotMatch(urgent.stderr, /URGENT: admitting/);
    // max_cpu_pressure in the limits file raises the ceiling, read at every check.
    writeFileSync(f.env.BEELINK_GATE_LIMITS_FILE, "max_cpu_pressure=95\n");
    const raised = f.call(f.first, ["true"], { noInstall: true, env: wait });
    assert.equal(raised.status, 0, raised.stderr);
    assert.match(raised.stderr, /admission \{[^\n]*"some_avg10":90\.0,"limit":95\.0,"held":false/);
    rmSync(f.env.BEELINK_GATE_LIMITS_FILE);
    writeFileSync(host, hostLine(12));
    const calm = f.call(f.first, ["true"], { noInstall: true, env: wait });
    assert.equal(calm.status, 0, calm.stderr);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a gate command larger than Windows' SSH command line limit reaches the host intact", () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    // 2026-10-18: a 23 KB patch, base64 encoded in argv, became 41,676 bytes and the exec was refused.
    const payload = randomBytes(15_000).toString("hex").slice(0, 40_000).padEnd(40_000, "x");
    const result = run(gate, ["--pin-host", "beelink2", f.url, f.first, "--", "bash", "-c", 'printf %s "$1" | sha256sum', "_", payload],
      { env: f.env, timeout: 30_000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(createHash("sha256").update(payload).digest("hex")));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a refused SSH exec fails loud with its payload size, not as a lost connection", () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    const result = run(gate, ["--pin-host", "beelink2", f.url, f.first, "--", "true"],
      { env: { ...f.env, FAKE_SSH_ARGV_LIMIT: "300" }, timeout: 30_000 });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /beelink2 refused the SSH exec request for beelink2-[0-9a-f]+ \(\d+ bytes of encoded arguments\); no gate was submitted/);
    assert.doesNotMatch(result.stderr, /submit connection lost|TEMPFAIL/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("an auto-placed gate gives back a host that fell below its disk floor, so the launcher can place it again", () => {
  const f = fixture();
  try {
    const args = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "true"].map(encode);
    const low = { ...f.env, FAKE_AVAIL: String(140 * 2 ** 30) };
    const auto = run("bash", [gate, "--remote", ...args], { env: { ...low, BEELINK_GATE_AUTO: "1" } });
    assert.equal(auto.status, 76, auto.stderr);
    assert.match(auto.stderr, /beelink2 gave the gate back before admission \(beelink2 is below its operational disk floor or its policy is unknown\); placing the gate again/);
    assert.doesNotMatch(auto.stderr, /TEMPFAIL/);
    // A gate sent to a named host still reports TEMPFAIL with its next allowed time.
    const named = run("bash", [gate, "--remote", ...args], { env: low });
    assert.equal(named.status, 75, named.stderr);
    assert.match(named.stderr, /TEMPFAIL next_allowed=\S+Z beelink2 is below its (operational )?disk floor/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("auto exits TEMPFAIL with the earliest time either host allows when both refuse", () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    const nextHour = new Date(Date.now() + 60 * 60_000);
    const env = { ...f.env, FAKE_WU_DAY: String(nextHour.getUTCDay() + 1), FAKE_WU_HOUR: String(nextHour.getUTCHours()) };
    const refused = run(gate, ["--ship", "auto", f.url, f.first], { env });
    assert.equal(refused.status, 75, refused.stderr);
    assert.match(refused.stderr, /no beelink can start this gate \(beelink1: host=beelink1 state=refused .*REFUSED beelink1 Windows Update/);
    assert.equal(refused.stderr.trim().split("\n").at(-1), `beelink-gate: TEMPFAIL next_allowed=${windowEnd(nextHour)} no beelink can start this gate`);
    // Normal auto briefly creates FIFO tickets before probing. A refusal must
    // remove them without creating a checkout.
    assert.deepEqual(readdirSync(join(f.cache, ".locks")).filter((name) => name.startsWith("queue-")), []);
    assert.equal(existsSync(join(f.cache, "local", "owner", "repo")), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("the local update window follows Pacific DST and handles the missing spring hour", () => {
  const probe = (at) => run("bash", [gate, "--window-probe", "beelink2", "1", "2", "America/Los_Angeles", at]);
  const daylight = probe("2026-10-25T08:30:00Z");
  assert.equal(daylight.status, 3, daylight.stderr);
  assert.match(daylight.stderr, /next allowed 2026-10-25 02:30 PDT \(2026-10-25 09:30 UTC\)/);
  assert.equal(daylight.stdout.trim(), "2026-10-25T09:30:00Z");
  const firstFallHour = probe("2026-11-01T08:30:00Z");
  assert.equal(firstFallHour.status, 0, firstFallHour.stderr);
  const repeatedFallHour = probe("2026-11-01T09:30:00Z");
  assert.equal(repeatedFallHour.status, 3, repeatedFallHour.stderr);
  assert.match(repeatedFallHour.stderr, /next allowed 2026-11-01 02:30 PST \(2026-11-01 10:30 UTC\)/);
  const spring = probe("2027-03-14T09:30:00Z");
  assert.equal(spring.status, 3, spring.stderr);
  assert.match(spring.stderr, /scheduled Sunday 2027-03-14 03:00 PDT/);
  assert.match(spring.stderr, /next allowed 2027-03-14 03:30 PDT \(2027-03-14 10:30 UTC\)/);
});

test("pnpm lockfile selects frozen install with one shared store", () => {
  const f = fixture();
  try {
    rmSync(join(f.source, "package-lock.json"));
    writeFileSync(join(f.source, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    f.git(["add", "-A"]); f.git(["commit", "-qm", "pnpm lock"]);
    const sha = f.git(["rev-parse", "HEAD"]);
    f.git(["--git-dir", f.bare, "fetch", f.source, sha], f.root);
    const result = f.call(sha, ["true"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(f.pnpmLog, "utf8").trim(), `install --frozen-lockfile --store-dir ${f.home}/.local/share/pnpm/store`);
    const docs = f.call(sha, ["true"], { noInstall: true });
    assert.equal(docs.status, 0, docs.stderr);
    assert.match(docs.stderr, /install=no-install/);
    assert.equal(readFileSync(f.pnpmLog, "utf8").trim().split("\n").length, 1);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("installs and runs with the repo's .nvmrc Node and rebuilds addons built for another ABI, sparing the store copy", () => {
  const f = fixture();
  try {
    rmSync(join(f.source, "package-lock.json"));
    writeFileSync(join(f.source, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    writeFileSync(join(f.source, ".nvmrc"), "99.0.0\n");
    // The build policy lives in the repo, as pnpm keeps it; the generated .modules.yaml does not repeat it.
    writeFileSync(join(f.source, "pnpm-workspace.yaml"), "allowBuilds:\n  fake-native: true\n  fake-skipped: false\n  '@scope/fake-missing': true\n");
    f.git(["add", "-A"]); f.git(["commit", "-qm", "pnpm lock, build policy and nvmrc"]);
    const sha = f.git(["rev-parse", "HEAD"]);
    f.git(["--git-dir", f.bare, "fetch", f.source, sha], f.root);
    // nvm selects a Node 99 whose NODE_MODULE_VERSION is 999.
    const nvmBin = join(f.root, "nvm-bin");
    mkdirSync(nvmBin);
    writeFileSync(join(nvmBin, "node"), `#!/usr/bin/env bash\ncase "$*" in\n  -v) echo v99.0.0 ;;\n  "-p process.versions.modules") echo 999 ;;\n  "-p "*process.versions.modules*) echo "999 v99.0.0 $0" ;;\n  *) exec '${process.execPath}' "$@" ;;\nesac\n`);
    chmodSync(join(nvmBin, "node"), 0o755);
    mkdirSync(join(f.home, ".nvm"));
    writeFileSync(join(f.home, ".nvm", "nvm.sh"), `nvm() { [ "$1" = use ] && export PATH='${nvmBin}':"$PATH"; }\n`);
    // The store's copy of an addon built for ABI 1, which install links into node_modules.
    const storeCopy = join(f.root, "store-fake.node");
    writeFileSync(storeCopy, "node_register_module_v1");
    const pnpm = `#!/usr/bin/env bash
printf "%s\\n" "$*" >> "$PNPM_LOG"
p=node_modules/.pnpm
case "$1" in
  install)
    for n in fake-native fake-skipped fake-unlisted @scope/fake-missing; do mkdir -p "$p/\${n/\\//+}@1.0.0/node_modules/$n"; touch "$p/\${n/\\//+}@1.0.0/node_modules/$n/binding.gyp"; done
    mkdir -p $p/fake-native@1.0.0/node_modules/fake-native/build/Release
    ln -f '${storeCopy}' $p/fake-native@1.0.0/node_modules/fake-native/build/Release/fake.node
    printf '{"ignoredBuilds":[],"layoutVersion":5}' > node_modules/.modules.yaml ;;
  exec) shift; exec "$@" ;;
  rebuild)
    shift; [ "$1" = --store-dir ] && shift 2
    for n in "$@"; do [ "$n" = "\${FAKE_REBUILD_SKIPS:-}" ] && continue; d=$(echo $p/*/node_modules/$n); mkdir -p $d/build/Release; printf 'node_register_module_v%s' "$(node -p process.versions.modules)" > $d/build/Release/addon.node; done ;;
esac
`;
    writeFileSync(join(f.root, "bin", "pnpm"), pnpm);
    const result = f.call(sha, ["bash", "-c", "node -v"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "v99.0.0\n", "the command runs with the .nvmrc Node");
    const calls = readFileSync(f.pnpmLog, "utf8").trim().split("\n");
    assert.deepEqual(calls, [
      `install --frozen-lockfile --store-dir ${f.home}/.local/share/pnpm/store`,
      'exec node -p process.versions.modules+" "+process.version+" "+process.execPath',
      `rebuild --store-dir ${f.home}/.local/share/pnpm/store @scope/fake-missing fake-native`,
    ]);
    assert.equal(readFileSync(storeCopy, "utf8"), "node_register_module_v1", "the store copy is untouched");
    assert.match(result.stderr, /rebuilding native addons for node v99\.0\.0 via pnpm: @scope\/fake-missing missing addon fake-native abi 1->999/);
    assert.match(result.stderr, /node=v99\.0\.0 via pnpm rebuild=@scope\/fake-missing missing addon fake-native abi 1->999/);
    const row = JSON.parse(readFileSync(join(f.root, "state", "receipts.jsonl"), "utf8").trim().split("\n").at(-1));
    assert.equal(row.node, "v99.0.0 via pnpm");
    assert.equal(row.rebuild, "@scope/fake-missing missing addon fake-native abi 1->999");
    // The next gate installs again; its addons match the Node, so nothing rebuilds.
    writeFileSync(storeCopy, "node_register_module_v999");
    const again = f.call(sha, ["true"]);
    assert.equal(again.status, 0, again.stderr);
    assert.equal(readFileSync(f.pnpmLog, "utf8").trim().split("\n").filter((line) => line.startsWith("rebuild")).length, 2, "a missing addon still rebuilds; a matching ABI does not");
    assert.match(again.stderr, /rebuild=@scope\/fake-missing missing addon/);
    // A rebuild that leaves an addon unloadable fails the gate before the command runs.
    const stale = f.call(sha, ["bash", "-c", "echo command-ran"], { env: { FAKE_REBUILD_SKIPS: "@scope/fake-missing" } });
    assert.equal(stale.status, 1, stale.stderr);
    assert.doesNotMatch(stale.stdout, /command-ran/);
    assert.match(stale.stderr, /NATIVE ADDONS STILL STALE after pnpm rebuild/);
    assert.match(stale.stderr, /rebuild=failed: @scope\/fake-missing missing addon/);
    // A .nvmrc the host cannot honor refuses the gate instead of running under another Node.
    rmSync(join(f.home, ".nvm"), { recursive: true });
    const noNvm = f.call(sha, ["true"]);
    assert.equal(noNvm.status, 2, noNvm.stderr);
    assert.match(noNvm.stderr, /\.nvmrc asks for Node 99\.0\.0 and beelink2 has no nvm/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("reads the addon ABI from the Node pnpm launches, not plain node, and rebuilds with it", () => {
  const f = fixture();
  try {
    rmSync(join(f.source, "package-lock.json"));
    writeFileSync(join(f.source, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    f.git(["add", "-A"]); f.git(["commit", "-qm", "pnpm lock"]);
    const sha = f.git(["rev-parse", "HEAD"]);
    f.git(["--git-dir", f.bare, "fetch", f.source, sha], f.root);
    // Plain node on PATH is Node 22 (ABI 127); the Node pnpm launches for scripts is Node 24 (ABI 137).
    const stubNode = (dir, abi, version) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "node"), `#!/usr/bin/env bash\ncase "$*" in\n  -v) echo ${version} ;;\n  "-p process.versions.modules") echo ${abi} ;;\n  "-p "*process.versions.modules*) echo "${abi} ${version} $0" ;;\n  *) exec '${process.execPath}' "$@" ;;\nesac\n`);
      chmodSync(join(dir, "node"), 0o755);
    };
    stubNode(join(f.root, "bin"), 127, "v22.23.3");
    const pnpmNode = join(f.root, "pnpm-node");
    stubNode(pnpmNode, 137, "v24.1.0");
    writeFileSync(join(f.root, "bin", "pnpm"), `#!/usr/bin/env bash
printf "%s\\n" "$*" >> "$PNPM_LOG"
d=node_modules/.pnpm/better-sqlite3@12.4.1/node_modules/better-sqlite3
case "$1" in
  install) mkdir -p $d/build/Release; touch $d/binding.gyp; printf 'node_register_module_v127' > $d/build/Release/better_sqlite3.node ;;
  exec) [ -z "\${FAKE_PNPM_EXEC_FAILS:-}" ] || exit 1; shift; PATH='${pnpmNode}':"$PATH" exec "$@" ;;
  rebuild) mkdir -p $d/build/Release; printf 'node_register_module_v%s' "$(PATH='${pnpmNode}':"$PATH" node -p process.versions.modules)" > $d/build/Release/better_sqlite3.node ;;
esac
`);
    const result = f.call(sha, ["bash", "-c", "node -v"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "v22.23.3\n", "plain node on PATH is the other Node");
    assert.match(result.stderr, /rebuilding native addons for node v24\.1\.0 via pnpm: better-sqlite3 abi 127->137/);
    assert.match(result.stderr, /node=v24\.1\.0 via pnpm rebuild=better-sqlite3 abi 127->137/);
    assert.deepEqual(readFileSync(f.pnpmLog, "utf8").trim().split("\n").map((line) => line.split(" ")[0]), ["install", "exec", "rebuild"]);
    assert.match(readFileSync(f.pnpmLog, "utf8"), /^rebuild --store-dir \S+ better-sqlite3$/m);
    const row = JSON.parse(readFileSync(join(f.root, "state", "receipts.jsonl"), "utf8").trim().split("\n").at(-1));
    assert.equal(row.node, "v24.1.0 via pnpm");
    assert.equal(row.rebuild, "better-sqlite3 abi 127->137");
    // When pnpm cannot launch its Node, the gate reads plain node and says so.
    const fallback = f.call(sha, ["true"], { env: { FAKE_PNPM_EXEC_FAILS: "1" } });
    assert.equal(fallback.status, 0, fallback.stderr);
    assert.match(fallback.stderr, /node=v22\.23\.3 via node \(pnpm exec failed\) rebuild=none/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a login-shell command installs, probes and runs with the Node its profile selects", () => {
  const f = fixture();
  try {
    rmSync(join(f.source, "package-lock.json"));
    writeFileSync(join(f.source, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    f.git(["add", "-A"]); f.git(["commit", "-qm", "pnpm lock, no .nvmrc"]);
    const sha = f.git(["rev-parse", "HEAD"]);
    f.git(["--git-dir", f.bare, "fetch", f.source, sha], f.root);
    // 2026-10-21, both Beelinks: the unit's PATH starts at /usr/local/bin/node 22 (ABI 127); a login shell's profile
    // puts nvm's default 24 (ABI 137) first, so agent-knowledge's `sh -lc` tests could not load better-sqlite3.
    const stubNode = (dir, abi, version) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "node"), `#!/usr/bin/env bash\ncase "$*" in\n  -v) echo ${version} ;;\n  "-p process.versions.modules") echo ${abi} ;;\n  "-p "*process.versions.modules*) echo "${abi} ${version} $0" ;;\n  *) exec '${process.execPath}' "$@" ;;\nesac\n`);
      chmodSync(join(dir, "node"), 0o755);
    };
    stubNode(join(f.root, "bin"), 127, "v22.23.3");
    const loginNode = join(f.root, "login-node");
    stubNode(loginNode, 137, "v24.21.0");
    writeFileSync(join(f.home, ".bash_profile"), `export PATH='${loginNode}':"$PATH"\n`);
    // Install builds the addon for whichever Node is first on PATH, as pnpm does.
    writeFileSync(join(f.root, "bin", "pnpm"), `#!/usr/bin/env bash
printf "%s\\n" "$*" >> "$PNPM_LOG"
d=node_modules/.pnpm/better-sqlite3@12.4.1/node_modules/better-sqlite3
case "$1" in
  install) mkdir -p $d/build/Release; touch $d/binding.gyp; printf 'node_register_module_v%s' "$(node -p process.versions.modules)" > $d/build/Release/better_sqlite3.node ;;
  exec) shift; exec "$@" ;;
  rebuild) mkdir -p $d/build/Release; printf 'node_register_module_v%s' "$(node -p process.versions.modules)" > $d/build/Release/better_sqlite3.node ;;
esac
`);
    const result = f.call(sha, ["sh", "-lc", "node -v; cat node_modules/.pnpm/better-sqlite3@12.4.1/node_modules/better-sqlite3/build/Release/better_sqlite3.node"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "v24.21.0\nnode_register_module_v137", "the command and the install use the login shell's Node");
    assert.match(result.stderr, /using the login shell's node v24\.21\.0 for the install and the command/);
    assert.match(result.stderr, /node=v24\.21\.0 via pnpm rebuild=none/);
    // A plain `-c` command keeps the unit's PATH, as before.
    const plain = f.call(sha, ["bash", "-c", "node -v"]);
    assert.equal(plain.status, 0, plain.stderr);
    assert.match(plain.stdout, /v22\.23\.3\n$/);
    assert.doesNotMatch(plain.stderr, /login shell's node/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("docs-only gate verifies the requested SHA without installing dependencies", () => {
  const f = fixture();
  try {
    const result = f.call(f.first, ["bash", "-c", "test -f package-lock.json && cat value.txt"], { noInstall: true });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "first\n");
    assert.match(result.stderr, /install=no-install/);
    assert.equal(readdirSync(f.root).includes("npm.log"), false);
    const invalid = run("bash", [gate, "--remote", ...["beelink2", f.url, f.first, "unknown", f.windowDay, f.windowHour, "true"].map(encode)], { env: f.env });
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /unknown install mode/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("rebuilds a partial cache before a command that reads historical blobs", () => {
  const f = fixture();
  try {
    const checkout = join(f.cache, "local", "owner", "repo");
    mkdirSync(join(f.cache, "local", "owner"), { recursive: true });
    f.git(["--git-dir", f.bare, "config", "uploadpack.allowFilter", "true"], f.root);
    f.git(["init", "-q", checkout], f.root);
    f.git(["-C", checkout, "remote", "add", "origin", f.url], f.root);
    f.git(["-C", checkout, "fetch", "--no-tags", "--filter=blob:none", "origin", f.second], f.root);
    f.git(["-C", checkout, "checkout", "--detach", "--force", f.second], f.root);
    assert.equal(f.git(["-C", checkout, "config", "--get", "remote.origin.promisor"], f.root), "true");
    const before = f.git(["-C", checkout, "rev-list", "--objects", "--missing=print", "HEAD", "--", "value.txt"], f.root);
    assert.match(before, /^\?/m);

    const result = f.call(f.second, ["bash", "-c", "git blame --line-porcelain -- value.txt >/dev/null"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /rebuilding partial cache/);
    const promisor = run("git", ["-C", checkout, "config", "--get", "remote.origin.promisor"]);
    assert.equal(promisor.status, 1);
    const after = f.git(["-C", checkout, "rev-list", "--objects", "--missing=print", "HEAD", "--", "value.txt"], f.root);
    assert.doesNotMatch(after, /^\?/m);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("refuses below the selected host's floor before creating a cache", () => {
  const f = fixture();
  try {
    const available = 120 * 1024 ** 3;
    setAdmission(f, FLOOR, 0, { beelink1: 100 * 1024 ** 3 });
    const refused = f.call(f.first, ["true"], { env: { FAKE_AVAIL: String(available) } });
    assert.equal(refused.status, 75);
    assert.match(refused.stderr, /REFUSED beelink2 has \d+ bytes free - 0 bytes reserved - \d+ bytes requested = -?\d+, below its 161061273600 byte disk floor/);
    assert.match(refused.stderr, /TEMPFAIL next_allowed=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ beelink2 is below its (operational )?disk floor/);
    assert.equal(existsSync(f.cache), false);
    const allowed = f.call(f.first, ["true"], { host: "beelink1", env: { FAKE_AVAIL: String(available) } });
    assert.equal(allowed.status, 0, allowed.stderr);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("admission is free minus live reservations minus the request against the lifecycle minimum; a local disk_floor_gib is retired", () => {
  const f = fixture();
  try {
    const limits = join(f.root, "no-limits");
    // A static local floor above free space no longer charges the gate; it says the key is retired.
    writeFileSync(limits, "disk_floor_gib=210\n");
    const retired = f.call(f.first, ["true"], { env: { FAKE_AVAIL: String(205 * 1024 ** 3) } });
    assert.equal(retired.status, 0, retired.stderr);
    assert.match(retired.stderr, /disk_floor_gib in \S+ is retired and ignored/);
    // A live lifecycle reservation counts against free space and the refusal names every term.
    setAdmission(f, FLOOR, 60 * 1024 ** 3);
    const reserved = f.call(f.first, ["true"], { env: { FAKE_AVAIL: String(205 * 1024 ** 3) } });
    assert.equal(reserved.status, 75, reserved.stderr);
    assert.match(reserved.stderr, new RegExp(`REFUSED beelink2 has ${205 * 1024 ** 3} bytes free - ${60 * 1024 ** 3} bytes reserved - \\d+ bytes requested = -?\\d+, below its ${FLOOR} byte disk floor`));
    setAdmission(f);
    // A disk_floor_gib below the minimum cannot lower it either.
    writeFileSync(limits, "disk_floor_gib=100\n");
    const floored = f.call(f.first, ["true"], { env: { FAKE_AVAIL: String(140 * 1024 ** 3) } });
    assert.equal(floored.status, 75, floored.stderr);
    assert.match(floored.stderr, new RegExp(`below its ${FLOOR} byte disk floor`));
    // An unknown provider refuses growth.
    rmSync(join(f.root, "disk-policy", "admission.json"));
    const unknown = f.call(f.first, ["true"], { env: { FAKE_AVAIL: String(400 * 1024 ** 3) } });
    assert.equal(unknown.status, 75, unknown.stderr);
    assert.match(unknown.stderr, /authoritative disk floor unavailable or invalid; growth refused/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("auto uses the repo's last install reserve before choosing a host", () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    const floor = 200 * 1024 ** 3;
    const availPrefix = join(f.root, "free");
    const cachePrefix = join(f.root, "host-cache");
    writeFileSync(`${availPrefix}-100.98.195.7`, String(floor + 20 * 1024 ** 3));
    writeFileSync(`${availPrefix}-100.127.22.51`, String(floor + 1024 ** 3));
    setAdmission(f, 200 * 1024 ** 3);
    mkdirSync(f.env.BEELINK_GATE_STATE_DIR, { recursive: true });
    writeFileSync(join(f.env.BEELINK_GATE_STATE_DIR, "receipts.jsonl"),
      `${JSON.stringify({ host: "beelink2", repo: "local/owner/repo", mode: "install", install_reserve_bytes: 11 * 1024 ** 3 })}\n`);
    const result = run(gate, ["auto", f.url, f.first, "--", "true"],
      { env: { ...f.env, FAKE_AVAIL_PREFIX: availPrefix, FAKE_CACHE_PREFIX: cachePrefix }, timeout: 20_000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /auto chose beelink1.*beelink2: host=beelink2 state=refused/);
    assert.match(result.stderr, /bytes requested = -?\d+, below its \d+ byte disk floor/);
    assert.match(result.stderr, /receipt: .*host=beelink1/);
    assert.equal(existsSync(join(`${cachePrefix}-100.98.195.7`, "local", "owner", "repo")), true);
    assert.equal(existsSync(join(`${cachePrefix}-100.127.22.51`, "local", "owner", "repo")), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// A fixture commit whose .beelink-gate/sparse-checkout excludes history/, gated on a named
// beelink2 through the launcher with a 200 GiB floor; free space per host comes from free.
function shapedReserveFixture(f, freeGiB) {
  installFakeSsh(f);
  const sha = publish(f, "shaped", () => {
    mkdirSync(join(f.source, ".beelink-gate"));
    writeFileSync(join(f.source, ".beelink-gate", "sparse-checkout"), "# run data\n/*\n!/history/\n");
  });
  const spec = `sha256:${createHash("sha256").update("/*\n!/history/\n").digest("hex")}`;
  const availPrefix = join(f.root, "free");
  const setFree = (gib) => writeFileSync(`${availPrefix}-100.127.22.51`, String((200 + gib) * 1024 ** 3));
  writeFileSync(`${availPrefix}-100.98.195.7`, String(600 * 1024 ** 3));
  setFree(freeGiB);
  setAdmission(f, 200 * 1024 ** 3);
  mkdirSync(f.env.BEELINK_GATE_STATE_DIR, { recursive: true });
  const seed = (...rows) => writeFileSync(join(f.env.BEELINK_GATE_STATE_DIR, "receipts.jsonl"),
    rows.map((row) => typeof row === "string" ? row : JSON.stringify({ repo: "local/owner/repo", mode: "install", ...row })).join("\n") + "\n", { flag: "a" });
  const gateOn = (target = sha, env = {}) => run(gate, ["beelink2", f.url, target, "--", "true"],
    { env: { ...f.env, FAKE_AVAIL_PREFIX: availPrefix, FAKE_CACHE_PREFIX: join(f.root, "host-cache"), ...env }, timeout: 30_000 });
  return { sha, spec, seed, gateOn, setFree };
}

test("an install reserve measured on another checkout shape is ignored, and one of the same shape is used", () => {
  const f = fixture();
  try {
    const { spec, seed, gateOn } = shapedReserveFixture(f, 15);
    // A full-clone receipt from before receipts named their shape: 28 GiB, and 15 GiB free above the floor.
    seed({ host: "beelink2", install_reserve_bytes: 28 * 1024 ** 3 });
    const admitted = gateOn();
    assert.equal(admitted.status, 0, admitted.stderr);
    assert.match(admitted.stderr, new RegExp(`install reserve 10737418240 bytes from the 10 GiB headroom \\(no receipt for checkout shape ${spec}\\)`));
    assert.match(admitted.stderr, /receipt: .* sparse=repo /);
    assert.equal(receipts(f).at(-1).sparse_spec, spec);

    seed({ host: "beelink2", sparse_spec: spec, install_reserve_bytes: 20 * 1024 ** 3 });
    const refused = gateOn();
    assert.equal(refused.status, 75, refused.stderr);
    assert.match(refused.stderr, new RegExp(`install reserve 21474836480 bytes from beelink2's newest cold receipt for checkout shape ${spec}`));
    assert.match(refused.stderr, /21474836480 bytes requested = -?\d+, below its 214748364800 byte disk floor/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a host with no receipt of the gated checkout shape uses the other beelink's", () => {
  const f = fixture();
  try {
    const { spec, seed, gateOn } = shapedReserveFixture(f, 12);
    seed({ host: "beelink2", install_reserve_bytes: 28 * 1024 ** 3 }, { host: "beelink1", sparse_spec: spec, install_reserve_bytes: 13 * 1024 ** 3 });
    // The headroom alone would admit 12 GiB above the floor; beelink1's measured 13 GiB does not.
    const refused = gateOn();
    assert.equal(refused.status, 75, refused.stderr);
    assert.match(refused.stderr, new RegExp(`install reserve 13958643712 bytes from the other beelink's newest cold receipt for checkout shape ${spec}`));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a malformed or older receipt never loosens the install reserve", () => {
  const f = fixture();
  try {
    const { spec, seed, gateOn } = shapedReserveFixture(f, 15);
    seed({ host: "beelink2", sparse_spec: spec, install_reserve_bytes: 30 * 1024 ** 3 },
      { host: "beelink2", sparse_spec: spec, install_reserve_bytes: 20 * 1024 ** 3 },
      { host: "beelink2", sparse_spec: spec, install_reserve_bytes: 5 },
      { host: "beelink2", sparse_spec: spec, install_reserve_bytes: "11000000000" },
      { host: "beelink2", sparse_spec: "sha256:not-a-digest", install_reserve_bytes: 10 * 1024 ** 3 + 1 },
      { host: "beelink2", sparse: "repo", install_reserve_bytes: 10 * 1024 ** 3 + 2 },
      { host: "beelink2", sparse_spec: spec, checkout_temperature: "lukewarm", install_reserve_bytes: 10 * 1024 ** 3 + 3 },
      { host: "beelink2", sparse_spec: spec, checkout_temperature: "warm", install_reserve_bytes: 10 * 1024 ** 3 + 4 },
      '{"host": "beelink2", "repo": "local/owner/repo", "install_reserve_bytes": 10737418243');
    const refused = gateOn();
    assert.equal(refused.status, 75, refused.stderr);
    assert.match(refused.stderr, new RegExp(`install reserve 21474836480 bytes from beelink2's newest cold receipt for checkout shape ${spec}`));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("the first warm gate pays the cold reserve of its shape until a warm receipt exists, and receipts record temperature", () => {
  const f = fixture();
  try {
    const { spec, seed, gateOn, setFree } = shapedReserveFixture(f, 15);
    const clone = gateOn();
    assert.equal(clone.status, 0, clone.stderr);
    assert.match(clone.stderr, / checkout=cold /);
    assert.equal(receipts(f).at(-1).checkout_temperature, "cold");

    seed({ host: "beelink2", sparse_spec: spec, checkout_temperature: "cold", install_reserve_bytes: 12 * 1024 ** 3 });
    const firstWarm = gateOn();
    assert.equal(firstWarm.status, 0, firstWarm.stderr);
    assert.match(firstWarm.stderr, new RegExp(`install reserve 12884901888 bytes from beelink2's newest cold receipt for checkout shape ${spec}; a warm checkout pays it until a beelink has a warm receipt of its shape`));
    assert.match(firstWarm.stderr, / checkout=warm /);
    assert.equal(receipts(f).at(-1).checkout_temperature, "warm");
    const warmReserve = receipts(f).at(-1).install_reserve_bytes;
    assert.ok(warmReserve >= 10 * 1024 ** 3 && warmReserve < 10 * 1024 ** 3 + 1024 ** 2, String(warmReserve));

    // 11 GiB free above the floor: the cold reserve would refuse, the warm receipt admits.
    setFree(11);
    seed({ host: "beelink2", sparse_spec: spec, checkout_temperature: "cold", install_reserve_bytes: 12 * 1024 ** 3 });
    const warm = gateOn();
    assert.equal(warm.status, 0, warm.stderr);
    assert.match(warm.stderr, new RegExp(`install reserve ${warmReserve} bytes from beelink2's newest warm receipt for checkout shape ${spec}`));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a warm gate with no warm receipt of its shape on its host uses the other beelink's", () => {
  const f = fixture();
  try {
    const { spec, seed, gateOn } = shapedReserveFixture(f, 12);
    assert.equal(gateOn().status, 0);
    seed({ host: "beelink2", sparse_spec: spec, checkout_temperature: "cold", install_reserve_bytes: 14 * 1024 ** 3 },
      { host: "beelink1", sparse_spec: spec, checkout_temperature: "warm", install_reserve_bytes: 10 * 1024 ** 3 + 512 * 1024 ** 2 });
    const warm = gateOn();
    assert.equal(warm.status, 0, warm.stderr);
    assert.match(warm.stderr, new RegExp(`install reserve 11274289152 bytes from the other beelink's newest warm receipt for checkout shape ${spec}`));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a warm checkout of another shape than the gated commit pays the cold reserve", () => {
  const f = fixture();
  try {
    const { spec, seed, gateOn } = shapedReserveFixture(f, 15);
    // The cached checkout is full (f.second commits no patterns); the gated commit is sparse.
    assert.equal(gateOn(f.second).status, 0);
    seed({ host: "beelink2", sparse_spec: spec, checkout_temperature: "warm", install_reserve_bytes: 10 * 1024 ** 3 },
      { host: "beelink2", sparse_spec: spec, checkout_temperature: "cold", install_reserve_bytes: 20 * 1024 ** 3 });
    const refused = gateOn();
    assert.equal(refused.status, 75, refused.stderr);
    assert.match(refused.stderr, new RegExp(`install reserve 21474836480 bytes from beelink2's newest cold receipt for checkout shape ${spec}\\n`));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a warm checkout that its own prune evicts between admission and install is judged on the cold reserve before it clones", () => {
  const f = fixture();
  try {
    const { spec, seed, gateOn } = shapedReserveFixture(f, 15);
    assert.equal(gateOn().status, 0);
    seed({ host: "beelink2", sparse_spec: spec, checkout_temperature: "warm", install_reserve_bytes: 10 * 1024 ** 3 },
      { host: "beelink2", sparse_spec: spec, checkout_temperature: "cold", install_reserve_bytes: 20 * 1024 ** 3 });
    // A cap below one checkout: the precheck prune, after admission, evicts this gate's own checkout.
    const raced = gateOn(undefined, { BEELINK_GATE_CACHE_MAX_BYTES: "1000" });
    assert.equal(raced.status, 75, raced.stderr);
    assert.match(raced.stderr, new RegExp(`install reserve 10737418240 bytes from beelink2's newest warm receipt for checkout shape ${spec}`));
    assert.match(raced.stderr, /evicted LRU cache .*local\/owner\/repo/);
    assert.match(raced.stderr, /left the cache after admission, so this gate clones it; judging it on the cold reserve/);
    assert.match(raced.stderr, new RegExp(`install reserve 21474836480 bytes from beelink2's newest cold receipt for checkout shape ${spec}`));
    assert.match(raced.stderr, /21474836480 bytes requested = -?\d+, below its 214748364800 byte disk floor/);
    assert.doesNotMatch(raced.stderr, /fetching /);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("the recorded reserve is the gate's own bytes, a store file hardlinked into node_modules counted once, not the host's free-space drop", () => {
  const f = fixture();
  try {
    publish(f, "pnpm", () => { rmSync(join(f.source, "package-lock.json")); writeFileSync(join(f.source, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n"); });
    const sha = f.git(["rev-parse", "HEAD"]);
    // The install adds one 3 MB file to the store and hardlinks it into node_modules,
    // while another lane writes 50 GB elsewhere on the host.
    writeFileSync(join(f.root, "bin", "pnpm"), `#!/usr/bin/env bash
printf "%s\\n" "$*" >> "$PNPM_LOG"
[ "$1" = install ] || exit 0
while [ $# -gt 0 ]; do [ "$1" = --store-dir ] && store=$2; shift; done
mkdir -p "$store/v10/files/aa" node_modules/pkg
[ -e "$store/v10/files/aa/blob" ] || head -c 3000000 /dev/zero > "$store/v10/files/aa/blob"
ln -f "$store/v10/files/aa/blob" node_modules/pkg/blob
echo $(( $(cat "$FAKE_AVAIL_FILE") - 50000000000 )) > "$FAKE_AVAIL_FILE"
`);
    const avail = join(f.root, "avail");
    writeFileSync(avail, String(1024 ** 4));
    const env = { FAKE_AVAIL_FILE: avail };
    const cold = f.call(sha, ["test", "-f", "node_modules/pkg/blob"], { env });
    assert.equal(cold.status, 0, cold.stderr);
    assert.match(cold.stderr, /install reserve after install: gate bytes \+\d+ \(checkout and package stores, du \d+ ms\); host free fell \d+ bytes over the same window; records \d+ \(measured\)/);
    let row = receipts(f).at(-1);
    assert.equal(row.reserve_basis, "measured");
    // Counting the hardlink twice would be 6 MB; the tiny clone adds well under 1 MB.
    assert.ok(row.reserve_gate_bytes >= 3_000_000 && row.reserve_gate_bytes < 4_000_000, JSON.stringify(row));
    assert.ok(row.reserve_host_free_drop >= 50_000_000_000, JSON.stringify(row));
    assert.equal(row.install_reserve_bytes, 10 * 1024 ** 3 + row.reserve_gate_bytes);

    const warm = f.call(sha, ["test", "-f", "node_modules/pkg/blob"], { env });
    assert.equal(warm.status, 0, warm.stderr);
    row = receipts(f).at(-1);
    assert.equal(row.checkout_temperature, "warm");
    assert.ok(row.reserve_gate_bytes < 1024 ** 2 && row.reserve_host_free_drop >= 50_000_000_000, JSON.stringify(row));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("the reserve measures the store the frozen install writes, even when the environment names another", () => {
  const f = fixture();
  try {
    publish(f, "pnpm", () => { rmSync(join(f.source, "package-lock.json")); writeFileSync(join(f.source, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n"); });
    const sha = f.git(["rev-parse", "HEAD"]);
    // The install writes 3 MB into the --store-dir the gate passes it.
    writeFileSync(join(f.root, "bin", "pnpm"), `#!/usr/bin/env bash
[ "$1" = install ] || exit 0
while [ $# -gt 0 ]; do [ "$1" = --store-dir ] && store=$2; shift; done
mkdir -p "$store/v10/files/bb" && head -c 3000000 /dev/zero > "$store/v10/files/bb/blob"
`);
    const custom = join(f.root, "custom-store");
    mkdirSync(custom);
    const result = f.call(sha, ["true"], { env: { npm_config_store_dir: custom } });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(f.home, ".local", "share", "pnpm", "store", "v10", "files", "bb", "blob")));
    const row = receipts(f).at(-1);
    assert.ok(row.reserve_gate_bytes >= 3_000_000, `the install store's 3 MB were left out: ${JSON.stringify(row)}`);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a measurement of the gate's bytes is cut at the gate's remaining hold, so the lock is never held past it", () => {
  const f = fixture();
  try {
    // du for the gate's bytes (--total) hangs; the cache pruner's own du is untouched.
    writeFileSync(join(f.root, "bin", "du"), `#!/usr/bin/env bash
[[ " $* " == *" --total "* ]] && exec sleep 40
exec /usr/bin/du "$@"
`);
    chmodSync(join(f.root, "bin", "du"), 0o755);
    const started = Date.now();
    const result = f.call(f.first, ["true"], { env: { BEELINK_GATE_MAX_HOLD: "6s" } });
    const elapsed = (Date.now() - started) / 1000;
    // The spent hold stops the next step, git ls-remote, which the gate reports as TEMPFAIL.
    assert.equal(result.status, 75, result.stderr);
    assert.match(result.stderr, /hold limit of 6s reached/);
    // A fixed 60 s bound let the first hung measurement alone hold the lock for 40 s.
    assert.ok(receipts(f).at(-1).ran_s <= 15 && elapsed < 30, `held ${receipts(f).at(-1).ran_s}s (wall ${elapsed}s) against a 6 s hold`);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a measurement whose du ignores TERM is still cut at the gate's remaining hold", () => {
  const f = fixture();
  try {
    // An ignored signal survives exec, so this du outlives a TERM.
    writeFileSync(join(f.root, "bin", "du"), `#!/usr/bin/env bash
if [[ " $* " == *" --total "* ]]; then trap '' TERM; exec sleep 40; fi
exec /usr/bin/du "$@"
`);
    chmodSync(join(f.root, "bin", "du"), 0o755);
    const result = f.call(f.first, ["true"], { env: { BEELINK_GATE_MAX_HOLD: "6s" } });
    assert.equal(result.status, 75, result.stderr);
    assert.match(result.stderr, /hold limit of 6s reached/);
    // A KILL sent five seconds after the TERM held the lock to about 12 s.
    assert.ok(receipts(f).at(-1).ran_s <= 9, `held ${receipts(f).at(-1).ran_s}s against a 6 s hold`);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a measurement of the gate's bytes that times out or fails records the cold reserve, never less than the headroom", () => {
  const f = fixture();
  try {
    // du for the gate's bytes (--total) misbehaves; the cache pruner's own du is untouched.
    writeFileSync(join(f.root, "bin", "du"), `#!/usr/bin/env bash
if [[ " $* " == *" --total "* ]]; then
  case "\${FAKE_DU_TOTAL:-}" in
    timeout) exit 124 ;;
    fail) echo "du: cannot read directory '/store/v10': Permission denied" >&2; printf '123\\ttotal\\n'; exit 1 ;;
  esac
fi
exec /usr/bin/du "$@"
`);
    chmodSync(join(f.root, "bin", "du"), 0o755);
    mkdirSync(f.env.BEELINK_GATE_STATE_DIR, { recursive: true });
    const seeded = join(f.env.BEELINK_GATE_STATE_DIR, "receipts.jsonl");
    writeFileSync(seeded, `${JSON.stringify({ host: "beelink2", repo: "local/owner/repo", mode: "install", install_reserve_bytes: 13 * 1024 ** 3 })}\n`);
    for (const fault of ["timeout", "fail"]) {
      const result = f.call(f.first, ["true"], { env: { FAKE_DU_TOTAL: fault } });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /could not measure this gate's own bytes after install; recording the cold reserve/);
      const row = receipts(f).at(-1);
      assert.equal(row.reserve_basis, "cold_fallback", fault);
      assert.equal(row.install_reserve_bytes, 13 * 1024 ** 3, fault);
    }
    // With no receipt to fall back on, the headroom: never zero.
    rmSync(seeded);
    const bare = f.call(f.first, ["true"], { env: { FAKE_DU_TOTAL: "timeout" } });
    assert.equal(bare.status, 0, bare.stderr);
    assert.equal(receipts(f).at(-1).install_reserve_bytes, 10 * 1024 ** 3);
    assert.equal(receipts(f).at(-1).reserve_basis, "cold_fallback");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a symlinked cache checkout cannot redirect cleaning or eviction outside the cache", () => {
  const f = fixture();
  try {
    const external = join(f.root, "external");
    mkdirSync(external);
    f.git(["init", "-q", external], f.root);
    writeFileSync(join(external, "keep"), "owned elsewhere");
    mkdirSync(join(f.cache, "local", "owner"), { recursive: true });
    symlinkSync(external, join(f.cache, "local", "owner", "repo"));
    const result = f.call(f.first, ["true"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /cache path contains a symlink/);
    assert.equal(readFileSync(join(external, "keep"), "utf8"), "owned elsewhere");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a Git worktree inside the cache path is never cleaned or rebuilt", () => {
  const f = fixture();
  try {
    const checkout = join(f.cache, "local", "owner", "repo");
    mkdirSync(join(f.cache, "local", "owner"), { recursive: true });
    f.git(["remote", "add", "origin", f.url]);
    f.git(["worktree", "add", "-q", "-b", "decoy", checkout]);
    writeFileSync(join(checkout, "keep"), "lane-owned\n");
    const result = f.call(f.first, ["true"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /not an owned checkout/);
    assert.equal(readFileSync(join(checkout, "keep"), "utf8"), "lane-owned\n");
    assert.equal(f.git(["-C", checkout, "branch", "--show-current"], f.root), "decoy");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

function cacheSlot(f, name, usedSeconds) {
  const dir = join(f.cache, "github.com", "test", name);
  mkdirSync(dir, { recursive: true });
  f.git(["init", "-q", dir], f.root);
  writeFileSync(join(dir, "payload"), Buffer.alloc(750_000));
  const marker = join(dir, ".git", "beelink-gate-used");
  writeFileSync(marker, "");
  utimesSync(marker, usedSeconds, usedSeconds);
  return dir;
}

test("evicts the least recently used idle checkout before fetching", () => {
  const f = fixture();
  try {
    const older = cacheSlot(f, "older", 1000);
    const newer = cacheSlot(f, "newer", 2000);
    const result = f.call(f.first, ["true"], { env: { BEELINK_GATE_CACHE_MAX_BYTES: "1300000" } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(older), false);
    assert.equal(existsSync(newer), true);
    assert.match(result.stderr, /evicted LRU cache .*older/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("cache cap remeasures after evicting a checkout hardlinked to another", () => {
  const f = fixture();
  try {
    const older = cacheSlot(f, "older", 1000);
    const newer = cacheSlot(f, "newer", 2000);
    rmSync(join(newer, "payload"));
    linkSync(join(older, "payload"), join(newer, "payload"));
    // The shared payload still occupies the cache after only the older link is removed.
    // Both idle checkouts must be gone before the command starts under this cap.
    const result = f.call(f.first, ["bash", "-c", 'test ! -e "$NEWER"'], {
      env: { BEELINK_GATE_CACHE_MAX_BYTES: "600000", NEWER: newer },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(older), false);
    assert.equal(existsSync(newer), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("evicts the completed checkout if its command takes the cache over cap", () => {
  const f = fixture();
  try {
    const result = f.call(f.first, ["node", "-e", 'require("fs").writeFileSync("large.bin",Buffer.alloc(750000))'],
      { env: { BEELINK_GATE_CACHE_MAX_BYTES: "300000" } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(f.cache, "local", "owner", "repo")), false);
    assert.match(result.stderr, /evicted LRU cache .*local\/owner\/repo/);
    assert.match(result.stderr, /exit=0/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("cache sizing tolerates vanished files but rejects other du errors", () => {
  const f = fixture();
  try {
    const fakeDu = join(f.root, "bin", "du");
    writeFileSync(fakeDu, `#!/usr/bin/env bash
/usr/bin/du "$@"
status=$?
if [[ "\${@: -1}" == "$BEELINK_GATE_CACHE_ROOT" ]]; then
  printf "du: cannot access '%s/vanished': %s\\n" "$BEELINK_GATE_CACHE_ROOT" "$DU_FAULT" >&2
  exit 1
fi
exit "$status"
`);
    chmodSync(fakeDu, 0o755);
    const vanished = f.call(f.first, ["true"], { env: { DU_FAULT: "No such file or directory" } });
    assert.equal(vanished.status, 0, vanished.stderr);
    const denied = f.call(f.first, ["true"], { env: { DU_FAULT: "Permission denied" } });
    // Cache accounting never decides the gate: the command's own exit stands, and the receipt says so.
    assert.equal(denied.status, 0, denied.stderr);
    assert.match(denied.stderr, /cache prune failed/);
    assert.match(denied.stderr, /receipt: .*cache=unpruned/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("an active repo lock protects its checkout during LRU eviction", async () => {
  const f = fixture();
  const marker = join(f.root, "locked");
  try {
    const older = cacheSlot(f, "older", 1000);
    const newer = cacheSlot(f, "newer", 2000);
    const lockPath = join(f.cache, ".locks", "github.com-test-older.lock");
    mkdirSync(join(f.cache, ".locks"), { recursive: true });
    // The lock lives until the test releases it: a fixed few seconds raced the gate's prune on a loaded host.
    const locker = spawn("flock", ["-x", lockPath, "bash", "-c", `touch '${marker}'; sleep 60`], { env: f.env, detached: true });
    try {
      for (let i = 0; i < 2400 && !existsSync(marker); i++) await new Promise((resolveDone) => setTimeout(resolveDone, 20));
      assert.equal(existsSync(marker), true);
      const result = f.call(f.first, ["true"], { env: { BEELINK_GATE_CACHE_MAX_BYTES: "1000000" } });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(existsSync(older), true);
      assert.equal(existsSync(newer), false);
    } finally { process.kill(-locker.pid); }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// Commits a change to the fixture source and makes it reachable on the fixture remote.
function publish(f, name, edit) {
  edit();
  f.git(["add", "-A"]);
  f.git(["commit", "-qm", name]);
  const sha = f.git(["rev-parse", "HEAD"]);
  f.git(["--git-dir", f.bare, "fetch", "-q", f.source, sha], f.root);
  f.git(["--git-dir", f.bare, "update-ref", `refs/heads/${name}`, sha], f.root);
  return sha;
}

// An idle, fully checked-out cache checkout of github.com/<owner>/<name> holding these files.
function idleCheckout(f, owner, name, files, usedSeconds) {
  const dir = join(f.cache, "github.com", owner, name);
  mkdirSync(join(f.cache, ".locks"), { recursive: true });
  mkdirSync(dir, { recursive: true });
  f.git(["init", "-q", dir], f.root);
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  f.git(["-C", dir, "add", "."], f.root);
  f.git(["-C", dir, "commit", "-qm", "seed"], f.root);
  const marker = join(dir, ".git", "beelink-gate-used");
  writeFileSync(marker, "");
  utimesSync(marker, usedSeconds, usedSeconds);
  return dir;
}

const sparseConfig = (dir) => run("git", ["-C", dir, "config", "--bool", "core.sparseCheckout"]).stdout.trim();

test("a repo's committed sparse patterns keep excluded paths out of every gate checkout until it drops them", () => {
  const f = fixture();
  try {
    const checkout = join(f.cache, "local", "owner", "repo");
    const plain = f.call(f.second, ["true"]);
    assert.equal(plain.status, 0, plain.stderr);
    assert.match(plain.stderr, / sparse=none checkout=/);
    assert.equal(receipts(f).at(-1).sparse, null);
    assert.equal(sparseConfig(checkout), "", "a repo without patterns keeps a full checkout");

    const sparse = publish(f, "sparse", () => {
      mkdirSync(join(f.source, ".beelink-gate"));
      mkdirSync(join(f.source, "history", "run"), { recursive: true });
      writeFileSync(join(f.source, ".beelink-gate", "sparse-checkout"), "# run data no gated command reads\n/*\n!/history/\n");
      writeFileSync(join(f.source, "history", "run", "result.json"), "{}\n");
    });
    const full = publish(f, "full", () => rmSync(join(f.source, ".beelink-gate"), { recursive: true }));
    const check = ["bash", "-c", "test -f value.txt && test -f .beelink-gate/sparse-checkout && test ! -e history"];
    const first = f.call(sparse, check);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stderr, /applying repo sparse patterns to \S+: \/\* !\/history\//);
    assert.match(first.stderr, / sparse=repo checkout=/);
    assert.equal(receipts(f).at(-1).sparse, "repo");
    // A later gate keeps the patterns without setting them again.
    const again = f.call(sparse, check);
    assert.equal(again.status, 0, again.stderr);
    assert.doesNotMatch(again.stderr, /applying repo sparse patterns/);
    assert.equal(receipts(f).at(-1).sparse, "repo");
    assert.equal(sparseConfig(checkout), "true");

    const restored = f.call(full, ["test", "-f", "history/run/result.json"]);
    assert.equal(restored.status, 0, restored.stderr);
    assert.match(restored.stderr, /has no sparse patterns at \S+; restoring its full tree/);
    assert.equal(receipts(f).at(-1).sparse, null);
    assert.equal(sparseConfig(checkout), "false");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("the cache prune applies the sparse patterns an idle checkout's HEAD commits, never to a locked checkout or one whose HEAD has none", async () => {
  const f = fixture();
  const marker = join(f.root, "locked");
  try {
    const committed = { ".beelink-gate/sparse-checkout": "/*\n!/pursuits/\n", "runner/a.mjs": "a\n", "pursuits/old/run.json": Buffer.alloc(400_000), "prereg/x/input.json": "{}\n" };
    const lab = idleCheckout(f, "tangle-network", "discovery-lab", committed, 1000);
    const busy = idleCheckout(f, "tangle-network", "discovery-lab@1", committed, 1000);
    // No default for any repo: a Lab checkout whose HEAD predates the file stays full.
    const old = idleCheckout(f, "tangle-network", "discovery-lab@dev", { "runner/a.mjs": "a\n", "pursuits/old/run.json": Buffer.alloc(400_000) }, 2000);
    // A sparse checkout left at a HEAD without the file (its checkout of a newer commit failed) stays sparse: the prune only shrinks.
    const stranded = idleCheckout(f, "tangle-network", "discovery-lab@light", { "runner/a.mjs": "a\n", "pursuits/old/run.json": Buffer.alloc(400_000) }, 2000);
    f.git(["-C", stranded, "sparse-checkout", "set", "--no-cone", "/*", "!/pursuits/"], f.root);
    const locker = spawn("flock", ["-x", join(f.cache, ".locks", "github.com-tangle-network-discovery-lab@1.lock"), "bash", "-c", `touch '${marker}'; sleep 30`], { env: f.env });
    try {
      for (let i = 0; i < 2400 && !existsSync(marker); i++) await sleepMs(20);
      assert.equal(existsSync(marker), true);
      const result = f.call(f.first, ["true"]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /applying repo sparse patterns to \S+discovery-lab: \/\* !\/pursuits\//);
      assert.doesNotMatch(result.stderr, /restoring its full tree/);
    } finally { locker.kill(); }
    assert.equal(existsSync(join(lab, "pursuits")), false);
    assert.equal(existsSync(join(lab, "prereg", "x", "input.json")), true);
    assert.equal(existsSync(join(lab, "runner", "a.mjs")), true);
    assert.equal(sparseConfig(lab), "true");
    assert.equal(existsSync(join(busy, "pursuits", "old", "run.json")), true, "an active gate's checkout is not touched");
    assert.equal(existsSync(join(old, "pursuits", "old", "run.json")), true);
    assert.equal(sparseConfig(old), "");
    assert.equal(existsSync(join(stranded, "pursuits")), false, "the prune never restores a full tree");
    assert.equal(sparseConfig(stranded), "true");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a slow cache measurement admits a parallel gate within five seconds", async (t) => {
  const f = fixture();
  const measuring = join(f.root, "measuring");
  const release = join(f.root, "release-measurement");
  const admitted = join(f.root, "parallel-command");
  // Delay the real du at the process boundary in just the first gate. Both
  // gates use the real admission path, flock, Git checkouts and receipts.
  writeFileSync(join(f.root, "bin", "du"), `#!/usr/bin/env bash
if [[ "\${SLOW_CACHE_MEASUREMENT:-0}" == 1 && "$*" != *--total* ]]; then
  touch '${measuring}'
  while [[ ! -e '${release}' ]]; do sleep 0.02; done
fi
exec /usr/bin/du "$@"
`);
  chmodSync(join(f.root, "bin", "du"), 0o755);
  const launch = (args, extra = {}) => {
    const child = spawn("bash", [gate, "--remote", ...["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, ...args].map(encode)],
      { env: { ...f.env, BEELINK_GATE_CAPACITY_INTENT_WAIT_SECONDS: "3", ...extra }, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdout.resume();
    const done = new Promise((resolveDone) => child.on("close", (status) => resolveDone({ status, stderr })));
    return { child, done };
  };
  let first, second;
  try {
    first = launch(["true"], { SLOW_CACHE_MEASUREMENT: "1" });
    for (let i = 0; i < 500 && !existsSync(measuring); i++) await sleepMs(20);
    assert.equal(existsSync(measuring), true, "first gate never reached measurement");
    const start = Date.now();
    second = launch(["touch", admitted]);
    while (Date.now() - start < 5000 && !existsSync(admitted)) await sleepMs(20);
    const admissionMs = Date.now() - start;
    assert.equal(existsSync(admitted), true, `parallel gate not admitted within 5 s (${admissionMs} ms)`);
    assert.equal(existsSync(release), false, "measurement must still be blocked at admission");
    writeFileSync(release, "");
    const results = await Promise.all([first.done, second.done]);
    for (const result of results) {
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(result.stderr, /TEMPFAIL.*capacity writer intent/);
    }
    assert.equal(receipts(f).filter((r) => r.exit === 0).length, 2);
    t.diagnostic(JSON.stringify({ admission_ms: admissionMs, target_ms: 5000, capacity_intent_refusals: 0, parallel_gates: 2 }));
  } finally {
    writeFileSync(release, "");
    await Promise.all([first?.done, second?.done]);
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("the hold limit stops a hung command, frees the lock and records the timeout", () => {
  const f = fixture();
  try {
    const started = Date.now();
    const hung = f.call(f.first, ["sleep", "60"], { env: { BEELINK_GATE_MAX_HOLD: "2s" } });
    assert.equal(hung.status, 124, hung.stderr);
    assert.ok(Date.now() - started < 20_000);
    assert.match(hung.stderr, /hold limit of 2s reached/);
    assert.match(hung.stderr, /exit=124 duration=\d+s waited=\d+s host=beelink2 timed_out=1 watchdog=0/);
    const [row] = receipts(f);
    assert.equal(row.timed_out, true);
    assert.equal(row.exit, 124);
    const next = f.call(f.first, ["true"]);
    assert.equal(next.status, 0, next.stderr);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a gate whose launcher dies stops its command group and frees the lock", async () => {
  const f = fixture();
  const pidFile = join(f.root, "command.pid");
  try {
    const args = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "bash", "-c", `echo $$ > '${pidFile}'; exec sleep 120`].map(encode);
    const child = spawn("bash", [gate, "--remote", ...args], { env: { ...f.env, BEELINK_GATE_HEARTBEAT: "1" }, stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const closed = new Promise((resolveDone) => child.on("close", (status) => resolveDone(status)));
    for (let i = 0; i < 2400 && !existsSync(pidFile); i++) await sleepMs(50);
    const commandPid = Number(readFileSync(pidFile, "utf8"));
    assert.ok(alive(commandPid));
    child.stdin.end();
    const status = await closed;
    assert.equal(status, 143, stderr);
    await sleepMs(200);
    assert.equal(alive(commandPid), false);
    const [row] = receipts(f);
    assert.equal(row.watchdog, true);
    const started = Date.now();
    const next = f.call(f.first, ["true"]);
    assert.equal(next.status, 0, next.stderr);
    assert.ok(Date.now() - started < 10_000);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a waiting gate names the live holder and records how long it waited", async () => {
  const f = fixture();
  const marker = join(f.root, "holding");
  try {
    const args = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "bash", "-c", `touch '${marker}'; sleep 3`].map(encode);
    const holder = spawn("bash", [gate, "--remote", ...args], { env: { ...f.env, BEELINK_GATE_REPO_CHECKOUTS: "1" }, stdio: "ignore" });
    const held = new Promise((resolveDone) => holder.on("close", resolveDone));
    for (let i = 0; i < 2400 && !existsSync(marker); i++) await sleepMs(50);
    const waiter = await new Promise((resolveDone) => {
      const child = spawn("bash", [gate, "--remote", ...["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "true"].map(encode)], { env: { ...f.env, BEELINK_GATE_REPO_CHECKOUTS: "1" } });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("close", (status) => resolveDone({ status, stderr }));
    });
    await held;
    assert.equal(waiter.status, 0, waiter.stderr);
    assert.match(waiter.stderr, /waiting \d+s for one of 1 local\/owner\/repo checkouts on beelink2; holder pid=\d+ \(alive\) sha=/);
    const waited = receipts(f).find((row) => row.command === "true");
    assert.ok(waited.waited_s >= 1, JSON.stringify(waited));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a lock left by a dead gate's leftover process is reclaimed; a live holder is not", async () => {
  const f = fixture();
  try {
    const lockPath = join(f.cache, ".locks", "local-owner-repo.lock");
    mkdirSync(join(f.cache, ".locks"), { recursive: true });
    const dead = spawnSync("bash", ["-c", "echo $$"], { encoding: "utf8" }).stdout.trim();
    // detached makes the child a session leader, like a gate started over SSH.
    const locked = join(f.root, "leftover-locked");
    const leftover = spawn("bash", ["-c", `exec 9>'${lockPath}'; flock -x 9; touch '${locked}'; exec sleep 600`], { stdio: "ignore", detached: true });
    const exited = new Promise((resolveDone) => leftover.on("exit", (code, signal) => resolveDone(signal)));
    // Wait for the lock itself, not a fixed time: under load 500 ms was too short and the gate took a free lock.
    for (let i = 0; i < 2400 && !existsSync(locked); i++) await sleepMs(50);
    assert.equal(existsSync(locked), true, "leftover never took the lock");
    const sid = spawnSync("ps", ["-o", "sid=", "-p", String(leftover.pid)], { encoding: "utf8" }).stdout.trim();
    writeFileSync(`${lockPath}.holder`, `pid=${dead}\nsid=${sid}\nstarted=1\nsha=${f.first}\nlauncher=test\n`);
    const result = f.call(f.first, ["true"], { noInstall: true, env: { BEELINK_GATE_REPO_CHECKOUTS: "1" } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, new RegExp(`reclaiming lock from dead gate ${dead}: killing leftover pid ${leftover.pid}`));
    // The leftover is this test's child, so it stays a zombie until node reaps it.
    assert.equal(await exited, "SIGTERM");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("--ship runs the repo's ship verify with host-sized workers and no gate install", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.source, "scripts"));
    writeFileSync(join(f.source, "scripts", "ship.sh"), 'echo "ship $1 workers=$SHIP_MAX_WORKERS"\n');
    f.git(["add", "-A"]); f.git(["commit", "-qm", "ship script"]);
    const sha = f.git(["rev-parse", "HEAD"]);
    f.git(["--git-dir", f.bare, "fetch", f.source, sha], f.root);
    installFakeSsh(f);
    const env = { ...f.env, FAKE_WU_DAY: String(f.windowDay), FAKE_WU_HOUR: String(f.windowHour), BEELINK_GATE_SHIP_WORKERS: "6" };
    const shipped = run(gate, ["--ship", "beelink2", f.url, sha], { env });
    assert.equal(shipped.status, 0, shipped.stderr);
    assert.equal(shipped.stdout.trim(), "ship verify workers=6");
    assert.match(shipped.stderr, /install=ship command=bash scripts\/ship.sh verify/);
    assert.equal(existsSync(f.npmLog), false);
    const missing = run(gate, ["--ship", "beelink2", f.url, f.first], { env });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /has no scripts\/ship.sh/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("auto runs on the free beelink, preferring a warm cache", async () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    const prefix = join(f.root, "cache");
    const env = { ...f.env, FAKE_WU_DAY: String(f.windowDay), FAKE_WU_HOUR: String(f.windowHour), FAKE_CACHE_PREFIX: prefix, BEELINK_GATE_REPO_CHECKOUTS: "1" };
    const warm = run(gate, ["--no-install", "beelink2", f.url, f.first, "--", "true"], { env });
    assert.equal(warm.status, 0, warm.stderr);
    const preferWarm = run(gate, ["--no-install", "auto", f.url, f.first, "--", "true"], { env });
    assert.equal(preferWarm.status, 0, preferWarm.stderr);
    assert.match(preferWarm.stderr, /auto chose beelink2/);
    const lockPath = join(`${prefix}-100.127.22.51`, ".locks", "local-owner-repo.lock");
    const marker = join(f.root, "b2-held");
    const locker = spawn("flock", ["-x", lockPath, "bash", "-c", `touch '${marker}'; sleep 5`], { stdio: "ignore" });
    try {
      for (let i = 0; i < 2400 && !existsSync(marker); i++) await sleepMs(50);
      const busy = run(gate, ["--no-install", "auto", f.url, f.first, "--", "true"], { env });
      assert.equal(busy.status, 0, busy.stderr);
      assert.match(busy.stderr, /auto chose beelink1/);
      assert.match(busy.stderr, /beelink2: host=beelink2 state=busy/);
    } finally { locker.kill(); }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("on its own beelink the gate runs locally and reads the policy through reg.exe", () => {
  const f = fixture();
  try {
    const fakeReg = join(f.root, "bin", "reg.exe");
    writeFileSync(fakeReg, `#!/usr/bin/env bash\nprintf '    ScheduledInstallDay    REG_DWORD    0x%x\\r\\n    ScheduledInstallTime   REG_DWORD    0x%x\\r\\n' ${f.windowDay} ${f.windowHour}\n`);
    chmodSync(fakeReg, 0o755);
    writeFileSync(join(f.root, "bin", "ssh"), "#!/usr/bin/env bash\necho ssh-used >&2; exit 99\n");
    chmodSync(join(f.root, "bin", "ssh"), 0o755);
    const env = { ...f.env, BEELINK_GATE_SELF: "beelink2", BEELINK_GATE_REG: fakeReg };
    const local = run(gate, ["--no-install", "beelink2", f.url, f.first, "--", "cat", "value.txt"], { env });
    assert.equal(local.status, 0, local.stderr);
    assert.equal(local.stdout, "first\n");
    assert.doesNotMatch(local.stderr, /ssh-used/);
    assert.equal(receipts(f)[0].host, "beelink2");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("Rust output defaults into the gate cache without incremental state and counts toward the cap", () => {
  const f = fixture();
  try {
    const checkout = join(f.cache, "local", "owner", "repo");
    const shown = f.call(f.first, ["bash", "-c", 'printf "%s %s" "$CARGO_TARGET_DIR" "$CARGO_INCREMENTAL"']);
    assert.equal(shown.status, 0, shown.stderr);
    assert.equal(shown.stdout, `${join(checkout, ".git", "beelink-gate-target")} 0`);
    const kept = f.call(f.first, ["bash", "-c", 'printf "%s %s" "$CARGO_TARGET_DIR" "$CARGO_INCREMENTAL"'],
      { env: { CARGO_TARGET_DIR: "/caller/target", CARGO_INCREMENTAL: "1" } });
    assert.equal(kept.stdout, "/caller/target 1");
    const result = f.call(f.first, ["node", "-e", 'const fs=require("fs"),p=require("path"),d=p.join(process.env.CARGO_TARGET_DIR,"debug");fs.mkdirSync(d,{recursive:true});fs.writeFileSync(p.join(d,"big"),Buffer.alloc(750000))'],
      { env: { BEELINK_GATE_CACHE_MAX_BYTES: "500000" } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /evicted LRU cache .*local\/owner\/repo/);
    assert.equal(existsSync(checkout), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a host slot cap serializes gates for different repos and reports the wait", async () => {
  const f = fixture();
  const other = join(f.root, "owner", "other.git");
  f.git(["clone", "-q", "--bare", f.source, other], f.root);
  const events = join(f.root, "events");
  const launch = (url, id, delay) => new Promise((resolveDone) => setTimeout(() => {
    const args = ["beelink2", url, f.first, "no-install", f.windowDay, f.windowHour, "bash", "-c", `echo start-${id} >> '${events}'; sleep 2; echo end-${id} >> '${events}'`].map(encode);
    const child = spawn("bash", [gate, "--remote", ...args], { env: { ...f.env, BEELINK_GATE_MAX_CONCURRENT: "1", BEELINK_GATE_SLOT_POLL_SECONDS: "0.1" } });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolveDone({ status, stderr }));
  }, delay));
  try {
    // Start b once a is running its command, so a holds the only slot on a loaded host too.
    const first = launch(f.url, "a", 0);
    for (let i = 0; i < 2400 && !(existsSync(events) && readFileSync(events, "utf8").includes("start-a")); i++) await sleepMs(25);
    const [a, b] = await Promise.all([first, launch(`file://${other}`, "b", 0)]);
    assert.equal(a.status, 0, a.stderr);
    assert.equal(b.status, 0, b.stderr);
    assert.equal(readFileSync(events, "utf8").trim().split("\n").join(","), "start-a,end-a,start-b,end-b");
    assert.match(b.stderr, /waiting for a host gate slot \(1 running\)/);
    const invalid = f.call(f.first, ["true"], { env: { BEELINK_GATE_MAX_CONCURRENT: "0" } });
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /invalid concurrent gate cap/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("the GTR entrypoint forwards a host slot cap to the remote gate", () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    const env = { ...f.env, FAKE_WU_DAY: String(f.windowDay), FAKE_WU_HOUR: String(f.windowHour), BEELINK_GATE_MAX_CONCURRENT: "2", BEELINK_GATE_PR: "417", FLEET_STATUS_FILE: "/tmp/op-company--beelink-gate-caps.md" };
    const result = run(gate, ["--no-install", "beelink2", f.url, f.first, "--", "true"], { env });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(join(f.root, "ssh-remote-commands"), "utf8"), /^env (\S+ )*BEELINK_GATE_MAX_CONCURRENT=2 (\S+ )*bash -s -- --job-submit beelink2-[0-9a-f]{32} /m);
    assert.equal(receipts(f).at(-1).pr_number, 417);
    assert.equal(receipts(f).at(-1).lane, "op-company:beelink-gate-caps");
    const invalidPr = run(gate, ["beelink2", f.url, f.first, "--", "true"], { env: { ...env, BEELINK_GATE_PR: "417oops" } });
    assert.equal(invalidPr.status, 2);
    assert.match(invalidPr.stderr, /invalid BEELINK_GATE_PR/);
    const invalid = run(gate, ["beelink2", f.url, f.first, "--", "true"], { env: { ...env, BEELINK_GATE_MAX_CONCURRENT: "2;id" } });
    assert.equal(invalid.status, 2);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

const CARGO_TAG = "Signature: 8a477f597d28d172789f06886806bc55\n# This file is a cache directory tag created by cargo.\n";
const DAY = 24 * 60 * 60;

function buildDir(f, name, tag = CARGO_TAG) {
  const target = join(f.home, ".cache", name);
  const profile = join(target, "debug");
  for (const dir of ["deps", ".fingerprint/engine-old", ".fingerprint/engine-new", "incremental/engine-old"]) mkdirSync(join(profile, dir), { recursive: true });
  if (tag) writeFileSync(join(target, "CACHEDIR.TAG"), tag);
  for (const lock of [".cargo-lock", ".cargo-build-lock"]) writeFileSync(join(profile, lock), "");
  const old = Date.now() / 1000 - 2 * DAY;
  const files = {
    oldRlib: join(profile, "deps", "libengine-old.rlib"),
    newRlib: join(profile, "deps", "libengine-new.rlib"),
    oldFingerprint: join(profile, ".fingerprint", "engine-old", "lib-engine"),
    newFingerprint: join(profile, ".fingerprint", "engine-new", "lib-engine"),
    oldIncremental: join(profile, "incremental", "engine-old", "s-1"),
  };
  for (const file of Object.values(files)) writeFileSync(file, Buffer.alloc(4096));
  for (const file of [files.oldRlib, files.oldFingerprint, files.oldIncremental]) utimesSync(file, old, old);
  for (const dir of [".fingerprint/engine-old", "incremental/engine-old"]) utimesSync(join(profile, dir), old, old);
  return { target, profile, ...files };
}

test("stale entries of tagged cargo target dirs under the user cache are pruned after a gate", () => {
  const f = fixture();
  try {
    const engine = buildDir(f, "engine-build");
    const untagged = buildDir(f, "other-build", null);
    const result = f.call(f.first, ["true"], { noInstall: true });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /pruned \d+ bytes of cargo output untouched for 86400s from .*engine-build/);
    for (const gone of [engine.oldRlib, join(engine.profile, ".fingerprint", "engine-old"), join(engine.profile, "incremental", "engine-old")]) assert.equal(existsSync(gone), false, gone);
    for (const kept of [engine.newRlib, engine.newFingerprint, join(engine.target, "CACHEDIR.TAG"), untagged.oldRlib, untagged.oldFingerprint]) assert.equal(existsSync(kept), true, kept);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("the build sweep leaves a target alone while cargo or a gate for its repo holds a lock", async () => {
  const f = fixture();
  const hold = async (lockPath, marker) => {
    const locker = spawn("flock", ["-x", lockPath, "bash", "-c", `touch '${marker}'; while [ ! -e '${marker}.release' ]; do sleep 0.1; done`]);
    const exited = new Promise((resolveDone) => locker.once("exit", resolveDone));
    locker.release = () => { writeFileSync(`${marker}.release`, "\n"); return exited; };
    for (let i = 0; i < 2400 && !existsSync(marker); i++) await new Promise((resolveDone) => setTimeout(resolveDone, 20));
    assert.equal(existsSync(marker), true);
    return locker;
  };
  try {
    const engine = buildDir(f, "engine-build");
    const cargo = await hold(join(engine.profile, ".cargo-build-lock"), join(f.root, "cargo-held"));
    try {
      const result = f.call(f.first, ["true"], { noInstall: true });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /skipped .*engine-build\/debug; cargo is building there/);
      assert.equal(existsSync(engine.oldRlib), true);
    } finally { await cargo.release(); }
    mkdirSync(join(f.cache, ".locks"), { recursive: true });
    const gateLock = await hold(join(f.cache, ".locks", "github.com-tangle-network-engine.lock"), join(f.root, "gate-held"));
    try {
      const result = f.call(f.first, ["true"], { noInstall: true });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /skipped .*engine-build; a engine gate holds its lock/);
      assert.equal(existsSync(engine.oldRlib), true);
    } finally { await gateLock.release(); }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a daemon left behind by a command holds neither the host slot nor the repo lock", () => {
  const f = fixture();
  try {
    const env = { BEELINK_GATE_MAX_CONCURRENT: "1", BEELINK_GATE_SLOT_POLL_SECONDS: "0.1" };
    const leaker = f.call(f.first, ["bash", "-c", "sleep 600 >/dev/null 2>&1 &"], { noInstall: true, env });
    assert.equal(leaker.status, 0, leaker.stderr);
    const next = run("bash", [gate, "--remote", ...["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "true"].map(encode)],
      { env: { ...f.env, ...env }, timeout: 120_000 });
    assert.equal(next.status, 0, next.stderr || "second gate waited for the leaked daemon");
    assert.doesNotMatch(next.stderr, /waiting for a host gate slot/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a URL with or without .git reuses the same cache checkout", () => {
  const f = fixture();
  try {
    const plain = f.url.replace(/\.git$/, "");
    const withSuffix = f.call(f.first, ["true"], { noInstall: true });
    assert.equal(withSuffix.status, 0, withSuffix.stderr);
    const args = ["beelink2", plain, f.first, "no-install", f.windowDay, f.windowHour, "true"].map(encode);
    const withoutSuffix = run("bash", [gate, "--remote", ...args], { env: f.env });
    assert.equal(withoutSuffix.status, 0, withoutSuffix.stderr);
    assert.doesNotMatch(withoutSuffix.stderr, /origin mismatch/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("another spelling of the same repo adopts the cache, and a different repo is refused", () => {
  const f = fixture();
  try {
    const checkout = join(f.cache, "local", "owner", "repo");
    const first = f.call(f.first, ["true"], { noInstall: true });
    assert.equal(first.status, 0, first.stderr);
    // Same host/owner/repo key in another spelling, as git@ and https are for GitHub.
    const spelling = f.url.replace("/owner/", "/./owner/");
    f.git(["-C", checkout, "remote", "set-url", "origin", spelling], f.root);
    const adopted = f.call(f.second, ["cat", "value.txt"], { noInstall: true });
    assert.equal(adopted.status, 0, adopted.stderr);
    assert.equal(adopted.stdout, "second\n");
    // The transport that already fetched on this host stays; the caller's may need credentials.
    assert.equal(f.git(["-C", checkout, "remote", "get-url", "origin"], f.root), spelling);
    f.git(["-C", checkout, "remote", "set-url", "origin", "file:///elsewhere/owner/other.git"], f.root);
    const refused = f.call(f.first, ["true"], { noInstall: true });
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /cache origin mismatch at .*other\.git is not/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("auto prefers a beelink with a free host slot over one whose slots are full", async () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    const prefix = join(f.root, "cache");
    const env = { ...f.env, FAKE_WU_DAY: String(f.windowDay), FAKE_WU_HOUR: String(f.windowHour), FAKE_CACHE_PREFIX: prefix, BEELINK_GATE_MAX_CONCURRENT: "1" };
    for (const host of ["beelink1", "beelink2"]) {
      const warm = run(gate, ["--no-install", host, f.url, f.first, "--", "true"], { env });
      assert.equal(warm.status, 0, warm.stderr);
    }
    const slot = join(`${prefix}-100.98.195.7`, ".locks", "slot-0.lock");
    const marker = join(f.root, "b1-slot-held");
    const locker = spawn("flock", ["-x", slot, "bash", "-c", `touch '${marker}'; sleep 5`], { stdio: "ignore" });
    try {
      for (let i = 0; i < 2400 && !existsSync(marker); i++) await sleepMs(50);
      const chosen = run(gate, ["--no-install", "auto", f.url, f.first, "--", "true"], { env });
      assert.equal(chosen.status, 0, chosen.stderr);
      assert.match(chosen.stderr, /auto chose beelink2/);
      assert.match(chosen.stderr, /beelink1: host=beelink1 state=free cache=warm slots=0/);
    } finally { locker.kill(); }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a command does not inherit the launcher's gate settings", () => {
  const f = fixture();
  try {
    const shown = f.call(f.first, ["bash", "-c", 'printf "%s|%s|%s|%s|%s" "${BEELINK_GATE_HEARTBEAT-}" "${BEELINK_GATE_LAUNCHER-}" "${BEELINK_GATE_MAX_HOLD-}" "${BEELINK_GATE_SHIP_WORKERS-}" "${BEELINK_GATE_MAX_CONCURRENT-}"'],
      { noInstall: true, env: { BEELINK_GATE_LAUNCHER: "mac", BEELINK_GATE_MAX_HOLD: "10m", BEELINK_GATE_SHIP_WORKERS: "3", BEELINK_GATE_MAX_CONCURRENT: "2" } });
    assert.equal(shown.status, 0, shown.stderr);
    assert.equal(shown.stdout, "||||");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a launcher cache cap reaches the detached gate's locked pruner", () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    const env = { ...f.env, FAKE_WU_DAY: String(f.windowDay), FAKE_WU_HOUR: String(f.windowHour), BEELINK_GATE_CACHE_MAX_BYTES: "1000" };
    const result = run(gate, ["--no-install", "beelink2", f.url, f.first, "--", "true"], { env });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(join(f.root, "ssh-remote-commands"), "utf8"), /BEELINK_GATE_CACHE_MAX_BYTES=1000/);
    assert.match(result.stderr, /beelink-gate: evicted LRU cache/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("--ship publishes no proof outside GitHub and never changes the gate's result", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.source, "scripts"));
    writeFileSync(join(f.source, "scripts", "ship.sh"), 'echo "ship $1"\n');
    writeFileSync(join(f.source, "scripts", "ship-proof-signers"), "# pinned signers\n");
    f.git(["add", "-A"]); f.git(["commit", "-qm", "ship with signers"]);
    const sha = f.git(["rev-parse", "HEAD"]);
    f.git(["--git-dir", f.bare, "fetch", f.source, sha], f.root);
    const result = run("bash", [gate, "--remote", ...["beelink2", f.url, sha, "ship", f.windowDay, f.windowHour, "bash", "scripts/ship.sh", "verify"].map(encode)], { env: f.env });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "ship verify");
    assert.match(result.stderr, /no proof published: local is not GitHub/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// 2026-10-11, L1's gate for gtm-agent 5980b3a8 on beelink2: at 10:42Z it was refused at
// 166684823552 bytes free, below the 162 GiB floor. The retry passed ship verify, and then
// GitHub failed one of the ship-proof calls. publish_proof read its never-assigned `status`
// under set -u, the EXIT trap then read remote_gate's unwound `checkout`, and the gate died
// with "status: unbound variable" and "checkout: unbound variable" instead of exiting 0.
test("a disk-floor refusal, then a green --ship whose ship-proof publish GitHub refuses, exits 75 then 0", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.source, "scripts"));
    writeFileSync(join(f.source, "scripts", "ship.sh"), 'echo "ship $1"\n');
    writeFileSync(join(f.source, "scripts", "ship-proof-signers"), "# pinned signers\n");
    f.git(["add", "-A"]); f.git(["commit", "-qm", "ship with signers"]);
    const sha = f.git(["rev-parse", "HEAD"]);
    f.git(["--git-dir", f.bare, "fetch", f.source, sha], f.root);
    // A GitHub URL that Git serves from the fixture's bare repository.
    const gitconfig = join(f.home, ".gitconfig");
    // The gate fetches GitHub over SSH (git@github.com:), so serve that spelling too.
    writeFileSync(gitconfig, `[url "file://${join(f.root, "owner")}/"]\n\tinsteadOf = https://github.com/owner/\n\tinsteadOf = git@github.com:owner/\n`);
    mkdirSync(join(f.home, ".config", "beelink-gate"), { recursive: true });
    assert.equal(run("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", join(f.home, ".config", "beelink-gate", "ship-proof-key")]).status, 0);
    mkdirSync(join(f.home, "bin"), { recursive: true });
    const ghLog = join(f.root, "gh.log");
    writeFileSync(join(f.home, "bin", "gh-drew"), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> '${ghLog}'\n[[ "$*" == *git/trees* ]] && exit 1\nexit 0\n`);
    chmodSync(join(f.home, "bin", "gh-drew"), 0o755);
    const ship = (avail) => run("bash", [gate, "--remote", ...["beelink2", "https://github.com/owner/repo.git", sha, "ship", f.windowDay, f.windowHour, "bash", "scripts/ship.sh", "verify"].map(encode)],
      { env: { ...f.env, GIT_CONFIG_GLOBAL: gitconfig, ...(avail ? { FAKE_AVAIL: avail } : {}) } });
    const refused = ship("150323855360");
    assert.equal(refused.status, 75, refused.stderr);
    assert.match(refused.stderr, /REFUSED beelink2 has 150323855360 bytes free - 0 bytes reserved - \d+ bytes requested = -?\d+, below its 161061273600 byte disk floor/);
    assert.match(refused.stderr.trim().split("\n").at(-1), /^beelink-gate: TEMPFAIL next_allowed=\S+Z beelink2 is below its (operational disk floor or its policy is unknown|disk floor)$/);
    const retried = ship();
    assert.equal(retried.status, 0, retried.stderr);
    assert.equal(retried.stdout.trim(), "ship verify");
    assert.doesNotMatch(retried.stderr, /unbound variable/);
    assert.match(retried.stderr, /no proof published: GitHub refused \(no response\)/);
    assert.match(readFileSync(ghLog, "utf8"), /git\/trees/);
    assert.equal(receipts(f).at(-1).exit, 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("--ship sizes the test pool to the host's spare cores", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.source, "scripts"));
    writeFileSync(join(f.source, "scripts", "ship.sh"), 'echo "workers=$SHIP_MAX_WORKERS"\n');
    f.git(["add", "-A"]); f.git(["commit", "-qm", "ship"]);
    const sha = f.git(["rev-parse", "HEAD"]);
    f.git(["--git-dir", f.bare, "fetch", f.source, sha], f.root);
    const cores = Number(spawnSync("nproc", { encoding: "utf8" }).stdout.trim());
    const ship = (load) => run("bash", [gate, "--remote", ...["beelink2", f.url, sha, "ship", f.windowDay, f.windowHour, "bash", "scripts/ship.sh", "verify"].map(encode)], { env: { ...f.env, BEELINK_GATE_LOAD: load } });
    assert.equal(ship("0.00").stdout.trim(), `workers=${Math.max(4, Math.floor(cores / 2))}`);
    assert.equal(ship(String(cores * 4)).stdout.trim(), "workers=4");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("Git never prompts in a gate, and a hung ls-remote stops when the launcher dies", async () => {
  const f = fixture();
  try {
    const shown = f.call(f.first, ["bash", "-c", 'printf "%s|%s" "$GIT_TERMINAL_PROMPT" "$GIT_SSH_COMMAND"'], { noInstall: true });
    assert.equal(shown.status, 0, shown.stderr);
    assert.equal(shown.stdout, "0|ssh -o BatchMode=yes");
    const realGit = spawnSync("bash", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
    const hangBin = join(f.root, "hang-bin");
    mkdirSync(hangBin);
    writeFileSync(join(hangBin, "git"), `#!/usr/bin/env bash\n[[ " $* " == *" ls-remote "* ]] && exec sleep 60\nexec ${realGit} "$@"\n`);
    chmodSync(join(hangBin, "git"), 0o755);
    const args = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "true"].map(encode);
    const started = Date.now();
    const child = spawn("bash", [gate, "--remote", ...args], { env: { ...f.env, PATH: `${hangBin}:${f.env.PATH}`, BEELINK_GATE_HEARTBEAT: "1" } });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const done = new Promise((resolveDone) => child.on("close", resolveDone));
    for (let i = 0; i < 2400 && !/admitted|acquired/.test(stderr); i++) await sleepMs(50);
    await sleepMs(500);
    child.stdin.end();
    const status = await done;
    assert.equal(status, 143, stderr);
    assert.ok(Date.now() - started < 20_000, `took ${Date.now() - started}ms`);
    const next = f.call(f.first, ["true"], { noInstall: true });
    assert.equal(next.status, 0, next.stderr);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("two gates of one repo run at once in separate checkouts, and a third waits for either", async () => {
  const f = fixture();
  const events = join(f.root, "events");
  const release = join(f.root, "release");
  const live = {};
  const launch = (id, hold) => new Promise((resolveDone) => {
    // A holder ends only when the test releases it (or after 60 s): once the third gate
    // reports it is waiting. Fixed sleeps failed on loaded hosts in both directions.
    const wait = hold ? `for i in $(seq 600); do [ -e '${release}' ] && break; sleep 0.1; done` : "true";
    const args = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "bash", "-c", `echo "start-${id} $PWD" >> '${events}'; ${wait}; echo end-${id} >> '${events}'`].map(encode);
    const child = spawn("bash", [gate, "--remote", ...args], { env: f.env });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; live[id] = stderr; });
    child.on("close", (status) => resolveDone({ status, stderr }));
  });
  try {
    const both = [launch("a", true), launch("b", true)];
    for (let i = 0; i < 2400 && !(existsSync(events) && readFileSync(events, "utf8").split("\n").filter((l) => l.startsWith("start-")).length === 2); i++) await sleepMs(50);
    const third = launch("c", false);
    for (let i = 0; i < 2400 && !/waiting \d+s for one of 2/.test(live.c ?? ""); i++) await sleepMs(50);
    writeFileSync(release, "");
    const results = await Promise.all([...both, third]);
    assert.ok(results.every((r) => r.status === 0), JSON.stringify(results));
    const lines = readFileSync(events, "utf8").trim().split("\n");
    const starts = lines.filter((l) => l.startsWith("start-a") || l.startsWith("start-b"));
    assert.equal(lines.indexOf(starts[1]) < lines.findIndex((l) => l.startsWith("end-")), true, lines.join(","));
    assert.deepEqual(new Set(starts.map((l) => l.split(" ")[1].split("/").pop())), new Set(["repo", "repo@1"]));
    assert.ok(lines.findIndex((l) => l.startsWith("start-c")) > lines.findIndex((l) => l.startsWith("end-")), lines.join(","));
    assert.match(results[2].stderr, /waiting \d+s for one of 2 local\/owner\/repo checkouts/);
    for (const dir of ["repo", "repo@1"]) {
      assert.equal(f.git(["-C", join(f.cache, "local", "owner", dir), "rev-parse", "HEAD"], f.root), f.first);
      assert.equal(spawnSync("git", ["-C", join(f.cache, "local", "owner", dir), "fsck", "--no-progress"], { encoding: "utf8" }).status, 0);
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// Host CPU PSI (some avg10) is the only CPU admission; max_cpu_pressure defaults to 20.
const loadLimit = 20;
const loadLine = (avg10) => `some avg10=${avg10.toFixed(2)} avg60=0.00 avg300=0.00 total=1\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=1\n`;

test("a gate waits while its host is over the load limit, then starts and records the load", async () => {
  const f = fixture();
  const loadavg = join(f.root, "busy-loadavg");
  writeFileSync(loadavg, loadLine(loadLimit * 2));
  try {
    const args = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "true"].map(encode);
    const child = spawn("bash", [gate, "--remote", ...args], { env: { ...f.env, BEELINK_GATE_HOST_PRESSURE: loadavg, BEELINK_GATE_LOAD_POLL_SECONDS: "1" } });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const done = new Promise((resolveDone) => child.on("close", resolveDone));
    for (let i = 0; i < 2400 && !/holds admission/.test(stderr); i++) await sleepMs(50);
    assert.match(stderr, /waiting \d+s of \S+: host CPU PSI some avg10 holds admission: \{[^\n]*"some_avg10":40\.0,"limit":20\.0,"held":true/);
    writeFileSync(loadavg, loadLine(1));
    assert.equal(await done, 0, stderr);
    assert.match(stderr, /admission \{[^\n]*"some_avg10":1\.0,"limit":20\.0,"held":false/);
    const row = JSON.parse(readFileSync(join(f.root, "state", "receipts.jsonl"), "utf8").trim().split("\n").at(-1));
    assert.equal(row.start_host_cpu_pressure, 1);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a gate refuses after its bounded load wait without running the command", () => {
  const f = fixture();
  const loadavg = join(f.root, "busy-loadavg");
  writeFileSync(loadavg, loadLine(loadLimit + 1));
  try {
    const marker = join(f.root, "ran");
    const result = f.call(f.first, ["touch", marker], { noInstall: true, env: { BEELINK_GATE_HOST_PRESSURE: loadavg, BEELINK_GATE_LOAD_WAIT: "1s", BEELINK_GATE_LOAD_POLL_SECONDS: "1" } });
    assert.equal(result.status, 75, result.stderr);
    assert.match(result.stderr, /REFUSED beelink2 host CPU PSI some avg10 holds admission/);
    assert.match(result.stderr, /TEMPFAIL next_allowed=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ /);
    assert.equal(existsSync(marker), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

function loadedHosts(f, b1, b2) {
  installFakeSsh(f);
  const prefix = join(f.root, "load");
  writeFileSync(`${prefix}-100.98.195.7`, loadLine(b1));
  writeFileSync(`${prefix}-100.127.22.51`, loadLine(b2));
  return { ...f.env, FAKE_WU_DAY: String(f.windowDay), FAKE_WU_HOUR: String(f.windowHour), FAKE_CACHE_PREFIX: join(f.root, "cache"), FAKE_LOAD_PREFIX: prefix, BEELINK_GATE_LOAD_WAIT: "1s", BEELINK_GATE_LOAD_POLL_SECONDS: "1" };
}

test("auto lands on the beelink under its load limit even when the loaded one has the warm cache", () => {
  const f = fixture();
  try {
    const env = loadedHosts(f, 0.5, 0.5);
    const warm = run(gate, ["--no-install", "beelink1", f.url, f.first, "--", "true"], { env });
    assert.equal(warm.status, 0, warm.stderr);
    writeFileSync(join(f.root, "load-100.98.195.7"), loadLine(loadLimit * 2));
    writeFileSync(join(f.root, "load-100.127.22.51"), loadLine(loadLimit - 1));
    const chosen = run(gate, ["--no-install", "auto", f.url, f.first, "--", "true"], { env });
    assert.equal(chosen.status, 0, chosen.stderr);
    assert.match(chosen.stderr, /auto chose beelink2/);
    assert.match(chosen.stderr, /receipt: .*host=beelink2/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a named beelink over its load limit hands the gate to the lighter one, and keeps it when both are loaded", () => {
  const f = fixture();
  try {
    const env = loadedHosts(f, loadLimit * 2, 1);
    const moved = run(gate, ["--no-install", "beelink1", f.url, f.first, "--", "true"], { env });
    assert.equal(moved.status, 0, moved.stderr);
    assert.match(moved.stderr, /beelink1 load 40\.0+ is over its limit of 20\.0+; running on beelink2 \(load 1\.0+/);
    assert.match(moved.stderr, /receipt: .*host=beelink2/);
    const light = run(gate, ["--no-install", "beelink2", f.url, f.first, "--", "true"], { env });
    assert.equal(light.status, 0, light.stderr);
    assert.doesNotMatch(light.stderr, /running on beelink1/);
    writeFileSync(join(f.root, "load-100.127.22.51"), loadLine(loadLimit * 2));
    const stuck = run(gate, ["--no-install", "beelink1", f.url, f.first, "--", "true"], { env });
    assert.equal(stuck.status, 75, stuck.stderr);
    assert.match(stuck.stderr, /REFUSED beelink1 host CPU PSI some avg10 holds admission/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a pinned host waits under load instead of handing hardware work to another host", () => {
  const f = fixture();
  try {
    const env = loadedHosts(f, 1, loadLimit * 2);
    const marker = join(f.root, "hardware-command-ran");
    const blocked = run(gate, ["--pin-host", "--no-install", "beelink2", f.url, f.first, "--", "touch", marker], { env });
    assert.equal(blocked.status, 75, blocked.stderr);
    assert.match(blocked.stderr, /REFUSED beelink2 host CPU PSI some avg10 holds admission/);
    assert.doesNotMatch(blocked.stderr, /running on beelink1/);
    assert.equal(existsSync(marker), false);
    writeFileSync(join(f.root, "load-100.127.22.51"), loadLine(1));
    const admitted = run(gate, ["--pin-host", "--no-install", "beelink2", f.url, f.first, "--", "touch", marker], { env });
    assert.equal(admitted.status, 0, admitted.stderr);
    assert.match(admitted.stderr, /receipt: .*host=beelink2/);
    assert.equal(existsSync(marker), true);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("pinning auto refuses before any host is contacted", () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    const result = run(gate, ["--pin-host", "auto", f.url, f.first, "--", "true"], { env: f.env });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /--pin-host requires a named beelink/);
    assert.equal(existsSync(join(f.root, "ssh-transport")), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("auto waits for the light beelink's repo lock instead of queueing on an overloaded one", async () => {
  const f = fixture();
  try {
    // One checkout per host, so one held lock makes the light host busy.
    const env = { ...loadedHosts(f, 0.5, 0.5), BEELINK_GATE_AUTO_POLL_SECONDS: "1", BEELINK_GATE_REPO_CHECKOUTS: "1" };
    for (const host of ["beelink1", "beelink2"]) {
      const warm = run(gate, ["--no-install", host, f.url, f.first, "--", "true"], { env });
      assert.equal(warm.status, 0, warm.stderr);
    }
    writeFileSync(join(f.root, "load-100.98.195.7"), loadLine(loadLimit * 2));
    const lock = join(`${env.FAKE_CACHE_PREFIX}-100.127.22.51`, ".locks", "local-owner-repo.lock");
    const marker = join(f.root, "b2-lock-held");
    const locker = spawn("flock", ["-x", lock, "bash", "-c", `touch '${marker}'; sleep 60`], { stdio: "ignore" });
    for (let i = 0; i < 2400 && !existsSync(marker); i++) await sleepMs(50);
    const child = spawn(gate, ["--no-install", "auto", f.url, f.first, "--", "true"], { env });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const closed = new Promise((resolveDone) => child.on("close", resolveDone));
    // Release the light host's lock only once auto has said it is waiting: a fixed 2 s hold lost on a loaded host.
    for (let i = 0; i < 2400 && !/no beelink is both free/.test(stderr); i++) await sleepMs(50);
    locker.kill();
    const status = await closed;
    assert.equal(status, 0, stderr);
    assert.match(stderr, /no beelink is both free for this repo and under its load limit/);
    assert.match(stderr, /auto chose beelink2/);
    assert.match(stderr, /receipt: .*host=beelink2/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("the launcher forwards a validated load wait", () => {
  const f = fixture();
  try {
    const env = { ...loadedHosts(f, 0.5, 0.5), BEELINK_GATE_LOAD_WAIT: "2h" };
    const result = run(gate, ["--no-install", "beelink2", f.url, f.first, "--", "true"], { env });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(join(f.root, "ssh-remote-command"), "utf8"), /BEELINK_GATE_LOAD_WAIT=2h /);
    const invalid = run(gate, ["beelink2", f.url, f.first, "--", "true"], { env: { ...env, BEELINK_GATE_LOAD_WAIT: "2h;id" } });
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /invalid BEELINK_GATE_LOAD_WAIT/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("--ship runs the repo's preview after verify and records it, never printing its version ID", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.source, "scripts"));
    writeFileSync(join(f.source, "scripts", "ship.sh"), [
      'case "$1" in',
      '  verify) echo verified ;;',
      '  preview) printf \'{"kind":"preview","verdict":"%s","version":"secret-version-id"}\\n\' "$FAKE_PREVIEW" > "$SHIP_PREVIEW_RECEIPT"',
      '    case "$FAKE_PREVIEW" in passed) exit 0 ;; refused) exit 2 ;; preempted) exit 3 ;; *) exit 1 ;; esac ;;',
      'esac', ''].join("\n"));
    writeFileSync(join(f.source, "scripts", "ship-preview.vault"), "# vault files\ntest.env\n");
    f.git(["add", "-A"]); f.git(["commit", "-qm", "ship with preview"]);
    const sha = f.git(["rev-parse", "HEAD"]);
    f.git(["--git-dir", f.bare, "fetch", f.source, sha], f.root);
    mkdirSync(join(f.home, "company", "devops", "secrets"), { recursive: true });
    writeFileSync(join(f.home, "company", "devops", "secrets", "test.env"), "X=1\n");
    writeFileSync(join(f.root, "bin", "npx"), '#!/usr/bin/env bash\nwhile [ "$1" != "--" ]; do shift; done\nshift\nexec "$@"\n');
    chmodSync(join(f.root, "bin", "npx"), 0o755);
    const ship = (verdict) => run("bash", [gate, "--remote", ...["beelink2", f.url, sha, "ship", f.windowDay, f.windowHour, "bash", "scripts/ship.sh", "verify"].map(encode)],
      { env: { ...f.env, FAKE_PREVIEW: verdict } });
    const passed = ship("passed");
    assert.equal(passed.status, 0, passed.stderr);
    assert.match(passed.stderr, /preview=passed/);
    assert.doesNotMatch(`${passed.stdout}${passed.stderr}`, /secret-version-id/);
    assert.equal(receipts(f).at(-1).preview.version, "secret-version-id");
    assert.equal(ship("failed").status, 1);
    assert.equal(ship("refused").status, 0);
    const preempted = ship("preempted");
    assert.equal(preempted.status, 75);
    assert.match(preempted.stderr, /TEMPFAIL next_allowed=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ the preview was preempted or inconclusive/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

function pnpmRepo(f, files) {
  rmSync(join(f.source, "package-lock.json"));
  writeFileSync(join(f.source, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(join(f.source, name, ".."), { recursive: true });
    writeFileSync(join(f.source, name), body);
  }
  f.git(["add", "-A"]); f.git(["commit", "-qm", "pnpm repo"]);
  const sha = f.git(["rev-parse", "HEAD"]);
  f.git(["--git-dir", f.bare, "fetch", f.source, sha], f.root);
  const npxLog = join(f.root, "npx.log");
  writeFileSync(join(f.root, "bin", "npx"), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> '${npxLog}'\n`);
  chmodSync(join(f.root, "bin", "npx"), 0o755);
  return { sha, npxLog };
}

test("the install and the command use the repo's pnpm from packageManager", () => {
  const f = fixture();
  try {
    const { sha, npxLog } = pnpmRepo(f, { "package.json": '{"name":"gate-test","version":"1.0.0","packageManager":"pnpm@11.28.5+sha512.abc"}\n' });
    const result = f.call(sha, ["pnpm", "check"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /using the repo's pnpm 11\.28\.5/);
    assert.deepEqual(readFileSync(npxLog, "utf8").trim().split("\n"), [
      `--yes pnpm@11.28.5 install --frozen-lockfile --store-dir ${f.home}/.local/share/pnpm/store`,
      "--yes pnpm@11.28.5 check",
    ]);
    // The beelink's pnpm is only asked its version.
    assert.equal(readFileSync(f.pnpmLog, "utf8").trim(), "--version");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("without packageManager the gate uses the pnpm version CI pins on pnpm/action-setup", () => {
  const f = fixture();
  try {
    const workflow = "jobs:\n  verify:\n    steps:\n      - uses: actions/checkout@v4\n      - uses: pnpm/action-setup@b906aff\n        with:\n          version: 12.3.4\n      - uses: actions/setup-node@v4\n        with:\n          version: 99.0.0\n";
    const { sha, npxLog } = pnpmRepo(f, { ".github/workflows/verify-pr.yml": workflow });
    const result = f.call(sha, ["true"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(npxLog, "utf8"), /^--yes pnpm@12\.3\.4 install --frozen-lockfile/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a repo that names no exact pnpm version keeps the beelink's pnpm", () => {
  const f = fixture();
  try {
    const { sha, npxLog } = pnpmRepo(f, { "package.json": '{"name":"gate-test","version":"1.0.0","packageManager":"pnpm@latest;id"}\n' });
    const result = f.call(sha, ["true"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(npxLog), false);
    assert.match(readFileSync(f.pnpmLog, "utf8"), /^install --frozen-lockfile/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("--branch checks out the branch at the SHA with @{push} at that SHA, and refuses a SHA that is not its head", () => {
  const f = fixture();
  try {
    f.git(["--git-dir", f.bare, "branch", "fix/signoff", f.first], f.root);
    const show = ["bash", "-c", 'git rev-parse --abbrev-ref HEAD; git rev-parse "@{push}"; git status --porcelain | wc -l']; 
    const ok = f.call(f.first, show, { noInstall: true, env: { BEELINK_GATE_BRANCH: "fix/signoff" } });
    assert.equal(ok.status, 0, ok.stderr);
    assert.deepEqual(ok.stdout.trim().split("\n"), ["fix/signoff", f.first, "0"]);
    assert.match(ok.stderr, /checked out fix\/signoff at .* tracking origin\/fix\/signoff/);
    const stale = f.call(f.second, ["true"], { noInstall: true, env: { BEELINK_GATE_BRANCH: "fix/signoff" } });
    assert.equal(stale.status, 2, stale.stderr);
    assert.match(stale.stderr, new RegExp(`--branch fix/signoff: origin has it at ${f.first}, not ${f.second}`));
    const missing = f.call(f.first, ["true"], { noInstall: true, env: { BEELINK_GATE_BRANCH: "no/such" } });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /origin has it at no such branch/);
    const detached = f.call(f.first, ["git", "rev-parse", "--abbrev-ref", "HEAD"], { noInstall: true });
    assert.equal(detached.stdout.trim(), "HEAD");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("the launcher validates --branch and forwards it to the beelink", () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    f.git(["--git-dir", f.bare, "branch", "fix/signoff", f.first], f.root);
    const env = { ...f.env, FAKE_WU_DAY: String(f.windowDay), FAKE_WU_HOUR: String(f.windowHour) };
    const ok = run(gate, ["--no-install", "--branch", "fix/signoff", "beelink2", f.url, f.first, "--", "git", "rev-parse", "--abbrev-ref", "HEAD"], { env });
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(ok.stdout.trim(), "fix/signoff");
    for (const bad of ["-x", "a..b", "a b", "x;id"]) {
      const refused = run(gate, ["--branch", bad, "beelink2", f.url, f.first, "--", "true"], { env });
      assert.equal(refused.status, 2, bad);
      assert.match(refused.stderr, /invalid --branch/);
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a gated command finds the dotfiles tools in ~/bin and ~/.local/bin", () => {
  const f = fixture();
  try {
    for (const dir of ["bin", ".local/bin"]) {
      mkdirSync(join(f.home, dir), { recursive: true });
      const tool = join(f.home, dir, dir === "bin" ? "gh-drew" : "local-tool");
      writeFileSync(tool, `#!/usr/bin/env bash\necho ${dir}\n`);
      chmodSync(tool, 0o755);
    }
    const result = f.call(f.first, ["bash", "-c", "gh-drew; local-tool"], { noInstall: true });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "bin\n.local/bin\n");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// A light gate: a small, dependency-free check with a declared CPU budget.
const lightGate = (f, sha, command, env = {}) => run("bash", [gate, "--remote", ...["beelink2", f.url, sha, "light", f.windowDay, f.windowHour, ...command].map(encode)], { env: { ...f.env, ...env } });

test("a light gate runs on its own checkout without an install or a browser", () => {
  const f = fixture();
  try {
    const light = lightGate(f, f.first, ["bash", "-c", 'echo "browsers=$PLAYWRIGHT_BROWSERS_PATH"; cat value.txt']);
    assert.equal(light.status, 0, light.stderr);
    assert.match(light.stdout, /browsers=.*beelink-gate-no-browsers/);
    assert.match(light.stdout, /first/);
    assert.equal(existsSync(f.npmLog), false, "a light gate installs nothing");
    assert.equal(existsSync(join(f.cache, "local", "owner", "repo@light", ".git")), true, "a light gate uses its own checkout");
    assert.match(light.stderr, /receipt: .* class=light cpu_s=\d+\.\d/);
    const row = receipts(f).at(-1);
    assert.equal(row.class, "light");
    assert.equal(row.exit, 0);
    assert.ok(row.cpu_s !== null && row.cpu_s < 120, JSON.stringify(row));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a light gate does not wait for a normal host slot", async () => {
  const f = fixture();
  const held = join(f.root, "held");
  try {
    // A normal gate holds the only normal slot while its command runs.
    const normal = spawn("bash", [gate, "--remote", ...["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "bash", "-c", `touch '${held}'; while [ ! -e '${held}.release' ]; do sleep 0.1; done`].map(encode)],
      { env: { ...f.env, BEELINK_GATE_MAX_CONCURRENT: "1" } });
    for (let i = 0; i < 2400 && !existsSync(held); i++) await sleepMs(25);
    assert.ok(existsSync(held), "the normal gate started");
    const light = lightGate(f, f.first, ["true"], { BEELINK_GATE_MAX_CONCURRENT: "1" });
    assert.equal(light.status, 0, light.stderr);
    assert.doesNotMatch(light.stderr, /waiting for a host gate slot/);
    assert.equal(normal.exitCode, null, "the light gate ran while the normal gate held the only normal slot");
    writeFileSync(`${held}.release`, "\n");
    await new Promise((resolveDone) => normal.on("close", resolveDone));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a light gate over its declared CPU budget fails loudly, and the budget is capped at two core-minutes", () => {
  const f = fixture();
  try {
    const spin = ["node", "-e", "const start = process.cpuUsage(); while (true) { const cpu = process.cpuUsage(start); if (cpu.user + cpu.system >= 2_000_000) break; }"];
    const over = lightGate(f, f.first, spin, { BEELINK_GATE_LIGHT_CPU: "1" });
    assert.equal(over.status, 1, over.stderr);
    assert.match(over.stderr, /LIGHT GATE OVER BUDGET: the command used \d+\.\d core-seconds of the 1 it declared; run it as a normal gate/);
    const row = receipts(f).at(-1);
    assert.equal(row.class, "light");
    assert.ok(row.cpu_s > 1, JSON.stringify(row));
    const tooLarge = lightGate(f, f.first, ["true"], { BEELINK_GATE_LIGHT_CPU: "121" });
    assert.equal(tooLarge.status, 2);
    assert.match(tooLarge.stderr, /BEELINK_GATE_LIGHT_CPU must be 1-120 core-seconds/);
    const combined = run(gate, ["--light", "--ship", "beelink2", f.url, f.first], { env: f.env });
    assert.equal(combined.status, 2);
    assert.match(combined.stderr, /--light cannot be combined with --ship/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// 2026-10-11: gtm-agent #1565, the fix for a red master, waited 1,501 s on beelink2's two busy checkouts
// (load 44.5) while beelink1 sat at load 15: auto chose a host, then waited on that host's lock for good.
test("auto gives back a host whose checkouts were taken after it chose it, and runs on the other one", () => {
  const f = fixture();
  try {
    const env = { ...loadedHosts(f, 0.5, 0.5), BEELINK_GATE_REPLACE_WAIT: "2s", BEELINK_GATE_AUTO_POLL_SECONDS: "0.5" };
    // A warm cache on beelink2 makes auto choose it first.
    assert.equal(run(gate, ["--no-install", "beelink2", f.url, f.first, "--", "true"], { env }).status, 0);
    // Between the probe and the remote gate's admission, another gate takes both of beelink2's checkouts.
    const ssh = join(f.root, "bin", "ssh");
    renameSync(ssh, join(f.root, "bin", "ssh-real"));
    const locks = `${join(f.root, "cache")}-100.127.22.51/.locks`;
    writeFileSync(ssh, `#!/usr/bin/env bash
if [[ " $* " == *" --job-submit "* && " $* " == *" 100.127.22.51 "* && -e '${join(f.root, "take-b2")}' ]]; then
  rm -f '${join(f.root, "take-b2")}'
  python3 -c 'import fcntl,os,sys,time; fs=[open(p,"w") for p in sys.argv[1:3]]; [fcntl.flock(x, fcntl.LOCK_EX) for x in fs]; open(sys.argv[3],"w").close(); time.sleep(60)' \\
    '${locks}/local-owner-repo.lock' '${locks}/local-owner-repo@1.lock' '${join(f.root, "b2-held")}' </dev/null >/dev/null 2>&1 &
  echo $! > '${join(f.root, "holder.pid")}'
  while [ ! -e '${join(f.root, "b2-held")}' ]; do sleep 0.05; done
fi
exec '${join(f.root, "bin", "ssh-real")}' "$@"
`);
    chmodSync(ssh, 0o755);
    writeFileSync(join(f.root, "take-b2"), "");
    const moved = run(gate, ["--no-install", "auto", f.url, f.first, "--", "true"], { env });
    assert.equal(moved.status, 0, moved.stderr);
    assert.match(moved.stderr, /auto chose beelink2/);
    assert.match(moved.stderr, /not admitted on beelink2 within 2s \(both local\/owner\/repo checkouts busy\); placing the gate again/);
    assert.match(moved.stderr, /placement 1 on beelink2 gave the host back after waiting; probing both again/);
    assert.match(moved.stderr, /auto chose beelink1/);
    assert.match(moved.stderr, /receipt: .*host=beelink1/);
    const row = JSON.parse(readFileSync(join(f.root, "state", "receipts.jsonl"), "utf8").trim().split("\n").at(-1));
    assert.ok(row.waited_s >= 2, `the whole wait is in the receipt: ${row.waited_s}`);
  } finally {
    try { process.kill(Number(readFileSync(join(f.root, "holder.pid"), "utf8")), "SIGKILL"); } catch {}
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("an urgent gate takes the next free checkout ahead of a gate that waited longer", async () => {
  const f = fixture();
  const events = join(f.root, "events");
  const lockDir = join(f.cache, ".locks");
  mkdirSync(lockDir, { recursive: true });
  const holder = spawn("python3", ["-c", 'import fcntl,sys,time; fh=open(sys.argv[1],"w"); fcntl.flock(fh, fcntl.LOCK_EX); print("held", flush=True); time.sleep(60)',
    join(lockDir, "local-owner-repo.lock")], { stdio: ["ignore", "pipe", "ignore"] });
  const launch = (id, extra) => new Promise((resolveDone) => {
    const args = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "bash", "-c", `echo ${id} >> '${events}'`].map(encode);
    const child = spawn("bash", [gate, "--remote", ...args], { env: { ...f.env, BEELINK_GATE_REPO_CHECKOUTS: "1", ...extra } });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolveDone({ status, stderr }));
  });
  try {
    await new Promise((ok) => holder.stdout.once("data", ok));
    const normal = launch("normal", {});
    await sleepMs(1500);
    const urgent = launch("urgent", { BEELINK_GATE_URGENT: "1" });
    for (let i = 0; i < 2400 && !readdirSync(lockDir).some((n) => n.startsWith("urgent-local-owner-repo.")); i++) await sleepMs(25);
    holder.kill("SIGKILL");
    const [n, u] = await Promise.all([normal, urgent]);
    assert.equal(n.status, 0, n.stderr);
    assert.equal(u.status, 0, u.stderr);
    assert.equal(readFileSync(events, "utf8").trim().split("\n").join(","), "urgent,normal");
    assert.match(u.stderr, /admitted on beelink2 after \d+s gate_id=\S+ \(urgent\)/);
    assert.deepEqual(readdirSync(lockDir).filter((n) => n.startsWith("urgent-")), [], "no urgent marker is left behind");
  } finally {
    holder.kill("SIGKILL");
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("a gate waiting for load holds no checkout, so the repo lock stays free until it is admitted", async () => {
  const f = fixture();
  const loadavg = join(f.root, "busy-pressure");
  writeFileSync(loadavg, loadLine(loadLimit * 2));
  try {
    const args = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "true"].map(encode);
    const child = spawn("bash", [gate, "--remote", ...args], { env: { ...f.env, BEELINK_GATE_HOST_PRESSURE: loadavg, BEELINK_GATE_LOAD_POLL_SECONDS: "1", BEELINK_GATE_REPO_CHECKOUTS: "1" } });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const done = new Promise((resolveDone) => child.on("close", resolveDone));
    for (let i = 0; i < 2400 && !/holds admission/.test(stderr); i++) await sleepMs(50);
    assert.match(stderr, /holds admission/);
    mkdirSync(join(f.cache, ".locks"), { recursive: true });
    const probe = run("flock", ["-n", join(f.cache, ".locks", "local-owner-repo.lock"), "true"]);
    assert.equal(probe.status, 0, "the waiting gate holds the checkout lock");
    writeFileSync(loadavg, loadLine(1));
    assert.equal(await done, 0, stderr);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

const pressureLine = (avg10) => `some avg10=${avg10.toFixed(2)} avg60=1.00 avg300=1.00 total=1\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n`;

test("auto places by host CPU pressure: the host under its limit wins", () => {
  const f = fixture();
  try {
    const env = loadedHosts(f, 30.46, 6.9);
    const chosen = run(gate, ["--no-install", "auto", f.url, f.first, "--", "true"], { env });
    assert.equal(chosen.status, 0, chosen.stderr);
    assert.match(chosen.stderr, /auto chose beelink2/);
    assert.match(chosen.stderr, /receipt: .*host=beelink2/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("auto waits while both hosts are over their pressure limit and runs on the first that drops under it", async () => {
  const f = fixture();
  try {
    const env = { ...loadedHosts(f, 0.5, 0.5), FAKE_HOST_PRESSURE_PREFIX: join(f.root, "host"), BEELINK_GATE_AUTO_POLL_SECONDS: "1" };
    writeFileSync(join(f.root, "host-100.98.195.7"), loadLine(5));
    writeFileSync(join(f.root, "host-100.127.22.51"), loadLine(5));
    const warm = run(gate, ["--no-install", "beelink1", f.url, f.first, "--", "true"], { env });
    assert.equal(warm.status, 0, warm.stderr);
    writeFileSync(join(f.root, "host-100.98.195.7"), loadLine(73));
    writeFileSync(join(f.root, "host-100.127.22.51"), loadLine(50));
    const probes = () => readFileSync(join(f.root, "ssh-remote-commands"), "utf8").split("\n").filter((line) => line.includes("--probe")).length;
    const before = probes();
    const child = spawn(gate, ["--no-install", "auto", f.url, f.first, "--", "true"], { env });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const closed = new Promise((resolveDone) => child.on("close", resolveDone));
    // Two probe rounds of both hosts held by host PSI: auto queues on neither.
    for (let i = 0; i < 2400 && probes() < before + 4; i++) await sleepMs(50);
    assert.doesNotMatch(stderr, /auto chose/);
    writeFileSync(join(f.root, "host-100.127.22.51"), loadLine(5));
    assert.equal(await closed, 0, stderr);
    assert.match(stderr, /auto chose beelink2 .*beelink1: host=beelink1 state=busy cache=warm .*host_cpu=73\.0/);
    assert.match(stderr, /receipt: .*host=beelink2/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test("an auto gate whose host falls below its disk floor while it queued gives the host back before checkout", async () => {
  const f = fixture();
  try {
    const avail = join(f.root, "avail");
    const pressure = join(f.root, "pressure");
    writeFileSync(avail, String(500 * 2 ** 30));
    writeFileSync(pressure, pressureLine(60));
    const args = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "true"].map(encode);
    const child = spawn("bash", [gate, "--remote", ...args], { env: { ...f.env, BEELINK_GATE_AUTO: "1", FAKE_AVAIL_FILE: avail, BEELINK_GATE_HOST_PRESSURE: pressure, BEELINK_GATE_LOAD_POLL_SECONDS: "1" } });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const closed = new Promise((resolveDone) => child.on("close", resolveDone));
    for (let i = 0; i < 2400 && !/waiting \d+s/.test(stderr); i++) await sleepMs(50);
    // While it waits on pressure, the disk drops below the floor; then pressure clears.
    writeFileSync(avail, String(140 * 2 ** 30));
    writeFileSync(pressure, pressureLine(5));
    assert.equal(await closed, 76, stderr);
    assert.match(stderr, /beelink2 gave the gate back before (admission|checkout) \(beelink2 is below its disk floor\); placing the gate again/);
    assert.doesNotMatch(stderr, /TEMPFAIL/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("an auto gate stops moving once it has waited past the starvation backstop, keeping its age", async () => {
  const f = fixture();
  const older = [];
  try {
    const env = { ...loadedHosts(f, 0.5, 0.5), BEELINK_GATE_REPO_CHECKOUTS: "1", BEELINK_GATE_REPLACE_WAIT: "1s", BEELINK_GATE_STARVE_AFTER: "2s", BEELINK_GATE_LOAD_WAIT: "60s" };
    // Each host's one checkout is free, but an older gate is queued for it, so this gate
    // waits there and, while it may move, gives the host back every second.
    for (const ip of ["100.98.195.7", "100.127.22.51"]) {
      const locks = join(f.root, `cache-${ip}`, ".locks");
      mkdirSync(locks, { recursive: true });
      const p = spawn("sleep", ["60"], { stdio: "ignore" });
      older.push(p);
      writeFileSync(join(locks, `queue-local-owner-repo.${Math.floor(Date.now() / 1000) - 3600}.${p.pid}`), "");
    }
    const child = spawn(gate, ["--no-install", "auto", f.url, f.first, "--", "true"], { env });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const closed = new Promise((resolveDone) => child.on("close", resolveDone));
    for (let i = 0; i < 2400 && !/staying on beelink\d/.test(stderr); i++) await sleepMs(50);
    assert.match(stderr, /waited \d+s across placements; staying on beelink\d in its place in line/);
    await sleepMs(2500);
    // Once it stays, it does not give the host back again.
    assert.doesNotMatch(stderr.split(/staying on beelink\d/)[1], /not admitted on/);
    for (const p of older) p.kill();
    assert.equal(await closed, 0, stderr);
  } finally {
    for (const p of older) p.kill();
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("a --dev auto run keeps its admission deadline after the starvation time", () => {
  const f = fixture();
  try {
    const drops = join(f.root, "probe-drops");
    writeFileSync(drops, "2\n");
    const env = { ...loadedHosts(f, 0.5, 0.5), BEELINK_GATE_REPLACE_WAIT: "1s", BEELINK_GATE_STARVE_AFTER: "1s", FAKE_PROBE_DROPS: drops, BEELINK_GATE_PROBE_RETRY_SECONDS: "1" };
    const result = run(gate, ["--dev", "--no-install", "auto", f.url, f.first, "--", "true"], { env });
    assert.equal(result.status, 0, result.stderr);
    const sent = readFileSync(join(f.root, "ssh-remote-command"), "utf8");
    assert.match(sent, /BEELINK_GATE_ADMIT_WAIT=1 /, "dev keeps the deadline needed to re-place");
    assert.match(sent, /BEELINK_GATE_PLACED_WAIT=[1-9][0-9]* /, "the placement was past STARVE_AFTER");
    assert.doesNotMatch(result.stderr, /staying on beelink/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("the launcher validates BEELINK_GATE_MAX_CPU_PRESSURE and forwards it to the beelink's probe and gate", () => {
  const f = fixture();
  try {
    // A caller can only tighten the host's ceiling (20 here): 15 admits by default and holds under 10.
    const env = { ...loadedHosts(f, 15, 15), BEELINK_GATE_MAX_CPU_PRESSURE: "10" };
    const result = run(gate, ["--no-install", "beelink2", f.url, f.first, "--", "true"], { env });
    assert.equal(result.status, 75, result.stderr);
    assert.match(result.stderr, /REFUSED beelink2 host CPU PSI some avg10 holds admission: \{[^\n]*"some_avg10":15\.0,"limit":10\.0,"held":true/);
    const loose = run(gate, ["--no-install", "beelink2", f.url, f.first, "--", "true"], { env: { ...env, BEELINK_GATE_MAX_CPU_PRESSURE: "50" } });
    assert.equal(loose.status, 0, loose.stderr);
    assert.match(loose.stderr, /admission \{[^\n]*"some_avg10":15\.0,"limit":20\.0,"held":false/);
    assert.match(readFileSync(join(f.root, "ssh-remote-command"), "utf8"), /BEELINK_GATE_MAX_CPU_PRESSURE=50 /);
    const invalid = run(gate, ["beelink2", f.url, f.first, "--", "true"], { env: { ...env, BEELINK_GATE_MAX_CPU_PRESSURE: "50;id" } });
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /BEELINK_GATE_MAX_CPU_PRESSURE must be 0-100/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("the starvation backstop also runs a gate past a full slot pool", async () => {
  const f = fixture();
  try {
    mkdirSync(join(f.cache, ".locks"), { recursive: true });
    const marker = join(f.root, "slot-held");
    const holder = spawn("flock", ["-x", join(f.cache, ".locks", "slot-0.lock"), "bash", "-c", `touch '${marker}'; sleep 20`], { stdio: "ignore" });
    try {
      for (let i = 0; i < 2400 && !existsSync(marker); i++) await sleepMs(50);
      const result = f.call(f.first, ["true"], { noInstall: true, env: { BEELINK_GATE_MAX_CONCURRENT: "1", BEELINK_GATE_SLOT_POLL_SECONDS: "0.2", BEELINK_GATE_STARVE_AFTER: "1s" } });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /STARVED: running past the 1-slot cap on beelink2 after \d+s/);
      assert.match(result.stderr, /receipt: .*starved=1/);
    } finally { holder.kill(); }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("the host limits file sets the pressure limit and reaches a gate that is already waiting", async () => {
  const f = fixture();
  try {
    const pressure = join(f.root, "pressure");
    const limits = join(f.root, "limits");
    writeFileSync(pressure, pressureLine(60));
    writeFileSync(limits, "max_cpu_pressure=50\n");
    const args = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "true"].map(encode);
    const child = spawn("bash", [gate, "--remote", ...args], { env: { ...f.env, BEELINK_GATE_HOST_PRESSURE: pressure, BEELINK_GATE_LIMITS_FILE: limits, BEELINK_GATE_LOAD_POLL_SECONDS: "1" } });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const done = new Promise((resolveDone) => child.on("close", resolveDone));
    for (let i = 0; i < 2400 && !/"limit":50\.0,"held":true/.test(stderr); i++) await sleepMs(50);
    assert.match(stderr, /holds admission: \{[^\n]*"some_avg10":60\.0,"limit":50\.0,"held":true/);
    writeFileSync(limits, "# raised after train a2\nmax_cpu_pressure=70\n");
    assert.equal(await done, 0, stderr);
    assert.match(stderr, /admission \{[^\n]*"some_avg10":60\.0,"limit":70\.0,"held":false/);
    // A caller can tighten the file's limit but never raise it.
    const explicit = f.call(f.first, ["true"], { noInstall: true, env: { BEELINK_GATE_HOST_PRESSURE: pressure, BEELINK_GATE_LIMITS_FILE: limits, BEELINK_GATE_MAX_CPU_PRESSURE: "100" } });
    assert.match(explicit.stderr, /admission \{[^\n]*"limit":70\.0,"held":false/);
    writeFileSync(limits, "max_cpu_pressure=banana\n");
    const invalid = f.call(f.first, ["true"], { noInstall: true, env: { BEELINK_GATE_HOST_PRESSURE: pressure, BEELINK_GATE_LIMITS_FILE: limits, BEELINK_GATE_LOAD_WAIT: "1s", BEELINK_GATE_LOAD_POLL_SECONDS: "1" } });
    assert.match(invalid.stderr, /invalid host max_cpu_pressure policy/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a green command stays green when the cache is over its cap with only active checkouts", () => {
  const f = fixture();
  try {
    // A cap below one checkout: every prune ends over the cap with nothing idle to evict.
    const result = f.call(f.first, ["bash", "-c", "exit 0"], { noInstall: true, env: { BEELINK_GATE_CACHE_MAX_BYTES: "1000" } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /WARNING cache over its cap/);
    assert.match(result.stderr, /receipt: .*exit=0 .*cache=unpruned/);
    assert.equal(receipts(f).at(-1).cache_unpruned, true);
    const red = f.call(f.first, ["bash", "-c", "exit 7"], { noInstall: true, env: { BEELINK_GATE_CACHE_MAX_BYTES: "1000" } });
    assert.equal(red.status, 7, red.stderr);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("the receipt separates capacity-claim wait from cache pruning and the command", async () => {
  const f = fixture();
  const locks = join(f.cache, ".locks");
  const marker = join(f.root, "capacity-held");
  mkdirSync(locks, { recursive: true });
  const holder = spawn("flock", ["-x", join(locks, ".capacity.lock"), "bash", "-c", `touch '${marker}'; sleep 3`], { stdio: "ignore" });
  try {
    for (let i = 0; i < 2400 && !existsSync(marker); i++) await sleepMs(20);
    assert.equal(existsSync(marker), true);
    const result = f.call(f.first, ["true"], { noInstall: true });
    assert.equal(result.status, 0, result.stderr);
    const row = receipts(f).at(-1);
    assert.ok(row.timing.capacity_claim_wait_ms >= 500, JSON.stringify(row.timing));
    assert.ok(row.timing.cache_lock_wait_ms.precheck >= 0, JSON.stringify(row.timing));
    assert.ok(row.waited_s >= 1, JSON.stringify(row));
    assert.ok(row.timing.pre_command_s >= 0, JSON.stringify(row.timing));
    assert.ok(row.timing.fetch_s >= 0 && row.timing.command_s >= 0 && row.timing.cleanup_s >= 0);
    assert.ok(row.timing.cache_prune_work_ms.cleanup >= 0);
    assert.match(result.stderr, /beelink-gate timing: /);
  } finally {
    holder.kill();
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("an exclusive capacity cleanup blocks a new checkout claim without taking its repo lock", async () => {
  const f = fixture();
  const locks = join(f.cache, ".locks");
  const held = join(f.root, "cleanup-held");
  const release = join(f.root, "release-cleanup");
  mkdirSync(locks, { recursive: true });
  const holder = spawn("flock", ["-x", join(locks, ".capacity.lock"), "bash", "-c",
    `touch '${held}'; while [ ! -e '${release}' ]; do sleep 0.05; done`], { stdio: "ignore" });
  let child;
  try {
    for (let i = 0; i < 2400 && !existsSync(held); i++) await sleepMs(20);
    assert.equal(existsSync(held), true);
    const args = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "true"].map(encode);
    child = spawn("bash", [gate, "--remote", ...args], { env: f.env });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const done = new Promise((resolveDone) => child.on("close", (status) => resolveDone(status)));
    for (let i = 0; i < 150 && !/waiting \d+s for capacity cleanup/.test(stderr); i++) await sleepMs(20);
    assert.match(stderr, /waiting \d+s for capacity cleanup/);
    assert.equal(run("flock", ["-n", "-x", join(locks, "local-owner-repo.lock"), "true"]).status, 0,
      "the gate claimed a checkout before cleanup released the capacity lock");
    writeFileSync(release, "");
    assert.equal(await done, 0, stderr);
  } finally {
    writeFileSync(release, "");
    holder.kill(); child?.kill();
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("a capacity writer drains new checkout claims across intent creation and removal", async () => {
  const f = fixture();
  const locks = join(f.cache, ".locks");
  const intent = join(locks, ".capacity.writer.intent");
  const held = join(f.root, "writer-held");
  const release = join(f.root, "release-writer");
  const admitted = join(f.root, "admitted");
  mkdirSync(locks, { recursive: true });
  const holder = spawn("flock", ["-x", join(locks, ".capacity.writer.lock"), "bash", "-c",
    `touch '${held}'; while [ ! -e '${release}' ]; do sleep 0.05; done`], { stdio: "ignore" });
  let child;
  try {
    for (let i = 0; i < 2400 && !existsSync(held); i++) await sleepMs(20);
    assert.equal(existsSync(held), true);
    const args = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "touch", admitted].map(encode);
    child = spawn("bash", [gate, "--remote", ...args], { env: f.env });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const done = new Promise((resolveDone) => child.on("close", (status) => resolveDone(status)));
    for (let i = 0; i < 150 && !/waiting \d+s for capacity writer/.test(stderr); i++) await sleepMs(20);
    assert.match(stderr, /waiting \d+s for capacity writer/);
    assert.equal(existsSync(admitted), false, "writer lock is live before its marker exists");
    writeFileSync(intent, "");
    await sleepMs(100);
    rmSync(intent);
    await sleepMs(100);
    assert.equal(existsSync(admitted), false, "marker removal cannot end a live writer");
    assert.equal(run("flock", ["-n", "-x", join(locks, "local-owner-repo.lock"), "true"]).status, 0,
      "the gate claimed a checkout while a writer intent was live");
    writeFileSync(release, "");
    assert.equal(await done, 0, stderr);
    assert.equal(existsSync(admitted), true);
    assert.equal(existsSync(intent), false);
  } finally {
    writeFileSync(release, "");
    holder.kill(); child?.kill();
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("a writer registering during a shared claim makes the gate give that claim back", async () => {
  const f = fixture();
  const locks = join(f.cache, ".locks");
  const intent = join(locks, ".capacity.writer.intent");
  const release = join(f.root, "release-writer");
  mkdirSync(locks, { recursive: true });
  writeFileSync(join(f.root, "bin", "flock"), `#!/usr/bin/env bash
if [[ "$1" == -w && "$2" == 1 && "$3" == -s ]]; then
  /usr/bin/flock "$@" || exit $?
  if [ ! -e '${join(f.root, "writer-triggered")}' ]; then
    touch '${join(f.root, "writer-triggered")}'
    fd=$4
    eval "exec $fd>&-"
    /usr/bin/flock -x '${join(locks, ".capacity.writer.lock")}' bash -c "touch '${intent}'; while [ ! -e '${release}' ]; do sleep 0.05; done; rm '${intent}'" >/dev/null 2>&1 &
    for _ in {1..100}; do [ -e '${intent}' ] && exit 0; sleep 0.02; done
    exit 1
  fi
  exit 0
fi
exec /usr/bin/flock "$@"
`);
  chmodSync(join(f.root, "bin", "flock"), 0o755);
  let child;
  try {
    const args = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "true"].map(encode);
    child = spawn("bash", [gate, "--remote", ...args], { env: f.env });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const done = new Promise((resolveDone) => child.on("close", (status) => resolveDone(status)));
    for (let i = 0; i < 150 && !/waiting \d+s for capacity writer/.test(stderr); i++) await sleepMs(20);
    assert.match(stderr, /waiting \d+s for capacity writer/);
    assert.equal(run("flock", ["-n", "-x", join(locks, "local-owner-repo.lock"), "true"]).status, 0,
      "the gate took its repo lock after a writer registered during the shared claim");
    writeFileSync(release, "");
    assert.equal(await done, 0, stderr);
  } finally {
    writeFileSync(release, "");
    child?.kill();
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("a dead capacity writer's intent is cleared and a live writer times out new claims", async () => {
  const f = fixture();
  const locks = join(f.cache, ".locks");
  const intent = join(locks, ".capacity.writer.intent");
  mkdirSync(locks, { recursive: true });
  let holder;
  try {
    writeFileSync(intent, "abandoned");
    const recovered = f.call(f.first, ["true"], { noInstall: true });
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(existsSync(intent), false, "the abandoned marker survived an unlocked writer fd");

    const held = join(f.root, "writer-held");
    holder = spawn("flock", ["-x", join(locks, ".capacity.writer.lock"), "bash", "-c",
      `touch '${intent}' '${held}'; sleep 10`], { stdio: "ignore" });
    for (let i = 0; i < 2400 && !existsSync(held); i++) await sleepMs(20);
    assert.equal(existsSync(held), true);
    const refused = f.call(f.first, ["true"], { noInstall: true, env: { BEELINK_GATE_CAPACITY_INTENT_WAIT_SECONDS: "1" } });
    assert.equal(refused.status, 75, refused.stderr);
    assert.match(refused.stderr, /TEMPFAIL .*capacity writer intent exceeded 1s/);
    const returned = f.call(f.first, ["true"], { noInstall: true, env: { BEELINK_GATE_AUTO: "1", BEELINK_GATE_CAPACITY_INTENT_WAIT_SECONDS: "1" } });
    assert.equal(returned.status, 76, returned.stderr);
    assert.match(returned.stderr, /capacity writer intent exceeded 1s.*placing the gate again/);
    assert.equal(run("flock", ["-n", "-x", join(locks, "local-owner-repo.lock"), "true"]).status, 0);
  } finally {
    holder?.kill();
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("two gates claim concurrently while an exclusive pruner waits for the shared claim", async () => {
  const f = fixture();
  const locks = join(f.cache, ".locks");
  const firstClaim = join(f.root, "first-claim");
  const release = join(f.root, "release-claim");
  const prunerEntered = join(f.root, "pruner-entered");
  const otherBare = join(f.root, "owner", "other.git");
  f.git(["clone", "-q", "--bare", f.source, otherBare], f.root);
  mkdirSync(locks, { recursive: true });
  const firstLock = join(locks, "local-owner-repo.lock");
  writeFileSync(join(f.root, "bin", "flock"), `#!/usr/bin/env bash
if [[ "$1" == -n && "$2" == -x && "$(readlink "/proc/$PPID/fd/$3")" == '${firstLock}' ]]; then
  touch '${firstClaim}'
  while [ ! -e '${release}' ]; do sleep 0.05; done
fi
exec /usr/bin/flock "$@"
`);
  chmodSync(join(f.root, "bin", "flock"), 0o755);
  const args = (url) => ["beelink2", url, f.first, "no-install", f.windowDay, f.windowHour, "true"].map(encode);
  const launch = (url) => {
    const child = spawn("bash", [gate, "--remote", ...args(url)], { env: f.env });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    return { child, done: new Promise((resolveDone) => child.on("close", (status) => resolveDone({ status, stderr }))) };
  };
  let first, second, pruner;
  try {
    first = launch(f.url);
    for (let i = 0; i < 150 && !existsSync(firstClaim); i++) await sleepMs(20);
    assert.equal(existsSync(firstClaim), true, "first gate never entered its shared claim");
    second = launch(`file://${otherBare}`);
    const otherHolder = join(locks, "local-owner-other.lock.holder");
    for (let i = 0; i < 150 && !existsSync(otherHolder); i++) await sleepMs(20);
    assert.equal(existsSync(otherHolder), true, "another repo could not claim under the shared lock");
    pruner = spawn("flock", ["-x", join(locks, ".capacity.lock"), "bash", "-c", `touch '${prunerEntered}'`], { stdio: "ignore" });
    await sleepMs(100);
    assert.equal(existsSync(prunerEntered), false, "exclusive pruner entered during a shared claim");
    writeFileSync(release, "");
    const results = await Promise.all([first.done, second.done]);
    assert.ok(results.every((result) => result.status === 0), JSON.stringify(results));
    for (let i = 0; i < 150 && !existsSync(prunerEntered); i++) await sleepMs(20);
    assert.equal(existsSync(prunerEntered), true, "pruner did not proceed after the claim finished");
  } finally {
    writeFileSync(release, "");
    first?.child.kill(); second?.child.kill(); pruner?.kill();
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("an admitted gate tells its command so through BEELINK_GATE_ADMITTED", () => {
  const f = fixture();
  try {
    const result = f.call(f.first, ["bash", "-c", 'printf "%s" "${BEELINK_GATE_ADMITTED:-unset}"'], { noInstall: true });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "1");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a finished gate stops every process its command left running, detached or not", () => {
  const f = fixture();
  const pids = join(f.root, "pids");
  const running = (pid) => {
    try { return readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1][0] !== "Z"; } catch { return false; }
  };
  let left = [];
  try {
    const script = `sleep 300 >/dev/null 2>&1 & echo $! >> '${pids}'; setsid sleep 300 >/dev/null 2>&1 < /dev/null & echo $! >> '${pids}'`;
    const result = f.call(f.first, ["bash", "-c", script], { noInstall: true });
    assert.equal(result.status, 0, result.stderr);
    left = readFileSync(pids, "utf8").trim().split("\n").map(Number);
    assert.equal(left.length, 2);
    assert.deepEqual(left.filter(running), [], "a process outlived its gate");
    assert.match(result.stderr, /receipt: .* reaped=2 bundle=none host_cpu=/);
    assert.equal(receipts(f).at(-1).reaped, 2);
  } finally {
    for (const pid of left) { try { process.kill(pid, "SIGKILL"); } catch {} }
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("a command's commits that never reached the remote are saved to a bundle before the checkout is released", () => {
  const f = fixture();
  try {
    // The command commits, then its push fails.
    const script = "git -c user.name=t -c user.email=t@t commit -q --allow-empty -m observer && git rev-parse HEAD && exit 1";
    const result = f.call(f.first, ["bash", "-c", script], { noInstall: true });
    assert.equal(result.status, 1, result.stderr);
    const commit = result.stdout.trim().split("\n").at(-1);
    const bundle = receipts(f).at(-1).bundle;
    assert.ok(bundle && existsSync(bundle), result.stderr);
    assert.match(result.stderr, /1 commit\(s\) not on the remote saved to .*\.bundle/);
    assert.match(result.stderr, new RegExp(`bundle=${bundle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} host_cpu=`));
    const heads = spawnSync("git", ["bundle", "list-heads", bundle], { encoding: "utf8" });
    assert.match(heads.stdout, new RegExp(`^${commit} HEAD$`, "m"));
    // A gate whose command commits nothing writes no bundle.
    const clean = f.call(f.first, ["true"], { noInstall: true });
    assert.equal(clean.status, 0, clean.stderr);
    assert.equal(receipts(f).at(-1).bundle, null);
    assert.match(clean.stderr, /bundle=none host_cpu=/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a branch-only commit is bundled under its branch once, and a later gate does not bundle it again", () => {
  const f = fixture();
  try {
    const id = "-c user.name=t -c user.email=t@t";
    const script = `git switch -qc side && git ${id} commit -q --allow-empty -m side && git rev-parse HEAD && git switch -q --detach ${f.first}`;
    const first = f.call(f.first, ["bash", "-c", script], { noInstall: true });
    assert.equal(first.status, 0, first.stderr);
    const commit = first.stdout.trim().split("\n").at(-1);
    const bundle = receipts(f).at(-1).bundle;
    assert.ok(bundle && existsSync(bundle), first.stderr);
    assert.match(first.stderr, /restore: git fetch \S+\.bundle refs\/heads\/side:refs\/gate-bundle\/side/);
    assert.match(spawnSync("git", ["bundle", "list-heads", bundle], { encoding: "utf8" }).stdout, new RegExp(`^${commit} refs/heads/side$`, "m"));
    const later = f.call(f.first, ["true"], { noInstall: true });
    assert.equal(later.status, 0, later.stderr);
    assert.equal(receipts(f).at(-1).bundle, null, later.stderr);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("when no bundle can be written, unpushed commits are kept as refs in the checkout", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.root, "state"), { recursive: true });
    writeFileSync(join(f.root, "state", "bundles"), "not a directory");
    const script = "git -c user.name=t -c user.email=t@t commit -q --allow-empty -m kept && git rev-parse HEAD";
    const result = f.call(f.first, ["bash", "-c", script], { noInstall: true });
    assert.equal(result.status, 0, result.stderr);
    const commit = result.stdout.trim().split("\n").at(-1);
    const saved = receipts(f).at(-1).bundle;
    assert.match(saved, /^refs\/beelink-gate-saved\/\S+$/);
    assert.match(result.stderr, /WARNING could not write a bundle; 1 unpushed commit\(s\) kept as refs\/beelink-gate-saved/);
    const checkout = join(f.cache, "local", "owner", "repo");
    assert.equal(f.git(["-C", checkout, "rev-parse", `${saved}/HEAD`], f.root), commit);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a --dev run has its own checkout and slots, waits behind no merge gate, and gets no starvation backstop", async () => {
  const f = fixture();
  const holders = [];
  try {
    mkdirSync(join(f.cache, ".locks"), { recursive: true });
    // Both merge checkouts and every merge slot are taken.
    for (const name of ["local-owner-repo.lock", "local-owner-repo@1.lock", "slot-0.lock"]) {
      const marker = join(f.root, `held-${name}`);
      holders.push(spawn("flock", ["-x", join(f.cache, ".locks", name), "bash", "-c", `touch '${marker}'; sleep 20`], { stdio: "ignore" }));
      for (let i = 0; i < 2400 && !existsSync(marker); i++) await sleepMs(50);
    }
    const env = { BEELINK_GATE_CLASS: "dev", BEELINK_GATE_MAX_CONCURRENT: "1" };
    const dev = f.call(f.first, ["git", "rev-parse", "HEAD"], { noInstall: true, env });
    assert.equal(dev.status, 0, dev.stderr);
    assert.equal(dev.stdout.trim(), f.first);
    assert.match(dev.stderr, /using second checkout repo@dev/);
    assert.match(dev.stderr, /receipt: .*class=dev/);
    assert.equal(receipts(f).at(-1).class, "dev");
    const pressure = join(f.root, "pressure");
    writeFileSync(pressure, pressureLine(60));
    const starved = f.call(f.first, ["true"], { noInstall: true, env: { ...env, BEELINK_GATE_HOST_PRESSURE: pressure, BEELINK_GATE_STARVE_AFTER: "1s", BEELINK_GATE_LOAD_WAIT: "2s", BEELINK_GATE_LOAD_POLL_SECONDS: "1" } });
    assert.equal(starved.status, 75, starved.stderr);
    assert.doesNotMatch(starved.stderr, /STARVED/);
  } finally {
    for (const h of holders) h.kill();
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("the launcher forwards --dev and refuses it with --ship or --light", () => {
  const f = fixture();
  try {
    const env = loadedHosts(f, 0.5, 0.5);
    const ok = run(gate, ["--dev", "--no-install", "beelink2", f.url, f.first, "--", "true"], { env });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(readFileSync(join(f.root, "ssh-remote-command"), "utf8"), /BEELINK_GATE_CLASS=dev /);
    assert.match(ok.stderr, /receipt: .*class=dev/);
    for (const flag of ["--ship", "--light"]) {
      const args = flag === "--ship" ? ["--dev", flag, "beelink2", f.url, f.first] : ["--dev", flag, "beelink2", f.url, f.first, "--", "true"];
      const refused = run(gate, args, { env });
      assert.equal(refused.status, 2, flag);
      assert.match(refused.stderr, /--dev cannot be combined with/);
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("--report counts a renamed repo under its current name and marks a missing host's receipts as partial", () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    const at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    const row = (repo, sha) => JSON.stringify({ at, host: "beelink2", repo, sha, mode: "install", command: "npm test", exit: 0, waited_s: 5 });
    mkdirSync(join(f.root, "state"), { recursive: true });
    writeFileSync(join(f.root, "state", "receipts.jsonl"), [row("github.com/o/old", "a"), row("github.com/o/r", "b")].join("\n") + "\n");
    // GitHub resolves the old name to the new one; search answers 2 merged PRs.
    writeFileSync(join(f.root, "bin", "gh-drew"), '#!/usr/bin/env bash\n[[ "$*" == *repos/o/old* ]] && { echo o/r; exit 0; }\necho 2\n');
    chmodSync(join(f.root, "bin", "gh-drew"), 0o755);
    const drops = join(f.root, "receipt-drops");
    const env = { ...f.env, FAKE_WU_DAY: String(f.windowDay), FAKE_WU_HOUR: String(f.windowHour), FAKE_RECEIPT_DROPS: drops, BEELINK_GATE_PROBE_RETRY_SECONDS: "0" };
    writeFileSync(drops, "1\n");
    const retried = run(gate, ["--report", "24"], { env });
    assert.equal(retried.status, 0, retried.stderr);
    assert.match(retried.stdout, /o\/r\s+4\s+2\s+2\.0 /);
    assert.doesNotMatch(retried.stdout, /o\/old|PARTIAL/);
    writeFileSync(drops, "2\n");
    const partial = run(gate, ["--report", "24"], { env });
    assert.equal(partial.status, 75, partial.stderr);
    assert.match(partial.stderr, /could not read beelink1's receipts/);
    assert.match(partial.stdout, /^PARTIAL missing receipts from beelink1;/m);
    assert.match(partial.stdout, /TOTAL 2 runs \/ 2 merged PRs = 1\.0 runs per merged PR \(target <= 1\.5\) PARTIAL missing beelink1/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a command's own pnpm uses the gate's store and never stops on a modules purge prompt", () => {
  const f = fixture();
  try {
    const result = f.call(f.first, ["bash", "-c", 'printf "%s|%s" "$npm_config_store_dir" "$npm_config_confirm_modules_purge"'], { noInstall: true });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${f.home}/.local/share/pnpm/store|false`);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("auto retries a dropped probe instead of calling a busy beelink unreachable", () => {
  const f = fixture();
  try {
    const drops = join(f.root, "probe-drops");
    const env = { ...loadedHosts(f, 0.5, 0.5), FAKE_PROBE_DROPS: drops, BEELINK_GATE_PROBE_RETRY_SECONDS: "0.1" };
    // Two dropped connections: the probe of the first host succeeds on its third try.
    writeFileSync(drops, "2\n");
    const result = run(gate, ["--no-install", "auto", f.url, f.first, "--", "true"], { env });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /beelink1: unreachable/);
    assert.equal(readFileSync(drops, "utf8").trim(), "0");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("an --urgent auto gate is never given an admission deadline, so it keeps its host and its place", () => {
  const f = fixture();
  try {
    const env = loadedHosts(f, 0.5, 0.5);
    const normal = run(gate, ["--no-install", "auto", f.url, f.first, "--", "true"], { env });
    assert.equal(normal.status, 0, normal.stderr);
    assert.match(readFileSync(join(f.root, "ssh-remote-command"), "utf8"), /BEELINK_GATE_ADMIT_WAIT=60 /);
    const urgent = run(gate, ["--urgent", "--no-install", "auto", f.url, f.first, "--", "true"], { env });
    assert.equal(urgent.status, 0, urgent.stderr);
    const sent = readFileSync(join(f.root, "ssh-remote-command"), "utf8");
    assert.match(sent, /BEELINK_GATE_URGENT=1 /);
    assert.doesNotMatch(sent, /BEELINK_GATE_ADMIT_WAIT/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("urgent auto reserves both hosts before either checkout frees", async () => {
  const f = fixture();
  installFakeSsh(f);
  const cachePrefix = join(f.root, "host-cache");
  const events = join(f.root, "events");
  const holders = [];
  const gates = [];
  const launch = (priority, target) => new Promise((done) => {
    const child = spawn("bash", [gate, ...(priority ? ["--urgent"] : []), "--no-install", target,
      f.url, f.first, "--", "bash", "-c", `echo ${priority ? "urgent" : "normal"} >> '${events}'`],
    { env: { ...f.env, FAKE_CACHE_PREFIX: cachePrefix, BEELINK_GATE_REPO_CHECKOUTS: "1", BEELINK_GATE_AUTO_POLL_SECONDS: "0.2" } });
    gates.push(child);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => done({ status, stderr }));
  });
  try {
    for (const ip of ["100.98.195.7", "100.127.22.51"]) {
      const locks = join(`${cachePrefix}-${ip}`, ".locks");
      mkdirSync(locks, { recursive: true });
      const holder = spawn("python3", ["-c", 'import fcntl,sys,time; fh=open(sys.argv[1],"w"); fcntl.flock(fh, fcntl.LOCK_EX); print("held", flush=True); time.sleep(60)',
        join(locks, "local-owner-repo.lock")], { stdio: ["ignore", "pipe", "ignore"] });
      holders.push(holder);
      await new Promise((ok) => holder.stdout.once("data", ok));
    }
    const urgent = launch(true, "auto");
    for (let i = 0; i < 200; i++) {
      if (["100.98.195.7", "100.127.22.51"].every((ip) =>
        readdirSync(join(`${cachePrefix}-${ip}`, ".locks")).some((n) => n.startsWith("urgent-local-owner-repo.")))) break;
      await sleepMs(25);
    }
    for (const ip of ["100.98.195.7", "100.127.22.51"]) {
      assert.ok(readdirSync(join(`${cachePrefix}-${ip}`, ".locks")).some((n) => n.startsWith("urgent-local-owner-repo.")), `${ip} reserved`);
    }
    const normal = launch(false, "beelink2");
    await sleepMs(300);
    holders[1].kill("SIGKILL");
    const u = await urgent;
    assert.equal(u.status, 0, u.stderr);
    const n = await normal;
    assert.equal(n.status, 0, n.stderr);
    assert.equal(readFileSync(events, "utf8").trim().split("\n").join(","), "urgent,normal");
    assert.match(u.stderr, /urgent priority reserved on both beelinks/);
    for (let i = 0; i < 50 && ["100.98.195.7", "100.127.22.51"].some((ip) =>
      readdirSync(join(`${cachePrefix}-${ip}`, ".locks")).some((name) => name.startsWith("urgent-"))); i++) await sleepMs(100);
    for (const ip of ["100.98.195.7", "100.127.22.51"]) {
      assert.deepEqual(readdirSync(join(`${cachePrefix}-${ip}`, ".locks")).filter((n) => n.startsWith("urgent-")), [], `${ip} reservation removed`);
    }
  } finally {
    for (const gateChild of gates) gateChild.kill("SIGKILL");
    for (const holder of holders) holder.kill("SIGKILL");
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("urgent auto returns the remote command failure after stopping its reservation monitor", () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    const env = { ...f.env, FAKE_WU_DAY: String(f.windowDay), FAKE_WU_HOUR: String(f.windowHour) };
    const result = run(gate, ["--urgent", "--no-install", "auto", f.url, f.first, "--", "bash", "-c", "exit 7"], { env });
    assert.equal(result.status, 7, result.stderr);
    assert.match(result.stderr, /receipt: .*exit=7/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("urgent light auto reserves the light checkout pool on both hosts", async () => {
  const f = fixture();
  installFakeSsh(f);
  const cachePrefix = join(f.root, "host-cache");
  const holders = [];
  let gateChild;
  try {
    for (const ip of ["100.98.195.7", "100.127.22.51"]) {
      const locks = join(`${cachePrefix}-${ip}`, ".locks");
      mkdirSync(locks, { recursive: true });
      const holder = spawn("python3", ["-c", 'import fcntl,sys,time; fh=open(sys.argv[1],"w"); fcntl.flock(fh, fcntl.LOCK_EX); print("held", flush=True); time.sleep(60)',
        join(locks, "local-owner-repo@light.lock")], { stdio: ["ignore", "pipe", "ignore"] });
      holders.push(holder);
      await new Promise((ok) => holder.stdout.once("data", ok));
    }
    gateChild = spawn("bash", [gate, "--urgent", "--light", "auto", f.url, f.first, "--", "true"],
      { env: { ...f.env, FAKE_CACHE_PREFIX: cachePrefix, BEELINK_GATE_AUTO_POLL_SECONDS: "0.2" } });
    for (let i = 0; i < 200; i++) {
      if (["100.98.195.7", "100.127.22.51"].every((ip) =>
        readdirSync(join(`${cachePrefix}-${ip}`, ".locks")).some((n) => n.startsWith("urgent-local-owner-repo@light.")))) break;
      await sleepMs(25);
    }
    for (const ip of ["100.98.195.7", "100.127.22.51"]) {
      const markers = readdirSync(join(`${cachePrefix}-${ip}`, ".locks")).filter((n) => n.startsWith("urgent-"));
      assert.ok(markers.some((n) => n.startsWith("urgent-local-owner-repo@light.")), `${ip}: ${markers}`);
      assert.ok(markers.every((n) => !n.startsWith("urgent-local-owner-repo.")), `${ip}: ${markers}`);
    }
  } finally {
    gateChild?.kill("SIGTERM");
    for (const holder of holders) holder.kill("SIGKILL");
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("workers inside a gate are capped at cores per running gate, unless the caller chose", async () => {
  const f = fixture();
  const holders = [];
  try {
    mkdirSync(join(f.cache, ".locks"), { recursive: true });
    for (const n of [1, 2, 3]) {
      const marker = join(f.root, `slot-${n}`);
      holders.push(spawn("flock", ["-x", join(f.cache, ".locks", `slot-${n}.lock`), "bash", "-c", `touch '${marker}'; sleep 20`], { stdio: "ignore" }));
      for (let i = 0; i < 2400 && !existsSync(marker); i++) await sleepMs(50);
    }
    const cores = Number(spawnSync("nproc", { encoding: "utf8" }).stdout.trim());
    const expected = Math.max(2, Math.floor(cores / 4));
    const show = ["bash", "-c", 'printf "%s %s %s %s %s" "$VITEST_MAX_WORKERS" "$VITEST_MAX_FORKS" "$VITEST_MAX_THREADS" "$TURBO_CONCURRENCY" "$CARGO_BUILD_JOBS"'];
    const result = f.call(f.first, show, { noInstall: true });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, Array(5).fill(String(expected)).join(" "));
    assert.match(result.stderr, new RegExp(`receipt: .*workers=${expected}`));
    const chosen = f.call(f.first, ["bash", "-c", 'printf "%s" "$CARGO_BUILD_JOBS"'], { noInstall: true, env: { CARGO_BUILD_JOBS: "7" } });
    assert.equal(chosen.stdout, "7");
  } finally {
    for (const h of holders) h.kill();
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("a GitHub cache fetches over SSH whatever URL spelling the caller passed", () => {
  const dir = mkdtempSync(join(tmpdir(), "beelink-gate-url-"));
  try {
    const fns = `source <(sed -n '/^parse_repo_url() {/,/^}/p;/^adopt_origin() {/,/^}/p;/^fetch_url() {/,/^}/p;/^die() {/p' '${gate}')`;
    const map = run("bash", ["-c", `${fns}; for u in https://github.com/o/r https://github.com/o/r.git git@github.com:o/r.git file:///x/o/r.git; do parse_repo_url "$u"; fetch_url "$u"; done`]);
    assert.equal(map.status, 0, map.stderr);
    assert.deepEqual(map.stdout.trim().split("\n"), ["git@github.com:o/r.git", "git@github.com:o/r.git", "git@github.com:o/r.git", "file:///x/o/r.git"]);
    // A cache an earlier gate created from the https spelling is moved to SSH.
    const repo = join(dir, "r");
    run("git", ["init", "-q", repo]);
    run("git", ["-C", repo, "remote", "add", "origin", "https://github.com/o/r"]);
    const adopt = run("bash", ["-c", `${fns}; parse_repo_url https://github.com/o/r; adopt_origin '${repo}' https://github.com/o/r && git -C '${repo}' config --get remote.origin.url`]);
    assert.equal(adopt.status, 0, adopt.stderr);
    assert.equal(adopt.stdout.trim(), "git@github.com:o/r.git");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a gate that cannot reach the origin exits 75, not as a failed change", () => {
  const f = fixture();
  try {
    const realGit = spawnSync("bash", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
    const failBin = join(f.root, "fail-bin");
    mkdirSync(failBin);
    writeFileSync(join(failBin, "git"), `#!/usr/bin/env bash\n[[ " $* " == *" ls-remote "* ]] && { echo "fatal: could not read Username for 'https://github.com': terminal prompts disabled" >&2; exit 128; }\nexec ${realGit} "$@"\n`);
    chmodSync(join(failBin, "git"), 0o755);
    const result = f.call(f.first, ["true"], { noInstall: true, env: { PATH: `${failBin}:${f.env.PATH}` } });
    assert.equal(result.status, 75, result.stderr);
    assert.match(result.stderr, /TEMPFAIL .*could not reach local\/owner\/repo/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a free checkout goes to the oldest waiting gate, not the first to poll", async () => {
  const f = fixture();
  try {
    mkdirSync(join(f.cache, ".locks"), { recursive: true });
    // An older gate is still waiting: its ticket names a live process and an earlier enqueue time.
    const older = spawn("sleep", ["30"], { stdio: "ignore" });
    const ticket = join(f.cache, ".locks", `queue-local-owner-repo.${Math.floor(Date.now() / 1000) - 600}.${older.pid}`);
    writeFileSync(ticket, "");
    const args = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "true"].map(encode);
    const child = spawn("bash", [gate, "--remote", ...args], { env: { ...f.env, BEELINK_GATE_REPO_CHECKOUTS: "1" } });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const closed = new Promise((resolveDone) => child.on("close", resolveDone));
    await sleepMs(3000);
    // The checkout is free, yet the newer gate has not taken it.
    assert.doesNotMatch(stderr, /admitted/);
    older.kill();
    assert.equal(await closed, 0, stderr);
    assert.match(stderr, /admitted/);
    assert.equal(readdirSync(join(f.cache, ".locks")).filter((n) => n.startsWith("queue-")).length, 0, "tickets are cleaned up");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a free checkout is not held for an older ticket whose gate is not polling for one", () => {
  const f = fixture();
  const older = spawn("sleep", ["60"], { stdio: "ignore" });
  try {
    // An older gate waiting for load, or an auto reservation whose gate runs on the other host,
    // never refreshes its ticket here. beelink2's free checkout sat empty for 15 min behind such tickets.
    mkdirSync(join(f.cache, ".locks"), { recursive: true });
    const ticket = join(f.cache, ".locks", `queue-local-owner-repo.${Math.floor(Date.now() / 1000) - 600}.${older.pid}`);
    writeFileSync(ticket, "");
    const stale = Date.now() / 1000 - 60;
    utimesSync(ticket, stale, stale);
    const run = f.call(f.first, ["true"], { noInstall: true, env: { BEELINK_GATE_REPO_CHECKOUTS: "1", BEELINK_GATE_ADMIT_WAIT: "10" } });
    assert.equal(run.status, 0, run.stderr);
  } finally { older.kill(); rmSync(f.root, { recursive: true, force: true }); }
});

test("an auto gate keeps its reservation's place in line, so it and a newer gate never wait for each other", async () => {
  const f = fixture();
  const owners = [];
  try {
    // The launcher reserved the auto gate's place on both hosts at epoch `reserved`. Every
    // ticket is owned by a live process and written after it starts, as waiter_alive requires.
    const token = "ab".repeat(16);
    const reserved = Math.floor(Date.now() / 1000) - 100;
    const live = async () => { const child = spawn("sleep", ["120"]); owners.push(child); await sleepMs(50); return child.pid; };
    const [reservation, newcomer] = [await live(), await live()].sort((a, b) => a - b);
    const caches = ["100.98.195.7", "100.127.22.51"].map((ip) => join(f.root, `cache-${ip}`));
    const ticketDir = (cache) => { mkdirSync(join(cache, ".locks"), { recursive: true }); return join(cache, ".locks"); };
    for (const cache of caches) writeFileSync(join(ticketDir(cache), `queue-local-owner-repo.${reserved}.${reservation}`), token);
    const beelink2 = caches[1];
    const events = join(f.root, "events");
    const gateOn = (who, env) => f.call(f.first, ["bash", "-c", `echo ${who} >> '${events}'`], { noInstall: true,
      env: { BEELINK_GATE_CACHE_ROOT: beelink2, BEELINK_GATE_REPO_CHECKOUTS: "1", BEELINK_GATE_ADMIT_WAIT: "3", ...env } });
    // The auto gate was placed after waiting 0 s, so `now - placed_wait` would date it now.
    const auto = { BEELINK_GATE_AUTO: "1", BEELINK_GATE_RESERVATION_TOKEN: token, BEELINK_GATE_PLACED_WAIT: "0" };

    // A newer gate dated between the reservation and now - placed_wait: the auto gate goes
    // first, and the newer gate, dated by its own wait, defers to the reservation alone.
    // No epochs tie, so no pid decides the order.
    let newerTicket = join(ticketDir(beelink2), `queue-local-owner-repo.${reserved + 50}.${newcomer}`);
    writeFileSync(newerTicket, "");
    const first = gateOn("auto", auto);
    assert.equal(first.status, 0, `the auto gate waited for a newer gate\n${first.stderr}`);
    rmSync(newerTicket);
    const second = gateOn("newer", { BEELINK_GATE_AUTO: "1", BEELINK_GATE_PLACED_WAIT: String(Math.floor(Date.now() / 1000) - reserved - 50) });
    assert.equal(second.status, 76, `the newer gate went ahead of the reservation\n${second.stderr}`);
    assert.match(second.stderr, /not admitted on beelink2 within 3s \(both local\/owner\/repo checkouts busy\)/);

    // A newer ticket in the reservation's own second, with a larger pid than the reservation:
    // the auto gate's place is the oldest of its tickets, so it does not wait either. (A real
    // gate's own pid cannot be chosen, so only this side of a tie is checked.)
    newerTicket = join(ticketDir(beelink2), `queue-local-owner-repo.${reserved}.${newcomer}`);
    writeFileSync(newerTicket, "");
    const tied = gateOn("auto", auto);
    assert.equal(tied.status, 0, `in a tie the auto gate waited for a newer gate\n${tied.stderr}`);
    rmSync(newerTicket);
    assert.deepEqual(readFileSync(events, "utf8").trim().split("\n"), ["auto", "auto"]);
  } finally {
    for (const child of owners) child.kill("SIGKILL");
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("a normal auto waiter keeps its place ahead of a newer gate while both hosts are busy", async () => {
  const f = fixture();
  const events = join(f.root, "fifo-events");
  const b1 = join(f.root, "cache-100.98.195.7", ".locks");
  const b2 = join(f.root, "cache-100.127.22.51", ".locks");
  mkdirSync(b1, { recursive: true });
  mkdirSync(b2, { recursive: true });
  const holder = spawn("python3", ["-u", "-c", 'import fcntl,sys,time; fs=[open(p,"w") for p in sys.argv[1:]]; [fcntl.flock(f,fcntl.LOCK_EX) for f in fs]; print("held",flush=True); time.sleep(60)', join(b1, "local-owner-repo.lock"), join(b2, "local-owner-repo.lock")], { stdio: ["ignore", "pipe", "ignore"] });
  let older, newer;
  try {
    await new Promise((done) => holder.stdout.once("data", done));
    const env = { ...loadedHosts(f, 0.5, 0.5), BEELINK_GATE_REPO_CHECKOUTS: "1", BEELINK_GATE_AUTO_POLL_SECONDS: "20", BEELINK_GATE_LOAD_WAIT: "35s" };
    older = spawn(gate, ["--no-install", "auto", f.url, f.first, "--", "bash", "-c", `echo older >> '${events}'`], { env });
    let olderErr = "", olderLoggedFirst;
    older.stderr.on("data", (chunk) => { olderErr += chunk; });
    // The older gate's admission line reaches this test through the launcher's log relay, which can lag
    // the host under load, so order is read from its own job log at the moment the newer gate is admitted.
    const olderLogged = () => {
      const id = /gate_id=([\w-]+)/.exec(olderErr)?.[1];
      const log = id && join(f.root, "state", "jobs", id, "stderr.log");
      return Boolean(log && existsSync(log) && /admitted on beelink/.test(readFileSync(log, "utf8")));
    };
    for (let i = 0; i < 2400 && !/no beelink is both free/.test(olderErr); i++) await sleepMs(25);
    assert.match(olderErr, /no beelink is both free/);

    const args = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "bash", "-c", `echo newer >> '${events}'`].map(encode);
    newer = spawn("bash", [gate, "--remote", ...args], { env: { ...f.env, BEELINK_GATE_CACHE_ROOT: join(f.root, "cache-100.127.22.51"), BEELINK_GATE_REPO_CHECKOUTS: "1" } });
    let newerErr = "";
    newer.stderr.on("data", (chunk) => { newerErr += chunk; if (olderLoggedFirst === undefined && /admitted on beelink/.test(newerErr)) olderLoggedFirst = olderLogged(); });
    for (let i = 0; i < 2400 && !/waiting \d+s for one of 1/.test(newerErr); i++) await sleepMs(25);
    assert.match(newerErr, /waiting \d+s for one of 1/);
    holder.kill("SIGKILL");
    const [olderStatus, newerStatus] = await Promise.all([new Promise((done) => older.once("close", done)), new Promise((done) => newer.once("close", done))]);
    assert.equal(olderStatus, 0, olderErr);
    assert.equal(newerStatus, 0, newerErr);
    // The FIFO property is admission order: the newer gate is admitted only after the
    // older one. Once they run on different hosts, which echo lands first is a race
    // (it failed 3 of about 10 gate runs on 2026-10-15), so the echoes are compared as a set.
    assert.equal(olderLoggedFirst, true, `${olderErr}\n${newerErr}`);
    assert.deepEqual(readFileSync(events, "utf8").trim().split("\n").sort(), ["newer", "older"]);
    for (const locks of [b1, b2]) {
      assert.deepEqual(readdirSync(locks).filter((name) => name.startsWith("queue-")), [], "normal reservation and gate tickets are removed");
    }
  } finally {
    holder.kill("SIGKILL");
    older?.kill("SIGKILL");
    newer?.kill("SIGKILL");
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("a ticket whose pid now belongs to a later process does not hold the checkout", () => {
  const f = fixture();
  const reused = spawn("sleep", ["30"], { stdio: "ignore" });
  try {
    mkdirSync(join(f.cache, ".locks"), { recursive: true });
    // A killed gate left this ticket an hour ago; its pid now names a process that started later.
    const ticket = join(f.cache, ".locks", `queue-local-owner-repo.${Math.floor(Date.now() / 1000) - 3600}.${reused.pid}`);
    writeFileSync(ticket, "");
    const old = new Date(Date.now() - 3600_000);
    utimesSync(ticket, old, old);
    const started = Date.now();
    const result = f.call(f.first, ["true"], { noInstall: true, env: { BEELINK_GATE_REPO_CHECKOUTS: "1" } });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(Date.now() - started < 15_000, "the gate waited behind a stale ticket");
    assert.equal(existsSync(ticket), false, "the stale ticket was kept");

    // The same live owner, with its start tick recorded: a clock step that dates the ticket 10 minutes
    // before its owner's computed start (beelink1's btime moved +723 s on 2026-10-18) keeps it in line.
    const tick = readFileSync(`/proc/${reused.pid}/stat`, "utf8").split(") ")[1].split(" ")[19];
    writeFileSync(ticket, `\nstart=${tick}\n`);
    const stepped = new Date(Date.now() - 600_000);
    utimesSync(ticket, stepped, stepped);
    const waited = f.call(f.first, ["true"], { noInstall: true, env: { BEELINK_GATE_REPO_CHECKOUTS: "1", BEELINK_GATE_ADMIT_WAIT: "3" } });
    assert.equal(waited.status, 76, `a clock step dropped a live owner's ticket\n${waited.stderr}`);
    assert.equal(existsSync(ticket), true, "the live owner's ticket was removed");
  } finally {
    reused.kill();
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("a gate that gives up while waiting leaves no queue ticket", () => {
  const f = fixture();
  try {
    const pressure = join(f.root, "pressure");
    writeFileSync(pressure, pressureLine(90));
    const result = f.call(f.first, ["true"], { noInstall: true, env: { BEELINK_GATE_HOST_PRESSURE: pressure, BEELINK_GATE_LOAD_WAIT: "1s", BEELINK_GATE_LOAD_POLL_SECONDS: "1" } });
    assert.equal(result.status, 75, result.stderr);
    const locks = join(f.cache, ".locks");
    const left = existsSync(locks) ? readdirSync(locks).filter((n) => n.startsWith("queue-") || n.startsWith("urgent-")) : [];
    assert.deepEqual(left, []);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a finished gate frees its checkout before the post-command cache prune", () => {
  const f = fixture();
  try {
    const lock = join(f.cache, ".locks", "local-owner-repo.lock");
    const seen = join(f.root, "du-saw-lock");
    // du runs inside the post-command prune; record whether the checkout lock is free at that moment.
    writeFileSync(join(f.root, "bin", "du"), `#!/usr/bin/env bash\nif flock -n '${lock}' true 2>/dev/null; then echo free >> '${seen}'; else echo held >> '${seen}'; fi\nexec /usr/bin/du "$@"\n`);
    chmodSync(join(f.root, "bin", "du"), 0o755);
    const result = f.call(f.first, ["true"], { noInstall: true, env: { BEELINK_GATE_REPO_CHECKOUTS: "1" } });
    assert.equal(result.status, 0, result.stderr);
    // The last du calls belong to the post-command prune.
    assert.equal(readFileSync(seen, "utf8").trim().split("\n").at(-1), "free");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("--summary ends a red gate with the suite's counts and failing tests from spec and TAP output", () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    const suite = join(f.root, "red.test.mjs");
    writeFileSync(suite, 'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("passes", () => {});\ntest("adds wrongly", () => { assert.equal(1 + 1, 3); });\n');
    for (const reporter of ["spec", "tap"]) {
      const red = run(gate, ["--summary", "--no-install", "beelink2", f.url, f.first, "--", process.execPath, "--test", `--test-reporter=${reporter}`, suite], { env: f.env });
      assert.equal(red.status, 1, red.stderr);
      // The summary follows the receipt and holds the failing test, its assertion and the counts.
      const summary = red.stderr.slice(red.stderr.indexOf("beelink-gate: summary of the failed command (exit 1)"));
      assert.ok(red.stderr.indexOf("receipt: ") < red.stderr.indexOf("beelink-gate: summary of"), red.stderr);
      assert.match(summary, /adds wrongly/);
      assert.match(summary, /2 !== 3/);
      assert.doesNotMatch(summary, /\bpasses\b/);
      assert.match(summary.trim().split("\n").at(-1), /^beelink-gate: summary tests=2 suites=0 pass=1 fail=1 /);
    }
    // vitest: a real red run's colored output (agent-container gate, 2026-10-22), replayed as the gate command.
    const vitestOut = resolve("tests/fixtures/beelink-gate/vitest-red.txt");
    const vitest = run(gate, ["--summary", "--no-install", "beelink2", f.url, f.first, "--", "bash", "-c", `cat ${JSON.stringify(vitestOut)}; exit 1`], { env: f.env });
    assert.equal(vitest.status, 1, vitest.stderr);
    const vitestSummary = vitest.stderr.slice(vitest.stderr.indexOf("beelink-gate: summary of the failed command (exit 1)"));
    assert.match(vitestSummary, /^FAIL {2}tests\/integration\/native-session-export-conservation\.test\.ts > .* > conserves a workspace/m);
    assert.match(vitestSummary, /^AssertionError: Internal Server Error: expected 500 to be 200/m);
    assert.doesNotMatch(vitestSummary, /excludes FIFOs|- Expected|❯ exportOf/);
    assert.equal(vitestSummary.trim().split("\n").at(-1), "beelink-gate: summary files=7 files_failed=4 files_passed=3 tests=54 failed=10 passed=44");
    const green = run(gate, ["--summary", "--no-install", "beelink2", f.url, f.first, "--", "true"], { env: f.env });
    assert.equal(green.status, 0, green.stderr);
    assert.doesNotMatch(green.stderr, /beelink-gate: summary/);
    const silent = run(gate, ["--summary", "--no-install", "beelink2", f.url, f.first, "--", "bash", "-c", "exit 3"], { env: f.env });
    assert.equal(silent.status, 3, silent.stderr);
    assert.equal(silent.stderr.trim().split("\n").at(-1), "beelink-gate: summary found no test counts or failing tests in the command output");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("--retry resubmits after TEMPFAIL, a dropped attach re-attaches by itself, and --retry stops when the window would pass", () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    // In front of the fake transport: fail the first schedule read (a launcher TEMPFAIL before
    // submission) and drop the first attach (a TEMPFAIL while the submitted gate runs on).
    const front = join(f.root, "front");
    mkdirSync(front);
    writeFileSync(join(front, "ssh"), `#!/usr/bin/env bash
for arg in "$@"; do
  if [[ "$arg" == reg && ! -e '${join(f.root, "reg-failed")}' ]]; then touch '${join(f.root, "reg-failed")}'; exit 1; fi
  if [[ "$arg" == --job-attach && ! -e '${join(f.root, "attach-dropped")}' ]]; then touch '${join(f.root, "attach-dropped")}'; exit 255; fi
done
exec '${join(f.root, "bin", "ssh")}' "$@"
`);
    chmodSync(join(front, "ssh"), 0o755);
    const env = { ...f.env, PATH: `${front}:${f.env.PATH}`, BEELINK_GATE_RETRY_SECONDS: "1" };
    const result = run(gate, ["--retry", "5", "--pin-host", "--no-install", "beelink2", f.url, f.first, "--", "cat", "value.txt"], { env, timeout: 60_000 });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "first\n");
    assert.match(result.stderr, /TEMPFAIL next_allowed=\S+Z cannot read the Windows Update schedule of beelink2/);
    assert.match(result.stderr, /--retry 5: attempt 1 got TEMPFAIL; attempt 2 starts at/);
    // The dropped attach re-attaches inside the same attempt instead of returning a TEMPFAIL for the caller to retry.
    assert.match(result.stderr, /attach connection lost for beelink2-[0-9a-f]{32}; re-attaching \(attempt 1 of 6\)/);
    assert.doesNotMatch(result.stderr, /attempt 3/);
    // One gate ran: the re-attach replayed it instead of submitting a second one.
    const submits = readFileSync(join(f.root, "ssh-remote-commands"), "utf8").split("\n").filter((line) => line.includes("--job-submit"));
    assert.equal(submits.length, 1, submits.join("\n"));
    assert.equal(receipts(f).length, 1);
    // A TEMPFAIL whose next_allowed falls after the window stops at once and keeps the contract's last line.
    const refused = run(gate, ["--retry", "1", "--pin-host", "--no-install", "beelink2", f.url, f.first, "--", "true"],
      { env: { ...f.env, FAKE_REG_FAIL: "1", BEELINK_GATE_STATE_DIR: join(f.root, "fresh-state") }, timeout: 60_000 });
    assert.equal(refused.status, 75, refused.stderr);
    assert.match(refused.stderr, /--retry 1: the next attempt could not start before the retry window ends at \S+Z; stopping after 1 attempts/);
    assert.match(refused.stderr.trim().split("\n").at(-1), /^beelink-gate: TEMPFAIL next_allowed=\S+Z cannot read the Windows Update schedule of beelink2$/);
    // A 75 with no TEMPFAIL line, here the command's own, is not resubmitted, and the contract line still ends it.
    const own = run(gate, ["--retry", "5", "--pin-host", "--no-install", "beelink2", f.url, f.first, "--", "bash", "-c", "exit 75"], { env, timeout: 60_000 });
    assert.equal(own.status, 75, own.stderr);
    assert.doesNotMatch(own.stderr, /attempt 2/);
    assert.match(own.stderr.trim().split("\n").at(-1), /^beelink-gate: TEMPFAIL next_allowed=\S+Z --retry 5: attempt 1 exited 75 without a TEMPFAIL line/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("--retry with --cancel-on-term cancels a gate it re-attached to when timeout stops it", async () => {
  const f = fixture();
  installFakeSsh(f);
  const started = join(f.root, "started");
  const release = join(f.root, "release");
  // Drop the first attach, so the wrapper re-attaches to the running gate.
  const front = join(f.root, "front");
  mkdirSync(front);
  writeFileSync(join(front, "ssh"), `#!/usr/bin/env bash
for arg in "$@"; do
  if [[ "$arg" == --job-attach && ! -e '${join(f.root, "attach-dropped")}' ]]; then touch '${join(f.root, "attach-dropped")}'; exit 255; fi
done
exec '${join(f.root, "bin", "ssh")}' "$@"
`);
  chmodSync(join(front, "ssh"), 0o755);
  const env = { ...f.env, PATH: `${front}:${f.env.PATH}`, BEELINK_GATE_RETRY_SECONDS: "1" };
  const waiter = spawn(gate, ["--retry", "5", "--cancel-on-term", "--pin-host", "--no-install", "beelink2", f.url, f.first, "--", "bash", "-c", `touch '${started}'; while [ ! -e '${release}' ]; do sleep 0.1; done`], { env, detached: true });
  const waiterDone = new Promise((done) => waiter.once("close", (code, signal) => done({ code, signal })));
  let waiterErr = "";
  waiter.stderr.on("data", (chunk) => { waiterErr += chunk; });
  try {
    for (let i = 0; i < 2400 && !/attach connection lost for beelink2-[0-9a-f]{32}; re-attaching/.test(waiterErr); i++) await sleepMs(25);
    const id = waiterErr.match(/attach connection lost for (beelink2-[0-9a-f]{32}); re-attaching/)?.[1];
    assert.ok(id, waiterErr);
    for (let i = 0; i < 2400 && !existsSync(started); i++) await sleepMs(25);
    assert.ok(existsSync(started), waiterErr);
    await sleepMs(3000); // past the re-attach's 2 s backoff: the wrapper is attached to the gate.
    // GNU timeout's stop: TERM to the launcher, then to its whole process group.
    process.kill(waiter.pid, "SIGTERM");
    process.kill(-waiter.pid, "SIGTERM");
    const { code } = await waiterDone;
    assert.equal(code, 143, waiterErr);
    assert.match(waiterErr, new RegExp(`manager stopped; scheduling cancellation of gate_id=${id}`));
    const cancelMarker = join(f.root, "state", "jobs", ".canceled", id);
    for (let i = 0; i < 2400 && !existsSync(cancelMarker); i++) await sleepMs(25);
    assert.ok(existsSync(cancelMarker), `missing cancellation marker for ${id}: ${waiterErr}`);
  } finally {
    writeFileSync(release, "\n");
    try { process.kill(-waiter.pid, "SIGKILL"); } catch {}
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("--merge squash-merges the PR pinned to the gated SHA only after a green gate, and never from a dev gate", () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    // The gate fetches a GitHub repo over SSH (fetch_url); git rewrites that to the local bare repo, through the environment only.
    const url = "https://github.com/acme/gate-test.git";
    f.env = { ...f.env, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `url.file://${f.bare}.insteadOf`, GIT_CONFIG_VALUE_0: "git@github.com:acme/gate-test.git" };
    // gh-drew is the merge boundary: record each call, and answer the merge commit for `pr view`.
    const calls = join(f.root, "gh-drew.calls");
    writeFileSync(join(f.root, "bin", "gh-drew"), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> '${calls}'
[ "$1 $2" != "pr view" ] || echo 1111111111111111111111111111111111111111
exit "\${FAKE_GH_EXIT:-0}"
`);
    chmodSync(join(f.root, "bin", "gh-drew"), 0o755);
    const merge = ["pr", "merge", "42", "-R", "acme/gate-test", "--squash", "--match-head-commit", f.first].join(" ");

    const red = run(gate, ["--merge", "42", "--no-install", "beelink2", url, f.first, "--", "bash", "-c", "exit 1"], { env: f.env });
    assert.equal(red.status, 1, red.stderr);
    assert.equal(existsSync(calls), false, "a red gate called gh-drew");

    const green = run(gate, ["--merge", "42", "--no-install", "beelink2", url, f.first, "--", "true"], { env: f.env });
    assert.equal(green.status, 0, green.stderr);
    assert.equal(readFileSync(calls, "utf8").split("\n")[0], merge);
    assert.match(green.stderr.trim().split("\n").at(-1), /^beelink-gate: merged #42 1{40} gate_id=beelink2-[0-9a-f]{32}$/);

    rmSync(calls);
    const refused = run(gate, ["--merge", "42", "--no-install", "beelink2", url, f.first, "--", "true"], { env: { ...f.env, FAKE_GH_EXIT: "1" } });
    assert.equal(refused.status, 78, refused.stderr);
    assert.match(refused.stderr, /beelink-gate: merge of #42 refused: /);

    rmSync(calls);
    const dev = run(gate, ["--dev", "--merge", "42", "--no-install", "beelink2", url, f.first, "--", "true"], { env: f.env });
    assert.equal(dev.status, 2);
    assert.match(dev.stderr, /--merge cannot be combined with --dev/);
    const local = run(gate, ["--merge", "42", "--no-install", "beelink2", f.url, f.first, "--", "true"], { env: f.env });
    assert.equal(local.status, 2);
    assert.match(local.stderr, /--merge needs a GitHub repo URL/);
    assert.equal(existsSync(calls), false, "a refused request called gh-drew");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
