import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const hook = resolve("claude/hooks/artifact-guard.py");
const decide = (payload) => {
  const out = spawnSync("python3", [hook], { input: typeof payload === "string" ? payload : JSON.stringify(payload), encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout.trim() ? JSON.parse(out.stdout).hookSpecificOutput : null;
};

test("refuses publishing a page, as a default call, an explicit publish, an update and an asset upload", () => {
  for (const tool_input of [
    { file_path: "/tmp/page.html", icon: "chart" },
    { action: "publish", file_path: "/tmp/page.html" },
    { action: "publish", file_path: "/tmp/page.html", url: "https://claude.ai/artifact/abc" },
    { action: "publish", url: "https://claude.ai/artifact/abc", asset: true, file_path: "/tmp/a.png" },
    { action: "pin", url: "https://claude.ai/artifact/abc" },
  ]) {
    const decision = decide({ tool_name: "Artifact", tool_input });
    assert.equal(decision?.permissionDecision, "deny", JSON.stringify(tool_input));
    assert.match(decision.permissionDecisionReason, /~\/reviews\//);
    assert.match(decision.permissionDecisionReason, /open <path>/);
  }
});

test("allows reading, listing and deleting, so a pasted link can still be read", () => {
  for (const action of ["read", "list", "delete"]) {
    assert.equal(decide({ tool_name: "Artifact", tool_input: { action, url: "https://claude.ai/artifact/abc" } }), null, action);
  }
});

test("ignores other tools and fails open on input it cannot parse", () => {
  assert.equal(decide({ tool_name: "Bash", tool_input: { command: "ls" } }), null);
  assert.equal(decide("not json"), null);
});

test("settings route every Artifact call through the guard", () => {
  const settings = JSON.parse(readFileSync(resolve("claude/settings.json"), "utf8"));
  const entry = settings.hooks.PreToolUse.find((m) => m.matcher === "Artifact");
  assert.ok(entry, "no PreToolUse matcher for Artifact");
  assert.ok(entry.hooks.some((h) => h.command.endsWith("/hooks/artifact-guard.py")));
});
