import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const HOOK = resolve("claude/hooks/subagent-wait-guard.sh");
const SUB = "/Users/x/.claude/projects/p/s1/subagents/agent-a1.jsonl";
const MAIN = "/Users/x/.claude/projects/p/s1.jsonl";

function decide(payload) {
  const r = spawnSync("/bin/bash", [HOOK], { input: JSON.stringify(payload), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  if (!r.stdout.trim()) return "allow";
  return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
}

test("a subagent cannot wait on an in-session background command", () => {
  assert.equal(decide({ transcript_path: SUB, tool_name: "Bash", tool_input: { command: "gh run watch 1", run_in_background: true } }), "deny");
  assert.equal(decide({ agent_id: "a1", tool_name: "Bash", tool_input: { command: "sleep 60", run_in_background: true } }), "deny");
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
