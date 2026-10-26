import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const HOOK = resolve("claude/hooks/subagent-wait-guard.sh");
const SUB = "/Users/x/.claude/projects/p/s1/subagents/agent-a1.jsonl";
const MAIN = "/Users/x/.claude/projects/p/s1.jsonl";

function hook(payload) {
  const r = spawnSync("/bin/bash", [HOOK], { input: JSON.stringify(payload), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
}
const decide = (payload) => hook(payload)?.permissionDecision ?? "allow";

test("a subagent's background wait on its own log runs in the foreground (346 refusals 10-19..26)", () => {
  const log = "/tmp/claude-1000/-home-drew-code/s1/scratchpad/gate1.log";
  for (const command of [`until grep -q '^exit=' ${log}; do sleep 20; done; tail -15 ${log}`, "tail -F build.log", "sleep 60"]) {
    const out = hook({ agent_id: "a1", tool_name: "Bash", tool_input: { command, run_in_background: true } });
    assert.equal(out.permissionDecision, "allow", command);
    assert.deepEqual(out.updatedInput, { command, timeout: 600000 });
  }
});

test("a subagent's background work runs in the foreground instead of being refused", () => {
  // From 10-17 to 10-24 this was refused 188 times on the Mac, mostly gates like this one.
  const command = "beelink-gate --retry 20 auto https://github.com/tangle-network/agent-container 7cdfef -- pnpm vitest run x.test.ts";
  const out = hook({ agent_id: "a1", tool_name: "Bash", tool_input: { command, description: "gate", run_in_background: true, timeout: 2400000 } });
  assert.equal(out.permissionDecision, "allow");
  assert.deepEqual(out.updatedInput, { command, description: "gate", timeout: 600000 });
  assert.match(out.additionalContext, /foreground/);
});

test("a subagent cannot use Monitor, and is told the foreground wait that passes", () => {
  const out = hook({ transcript_path: SUB, tool_name: "Monitor", tool_input: {} });
  assert.equal(out.permissionDecision, "deny");
  assert.match(out.permissionDecisionReason, /one foreground Bash call/);
});

test("a subagent's Agent call is left to agent-cap-guard", () => {
  assert.equal(decide({ transcript_path: SUB, tool_name: "Agent", tool_input: { prompt: "Split host-agent docker e2e suites" } }), "allow");
});

test("a subagent's foreground commands are untouched", () => {
  assert.equal(decide({ transcript_path: SUB, tool_name: "Bash", tool_input: { command: "ssh gtr 'nohup ./land.sh &'" } }), "allow");
});

test("the main session is never blocked", () => {
  assert.equal(decide({ transcript_path: MAIN, tool_name: "Bash", tool_input: { command: "x", run_in_background: true } }), "allow");
  assert.equal(decide({ transcript_path: MAIN, tool_name: "Agent", tool_input: {} }), "allow");
  assert.equal(decide({ transcript_path: MAIN, tool_name: "Monitor", tool_input: {} }), "allow");
});

test("unparsable input fails open", () => {
  const r = spawnSync("/bin/bash", [HOOK], { input: "not json", encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});
