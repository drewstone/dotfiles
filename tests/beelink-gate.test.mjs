import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const gate = resolve("claude/tools/beelink-gate");
const run = (bin, args, options = {}) => spawnSync(bin, args, { encoding: "utf8", ...options });
const encode = (arg) => Buffer.from(String(arg)).toString("base64");
const sleepMs = (ms) => new Promise((resolveDone) => setTimeout(resolveDone, ms));
// The UTC end of the update window scheduled at `at`'s hour: 30 minutes past it.
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
  const fakeDf = join(bin, "df");
  writeFileSync(fakeDf, '#!/usr/bin/env bash\nprintf "Avail\\n%s\\n" "${FAKE_AVAIL:-1099511627776}"\n');
  chmodSync(fakeDf, 0o755);
  // Keep ordinary fixture gates far from the synthetic weekly update window.
  const windowDay = (new Date().getUTCDay() + 3) % 7 + 1;
  const windowHour = 12;
  // A gate running these tests exports its own Rust settings; start clean.
  const { CARGO_TARGET_DIR: _target, CARGO_INCREMENTAL: _incremental, BEELINK_GATE_MAX_CONCURRENT: _slots, BEELINK_GATE_HEARTBEAT: _heartbeat, BEELINK_GATE_LAUNCHER: _launcher, BEELINK_GATE_MAX_HOLD: _hold, BEELINK_GATE_SHIP_WORKERS: _workers, ...inherited } = process.env;
  // Fixture gates see a light host unless a test sets the load.
  const loadavg = join(root, "loadavg");
  writeFileSync(loadavg, "0.50 0.50 0.50 1/100 1\n");
  const env = { ...inherited, BEELINK_GATE_LOADAVG: loadavg, HOME: home, XDG_CACHE_HOME: join(home, ".cache"), TZ: "Etc/UTC", BEELINK_GATE_CACHE_ROOT: cache, BEELINK_GATE_SELF: "none", BEELINK_GATE_STATE_DIR: join(root, "state"), NPM_LOG: npmLog, PNPM_LOG: pnpmLog, PATH: `${bin}:${process.env.PATH}` };
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
printf '%s\\n' "$host \${rest[*]:0:3}" > '${join(f.root, "ssh-transport")}'
printf '%s\\n' "\${rest[*]:2}" > '${join(f.root, "ssh-remote-command")}'
[[ -z "\${FAKE_CACHE_PREFIX:-}" ]] || export BEELINK_GATE_CACHE_ROOT="$FAKE_CACHE_PREFIX-$host"
[[ -z "\${FAKE_LOAD_PREFIX:-}" ]] || export BEELINK_GATE_LOADAVG="$FAKE_LOAD_PREFIX-$host"
exec "\${rest[@]:2}"
`);
  chmodSync(fakeSsh, 0o755);
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

test("a post-admission disk refusal receipts cleanup and closes the launcher heartbeat", async () => {
  const f = fixture();
  try {
    installFakeSsh(f);
    const dfCount = join(f.root, "df-count");
    writeFileSync(join(f.root, "bin", "df"), `#!/usr/bin/env bash
count=0
[[ -r '${dfCount}' ]] && read -r count < '${dfCount}'
count=$((count + 1))
printf '%s\\n' "$count" > '${dfCount}'
if (( count < 3 )); then available=1099511627776; else available=128849018880; fi
printf 'Avail\\n%s\\n' "$available"
`);
    chmodSync(join(f.root, "bin", "df"), 0o755);
    const sleepPids = join(f.root, "heartbeat-sleep-pids");
    writeFileSync(join(f.root, "bin", "sleep"), `#!/usr/bin/env bash
