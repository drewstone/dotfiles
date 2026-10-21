import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

// Real pushes through the global pre-push hook: the files its content checks read are the files
// the pushed commits change, not every file a merged base brought in. agent-container, 2026-10-21:
// a branch that merged develop was refused for develop's own redaction regex
// (products/platform/api/src/lib/inference-redact.ts, `private-key`).
const hooksPath = resolve("git/hooks");
const env = { ...process.env, AI_AGENT_HOOKS_GLOBAL_BASELINE: "1" };
delete env.GITHUB_ACTIONS;
const noHooks = mkdtempSync(join(tmpdir(), "push-files-nohooks-"));
const KEY = ["-----BEGIN", "RSA", "PRIVATE", "KEY-----"].join(" ");

function git(cwd, args) {
  return spawnSync("git", args, { cwd, encoding: "utf8", env });
}

function bare(cwd, args) {
  return git(cwd, ["-c", `core.hooksPath=${noHooks}`, ...args]);
}

function ok(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function commit(repo, files, message) {
  for (const [name, content] of Object.entries(files)) writeFileSync(join(repo, name), content);
  ok(git(repo, ["add", "."]));
  ok(bare(repo, ["commit", "-q", "-m", message]));
}

/** A remote whose main gains a secret-shaped file after feat/x forks from it. */
function setup() {
  const remote = mkdtempSync(join(tmpdir(), "push-files-remote-"));
  ok(bare(remote, ["init", "--bare", "-q", "-b", "main"]));
  const repo = mkdtempSync(join(tmpdir(), "push-files-repo-"));
  ok(bare(repo, ["init", "-q", "-b", "main"]));
  for (const [k, v] of [["user.name", "t"], ["user.email", "t@example.invalid"], ["commit.gpgsign", "false"]]) {
    ok(git(repo, ["config", k, v]));
  }
  ok(git(repo, ["remote", "add", "origin", remote]));
  commit(repo, { "a.txt": "a\n" }, "a");
  ok(bare(repo, ["switch", "-q", "-c", "feat/x"]));
  commit(repo, { "feature.txt": "feature\n" }, "feature");
  ok(bare(repo, ["push", "-q", "-u", "origin", "feat/x"]));
  ok(bare(repo, ["switch", "-q", "main"]));
  commit(repo, { "redact.ts": `const pattern = /${KEY}/;\n` }, "base adds a redaction pattern");
  ok(bare(repo, ["push", "-q", "origin", "main"]));
  ok(bare(repo, ["switch", "-q", "feat/x"]));
  ok(git(repo, ["config", "core.hooksPath", hooksPath]));
  return repo;
}

test("a branch that merges its base pushes without checking the base's files", () => {
  const repo = setup();
  ok(bare(repo, ["merge", "-q", "--no-edit", "main"]));
  const result = ok(git(repo, ["push", "origin", "feat/x"]));
  assert.doesNotMatch(result.stdout + result.stderr, /redact\.ts/);
});

test("a secret the branch adds itself is still refused after it merges its base", () => {
  const repo = setup();
  commit(repo, { "leak.txt": `${KEY}\n` }, "leak");
  ok(bare(repo, ["merge", "-q", "--no-edit", "main"]));
  const result = git(repo, ["push", "origin", "feat/x"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /leak\.txt:1 \(private-key\)/);
  assert.doesNotMatch(result.stdout + result.stderr, /redact\.ts/);
});

test("a secret a merge adds while resolving is refused", () => {
  const repo = setup();
  ok(bare(repo, ["merge", "-q", "--no-commit", "main"]));
  writeFileSync(join(repo, "feature.txt"), `feature\n${KEY}\n`);
  ok(git(repo, ["add", "feature.txt"]));
  ok(bare(repo, ["commit", "-q", "--no-edit"]));
  const result = git(repo, ["push", "origin", "feat/x"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /feature\.txt:2 \(private-key\)/);
});

function remoteNamed(repo, name) {
  const path = mkdtempSync(join(tmpdir(), `push-files-${name}-`));
  ok(bare(path, ["init", "--bare", "-q", "-b", "main"]));
  ok(git(repo, ["remote", "add", name, path]));
  return path;
}

test("a merged branch only another remote holds is checked when it is sent", () => {
  const repo = setup();
  remoteNamed(repo, "fork");
  ok(bare(repo, ["switch", "-q", "-c", "evil", "main"]));
  commit(repo, { "fork.pem": `${KEY}\n` }, "fork adds a key");
  ok(bare(repo, ["push", "-q", "fork", "evil"]));
  ok(bare(repo, ["switch", "-q", "feat/x"]));
  ok(bare(repo, ["branch", "-q", "-D", "evil"]));
  ok(bare(repo, ["fetch", "-q", "fork"]));
  ok(bare(repo, ["merge", "-q", "--no-edit", "fork/evil"]));
  const result = git(repo, ["push", "origin", "feat/x"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /fork\.pem:1 \(private-key\)/);
});

test("a pushed branch is read at its own commit, not from the working tree", () => {
  const repo = setup();
  commit(repo, { "feat.pem": `${KEY}\n` }, "feat adds a key");
  ok(bare(repo, ["switch", "-q", "main"]));
  const result = git(repo, ["push", "origin", "feat/x"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /feat\.pem:1 \(private-key\)/);
});

test("a key added and removed again in the pushed history is refused", () => {
  const repo = setup();
  commit(repo, { "gone.pem": `${KEY}\n` }, "add");
  ok(git(repo, ["rm", "-q", "gone.pem"]));
  ok(bare(repo, ["commit", "-q", "-m", "remove"]));
  const result = git(repo, ["push", "origin", "feat/x"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /gone\.pem:1 \(private-key\)/);
});

test("a commit one remote holds is checked when pushed to another", () => {
  const repo = setup();
  remoteNamed(repo, "public");
  ok(bare(repo, ["switch", "-q", "-c", "leak", "main"]));
  commit(repo, { "leak.pem": `${KEY}\n` }, "leak");
  ok(bare(repo, ["push", "-q", "origin", "leak"]));
  const result = git(repo, ["push", "public", "leak"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /leak\.pem:1 \(private-key\)/);
});

test("a push naming a commit this repository does not hold is refused, never checked as empty", () => {
  const repo = setup();
  const missing = "1".repeat(40);
  const result = spawnSync(
    process.execPath,
    [resolve("bin/ai-agent-hooks.mjs"), "run", "pre-push", "origin", "/nowhere"],
    { cwd: repo, encoding: "utf8", env, input: `refs/heads/feat/x ${missing} refs/heads/feat/x ${"0".repeat(40)}\n` },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /cannot read pushed commit/);
});

/** A branch `leak` adding a key, already on origin, so origin's tracking refs reach it. */
function leakOnOrigin(repo) {
  ok(bare(repo, ["switch", "-q", "-c", "leak", "main"]));
  commit(repo, { "leak.pem": `${KEY}\n` }, "leak");
  ok(bare(repo, ["push", "-q", "origin", "leak"]));
}

test("a remote that pushes to another repository than it fetches from vouches for nothing", () => {
  const repo = setup();
  leakOnOrigin(repo);
  const publicRepo = mkdtempSync(join(tmpdir(), "push-files-public-"));
  ok(bare(publicRepo, ["init", "--bare", "-q", "-b", "main"]));
  ok(git(repo, ["config", "remote.origin.pushurl", publicRepo]));
  const result = git(repo, ["push", "origin", "leak"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /leak\.pem:1 \(private-key\)/);
});

test("a remote whose name is a glob matches no other remote's tracking refs", () => {
  const repo = setup();
  leakOnOrigin(repo);
  const other = mkdtempSync(join(tmpdir(), "push-files-glob-"));
  ok(bare(other, ["init", "--bare", "-q", "-b", "main"]));
  // `git remote add` refuses the name; a config section does not.
  ok(git(repo, ["config", "remote.o*.url", other]));
  const result = git(repo, ["push", "o*", "leak"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /leak\.pem:1 \(private-key\)/);
});

test("a replace ref cannot make a sent commit read as another", () => {
  const repo = setup();
  commit(repo, { "real.pem": `${KEY}\n` }, "real");
  const real = ok(git(repo, ["rev-parse", "HEAD"])).stdout.trim();
  const clean = ok(git(repo, ["commit-tree", "-p", "HEAD~1", "-m", "clean", "HEAD~1^{tree}"])).stdout.trim();
  ok(git(repo, ["replace", real, clean]));
  const result = git(repo, ["push", "origin", "feat/x"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /real\.pem:1 \(private-key\)/);
});
