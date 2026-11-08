import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

// The ratchets and census use throwaway Git repos and a private fixture prefix linked to the maintained compiler.
// No dependency installation occurs; missing-parser cases still use their own isolated HOME and NODE_PATH.
const hooks = resolve("git/hooks");
const census = resolve("git/census/census");
const scratch = mkdtempSync(join(tmpdir(), "census-test-"));
// Fixture commits carry their own identity: a check may run these with a HOME that has none.
const env = { ...process.env, NODE_PATH: join(scratch, "ts/node_modules"), XDG_CACHE_HOME: join(scratch, "cache"),
  GIT_AUTHOR_NAME: "f", GIT_AUTHOR_EMAIL: "f@example.invalid", GIT_COMMITTER_NAME: "f", GIT_COMMITTER_EMAIL: "f@example.invalid" };
after(() => rmSync(scratch, { recursive: true, force: true }));
before(() => {
  const require = createRequire(import.meta.url);
  const compiler = require.resolve("typescript/package.json", { paths: [join(homedir(), ".local/share/dotfiles-node")] });
  assert.equal(typeof require(dirname(compiler)).createSourceFile, "function", "git/install.sh must provide the TypeScript compiler API");
  mkdirSync(join(scratch, "ts/node_modules"), { recursive: true });
  symlinkSync(dirname(compiler), join(scratch, "ts/node_modules/typescript"), "dir");
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
  git("commit", "-qm", "base");
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
const pythonFunction = (name, span) => `def ${name}():\n${lines(span - 1, (i) => `    value_${i} = ${i}`)}`;
const withoutTypescript = { ...env, NODE_PATH: "", HOME: join(scratch, "python-only-home"),
  XDG_CACHE_HOME: join(scratch, "python-cache") };
const runPythonOnly = (cwd, cmd, args) => spawnSync(cmd, args, { cwd, encoding: "utf8", env: withoutTypescript });

test("a merge commit is charged only for what it adds beyond both parents", () => {
  const a = (n, top = "") => top + lines(n, (i) => `a${i} = ${i}`);
  const big = (n, top = "") => top + lines(n, (i) => `b${i} = ${i}`);
  const moved = (top = "") => top + lines(20, (i) => `m${i} = ${i}`);
  const { dir, git } = repo({ "src/a.py": a(40), "src/big.py": big(998), "src/moved.py": moved(), "src/gone.py": "x = 1\ny = 2\n" });
  const commit = (files, message) => {
    write(dir, files);
    git("add", "-A");
    git("commit", "-qm", message);
  };
  git("checkout", "-qb", "branch");
  mkdirSync(join(dir, "lib"));
  git("mv", "src/moved.py", "lib/moved.py");
  git("rm", "-q", "src/gone.py");
  commit({ "src/a.py": a(30), "src/big.py": big(997) }, "branch shrinks src, moves moved.py to lib, deletes gone.py");
  git("checkout", "-q", "main");
  const grown = "g0 = 0\ng1 = 1\ng2 = 2\n";
  git("rm", "-q", "src/gone.py");
  commit({ "src/a.py": a(40, grown), "src/big.py": big(998, grown + "g3 = 3\ng4 = 4\ng5 = 5\ng6 = 6\n"), "src/c.py": grown,
    "src/moved.py": moved(grown) }, "develop grows src and the file the branch moved, and deletes gone.py too");
  git("checkout", "-q", "branch");
  // First parent is the branch. Develop's +3, +7 (to 1,005 lines), new c.py, its +3 carried into the moved file and
  // the deletion both sides made are its own changes, never the merge's.
  git("merge", "-q", "--no-commit", "--no-ff", "main");
  const clean = run(dir, join(hooks, "loc-ratchet"), []);
  assert.equal(clean.status, 0, clean.stderr);
  write(dir, { "src/a.py": a(30, grown + "own0 = 0\nown1 = 1\n"), "src/big.py": big(997, grown + "g3 = 3\ng4 = 4\ng5 = 5\ng6 = 6\nown0 = 0\nown1 = 1\n") });
  git("add", "-A");
  const evil = run(dir, join(hooks, "loc-ratchet"), []);
  assert.equal(evil.status, 1, evil.stderr);
  assert.match(evil.stderr, /src gains 4 production lines/);
  assert.doesNotMatch(evil.stderr, /lib gains/);
  assert.match(evil.stderr, /src\/big\.py: 1006 lines \(was 997\)/);
});

// The GitHub comment the census verifies comes from a fake gh; DOTFILES_PRIVATE names no census.env, so gh is the CLI.
// approve(scope, quote) posts the comment with the scope's block and points census.growthApproval at its record.
function approver(dir, git) {
  git("remote", "add", "origin", "https://github.com/o/r.git");
  const bin = join(scratch, `gh-${repos}`), comment = join(bin, "comment.json"), url = "https://github.com/o/r/pull/1#issuecomment-7";
  mkdirSync(bin);
  writeFileSync(join(bin, "gh"), `#!/bin/sh\ncase "$*" in "api user") echo '{"login": "owner"}' ;; "api repos/o/r/issues/comments/7") cat ${comment} ;; *) exit 9 ;; esac\n`, { mode: 0o755 });
  const scope = (base, head) => JSON.parse(run(dir, "python3", ["-c", "import json, sys; from runpy import run_path; print(json.dumps(run_path(sys.argv[1])['growth_scope']('.', *sys.argv[2:])))", census, base, head]).stdout);
  const approve = (approved, quote) => {
    const body = `${quote}\n\n\`\`\`census-growth-approval\n${JSON.stringify(approved)}\n\`\`\``;
    writeFileSync(comment, JSON.stringify({ html_url: url, user: { login: "owner" }, body }));
    writeFileSync(join(bin, "record.json"), JSON.stringify({ source: { url, quote, sha256: createHash("sha256").update(body).digest("hex") } }));
    git("config", "census.growthApproval", join(bin, "record.json"));
  };
  const ratchet = (...args) => spawnSync(join(hooks, "loc-ratchet"), args, { cwd: dir, encoding: "utf8", env: { ...env, PATH: `${bin}:${env.PATH}`, DOTFILES_PRIVATE: bin } });
  return { scope, approve, ratchet, words: (s, why) => `Census growth approval for ${s.repository}, patch ${s.patch}, areas ${JSON.stringify(s.areas)}: ${why}` };
}

test("a growth approval admits only a scope its reviewer's words name; a general or reused sentence approves nothing", () => {
  const { dir, git } = repo({ "src/a.py": "a = 1\n" });
  const { scope, approve, ratchet, words } = approver(dir, git);
  write(dir, { "src/a.py": "a = 1\nb = 2\nc = 3\n" });
  git("add", "-A");
  const staged = scope("HEAD", git("write-tree"));
  assert.deepEqual(staged.areas, { src: 2 });
  approve(staged, 'Owner, 2026-11-04: "You can push the PR even if it increases lines of code. I don\'t care."');
  const reused = ratchet();
  assert.equal(reused.status, 2, reused.stderr);
  assert.match(reused.stderr, /does not approve scope .* in its block and in words written for it/);
  // A refusal's ask, the sentence with its <why> left for the reviewer, approves nothing however it is posted.
  approve(staged, words(staged, "<why>"));
  assert.equal(ratchet().status, 2);
  approve(staged, words(staged, "the parser is new and reuses nothing."));
  const named = ratchet();
  assert.equal(named.status, 0, named.stderr);
  assert.match(named.stderr, /census: approved production growth from https:\/\/github.com\/o\/r\/pull\/1#issuecomment-7/);
});

test("one approval holds while the base merges into the branch; any change to the branch's own production lines, a resolution's too, refuses", () => {
  const a = (mid) => lines(20, (i) => `a${i} = ${i}`) + mid + lines(20, (i) => `a${i + 20} = ${i + 20}`);
  const moved = (mid) => "top = 0\n" + a(mid).replace("a18 = 18", "a18 = 'main'");
  const { dir, git } = repo({ "src/a.py": a(""), "src/c.py": "c = 1\n" });
  const { scope, approve, ratchet, words } = approver(dir, git);
  const commit = (files, message) => { write(dir, files); git("add", "-A"); git("commit", "-qm", message); };
  // A merge check's reading: the merge-base with main up to the head.
  const merge = () => ratchet(`${git("merge-base", "main", "HEAD")}..HEAD`);
  git("checkout", "-qb", "branch");
  commit({ "src/a.py": a("grown0 = 0\ngrown1 = 1\n"), "src/c.py": "c = 'branch'\n" }, "grow src by two lines and change c");
  const approved = scope("main", "HEAD");
  assert.deepEqual(approved.areas, { src: 2 });
  approve(approved, words(approved, "the two lines are new and reuse nothing."));
  assert.equal(merge().status, 0, "approved at the branch head");
  // Main edits a line within the branch's diff context, grows a file of its own, and merges in clean: same lines, same approval.
  git("checkout", "-q", "main");
  commit({ "src/a.py": moved(""), "src/d.py": "d = 1\n" }, "main moves");
  git("checkout", "-q", "branch");
  git("merge", "-q", "--no-edit", "main");
  const merged = merge();
  assert.equal(merged.status, 0, merged.stderr);
  assert.match(merged.stderr, /census: approved production growth/);
  commit({ "tests/test_a.py": "def test_a():\n    pass\n" }, "a test changes no production line");
  assert.equal(merge().status, 0);
  // One production line of the branch changes: the same areas, a new patch.
  commit({ "src/a.py": moved("grown0 = 0\ngrown1 = 'one'\n") }, "change one grown line");
  const changed = merge();
  assert.equal(changed.status, 2, changed.stderr);
  assert.match(changed.stderr, /does not approve scope/);
  git("reset", "-q", "--hard", "HEAD~1");
  // Main changes the line the branch changed; the conflict's resolution keeps the branch's words over main's: refused.
  git("checkout", "-q", "main");
  commit({ "src/c.py": "c = 'main'\n" }, "main changes c");
  git("checkout", "-q", "branch");
  assert.notEqual(run(dir, "git", ["merge", "-q", "--no-edit", "main"]).status, 0, "conflict");
  commit({ "src/c.py": "c = 'branch'\n" }, "resolve");
  assert.equal(merge().status, 2);
});

test("a new area's production growth is charged like an existing area's; only a repository's first commit is free", () => {
  const { dir, git } = repo({ "src/a.py": "a = 1\n", "NOTES.md": "one\n" });
  write(dir, { "benchmarks/run.py": "b = 1\nc = 2\n" });
  git("add", "-A");
  const grown = run(dir, join(hooks, "loc-ratchet"), []);
  assert.equal(grown.status, 1, grown.stderr);
  assert.match(grown.stderr, /benchmarks gains 2 production lines and the change adds 2 net lines/);
  const first = join(scratch, `repo-${repos++}`);
  mkdirSync(first);
  run(first, "git", ["init", "-q", "-b", "main"]);
  write(first, { "src/a.py": "a = 1\n" });
  run(first, "git", ["add", "-A"]);
  assert.equal(run(first, join(hooks, "loc-ratchet"), []).status, 0);
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

test("Python-only census measures exact async and nested spans, excludes tests, and gates a real tree without TypeScript", () => {
  const nested = "def outer():\n    def inner():\n        pass\n    async def async_inner():\n        pass\n    return inner\n";
  const { dir, git } = repo({ "src/main.py": pythonFunction("large", 301) + nested,
    "test_ignored.py": pythonFunction("ignored", 321), "tests/more.py": pythonFunction("also_ignored", 322) });
  const measured = runPythonOnly(dir, census, ["measure", ".", "HEAD"]);
  assert.equal(measured.status, 0, measured.stderr);
  const result = JSON.parse(measured.stdout);
  assert.equal(result.metrics.fns_over_300, 1);
  assert.equal(result.metrics.mean_fn_lines, 77.75);
  assert.equal(result.files_read.functions, 1);
  assert.equal(result.metrics.exported_names, 0);
  assert.equal(result.metrics.dup_exports, 0);
  assert.equal(result.metrics.dup_lines, 0);
  write(dir, { "src/new.py": pythonFunction("new_large", 301) });
  git("add", "-A");
  const floor = runPythonOnly(dir, census, ["floors", ".", "HEAD", "WORKTREE", "--floor", "god"]);
  assert.equal(floor.status, 1, floor.stderr);
  assert.match(floor.stdout, /fns_over_300\s+1 -> 2\s+\+1\s+REFUSED/);
});

test("staged Python ratchet rejects growth and new functions, permits reduction and moves, and ignores test files", () => {
  const { dir, git } = repo({ "src/old.py": pythonFunction("existing", 305), "src/small.py": pythonFunction("small", 2),
    "test_removed.py": pythonFunction("from_test", 500) });
  const check = () => runPythonOnly(dir, "node", [join(hooks, "fn-ratchet.cjs")]);
  write(dir, { "src/old.py": pythonFunction("existing", 306) });
  git("add", "-A");
  let result = check();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /existing is 306 lines \(was 305\)/);
  write(dir, { "src/old.py": pythonFunction("existing", 305), "src/new.py": pythonFunction("introduced", 301) });
  git("add", "-A");
  result = check();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /introduced is 301 lines \(new\)/);
  git("reset", "-q", "--hard");
  git("clean", "-fdq");
  git("mv", "src/old.py", "src/moved.py");
  assert.equal(check().status, 0);
  write(dir, { "src/moved.py": pythonFunction("existing", 304),
    "test_large.py": pythonFunction("test_large", 500), "tests/large.py": pythonFunction("test_other", 500) });
  git("add", "-A");
  assert.equal(check().status, 0);
  git("reset", "-q", "--hard");
  git("clean", "-fdq");
  git("rm", "-q", "test_removed.py");
  write(dir, { "src/from_test.py": pythonFunction("from_test", 500) });
  git("add", "-A");
  result = check();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /from_test is 500 lines \(new\)/);
});

test("a missing TypeScript dependency cannot disable staged Python enforcement in a mixed commit", () => {
  const { dir, git } = repo({ "src/start.py": pythonFunction("small", 2), "src/deleted.js": "const previous = 1;\n" });
  write(dir, { "src/new.py": pythonFunction("large", 301), "src/also.js": "const small = 1;\n" });
  git("add", "-A");
  const result = runPythonOnly(dir, "node", [join(hooks, "fn-ratchet.cjs")]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /src\/new\.py: large is 301 lines \(new\)/);
  git("reset", "-q", "--hard");
  git("clean", "-fdq");
  git("rm", "-q", "src/deleted.js");
  write(dir, { "src/start.py": pythonFunction("small", 3) });
  git("add", "-A");
  const removal = runPythonOnly(dir, "node", [join(hooks, "fn-ratchet.cjs")]);
  assert.equal(removal.status, 0, `deleted JavaScript needs no parser: ${removal.stderr}`);
});

test("Python function coverage leaves the JavaScript export and duplicate population unchanged", () => {
  const block = lines(12, (i) => `  total += values[${i}] * ${i + 2}`);
  const { dir, git } = repo({ "src/a.ts": `export function shared(values: number[]) {\n  let total = 0\n${block}  return total\n}\n`,
    "src/b.ts": `export function shared(values: number[]) {\n  let total = 0\n${block}  return total\n}\n` });
  const before = JSON.parse(run(dir, census, ["measure", ".", "HEAD"]).stdout).metrics;
  write(dir, { "src/python.py": pythonFunction("shared", 301), "src/copy.py": pythonFunction("shared", 301) });
  git("add", "-A");
  const measured = run(dir, census, ["measure", ".", "WORKTREE"]);
  assert.equal(measured.status, 0, measured.stderr);
  const after = JSON.parse(measured.stdout).metrics;
  for (const metric of ["dup_exports", "dup_lines", "exported_names", "dup_pct"]) assert.equal(after[metric], before[metric], metric);
  assert.equal(after.fns_over_300, before.fns_over_300 + 2);
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
  const selected = measure("scripts/", "services/", "products/sandbox/evals/", "scripts/lane.ts");
  assert.deepEqual(measure("scripts/", "services/", "products/sandbox/evals/", "scripts/lane.ts"), selected, "cold and cached scoped JSON agree");
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
  const single = measure("scripts/lane.ts");
  assert.deepEqual(Object.keys(single.scope.lists.dup_lines.files), ["scripts/lane.ts"]);
  assert.equal(single.scope.metrics.prod_lines, 18);
  // Removing the only outside peer must reduce scope coverage on the next tree.
  git("rm", "packages/peer.ts");
  git("commit", "-qm", "remove outside peer");
  const after = measure("scripts/", "services/");
  assert.equal(after.scope.metrics.dup_lines, 24);
  assert.equal(after.scope.lists.dup_lines.files["scripts/lane.ts"].dup_lines, 0);
  assert.notEqual(after.tree, global.tree);
});

test("scope syntax and unknown options refuse before cold measurement and leave no cache", () => {
  const { dir } = repo({ "scripts/a.ts": "export const a = 1\n" });
  for (const [i, options] of [["--scope", "../scripts"], ["--scope", "/scripts"], ["--scope="],
    ["--scope"], ["--scope", "--scope", "scripts"], ["--unknown=scripts"], ["--floor", "lines"]].entries()) {
    const cache = join(scratch, `invalid-scope-${i}`);
    // An invalid revision proves validation happens before even resolving the tree.
    const result = spawnSync(census, ["measure", ".", "not-a-revision", ...options], {
      cwd: dir, encoding: "utf8", env: { ...env, XDG_CACHE_HOME: cache },
    });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /CENSUS REFUSED: (?:--scope|unknown option)/);
    assert.equal(existsSync(cache), false);
  }
  const cache = join(scratch, "unmatched-scope");
  const result = spawnSync(census, ["measure", ".", "HEAD", "--scope", "missing"], {
    cwd: dir, encoding: "utf8", env: { ...env, XDG_CACHE_HOME: cache },
  });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /matched no measured/);
  assert.equal(existsSync(cache), false);
});

