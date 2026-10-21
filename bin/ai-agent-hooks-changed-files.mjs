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

function git(cwd, args, input, env = process.env) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: MAX_GIT_OUTPUT, input, env });
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
 * not already hold, judged by the tips the destination itself lists now
 * (destinationTips) and the tips git reported for the updated refs. No
 * remote-tracking ref is trusted: one left stale, or a remote re-pointed at
 * another repository, would vouch for a commit the destination lacks. A
 * localSha this repository does not hold refuses the push.
 */
function sentCommits(repoRoot, location, updates) {
  const sent = [];
  const reached = [];
  for (const update of updates) {
    if (!ZERO.test(update.localSha ?? "")) {
      if (!/^[0-9a-f]{40,64}$/.test(update.localSha ?? "") || !git(repoRoot, ["cat-file", "-e", `${update.localSha}^{commit}`]).ok)
        throw new Error(`pre-push: cannot read pushed commit ${update.localSha || "(none)"} for ${update.localRef || "(no ref)"}`);
      sent.push(update.localSha);
    }
    if (/^[0-9a-f]{40,64}$/.test(update.remoteSha ?? "") && !ZERO.test(update.remoteSha)) reached.push(update.remoteSha);
  }
  if (sent.length === 0) return [];
  const tips = destinationTips(repoRoot, location, updates);
  const listed = git(repoRoot, ["rev-list", "--stdin"], [...sent, "--not", ...held(repoRoot, [...new Set([...tips, ...reached])]), ""].join("\n"));
  if (!listed.ok) throw new Error(`pre-push: cannot list the commits to send: ${listed.stderr.trim()}`);
  return lines(listed.stdout);
}

// In a partial clone, looking up an object this repository lacks fetches it
// from the promisor remote, one fetch per object: 16,152 destination tips
// held a push for minutes, and GIT_NO_LAZY_FETCH needs Git 2.45 (gtr runs
// 2.43, where a refused fetch kills the lookup). A partial clone holds few
// objects, so it is asked which commits it holds, never about one it lacks;
// a full clone fetches nothing on lookup.
function isPartialClone(repoRoot) {
  if (git(repoRoot, ["config", "--get", "extensions.partialclone"]).ok) return true;
  const promisors = git(repoRoot, ["config", "--get-regexp", "^remote\\..*\\.promisor$"]);
  return lines(promisors.stdout).some((line) => line.endsWith(" true"));
}

/** The commits of `shas` this repository holds, without fetching any it lacks. */
function held(repoRoot, shas) {
  if (shas.length === 0) return [];
  if (isPartialClone(repoRoot)) {
    const local = git(repoRoot, ["cat-file", "--batch-all-objects", "--unordered", "--batch-check=%(objecttype) %(objectname)"]);
    if (!local.ok) throw new Error(`pre-push: cannot list this repository's commits: ${local.stderr.trim()}`);
    const commits = new Set(lines(local.stdout).filter((line) => line.startsWith("commit ")).map((line) => line.slice("commit ".length)));
    return shas.filter((sha) => commits.has(sha));
  }
  const checked = git(repoRoot, ["cat-file", "--batch-check=%(objectname) %(objecttype)"], `${shas.join("\n")}\n`);
  if (!checked.ok) throw new Error(`pre-push: cannot look up the destination's tips: ${checked.stderr.trim()}`);
  return lines(checked.stdout)
    .filter((line) => line.endsWith(" commit"))
    .map((line) => line.slice(0, line.indexOf(" ")));
}

/**
 * The commits the destination holds as ref tips, from one `git ls-remote` of
 * the location git is pushing to. A tip this repository lacks is fetched
 * (objects only, no ref written) when it is the destination's default branch
 * or a ref this push updates, the tips a pushed branch is built on; any other
 * unknown tip vouches for nothing, so what only it reaches is checked.
 *
 * Only branches and tags vouch: what a clone, CI run or deploy reads. A
 * hosting ref such as `refs/pull/7/head` holds a fork's commits the
 * repository never took. When the location git pushes to is listed under
 * another URL (an `insteadOf` rewriting the pushed URL again), the listing
 * speaks for another repository and nothing vouches. A destination that
 * cannot be listed refuses the push (Unlisted): checking all of history
 * instead takes minutes on a large repository.
 */
function destinationTips(repoRoot, location, updates) {
  if (!location) throw new Unlisted("git named no push location");
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  const resolved = git(repoRoot, ["ls-remote", "--get-url", "--", location]);
  if (!resolved.ok) throw new Unlisted(resolved.stderr.trim());
  if (resolved.stdout.trim() !== location) return [];
  const listed = spawnSync("git", ["ls-remote", "--symref", "--", location], { cwd: repoRoot, encoding: "utf8", maxBuffer: MAX_GIT_OUTPUT, timeout: 60_000, env });
  if (listed.error || listed.status !== 0) throw new Unlisted(listed.error?.message || (listed.stderr || "").trim());
  const tips = new Map();
  let defaultRef = "";
  for (const line of lines(listed.stdout || "")) {
    const [sha, ref] = line.split("\t");
    if (sha.startsWith("ref: ") && ref === "HEAD") defaultRef = sha.slice("ref: ".length);
    else if (/^[0-9a-f]{40,64}$/.test(sha) && /^refs\/(heads|tags)\//.test(ref ?? "")) tips.set(ref, sha);
  }
  const wanted = new Set([defaultRef, ...updates.map((update) => update.remoteRef)]);
  const want = [...new Set([...wanted].map((ref) => tips.get(ref)).filter(Boolean))];
  const present = new Set(held(repoRoot, want));
  const fetch = want.filter((sha) => !present.has(sha));
  if (fetch.length > 0)
    spawnSync("git", ["fetch", "--quiet", "--no-tags", "--no-write-fetch-head", "--", location, ...fetch], { cwd: repoRoot, encoding: "utf8", timeout: 300_000, env });
  return [...new Set(tips.values())];
}

/** The destination could not be listed, so no commit is known to be there. */
class Unlisted extends Error {}

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
 * pre-push (`updates` from git's stdin, `location` the URL it pushes to):
 * every commit the destination does not hold, each read at itself, so a file
 * added and removed again in the pushed history is still checked and nothing
 * is read from the working tree. A bare repository's pushed commit
 * (`contentRev`), or a push git names no update for, checks its range.
 */
export function changedFiles(repoRoot, hookName, pushContext, { updates = [], location = "", contentRev = "" } = {}) {
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
    let sources;
    try {
      sources = commitSources(repoRoot, sentCommits(repoRoot, location, updates));
    } catch (error) {
      if (!(error instanceof Unlisted)) throw error;
      // Each content check refuses with this; the hook's other checks still run.
      const refusal = `destination could not be listed; retry the push (${location}: ${error.message || "no answer"})`;
      return { files: [], sources: [{ files: [], rev: "", refusal }] };
    }
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
  const results = context.sources.map((source) =>
    source.refusal ? { ok: false, status: 1, output: source.refusal } : check(source.files, source.rev),
  );
  if (results.length === 0) return check([], "");
  const failed = results.filter((result) => !result.ok);
  return {
    ok: failed.length === 0,
    status: failed[0]?.status ?? 0,
    output: (failed.length > 0 ? failed : results.slice(0, 1)).map((result) => result.output).join("\n"),
  };
}
