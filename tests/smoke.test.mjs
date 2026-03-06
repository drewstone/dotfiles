import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function run(cmd, args, cwd, env = process.env) {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8", env });
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
assert.match(readFileSync(join(repoRoot, ".githooks", "pre-push"), "utf8"), /bin\/ai-agent-hooks\.mjs/);

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
assert.match(config, /required:\s*true/);
assert.match(config, /model:\s*"gpt-5\.4"/);
assert.match(config, /reasoningEffort:\s*"high"/);

writeFileSync(
  configPath,
  `export default {
  artifactsDir: ".git/ai-agent-hooks/runs",
  hooks: {
    "pre-push": {
      checks: [
        {
          id: "codex-review",
          required: true,
          timeoutSec: 30,
          audit: {
            runner: "codex-review",
            model: "gpt-5.4",
            reasoningEffort: "high",
            prompt: "audit prompt",
            skipIfMissing: false
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

const fakeBinDir = join(repoRoot, "fake-bin");
const fakeCodexPath = join(fakeBinDir, "codex");
const codexArgsPath = join(repoRoot, "codex-args.txt");
const codexStdinPath = join(repoRoot, "codex-stdin.txt");
mkdirSync(fakeBinDir, { recursive: true });
writeFileSync(
  fakeCodexPath,
  `#!/usr/bin/env bash
printf '%s\n' "$@" > "${codexArgsPath}"
cat > "${codexStdinPath}"
printf 'No findings\n'
`,
  "utf8",
);
chmodSync(fakeCodexPath, 0o755);

result = run("node", [scriptPath, "run", "pre-push"], repoRoot, {
  ...process.env,
  PATH: `${fakeBinDir}:${process.env.PATH}`,
});
assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /ok codex-review/);

const runsDir = join(repoRoot, ".git", "ai-agent-hooks", "runs");
const runNames = readdirSync(runsDir).sort();
assert.equal(runNames.length > 0, true);
const latestRunDir = join(runsDir, runNames[runNames.length - 1]);
const summary = readFileSync(join(latestRunDir, "summary.json"), "utf8");
const promptOutput = readFileSync(join(repoRoot, "codex-stdin.txt"), "utf8");
const codexArgs = readFileSync(codexArgsPath, "utf8");
assert.match(summary, /codex-review/);
assert.match(promptOutput, /Changed files list:/);
assert.match(codexArgs, /review/);
assert.match(codexArgs, /model="gpt-5\.4"/);
assert.match(codexArgs, /model_reasoning_effort="high"/);

console.log("smoke test passed");
