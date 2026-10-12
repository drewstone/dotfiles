import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

// Real pushes through the global pre-push hook, so the refspec, push.default and the
// stdin git hands the hook are all git's own.
const hooksPath = resolve("git/hooks");
const env = { ...process.env, AI_AGENT_HOOKS_GLOBAL_BASELINE: "1", GIT_ALLOW_CROSS_NAME_DEFAULT_PUSH: "" };
delete env.GITHUB_ACTIONS;

// Fixture setup and commits run with no hooks, so the host's own hooks (identity, this guard)
// never decide them; only the pushes under test go through git/hooks.
const noHooks = mkdtempSync(join(tmpdir(), "cross-name-nohooks-"));

function bare(cwd, args) {
  return git(cwd, ["-c", `core.hooksPath=${noHooks}`, ...args]);
}

function git(cwd, args, extraEnv = {}) {
  return spawnSync("git", args, { cwd, encoding: "utf8", env: { ...env, ...extraEnv } });
}

function ok(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

// The guard applies to network remotes only; a path or file:// remote is a repository on this
// disk (test fixtures push to their own main). Refusal cases push through a network-shaped
// pushurl on an unresolvable host: the hook refuses before git opens any connection.
const NETWORK_PUSH_URL = "git@github.invalid:example/never.git";

function setup({ pushUrl } = {}) {
  const remote = mkdtempSync(join(tmpdir(), "cross-name-remote-"));
  ok(bare(remote, ["init", "--bare", "-q", "-b", "main"]));
  const repo = mkdtempSync(join(tmpdir(), "cross-name-repo-"));
  ok(bare(repo, ["init", "-q", "-b", "main"]));
  for (const [k, v] of [["user.name", "t"], ["user.email", "t@example.invalid"], ["commit.gpgsign", "false"]]) {
    ok(git(repo, ["config", k, v]));
  }
  ok(git(repo, ["remote", "add", "origin", remote]));
  writeFileSync(join(repo, "a.txt"), "a\n");
  ok(git(repo, ["add", "a.txt"]));
  ok(bare(repo, ["commit", "-q", "-m", "a"]));
  ok(bare(repo, ["push", "-q", "origin", "main"]));
  ok(bare(repo, ["push", "-q", "origin", "main:refs/heads/develop"]));
  ok(git(repo, ["config", "core.hooksPath", hooksPath]));
  if (pushUrl) ok(git(repo, ["config", "remote.origin.pushurl", pushUrl]));
  return repo;
}

function commitOn(repo, branch, startPoint) {
  ok(git(repo, ["switch", "-q", "-c", branch, ...(startPoint ? [startPoint] : [])]));
  writeFileSync(join(repo, `${branch.replaceAll("/", "-")}.txt`), "x\n");
  ok(git(repo, ["add", "."]));
  ok(bare(repo, ["commit", "-q", "-m", branch]));
}

test("a feature branch tracking origin/develop cannot update develop under push.default=upstream", () => {
  const repo = setup({ pushUrl: NETWORK_PUSH_URL });
  commitOn(repo, "feat/x", "origin/develop");
  ok(git(repo, ["config", "push.default", "upstream"]));
  const result = git(repo, ["push", "origin"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refs\/heads\/feat\/x -> refs\/heads\/develop/);
  assert.match(result.stderr, /git push origin HEAD:refs\/heads\/<your-branch>/);
});

test("a detached HEAD cannot update main", () => {
  const repo = setup({ pushUrl: NETWORK_PUSH_URL });
  commitOn(repo, "tmp");
  ok(git(repo, ["switch", "-q", "--detach"]));
  const result = git(repo, ["push", "origin", "HEAD:refs/heads/main"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HEAD \(detached\) -> refs\/heads\/main/);
});

test("deleting a default branch is refused", () => {
  const repo = setup({ pushUrl: NETWORK_PUSH_URL });
  const result = git(repo, ["push", "origin", ":refs/heads/develop"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /deleting refs\/heads\/develop/);
});

test("main pushes to main, by name and as HEAD", () => {
  const repo = setup();
  writeFileSync(join(repo, "b.txt"), "b\n");
  ok(git(repo, ["add", "b.txt"]));
  ok(bare(repo, ["commit", "-q", "-m", "b"]));
  ok(git(repo, ["push", "-q", "origin", "main"]));
  writeFileSync(join(repo, "c.txt"), "c\n");
  ok(git(repo, ["add", "c.txt"]));
  ok(bare(repo, ["commit", "-q", "-m", "c"]));
  ok(git(repo, ["push", "-q", "origin", "HEAD:main"]));
});

test("a feature branch pushes to its own name", () => {
  const repo = setup();
  commitOn(repo, "feat/y");
  ok(git(repo, ["push", "-q", "origin", "HEAD:refs/heads/feat/y"]));
});

test("the override lets a cross-name push through and says so", () => {
  const repo = setup({ pushUrl: NETWORK_PUSH_URL });
  commitOn(repo, "feat/z", "origin/develop");
  // The hook admits it; the push itself then fails to reach the unresolvable host.
  const result = git(repo, ["push", "origin", "HEAD:refs/heads/develop"], { GIT_ALLOW_CROSS_NAME_DEFAULT_PUSH: "1" });
  assert.match(result.stderr, /allowed by GIT_ALLOW_CROSS_NAME_DEFAULT_PUSH=1/);
  assert.doesNotMatch(result.stderr, /Refused: a default branch/);
});

test("a cross-name push to a local path remote is allowed (a test fixture's own main)", () => {
  const repo = setup();
  commitOn(repo, "fixture/sha", "origin/main");
  const result = ok(git(repo, ["push", "origin", "HEAD:refs/heads/main"]));
  assert.doesNotMatch(result.stderr, /Refused/);
  ok(git(repo, ["push", "origin", ":refs/heads/develop"]));
});

test("a cross-name push to a file:// remote is allowed", () => {
  const repo = setup();
  const local = git(repo, ["config", "remote.origin.url"]).stdout.trim();
  ok(git(repo, ["config", "remote.origin.pushurl", `file://${local}`]));
  commitOn(repo, "fixture/file", "origin/main");
  ok(git(repo, ["push", "origin", "HEAD:refs/heads/main"]));
});

for (const url of ["https://github.invalid/example/never.git", "ssh://git@github.invalid/example/never.git"]) {
  test(`a cross-name push to a network remote is refused (${url.split(":")[0]})`, () => {
    const repo = setup({ pushUrl: url });
    commitOn(repo, "feat/n", "origin/develop");
    const result = git(repo, ["push", "origin", "HEAD:refs/heads/develop"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refused: a default branch is updated from a different ref/);
  });
}

test("a repository config cannot drop or soften the guard", () => {
  const repo = setup({ pushUrl: NETWORK_PUSH_URL });
  writeFileSync(
    join(repo, ".ai-agent-hooks.json"),
    JSON.stringify({
      hooks: {
        "pre-push": {
          checks: [{ id: "g", builtin: "no-cross-name-default-push", required: false }],
        },
      },
    }),
  );
  commitOn(repo, "feat/w", "origin/develop");
  let result = git(repo, ["push", "origin", "HEAD:refs/heads/develop"]);
  assert.notEqual(result.status, 0);
  writeFileSync(join(repo, ".ai-agent-hooks.json"), JSON.stringify({ hooks: { "pre-push": { checks: [] } } }));
  result = git(repo, ["push", "origin", "HEAD:refs/heads/develop"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refused: a default branch is updated from a different ref/);
});
