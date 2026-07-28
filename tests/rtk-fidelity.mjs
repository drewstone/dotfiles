// Shared fidelity predicate + command matrix for the rtk correctness guard.
//
// One definition, used by both the audit table and the test, so the property
// the hook claims and the property the test measures cannot drift apart.
//
// A token-saving filter may reformat and may drop DETAIL, and must say when it
// does. It may never change WHICH object, ref or path git reports on, invent
// one, or hide one. Four checks, each independently sufficient to fail a
// command:
//
//   1. EMPTINESS   real prints nothing  <=>  rtk prints nothing.
//                  Catches `branch -r` -> "* ", `stash list` -> "No stashes",
//                  and `status --porcelain` on a clean tree -> "ok", which
//                  inverts the standard `[ -z "$(git status --porcelain)" ]`
//                  clean-tree test from clean to dirty.
//   2. IDENTITY    the set of object names, ref names and paths rtk reports
//                  equals the set real git reports. Catches dropped merge
//                  commits, dropped branch shas, hidden origin/* refs,
//                  truncated file lists, a dropped new-commit sha, and
//                  `worktree list` rewriting /home/you/x to a literal ~/x.
//   3. NO PHANTOM  no rtk line is empty once git's branch decorations are
//                  stripped. git never emits such a line; rtk emits "* " to
//                  stand for a branch that does not exist.
//   4. NO SILENT   every changed line real git printed is either printed by rtk
//      TRUNCATION  too, or rtk says out loud that it truncated. This is the
//                  only place detail loss is permitted, and only because it is
//                  announced: on a 300-file diff rtk prints hunks for the first
//                  ~174 files and then "... (more changes truncated)" plus
//                  "[full diff: rtk git diff --no-compact]". Dropping the same
//                  lines without that notice is a defect.
//
// Checks 2 and 4 draw the line this guard cares about. NAMES are the answer to
// the question — "which files changed", "which branches exist" — so hiding one
// is a wrong answer however loudly it is announced, which is why `git status`
// truncating its untracked list to "... +2 more" fails check 2. Hunk TEXT is
// detail about an answer already given in full, so announced truncation of it
// is permitted. Silent truncation of it is not.
//
// Normalization applied to BOTH sides before check 2: `index <blob>..<blob>`
// diff headers are removed. They name blobs, not commits, refs or paths; no
// caller asks git "which blob", and any diff naming a revision is refused by
// the revision guard before it can reach rtk. Removing them from both sides is
// a stated normalization, not a per-command exemption.

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const stripIndexHeaders = (text) =>
  text
    .split("\n")
    .filter((line) => !/^index [0-9a-f]{7,40}\.\.[0-9a-f]{7,40}/.test(line))
    .join("\n");

// Object names, ref names and paths — the things a caller asks git to identify.
// A sorted set, so reordering and reformatting are allowed.
export const identityTokens = (text) => {
  const body = stripIndexHeaders(text);
  const tokens = new Set();
  for (const m of body.matchAll(/\b[0-9a-f]{7,40}\b/g)) tokens.add(`obj:${m[0].slice(0, 7)}`);
  for (const m of body.matchAll(
    /\b(?:origin\/)?(?:main|feature|unmerged-topic|extra\/br\d+|v1\.0)\b/g,
  ))
    tokens.add(`ref:${m[0]}`);
  for (const m of body.matchAll(/\b[a-z]+\d*\.txt\b/g)) tokens.add(`path:${m[0]}`);
  // Absolute and home-relative paths, compared literally: a filter that prints
  // `~/x` where git printed `/home/you/x` has changed the answer.
  for (const m of body.matchAll(/(?:~|\/(?:home|tmp))[\w./-]*/g)) tokens.add(`path:${m[0]}`);
  return [...tokens].sort();
};

// git never prints a branch-list line that names no branch.
export const phantomEntries = (text) =>
  text.split("\n").filter((line) => line.trim() !== "" && line.replace(/[*+\s]/g, "") === "");

// The +/- lines of a diff, with rtk's indentation and its per-hunk "+1 -0"
// counter excluded, so the two formats are comparable.
export const changedLines = (text) => {
  const lines = new Set();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!/^[+-]/.test(line)) continue;
    if (/^(\+\+\+|---)(\s|$)/.test(line)) continue; // file headers, not content
    if (/^\+\d+ -\d+$/.test(line)) continue; // rtk's per-hunk change counter
    lines.add(line);
  }
  return lines;
};

// rtk says so when it truncates. These are its exact notices, and the check
// above has teeth precisely because rtk does NOT print them when it is showing
// everything — verified on a one-line diff, which carries neither.
export const announcesTruncation = (text) =>
  /\(more changes truncated\)|--no-compact|\.\.\. \+\d+ more|\btruncated\b/.test(text);

