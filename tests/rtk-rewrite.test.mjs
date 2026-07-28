import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { MATRIX, runMatrix, subcommandOf, buildFixture } from "./rtk-fidelity.mjs";

const hookPath = resolve("claude/hooks/rtk-rewrite.sh");

const guardVerdict = (command, cwd) => {
  const result = spawnSync(hookPath, ["--guard-check", command], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
};

const allowlistVerdict = (subcommand) => {
  const result = spawnSync(hookPath, ["--allowlist-check", subcommand], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
};

const has = (bin) => spawnSync("sh", ["-c", `command -v ${bin}`]).status === 0;

// Subcommands measured faithful in every form, so the guard has no grounds to
// refuse them. Naming them here means a guard that "fixes" itself by refusing
// everything fails this file instead of passing it — which is exactly how the
// previous version of this test managed to assert nothing at all.
const MUST_REACH_RTK = ["diff", "show-ref"];

let matrixResults = null;
const measure = () => {
  if (!matrixResults) matrixResults = runMatrix();
  return matrixResults;
};

// ---------------------------------------------------------------------------
// The safety property. Iterates what the guard ALLOWS, not what it blocks: a
// case the guard refuses proves nothing about rtk, so a test built from refused
// cases measures nothing. Every case that does reach rtk is diffed against real
// git on object, ref and path identity.
// ---------------------------------------------------------------------------
test("every command the guard hands to rtk reports the same objects real git does", (t) => {
  if (!has("git")) return t.skip("git not installed");
  if (!has("rtk")) return t.skip("rtk not installed");

  const fixture = buildFixture("verdict");
  let results;
  try {
    results = measure().map((r) => ({ ...r, verdict: guardVerdict(r.command, fixture.repo) }));
  } finally {
    fixture.cleanup();
  }

  const reachedRtk = results.filter((r) => r.verdict === "rtk");
  const failures = reachedRtk.filter((r) => !r.faithful);

  assert.deepEqual(
    failures.map((r) => `${r.command}: ${r.reasons.join("; ")}`),
    [],
    "the guard let these through to rtk, and rtk did not report what real git reports",
  );

  // Non-vacuity, stated as an assertion rather than as a hope. The previous
  // version of this test skipped all 8 of its cases and ran zero assertions.
  assert.ok(
    reachedRtk.length > 0,
    "no matrix case reached rtk, so this test measured nothing about rtk's fidelity",
  );

  // And specifically: the subcommands with no measured defect must still be
  // reaching rtk. This is what stops a blanket refusal from passing.
  const expected = MATRIX.filter((e) => MUST_REACH_RTK.includes(subcommandOf(e))).map(
    (e) => `git ${e.args.join(" ")}`,
  );
  const actual = reachedRtk.map((r) => r.command);
  for (const command of expected) {
    assert.ok(
      actual.includes(command),
      `${command} is faithful in every measured form but the guard refused it; ` +
        `only ${reachedRtk.length}/${results.length} cases reached rtk`,
    );
  }
  t.diagnostic(`compared ${reachedRtk.length} of ${results.length} matrix cases against real git`);
});

// ---------------------------------------------------------------------------
// The allowlist is a claim about rtk, so it has to match what rtk actually
// does — in both directions. Blocking without evidence is how a guard becomes
// useless; allowing despite evidence is how it becomes dangerous.
// ---------------------------------------------------------------------------
test("the allowlist matches measured rtk fidelity in both directions", (t) => {
  if (!has("git")) return t.skip("git not installed");
  if (!has("rtk")) return t.skip("rtk not installed");

  const results = measure();
  const bySubcommand = new Map();
  for (const r of results) {
    const sub = subcommandOf(r.entry);
    if (!bySubcommand.has(sub)) bySubcommand.set(sub, []);
    bySubcommand.get(sub).push(r);
  }

  const wrong = [];
  for (const [sub, cases] of bySubcommand) {
    const allFaithful = cases.every((r) => r.faithful);
    const listed = allowlistVerdict(sub) === "allowed";
    if (allFaithful && !listed) {
      wrong.push(`${sub}: faithful in all ${cases.length} measured forms but refused`);
    }
    if (!allFaithful && listed) {
      const bad = cases.find((r) => !r.faithful);
      wrong.push(`${sub}: on the allowlist but ${bad.command} -> ${bad.reasons.join("; ")}`);
    }
  }
  assert.deepEqual(wrong, [], "allowlist disagrees with measurement");

  assert.ok(bySubcommand.size > 0, "no subcommands measured");
  t.diagnostic(
    `${bySubcommand.size} subcommands measured; allowed: ${[...bySubcommand.keys()]
      .filter((s) => allowlistVerdict(s) === "allowed")
      .join(" ")}`,
  );
});

// ---------------------------------------------------------------------------
// The 14 subcommands rtk 0.30.1 rewrites are the guard's whole problem surface.
// If rtk starts filtering a new one, it must not be silently trusted.
// ---------------------------------------------------------------------------
test("every git subcommand rtk rewrites is covered by the matrix", (t) => {
  if (!has("rtk")) return t.skip("rtk not installed");
  const candidates = [
    "log", "status", "diff", "show", "branch", "stash", "worktree", "diff-tree",
    "add", "commit", "push", "pull", "fetch", "show-ref", "reflog", "blame",
    "rev-list", "rev-parse", "describe", "merge-base", "cat-file", "ls-files",
    "shortlog", "whatchanged", "switch", "checkout", "restore", "merge",
    "rebase", "cherry-pick", "revert", "tag", "remote", "config", "clean",
  ];
  const rewritten = candidates.filter((sub) => {
    const r = spawnSync("rtk", ["rewrite", `git ${sub}`], { encoding: "utf8" });
    return r.status === 0 && r.stdout.trim() !== "" && r.stdout.trim() !== `git ${sub}`;
  });
  const covered = new Set(MATRIX.map(subcommandOf));
  const uncovered = rewritten.filter((sub) => !covered.has(sub));
  assert.deepEqual(
    uncovered,
    [],
    "rtk rewrites these git subcommands but the fidelity matrix never measures them",
  );
  assert.ok(rewritten.length > 0, "rtk rewrote nothing, so this test measured nothing");
  t.diagnostic(`rtk rewrites ${rewritten.length} git subcommands: ${rewritten.join(" ")}`);
});

test("guard refuses any git command that names an explicit revision", (t) => {
  if (!has("git")) return t.skip("git not installed");
  const fixture = buildFixture("revs");
  try {
    const refused = [
      "git log -1 --format='%H %s' 928295e",
      "git log --oneline -8 origin/main",
      "git log -1",
      "git --no-pager log -1 HEAD~5",
      "git -C /some/where log --oneline -3",
      "git show 928295edde6eb51c6faf16d904d6dc6601c52713",
      "git diff HEAD~3",
      "git diff main",
      "git log --oneline main..HEAD",
      "git branch --contains 928295e",
      "git show HEAD@{1}",
      "git diff-tree --no-commit-id --name-only -r HEAD",
      // one unsafe segment disqualifies the whole compound string
      "cd /tmp && git log -1 928295e | head -3",
      "pnpm build && git show abc1234",
    ];
    for (const command of refused) {
      assert.equal(guardVerdict(command, fixture.repo), "real", `expected refusal: ${command}`);
    }
  } finally {
    fixture.cleanup();
  }
});

test("guard refuses the subcommands measured unfaithful, with or without a revision", (t) => {
  if (!has("git")) return t.skip("git not installed");
  if (!has("rtk")) return t.skip("rtk not installed");
  const fixture = buildFixture("unfaithful");
  try {
    // None of these name a revision, so a revision-shaped heuristic would let
    // every one of them through. This is the exact gap the previous guard had:
    // `branch --no-merged` and `branch -r` carry no revision token, and rtk
    // answers both with a branch that does not exist.
    const refused = [
      "git branch",
      "git branch -v",
      "git branch -a",
      "git branch -r",
      "git branch --no-merged",
      "git branch --merged",
      "git branch --list 'extra/*'",
      "git status",
      "git status --short",
      "git status --porcelain",
      "git stash list",
      "git worktree list",
      "git add -A",
      "git commit -m 'some message'",
      "git push origin main",
      "git pull origin main",
      "git fetch origin",
      "git log --oneline",
    ];
    for (const command of refused) {
      assert.equal(guardVerdict(command, fixture.repo), "real", `expected refusal: ${command}`);
    }
  } finally {
    fixture.cleanup();
  }
});

test("guard still lets rtk answer where it is faithful, and leaves non-git alone", (t) => {
  if (!has("git")) return t.skip("git not installed");
  if (!has("rtk")) return t.skip("rtk not installed");
  const fixture = buildFixture("allowed");
  try {
    const allowed = [
      "git diff",
      "git diff --stat",
      "git diff --cached",
      "git diff --name-only",
      "git diff -- src/foo.ts",
      "git show-ref",
      "pnpm install",
      "cargo build --release",
      "ls -la",
    ];
    for (const command of allowed) {
      assert.equal(guardVerdict(command, fixture.repo), "rtk", `expected rtk: ${command}`);
    }
  } finally {
    fixture.cleanup();
  }
});

test("guard recognises object names outside any repository", (t) => {
  if (!has("git")) return t.skip("git not installed");
  const outside = mkdtempSync(join(tmpdir(), "rtk-guard-norepo-"));
  try {
    assert.equal(guardVerdict("git show 928295edde6eb51c6faf16d904d6dc6601c52713", outside), "real");
    assert.equal(guardVerdict("git log -1", outside), "real");
    assert.equal(guardVerdict("git diff", outside), "rtk");
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});