test("Python-only scope has no JS/TS copies and source coordinates count LF across Unicode separators", () => {
  const body = lines(12, (i) => `  total += values[${i}] * ${i + 2}`);
  const source = `const separator = "before\u2028after";\nexport function lane(values: number[]) {\n  let total = 0\n${body}  return total\n}\n`;
  const { dir, git } = repo({ "scripts/lane.ts": source,
    "packages/peer.ts": source.replace("function lane", "function peer"), "tools/only.py": "def useful():\n    return 1\n" });
  const result = run(dir, census, ["measure", ".", "HEAD", "--scope", "scripts/lane.ts"]);
  assert.equal(result.status, 0, result.stderr);
  const measured = JSON.parse(result.stdout);
  const occurrence = Object.values(measured.scope.lists.dup_lines.windows).flat()
    .find((item) => item.path === "scripts/lane.ts" && item.normalized_start === 4);
  assert.equal(occurrence.start_line, 3);
  assert.equal(occurrence.end_line, 12);
  assert.match(git("grep", "-n", "let total", "HEAD", "--", "scripts/lane.ts"), /:3:/);
  const python = run(dir, census, ["measure", ".", "HEAD", "--scope=tools/only.py"]);
  assert.equal(python.status, 0, python.stderr);
  assert.deepEqual(JSON.parse(python.stdout).scope, { paths: ["tools/only.py"], files_read: { logic: 1, source: 0 },
    metrics: { prod_lines: 2, dup_lines: 0, dup_pct: 0 }, lists: { dup_lines: { files: {}, windows: {} } } });
});

