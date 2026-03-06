import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  return result;
}

const repoRoot = mkdtempSync(join(tmpdir(), "ai-agent-hooks-"));
const scriptPath = resolve("bin/ai-agent-hooks.mjs");

let result = run("git", ["init"], repoRoot);
assert.equal(result.status, 0, result.stderr);

result = run("git", ["config", "user.email", "test@example.com"], repoRoot);
assert.equal(result.status, 0, result.stderr);

result = run("git", ["config", "user.name", "Test User"], repoRoot);
assert.equal(result.status, 0, result.stderr);

writeFileSync(join(repoRoot, "README.txt"), "hello\n", "utf8");
result = run("git", ["add", "README.txt"], repoRoot);
assert.equal(result.status, 0, result.stderr);
result = run("git", ["commit", "-m", "init"], repoRoot);
assert.equal(result.status, 0, result.stderr);

result = run("node", [scriptPath, "install", "--repo", repoRoot, "--init-config"], process.cwd());
assert.equal(result.status, 0, result.stderr || result.stdout);

assert.equal(existsSync(join(repoRoot, ".githooks", "pre-commit")), true);
assert.equal(existsSync(join(repoRoot, ".githooks", "pre-push")), true);
assert.equal(existsSync(join(repoRoot, ".ai-agent-hooks.mjs")), true);

result = run("git", ["config", "--get", "core.hooksPath"], repoRoot);
assert.equal(result.status, 0, result.stderr);
assert.equal(result.stdout.trim(), ".githooks");

result = run("node", [scriptPath, "doctor", "--repo", repoRoot], process.cwd());
assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /configured_hooks: pre-commit, pre-push/);

result = run("node", [scriptPath, "run", "pre-commit"], repoRoot);
assert.equal(result.status, 0, result.stderr || result.stdout);

const configPath = join(repoRoot, ".ai-agent-hooks.mjs");
const config = readFileSync(configPath, "utf8");
assert.match(config, /merge-conflict-markers/);
assert.match(config, /codex-review/);

writeFileSync(
  configPath,
  `export default {
  artifactsDir: ".git/ai-agent-hooks/runs",
  hooks: {
    "pre-push": {
      checks: [
        {
          id: "local-audit",
          required: true,
          timeoutSec: 30,
          audit: {
            runner: "command",
            prompt: "audit prompt",
            command: "node -e \\"const fs=require('node:fs');process.stdout.write(fs.readFileSync(process.env.AI_AGENT_HOOKS_PROMPT_FILE,'utf8'));\\""
          }
        }
      ]
    }
  }
};
`,
  "utf8",
);

writeFileSync(join(repoRoot, "README.txt"), "hello again\n", "utf8");
result = run("git", ["add", "README.txt"], repoRoot);
assert.equal(result.status, 0, result.stderr);
result = run("git", ["commit", "-m", "update"], repoRoot);
assert.equal(result.status, 0, result.stderr);

result = run("node", [scriptPath, "run", "pre-push"], repoRoot);
assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /ok local-audit/);

const runsDir = join(repoRoot, ".git", "ai-agent-hooks", "runs");
const runNames = readdirSync(runsDir).sort();
assert.equal(runNames.length > 0, true);
const latestRunDir = join(runsDir, runNames[runNames.length - 1]);
const summary = readFileSync(join(latestRunDir, "summary.json"), "utf8");
const promptOutput = readFileSync(join(latestRunDir, "local-audit.log"), "utf8");
assert.match(summary, /local-audit/);
assert.match(promptOutput, /Changed files list:/);

console.log("smoke test passed");
