// The files one hook run checks, and the revision each is read at. Split from
// ai-agent-hooks.mjs, which is past the 1,000-line bound, so it does not grow.
import { spawnSync } from "node:child_process";

// A push of a long history lists many paths; past this, git's output is not
// read whole and the hook refuses rather than check a partial list.
const MAX_GIT_OUTPUT = 256 * 1024 * 1024;

// A replace ref (`refs/replace/`) would let git read one commit's or file's
// objects as another's; every git this hook runs, here and in its checks,
// reads the objects themselves.
process.env.GIT_NO_REPLACE_OBJECTS = "1";

function git(cwd, args, input) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: MAX_GIT_OUTPUT, input });
  if (result.error) throw new Error(`git ${args[0]} failed: ${result.error.message}`);
  return { ok: result.status === 0, stdout: result.stdout || "", stderr: result.stderr || "" };
}

const lines = (text) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const ZERO = /^0+$/;

/**
 * The commits a push sends: those its updates name that the destination does
 * not already reach, by its own remote-tracking refs (trackingTips) or the
 * tips it reported.
 * A commit only another remote or a stale ref of another remote holds is
 * sent, because it is new to the destination. A localSha this repository
 * does not hold refuses the push.
 */
function sentCommits(repoRoot, remote, updates) {
  const sent = [];
  const reached = [];
  for (const update of updates) {
    if (!ZERO.test(update.localSha ?? "")) {
      if (!/^[0-9a-f]{40,64}$/.test(update.localSha ?? "") || !git(repoRoot, ["cat-file", "-e", `${update.localSha}^{commit}`]).ok)
        throw new Error(`pre-push: cannot read pushed commit ${update.localSha || "(none)"} for ${update.localRef || "(no ref)"}`);
      sent.push(update.localSha);
    }
    if (/^[0-9a-f]{40,64}$/.test(update.remoteSha ?? "") && !ZERO.test(update.remoteSha) && git(repoRoot, ["cat-file", "-e", `${update.remoteSha}^{commit}`]).ok)
      reached.push(update.remoteSha);
  }
  if (sent.length === 0) return [];
  const tracking = trackingTips(repoRoot, remote);
  const listed = git(repoRoot, ["rev-list", "--stdin"], [...sent, "--not", ...tracking, ...reached, ""].join("\n"));
  if (!listed.ok) throw new Error(`pre-push: cannot list the commits to send: ${listed.stderr.trim()}`);
  return lines(listed.stdout);
}

/**
 * What the destination's remote-tracking refs point at, when they speak for
 * it: `remote` is a configured remote whose every push URL is its fetch URL.
 * A remote that pushes somewhere else (`remote.<name>.pushurl` naming another
 * repository), or a URL pushed to directly, reaches nothing by its refs. The
 * refs are matched by their literal `refs/remotes/<remote>/` prefix, so a
 * name holding a glob character matches no other remote's.
 */
function trackingTips(repoRoot, remote) {
  if (!remote) return [];
  const fetchUrl = git(repoRoot, ["remote", "get-url", "--", remote]);
  const pushUrls = git(repoRoot, ["remote", "get-url", "--push", "--all", "--", remote]);
  if (!fetchUrl.ok || !pushUrls.ok) return [];
  const pushes = lines(pushUrls.stdout);
  if (pushes.length === 0 || pushes.some((url) => url !== fetchUrl.stdout.trim())) return [];
  const refs = git(repoRoot, ["for-each-ref", "--format=%(objectname) %(refname)", "refs/remotes/"]);
  if (!refs.ok) throw new Error(`pre-push: cannot read the remote-tracking refs: ${refs.stderr.trim()}`);
  const prefix = `refs/remotes/${remote}/`;
  return lines(refs.stdout)
    .map((line) => [line.slice(0, line.indexOf(" ")), line.slice(line.indexOf(" ") + 1)])
    .filter(([, ref]) => ref.startsWith(prefix))
    .map(([sha]) => sha);
}