printf '%s\\n' "$$" >> "$HEARTBEAT_SLEEP_PIDS"
exec /bin/sleep "$@"
`);
    chmodSync(join(f.root, "bin", "sleep"), 0o755);
    const env = { ...f.env, FAKE_WU_DAY: String(f.windowDay), FAKE_WU_HOUR: String(f.windowHour), HEARTBEAT_SLEEP_PIDS: sleepPids };
    const result = run(gate, ["beelink2", f.url, f.first, "--", "true"], { env, timeout: 10_000 });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 75, result.stderr);
    assert.match(result.stderr, /lock, host slot and load .* admitted on beelink2 after \d+s/);
    assert.match(result.stderr, /REFUSED beelink2.*below its 162 GiB disk floor/);
    assert.match(result.stderr, /TEMPFAIL next_allowed=\S+Z beelink2 is below its disk floor/);
    assert.equal(readFileSync(dfCount, "utf8").trim(), "4", "the floor changed after the cache-recovery check and admission checks");
    assert.match(result.stderr, new RegExp(`receipt: sha=${f.first} .*exit=75`));
    const [receipt] = receipts(f);
    assert.equal(receipt.exit, 75);
    assert.equal(existsSync(join(f.cache, ".locks", "local-owner-repo.lock.holder")), false);
    const heartbeatPids = readFileSync(sleepPids, "utf8").trim().split("\n").map(Number);
    assert.ok(heartbeatPids.length > 0, "the launcher started its heartbeat poller");
    await sleepMs(100);
    assert.ok(heartbeatPids.every((pid) => !alive(pid)), `heartbeat pollers still alive: ${heartbeatPids.filter(alive)}`);
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
    assert.equal(existsSync(f.cache), false);
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
    writeFileSync(join(nvmBin, "node"), `#!/usr/bin/env bash\ncase "$*" in\n  -v) echo v99.0.0 ;;\n  "-p process.versions.modules") echo 999 ;;\n  *) exec '${process.execPath}' "$@" ;;\nesac\n`);
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
      `rebuild --store-dir ${f.home}/.local/share/pnpm/store @scope/fake-missing fake-native`,
    ]);
    assert.equal(readFileSync(storeCopy, "utf8"), "node_register_module_v1", "the store copy is untouched");
    assert.match(result.stderr, /rebuilding native addons for node v99\.0\.0: @scope\/fake-missing missing addon fake-native abi 1->999/);
    assert.match(result.stderr, /node=v99\.0\.0 rebuild=@scope\/fake-missing missing addon fake-native abi 1->999/);
    const row = JSON.parse(readFileSync(join(f.root, "state", "receipts.jsonl"), "utf8").trim().split("\n").at(-1));
    assert.equal(row.node, "v99.0.0");
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
    const refused = f.call(f.first, ["true"], { env: { FAKE_AVAIL: String(available) } });
    assert.equal(refused.status, 75);
    assert.match(refused.stderr, /REFUSED beelink2.*below its 162 GiB disk floor/);
    assert.match(refused.stderr, /TEMPFAIL next_allowed=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ beelink2 is below its disk floor/);
    assert.equal(existsSync(f.cache), false);
    const allowed = f.call(f.first, ["true"], { host: "beelink1", env: { FAKE_AVAIL: String(available) } });
    assert.equal(allowed.status, 0, allowed.stderr);
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
    assert.equal(denied.status, 3, denied.stderr);
    assert.match(denied.stderr, /cache prune failed/);
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
    const locker = spawn("flock", ["-x", lockPath, "bash", "-c", `touch '${marker}'; sleep 3`], { env: f.env });
    try {
      for (let i = 0; i < 100 && !existsSync(marker); i++) await new Promise((resolveDone) => setTimeout(resolveDone, 20));
      assert.equal(existsSync(marker), true);
      const result = f.call(f.first, ["true"], { env: { BEELINK_GATE_CACHE_MAX_BYTES: "1000000" } });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(existsSync(older), true);
      assert.equal(existsSync(newer), false);
    } finally { locker.kill(); }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

