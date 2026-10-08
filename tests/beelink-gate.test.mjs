import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const gate = resolve("claude/tools/beelink-gate");
const run = (bin, args, options = {}) => spawnSync(bin, args, { encoding: "utf8", ...options });
const encode = (arg) => Buffer.from(arg).toString("base64");

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
  const env = { ...process.env, HOME: home, BEELINK_GATE_CACHE_ROOT: cache, NPM_LOG: npmLog, PNPM_LOG: pnpmLog, PATH: `${bin}:${process.env.PATH}` };
  const url = `file://${bare}`;
  const call = (sha, args, options = {}) => run("bash", [gate, "--remote", ...[options.host ?? "beelink2", url, sha, ...args].map(encode)], { env: { ...env, ...options.env } });
  return { root, home, cache, npmLog, pnpmLog, source, bare, env, url, first, second, call, git };
}

test("reuses one checkout, cleans prior outputs, and receipts the requested SHA and command", () => {
  const f = fixture();
  try {
    const first = f.call(f.first, ["bash", "-c", "cat value.txt; touch generated.txt"]);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /first/);
    assert.match(first.stderr, new RegExp(`sha=${f.first} command=bash -c`));
    assert.match(first.stderr, /exit=0 duration=\d+s/);
    const second = f.call(f.second, ["bash", "-c", "cat value.txt; test ! -e generated.txt"]);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /second/);
    assert.equal(f.git(["-C", join(f.cache, "local", "owner", "repo"), "rev-parse", "HEAD"]), f.second);
    assert.deepEqual(readdirSync(join(f.cache, "local", "owner")), ["repo"]);
    assert.deepEqual(readFileSync(f.npmLog, "utf8").trim().split("\n"), ["ci --cache " + f.home + "/.npm", "ci --cache " + f.home + "/.npm"]);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a failed command reports its exit code and an unsafe repository path is rejected", () => {
  const f = fixture();
  try {
    const result = f.call(f.first, ["bash", "-c", "exit 7"]);
    assert.equal(result.status, 7, result.stderr);
    assert.match(result.stderr, /exit=7 duration=\d+s/);
    const invalid = run("bash", [gate, "--remote", ...["beelink2", "https://github.com/../repo.git", f.first, "true"].map(encode)], { env: f.env });
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
    const args = ["beelink2", f.url, f.first, "bash", "-c", `echo start-${id} >> '${events}'; sleep 0.3; echo end-${id} >> '${events}'`].map(encode);
    const child = spawn("bash", [gate, "--remote", ...args], { env: f.env });
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
    const fakeSsh = join(f.root, "bin", "ssh");
    writeFileSync(fakeSsh, `#!/usr/bin/env bash
printf '%s\\n' "$3 $4 $5 $6" > '${join(f.root, "ssh-transport")}'
shift 8
exec bash -s -- "$@"
`);
    chmodSync(fakeSsh, 0o755);
    const result = run(gate, ["beelink2", f.url, f.first, "--", "bash", "-c", "printf '%s' 'hello world'"], { env: f.env });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "hello world");
    assert.equal(readFileSync(join(f.root, "ssh-transport"), "utf8").trim(), "100.127.22.51 wsl.exe -- bash");
    assert.match(result.stderr, /receipt: sha=/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
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
    assert.equal(refused.status, 3);
    assert.match(refused.stderr, /REFUSED beelink2.*below its 162 GiB disk floor/);
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
