// Named, exact-string mutations of the rtk correctness guard.
//
// Why this file exists: the previous round published four RED recipes that
// prefixed `RTK_GUARD_ALLOWED_SUBCOMMANDS=...` to a `node --test` invocation.
// The hook assigns that variable unconditionally, so the environment was
// overwritten before use and every recipe came back GREEN for the next reader.
// The reds were real; the recipe was not runnable.
//
// A mutant is written to a separate file and the test is pointed at it with
// RTK_GUARD_HOOK_PATH. Nothing here weakens the production hook: the hook has
// no environment switch, and the copy under claude/hooks is never modified.
//
//   node tests/rtk-guard-mutants.mjs --list
//   node tests/rtk-guard-mutants.mjs <name> /tmp/mutant.sh
//   RTK_GUARD_HOOK_PATH=/tmp/mutant.sh node --test tests/rtk-rewrite.test.mjs
//
// Every mutation is an exact string replacement that must match EXACTLY ONCE.
// A mutant whose anchor has drifted is a hard error, not a silent no-op — a
// mutation harness that quietly stops mutating is the same fail-open defect
// this guard exists to prevent.

import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";

export const HOOK_SOURCE = resolve(import.meta.dirname, "..", "claude", "hooks", "rtk-rewrite.sh");

export const MUTANTS = [
  {
    name: "allow-branch",
    why: "re-opens the git branch family, the hole round 1 shipped",
    find: 'RTK_GUARD_ALLOWED_SUBCOMMANDS="diff show-ref diff-tree"',
    replace: 'RTK_GUARD_ALLOWED_SUBCOMMANDS="diff show-ref diff-tree branch"',
    caughtBy: "guard refuses the subcommands measured unfaithful",
  },
  {
    name: "empty-allowlist",
    why: "the dodge that makes a refusal-only test pass by refusing everything",
    find: 'RTK_GUARD_ALLOWED_SUBCOMMANDS="diff show-ref diff-tree"',
    replace: 'RTK_GUARD_ALLOWED_SUBCOMMANDS=""',
    caughtBy: "guard still lets rtk answer where it is faithful",
  },
  {
    name: "allow-unmeasured",
    why: "allows a subcommand rtk rewrites that no fidelity case has ever measured",
    find: 'RTK_GUARD_ALLOWED_SUBCOMMANDS="diff show-ref diff-tree"',
    replace: 'RTK_GUARD_ALLOWED_SUBCOMMANDS="diff show-ref diff-tree show-branch"',
    caughtBy: "rtk may answer only where measured",
  },
  {
    name: "unknown-route-is-safe",
    why: "the exact v5 defect: a token the walk cannot classify is treated as safe",
    find: "  RTK_GUARD_ROUTE=unknown\n  return 0",
    replace: "  RTK_GUARD_ROUTE=real\n  return 0",
    caughtBy: "walk refuses any rewrite it cannot prove",
  },
  {
    name: "skip-insertion-check",
    why: "drops the premise that makes the walk complete",
    find: "rtk_guard_is_pure_insertion() {\n",
    replace: "rtk_guard_is_pure_insertion() {\n  return 0 # MUTANT\n",
    caughtBy: "walk refuses any rewrite it cannot prove",
  },
  {
    name: "opaque-is-decidable",
    why: "lets a token that only exists after shell expansion count as decided",
    find: "rtk_guard_token_is_opaque() {\n",
    replace: "rtk_guard_token_is_opaque() {\n  return 1 # MUTANT\n",
    caughtBy: "walk refuses any rewrite it cannot prove",
  },
  {
    name: "no-revision-scan",
    why: "hands rtk a diff that names a revision, a shape no case has measured",
    find: "rtk_guard_args_name_revision() {\n",
    replace: "rtk_guard_args_name_revision() {\n  return 1 # MUTANT\n",
    caughtBy: "guard refuses any git command that names an explicit revision",
  },
];

export const writeMutant = (name, destination, source = HOOK_SOURCE) => {
  const mutant = MUTANTS.find((m) => m.name === name);
  if (!mutant) {
    throw new Error(`unknown mutant ${name}; known: ${MUTANTS.map((m) => m.name).join(" ")}`);
  }
  const text = readFileSync(source, "utf8");
  const occurrences = text.split(mutant.find).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `mutant ${name} anchor matched ${occurrences} times in ${source}, expected exactly 1 — ` +
        `the anchor has drifted and this mutant is no longer mutating anything`,
    );
  }
  writeFileSync(destination, text.replace(mutant.find, mutant.replace));
  chmodSync(destination, 0o755);
  return destination;
};

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === import.meta.filename;
if (invokedDirectly) {
  const [, , name, destination] = process.argv;
  if (name === "--list") {
    for (const m of MUTANTS) console.log(`${m.name.padEnd(24)} ${m.why}`);
  } else if (name && destination) {
    console.log(writeMutant(name, destination));
  } else {
    console.error("usage: node tests/rtk-guard-mutants.mjs <name> <destination> | --list");
    process.exitCode = 2;
  }
}
