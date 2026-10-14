// merge-on-green against a fake gh-drew: one fixture of open PRs, one tick, the merges it makes.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const TOOL = resolve("claude/tools/merge-on-green");
const old = "2026-01-01T00:00:00Z";
const sha = (n) => String(n).padStart(40, "a");
const check = (name, conclusion = "SUCCESS", status = "COMPLETED") => ({ __typename: "CheckRun", name, conclusion, status });
const green = [check("Fast Checks"), check("Build"), check("Type Check")];

function pr(number, over = {}) {
  return {
    number, isDraft: false, mergeable: "MERGEABLE", headRefName: `feat/${number}`, headRefOid: sha(number),
    body: "Problem, change, proof.", labels: { nodes: [] },
    commits: { nodes: [{ commit: { committedDate: old, statusCheckRollup: { contexts: { nodes: green } } } }] },
    reviewThreads: { nodes: [] }, ...over,
  };
}
const withChecks = (n, nodes) => pr(n, { commits: { nodes: [{ commit: { committedDate: old, statusCheckRollup: { contexts: { nodes } } } }] } });

function fixture(prs, { refuse = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "mog-"));
  writeFileSync(join(dir, "graphql.json"), JSON.stringify({ data: { repository: { pullRequests: { nodes: prs } } } }));
  writeFileSync(join(dir, "gh-drew"), `#!/bin/bash
echo "$*" >> "${dir}/calls.log"
if [ "$1 $2" = "api graphql" ]; then cat "${dir}/graphql.json"; exit 0; fi
if [ "$1 $2" = "pr merge" ]; then for r in ${refuse.join(" ")}; do [ "$3" = "$r" ] && { echo "Pull Request is not mergeable" >&2; exit 1; }; done; exit 0; fi
exit 0
`);
  chmodSync(join(dir, "gh-drew"), 0o755);
  const run = () => spawnSync("python3", [TOOL, "--state-dir", join(dir, "state")], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}` }, encoding: "utf8",
  });
  const calls = () => (existsSync(join(dir, "calls.log")) ? readFileSync(join(dir, "calls.log"), "utf8") : "");
  return { dir, run, calls };
}

test("a green PR merges, pinned to the head it judged", () => {
  const f = fixture([pr(1)]);
  const r = f.run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(f.calls(), new RegExp(`pr merge 1 -R tangle-network/agent-container --merge --match-head-commit ${sha(1)}`));
  assert.match(r.stdout, /#1 merged/);
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

test("a merge GitHub refuses is recorded with its reason", () => {
  const f = fixture([pr(13)], { refuse: [13] });
  const r = f.run();
  assert.match(r.stdout, /#13 merge refused: Pull Request is not mergeable/);
  const log = readFileSync(join(f.dir, "state", "decisions.jsonl"), "utf8");
  assert.match(log, /"pr": 13, .*"outcome": "merge refused/);
});
