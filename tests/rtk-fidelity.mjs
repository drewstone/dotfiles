// Shared fidelity predicate + command matrix for the rtk correctness guard.
//
// One definition, used by both the audit table and the test, so the property
// the hook claims and the property the test measures cannot drift apart.
//
// A token-saving filter may reformat and may drop DETAIL. It may never change
// WHICH object, ref or path git reports on, invent one, or hide one. Three
// checks, each independently sufficient to fail a command:
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

  return { faithful: reasons.length === 0, reasons };
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

// ---------------------------------------------------------------------------
// The matrix: every git subcommand rtk 0.30.1 rewrites, in the forms an agent
// actually types. Enumerated by running `rtk rewrite "git <sub>"` across the
// full git subcommand list; the 14 it rewrites are:
//   log status diff show branch stash worktree diff-tree
//   add commit push pull fetch show-ref
// Every one of those 14 appears below.
//
//   clean:    run against the clean fixture instead of the populated one
//   mutating: needs its own fixture pair, because running real git first would
//             change the state rtk is then measured against
//   setup:    git commands run in BOTH copies first. `git push` against an
//             already-pushed branch only prints "Everything up-to-date" and
//             looks faithful; the defect (the a1b2c3d..e4f5g6h ref update being
//             replaced by "ok main") only appears when there is something to
//             push, so the case has to create that state first.
// ---------------------------------------------------------------------------

const c = (args, opts = {}) => ({ args, clean: false, mutating: false, setup: [], ...opts });

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
  c(["branch", "-r"], { clean: true }),
  c(["branch", "--no-merged"], { clean: true }),

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
  c(["status"], { clean: true }),
  c(["status", "--short"], { clean: true }),
  c(["status", "--porcelain"], { clean: true }),

  c(["diff"]),
  c(["diff", "--stat"]),
  c(["diff", "--cached"]),
  c(["diff", "--name-only"]),
  c(["diff", "--name-status"]),
  c(["diff"], { clean: true }),

  c(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]),

  c(["show-ref"]),
  c(["show-ref", "--heads"]),
  c(["show-ref", "--tags"]),

  c(["stash", "list"]),
  c(["stash", "list"], { clean: true }),

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
  const shared = { false: null, true: null };
  const results = [];
  try {
    for (const entry of matrix) {
      let realOut;
      let rtkOut;
      if (entry.mutating) {
        const a = entry.clean ? buildCleanFixture("mutA") : buildFixture("mutA");
        const b = entry.clean ? buildCleanFixture("mutB") : buildFixture("mutB");
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
        const key = String(entry.clean);
        if (!shared[key]) {
          shared[key] = entry.clean ? buildCleanFixture("ro") : buildFixture("ro");
        }
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
