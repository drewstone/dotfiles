import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  MATRIX,
  REGIMES,
  runMatrix,
  shapeKeyOf,
  shapeTable,
  shapeVerdicts,
  fidelity,
  announcesTruncation,
  subcommandOf,
  shapeOf,
  commandOf,
  buildFixture,
} from "./rtk-fidelity.mjs";
import { MUTANTS, writeMutant, HOOK_SOURCE } from "./rtk-guard-mutants.mjs";

// Which hook to exercise. Defaults to the one in the repo; a mutant copy is
// pointed at with RTK_GUARD_HOOK_PATH so a RED state is reproducible from a
// published recipe instead of only being reachable by hand-editing the hook.
const hookPath = process.env.RTK_GUARD_HOOK_PATH
  ? resolve(process.env.RTK_GUARD_HOOK_PATH)
  : HOOK_SOURCE;

const ask = (args, opts = {}) => {
  const result = spawnSync(hookPath, args, { encoding: "utf8", input: "", ...opts });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
};

const verdictMemo = new Map();
const guardVerdict = (command, cwd) => {
  const key = `${cwd}\u0000${command}`;
  if (!verdictMemo.has(key)) verdictMemo.set(key, ask(["--guard-check", command], { cwd }));
  return verdictMemo.get(key);
};
const shapeVerdict = (command, cwd) => ask(["--shape-check", command], { cwd });
const shapeOfCommand = (command, cwd) => ask(["--shape-of", command], { cwd });
const hookShapeTable = () => ask(["--list-shapes"]);
const safeVerdict = (original, rewritten) => ask(["--safe-check", original, rewritten]);

