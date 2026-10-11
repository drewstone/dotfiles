import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const hook = resolve("claude/hooks/scan-guard.sh");
const repo = mkdtempSync(join(tmpdir(), "scan-guard-repo-"));
const decide = (command, cwd = repo) => {
  const out = spawnSync("bash", [hook], { input: JSON.stringify({ tool_name: "Bash", cwd, tool_input: { command } }), encoding: "utf8" });
  assert.equal(out.status, 0);
  return out.stdout.trim() ? JSON.parse(out.stdout).hookSpecificOutput : null;
};
// pid 2337110 on drew-gtr-pro, 2026-10-11, from a Codex session.
const RUNAWAY = "find / -name 'OpenCode_raw_evidence_public_SDK__real_.log' -o -name 'climb.md' 2>/dev/null | head -40";

test("refuses the runaway find as Claude and as Codex send it, and names the narrower tools", () => {
  for (const command of [RUNAWAY, ["/bin/bash", "-c", RUNAWAY], ["bash", "-lc", RUNAWAY]]) {
    const decision = decide(command);
    assert.equal(decision?.permissionDecision, "deny", JSON.stringify(command));
    assert.match(decision.permissionDecisionReason, /git grep/);
    assert.match(decision.permissionDecisionReason, /fd <name> <path>/);
    assert.match(decision.permissionDecisionReason, /qmd/);
  }
});

test("allows finds inside a repo or a named path, and bounded finds on a broad root", () => {
  for (const command of ["find . -name x", "find /some/path -maxdepth 3", "find / -maxdepth 2 -name x", "find /mnt -xdev -name x", ["find", "/some/path", "-name", "x"]]) {
    assert.equal(decide(command), null, JSON.stringify(command));
  }
});

test("refuses unbounded finds that -xdev does not bound", () => {
  for (const command of ["find / -xdev -name x", "find ~ -xdev -name x", "find / -maxdepth 5 -name x", "find /mnt -name x", "cd ~ && find . -name x"]) {
    assert.equal(decide(command)?.permissionDecision, "deny", command);
  }
});

test.after(() => rmSync(repo, { recursive: true, force: true }));
