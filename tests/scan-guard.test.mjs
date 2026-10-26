import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const hook = resolve("claude/hooks/scan-guard.sh");
const repo = mkdtempSync(join(tmpdir(), "scan-guard-repo-"));
const decide = (command, cwd = repo, platform = "") => {
  const env = { ...process.env, SCAN_GUARD_PLATFORM: platform };
  const out = spawnSync("bash", [hook], { input: JSON.stringify({ tool_name: "Bash", cwd, tool_input: { command } }), encoding: "utf8", env });
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

test("does not read script assignments, rg replacements or empty operands as broad searches (2026-10-17..24 refusals)", () => {
  for (const command of [
    "python3 - <<'EOF'\nfd = os.open(rootfs / 'sidecar.ext4.source', os.O_RDONLY)\ndu = (int(s['end']) - int(s['start'])) / 1e6\nEOF",
    "rg -n 'durable identity hydration' -r '' ../tests",
    "rg -n 'maxSystemPromptBytes' -r '' src tests scripts",
    "find .claude/projects -name '*.jsonl' -mtime -7 -print0 | du -ch --files0-from=- | tail -1",
  ]) {
    assert.equal(decide(command), null, command);
  }
  assert.equal(decide("grep -rl key ''", "/")?.permissionDecision, "deny");
});

test("on Linux, and after ssh, only walks that reach the archive drive or millions of entries are refused (10-19..26 refusals)", () => {
  // 202 of 319 refusals in that week were on Linux hosts, mostly finds bounded at depth 4-6 (16 s at most on drew-gtr-pro).
  for (const command of [
    "find / -xdev -maxdepth 6 -name config.toml 2>/dev/null | head",
    "find ~ -maxdepth 4 -type d -name agent-interface -not -path '*/node_modules/*'",
    "find /home/drew/.local/share -maxdepth 6 -name opencode.db",
    "grep -rl ORCHESTRATOR_ADMIN ~/.config",
  ]) {
    assert.equal(decide(command, repo, "Linux"), null, command);
  }
  for (const command of ["find / -maxdepth 6 -name x", "find ~ -name spans.jsonl", "grep -rl key ~/.local/state", "find /mnt -maxdepth 5 -name x"]) {
    assert.equal(decide(command, repo, "Linux")?.permissionDecision, "deny", command);
  }
  // From the Mac, a command after ssh is judged by the remote host's rules, with its own home.
  assert.equal(decide("ssh -o BatchMode=yes drew-gtr-pro 'find /home/drew/code -maxdepth 6 -name x'", repo, "Darwin"), null);
  assert.equal(decide("ssh gtr 'cd ~/wt/x/src && grep -n BATCH -r .. | head'", repo, "Darwin"), null);
  assert.equal(decide("ssh gtr 'find / -name x'", repo, "Darwin")?.permissionDecision, "deny");
  assert.equal(decide("find ~ -maxdepth 4 -name x; ssh gtr true", repo, "Darwin")?.permissionDecision, "deny");
});

test("a heredoc that cat writes to a file is data", () => {
  assert.equal(decide("cat > /tmp/t.sh <<'EOF'\nfind ~ -name x\nEOF\nbash -n /tmp/t.sh", repo, "Darwin"), null);
  assert.equal(decide("bash -s <<'EOF'\nfind ~ -name x\nEOF", repo, "Darwin")?.permissionDecision, "deny");
});

test.after(() => rmSync(repo, { recursive: true, force: true }));