/**
 * Each sent commit with the files it changes, read at that commit: a commit
 * against its parent, a merge naming the files it leaves different from every
 * parent (its own resolution), since each other file a merge brings in comes
 * from a commit that is itself sent, and checked, or that the destination
 * already holds.
 */
function commitSources(repoRoot, commits) {
  if (commits.length === 0) return [];
  const listed = git(
    repoRoot,
    ["diff-tree", "--stdin", "-z", "-r", "--root", "-c", "--name-only", "--no-renames", "--diff-filter=ACMRTUXB"],
    `${commits.join("\n")}\n`,
  );
  if (!listed.ok) throw new Error(`pre-push: cannot list the files the sent commits change: ${listed.stderr.trim()}`);
  const known = new Set(commits);
  const sources = [];
  for (const token of listed.stdout.split("\0")) {
    if (!token) continue;
    if (known.has(token)) sources.push({ rev: token, files: [] });
    else if (sources.length > 0) sources.at(-1).files.push(token);
    else throw new Error("pre-push: unreadable file list for the sent commits");
  }
  return sources.filter((source) => source.files.length > 0);
}

/**
 * The files one run checks, as `sources`: each a revision to read them at
 * ("" for the working tree) and its files; `files` is every path once.
 *
 * pre-commit: the staged files; in a merge, only those it leaves different
 * from both parents. A file a merge brings in exactly as MERGE_HEAD has it is
 * the other branch's change, checked by pre-push when it is sent; without
 * this, every merge of a busy branch was checked against thousands of files
 * other authors wrote. A conflict resolution or any edit the merge makes is
 * still checked.
 * pre-push (`updates` from git's stdin, `remote` its first argument): every
 * commit the destination does not reach, each read at itself, so a file
 * added and removed again in the pushed history is still checked and nothing
 * is read from the working tree. A bare repository's pushed commit
 * (`contentRev`), or a push git names no update for, checks its range.
 */
export function changedFiles(repoRoot, hookName, pushContext, { updates = [], remote = "", contentRev = "" } = {}) {
  const one = (files, rev = contentRev) => ({ files, sources: files.length > 0 ? [{ rev, files }] : [] });
  if (hookName === "pre-commit") {
    const staged = git(repoRoot, ["diff", "--cached", "--name-only", "--diff-filter=ACMRTUXB"]);
    if (!staged.ok) return one([]);
    const files = lines(staged.stdout);
    if (!git(repoRoot, ["rev-parse", "-q", "--verify", "MERGE_HEAD"]).ok) return one(files);
    const fromTheirs = git(repoRoot, ["diff", "--cached", "--name-only", "--diff-filter=ACMRTUXB", "MERGE_HEAD"]);
    if (!fromTheirs.ok) return one(files);
    const differsFromTheirs = new Set(lines(fromTheirs.stdout));
    return one(files.filter((file) => differsFromTheirs.has(file)));
  }
  if (!contentRev && updates.length > 0) {
    const sources = commitSources(repoRoot, sentCommits(repoRoot, remote, updates));
    return { files: [...new Set(sources.flatMap((source) => source.files))], sources };
  }
  const range = pushContext?.range;
  if (!range) return one([]);
  const changed = git(repoRoot, ["diff", "--name-only", "--diff-filter=ACMRTUXB", range]);
  if (!changed.ok) throw new Error(`pre-push: cannot list the files ${range} changes: ${changed.stderr.trim()}`);
  return one(lines(changed.stdout));
}

/** A content check run over every source, its findings joined; ok only when every source is. */
export function bySource(context, check) {
  const results = context.sources.map((source) => check(source.files, source.rev));
  if (results.length === 0) return check([], "");
  const failed = results.filter((result) => !result.ok);
  return {
    ok: failed.length === 0,
    status: failed[0]?.status ?? 0,
    output: (failed.length > 0 ? failed : results.slice(0, 1)).map((result) => result.output).join("\n"),
  };
}
