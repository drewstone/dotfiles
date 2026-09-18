// Shared fidelity predicate + invocation matrix for the rtk correctness guard.
//
// One definition, used by both the audit table and the test, so the property
// the hook claims and the property the test measures cannot drift apart.
//
// A token-saving filter may reformat and may drop DETAIL, and must say when it
// does. It may never change WHICH object, ref or path git reports on, invent
// one, or hide one. Six checks, each independently sufficient to fail a case:
//
//   1. EMPTINESS   real prints nothing  <=>  rtk prints nothing.
//                  Catches `branch -r` -> "* ", `stash list` -> "No stashes",
//                  `status --porcelain` on a clean tree -> "ok", and
//                  `diff --summary` on a content-only change -> a --stat
//                  listing. Each inverts a standard shell test from "nothing
//                  to report" to "something to report".
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
//   5. EXIT STATUS real and rtk exit with the same code. The exit status IS the
//                  answer for `git diff --quiet` and `git diff --exit-code`, and
//                  for every `if git ...; then` an agent writes. A filter that
//                  reproduces the text and changes the status has still changed
//                  the answer. (Measured: `git diff --no-ignore-matching-lines`
//                  exits 0 under real git and 1 under rtk.)
//   6. STREAM      real and rtk agree on whether anything went to stderr.
//                  `cmd 2>/dev/null` and `cmd >file` are both routine, so a
//                  filter that moves git's answer to the other stream, or
//                  invents a diagnostic git never emitted, has changed what the
//                  caller receives even when the concatenation matches.
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

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

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
  text
    .split("\n")
    .some(
      (line) =>
        /\(more changes truncated\)\s*$/.test(line) ||
        /\[full diff: rtk .*--no-compact\]/.test(line) ||
        /^\s*\.\.\. \+\d+ more$/.test(line),
    );