export const fidelity = (real, rtkOut) => {
  const reasons = [];

  const realEmpty = real.trim() === "";
  const rtkEmpty = rtkOut.trim() === "";
  if (realEmpty !== rtkEmpty) {
    reasons.push(
      realEmpty
        ? `real git printed nothing, rtk printed ${JSON.stringify(rtkOut.trim().slice(0, 48))}`
        : "real git printed output, rtk printed nothing",
    );
  }

  const realTokens = identityTokens(real);
  const rtkTokens = identityTokens(rtkOut);
  const hidden = realTokens.filter((t) => !rtkTokens.includes(t));
  const invented = rtkTokens.filter((t) => !realTokens.includes(t));
  if (hidden.length) reasons.push(`hidden by rtk: ${hidden.join(" ")}`);
  if (invented.length) reasons.push(`invented by rtk: ${invented.join(" ")}`);

  const phantoms = phantomEntries(rtkOut);
  if (phantoms.length) reasons.push(`${phantoms.length} phantom entry line(s) naming no ref`);

  const rtkChanged = changedLines(rtkOut);
  const droppedLines = [...changedLines(real)].filter((line) => !rtkChanged.has(line));
  const truncationAnnounced = announcesTruncation(rtkOut);
  if (droppedLines.length && !truncationAnnounced) {
    reasons.push(
      `${droppedLines.length} changed line(s) dropped with no truncation notice, ` +
        `e.g. ${JSON.stringify(droppedLines[0].slice(0, 40))}`,
    );
  }

  return {
    faithful: reasons.length === 0,
    reasons,
    droppedLines: droppedLines.length,
    truncationAnnounced,
  };
};

// ---------------------------------------------------------------------------
// Fixtures.
//
// Built under $HOME rather than /tmp on purpose: rtk's `worktree list` filter
// rewrites a leading /home/<user> to a literal `~`, which is invisible to any
// fixture living in /tmp. Content and author/committer dates are fixed, so two
// independently built copies have byte-identical object names and a mutating
// command can be run against real git in one and rtk in the other.
// ---------------------------------------------------------------------------

const FIXED_DATE = "2026-01-01T00:00:00+0000";

const FIXTURE_HOME = join(homedir(), ".cache", "rtk-guard-fixtures");

const fixtureEnv = () => ({
  ...process.env,
  GIT_PAGER: "cat",
  GIT_AUTHOR_DATE: FIXED_DATE,
  GIT_COMMITTER_DATE: FIXED_DATE,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "t@example.invalid",
});

const newRoot = (label) => {
  mkdirSync(FIXTURE_HOME, { recursive: true });
  return mkdtempSync(join(FIXTURE_HOME, `${label}-`));
};

