import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

// agent-cap-guard.py reads a PreToolUse payload on stdin and counts the session's live
// agents from their transcripts. The first case replays the 2026-10-11 peak: 19 Opus
// agents live in one operator session while SOUL capped large agents at three.

const HOOK = resolve("claude/hooks/agent-cap-guard.py");
const NOW = 1_800_000_000;
const CLEAN_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("CC_")));

function session({ opus = 0, sonnet = 0, ageSecs = 30 } = {}) {
  const root = mkdtempSync(join(tmpdir(), "agent-cap-"));
  const sub = join(root, "sess", "subagents", "workflows", "wf_1");
  mkdirSync(sub, { recursive: true });
  const write = (i, model) => {
    const file = join(sub, `agent-a${String(i).padStart(4, "0")}.jsonl`);
    writeFileSync(file, `${JSON.stringify({ message: { model } })}\n${JSON.stringify({ message: { model: "<synthetic>" } })}\n`);
    utimesSync(file, NOW - ageSecs, NOW - ageSecs);
  };
  let i = 0;
  for (let k = 0; k < opus; k++) write(i++, "claude-opus-5-5");
  for (let k = 0; k < sonnet; k++) write(i++, "claude-sonnet-5-5");
  return join(root, "sess.jsonl");
}

function run(transcript, tool_name = "Agent", tool_input = {}, env = {}) {
  const r = spawnSync("python3", [HOOK], {
    input: JSON.stringify({ tool_name, tool_input, transcript_path: transcript }),
    env: { ...CLEAN_ENV, CC_AGENT_NOW: String(NOW), ...env },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : {};
}

const decision = (out) => out.hookSpecificOutput?.permissionDecision ?? "allow";

test("the 2026-10-11 peak, 19 live Opus agents, refuses another Opus agent", () => {
  const out = run(session({ opus: 19 }));
  assert.equal(decision(out), "deny");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /19 Opus agents are live and the cap is 3/);
});

test("two live Opus agents admit a third", () => {
  assert.equal(decision(run(session({ opus: 2 }))), "allow");
});

test("at the Opus cap, a sonnet agent is still admitted", () => {
  assert.equal(decision(run(session({ opus: 3 }), "Agent", { model: "sonnet" })), "allow");
});

test("at the Opus cap, a Workflow launch or resume is refused", () => {
  assert.equal(decision(run(session({ opus: 3 }), "Workflow", { scriptPath: "/x.js", resumeFromRunId: "wf_x" })), "deny");
});

test("agents silent longer than the live window do not count", () => {
  assert.equal(decision(run(session({ opus: 19, ageSecs: 3600 }))), "allow");
});

test("the total cap refuses a ninth agent of any model", () => {
  const out = run(session({ opus: 3, sonnet: 5 }), "Agent", { model: "sonnet" });
  assert.equal(decision(out), "deny");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /8 agents are live and the total cap is 8/);
});

test("a subagent's transcript path resolves to the same session", () => {
  const main = session({ opus: 3 });
  const sub = main.replace(/\.jsonl$/, "/subagents/agent-a0000.jsonl");
  assert.equal(decision(run(sub)), "deny");
});

test("the session override allows the call and says so", () => {
  const out = run(session({ opus: 5 }), "Agent", {}, { CC_ALLOW_AGENT_OVERCAP: "1" });
  assert.equal(decision(out), "allow");
  assert.match(out.systemMessage, /allowed over the cap/);
});

test("other tools pass silently", () => {
  assert.deepEqual(run(session({ opus: 19 }), "Bash", { command: "ls" }), {});
});
