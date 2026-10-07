import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  const env = { ...process.env, HOME: home, BEELINK_GATE_CACHE_ROOT: cache, NPM_LOG: npmLog, PNPM_LOG: pnpmLog, PATH: `${bin}:${process.env.PATH}` };
  const url = `file://${bare}`;
  const call = (sha, args) => run("bash", [gate, "--remote", ...[url, sha, ...args].map(encode)], { env });
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
    const invalid = run("bash", [gate, "--remote", ...["https://github.com/../repo.git", f.first, "true"].map(encode)], { env: f.env });
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
    const args = [f.url, f.first, "bash", "-c", `echo start-${id} >> '${events}'; sleep 0.3; echo end-${id} >> '${events}'`].map(encode);
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
