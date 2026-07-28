import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const hookPath = resolve("claude/hooks/rtk-rewrite.sh");

const guardVerdict = (command, cwd) => {
  const result = spawnSync(hookPath, ["--guard-check", command], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
};

const run = (bin, args, cwd) =>
  spawnSync(bin, args, { cwd, encoding: "utf8", env: { ...process.env, GIT_PAGER: "cat" } });

const has = (bin) => spawnSync("sh", ["-c", `command -v ${bin}`]).status === 0;

// A repository whose HEAD is a real merge commit, which is the shape that
// exposes the rtk 0.30.1 defect (its `git log` filter drops merge commits).
const makeRepoWithMerge = () => {
  const repo = mkdtempSync(join(tmpdir(), "rtk-guard-"));
  const git = (...args) => {
    const r = run("git", args, repo);
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git("add", "-A");
  git("commit", "--quiet", "-m", "base");
  git("checkout", "--quiet", "-b", "feature");
  writeFileSync(join(repo, "b.txt"), "b\n");
  git("add", "-A");
  git("commit", "--quiet", "-m", "feature work");
  git("checkout", "--quiet", "main");
  writeFileSync(join(repo, "c.txt"), "c\n");
  git("add", "-A");
  git("commit", "--quiet", "-m", "main work");
  git("merge", "--quiet", "--no-ff", "-m", "Merge feature into main", "feature");
  const mergeSha = git("rev-parse", "HEAD");
  assert.match(git("rev-list", "--parents", "-n", "1", "HEAD"), /\S+ \S+ \S+/, "HEAD must be a merge");
  return { repo, mergeSha };
};

// The safety property, stated so that it survives an upstream rtk fix:
// for every command that names a git object, either the hook refuses to hand
// it to rtk, or rtk reports exactly the same object real git does.
test("rtk never substitutes a different commit than the one asked for", (t) => {
  if (!has("git")) return t.skip("git not installed");
  const { repo, mergeSha } = makeRepoWithMerge();
  const short = mergeSha.slice(0, 7);
  const rtkAvailable = has("rtk");

  const cases = [
    ["log", "-1", "--format=%H %s", short],
    ["log", "--no-walk", "--oneline", short],
    ["log", "-1", short],
    ["log", "-n", "1", short],
    ["log", short, "--stat"],
    ["log", "--oneline", "-5"],
    ["log", "-1", "HEAD"],
    ["show", short],
  ];

  try {
    for (const args of cases) {
      const command = `git ${args.join(" ")}`;
      const verdict = guardVerdict(command, repo);
      if (verdict === "block") continue;

      // Not blocked: rtk is allowed to run, so it must be faithful.
      if (!rtkAvailable) continue;
      const real = run("git", ["--no-pager", ...args], repo).stdout;
      const filtered = run("rtk", ["git", ...args], repo).stdout;
      assert.ok(
        filtered.includes(short),
        `${command} was allowed through to rtk, but rtk did not report ${short}.\n` +
          `real git:\n${real}\nrtk:\n${filtered}`,
      );
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("guard blocks git commands that name an explicit revision", (t) => {
  if (!has("git")) return t.skip("git not installed");
  const { repo } = makeRepoWithMerge();
  try {
    const blocked = [
      "git log -1 --format='%H %s' 928295e",
      "git log --oneline -8 origin/main",
      "git log -1",
      "git --no-pager log -1 HEAD~5",
      "git -C /some/where log --oneline -3",
      "git show 928295edde6eb51c6faf16d904d6dc6601c52713",
      "git diff HEAD~3",
      "git log --oneline main..HEAD",
      "git branch --contains 928295e",
      "git diff main",
      "git show HEAD@{1}",
      "git shortlog -sn",
      // one unsafe segment disqualifies the whole compound string
      "cd /tmp && git log -1 928295e | head -3",
      "pnpm build && git show abc1234",
    ];
    for (const command of blocked) {
      assert.equal(guardVerdict(command, repo), "block", `expected block: ${command}`);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("guard still allows commands with no revision semantics", (t) => {
  if (!has("git")) return t.skip("git not installed");
  const { repo } = makeRepoWithMerge();
  try {
    const allowed = [
      "git status",
      "git status --short",
      "git diff",
      "git diff --stat",
      "git diff --cached",
      "git diff -- src/foo.ts",
      "git add -A",
      "git commit -m 'fix: expand ~/.config and 1234567 in the path'",
      "git push origin main",
      "git fetch --all",
      "git worktree list",
      "pnpm install",
      "cargo build --release",
      "ls -la",
    ];
    for (const command of allowed) {
      assert.equal(guardVerdict(command, repo), "allow", `expected allow: ${command}`);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("guard recognises object names outside any repository", (t) => {
  if (!has("git")) return t.skip("git not installed");
  const outside = mkdtempSync(join(tmpdir(), "rtk-guard-norepo-"));
  try {
    assert.equal(guardVerdict("git show 928295edde6eb51c6faf16d904d6dc6601c52713", outside), "block");
    assert.equal(guardVerdict("git log -1", outside), "block");
    assert.equal(guardVerdict("git status", outside), "allow");
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});
