// Files and source revisions checked by each hook run.
import { spawnSync } from "node:child_process";

// Refuse oversized listings rather than check a partial history.
const MAX_GIT_OUTPUT = 256 * 1024 * 1024;

// Read actual objects, never replacements, throughout the hook.
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

/** Sent commits absent from the destination's actual tips; stale tracking refs vouch for nothing. */
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

// Avoid lazy-fetching each unknown destination tip in a partial clone.
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

/** List the actual push destination. Only branches/tags vouch, never hosting refs or rewritten URLs.
 * Fetch missing default/updated tips as objects; an unlistable destination refuses rather than scans all history. */
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

/** Read each sent commit at itself, including roots; merges name changes differing from every parent. */
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

/** Sources pair files with their revision (empty for the index). Pre-commit checks staged changes and
 * merge resolutions; pre-push checks every sent commit, including files removed again before the tip.
 * Only invocations without Git ref updates fall back to a range. */
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
  if (updates.length > 0) {
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