export const buildFixture = (label) => {
  const root = newRoot(label);
  const remote = join(root, "remote.git");
  const repo = join(root, "repo");
  const env = fixtureEnv();
  const git = (args, cwd = repo) => {
    const r = spawnSync("git", args, { cwd, encoding: "utf8", env });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
    return r.stdout.trim();
  };

  spawnSync("git", ["init", "--quiet", "--bare", "--initial-branch=main", remote], { env });
  spawnSync("git", ["init", "--quiet", "--initial-branch=main", repo], { env });
  // inherited global hooks write to stdout and would corrupt every comparison
  git(["config", "core.hooksPath", "/dev/null"]);
  git(["config", "user.email", "t@example.invalid"]);
  git(["config", "user.name", "Test"]);
  git(["config", "commit.gpgsign", "false"]);
  git(["remote", "add", "origin", remote]);

  writeFileSync(join(repo, "a.txt"), "a\n");
  git(["add", "-A"]);
  git(["commit", "--quiet", "-m", "base"]);

  git(["checkout", "--quiet", "-b", "feature"]);
  writeFileSync(join(repo, "b.txt"), "b\n");
  git(["add", "-A"]);
  git(["commit", "--quiet", "-m", "feature work"]);

  git(["checkout", "--quiet", "main"]);
  writeFileSync(join(repo, "c.txt"), "c\n");
  git(["add", "-A"]);
  git(["commit", "--quiet", "-m", "main work"]);
  // a merge commit: the shape rtk's `git log` filter drops from the walk
  git(["merge", "--quiet", "--no-ff", "-m", "Merge feature into main", "feature"]);

  // an unmerged branch, so `branch --no-merged` has a real non-empty answer
  git(["checkout", "--quiet", "-b", "unmerged-topic"]);
  writeFileSync(join(repo, "d.txt"), "d\n");
  git(["add", "-A"]);
  git(["commit", "--quiet", "-m", "topic work"]);
  git(["checkout", "--quiet", "main"]);

  git(["tag", "v1.0"]);
  git(["push", "--quiet", "origin", "main", "feature", "unmerged-topic"]);
  for (let n = 1; n <= 10; n += 1) {
    git(["branch", `extra/br${n}`, "main"]);
    git(["push", "--quiet", "origin", `extra/br${n}`]);
  }
  git(["fetch", "--quiet", "origin"]);

  // a linked worktree, so `worktree list` has more than one row
  git(["worktree", "add", "--quiet", join(root, "wt"), "feature"]);

  // enough untracked files to cross rtk's list-truncation threshold
  for (let n = 1; n <= 12; n += 1) writeFileSync(join(repo, `n${n}.txt`), "new\n");
  writeFileSync(join(repo, "staged.txt"), "staged\n");
  git(["add", "staged.txt"]);
  writeFileSync(join(repo, "a.txt"), "a\nmore\n");

  return {
    root,
    repo,
    env,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
};

// A clean copy: nothing staged, modified or untracked, no stashes, no remotes.
// This is where a filter that renders "nothing to report" as a word instead of
// silence gets caught.
export const buildCleanFixture = (label) => {
  const root = newRoot(label);
  const repo = join(root, "repo");
  const env = fixtureEnv();
  spawnSync("git", ["init", "--quiet", "--initial-branch=main", repo], { env });
  const git = (args) => spawnSync("git", args, { cwd: repo, encoding: "utf8", env });
  git(["config", "core.hooksPath", "/dev/null"]);
  git(["config", "user.email", "t@example.invalid"]);
  git(["config", "user.name", "Test"]);
  git(["config", "commit.gpgsign", "false"]);
  writeFileSync(join(repo, "a.txt"), "a\n");
  git(["add", "-A"]);
  git(["commit", "--quiet", "-m", "base"]);
  return { root, repo, env, cleanup: () => rmSync(root, { recursive: true, force: true }) };
};

// 300 modified files, every changed line distinct. This is the scale at which
// rtk's diff filter stops printing hunks and starts truncating, so it is where
// the two claims the hook's header makes about `diff` — every path preserved,
// truncation announced — are actually exercised. A one-file fixture proves
// neither, which is why the header used to overstate what was measured.
export const LARGE_DIFF_FILES = 300;

export const buildLargeDiffFixture = (label) => {
  const root = newRoot(label);
  const repo = join(root, "repo");
  const env = fixtureEnv();
  spawnSync("git", ["init", "--quiet", "--initial-branch=main", repo], { env });
  const git = (args) => spawnSync("git", args, { cwd: repo, encoding: "utf8", env });
  git(["config", "core.hooksPath", "/dev/null"]);
  git(["config", "user.email", "t@example.invalid"]);
  git(["config", "user.name", "Test"]);
  git(["config", "commit.gpgsign", "false"]);
  for (let n = 1; n <= LARGE_DIFF_FILES; n += 1) {
    writeFileSync(join(repo, `big${n}.txt`), `alpha\nbefore-${n}\nomega\n`);
  }
  git(["add", "-A"]);
  git(["commit", "--quiet", "-m", "base"]);
  for (let n = 1; n <= LARGE_DIFF_FILES; n += 1) {
    writeFileSync(join(repo, `big${n}.txt`), `alpha\nafter-${n}\nomega\n`);
  }
  return { root, repo, env, cleanup: () => rmSync(root, { recursive: true, force: true }) };
};

const FIXTURE_BUILDERS = {
  default: buildFixture,
  clean: buildCleanFixture,
  large: buildLargeDiffFixture,
};

// ---------------------------------------------------------------------------
// The matrix: every git subcommand rtk 0.30.1 rewrites, in the forms an agent
// actually types. Enumerated by running `rtk rewrite "git <sub>"` across the
// full git subcommand list; the 14 it rewrites are:
//   log status diff show branch stash worktree diff-tree
//   add commit push pull fetch show-ref
// Every one of those 14 appears below.
//
//   fixture:  which repo shape to run in — "default", "clean" (nothing staged,
//             modified or untracked) or "large" (300 modified files)
//   mutating: needs its own fixture pair, because running real git first would
//             change the state rtk is then measured against
//   setup:    git commands run in BOTH copies first. `git push` against an
//             already-pushed branch only prints "Everything up-to-date" and
//             looks faithful; the defect (the a1b2c3d..e4f5g6h ref update being
//             replaced by "ok main") only appears when there is something to
//             push, so the case has to create that state first.
// ---------------------------------------------------------------------------

const c = (args, opts = {}) => ({ args, fixture: "default", mutating: false, setup: [], ...opts });

export const MATRIX = [
  c(["branch"]),
  c(["branch", "-v"]),
  c(["branch", "-vv"]),
  c(["branch", "-a"]),
  c(["branch", "-r"]),
  c(["branch", "--no-merged"]),
  c(["branch", "--merged"]),
  c(["branch", "--list", "extra/*"]),
  c(["branch", "--show-current"]),
  c(["branch", "-r"], { fixture: "clean" }),
  c(["branch", "--no-merged"], { fixture: "clean" }),

  c(["log", "--oneline", "-5"]),
  c(["log", "-1"]),
  c(["log", "--merges", "--oneline"]),
  c(["log", "--oneline", "--all"]),

  c(["show", "--stat", "HEAD"]),
  c(["show", "--name-only", "HEAD"]),

  c(["status"]),
  c(["status", "--short"]),
  c(["status", "--porcelain"]),
  c(["status", "-b", "--porcelain"]),
  c(["status"], { fixture: "clean" }),
  c(["status", "--short"], { fixture: "clean" }),
  c(["status", "--porcelain"], { fixture: "clean" }),

  c(["diff"]),
  c(["diff", "--stat"]),
  c(["diff", "--cached"]),
  c(["diff", "--name-only"]),
  c(["diff", "--name-status"]),
  c(["diff"], { fixture: "clean" }),
  // The scale at which rtk's diff filter truncates. Without these three the
  // matrix only ever measured a one-file diff, and the hook's claim about what
  // `diff` preserves was true of the fixture and false of a real diff.
  c(["diff"], { fixture: "large" }),
  c(["diff", "--stat"], { fixture: "large" }),
  c(["diff", "--name-only"], { fixture: "large" }),

  c(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]),

  c(["show-ref"]),
  c(["show-ref", "--heads"]),
  c(["show-ref", "--tags"]),

  c(["stash", "list"]),
  c(["stash", "list"], { fixture: "clean" }),

  c(["worktree", "list"]),

  c(["add", "-A"], { mutating: true }),
  c(["add", "n1.txt"], { mutating: true }),
  c(["commit", "-m", "staged commit"], { mutating: true }),
  c(["push", "origin", "main"], { mutating: true }),
  c(["push", "origin", "main"], {
    mutating: true,
    setup: [["commit", "--quiet", "-m", "staged commit"]],
  }),
  c(["push", "--dry-run", "origin", "main"], {
    mutating: true,
    setup: [["commit", "--quiet", "-m", "staged commit"]],
  }),
  c(["pull", "origin", "main"], { mutating: true }),
  c(["fetch", "origin"], { mutating: true }),
  c(["fetch", "--dry-run", "origin"], { mutating: true }),
];