test("Storybook CSF suffixes are outside production while stories routes and modules remain enforced", () => {
  const stories = Object.fromEntries(["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts"].map((ext, i) => [
    `src/component-${i}.stories.${ext}`,
    `export const Default = {}\nexport function story${i}() {\n${lines(305, n => `  const value${n} = ${n}`)}}\n`,
  ]));
  const production = {
    "src/owner.ts": "export const Default = 1\n",
    "src/routes/stories.tsx": "export const route = 1\n",
    "src/stories/service.ts": "export const service = 1\n",
  };
  const { dir, git } = repo({ ...production, ...stories });
  const measured = run(dir, census, ["measure", ".", "HEAD"]);
  assert.equal(measured.status, 0, measured.stderr);
  const report = JSON.parse(measured.stdout);
  assert.equal(report.metrics.prod_lines, 3, "CSF bodies are not production logic");
  assert.equal(report.files_read.source, 3);
  assert.equal(report.files_read.functions, 3);
  assert.equal(report.metrics.dup_exports, 0, "CSF registry state names are not production API collisions");
  assert.equal(report.metrics.fns_over_300, 0);
  write(dir, { "src/new.stories.tsx": `export const Default = {}\nexport function longStory() {\n${lines(1005, n => `  const value${n} = ${n}`)}}\n` });
  git("add", "-A");
  const hooksPass = run(dir, join(hooks, "ratchets"), []);
  assert.equal(hooksPass.status, 0, hooksPass.stderr);
  const floor = run(dir, census, ["floors", ".", "HEAD", "WORKTREE", "--floor", "lines", "--floor", "copies", "--floor", "god"]);
  assert.equal(floor.status, 0, floor.stderr);
  for (const path of ["src/routes/stories.tsx", "src/stories/service.ts"]) {
    write(dir, { [path]: production[path] + "export const Default = 2\n" });
    git("add", "-A");
    const rejected = run(dir, join(hooks, "dup-export-ratchet"), []);
    assert.equal(rejected.status, 1, rejected.stderr);
    assert.match(rejected.stderr, /Default: new in/);
    assert(rejected.stderr.includes(path), rejected.stderr);
    const counted = run(dir, census, ["measure", ".", "WORKTREE"]);
    assert.equal(counted.status, 0, counted.stderr);
    assert.equal(JSON.parse(counted.stdout).metrics.dup_exports, 1);
    write(dir, { [path]: production[path] });
    git("add", "-A");
  }
});

