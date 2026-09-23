import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const HOOK = resolve("claude/hooks/kill-guard.sh");
const HOME = mkdtempSync(join(tmpdir(), "kill-guard-"));
const JQ_AVAILABLE = spawnSync("/bin/sh", ["-c", "command -v jq"]).status === 0;

function decide(command, env = {}) {
  const r = spawnSync("/bin/bash", [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    env: { ...process.env, HOME, ...env },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  if (!r.stdout.trim()) return "allow";
  return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
}

test("missing jq denies Bash commands instead of allowing broad kills", () => {
  const bin = mkdtempSync(join(tmpdir(), "kill-guard-no-jq-"));
  symlinkSync("/bin/mkdir", join(bin, "mkdir"));
  symlinkSync("/bin/date", join(bin, "date"));
  assert.equal(decide("pkill -f foo", { PATH: bin }), "deny");
  assert.equal(decide("echo safe", { PATH: bin }), "deny");
});

const DENY = [
  // The command that caused the incident, verbatim.
  "pkill -f 'cli-bridge-8921.*' -P 1",
  "pkill -f monitor-armb.sh",
  "sudo pkill node",
  "/usr/bin/pkill -9 python",
  "killall Slack",
  "cd /tmp && killall -9 node",
  "timeout 10 pkill -f x",
  "echo start; pkill -f foo; echo done",
  "if true; then pkill -f foo; fi",
  "pgrep -f cli-bridge | xargs kill",
  "pgrep -f cli-bridge | xargs -r kill -9",
  "kill -9 -1",
  "kill -- -1",
  "kill -TERM -12345",
  "kill -s TERM -1",
  "kill 0",
];

const ALLOW = [
  "kill 12345",
  "kill -9 12345 67890",
  "kill -TERM $(lsof -tiTCP:8921 -sTCP:LISTEN)",
  "kill $(cat /tmp/bridge.pid)",
  "pgrep -fl cli-bridge",
  "grep -n pkill ~/.claude/logs/kill-guard.log",
  "echo 'never use pkill'",
  "git commit -m 'feat: kill-guard refuses pkill and killall'",
  "ps -eo pid,command | grep pkill",
  "kill -0 12345",
  "kill -0 $PID 2>/dev/null && echo alive",
];

for (const command of DENY) {
  test(`denies: ${command}`, { skip: !JQ_AVAILABLE && "jq not installed" }, () => assert.equal(decide(command), "deny"));
}
for (const command of ALLOW) {
  test(`allows: ${command}`, { skip: !JQ_AVAILABLE && "jq not installed" }, () => assert.equal(decide(command), "allow"));
}

test("the user override lets a denied command through and records it", { skip: !JQ_AVAILABLE && "jq not installed" }, () => {
  assert.equal(decide("pkill -f foo", { CC_ALLOW_BROADCAST_KILL: "1" }), "allow");
});

test("non-Bash tools pass through", { skip: !JQ_AVAILABLE && "jq not installed" }, () => {
  const r = spawnSync("bash", [HOOK], {
    input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: "/tmp/pkill.txt" } }),
    env: { ...process.env, HOME },
    encoding: "utf8",
  });
  assert.equal(r.stdout.trim(), "");
});
