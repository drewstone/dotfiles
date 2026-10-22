import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

// The ratchets and the census through one classification, on throwaway repos. TypeScript comes from a private prefix,
// installed the way git/install.sh installs it, so the function counter is exercised, never skipped.
const hooks = resolve("git/hooks");
const census = resolve("git/census/census");
const scratch = mkdtempSync(join(tmpdir(), "census-test-"));
const env = { ...process.env, NODE_PATH: join(scratch, "ts/node_modules"), XDG_CACHE_HOME: join(scratch, "cache") };
after(() => rmSync(scratch, { recursive: true, force: true }));
before(() => {
  const npm = spawnSync("npm", ["install", "--prefix", join(scratch, "ts"), "--no-audit", "--no-fund", "--silent", "typescript@5.6.3"], { encoding: "utf8" });
  assert.equal(npm.status, 0, npm.stderr);
});

let repos = 0;
function repo(files) {
  const dir = join(scratch, `repo-${repos++}`);
  mkdirSync(dir);
  const git = (...args) => {
    const r = spawnSync("git", args, { cwd: dir, encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git("init", "-q", "-b", "main");
  git("config", "core.hooksPath", "/dev/null");
  write(dir, files);
  git("add", "-A");
  git("-c", "user.email=f@x.invalid", "-c", "user.name=f", "commit", "-qm", "base");
  return { dir, git };
}
function write(dir, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}
const lines = (n, line) => Array.from({ length: n }, (_, i) => line(i)).join("\n") + "\n";
const run = (cwd, cmd, args) => spawnSync(cmd, args, { cwd, encoding: "utf8", env });

test("each ratchet refuses its violation through the shared classification, and passes a clean change", () => {
  const { dir, git } = repo({ "src/a.ts": "export const shared = 1\n", "src/old.ts": "x\n", "docs/x.md": "see `src/old.ts`\n" });
  write(dir, {
    "src/huge.ts": lines(1005, (i) => `const v${i} = 1`),
    "src/big.ts": `export function big() {\n${lines(305, (i) => `  let x${i} = ${i}`)}}\n`,
    "src/b.ts": "export const shared = 2\n",
  });
  git("rm", "-q", "src/old.ts");
  git("add", "-A");
  const refusals = {
    "loc-ratchet": /src\/huge\.ts: 1005 lines \(new file\)/,
    "doc-ref-ratchet": /src\/old\.ts <- docs\/x\.md/,
    "dup-export-ratchet": /shared: new in src\/b\.ts; already exported by src\/a\.ts/,
    "fn-ratchet.cjs": /src\/big\.ts: big is 307 lines \(new\)/,
  };
  for (const [hook, why] of Object.entries(refusals)) {
    const r = hook.endsWith(".cjs") ? run(dir, "node", [join(hooks, hook)]) : run(dir, join(hooks, hook), []);
    assert.equal(r.status, 1, `${hook}: ${r.stderr}`);
    assert.match(r.stderr, why);
  }
  git("reset", "-q", "--hard");
  write(dir, { "src/c.ts": "export const ok = 3\n" });
  git("add", "-A");
  assert.equal(run(dir, join(hooks, "ratchets"), []).status, 0);
});

test("census floors measure a sparse worktree against its base and refuse a rise in production lines and copies", () => {
  const body = lines(12, (i) => `  total += values[${i}] * ${i + 2}`);
  const { dir, git } = repo({ "a/x.ts": `export function x(values: number[]) {\n  let total = 0\n${body}  return total\n}\n`, "b/z.ts": "export const z = 1\n" });
  const base = git("rev-parse", "HEAD");
  const clone = join(scratch, "sparse");
  assert.equal(spawnSync("git", ["clone", "-q", "--no-checkout", dir, clone]).status, 0);
  for (const args of [["sparse-checkout", "set", "--no-cone", "/a/"], ["checkout", "-q", "main"]]) assert.equal(run(clone, "git", args).status, 0);
  write(clone, { "a/copy.ts": `export function copy(values: number[]) {\n  let total = 0\n${body}  return total\n}\n` });
  const r = run(clone, census, ["floors", ".", base, "WORKTREE", "--floor", "lines", "--floor", "copies"]);
  assert.equal(r.status, 1, r.stderr);
  // b/z.ts is outside the sparse set and still counted: 16 + 1 lines before, 32 + 1 after.
  assert.match(r.stdout, /prod_lines\s+17 -> 33\s+\+16\s+REFUSED/);
  assert.match(r.stdout, /dup_lines\s+0 -> \d+\s+\+\d+\s+REFUSED/);
  assert.match(r.stdout, /xrepo_windows: not measured, no --peer named/);
});

test("a scan that reads no logic file, or has no parser, is refused rather than reported as 0", () => {
  const { dir } = repo({ "README.md": "# docs only\n" });
  const empty = run(dir, census, ["measure", ".", "HEAD"]);
  assert.equal(empty.status, 2);
  assert.match(empty.stderr, /CENSUS REFUSED: read 0 logic files/);
  const { dir: code } = repo({ "src/a.ts": "export const a = 1\n" });
  const noParser = spawnSync(census, ["measure", ".", "HEAD"], { cwd: code, encoding: "utf8",
    env: { ...env, NODE_PATH: "", HOME: join(scratch, "no-home"), XDG_CACHE_HOME: join(scratch, "cache-2") } });
  assert.equal(noParser.status, 2);
  assert.match(noParser.stderr, /CENSUS REFUSED: functions\.cjs: refused: no typescript package/);
});


test("scoped census counts covered lines against outside peers and preserves cached whole-tree metrics", () => {
  const body = lines(12, (i) => `  total += values[${i}] * ${i + 2}`);
  const repeat = lines(12, (i) => `  total += values[${i}] * ${i + 30}`);
  const lane = `// original source positions\n\nexport function lane(values: number[]) {\n  let total = 0\n${body}  return total\n}\n`;
  const peer = lane.replace("function lane", "function peer");
  const { dir, git } = repo({
    "scripts/lane.ts": lane,
    "packages/peer.ts": peer,
    "services/repeat.ts": `export function repeat(values: number[]) {\n  let total = 0\n${repeat}  total += 999\n${repeat}  return total\n}\n`,
    "products/sandbox/evals/plain.ts": "export const plain = 7\n",
    "scripts-extra/unrelated.ts": "export const unrelated = 8\n",
  });
  const measure = (...scopes) => {
    const r = run(dir, census, ["measure", ".", "HEAD", ...scopes.flatMap((p) => ["--scope", p])]);
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  // Start with a scoped request: it must cache the complete peer population.
  const selected = measure("scripts/", "services/", "products/sandbox/evals/");
  assert.equal(selected.metrics.dup_lines, 52);
  assert.equal(selected.scope.metrics.dup_lines, 38);
  assert.equal(selected.scope.files_read.source, 3);
  assert.equal(selected.files_read.source, 5);
  assert.equal(selected.scope.metrics.prod_lines, 18 + 29 + 1);
  assert.equal(selected.scope.lists.dup_lines.files["services/repeat.ts"].dup_lines, 24);
  assert.equal(selected.scope.lists.dup_lines.files["scripts/lane.ts"].dup_lines, 14);
  const occurrences = Object.values(selected.scope.lists.dup_lines.windows).flat();
  assert(occurrences.some((o) => o.path === "packages/peer.ts"));
  assert(!occurrences.some((o) => o.path.startsWith("scripts-extra/")));
  const first = occurrences.find((o) => o.path === "scripts/lane.ts" && o.normalized_start === 2);
  assert.deepEqual(first, { path: "scripts/lane.ts", normalized_start: 2, start_line: 4, end_line: 13 });
  assert.equal(lane.split("\n")[first.start_line - 1].trim(), "let total = 0");
  assert.equal(lane.split("\n")[first.end_line - 1].trim(), "total += values[8] * 10");
  const global = measure();
  assert.deepEqual(global.metrics, selected.metrics);
  assert.equal(global.scope, undefined);
  assert.deepEqual(global.lists.dup_lines, selected.lists.dup_lines);
  const scriptsOnly = measure("scripts", "scripts/");
  assert.equal(scriptsOnly.scope.metrics.dup_lines, 14);
  assert.equal(scriptsOnly.scope.files_read.source, 1);
  assert.deepEqual(scriptsOnly.metrics, global.metrics);
  for (const invalid of ["missing", "../scripts", "/scripts", ""]) {
    const r = run(dir, census, ["measure", ".", "HEAD", "--scope", invalid]);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /CENSUS REFUSED:/);
  }
  // Removing the only outside peer must reduce scope coverage on the next tree.
  git("rm", "packages/peer.ts");
  git("commit", "-qm", "remove outside peer");
  const after = measure("scripts/", "services/");
  assert.equal(after.scope.metrics.dup_lines, 24);
  assert.equal(after.scope.lists.dup_lines.files["scripts/lane.ts"].dup_lines, 0);
  assert.notEqual(after.tree, global.tree);
});