// The PreToolUse contract itself: feed the hook the JSON Claude Code feeds it
// and return the command string the Bash tool would actually run. Asserting on
// this rather than on --guard-check means the property under test is what the
// caller EXECUTES, not what an internal helper reports about it.
const finalCommand = (command, cwd, env) => {
  const result = spawnSync(hookPath, [], {
    cwd,
    env: env ?? process.env,
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

// ---------------------------------------------------------------------------
// The measurement, taken once per suite run and shared with the mutant children
// through a file. This is sound because a mutant changes the HOOK; it cannot
// change what rtk does, and the measurement is entirely about rtk. Re-measuring
// it inside every mutant child would multiply a 17-second matrix by nine.
// ---------------------------------------------------------------------------
const cachePath =
  process.env.RTK_GUARD_MEASUREMENT_CACHE ?? join(tmpdir(), `rtk-measurement-${process.pid}.json`);

let measurement = null;
const measure = async () => {
  if (measurement) return measurement;
  if (existsSync(cachePath)) {
    measurement = JSON.parse(readFileSync(cachePath, "utf8"));
    return measurement;
  }
  const full = await runMatrix();
  const verdicts = shapeVerdicts(full);
  measurement = {
    results: full.map((r) => ({
      command: r.command,
      shape: r.shape,
      regime: r.regime,
      subcommand: subcommandOf(r.entry),
      namesRevision: r.entry.namesRevision,
      faithful: r.faithful,
      reasons: r.reasons,
      droppedLines: r.droppedLines,
    })),
    table: shapeTable(full),
    allowed: [...verdicts]
      .filter(([, v]) => v.allowed)
      .map(([shape]) => shape)
      .sort(),
    why: Object.fromEntries([...verdicts].map(([shape, v]) => [shape, v.why])),
  };
  writeFileSync(cachePath, JSON.stringify(measurement));
  return measurement;
};

// ---------------------------------------------------------------------------
// The safety property. Iterates what the guard ALLOWS, not what it blocks: a
// case the guard refuses proves nothing about rtk, so a test built from refused
// cases measures nothing. Every case that does reach rtk is diffed against real
// git on object/ref/path identity, silent truncation, and exit status.
//
// The expectation is DERIVED, not listed: an invocation must reach rtk exactly
// when the measurement says its shape is faithful everywhere and it names no
// revision. There is no hardcoded pair of subcommands any more, so the suite can
// express both failures — letting an unfaithful invocation through, and refusing
// one there is no evidence against.
// ---------------------------------------------------------------------------
test("every invocation reaches rtk exactly when the measurement says it may", async (t) => {
  if (!has("git")) return t.skip("git not installed");
  if (!has("rtk")) return t.skip("rtk not installed");

  const { results, allowed } = await measure();
  const allow = new Set(allowed);

  const fixture = buildFixture("verdict");
  let rows;
  try {
    rows = results.map((r) => ({ ...r, verdict: guardVerdict(r.command, fixture.repo) }));
  } finally {
    fixture.cleanup();
  }

  const reachedRtk = rows.filter((r) => r.verdict === "rtk");

  // 1. nothing unfaithful reached rtk
  assert.deepEqual(
    reachedRtk.filter((r) => !r.faithful).map((r) => `${r.command}: ${r.reasons.join("; ")}`),
    [],
    "the guard let these through to rtk, and rtk did not report what real git reports",
  );

  // 2. and nothing faithful was refused without a reason the measurement knows.
  const wrong = [];
  for (const r of rows) {
    const expected = allow.has(r.shape) && !r.namesRevision ? "rtk" : "real";
    if (r.verdict !== expected) {
      wrong.push(
        `${r.command} [${r.regime}] -> ${r.verdict}, expected ${expected} ` +
          `(shape ${JSON.stringify(r.shape)}, measured ${allow.has(r.shape) ? "faithful" : "not faithful"}` +
          `${r.namesRevision ? ", names a revision" : ""})`,
      );
    }
  }
  assert.deepEqual(wrong, [], "guard verdict disagrees with the measurement");

  // 3. non-vacuity, stated as an assertion rather than as a hope. The first
  //    version of this test skipped all 8 of its cases and ran zero assertions.
  assert.ok(
    reachedRtk.length > 0,
    "no matrix case reached rtk, so this test measured nothing about rtk's fidelity",
  );
  assert.ok(allow.size > 0, "the measurement found no faithful invocation at all");

  const truncating = reachedRtk.filter((r) => r.droppedLines > 0);
  t.diagnostic(
    `${rows.length} invocations measured across ${REGIMES.length} regimes; ` +
      `${allow.size} shapes faithful everywhere; ${reachedRtk.length} reached rtk; ` +
      `${truncating.length} truncated detail and every one announced it`,
  );
});

// ---------------------------------------------------------------------------
// The table in the hook is a claim about rtk, so it must equal what measuring
// rtk produces — in both directions. Blocking without evidence is how a guard
// becomes useless; allowing despite evidence is how it becomes dangerous.
// ---------------------------------------------------------------------------
test("the hook's shape table is exactly the set of measured-faithful invocations", async (t) => {
  if (!has("git")) return t.skip("git not installed");
  if (!has("rtk")) return t.skip("rtk not installed");

  const { table, allowed, why } = await measure();
  const inHook = hookShapeTable().split("\n").filter(Boolean).sort();
  const derived = [...allowed];

  const trustedWithoutEvidence = inHook.filter((s) => !derived.includes(s));
  const evidenceIgnored = derived.filter((s) => !inHook.includes(s));

  assert.deepEqual(
    trustedWithoutEvidence.map((s) => `${s}  <- on the hook's table but ${why[s] ?? "never measured"}`),
    [],
    "the hook trusts invocations the measurement does not support",
  );
  assert.deepEqual(
    evidenceIgnored.map((s) => `${s}  <- faithful in every regime but the hook refuses it`),
    [],
    `the hook refuses invocations there is no evidence against.\n` +
      `Regenerate with: node tests/rtk-fidelity.mjs --shapes\n${table}`,
  );

  assert.ok(derived.length > 0, "the measurement produced an empty table, so this asserted nothing");
  t.diagnostic(`${derived.length} measured-faithful shapes, table matches the hook exactly`);
});

// ---------------------------------------------------------------------------
// Two implementations compute the shape key — bash in the hook, JS in the
// matrix — and the table is only meaningful if they agree. A bash extractor
// that dropped flags would compute `diff` for `git diff --summary` and hand it
// straight to rtk while the table still looked correct.
// ---------------------------------------------------------------------------
test("the hook computes the same shape key the measurement does", (t) => {
  if (!has("git")) return t.skip("git not installed");

  const fixture = buildFixture("shapekey");
  const mismatches = [];
  try {
    for (const entry of MATRIX) {
      const expected = shapeOf(entry);
      const actual = shapeOfCommand(commandOf(entry), fixture.repo);
      if (actual !== expected) mismatches.push(`${commandOf(entry)}: hook ${actual}, matrix ${expected}`);
    }
    // Shapes the matrix never produces, so the two implementations are compared
    // on argument orders and separators as well as on the measured forms.
    const extra = [
      ["git diff --stat --cached", "diff --cached --stat"],
      ["git diff --cached --stat", "diff --cached --stat"],
      ["git --no-pager diff --stat", "diff --stat"],
      ["git -C /tmp diff --stat", "diff --stat"],
      ["git diff --stat | head -20", "diff --stat"],
      ["git diff --stat && ls", "diff --stat"],
      ["git diff -- --weird-file", "diff -- <path>"],
      ["git diff a.txt b.txt", "diff <path>"],
      ["git diff --stat --stat", "diff --stat --stat"],
      ["git show-ref --heads --tags", "show-ref --heads --tags"],
    ];
    for (const [command, expected] of extra) {
      const actual = shapeOfCommand(command, fixture.repo);
      if (actual !== expected) mismatches.push(`${command}: hook ${actual}, expected ${expected}`);
      const fromKey = shapeKeyOf(...(() => {
        const words = command.replace(/\s*[|&].*$/, "").split(/\s+/).slice(1);
        const globals = { "-C": 1, "-c": 1 };
        let i = 0;
        while (words[i]?.startsWith("-")) i += globals[words[i]] ? 2 : 1;
        return [words[i], words.slice(i + 1)];
      })());
      if (fromKey !== expected) mismatches.push(`${command}: shapeKeyOf ${fromKey}, expected ${expected}`);
    }

    // The key is a SORTED flag list, and bash's `[[ a < b ]]` follows
    // LC_COLLATE while the table was sorted in byte order. Under en_US.UTF-8 an
    // unpinned sort puts `git diff -b -B` at "diff -b -B" and the table has
    // "diff -B -b", so the guard's answer would depend on the caller's locale.
    const localeCase = "git diff -b -B -w -W";
    const localeExpected = shapeKeyOf("diff", ["-b", "-B", "-w", "-W"]);
    const locales = spawnSync("locale", ["-a"], { encoding: "utf8" }).stdout || "";
    const available = ["C", "POSIX", "en_US.UTF-8", "C.UTF-8", "en_AG.utf8"].filter(
      (l) => locales.split("\n").some((x) => x.toLowerCase() === l.toLowerCase().replace("-", "")),
    );
    assert.ok(available.length > 1, `only ${available.length} locale(s) available to compare`);
    for (const locale of available) {
      const result = spawnSync(hookPath, ["--shape-of", localeCase], {
        cwd: fixture.repo,
        encoding: "utf8",
        input: "",
        env: { ...process.env, LC_ALL: locale },
      });
      if (result.stdout.trim() !== localeExpected) {
        mismatches.push(`${localeCase} under LC_ALL=${locale}: hook ${result.stdout.trim()}, matrix ${localeExpected}`);
      }
    }
  } finally {
    fixture.cleanup();
  }
  assert.deepEqual(mismatches, [], "the hook and the matrix disagree about what invocation this is");
  t.diagnostic(`${MATRIX.length} matrix cases + 10 hand-written forms agree on the shape key`);
});

// ---------------------------------------------------------------------------
// The guard must be fail-closed across the WHOLE git surface, not just the
// subcommands someone remembered to list. Enumerating from git's own command
// list instead of a hand-written one is what surfaced that rtk also rewrites
// commit-graph, commit-tree, diff-files, diff-index, difftool, fetch-pack,
// show-branch and show-index — none of which a hardcoded list contained.
// ---------------------------------------------------------------------------
test("rtk may answer only where measured; every other invocation it rewrites is refused", async (t) => {
  if (!has("git")) return t.skip("git not installed");
  if (!has("rtk")) return t.skip("rtk not installed");

  const { allowed } = await measure();
  const allow = new Set(allowed);

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

  const fixture = buildFixture("failclosed");
  const violations = [];
  try {
    for (const sub of rewritten) {
      const bare = allow.has(sub);
      if (shapeVerdict(`git ${sub}`, fixture.repo) !== (bare ? "allowed" : "refused")) {
        violations.push(`${sub}: shape rule disagrees with the measurement on the bare form`);
      }
      if (!bare && guardVerdict(`git ${sub}`, fixture.repo) !== "real") {
        violations.push(`${sub}: not measured faithful but still reached rtk`);
      }
      // ...and the same subcommand may not become reachable by writing it after
      // a shell separator. This is the round-3 hole, generalised over the whole
      // surface instead of over the eleven subcommands someone thought of.
      if (!bare) {
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

  const refused = rewritten.filter((sub) => !allow.has(sub));
  t.diagnostic(
    `${subcommands.length} git subcommands scanned; rtk rewrites ${rewritten.length}; ` +
      `${refused.length} have no measured-faithful bare form and are refused: ${refused.join(" ")}`,
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
test("a refused invocation cannot be hidden behind a separator the guard did not anticipate", (t) => {
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
      // round 4: the same dodge, one level down — a refused FLAG behind a
      // separator, rather than a refused subcommand
      "git diff & git diff --summary",
      "git diff & git diff --exit-code",
      "git diff | git diff --dirstat",
      "sleep 1 & git diff -- main",
    ];
    for (const command of named) {
      const final = finalCommand(command, fixture.repo);
      for (const sub of ["branch", "log", "status", "commit"]) {
        if (routesToRtk(final, sub)) leaks.push(`${JSON.stringify(command)} -> ${final}`);
      }
      for (const flag of ["--summary", "--exit-code", "--dirstat"]) {
        if (final.includes(`rtk git diff ${flag}`)) leaks.push(`${JSON.stringify(command)} -> ${final}`);
      }
      if (/rtk git diff --( |$)/.test(final)) leaks.push(`${JSON.stringify(command)} -> ${final}`);
    }
  } finally {
    fixture.cleanup();
  }

  assert.deepEqual(leaks, [], "these strings hand a refused git invocation to rtk");
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

      // round 4: the flag, not the subcommand, is what makes it unsafe
      ["git diff --summary", "rtk git diff --summary", "unsafe"],
      ["git diff --exit-code", "rtk git diff --exit-code", "unsafe"],
      ["git diff --dirstat", "rtk git diff --dirstat", "unsafe"],
      ["git diff --cumulative", "rtk git diff --cumulative", "unsafe"],
      ["git diff --dirstat-by-file", "rtk git diff --dirstat-by-file", "unsafe"],
      ["git diff -X", "rtk git diff -X", "unsafe"],
      ["git diff --no-ignore-matching-lines", "rtk git diff --no-ignore-matching-lines", "unsafe"],
      // rtk drops `--`, so the operand is re-read as a revision
      ["git diff -- src/foo.ts", "rtk git diff -- src/foo.ts", "unsafe"],
      // an unmeasured COMBINATION of two individually faithful flags
      ["git diff --cached --stat", "rtk git diff --cached --stat", "unsafe"],
      // a flag spelled with a value, which no measurement covers
      ["git diff --stat=200", "rtk git diff --stat=200", "unsafe"],
      ["git diff --unified=5", "rtk git diff --unified=5", "unsafe"],
      // and the neighbours that ARE measured stay allowed
      ["git diff --stat -- src/foo.ts", "rtk git diff --stat -- src/foo.ts", "safe"],
      ["git diff --no-exit-code", "rtk git diff --no-exit-code", "safe"],
      ["git diff -w", "rtk git diff -w", "safe"],

      // git's own global options redirect git at a different repository or
      // override its config, and no case in the matrix carries one, so they are
      // unmeasured. Measured by hand at rtk 0.30.1: rtk DOES honour -C and
      // --git-dir today. That is exactly why they are refused — "checked once
      // by hand" is not what this guard runs on.
      ["git --no-pager diff", "rtk git --no-pager diff", "unsafe"],
      ["git -C /tmp diff", "rtk git -C /tmp diff", "unsafe"],
      ["git --git-dir /x/.git diff", "rtk git --git-dir /x/.git diff", "unsafe"],
      ["git -c a.b=c diff", "rtk git -c a.b=c diff", "unsafe"],
      ["git --literal-pathspecs diff", "rtk git --literal-pathspecs diff", "unsafe"],
      // an environment assignment in front of rtk is inherited by the git it
      // spawns, so it can point that git at another repository
      ["GIT_DIR=/x git diff", "GIT_DIR=/x rtk git diff", "unsafe"],
      ["GIT_WORK_TREE=/x git diff", "GIT_WORK_TREE=/x rtk git diff", "unsafe"],
      ["LC_ALL=C git diff", "LC_ALL=C rtk git diff", "unsafe"],
      // and a wrapper word on either side of rtk
      ["command git diff", "rtk command git diff", "unsafe"],
      ["env git diff", "rtk env git diff", "unsafe"],
      ["sudo git diff", "sudo rtk git diff", "unsafe"],

      // not a pure insertion: rtk changed something other than adding `rtk`
      ["git diff", "rtk git diff --stat", "unsafe"],
      ["git diff", "rtk git branch -r", "unsafe"],
      ["git diff", "rtk git diff && rm -rf /", "unsafe"],
      ["git status;git diff", "rtk git status; rtk git diff", "unsafe"],

      // the caller wrote rtk themselves; the hook must not put its name on it
      ["rtk git log", "rtk git log -1", "unsafe"],

      // opaque: only the shell knows what these are. Written on an ALLOWED
      // shape whose operand is not revision-shaped, so opacity is the only
      // thing left to refuse them — otherwise this pair proves nothing.
      ["git diff --stat $(echo HEAD)", "rtk git diff --stat $(echo HEAD)", "unsafe"],
      ["git diff --stat `echo HEAD`", "rtk git diff --stat `echo HEAD`", "unsafe"],
      ["git diff --stat $REV", "rtk git diff --stat $REV", "unsafe"],
      ["git diff --stat ${x}", "rtk git diff --stat ${x}", "unsafe"],
      ["git diff --stat <(cat f)", "rtk git diff --stat <(cat f)", "unsafe"],
      ["git diff $(echo HEAD)", "rtk git diff $(echo HEAD)", "unsafe"],
      ["git diff `echo HEAD`", "rtk git diff `echo HEAD`", "unsafe"],
      ["git diff $REV", "rtk git diff $REV", "unsafe"],

      // quoting is not structure
      ["g'i't diff", "rtk g'i't diff", "safe"],
      ["g'i't branch -r", "rtk g'i't branch -r", "unsafe"],
      ["git diff '--summary'", "rtk git diff '--summary'", "unsafe"],

      // an unresolvable git shape
      ["git", "rtk git", "unsafe"],
      ["git --wat diff", "rtk git --wat diff", "unsafe"],
      ["git -C", "rtk git -C", "unsafe"],

      // revisions never reach rtk, even on an allowed shape
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
      // On an ALLOWED shape, so the revision rule is the only thing refusing
      // them. Without these every case here is already refused by the shape
      // table and this test proves nothing about the revision rule.
      "git diff --stat main",
      "git diff --stat HEAD~1",
      "git diff --stat origin/main",
      "git diff --stat 928295e",
      "git diff --stat -- main",
      "git diff --stat -- HEAD",
      "git show-ref main",
      "git show-ref refs/heads/main",
      // object spellings that `rev-parse ^{commit}` does not resolve, so only
      // the colon rule catches them; all three reached rtk before it existed
      "git diff --stat HEAD:a.txt",
      "git diff --stat :/base",
      "git diff --stat :0:a.txt",
      "git diff --stat main^{tree}",
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

test("guard refuses the invocations measured unfaithful, with or without a revision", (t) => {
  if (!has("git")) return t.skip("git not installed");
  if (!has("rtk")) return t.skip("rtk not installed");
  const fixture = buildFixture("unfaithful");
  try {
    // None of these name a revision, so a revision-shaped heuristic would let
    // every one of them through. The first block is the round-2 gap (the
    // subcommand is what is wrong); the second is the round-4 gap (the
    // subcommand is fine and the FLAG is what is wrong), and no rule that
    // decides on the subcommand can refuse both.
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
      "git status -b --porcelain",
      "git stash list",
      "git worktree list",
      "git add -A",
      "git commit -m 'some message'",
      "git push origin main",
      "git pull origin main",
      "git fetch origin",
      "git log --oneline",

      "git diff --summary",
      "git diff --dirstat",
      "git diff --dirstat-by-file",
      "git diff --cumulative",
      "git diff -X",
      "git diff --exit-code",
      "git diff --no-ignore-matching-lines",
      "git diff --color",
      "git diff --color-words",
      "git diff -- src/foo.ts",
      "git diff -- .",
      "git diff --cached --stat",
      "git diff --stat=200",
      "git diff --output /tmp/x",
      "git diff --quiet --summary",
      "git show-ref --verify refs/heads/main",
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
      "git diff --name-status",
      "git diff --numstat",
      "git diff --shortstat",
      "git diff -w",
      "git diff --stat -- src/foo.ts",
      "git diff --stat | head -20",
      "git show-ref",
      "git show-ref --heads",
      "git diff-tree --stdin",
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

// ---------------------------------------------------------------------------
// Calibration: a predicate that cannot fail is not a measurement. Each check
// below is shown to fire on the defect it exists for AND to stay quiet on the
// benign case, so "106 shapes are faithful" means something.
// ---------------------------------------------------------------------------
test("the fidelity predicate fires on each defect and stays quiet otherwise", () => {
  const ok = { out: "a.txt\n", err: "", code: 0 };
  const same = (extra) => fidelity(ok, { ...ok, ...extra });

  assert.ok(same({}).faithful, "identical results must be faithful");
  assert.ok(!same({ code: 1 }).faithful, "a changed exit status must fail");
  assert.ok(!same({ err: "fatal: nope\n" }).faithful, "output moved to stderr must fail");
  assert.ok(!fidelity(ok, { out: "", err: "", code: 0 }).faithful, "an emptied answer must fail");
  assert.ok(
    !fidelity({ out: "", err: "", code: 0 }, { out: "ok\n", err: "", code: 0 }).faithful,
    "an invented answer must fail",
  );
  assert.ok(!fidelity(ok, { out: "b.txt\n", err: "", code: 0 }).faithful, "a swapped path must fail");
  assert.ok(!fidelity(ok, { out: "* \na.txt\n", err: "", code: 0 }).faithful, "a phantom entry must fail");

  // the truncation escape hatch: open only for rtk's own notice, and NOT for
  // the word appearing in a file's contents, which a diff can carry verbatim
  assert.equal(announcesTruncation("... (more changes truncated)"), true);
  assert.equal(announcesTruncation("[full diff: rtk git diff --no-compact]"), true);
  assert.equal(announcesTruncation("... +3 more"), true);
  assert.equal(announcesTruncation("+the changelog said the release notes were truncated"), false);
  assert.equal(announcesTruncation("-  const label = 'truncated';"), false);
  assert.equal(announcesTruncation(""), false);

  // and it really is what permits the only detail loss the guard allows
  const realDiff = { out: "+alpha\n+beta\n", err: "", code: 0 };
  assert.ok(!fidelity(realDiff, { out: "+alpha\n", err: "", code: 0 }).faithful, "silent drop must fail");
  assert.ok(
    fidelity(realDiff, { out: "+alpha\n... (more changes truncated)\n", err: "", code: 0 }).faithful,
    "announced drop is the one permitted loss",
  );
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
// The table describes one rtk build. Trusting it against a different build is
// the same defect as trusting an unmeasured flag: the evidence is about
// something else. Proved with a stub `rtk` on PATH rather than by uninstalling
// the real one, so the gate is checked in both directions.
// ---------------------------------------------------------------------------
test("a rewrite from an rtk build the table was not measured against is refused", (t) => {
  if (!has("git")) return t.skip("git not installed");
  const dir = mkdtempSync(join(tmpdir(), "rtk-guard-version-"));
  const measured = ask(["--measured-rtk-version"]);
  try {
    const stub = (version) => {
      const path = join(dir, "rtk");
      writeFileSync(
        path,
        `#!/usr/bin/env bash\n` +
          `case "$1" in\n` +
          `  --version) echo ${JSON.stringify(version)} ;;\n` +
          `  rewrite) printf 'rtk %s' "$2" ;;\n` +
          `esac\n`,
      );
      chmodSync(path, 0o755);
      return { ...process.env, PATH: `${dir}:${process.env.PATH}` };
    };

    assert.equal(
      finalCommand("git diff", dir, stub(measured)),
      "rtk git diff",
      "the measured rtk build must still be trusted",
    );
    for (const other of ["rtk 0.30.0", "rtk 0.31.0", "rtk 1.0.0", "rtk 0.30.1-beta", "rtk 0.30.1 (abc123)", "0.30.1"]) {
      assert.equal(
        finalCommand("git diff", dir, stub(other)),
        "git diff",
        `${JSON.stringify(other)} was never measured, so nothing may be handed to it`,
      );
    }
    assert.equal(
      finalCommand("git diff", dir, stub("")),
      "git diff",
      "an rtk that will not say what it is must not be trusted",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
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
test("every mutant of the guard is caught by this file", async (t) => {
  if (process.env.RTK_GUARD_MUTATION_CHILD) return t.skip("child run");
  if (!has("git")) return t.skip("git not installed");
  if (!has("rtk")) return t.skip("rtk not installed");

  await measure(); // so the children read the cache instead of re-measuring rtk

  const dir = mkdtempSync(join(tmpdir(), "rtk-guard-mutants-"));
  const survivors = [];
  try {
    for (const mutant of MUTANTS) {
      const path = writeMutant(mutant.name, join(dir, `${mutant.name}.sh`));
      // NODE_TEST_CONTEXT tells node it is already a test worker; inheriting it
      // makes the grandchild report through the parent and exit 0 whatever it
      // found, which would make this whole test vacuous.
      const env = {
        ...process.env,
        RTK_GUARD_HOOK_PATH: path,
        RTK_GUARD_MUTATION_CHILD: "1",
        RTK_GUARD_MEASUREMENT_CACHE: cachePath,
      };
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
