import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = resolve("claude/tools/adc-wt");

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
}

test("repairs worktree metadata before checking out a claimed branch", () => {
  const testRoot = mkdtempSync(join(tmpdir(), "adc-wt-claim-"));
  const origin = join(testRoot, "origin.git");
  const repo = join(testRoot, "repo");
  const pool = join(repo, ".worktrees");
  const seed = join(pool, "wt-warm-seed");
  const claimed = join(pool, "fix-moved-worktree");
  const fakeBin = join(testRoot, "bin");
  const sourceCommit = run("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
  }).stdout.trim();

  try {
    let result = run("git", ["clone", "--bare", process.cwd(), origin]);
    assert.equal(result.status, 0, result.stderr);

    result = run("git", ["--git-dir", origin, "update-ref", "refs/heads/develop", sourceCommit]);
    assert.equal(result.status, 0, result.stderr);

    result = run("git", ["--git-dir", origin, "symbolic-ref", "HEAD", "refs/heads/develop"]);
    assert.equal(result.status, 0, result.stderr);

    result = run("git", ["clone", origin, repo]);
    assert.equal(result.status, 0, result.stderr);

    mkdirSync(pool, { recursive: true });
    result = run("git", ["worktree", "add", "--detach", seed, "origin/develop"], {
      cwd: repo,
    });
    assert.equal(result.status, 0, result.stderr);

    mkdirSync(fakeBin, { recursive: true });
    const fakePnpm = join(fakeBin, "pnpm");
    writeFileSync(fakePnpm, "#!/usr/bin/env bash\nexit 0\n", "utf8");
    chmodSync(fakePnpm, 0o755);

    result = run(scriptPath, ["claim", "fix/moved-worktree"], {
      cwd: repo,
      env: {
        ...process.env,
        ADC_REPO: repo,
        ADC_WT_POOL: pool,
        PATH: `${fakeBin}:${process.env.PATH}`,
      },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.trim().split("\n").at(-1), claimed);

    result = run("git", ["branch", "--show-current"], { cwd: claimed });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "fix/moved-worktree");

    result = run("git", ["worktree", "list", "--porcelain"], { cwd: repo });
    assert.equal(result.status, 0, result.stderr);
    const canonicalClaimed = realpathSync(claimed);
    assert.match(result.stdout, new RegExp(`worktree ${canonicalClaimed.replaceAll("/", "\\/")}`));
  } finally {
    rmSync(testRoot, { recursive: true, force: true });
  }
});
