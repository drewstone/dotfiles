import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { MATRIX, runMatrix, subcommandOf, buildFixture } from "./rtk-fidelity.mjs";
import { MUTANTS, writeMutant, HOOK_SOURCE } from "./rtk-guard-mutants.mjs";

// Which hook to exercise. Defaults to the one in the repo; a mutant copy is
// pointed at with RTK_GUARD_HOOK_PATH so a RED state is reproducible from a
// published recipe instead of only being reachable by hand-editing the hook.
const hookPath = process.env.RTK_GUARD_HOOK_PATH
  ? resolve(process.env.RTK_GUARD_HOOK_PATH)
  : HOOK_SOURCE;

const guardVerdict = (command, cwd) => {
  const result = spawnSync(hookPath, ["--guard-check", command], { cwd, encoding: "utf8", input: "" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
};

const allowlistVerdict = (subcommand) => {
  const result = spawnSync(hookPath, ["--allowlist-check", subcommand], { encoding: "utf8", input: "" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
};

const safeVerdict = (original, rewritten) => {
  const result = spawnSync(hookPath, ["--safe-check", original, rewritten], { encoding: "utf8", input: "" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
};

// The PreToolUse contract itself: feed the hook the JSON Claude Code feeds it
// and return the command string the Bash tool would actually run. Asserting on
// this rather than on --guard-check means the property under test is what the
// caller EXECUTES, not what an internal helper reports about it.
const finalCommand = (command, cwd) => {
  const result = spawnSync(hookPath, [], {
    cwd,
    encoding: "utf8",
    input: JSON.stringify({ tool_input: { command } }),
  });
  assert.equal(result.status, 0, result.stderr);
  if (result.stdout.trim() === "") return command;
  return JSON.parse(result.stdout).hookSpecificOutput.updatedInput.command;
};

// True when the string the caller would run hands `git <sub>` to rtk: an `rtk`
// word with nothing between it and `git` but wrapper words or env assignments.
// A `git` the shell runs itself is not a match — real git is always correct.
const routesToRtk = (finalString, sub) =>
  new RegExp(
    String.raw`(^|\s)(\S*/)?rtk\s+` +
      String.raw`(?:(?:command|builtin|exec|env|sudo|nice|time|nohup|timeout|stdbuf)\s+|\S+=\S*\s+)*` +
      String.raw`(\S*/)?git\s+${sub}(\s|$)`,
  ).test(finalString);

const has = (bin) => spawnSync("sh", ["-c", `command -v ${bin}`]).status === 0;

// Subcommands measured faithful in every form, so the guard has no grounds to
// refuse them. Naming them here means a guard that "fixes" itself by refusing
// everything fails this file instead of passing it — which is exactly how the
// first version of this test managed to assert nothing at all.
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
// git on object, ref and path identity, and on silent truncation.
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

  // Non-vacuity, stated as an assertion rather than as a hope. The first
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
  const truncating = reachedRtk.filter((r) => r.droppedLines > 0);
  t.diagnostic(
    `compared ${reachedRtk.length} of ${results.length} matrix cases against real git; ` +
      `${truncating.length} truncated detail and every one announced it`,
  );
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
// The guard must be fail-closed across the WHOLE git surface, not just the
// subcommands someone remembered to list. Enumerating from git's own command
// list instead of a hand-written one is what surfaced that rtk also rewrites
// commit-graph, commit-tree, diff-files, diff-index, difftool, fetch-pack,
// show-branch and show-index — none of which a hardcoded list contained.
//
// The invariant is not "everything is measured". It is: rtk may answer only
// where there is evidence, and everything else falls through to real git.
// ---------------------------------------------------------------------------
test("rtk may answer only where measured; every other subcommand it rewrites is refused", (t) => {
  if (!has("git")) return t.skip("git not installed");
  if (!has("rtk")) return t.skip("rtk not installed");

  // git's own enumeration, not the prose of `git help -a`, whose description
  // lines would otherwise contribute words like "branches" and "addresses".
  const listed = spawnSync("git", ["--list-cmds=main,others"], { encoding: "utf8" }).stdout || "";
  const subcommands = [
    ...new Set(listed.split("\n").filter((word) => /^[a-z][a-z0-9-]+$/.test(word))),
  ];
  assert.ok(subcommands.length > 50, `git listed only ${subcommands.length} subcommands`);

  const rewritten = subcommands.filter((sub) => {
    const r = spawnSync("rtk", ["rewrite", `git ${sub}`], { encoding: "utf8" });
    return r.status === 0 && r.stdout.trim() !== "" && r.stdout.trim() !== `git ${sub}`;
  });
  assert.ok(rewritten.length > 0, "rtk rewrote nothing, so this test measured nothing");

  const measured = new Set(MATRIX.map(subcommandOf));
  const fixture = buildFixture("failclosed");
  const violations = [];
  try {
    for (const sub of rewritten) {
      const allowed = allowlistVerdict(sub) === "allowed";
      if (allowed && !measured.has(sub)) {
        violations.push(`${sub}: on the allowlist but never measured by the fidelity matrix`);
      }
      if (!allowed && guardVerdict(`git ${sub}`, fixture.repo) !== "real") {
        violations.push(`${sub}: not on the allowlist but still reached rtk`);
      }
      // ...and the same subcommand may not become reachable by writing it after
      // a shell separator. This is the round-3 hole, generalised over the whole
      // surface instead of over the eleven subcommands someone thought of.
      if (!allowed) {
        const final = finalCommand(`git diff & git ${sub}`, fixture.repo);
        if (routesToRtk(final, sub)) {
          violations.push(`${sub}: reached rtk behind a bare & -> ${final}`);
        }
      }
    }
  } finally {
    fixture.cleanup();
  }
  assert.deepEqual(violations, [], "guard is not fail-closed over the full git subcommand surface");

  const unmeasured = rewritten.filter((sub) => !measured.has(sub));
  t.diagnostic(
    `${subcommands.length} git subcommands scanned; rtk rewrites ${rewritten.length}; ` +
      `${measured.size} measured; ${unmeasured.length} unmeasured and therefore refused: ${unmeasured.join(" ")}`,
  );
});

// ---------------------------------------------------------------------------
// The round-3 defect, and its neighbourhood.
//
// v5 split the command string on a hand-written list of separators that had no
// bare `&` in it, then treated a segment it could not parse as safe. One
// character therefore defeated the whole allowlist. Rather than add `&` to a
// list and wait for the next character, this sweeps EVERY ASCII punctuation
// character as a separator, plus newline and tab, and asserts on the string the
// caller would actually execute.
// ---------------------------------------------------------------------------
test("a refused subcommand cannot be hidden behind a separator the guard did not anticipate", (t) => {
  if (!has("git")) return t.skip("git not installed");
  if (!has("rtk")) return t.skip("rtk not installed");

  const fixture = buildFixture("separators");
  const leaks = [];
  try {
    const punctuation = [..."!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~", "\n", "\t", "&&", "||", ";;", "|&"];
    for (const sep of punctuation) {
      for (const spacing of [`git diff ${sep} git branch -r`, `git diff ${sep}git branch -r`]) {
        const final = finalCommand(spacing, fixture.repo);
        if (routesToRtk(final, "branch")) {
          leaks.push(`${JSON.stringify(spacing)} -> ${JSON.stringify(final)}`);
        }
      }
    }

    // The measured shapes from the round-2 and round-3 reports, verbatim.
    const named = [
      "sleep 1 & git log --oneline -7",
      "git diff & git status --porcelain",
      "git diff & git branch -r",
      "git diff & git commit -m wip",
      "pnpm build & git branch -r",
      "cargo build & git branch -a",
      "npm run dev & git status",
      "git status;git diff",
      "git diff ;git branch -r",
      "for f in x; do git branch -r; done",
      "{ git branch -r; }",
      "! git branch -r",
      "xargs git branch -r",
      "nohup git branch -r",
      "GIT_PAGER=cat git branch -v",
    ];
    for (const command of named) {
      const final = finalCommand(command, fixture.repo);
      for (const sub of ["branch", "log", "status", "commit"]) {
        if (routesToRtk(final, sub)) leaks.push(`${JSON.stringify(command)} -> ${final}`);
      }
    }
  } finally {
    fixture.cleanup();
  }

  assert.deepEqual(leaks, [], "these strings hand a refused git subcommand to rtk");
});

// ---------------------------------------------------------------------------
// The walk itself, without rtk in the loop. rtk cannot be made to emit a
// rewrite it does not emit, so the only way to check that the guard refuses an
// unexpected transformation is to hand it one.
// ---------------------------------------------------------------------------
test("the walk refuses any rewrite it cannot prove is a safe insertion of rtk", () => {
  const outside = mkdtempSync(join(tmpdir(), "rtk-guard-walk-"));
  try {
    const cases = [
      // [original, rewritten, expected]
      ["git diff", "rtk git diff", "safe"],
      ["git diff --stat", "rtk git diff --stat", "safe"],
      ["cargo build", "rtk cargo build", "safe"],
      ["git diff | head -3", "rtk git diff | head -3", "safe"],
      ["git diff && cargo build", "rtk git diff && rtk cargo build", "safe"],
      // a git the shell runs itself is fine: real git is always correct
      ["cargo build & git branch -r", "rtk cargo build & git branch -r", "safe"],

      // the round-3 break, in both spellings
      ["sleep 1 & git log --oneline -7", "sleep 1 & rtk git log --oneline -7", "unsafe"],
      ["git diff & git branch -r", "rtk git diff & rtk git branch -r", "unsafe"],
      // a separator nobody enumerated: the token before git is not recognised
      ["git diff @@ git branch -r", "rtk git diff @@ rtk git branch -r", "unsafe"],
      ["git diff", "rtk mystery git branch -r", "unsafe"],
      // a wrapper word or wrapper FLAG standing between rtk and git. rtk is
      // still in the pipeline, so "the shell runs this one itself" is false;
      // not recognising the word is the whole reason to refuse.
      ["watch git branch -r", "rtk watch git branch -r", "unsafe"],
      ["stdbuf -oL git branch -r", "rtk stdbuf -oL git branch -r", "unsafe"],
      ["timeout -k 1 5 git branch -r", "rtk timeout -k 1 5 git branch -r", "unsafe"],

      // not a pure insertion: rtk changed something other than adding `rtk`
      ["git diff", "rtk git diff --stat", "unsafe"],
      ["git diff", "rtk git branch -r", "unsafe"],
      ["git diff", "rtk git diff && rm -rf /", "unsafe"],
      ["git status;git diff", "rtk git status; rtk git diff", "unsafe"],

      // the caller wrote rtk themselves; the hook must not put its name on it
      ["rtk git log", "rtk git log -1", "unsafe"],

      // opaque: only the shell knows what these are
      ["git diff $(echo HEAD)", "rtk git diff $(echo HEAD)", "unsafe"],
      ["git diff `echo HEAD`", "rtk git diff `echo HEAD`", "unsafe"],
      ["git diff $REV", "rtk git diff $REV", "unsafe"],

      // quoting is not structure
      ["g'i't diff", "rtk g'i't diff", "safe"],
      ["g'i't branch -r", "rtk g'i't branch -r", "unsafe"],

      // an unresolvable git shape
      ["git", "rtk git", "unsafe"],
      ["git --wat diff", "rtk git --wat diff", "unsafe"],
      ["git -C", "rtk git -C", "unsafe"],

      // revisions never reach rtk, even on an allowed subcommand
      ["git diff HEAD~1", "rtk git diff HEAD~1", "unsafe"],
      ["git diff-tree -r HEAD", "rtk git diff-tree -r HEAD", "unsafe"],
    ];
    for (const [original, rewritten, expected] of cases) {
      assert.equal(
        safeVerdict(original, rewritten),
        expected,
        `${JSON.stringify(original)} -> ${JSON.stringify(rewritten)}`,
      );
    }
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
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
      // one unsafe part disqualifies the whole string
      "cd /tmp && git log -1 928295e | head -3",
      "pnpm build && git show abc1234",
      "git diff && git diff HEAD~1",
      "git diff & git diff HEAD~1",
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
    // every one of them through. This is the exact gap the v3 guard had:
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
      "git diff --stat | head -20",
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

// ---------------------------------------------------------------------------
// Does this file actually catch anything? Each mutant re-opens one specific
// hole this guard has had, and the test that should catch it is run against the
// mutant hook. A mutant that passes means the assertion protecting it is
// decorative — the state the first two rounds of this fix shipped twice.
//
// Runs only in the parent: the child inherits RTK_GUARD_MUTATION_CHILD.
// ---------------------------------------------------------------------------
test("every mutant of the guard is caught by this file", (t) => {
  if (process.env.RTK_GUARD_MUTATION_CHILD) return t.skip("child run");
  if (!has("git")) return t.skip("git not installed");
  if (!has("rtk")) return t.skip("rtk not installed");

  const dir = mkdtempSync(join(tmpdir(), "rtk-guard-mutants-"));
  const survivors = [];
  try {
    for (const mutant of MUTANTS) {
      const path = writeMutant(mutant.name, join(dir, `${mutant.name}.sh`));
      // NODE_TEST_CONTEXT tells node it is already a test worker; inheriting it
      // makes the grandchild report through the parent and exit 0 whatever it
      // found, which would make this whole test vacuous.
      const env = { ...process.env, RTK_GUARD_HOOK_PATH: path, RTK_GUARD_MUTATION_CHILD: "1" };
      delete env.NODE_TEST_CONTEXT;
      const child = spawnSync(
        process.execPath,
        ["--test", "--test-name-pattern", mutant.caughtBy, import.meta.filename],
        { encoding: "utf8", cwd: resolve(import.meta.dirname, ".."), env },
      );
      const ran = /^# tests \d+$|ℹ tests \d+|# pass \d+/m.test(child.stdout || "");
      if (!ran) {
        survivors.push(
          `${mutant.name}: child runner produced no test count, so nothing was measured ` +
            `(status ${child.status}) ${(child.stderr || "").slice(0, 200)}`,
        );
        continue;
      }
      if (/tests 0\b/.test(child.stdout)) {
        survivors.push(`${mutant.name}: pattern "${mutant.caughtBy}" matched no test`);
        continue;
      }
      if (child.status === 0) {
        survivors.push(`${mutant.name} (${mutant.why}) survived "${mutant.caughtBy}"`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual(survivors, [], "these mutations of the guard are not caught by any assertion");
  t.diagnostic(`${MUTANTS.length} mutants injected into ${HOOK_SOURCE}, all caught`);
});
