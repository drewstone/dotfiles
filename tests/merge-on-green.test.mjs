// merge-on-green against a fake gh-drew: one fixture of open PRs, one tick, the merges it makes.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const TOOL = resolve("claude/tools/merge-on-green");
const old = "2026-01-01T00:00:00Z";
const sha = (n) => String(n).padStart(40, "a");
const check = (name, conclusion = "SUCCESS", status = "COMPLETED") => ({ __typename: "CheckRun", name, conclusion, status, completedAt: "2026-01-01T00:09:30Z" });
const green = [check("Fast Checks"), check("Build"), check("Type Check")];

// Pushes run this checkout's own global hooks (ai-agent-hooks), not whatever is installed.
const GIT_ID = {
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.test", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.test",
  GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: resolve("git/hooks"),
};

// A real origin: develop and feat/<n> both change ledger.md (merge=union) and, when asked, code.txt.
function gitOrigin(n, { realConflict = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "mog-git-"));
  const origin = join(root, "origin.git"), work = join(root, "work");
  const g = (...args) => {
    const r = spawnSync("git", args, { cwd: work, encoding: "utf8", env: { ...process.env, ...GIT_ID } });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  spawnSync("git", ["init", "-q", "--bare", origin]);
  spawnSync("git", ["init", "-q", "-b", "develop", work]);
  const commit = (files, msg) => { for (const [f, body] of Object.entries(files)) writeFileSync(join(work, f), body); g("add", "."); g("commit", "-qm", msg); };
  commit({ ".gitattributes": "ledger.md merge=union\n", "ledger.md": "- base\n", "code.txt": "base\n" }, "base");
  g("checkout", "-qb", `feat/${n}`);
  commit({ "ledger.md": "- base\n- feature\n", ...(realConflict ? { "code.txt": "feature\n" } : {}) }, "feature");
  g("checkout", "-q", "develop");
  commit({ "ledger.md": "- base\n- develop\n", ...(realConflict ? { "code.txt": "develop\n" } : {}) }, "develop");
  g("push", "-q", origin, "develop", `feat/${n}`);
  const show = (ref, path) => spawnSync("git", ["--git-dir", origin, "show", `${ref}:${path}`], { encoding: "utf8" }).stdout;
  const parents = (ref) => spawnSync("git", ["--git-dir", origin, "log", "-1", "--format=%P", ref], { encoding: "utf8" }).stdout.trim().split(" ");
  return { origin, head: g("rev-parse", `feat/${n}`), develop: g("rev-parse", "develop"), show, parents };
}

function pr(number, over = {}) {
  return {
    number, isDraft: false, mergeable: "MERGEABLE", headRefName: `feat/${number}`, headRefOid: sha(number),
    body: "Problem, change, proof.", labels: { nodes: [] },
    commits: { nodes: [{ commit: { committedDate: old, checkSuites: { nodes: [{ createdAt: "2026-01-01T00:05:00Z" }] }, statusCheckRollup: { contexts: { nodes: green } } } }] },
    reviewThreads: { nodes: [] }, ...over,
  };
}
const withChecks = (n, nodes) => pr(n, { commits: { nodes: [{ commit: { committedDate: old, statusCheckRollup: { contexts: { nodes } } } }] } });

function fixture(prs, { refuse = [], conflictUpdate = [], refuseText = "Pull Request is not mergeable", gitUrl, variable } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "mog-"));
  if (variable) writeFileSync(join(dir, "variable.json"), JSON.stringify({ name: "MERGE_ON_GREEN_PAUSED", ...variable }));
  const graphql = (develop) => writeFileSync(join(dir, "graphql.json"), JSON.stringify({ data: { repository: { ref: { target: { oid: develop } }, pullRequests: { nodes: prs } } } }));
  graphql("d".repeat(40));
  writeFileSync(join(dir, "gh-drew"), `#!/bin/bash
echo "$* wait=\${GH_DREW_REVIEW_WAIT:-}" >> "${dir}/calls.log"
if [ "$1 $2" = "api graphql" ]; then cat "${dir}/graphql.json"; exit 0; fi
if [ "$1 $2" = "api repos/tangle-network/agent-container/actions/variables/MERGE_ON_GREEN_PAUSED" ]; then
  [ -f "${dir}/variable.json" ] && { cat "${dir}/variable.json"; exit 0; }; echo '{"message":"Not Found"}'; echo "gh: Not Found (HTTP 404)" >&2; exit 1
fi
for r in ${conflictUpdate.join(" ")}; do [ "$1 $3 $4" = "api PUT repos/tangle-network/agent-container/pulls/$r/update-branch" ] && { echo "gh: merge conflict between base and head (HTTP 422)" >&2; exit 1; }; done
if [ "$1 $2" = "pr merge" ]; then for r in ${refuse.join(" ")}; do [ "$3" = "$r" ] && { echo "${refuseText}" >&2; exit 1; }; done; exit 0; fi
exit 0
`);
  chmodSync(join(dir, "gh-drew"), 0o755);
  // No test reaches GitHub: the merge mirror clones gitUrl, a missing local path unless a test builds an origin.
  const run = (...args) => spawnSync("python3", [TOOL, ...args, "--state-dir", join(dir, "state"), "--git-url", gitUrl ?? join(dir, "no-origin.git")], {
    env: { ...process.env, ...GIT_ID, PATH: `${dir}:${process.env.PATH}` }, encoding: "utf8",
  });
  const calls = () => (existsSync(join(dir, "calls.log")) ? readFileSync(join(dir, "calls.log"), "utf8") : "");
  return { dir, run, calls, moveDevelop: () => graphql("e".repeat(40)) };
}