// Both arguments are {out, err, code}: the exit status and the stream a byte
// arrived on are part of the answer, not decoration around it.
export const fidelity = (real, rtkOut) => {
  const reasons = [];

  const realEmpty = real.out.trim() === "";
  const rtkEmpty = rtkOut.out.trim() === "";
  if (realEmpty !== rtkEmpty) {
    reasons.push(
      realEmpty
        ? `real git printed nothing, rtk printed ${JSON.stringify(rtkOut.out.trim().slice(0, 48))}`
        : "real git printed output, rtk printed nothing",
    );
  }

  const realTokens = identityTokens(real.out);
  const rtkTokens = identityTokens(rtkOut.out);
  const hidden = realTokens.filter((t) => !rtkTokens.includes(t));
  const invented = rtkTokens.filter((t) => !realTokens.includes(t));
  if (hidden.length) reasons.push(`hidden by rtk: ${hidden.slice(0, 6).join(" ")}`);
  if (invented.length) reasons.push(`invented by rtk: ${invented.slice(0, 6).join(" ")}`);

  const phantoms = phantomEntries(rtkOut.out);
  if (phantoms.length) reasons.push(`${phantoms.length} phantom entry line(s) naming no ref`);

  const rtkChanged = changedLines(rtkOut.out);
  const droppedLines = [...changedLines(real.out)].filter((line) => !rtkChanged.has(line));
  const truncationAnnounced = announcesTruncation(rtkOut.out);
  if (droppedLines.length && !truncationAnnounced) {
    reasons.push(
      `${droppedLines.length} changed line(s) dropped with no truncation notice, ` +
        `e.g. ${JSON.stringify(droppedLines[0].slice(0, 40))}`,
    );
  }

  if (real.code !== rtkOut.code) {
    reasons.push(`real git exited ${real.code}, rtk exited ${rtkOut.code}`);
  }

  // Which STREAM a byte arrives on is part of the answer: `cmd 2>/dev/null`
  // and `cmd >file` are both routine, and a filter that moves git's answer from
  // stdout to stderr (or invents a diagnostic git never emitted) has changed
  // what the caller receives even when the concatenation matches.
  const realErr = (real.err ?? "").trim() === "";
  const rtkErr = (rtkOut.err ?? "").trim() === "";
  if (realErr !== rtkErr) {
    reasons.push(
      realErr
        ? `real git wrote nothing to stderr, rtk wrote ${JSON.stringify((rtkOut.err ?? "").trim().slice(0, 48))}`
        : "real git wrote to stderr, rtk wrote nothing there",
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
// Fixtures. Each is a REGIME — a repository state that puts the filters into a
// different mode. A shape measured in one regime says nothing about the others,
// which is why allowance below requires all three:
//
//   clean    nothing staged, modified or untracked; no stashes, no remotes.
//            Where a filter that renders "nothing to report" as a word instead
//            of silence gets caught.
//   default  merges, branches, remote-tracking refs, a tag, a linked worktree,
//            staged + modified + untracked files.
//   large    300 modified files: the scale at which rtk's diff filter stops
//            printing hunks and starts truncating.
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
  // read-only cases share a fixture and run concurrently; an opportunistic
  // index refresh from two processes at once would race on .git/index
  GIT_OPTIONAL_LOCKS: "0",
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

export const REGIMES = ["clean", "default", "large"];

const FIXTURE_BUILDERS = {
  default: buildFixture,
  clean: buildCleanFixture,
  large: buildLargeDiffFixture,
};

// Placeholders resolved per regime, so one case description measures the same
// SHAPE in every regime even though the file and ref names differ.
const PLACEHOLDERS = {
  clean: { "%PATH%": "a.txt", "%PATH2%": "a.txt", "%REF%": "main" },
  default: { "%PATH%": "a.txt", "%PATH2%": "c.txt", "%REF%": "main" },
  large: { "%PATH%": "big1.txt", "%PATH2%": "big2.txt", "%REF%": "main" },
};

const resolveArgs = (args, regime) => args.map((a) => PLACEHOLDERS[regime][a] ?? a);

// ---------------------------------------------------------------------------
// THE SHAPE. rtk's unit of failure is not the subcommand — it is the exact
// invocation. `git diff` is faithful; `git diff --summary` prints a --stat
// listing where real git prints nothing; `git diff -- main` makes rtk diff
// against the BRANCH main because it drops the `--` separator. So the unit of
// trust is the shape:
//
//   <subcommand> [sorted flags] [--] [<path>]
//
// Flags are sorted so argument order does not matter; operands are abstracted
// to `<path>` because their VALUE is a pathspec, and any operand that names a
// revision is refused by a separate rule before it reaches the allowlist. A
// `--` anywhere is recorded, because rtk's handling of it is itself a defect.
//
// The hook computes this same key from the command line it is asked about.
// ---------------------------------------------------------------------------
export const shapeKeyOf = (sub, args) => {
  const flags = [];
  let dashDash = false;
  let operand = false;
  for (const arg of args) {
    if (dashDash) {
      operand = true;
      continue;
    }
    if (arg === "--") {
      dashDash = true;
      continue;
    }
    if (arg.startsWith("-")) {
      flags.push(sub === "show-ref" ? arg.replace(/^--(no-)?branches$/, "--$1heads") : arg);
    }
    else operand = true;
  }
  const parts = [sub, ...[...flags].sort()];
  if (dashDash) parts.push("--");
  if (operand) parts.push("<path>");
  return parts.join(" ");
};

// ---------------------------------------------------------------------------
// The flag surface, taken from git's OWN enumerations rather than a hand list:
// `git <sub> -h` inside a repo, `git <sub> -h` outside one (git prints a
// different synopsis in each), and `git <sub> --git-completion-helper`.
//
// This enumeration decides what gets MEASURED. It never decides what gets
// TRUSTED — measurement does, and a flag no enumeration mentions is simply
// never measured, which makes it a refusal. So an incomplete enumeration costs
// token savings and cannot cost correctness. That is the difference between
// this list and every list the earlier versions of this guard failed open on.
// ---------------------------------------------------------------------------
export const flagSurfaceOf = (sub, repo) => {
  const found = new Set();
  const add = (text) => {
    for (const m of text.matchAll(
      /(?<![\w=-])(--\[no-\][a-z0-9][a-z0-9-]*|--[a-z0-9][a-z0-9-]*|-[a-zA-Z])(?![\w-])/g,
    )) {
      const flag = m[0];
      if (flag.startsWith("--[no-]")) {
        found.add(`--${flag.slice(7)}`);
        found.add(`--no-${flag.slice(7)}`);
        continue;
      }
      found.add(flag);
    }
  };
  for (const cwd of [repo, "/"]) {
    const r = spawnSync("git", [sub, "-h"], { encoding: "utf8", cwd });
    add((r.stdout || "") + (r.stderr || ""));
  }
  const helper = spawnSync("git", [sub, "--git-completion-helper"], { encoding: "utf8", cwd: repo });
  // `--stat-width=` in the completion list means "takes a value"; measuring the
  // bare spelling is what proves git rejects it without one.
  add(((helper.stdout || "") + (helper.stderr || "")).replace(/=/g, " "));
  // Git help can hide one spelling. Measure both before sharing their shape.
  if (sub === "show-ref") {
    for (const flag of ["--heads", "--no-heads", "--branches", "--no-branches"]) found.add(flag);
  }
  return [...found].sort();
};

// Subcommands whose flag surface is swept. Sweeping more can only ADD measured
// shapes; not sweeping one costs token savings, never correctness, because an
// unmeasured shape is refused. These three are the ones with no measured defect
// in their bare form, so they are the only ones where a sweep can pay.
export const SWEPT_SUBCOMMANDS = ["diff", "show-ref", "diff-tree"];

const c = (args, opts = {}) => ({
  args,
  regime: "default",
  mutating: false,
  setup: [],
  namesRevision: false,
  generated: false,
  refOperand: false,
  ...opts,
});

// Hand-written cases: the standing evidence about the subcommands rtk rewrites,
// plus the operand and separator shapes a flag sweep cannot express. Every one
// of the 14 subcommands rtk 0.30.1 rewrites appears here.
const HAND_WRITTEN = [
  c(["branch"]),
  c(["branch", "-v"]),
  c(["branch", "-vv"]),
  c(["branch", "-a"]),
  c(["branch", "-r"]),
  c(["branch", "--no-merged"]),
  c(["branch", "--merged"]),
  c(["branch", "--list", "extra/*"]),
  c(["branch", "--show-current"]),
  c(["branch", "-r"], { regime: "clean" }),
  c(["branch", "--no-merged"], { regime: "clean" }),

  c(["log", "--oneline", "-5"]),
  c(["log", "-1"]),
  c(["log", "--merges", "--oneline"]),
  c(["log", "--oneline", "--all"]),

  c(["show", "--stat", "HEAD"], { namesRevision: true }),
  c(["show", "--name-only", "HEAD"], { namesRevision: true }),

  c(["status"]),
  c(["status", "--short"]),
  c(["status", "--porcelain"]),
  c(["status", "-b", "--porcelain"]),
  c(["status"], { regime: "clean" }),
  c(["status", "--short"], { regime: "clean" }),
  c(["status", "--porcelain"], { regime: "clean" }),

  c(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"], { namesRevision: true }),

  c(["stash", "list"]),
  c(["stash", "list"], { regime: "clean" }),

  c(["worktree", "list"]),

  c(["add", "-A"], { mutating: true }),
  c(["add", "n1.txt"], { mutating: true }),
  c(["commit", "-m", "staged commit"], { mutating: true }),
  c(["push", "origin", "main"], { mutating: true, namesRevision: true }),
  c(["push", "origin", "main"], {
    mutating: true,
    namesRevision: true,
    setup: [["commit", "--quiet", "-m", "staged commit"]],
  }),
  c(["push", "--dry-run", "origin", "main"], {
    mutating: true,
    namesRevision: true,
    setup: [["commit", "--quiet", "-m", "staged commit"]],
  }),
  c(["pull", "origin", "main"], { mutating: true, namesRevision: true }),
  c(["fetch", "origin"], { mutating: true }),
  c(["fetch", "--dry-run", "origin"], { mutating: true }),
];

// Operand and separator shapes, measured in every regime. `git diff -- %REF%`
// is the case that proves rtk drops `--`: real git reports on the PATH named
// `main` (which does not exist, so: nothing), rtk reports on the BRANCH main.
//
// Every shape with an operand carries a `%REF%` variant, because a name that is
// both a valid pathspec and a valid revision is precisely where a filter can
// change WHICH object it reports on. `shapeVerdicts` enforces that: an operand
// shape with no ref-named measurement is refused for lack of coverage, so this
// list cannot fail open by someone adding a shape and forgetting the case.
const OPERAND_SHAPES = [
  ["diff", "%PATH%"],
  ["diff", "%PATH%", "%PATH2%"],
  ["diff", "no-such-file.txt"],
  ["diff", "%REF%"],
  ["diff", "--", "%PATH%"],
  ["diff", "--", "%REF%"],
  ["diff", "--", "no-such-file.txt"],
  ["diff", "--stat", "%PATH%"],
  ["diff", "--stat", "%PATH%", "%PATH2%"],
  ["diff", "--stat", "no-such-file.txt"],
  ["diff", "--stat", "%REF%"],
  ["diff", "--stat", "--", "%PATH%"],
  ["diff", "--stat", "--", "%PATH%", "%PATH2%"],
  ["diff", "--stat", "--", "no-such-file.txt"],
  ["diff", "--stat", "--", "%REF%"],
  ["show-ref", "%REF%", "v1.0"],
  ["show-ref", "%REF%"],
  ["show-ref", "no-such-ref"],
];

const buildMatrix = () => {
  const repo = process.cwd();
  const entries = [...HAND_WRITTEN];
  for (const regime of REGIMES) {
    for (const args of OPERAND_SHAPES) {
      const ref = args.includes("%REF%");
      entries.push(c(args, { regime, generated: true, refOperand: ref, namesRevision: ref }));
    }
    for (const sub of SWEPT_SUBCOMMANDS) {
      entries.push(c([sub], { regime, generated: true }));
      for (const flag of flagSurfaceOf(sub, repo)) {
        entries.push(c([sub, flag], { regime, generated: true }));
      }
    }
  }
  return entries;
};

export const MATRIX = buildMatrix();

export const subcommandOf = (entry) => entry.args[0];

export const shapeOf = (entry) =>
  shapeKeyOf(subcommandOf(entry), resolveArgs(entry.args.slice(1), entry.regime));

export const commandOf = (entry) =>
  ["git", subcommandOf(entry), ...resolveArgs(entry.args.slice(1), entry.regime)].join(" ");

const run = (bin, args, opts) =>
  new Promise((res) => {
    // stdin is /dev/null: `git diff-tree --stdin` must see EOF rather than hang,
    // and a child that exits before a write completes must not raise EPIPE here.
    const child = spawn(bin, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("close", (code, signal) =>
      res({ out: stdout + stderr, err: stderr, code: signal ? `signal:${signal}` : (code ?? 0) }),
    );
    child.on("error", (err) => res({ out: String(err), err: String(err), code: "spawn-failed" }));
  });

const pool = async (items, width, worker) => {
  let next = 0;
  const run1 = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, run1));
};

// Runs the whole matrix. Read-only cases share one fixture per regime; mutating
// cases get an independent, byte-identical pair so real git and rtk each act on
// untouched state.
export const runMatrix = async (matrix = MATRIX) => {
  const shared = {};
  for (const regime of REGIMES) shared[regime] = FIXTURE_BUILDERS[regime](`ro-${regime}`);
  const results = new Array(matrix.length);
  try {
    await pool(matrix, 12, async (entry, index) => {
      const args = resolveArgs(entry.args, entry.regime);
      let realOut;
      let rtkOut;
      if (entry.mutating) {
        const a = FIXTURE_BUILDERS[entry.regime]("mutA");
        const b = FIXTURE_BUILDERS[entry.regime]("mutB");
        try {
          for (const step of entry.setup) {
            await run("git", step, { cwd: a.repo, env: a.env });
            await run("git", step, { cwd: b.repo, env: b.env });
          }
          realOut = await run("git", ["--no-pager", ...args], { cwd: a.repo, env: a.env });
          rtkOut = await run("rtk", ["git", ...args], { cwd: b.repo, env: b.env });
        } finally {
          a.cleanup();
          b.cleanup();
        }
      } else {
        const f = shared[entry.regime];
        [realOut, rtkOut] = await Promise.all([
          run("git", ["--no-pager", ...args], { cwd: f.repo, env: f.env }),
          run("rtk", ["git", ...args], { cwd: f.repo, env: f.env }),
        ]);
      }
      results[index] = {
        entry,
        command: commandOf(entry),
        shape: shapeOf(entry),
        regime: entry.regime,
        realOut,
        rtkOut,
        ...fidelity(realOut, rtkOut),
      };
    });
  } finally {
    for (const f of Object.values(shared)) if (f) f.cleanup();
  }
  return results;
};

// ---------------------------------------------------------------------------
// ALLOWANCE, derived. A shape may be handed to rtk only when all four hold —
// and every one of them is a fact about a measurement, not a name on a list:
//
//   1. it was measured in EVERY regime. A shape measured only on a dirty tree
//      says nothing about a clean one; `git status -b --porcelain` is faithful
//      in the default regime and prints "ok" on a clean tree, and the earlier
//      allowlist had no way to notice.
//   1b. if it takes an operand, it was measured in every regime with an operand
//      that is ALSO a valid revision. A pathspec that is spellable as a ref is
//      the one input where a filter can silently answer about a different
//      object, and it is how `git diff -- main` was caught reporting on the
//      branch instead of the file.
//   2. git itself accepted it everywhere. An invocation git rejects (128/129)
//      exercises git's argument parser, not rtk's filter, so it measured
//      nothing about rtk. This is what keeps every value-taking flag
//      (`--output`, `-S`, `--stat-width`, ...) off the list: measured without
//      its value, git rejects it, so the flag is undecided and therefore
//      refused.
//   3. rtk exited exactly as git did, in every regime.
//   4. the fidelity predicate passed, in every regime.
//
// Anything else — including a shape nobody thought to measure — is refused.
// ---------------------------------------------------------------------------
export const GIT_USAGE_EXITS = [128, 129];

export const shapeVerdicts = (results) => {
  const byShape = new Map();
  for (const r of results) {
    if (!byShape.has(r.shape)) byShape.set(r.shape, []);
    byShape.get(r.shape).push(r);
  }
  const verdicts = new Map();
  for (const [shape, cases] of byShape) {
    const regimes = new Set(cases.map((r) => r.regime));
    const missing = REGIMES.filter((regime) => !regimes.has(regime));
    if (missing.length) {
      verdicts.set(shape, { allowed: false, why: `not measured in: ${missing.join(",")}`, cases });
      continue;
    }
    if (shape.includes("<path>")) {
      const uncovered = REGIMES.filter(
        (regime) => !cases.some((r) => r.regime === regime && r.entry.refOperand),
      );
      if (uncovered.length) {
        verdicts.set(shape, {
          allowed: false,
          why: `takes an operand but was never measured with a ref-named one in: ${uncovered.join(",")}`,
          cases,
        });
        continue;
      }
    }
    // git must have ACCEPTED the invocation somewhere in every regime. An
    // invocation git rejects exercises git's argument parser, not rtk's filter,
    // so it measures nothing about rtk — which is what keeps every value-taking
    // flag (`--output`, `-S`, `--stat-width`, `--diff-algorithm`, ...) off the
    // table without anyone enumerating them: spelled without a value, git
    // rejects them in every regime, so no accepted case exists.
    //
    // The rejected cases are still REQUIRED to be faithful below. That is the
    // difference between "this told us nothing" and "this told us something
    // bad": `git diff --stat no-such-file.txt` is a real answer both sides must
    // agree on, while `git diff --output` is git printing its own usage.
    const unexercised = REGIMES.filter(
      (regime) =>
        !cases.some((r) => r.regime === regime && !GIT_USAGE_EXITS.includes(r.realOut.code)),
    );
    if (unexercised.length) {
      const example = cases.find((r) => r.regime === unexercised[0]);
      verdicts.set(shape, {
        allowed: false,
        why: `git itself rejected every measured spelling in ${unexercised.join(",")} (exit ${example.realOut.code}), so nothing about rtk was measured`,
        cases,
      });
      continue;
    }
    const bad = cases.find((r) => !r.faithful);
    if (bad) {
      verdicts.set(shape, { allowed: false, why: `${bad.regime}: ${bad.reasons.join("; ")}`, cases });
      continue;
    }
    verdicts.set(shape, { allowed: true, why: `faithful in all ${REGIMES.length} regimes`, cases });
  }
  return verdicts;
};

export const allowedShapes = (results) =>
  [...shapeVerdicts(results)]
    .filter(([, v]) => v.allowed)
    .map(([shape]) => shape)
    .sort();

// The exact text the hook embeds, so regenerating it is mechanical.
export const shapeTable = (results) => allowedShapes(results).join("\n");

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === import.meta.filename;
if (invokedDirectly) {
  const results = await runMatrix();
  if (process.argv[2] === "--shapes") {
    console.log(shapeTable(results));
  } else {
    for (const [shape, v] of shapeVerdicts(results)) {
      console.log(`${v.allowed ? "ALLOW " : "REFUSE"} ${shape.padEnd(38)} ${v.why.slice(0, 90)}`);
    }
  }
}
