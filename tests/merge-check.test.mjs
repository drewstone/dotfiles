import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

// process_guard.py warns, never denies, before `gh pr merge` when a PR's head commit is red or
// pending. A fake gh answers the GraphQL query from a fixture of check runs and commit statuses.

const HOOK = resolve("claude/hooks/process_guard.py");
const DIR = mkdtempSync(join(tmpdir(), "merge-check-"));
const REPO = "tangle-network/agent-dev-container";

const run = (name, conclusion, startedAt = "2026-10-10T20:00:00Z", status = "COMPLETED") =>
  ({ __typename: "CheckRun", name, status, conclusion, startedAt, completedAt: startedAt });
const status = (context, state) => ({ __typename: "StatusContext", context, state, createdAt: "2026-10-10T20:00:00Z" });
const green = [run("Semgrep SAST", "SUCCESS"), status("signoff/local", "SUCCESS")];
// The 20:34Z loop: check runs green everywhere; commit statuses carry the signoff results.
const FIXTURE = {
  9936: green, 9937: green, 10016: green,
  10102: [run("Semgrep SAST", "SUCCESS"), status("signoff/local", "FAILURE")],
  10079: [run("Semgrep SAST", "SUCCESS"), status("signoff/local", "FAILURE")],
  10106: [run("Semgrep SAST", "SUCCESS", "2026-10-10T20:00:00Z", "IN_PROGRESS"), status("signoff/scoped", "FAILURE")],
  10110: [run("Semgrep SAST", "SUCCESS"), status("signoff/local", "PENDING")],
  // A cancelled run superseded by a successful re-run of the same check is green.
  10200: [run("CI", "CANCELLED", "2026-10-10T19:00:00Z"), run("CI", "SUCCESS", "2026-10-10T19:30:00Z"), status("signoff/local", "SUCCESS")],
  10201: [run("CI", "FAILURE")],
};
writeFileSync(join(DIR, "rollups.json"), JSON.stringify(FIXTURE));
const FAKE_GH = join(DIR, "fake-gh");
writeFileSync(FAKE_GH, `#!/usr/bin/env python3
import json, re, sys
q = next(a for a in sys.argv if a.startswith("query="))
fixture = json.load(open(${JSON.stringify(join(DIR, "rollups.json"))}))
data = {}
for repo_alias, body in re.findall(r"(r\\d+): repository\\([^)]*\\)\\{(.*?)\\}(?= r\\d+:|$)", q[len("query={"):-1]):
    data[repo_alias] = {}
    for alias, number in re.findall(r"(p\\d+): pullRequest\\(number:(\\d+)\\)", body):
        ctx = fixture.get(number)
        data[repo_alias][alias] = None if ctx is None else {"number": int(number), "commits": {"nodes": [{"commit": {
            "oid": number.ljust(12, "a"), "statusCheckRollup": {"state": "X", "contexts": {"nodes": ctx}}}}]}}
print(json.dumps({"data": data}))
`, { mode: 0o755 });

writeFileSync(join(DIR, "merge-list.txt"), "MERGE 9936  | fix\nMERGE 9937  | feat\nSKIP 9959 base x | y\n" +
  "MERGE 10016 | a\nMERGE 10079 | b\nMERGE 10102 | c\nMERGE 10106 | d\nMERGE 10110 | e\n");

function hook(command, env = {}) {
  const r = spawnSync(HOOK, [], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: DIR, session_id: "s" }),
    env: { ...process.env, HOME: DIR, CC_GUARD_GH: FAKE_GH, ...env }, encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : {};
}

test("warns on the 20:34Z merge loop, naming exactly the red and pending PRs and why", () => {
  const command = `cd ~/company; export GH_DREW_MIN_CORE=0; R=${REPO}; ok=0; bad=""; for n in $(awk '/^MERGE/{print $2}' ${DIR}/merge-list.txt); do out=$(gh-drew pr merge $n -R $R --squash 2>&1 | tail -1); m=$(gh-drew api repos/$R/pulls/$n --jq .merged 2>/dev/null); if [ "$m" = "true" ]; then ok=$((ok+1)); echo "ok #$n"; else bad="$bad #$n"; fi; done; echo "merged $ok; not merged:$bad"`;
  const out = hook(command);
  assert.equal(out.hookSpecificOutput?.permissionDecision, undefined, "a warning must not block");
  const text = out.hookSpecificOutput.additionalContext;
  assert.equal(text, out.systemMessage);
  assert.match(text, /4 of 7 PR\(s\)/);
  for (const n of ["10102", "10079", "10106", "10110"]) assert.match(text, new RegExp(`#${n} `));
  for (const n of ["9936", "9937", "10016", "9959"]) assert.doesNotMatch(text, new RegExp(`#${n} `));
  assert.match(text, /#10102 at \w+: red: signoff\/local=failure \(commit status\)/);
  assert.match(text, /#10110 at \w+: pending: signoff\/local=pending \(commit status\)/);
  assert.match(text, /#10106 at \w+: red: signoff\/scoped=failure \(commit status\); Semgrep SAST=in_progress \(check run\)/);
  assert.match(text, /show him this list/);
});

test("reads PR lists fed through xargs and while-read, and single merges", () => {
  const viaXargs = hook(`printf '%s\\n' 10102 10016 | xargs -n1 gh-drew pr merge -R ${REPO} --squash`);
  assert.match(viaXargs.systemMessage, /1 of 2 PR\(s\)/);
  assert.match(viaXargs.systemMessage, /#10102 /);
  const viaRead = hook(`echo 10110 | while read n; do gh pr merge "$n" --repo ${REPO} --merge; done`);
  assert.match(viaRead.systemMessage, /#10110 at \w+: pending/);
  const single = hook(`ssh gtr 'gh-drew pr merge 10201 --repo ${REPO} --squash --delete-branch'`);
  assert.match(single.systemMessage, /#10201 at \w+: red: CI=failure \(check run\)/);
});

test("green merges, superseded runs and other gh commands stay silent", () => {
  assert.deepEqual(hook(`gh-drew pr merge 9936 --repo ${REPO} --squash`), {});
  assert.deepEqual(hook(`gh-drew pr merge 10200 --repo ${REPO} --squash`), {});
  assert.deepEqual(hook(`gh-drew pr view 10102 --repo ${REPO} --json state`), {});
  assert.deepEqual(hook(`gh pr merge --help`), {});
});

test("an unreadable PR list is named, and an unsafe awk program is never run", () => {
  const unread = hook(`for n in $(gh-drew pr list --repo ${REPO} --json number --jq '.[].number'); do gh-drew pr merge $n --repo ${REPO}; done`);
  assert.match(unread.systemMessage, /not checked \(PR list not readable from the command\): `\$n`/);
  const marker = join(DIR, "ran");
  const unsafe = hook(`for n in $(awk 'BEGIN{system("touch ${marker}")} /^MERGE/{print $2}' ${DIR}/merge-list.txt); do gh-drew pr merge $n --repo ${REPO}; done`);
  assert.match(unsafe.systemMessage, /not checked/);
  assert.equal(spawnSync("test", ["-e", marker]).status, 1, "the awk program ran");
});

test("the check can be turned off", () => {
  assert.deepEqual(hook(`gh-drew pr merge 10102 --repo ${REPO}`, { CC_GUARD_NO_MERGE_CHECK: "1" }), {});
});
