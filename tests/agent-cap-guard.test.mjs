import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const HOOK = resolve("claude/hooks/agent-cap-guard.py");
const NOW = 1_800_000_000;
const CLEAN_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("CC_")));

function session({ opus = 0, sonnet = 0, done = 0, ageSecs = 30 } = {}) {
  const root = mkdtempSync(join(tmpdir(), "agent-cap-"));
  const sub = join(root, "sess", "subagents", "workflows", "wf_1");
  mkdirSync(sub, { recursive: true });
  const write = (i, model) => {
    const file = join(sub, `agent-a${String(i).padStart(4, "0")}.jsonl`);
    const timestamp = new Date((NOW - 600) * 1000).toISOString();  // started ten minutes ago
    writeFileSync(file, `${JSON.stringify({ timestamp, message: { model } })}\n${JSON.stringify({ message: { model: "<synthetic>" } })}\n`);
    writeFileSync(file.replace(/\.jsonl$/, ".meta.json"), JSON.stringify({ description: `task ${i}` }));
    utimesSync(file, NOW - ageSecs, NOW - ageSecs);
  };
  let i = 0;
  for (let k = 0; k < opus; k++) write(i++, "claude-opus-5-5");
  for (let k = 0; k < sonnet; k++) write(i++, "claude-sonnet-5-5");
  // A finished agent: its last assistant message ended the turn with its report.
  for (let k = 0; k < done; k++) {
    const file = join(sub, `agent-a${String(i++).padStart(4, "0")}.jsonl`);
    const msg = (stop_reason) => JSON.stringify({ type: "assistant", message: { model: "claude-opus-5-5", stop_reason } });
    writeFileSync(file, `${msg("tool_use")}\n${msg("end_turn")}\n${JSON.stringify({ type: "attachment" })}\n`);
    utimesSync(file, NOW - ageSecs, NOW - ageSecs);
  }
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

test("the 2026-10-11 peak, 19 live Opus agents, refuses another Opus agent and lists the live ones to the lead", () => {
  const out = run(session({ opus: 19 }));
  assert.equal(decision(out), "deny");
  const text = out.hookSpecificOutput.permissionDecisionReason;
  assert.match(text, /19 Opus agents are live and the cap is 6; .*\. Live: a0018 claude-opus-5-5 10 min \(task 18\); a0017 /);
  assert.equal(text.match(/ min /g).length, 12);
  assert.match(text, /End your turn.*do the unit yourself/);
});

test("five live Opus agents admit a sixth", () => {
  assert.equal(decision(run(session({ opus: 5 }))), "allow");
});

test("at the Opus cap, a sonnet agent is still admitted", () => {
  assert.equal(decision(run(session({ opus: 6 }), "Agent", { model: "sonnet" })), "allow");
});

test("four live Opus agents refuse a Workflow, which counts as three (2026-10-11: five ran)", () => {
  const out = run(session({ opus: 4 }), "Workflow", { script: "export const meta = {}" });
  assert.equal(decision(out), "deny");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /4 Opus agents are live and the cap is 6/);
});

test("three live Opus agents still admit a Workflow", () => {
  assert.equal(decision(run(session({ opus: 3, sonnet: 2 }), "Workflow", { script: "x" })), "allow");
});

test("at the Opus cap, a Workflow launch or resume is refused", () => {
  assert.equal(decision(run(session({ opus: 6 }), "Workflow", { scriptPath: "/x.js", resumeFromRunId: "wf_x" })), "deny");
});

test("agents that finished inside the live window do not count (2026-10-24: 40 of 85 refusals)", () => {
  assert.equal(decision(run(session({ done: 4 }), "Workflow", { script: "x" })), "allow");
  assert.equal(decision(run(session({ opus: 6, done: 4 }))), "deny");
});

test("agents silent longer than the live window do not count", () => {
  assert.equal(decision(run(session({ opus: 19, ageSecs: 3600 }))), "allow");
});

test("the total cap refuses a thirteenth agent of any model", () => {
  const out = run(session({ opus: 6, sonnet: 6 }), "Agent", { model: "sonnet" });
  assert.equal(decision(out), "deny");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /12 agents are live and the total cap is 12/);
});

test("a subagent's or workflow agent's call resolves to the same session, and its denial says to do the unit itself", () => {
  const main = session({ opus: 6 });
  for (const sub of ["/subagents/agent-a0000.jsonl", "/subagents/workflows/wf_1/agent-a0000.jsonl"]) {
    const out = run(main.replace(/\.jsonl$/, sub));
    assert.equal(decision(out), "deny", sub);
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /do this unit yourself, in this turn/);
    assert.doesNotMatch(out.hookSpecificOutput.permissionDecisionReason, /Live:/);
  }
});

test("the session override allows the call and says so", () => {
  const out = run(session({ opus: 8 }), "Agent", {}, { CC_ALLOW_AGENT_OVERCAP: "1" });
  assert.equal(decision(out), "allow");
  assert.match(out.systemMessage, /allowed over the cap/);
});

test("SendMessage to an unfinished workflow agent is refused; a finished one or a teammate passes (2026-11-06)", () => {
  const s = session({ opus: 1, done: 1 }), to = (id) => decision(run(s, "SendMessage", { to: id }));
  assert.deepEqual(["a0000 [e5f71d]", "a0001", "researcher"].map(to), ["deny", "allow", "allow"]);
});

test("other tools pass silently", () => {
  assert.deepEqual(run(session({ opus: 19 }), "Bash", { command: "ls" }), {});
});