test("ratchets run with no origin or a listed origin owner and skip another owner's clone, also without guard-config", () => {
  const { dir, git } = repo({ "src/a.py": "a = 1\n" });
  write(dir, { "src/b.py": "b = 1\nc = 2\n" });
  git("add", "-A");
  const config = join(scratch, "ratchets-home/.claude/guard-config.json");
  mkdirSync(dirname(config), { recursive: true });
  const ratchets = (owners) => {
    rmSync(config, { force: true });
    if (owners !== undefined) writeFileSync(config, JSON.stringify({ ratchets: { owners } }));
    return spawnSync(join(hooks, "ratchets"), [], { cwd: dir, encoding: "utf8", env: { ...env, HOME: join(scratch, "ratchets-home") } }).status;
  };
  assert.equal(ratchets(), 1, "no origin: the growth is refused");
  git("remote", "add", "origin", "git@example.invalid:owner-a/app.git");
  assert.equal(ratchets(), 0, "no guard-config: another owner's clone follows its maintainers' rules");
  assert.equal(ratchets(["owner-b"]), 0);
  assert.equal(ratchets(["owner-b", "owner-a"]), 1);
  assert.equal(ratchets("owner-a"), 1, "one owner may be a string");
  git("remote", "set-url", "origin", "https://example.invalid/owner-a/app");
  assert.equal(ratchets(["owner-a"]), 1);
});

