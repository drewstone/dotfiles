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

test("a subagent cannot wait on an in-session background command", () => {
  assert.equal(decide({ transcript_path: SUB, tool_name: "Bash", tool_input: { command: "gh run watch 1", run_in_background: true } }), "deny");
  assert.equal(decide({ agent_id: "a1", tool_name: "Bash", tool_input: { command: "sleep 60", run_in_background: true } }), "deny");
  const loop = "until ssh gtr 'test -s ~/x.verdict.json'; do sleep 120; done";
  assert.equal(decide({ agent_id: "a1", tool_name: "Bash", tool_input: { command: loop, run_in_background: true } }), "deny");
  assert.equal(decide({ agent_id: "a1", tool_name: "Bash", tool_input: { command: "tail -F build.log", run_in_background: true } }), "deny");
});

test("a subagent's background work runs in the foreground instead of being refused", () => {
  // From 10-17 to 10-24 this was refused 188 times on the Mac, mostly gates like this one.
  const command = "beelink-gate --retry 20 auto https://github.com/tangle-network/agent-container 7cdfef -- pnpm vitest run x.test.ts";
  const out = hook({ agent_id: "a1", tool_name: "Bash", tool_input: { command, description: "gate", run_in_background: true, timeout: 2400000 } });
  assert.equal(out.permissionDecision, "allow");
  assert.deepEqual(out.updatedInput, { command, description: "gate", timeout: 600000 });
  assert.match(out.additionalContext, /foreground/);
});

test("a subagent cannot use Monitor or spawn agents", () => {
  assert.equal(decide({ transcript_path: SUB, tool_name: "Monitor", tool_input: {} }), "deny");
  assert.equal(decide({ transcript_path: SUB, tool_name: "Agent", tool_input: { prompt: "land PR" } }), "deny");
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