const receipts = (f) => readFileSync(join(f.root, "state", "receipts.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

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
    for (let i = 0; i < 200 && !existsSync(pidFile); i++) await sleepMs(50);
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
    for (let i = 0; i < 200 && !existsSync(marker); i++) await sleepMs(50);
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
    const leftover = spawn("bash", ["-c", `exec 9>'${lockPath}'; flock -x 9; exec sleep 120`], { stdio: "ignore", detached: true });
    const exited = new Promise((resolveDone) => leftover.on("exit", (code, signal) => resolveDone(signal)));
    await sleepMs(500);
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
      for (let i = 0; i < 100 && !existsSync(marker); i++) await sleepMs(50);
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
    for (let i = 0; i < 400 && !(existsSync(events) && readFileSync(events, "utf8").includes("start-a")); i++) await sleepMs(25);
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
    const env = { ...f.env, FAKE_WU_DAY: String(f.windowDay), FAKE_WU_HOUR: String(f.windowHour), BEELINK_GATE_MAX_CONCURRENT: "2" };
    const result = run(gate, ["--no-install", "beelink2", f.url, f.first, "--", "true"], { env });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(join(f.root, "ssh-remote-command"), "utf8"), /^env (\S+ )*BEELINK_GATE_MAX_CONCURRENT=2 (\S+ )*bash -s -- --remote /);
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
    const locker = spawn("flock", ["-x", lockPath, "bash", "-c", `touch '${marker}'; sleep 5`]);
    for (let i = 0; i < 100 && !existsSync(marker); i++) await new Promise((resolveDone) => setTimeout(resolveDone, 20));
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
    } finally { cargo.kill(); }
    mkdirSync(join(f.cache, ".locks"), { recursive: true });
    const gateLock = await hold(join(f.cache, ".locks", "github.com-tangle-network-engine.lock"), join(f.root, "gate-held"));
    try {
      const result = f.call(f.first, ["true"], { noInstall: true });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /skipped .*engine-build; a engine gate holds its lock/);
      assert.equal(existsSync(engine.oldRlib), true);
    } finally { gateLock.kill(); }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a daemon left behind by a command holds neither the host slot nor the repo lock", () => {
  const f = fixture();
  try {
    const env = { BEELINK_GATE_MAX_CONCURRENT: "1", BEELINK_GATE_SLOT_POLL_SECONDS: "0.1" };
    const leaker = f.call(f.first, ["bash", "-c", "sleep 5 >/dev/null 2>&1 &"], { noInstall: true, env });
    assert.equal(leaker.status, 0, leaker.stderr);
    const started = Date.now();
    const next = f.call(f.first, ["true"], { noInstall: true, env });
    assert.equal(next.status, 0, next.stderr);
    assert.doesNotMatch(next.stderr, /waiting for a host gate slot/);
    assert.ok(Date.now() - started < 4000, "second gate waited for the leaked daemon");
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
      for (let i = 0; i < 100 && !existsSync(marker); i++) await sleepMs(50);
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
    writeFileSync(gitconfig, `[url "file://${join(f.root, "owner")}/"]\n\tinsteadOf = https://github.com/owner/\n`);
    mkdirSync(join(f.home, ".config", "beelink-gate"), { recursive: true });
    assert.equal(run("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", join(f.home, ".config", "beelink-gate", "ship-proof-key")]).status, 0);
    mkdirSync(join(f.home, "bin"), { recursive: true });
    const ghLog = join(f.root, "gh.log");
    writeFileSync(join(f.home, "bin", "gh-drew"), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> '${ghLog}'\n[[ "$*" == *git/trees* ]] && exit 1\nexit 0\n`);
    chmodSync(join(f.home, "bin", "gh-drew"), 0o755);
    const ship = (avail) => run("bash", [gate, "--remote", ...["beelink2", "https://github.com/owner/repo.git", sha, "ship", f.windowDay, f.windowHour, "bash", "scripts/ship.sh", "verify"].map(encode)],
      { env: { ...f.env, GIT_CONFIG_GLOBAL: gitconfig, ...(avail ? { FAKE_AVAIL: avail } : {}) } });
    const refused = ship("166684823552");
    assert.equal(refused.status, 75, refused.stderr);
    assert.match(refused.stderr, /REFUSED beelink2 has 166684823552 bytes free, below its 162 GiB disk floor/);
    assert.match(refused.stderr.trim().split("\n").at(-1), /^beelink-gate: TEMPFAIL next_allowed=\S+Z beelink2 is below its disk floor$/);
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
    for (let i = 0; i < 200 && !/admitted|acquired/.test(stderr); i++) await sleepMs(50);
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
  const launch = (id, hold) => new Promise((resolveDone) => {
    const args = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "bash", "-c", `echo "start-${id} $PWD" >> '${events}'; sleep ${hold}; echo end-${id} >> '${events}'`].map(encode);
    const child = spawn("bash", [gate, "--remote", ...args], { env: f.env });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolveDone({ status, stderr }));
  });
  try {
    const both = [launch("a", 2), launch("b", 2)];
    for (let i = 0; i < 200 && !(existsSync(events) && readFileSync(events, "utf8").split("\n").filter((l) => l.startsWith("start-")).length === 2); i++) await sleepMs(50);
    const third = launch("c", 0);
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

const coreCount = Number(spawnSync("nproc", { encoding: "utf8" }).stdout.trim());
const loadLimit = Math.floor(coreCount * 3 / 2);
const loadLine = (load) => `${load.toFixed(2)} ${load.toFixed(2)} ${load.toFixed(2)} 1/100 1\n`;

test("a gate waits while its host is over the load limit, then starts and records the load", async () => {
  const f = fixture();
  const loadavg = join(f.root, "busy-loadavg");
  writeFileSync(loadavg, loadLine(loadLimit * 2));
  try {
    const args = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "true"].map(encode);
    const child = spawn("bash", [gate, "--remote", ...args], { env: { ...f.env, BEELINK_GATE_LOADAVG: loadavg, BEELINK_GATE_LOAD_POLL_SECONDS: "0.2" } });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const done = new Promise((resolveDone) => child.on("close", resolveDone));
    for (let i = 0; i < 100 && !/is over its limit/.test(stderr); i++) await sleepMs(50);
    assert.match(stderr, new RegExp(`beelink2 load ${(loadLimit * 2).toFixed(2)} is over its limit of ${loadLimit} \\(1\\.5x ${coreCount} cores\\)`));
    writeFileSync(loadavg, loadLine(1));
    assert.equal(await done, 0, stderr);
    assert.match(stderr, /receipt: .*load=1\.00/);
    const row = JSON.parse(readFileSync(join(f.root, "state", "receipts.jsonl"), "utf8").trim().split("\n").at(-1));
    assert.equal(row.start_load, 1);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a gate refuses after its bounded load wait without running the command", () => {
  const f = fixture();
  const loadavg = join(f.root, "busy-loadavg");
  writeFileSync(loadavg, loadLine(loadLimit + 1));
  try {
    const marker = join(f.root, "ran");
    const result = f.call(f.first, ["touch", marker], { noInstall: true, env: { BEELINK_GATE_LOADAVG: loadavg, BEELINK_GATE_LOAD_WAIT: "1s", BEELINK_GATE_LOAD_POLL_SECONDS: "0.2" } });
    assert.equal(result.status, 75, result.stderr);
    assert.match(result.stderr, /REFUSED beelink2 load .* stayed over its limit .*use the other beelink or retry later/);
    assert.match(result.stderr, /TEMPFAIL next_allowed=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ beelink2 load stayed over its limit/);
    assert.equal(existsSync(marker), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

function loadedHosts(f, b1, b2) {
  installFakeSsh(f);
  const prefix = join(f.root, "load");
  writeFileSync(`${prefix}-100.98.195.7`, loadLine(b1));
  writeFileSync(`${prefix}-100.127.22.51`, loadLine(b2));
  return { ...f.env, FAKE_WU_DAY: String(f.windowDay), FAKE_WU_HOUR: String(f.windowHour), FAKE_CACHE_PREFIX: join(f.root, "cache"), FAKE_LOAD_PREFIX: prefix, BEELINK_GATE_LOAD_WAIT: "1s", BEELINK_GATE_LOAD_POLL_SECONDS: "0.2" };
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
    assert.match(moved.stderr, new RegExp(`beelink1 load ${(loadLimit * 2).toFixed(2)} is over its limit of ${loadLimit}; running on beelink2 \\(load 1\\.00`));
    assert.match(moved.stderr, /receipt: .*host=beelink2/);
    const light = run(gate, ["--no-install", "beelink2", f.url, f.first, "--", "true"], { env });
    assert.equal(light.status, 0, light.stderr);
    assert.doesNotMatch(light.stderr, /running on beelink1/);
    writeFileSync(join(f.root, "load-100.127.22.51"), loadLine(loadLimit * 2));
    const stuck = run(gate, ["--no-install", "beelink1", f.url, f.first, "--", "true"], { env });
    assert.equal(stuck.status, 75, stuck.stderr);
    assert.match(stuck.stderr, /REFUSED beelink1 load .* stayed over its limit/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("auto waits for the light beelink's repo lock instead of queueing on an overloaded one", async () => {
  const f = fixture();
  try {
    // One checkout per host, so one held lock makes the light host busy.
    const env = { ...loadedHosts(f, 0.5, 0.5), BEELINK_GATE_AUTO_POLL_SECONDS: "0.5", BEELINK_GATE_REPO_CHECKOUTS: "1" };
    for (const host of ["beelink1", "beelink2"]) {
      const warm = run(gate, ["--no-install", host, f.url, f.first, "--", "true"], { env });
      assert.equal(warm.status, 0, warm.stderr);
    }
    writeFileSync(join(f.root, "load-100.98.195.7"), loadLine(loadLimit * 2));
    const lock = join(`${env.FAKE_CACHE_PREFIX}-100.127.22.51`, ".locks", "local-owner-repo.lock");
    const marker = join(f.root, "b2-lock-held");
    const locker = spawn("flock", ["-x", lock, "bash", "-c", `touch '${marker}'; sleep 2`], { stdio: "ignore" });
    for (let i = 0; i < 100 && !existsSync(marker); i++) await sleepMs(50);
    const child = spawn(gate, ["--no-install", "auto", f.url, f.first, "--", "true"], { env });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const status = await new Promise((resolveDone) => child.on("close", resolveDone));
    locker.kill();
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

test("a light gate is admitted between 1.5x and 2.5x the cores where a normal gate waits, without an install or a browser", () => {
  const f = fixture();
  const loadavg = join(f.root, "light-loadavg");
  writeFileSync(loadavg, loadLine(loadLimit + 1));
  try {
    const env = { BEELINK_GATE_LOADAVG: loadavg, BEELINK_GATE_LOAD_WAIT: "1s", BEELINK_GATE_LOAD_POLL_SECONDS: "0.2" };
    const normal = f.call(f.first, ["true"], { noInstall: true, env });
    assert.equal(normal.status, 75, normal.stderr);
    const light = lightGate(f, f.first, ["bash", "-c", 'echo "browsers=$PLAYWRIGHT_BROWSERS_PATH"; cat value.txt'], env);
    assert.equal(light.status, 0, light.stderr);
    assert.match(light.stderr, new RegExp(`load \\(${(loadLimit + 1).toFixed(2)}, limit ${Math.floor(coreCount * 5 / 2)}\\) admitted on beelink2`));
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
    const normal = spawn("bash", [gate, "--remote", ...["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "bash", "-c", `touch '${held}'; sleep 6`].map(encode)],
      { env: { ...f.env, BEELINK_GATE_MAX_CONCURRENT: "1" } });
    for (let i = 0; i < 400 && !existsSync(held); i++) await sleepMs(25);
    assert.ok(existsSync(held), "the normal gate started");
    const started = Date.now();
    const light = lightGate(f, f.first, ["true"], { BEELINK_GATE_MAX_CONCURRENT: "1" });
    assert.equal(light.status, 0, light.stderr);
    assert.doesNotMatch(light.stderr, /waiting for a host gate slot/);
    assert.ok(Date.now() - started < 5000, "the light gate ran while the normal slot was held");
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
if [[ " $* " == *" --remote "* && " $* " == *" 100.127.22.51 "* && -e '${join(f.root, "take-b2")}' ]]; then
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
    for (let i = 0; i < 200 && !readdirSync(lockDir).some((n) => n.startsWith("urgent-local-owner-repo.")); i++) await sleepMs(25);
    holder.kill("SIGKILL");
    const [n, u] = await Promise.all([normal, urgent]);
    assert.equal(n.status, 0, n.stderr);
    assert.equal(u.status, 0, u.stderr);
    assert.equal(readFileSync(events, "utf8").trim().split("\n").join(","), "urgent,normal");
    assert.match(u.stderr, /admitted on beelink2 after \d+s \(urgent\)/);
    assert.deepEqual(readdirSync(lockDir).filter((n) => n.startsWith("urgent-")), [], "no urgent marker is left behind");
  } finally {
    holder.kill("SIGKILL");
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("a gate waiting for load holds no checkout, so the repo lock stays free until it is admitted", async () => {
  const f = fixture();
  const loadavg = join(f.root, "busy-loadavg");
  const limit = Math.floor(Number(spawnSync("nproc", { encoding: "utf8" }).stdout.trim()) * 3 / 2);
  writeFileSync(loadavg, `${limit * 2}.00 1 1 1/100 1\n`);
  try {
    const args = ["beelink2", f.url, f.first, "no-install", f.windowDay, f.windowHour, "true"].map(encode);
    const child = spawn("bash", [gate, "--remote", ...args], { env: { ...f.env, BEELINK_GATE_LOADAVG: loadavg, BEELINK_GATE_LOAD_POLL_SECONDS: "0.2", BEELINK_GATE_REPO_CHECKOUTS: "1" } });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const done = new Promise((resolveDone) => child.on("close", resolveDone));
    for (let i = 0; i < 100 && !/is over its limit/.test(stderr); i++) await sleepMs(50);
    assert.match(stderr, /is over its limit/);
    mkdirSync(join(f.cache, ".locks"), { recursive: true });
    const probe = run("flock", ["-n", join(f.cache, ".locks", "local-owner-repo.lock"), "true"]);
    assert.equal(probe.status, 0, "the waiting gate holds the checkout lock");
    writeFileSync(loadavg, "1.00 1 1 1/100 1\n");
    assert.equal(await done, 0, stderr);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