test("xrepo JSON retains every name, file pair and located window beyond its legacy previews", () => {
  const left = lines(10, (i) => `console.log("gap-left-${i}")`);
  const right = lines(10, (i) => `console.log("gap-right-${i}")`);
  const peers = Array.from({ length: 7 }, (_, index) => {
    const files = { "src/names.ts": lines(50, (i) => `export const name${i} = ${index * 100 + i}`) };
    for (let file = 0; file < 30; file++) {
      files[`src/shared-${file}.ts`] = lines(12, (i) => `console.log("shared-${file}-${i}")`);
    }
    if (index < 2) {
      files["src/gap.ts"] = `// banner\nimport "./names"\n${left}\n// ignored separator comment\nconsole.log("bridge-${index}")\n${right}` +
        (index === 0 ? `console.log("repeat-only-here")\n${left}` : "");
    }
    return { name: `peer${index}`, ...repo(files) };
  });
  const result = run(peers[0].dir, census, ["xrepo", ...peers.map(({ name, dir }) => `${name}=${dir}:HEAD`)]);
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.names_in_2plus_repos, 50);
  assert.equal(value.top_names.length, 40);
  assert.equal(value.top_cross_file_pairs.length, 25);
  assert.equal(Object.keys(value.cross_repo_shared_windows_by_repo_pair).length, 20);
  const repoPairs = peers.flatMap((a, i) => peers.slice(i + 1).map((b) => [a.name, b.name]));
  assert.deepEqual(value.top_names, Array.from({ length: 40 }, (_, i) =>
    [`name${i}`, Object.fromEntries(peers.map(({ name }) => [name, 1]))]));
  assert.deepEqual(value.top_cross_file_pairs, Array.from({ length: 30 }, (_, file) => `src/shared-${file}.ts`).sort()
    .flatMap((path) => repoPairs.map(([a, b]) => [12, `${a}/${path}`, `${b}/${path}`])).slice(0, 25));
  assert.deepEqual(value.cross_repo_shared_windows_by_repo_pair,
    Object.fromEntries(repoPairs.slice(0, 20).map(([a, b]) => [`${a}~${b}`, a === "peer0" && b === "peer1" ? 92 : 90])));
  assert.equal(Object.keys(value.lists?.names ?? {}).length, 50, "full name inventory must survive the 40-name preview");
  assert.equal(Object.keys(value.lists.repo_pairs).length, 21);
  assert.equal(value.lists.cross_file_pairs.length, 631, "all 30 shared files across 21 repository pairs, plus the disconnected copy");
  assert.equal(Object.keys(value.lists.windows).length, 92);
  assert.equal(Object.values(value.lists.windows).flat().length, 635, "repeated occurrences in one file remain distinct evidence");
  assert.equal(value.window_normalized_lines, 10);
  assert.match(value.top_cross_file_pairs_unit, /not.*(?:LOC|lines)/i);
  assert.deepEqual(value.lists.names.name49, Object.fromEntries(peers.map(({ name }) => [name, ["src/names.ts"]])));
  const gap = value.lists.cross_file_pairs.find(({ a, b }) => a.path === "src/gap.ts" && b.path === "src/gap.ts");
  assert.equal(gap.shared_windows, 2, "disconnected hashes are windows, not shared_windows+9 copied lines");
  assert.equal(gap.window_hashes.length, 2);
  const occurrences = gap.window_hashes.flatMap((hash) => value.lists.windows[hash]);
  assert.deepEqual(occurrences.filter((o) => o.repo === "peer0").map(({ normalized_start, start_line, end_line }) =>
    [normalized_start, start_line, end_line]).sort((a, b) => a[0] - b[0]), [[1, 3, 12], [12, 16, 25], [23, 27, 36]]);
  assert.deepEqual(occurrences.filter((o) => o.repo === "peer1").map(({ normalized_start, start_line, end_line }) =>
    [normalized_start, start_line, end_line]).sort((a, b) => a[0] - b[0]), [[1, 3, 12], [12, 16, 25]]);
  const measured = run(peers[0].dir, census, ["measure", ".", "HEAD", "--scope", "src/gap.ts"]);
  assert.equal(measured.status, 0, measured.stderr);
  assert.deepEqual(JSON.parse(measured.stdout).scope.lists.dup_lines.files["src/gap.ts"],
    { normalized_lines: 32, dup_lines: 20 }, "the existing per-file coverage owner remains authoritative");
});

test("deleting malformed historical Python cannot block a valid change or exempt a new oversized function", () => {
  const { dir, git } = repo({ "src/archived.py": "*** Begin Patch\n", "src/current.py": pythonFunction("small", 2) });
  git("rm", "-q", "src/archived.py");
  write(dir, { "src/current.py": pythonFunction("small", 3) });
  git("add", "-A");
  const check = () => runPythonOnly(dir, "node", [join(hooks, "fn-ratchet.cjs")]);
  assert.equal(check().status, 0);
  write(dir, { "src/current.py": pythonFunction("large", 301) });
  git("add", "-A");
  const oversized = check();
  assert.equal(oversized.status, 1, oversized.stderr);
  assert.match(oversized.stderr, /large is 301 lines \(new\)/);
  write(dir, { "src/current.py": "*** Begin Patch\n" });
  git("add", "-A");
  const malformed = check();
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /python functions refused:/);
});
