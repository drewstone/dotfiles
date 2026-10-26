import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

// ci-wait-guard.sh through its boundary: a PreToolUse payload on stdin, a decision on stdout.
// The allowed cases are commands it refused from 2026-10-17 to 10-24 that wait on delivery, not PR CI.

const HOOK = resolve("claude/hooks/ci-wait-guard.sh");

function decide(command) {
  const r = spawnSync("/bin/bash", [HOOK], { input: JSON.stringify({ tool_input: { command } }), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
  return out ? { decision: out.permissionDecision, reason: out.permissionDecisionReason } : { decision: "allow" };
}

test("waiting on a package publish is delivery, not PR CI (2026-10-22 refusal)", () => {
  const cmd = "for i in $(seq 1 40); do v=$(curl -s https://registry.npmjs.org/@tangle-network%2fagent-knowledge | python3 -c \"import json,sys; print(json.load(sys.stdin)['dist-tags']['latest'])\"); s=$(gh-drew run view 39720334219 --repo tangle-network/agent-knowledge --json status,conclusion --jq .status); [ \"$v\" = 0.9.0 ] && break; sleep 30; done";
  assert.equal(decide(cmd).decision, "allow");
});

test("waiting on a deploy run is delivery", () => {
  const cmd = "until s=$(gh-drew run view 39871159727 -R tangle-network/agent-container --json status,conclusion --jq '.status'); [[ \"$s\" == completed* ]]; do sleep 30; done";
  assert.equal(decide(cmd).decision, "allow");
  assert.equal(decide("for i in 1 2 3; do gh run list --workflow deploy.yml -L 1; sleep 20; done").decision, "allow");
});

test("waiting on PR checks is refused", () => {
  assert.equal(decide("gh pr checks 423 --watch").decision, "deny");
  assert.equal(decide("for i in $(seq 1 30); do s=$(gh-drew pr checks 423 | awk '{print $2}'); sleep 20; done").decision, "deny");
  const rollup = "while :; do b=$(gh-drew pr view 13817 --json statusCheckRollup -q '.statusCheckRollup[0].conclusion'); sleep 30; done";
  const out = decide(rollup);
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /gh run watch <id> --exit-status/);
});

test("waiting on a background task's own output is the caller's work, not CI (98 refusals 10-19..26)", () => {
  const f = "/private/tmp/claude-501/x/s1/tasks/b6357tl1l.output";
  assert.equal(decide(`until [ -s ${f} ]; do sleep 5; done; tail -60 ${f}`).decision, "allow");
  assert.equal(decide(`until grep -qE "^label=b1 variant|build failed" ${f}; do sleep 5; done; grep -E "^label=" ${f}`).decision, "allow");
});

test("one read of PR checks or a task file is allowed", () => {
  assert.equal(decide("gh pr checks 423").decision, "allow");
  assert.equal(decide("tail -n 40 /private/tmp/x/tasks/b1.output").decision, "allow");
});
