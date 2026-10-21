// The files one hook run checks. Split from ai-agent-hooks.mjs, which is past
// the 1,000-line bound, so it does not grow.
import { spawnSync } from "node:child_process";

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { ok: result.status === 0, stdout: result.stdout || "" };
}

const lines = (text) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * pre-commit: the staged files; in a merge, only those it leaves different
 * from both parents. A file a merge brings in exactly as MERGE_HEAD has it is
 * the other branch's change, already checked where it was made; without this,
 * every merge of a busy branch was checked against thousands of files other
 * authors wrote, and refused for what they had already landed. A conflict
 * resolution or any edit the merge makes is still checked.
 * pre-push: the files the commits it sends change, each commit against its
 * parents, a merge naming only the files it leaves different from every
 * parent; a commit any remote-tracking ref already holds is not sent. A
 * branch that merged its base was otherwise checked against every file the
 * base brought in since the branch forked. When git names no update, or the
 * commit list cannot be read, the pushed range is checked whole.
 */
export function changedFiles(repoRoot, hookName, pushContext, pushRefUpdates = []) {
  if (hookName === "pre-commit") {
    const staged = git(repoRoot, ["diff", "--cached", "--name-only", "--diff-filter=ACMRTUXB"]);
    if (!staged.ok) return [];
    const files = lines(staged.stdout);
    if (!git(repoRoot, ["rev-parse", "-q", "--verify", "MERGE_HEAD"]).ok) return files;
    const fromTheirs = git(repoRoot, [
      "diff",
      "--cached",
      "--name-only",
      "--diff-filter=ACMRTUXB",
      "MERGE_HEAD",
    ]);
    if (!fromTheirs.ok) return files;
    const differsFromTheirs = new Set(lines(fromTheirs.stdout));
    return files.filter((file) => differsFromTheirs.has(file));
  }
  const sent = pushRefUpdates.filter((update) => !/^0+$/.test(update.localSha)).map((update) => update.localSha);
  if (sent.length > 0) {
    const touched = git(repoRoot, [
      "log",
      "--format=",
      "--name-only",
      "-c",
      "--diff-filter=ACMRTUXB",
      ...sent,
      "--not",
      "--remotes",
      "--",
    ]);
    if (touched.ok) return [...new Set(lines(touched.stdout))];
  }
  const range = pushContext?.range;
  if (!range) return [];
  const changed = git(repoRoot, ["diff", "--name-only", "--diff-filter=ACMRTUXB", range]);
  return changed.ok ? lines(changed.stdout) : [];
}