test("a green PR merges, pinned to the head it judged", () => {
  const f = fixture([pr(1)]);
  const r = f.run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(f.calls(), new RegExp(`pr merge 1 -R tangle-network/agent-container --merge --match-head-commit ${sha(1)} wait=0`));
  assert.match(r.stdout, /#1 merged/);
  assert.match(readFileSync(join(f.dir, "state", "decisions.jsonl"), "utf8"), /"head_to_green_s": 270/);
  assert.match(readFileSync(join(f.dir, "state", "status.md"), "utf8"), /last 1 merges: p50 4 min, max 4 min/);
});

test("anything not green and ready waits, and is never merged", () => {
  const prs = [
    withChecks(2, [...green, check("Unit Tests", "FAILURE")]),
    withChecks(3, [check("Fast Checks"), check("Build"), check("Type Check", null, "IN_PROGRESS")]),
    withChecks(4, [check("Fast Checks"), check("Build")]),
    pr(5, { isDraft: true }),
    pr(6, { body: "Do not merge until the GTM side ships." }),
    pr(7, { reviewThreads: { nodes: [{ isResolved: false, comments: { nodes: [{ body: "![P1 Badge] this drops the guard" }] } }] } }),
    pr(8, { headRefName: "release/20261014-abc" }),
    pr(9, { labels: { nodes: [{ name: "hold" }] } }),
    pr(10, { commits: { nodes: [{ commit: { committedDate: new Date().toISOString(), statusCheckRollup: { contexts: { nodes: green } } } }] } }),
  ];
  const f = fixture(prs);
  const r = f.run();
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(f.calls(), /pr merge/);
  const status = readFileSync(join(f.dir, "state", "status.md"), "utf8");
  for (const [n, why] of [[2, "red: Unit Tests"], [3, "waiting on Type Check"], [4, "waiting on Type Check"], [5, "draft"],
    [6, "hold phrase"], [7, "P0/P1"], [8, "release branch"], [9, "hold label"], [10, "old"]])
    assert.match(status, new RegExp(`#${n} .*${why}`), `#${n}`);
});

test("a resolved P1 thread does not hold a green PR", () => {
  const f = fixture([pr(11, { reviewThreads: { nodes: [{ isResolved: true, comments: { nodes: [{ body: "P1: fixed" }] } }] } })]);
  f.run();
  assert.match(f.calls(), /pr merge 11 /);
});

test("a green PR that conflicts gets one comment per head, not one per tick", () => {
  const f = fixture([pr(12, { mergeable: "CONFLICTING" })]);
  f.run(); f.run();
  assert.equal((f.calls().match(/pr comment 12 /g) || []).length, 1);
  assert.doesNotMatch(f.calls(), /pr merge 12 /);
});

test("a PR whose gate never ran is updated from develop once per head, never merged", () => {
  const f = fixture([withChecks(14, [check("regressions")])]);
  f.run(); f.run();
  assert.equal((f.calls().match(/api --method PUT repos\/tangle-network\/agent-container\/pulls\/14\/update-branch -f expected_head_sha=a+14/g) || []).length, 1);
  assert.doesNotMatch(f.calls(), /pr merge 14 /);
});

test("a PR whose gate cannot run because it conflicts tells its owner once per head", () => {
  const f = fixture([withChecks(17, [check("regressions")])], { conflictUpdate: [17] });
  f.run(); f.run();
  assert.equal((f.calls().match(/pr comment 17 /g) || []).length, 1);
  assert.doesNotMatch(f.calls(), /pr merge 17 /);
});

test("a gate the old CI recorded as SKIPPED counts as never run, and the PR is updated from develop", () => {
  const f = fixture([withChecks(15, [check("Fast Checks", "SKIPPED"), check("Build", "SKIPPED"), check("Type Check", "SKIPPED"), check("regressions")])]);
  f.run();
  assert.match(f.calls(), /pulls\/15\/update-branch/);
  assert.doesNotMatch(f.calls(), /pr merge 15 /);
});

test("a red status from the retired local signoff does not hold a green PR", () => {
  const f = fixture([withChecks(16, [...green, { __typename: "StatusContext", context: "signoff/local", state: "FAILURE" }])]);
  f.run();
  assert.match(f.calls(), /pr merge 16 /);
});

test("a merge GitHub refuses for a conflict tells the owner once per head", () => {
  const f = fixture([pr(18)], { refuse: [18], refuseText: "Pull request #18 is not mergeable: the merge commit cannot be cleanly created." });
  f.run(); f.run();
  assert.equal((f.calls().match(/pr comment 18 /g) || []).length, 1);
});

test("a conflict only GitHub sees (a merge=union ledger) gets develop merged in by git, with no comment", () => {
  const o = gitOrigin(20);
  const f = fixture([pr(20, { mergeable: "CONFLICTING", headRefOid: o.head })], { gitUrl: o.origin });
  const r = f.run();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(o.parents("feat/20"), [o.head, o.develop]);
  assert.equal(o.show("feat/20", "ledger.md"), "- base\n- feature\n- develop\n");
  assert.doesNotMatch(f.calls(), /pr comment 20 /);
  assert.match(r.stdout, /#20 merged develop in \(git attributes\)/);
});

test("a conflict git cannot resolve leaves the branch alone and tells the owner", () => {
  const o = gitOrigin(21, { realConflict: true });
  const f = fixture([pr(21, { mergeable: "CONFLICTING", headRefOid: o.head })], { gitUrl: o.origin });
  f.run();
  assert.deepEqual(o.parents("feat/21"), o.parents(o.head));
  assert.match(f.calls(), /pr comment 21 /);
});

test("a refused conflict is retried only after develop moves", () => {
  const f = fixture([pr(19)], { refuse: [19], refuseText: "the merge commit cannot be cleanly created." });
  f.run(); f.run();
  assert.equal((f.calls().match(/pr merge 19 /g) || []).length, 1);
  f.moveDevelop(); f.run();
  assert.equal((f.calls().match(/pr merge 19 /g) || []).length, 2);
  assert.equal((f.calls().match(/pr comment 19 /g) || []).length, 1);
});

test("a cancelled non-gate run does not hold a green PR, and a gate run must still succeed", () => {
  const f = fixture([
    withChecks(30, [...green, check("regressions", "CANCELLED")]),
    withChecks(31, [check("Fast Checks"), check("Build", "CANCELLED"), check("Type Check")]),
  ]);
  f.run();
  assert.match(f.calls(), /pr merge 30 /);
  assert.doesNotMatch(f.calls(), /pr merge 31 /);
  assert.match(readFileSync(join(f.dir, "state", "status.md"), "utf8"), /#31 .*waiting on Build/);
});

test("a check judged by its latest run: a failure re-run green merges", () => {
  const failedFirst = { ...check("Unit Tests", "FAILURE"), completedAt: "2026-01-01T00:05:00Z" };
  const greenAfter = { ...check("Unit Tests"), completedAt: "2026-01-01T00:20:00Z" };
  const f = fixture([withChecks(32, [...green, failedFirst, greenAfter])]);
  f.run();
  assert.match(f.calls(), /pr merge 32 /);
});

test("a red gate is refreshed from develop once per head and develop; a red side check only waits", () => {
  const f = fixture([withChecks(40, [check("Fast Checks"), check("Build"), check("Type Check", "FAILURE")]), withChecks(41, [...green, check("Unit Tests", "FAILURE")])]);
  f.run(); f.run();
  assert.equal((f.calls().match(/pulls\/40\/update-branch/g) || []).length, 1);
  assert.doesNotMatch(f.calls(), /pulls\/41\/update-branch/);
  assert.doesNotMatch(f.calls(), /pr merge 4[01] /);
  assert.match(readFileSync(join(f.dir, "state", "status.md"), "utf8"), /#40 .*red gate: Type Check; already refreshed/);
});

test("a merge GitHub refuses is recorded with its reason", () => {
  const f = fixture([pr(13)], { refuse: [13] });
  const r = f.run();
  assert.match(r.stdout, /#13 merge refused: Pull Request is not mergeable/);
  const log = readFileSync(join(f.dir, "state", "decisions.jsonl"), "utf8");
  assert.match(log, /"pr": 13, .*"outcome": "merge refused/);
});

// The pause: `pause` writes it, the next pass merges only version PRs and release-critical PRs, and it ends on its own.
const merged = (f, n) => new RegExp(`pr merge ${n} -R tangle-network/agent-container --merge --match-head-commit ${sha(n)}`).test(f.calls());
const pause = (f, ...args) => {
  const r = f.run("pause", "--minutes", "30", "--reason", "version PR #11196 CI window", ...args);
  assert.equal(r.status, 0, r.stderr);
  return r;
};

test("unpaused, a green PR merges, status says so and names the allowlist, and a version PR is left to release automation", () => {
  const f = fixture([pr(50), pr(51, { headRefName: "changeset-release/develop" })]);
  const s = f.run("status");
  assert.equal(s.status, 0, s.stderr);
  assert.match(s.stdout, /not paused\. A pause merges only: head branch changeset-release\/\* \(version PRs\), label release-critical/);
  const r = f.run();
  assert.equal(r.status, 0, r.stderr);
  assert.ok(merged(f, 50));
  assert.ok(!merged(f, 51));
  assert.doesNotMatch(r.stdout, /paused/);
});

test("paused, a normal green PR is skipped with one line naming the pause", () => {
  const f = fixture([pr(52)]);
  const p = pause(f);
  assert.match(p.stdout, /paused until \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ \(version PR #11196 CI window\), set by .+ via pause\.json/);
  const r = f.run();
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!merged(f, 52));
  assert.match(r.stdout, /^\S+ paused until \S+Z \(version PR #11196 CI window\): skipped #52$/m);
  assert.match(f.run("status").stdout, /paused until .*While paused it merges only: head branch changeset-release\/\* \(version PRs\), label release-critical/s);
});

test("paused, a green version PR (changeset-release/*) merges", () => {
  const f = fixture([pr(53, { headRefName: "changeset-release/develop" })]);
  pause(f);
  const r = f.run();
  assert.ok(merged(f, 53), f.calls());
  assert.match(r.stdout, /#53 merged/);
});

test("paused, a green release-critical PR merges, and a red one still waits", () => {
  const critical = { labels: { nodes: [{ name: "release-critical" }] } };
  const f = fixture([pr(54, critical), { ...withChecks(55, [check("Fast Checks"), check("Build")]), ...critical }]);
  pause(f);
  f.run();
  assert.ok(merged(f, 54), f.calls());
  assert.ok(!merged(f, 55));
});

test("an expired pause merges normally, and resume ends a live one", () => {
  const f = fixture([pr(56)]);
  mkdirSync(join(f.dir, "state"), { recursive: true });
  writeFileSync(join(f.dir, "state", "pause.json"), JSON.stringify({ until: "2026-01-01T00:00:00Z", reason: "old", who: "t" }));
  f.run();
  assert.ok(merged(f, 56));

  const g = fixture([pr(57)]);
  pause(g);
  g.run();
  assert.ok(!merged(g, 57));
  assert.match(g.run("resume").stdout, /not paused/);
  assert.match(g.calls(), /api --method DELETE repos\/tangle-network\/agent-container\/actions\/variables\/MERGE_ON_GREEN_PAUSED/);
  g.run();
  assert.ok(merged(g, 57));
});

test("a pause longer than 120 minutes is refused and nothing pauses", () => {
  const f = fixture([pr(58)]);
  const r = f.run("pause", "--minutes", "500", "--reason", "release");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--minutes 1\.\.120/);
  assert.ok(!existsSync(join(f.dir, "state", "pause.json")));
  f.run();
  assert.ok(merged(f, 58));
});

test("the repo variable pauses from anywhere, and ends 120 minutes after it was set", () => {
  const later = new Date(Date.now() + 3_600_000).toISOString();
  const f = fixture([pr(59)], { variable: { value: `${later} cut 2026-10-15`, updated_at: new Date().toISOString() } });
  const r = f.run();
  assert.ok(!merged(f, 59));
  assert.match(r.stdout, /paused until \S+ \(cut 2026-10-15\): skipped #59/);
  assert.match(f.run("status").stdout, /set by repo variable MERGE_ON_GREEN_PAUSED/);

  const stale = fixture([pr(60)], { variable: { value: later, updated_at: new Date(Date.now() - 3 * 3_600_000).toISOString() } });
  stale.run();
  assert.ok(merged(stale, 60));
});
