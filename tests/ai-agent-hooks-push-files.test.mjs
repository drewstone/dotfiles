import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

// Real pushes check sent commits, excluding history already held by the destination.
const hooksPath = resolve("git/hooks");
const env = { ...process.env, AI_AGENT_HOOKS_GLOBAL_BASELINE: "1", GIT_ALLOW_CROSS_NAME_DEFAULT_PUSH: "" };
delete env.GITHUB_ACTIONS;
const noHooks = mkdtempSync(join(tmpdir(), "push-files-nohooks-"));
const KEY = ["-----BEGIN", "RSA", "PRIVATE", "KEY-----"].join(" ");

function git(cwd, args, input) {
  return spawnSync("git", args, { cwd, encoding: "utf8", env, input });
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
  for (const path of [repo, remote]) {
    for (const [k, v] of [["user.name", "t"], ["user.email", "t@example.invalid"], ["commit.gpgsign", "false"]]) {
      ok(git(path, ["config", k, v]));
    }
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

test("a key header elided on its own line is a placeholder; a key block is still refused", () => {
  const repo = setup();
  const header = KEY.replace("RSA", "OPENSSH");
  commit(repo, { "README.md": `KEY="${header}..."\nKEY='${header}…'\n` }, "an outside repo documents a placeholder");
  ok(git(repo, ["push", "origin", "feat/x"]));
  commit(repo, { "id.pem": `${header}\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----\n` }, "a real key block");
  const result = git(repo, ["push", "origin", "feat/x"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /id\.pem:1 \(private-key\)/);
  assert.doesNotMatch(result.stdout + result.stderr, /README\.md/);
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

test("a remote re-pointed at another repository keeps no say through its old tracking refs", () => {
  const repo = setup();
  leakOnOrigin(repo);
  const publicRepo = mkdtempSync(join(tmpdir(), "push-files-repointed-"));
  ok(bare(publicRepo, ["init", "--bare", "-q", "-b", "main"]));
  ok(git(repo, ["remote", "set-url", "origin", publicRepo]));
  const result = git(repo, ["push", "origin", "leak"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /leak\.pem:1 \(private-key\)/);
});

test("a tracking ref left after its branch was deleted upstream vouches for nothing", () => {
  const repo = setup();
  leakOnOrigin(repo);
  const origin = ok(git(repo, ["remote", "get-url", "origin"])).stdout.trim();
  // Another clone deletes the branch; this one still holds refs/remotes/origin/leak.
  ok(bare(origin, ["update-ref", "-d", "refs/heads/leak"]));
  const result = git(repo, ["push", "origin", "leak:refs/heads/leak-again"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /leak\.pem:1 \(private-key\)/);
});

test("a branch built on a base that moved upstream since the last fetch pushes without checking the base", () => {
  const repo = setup();
  ok(bare(repo, ["merge", "-q", "--no-edit", "main"]));
  // Another clone advances main; this repository has not fetched it.
  const origin = ok(git(repo, ["remote", "get-url", "origin"])).stdout.trim();
  const other = mkdtempSync(join(tmpdir(), "push-files-other-"));
  ok(bare(tmpdir(), ["clone", "-q", origin, other]));
  for (const [k, v] of [["user.name", "t"], ["user.email", "t@example.invalid"], ["commit.gpgsign", "false"]])
    ok(git(other, ["config", k, v]));
  commit(other, { "later.txt": "later\n" }, "main moves on");
  ok(bare(other, ["push", "-q", "origin", "main"]));
  const result = ok(git(repo, ["push", "origin", "feat/x"]));
  assert.doesNotMatch(result.stdout + result.stderr, /redact\.ts/);
});

test("a blobless clone checks a push without fetching each destination tip it lacks", () => {
  const repo = setup();
  const origin = ok(git(repo, ["remote", "get-url", "origin"])).stdout.trim();
  ok(bare(origin, ["config", "uploadpack.allowFilter", "true"]));
  // 300 destination tips this clone has never seen, each its own commit.
  const tree = ok(bare(origin, ["rev-parse", "main^{tree}"])).stdout.trim();
  const refs = [];
  for (let i = 0; i < 300; i++) {
    const sha = ok(bare(origin, ["commit-tree", "-p", "main", "-m", `other ${i}`, tree])).stdout.trim();
    refs.push(`create refs/heads/other-${i} ${sha}`);
  }
  ok(spawnSync("git", ["update-ref", "--stdin"], { cwd: origin, encoding: "utf8", env, input: `${refs.join("\n")}\n` }));
  const partial = mkdtempSync(join(tmpdir(), "push-files-partial-"));
  ok(bare(tmpdir(), ["clone", "-q", "--filter=blob:none", "--single-branch", "-b", "feat/x", `file://${origin}`, partial]));
  for (const [k, v] of [["user.name", "t"], ["user.email", "t@example.invalid"], ["commit.gpgsign", "false"]])
    ok(git(partial, ["config", k, v]));
  ok(git(partial, ["config", "core.hooksPath", hooksPath]));
  commit(partial, { "clean.txt": "clean\n" }, "clean");
  const started = Date.now();
  ok(git(partial, ["push", "origin", "feat/x"]));
  assert.ok(Date.now() - started < 20_000, `push took ${Date.now() - started} ms`);
  commit(partial, { "partial.pem": `${KEY}\n` }, "key");
  const refused = git(partial, ["push", "origin", "feat/x"]);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stdout + refused.stderr, /partial\.pem:1 \(private-key\)/);
});

test("a commit the destination holds only under a hosting ref such as refs/pull vouches for nothing", () => {
  const repo = setup();
  ok(bare(repo, ["switch", "-q", "-c", "evil", "main"]));
  commit(repo, { "fork.pem": `${KEY}\n` }, "a fork's key");
  ok(bare(repo, ["push", "-q", "origin", "evil:refs/pull/7/head"]));
  ok(bare(repo, ["switch", "-q", "feat/x"]));
  ok(bare(repo, ["merge", "-q", "--no-edit", "evil"]));
  ok(bare(repo, ["branch", "-q", "-D", "evil"]));
  const result = git(repo, ["push", "origin", "feat/x:refs/heads/a5"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /fork\.pem:1 \(private-key\)/);
});

test("a push location an insteadOf lists as another repository vouches for nothing", () => {
  const repo = setup();
  leakOnOrigin(repo);
  const origin = ok(git(repo, ["remote", "get-url", "origin"])).stdout.trim();
  const publicRepo = mkdtempSync(join(tmpdir(), "push-files-rewrite-"));
  ok(bare(publicRepo, ["init", "--bare", "-q", "-b", "main"]));
  // Pushes go to the public repository; reads of it are rewritten back to origin.
  ok(git(repo, ["config", `url.${publicRepo}.pushInsteadOf`, origin]));
  ok(git(repo, ["config", `url.${origin}.insteadOf`, publicRepo]));
  const result = git(repo, ["push", "origin", "leak"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /leak\.pem:1 \(private-key\)/);
});

test("a destination that cannot be listed refuses the push and says to retry", () => {
  const repo = setup();
  const sha = ok(git(repo, ["rev-parse", "HEAD"])).stdout.trim();
  const result = spawnSync(
    process.execPath,
    [resolve("bin/ai-agent-hooks.mjs"), "run", "pre-push", "origin", join(tmpdir(), "push-files-no-such-repo")],
    { cwd: repo, encoding: "utf8", env, input: `refs/heads/feat/x ${sha} refs/heads/feat/x ${"0".repeat(40)}\n` },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /destination could not be listed; retry the push/);
});

for (const kind of ["clean", "secret", "removed-secret"]) test(`a bare ${kind} root history is checked through the normal hook`, () => {
  const remote = mkdtempSync(join(tmpdir(), "push-bare-remote-")), repo = mkdtempSync(join(tmpdir(), "push-bare-client-"));
  for (const path of [remote, repo]) ok(git(path, ["init", "--bare", "-q", "-b", "main"]));
  for (const [key, value] of [["user.name", "t"], ["user.email", "t@example.invalid"], ["core.hooksPath", hooksPath], ["protocol.ext.allow", "always"]])
    ok(git(repo, ["config", key, value]));
  ok(git(repo, ["remote", "add", "origin", `ext::git %s ${remote}`]));
  const commitTree = (content, parent) => {
    const blob = ok(git(repo, ["hash-object", "-w", "--stdin"], content)).stdout.trim();
    const tree = ok(git(repo, ["mktree"], `100644 blob ${blob}\troot.pem\n`)).stdout.trim();
    return ok(git(repo, ["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", "root history"])).stdout.trim();
  };
  const root = commitTree(kind === "clean" ? "clean\n" : `${KEY}\n`);
  const tip = kind === "removed-secret" ? commitTree("clean\n", root) : root;
  ok(git(repo, ["update-ref", "refs/heads/main", tip]));
  assert.equal(ok(git(repo, ["rev-list", "--parents", "-n", "1", root])).stdout.trim(), root);
  const result = git(repo, ["push", "origin", "refs/heads/main:refs/heads/main"]);
  if (kind === "clean") {
    ok(result);
    assert.equal(ok(git(remote, ["rev-parse", "main"])).stdout.trim(), root);
    const refused = git(repo, ["push", "origin", `${tip}:refs/heads/develop`]);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stdout + refused.stderr, /Refused: a default branch is updated from a different ref/);
    assert.equal(ok(git(remote, ["for-each-ref", "refs/heads/develop"])).stdout, "");
  } else {
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /root\.pem:1 \(private-key\)/);
    assert.equal(ok(git(remote, ["for-each-ref"])).stdout, "");
  }
});