export const subcommandOf = (entry) => entry.args[0];

const capture = (bin, args, repo, env) => {
  const r = spawnSync(bin, args, { cwd: repo, encoding: "utf8", env });
  return (r.stdout || "") + (r.stderr || "");
};

// Runs the whole matrix. Read-only cases share one fixture per shape; mutating
// cases get an independent, byte-identical pair so real git and rtk each act on
// untouched state.
export const runMatrix = (matrix = MATRIX) => {
  const shared = {};
  const results = [];
  const build = (entry, label) => {
    const builder = FIXTURE_BUILDERS[entry.fixture];
    if (!builder) throw new Error(`matrix entry names an unknown fixture: ${entry.fixture}`);
    return builder(label);
  };
  try {
    for (const entry of matrix) {
      let realOut;
      let rtkOut;
      if (entry.mutating) {
        const a = build(entry, "mutA");
        const b = build(entry, "mutB");
        try {
          for (const step of entry.setup) {
            capture("git", step, a.repo, a.env);
            capture("git", step, b.repo, b.env);
          }
          realOut = capture("git", ["--no-pager", ...entry.args], a.repo, a.env);
          rtkOut = capture("rtk", ["git", ...entry.args], b.repo, b.env);
        } finally {
          a.cleanup();
          b.cleanup();
        }
      } else {
        const key = entry.fixture;
        if (!shared[key]) shared[key] = build(entry, "ro");
        const f = shared[key];
        realOut = capture("git", ["--no-pager", ...entry.args], f.repo, f.env);
        rtkOut = capture("rtk", ["git", ...entry.args], f.repo, f.env);
      }
      results.push({
        entry,
        command: `git ${entry.args.join(" ")}`,
        realOut,
        rtkOut,
        ...fidelity(realOut, rtkOut),
      });
    }
  } finally {
    for (const f of Object.values(shared)) if (f) f.cleanup();
  }
  return results;
};
