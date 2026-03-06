#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PACKAGE_ROOT = resolve(dirname(SCRIPT_PATH), "..");
const HOOK_TEMPLATES_DIR = join(PACKAGE_ROOT, "hooks");
const CONFIG_TEMPLATE_PATH = join(PACKAGE_ROOT, "templates", "ai-agent-hooks.mjs");

const BUILTIN_IDS = new Set(["merge-conflict-markers", "suspicious-secrets"]);
const DEFAULT_AUDIT_PROMPT =
  "Review this change before it is pushed. Focus on correctness, regressions, security issues, missing tests, and production-readiness gaps. Return concise findings only. If there are no findings, say 'No findings'.";

function parseArgs(args) {
  const flags = new Map();
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    const maybeValue = args[index + 1];
    if (!maybeValue || maybeValue.startsWith("--")) {
      flags.set(key, true);
      continue;
    }

    flags.set(key, maybeValue);
    index += 1;
  }

  return { flags, positionals };
}

function runGit(cwd, args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) {
    throw new Error(result.stderr?.trim() || `git ${args.join(" ")} failed`);
  }
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function resolveRepoRoot(inputPath) {
  const cwd = inputPath ? resolve(inputPath) : process.cwd();
  const probe = runGit(cwd, ["rev-parse", "--show-toplevel"], true);
  if (!probe.ok) {
    throw new Error(`Not a git repository: ${cwd}`);
  }
  return probe.stdout.trim();
}

function formatHooksPathForGit(repoRoot, hooksDir) {
  if (hooksDir.startsWith(`${repoRoot}/`)) {
    return relative(repoRoot, hooksDir) || ".";
  }
  return hooksDir;
}

function copyHook({ source, destination, force }) {
  if (existsSync(destination) && !force) {
    throw new Error(`Hook already exists: ${destination} (pass --force to overwrite)`);
  }

  const template = readFileSync(source, "utf8").replaceAll("__AI_AGENT_HOOKS_BIN__", SCRIPT_PATH);
  writeFileSync(destination, template, "utf8");
  chmodSync(destination, 0o755);
}

function installConfigTemplate(repoRoot, force) {
  const configPath = join(repoRoot, ".ai-agent-hooks.mjs");
  if (existsSync(configPath) && !force) {
    return { created: false, path: configPath };
  }

  copyFileSync(CONFIG_TEMPLATE_PATH, configPath);
  return { created: true, path: configPath };
}

async function installCommand(rawArgs) {
  const { flags } = parseArgs(rawArgs);
  const repoRoot = resolveRepoRoot(flags.get("repo"));
  const force = Boolean(flags.get("force"));

  const currentHooksPath = runGit(repoRoot, ["config", "--get", "core.hooksPath"], true).stdout.trim();
  const requestedHooksPath = flags.get("hooks-dir");
  const hooksPath =
    typeof requestedHooksPath === "string"
      ? requestedHooksPath
      : currentHooksPath || ".githooks";

  const absoluteHooksDir = isAbsolute(hooksPath) ? hooksPath : resolve(repoRoot, hooksPath);
  mkdirSync(absoluteHooksDir, { recursive: true });

  for (const fileName of readdirSync(HOOK_TEMPLATES_DIR).sort()) {
    const source = join(HOOK_TEMPLATES_DIR, fileName);
    const destination = join(absoluteHooksDir, fileName);
    copyHook({ source, destination, force });
  }

  const gitHooksPath = formatHooksPathForGit(repoRoot, absoluteHooksDir);
  if (gitHooksPath !== currentHooksPath) {
    runGit(repoRoot, ["config", "core.hooksPath", gitHooksPath]);
  }

  if (flags.get("init-config")) {
    const result = installConfigTemplate(repoRoot, force);
    console.log(result.created ? `Created ${result.path}` : `Config exists: ${result.path}`);
  }

  console.log(`Installed hooks in ${absoluteHooksDir}`);
  console.log(`Set core.hooksPath=${gitHooksPath}`);
}

function initConfigCommand(rawArgs) {
  const { flags } = parseArgs(rawArgs);
  const repoRoot = resolveRepoRoot(flags.get("repo"));
  const force = Boolean(flags.get("force"));
  const result = installConfigTemplate(repoRoot, force);
  console.log(result.created ? `Created ${result.path}` : `Config exists: ${result.path}`);
}

function resolvePushDiffContext(repoRoot) {
  const upstream = runGit(repoRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], true);
  if (upstream.ok) {
    return {
      range: `${upstream.stdout.trim()}...HEAD`,
      baseRef: upstream.stdout.trim(),
      upstream: upstream.stdout.trim(),
    };
  }

  const previous = runGit(repoRoot, ["rev-parse", "--verify", "HEAD~1"], true);
  if (previous.ok) {
    return {
      range: "HEAD~1...HEAD",
      baseRef: "HEAD~1",
      upstream: "",
    };
  }

  return {
    range: "",
    baseRef: "",
    upstream: "",
  };
}

function changedFiles(repoRoot, hookName, pushContext = resolvePushDiffContext(repoRoot)) {
  if (hookName === "pre-commit") {
    const staged = runGit(
      repoRoot,
      ["diff", "--cached", "--name-only", "--diff-filter=ACMRTUXB"],
      true,
    );
    if (!staged.ok) {
      return [];
    }

    return staged.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const range = pushContext.range;
  if (!range) {
    return [];
  }

  const changed = runGit(
    repoRoot,
    ["diff", "--name-only", "--diff-filter=ACMRTUXB", range],
    true,
  );

  if (!changed.ok) {
    return [];
  }

  return changed.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function diffText(repoRoot, hookName, pushContext = resolvePushDiffContext(repoRoot)) {
  if (hookName === "pre-commit") {
    return runGit(
      repoRoot,
      ["diff", "--cached", "--binary", "--no-ext-diff", "--unified=3"],
      true,
    ).stdout;
  }

  if (!pushContext.range) {
    return "";
  }

  return runGit(
    repoRoot,
    ["diff", "--binary", "--no-ext-diff", "--unified=3", pushContext.range],
    true,
  ).stdout;
}

function currentBranch(repoRoot) {
  return runGit(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"], true).stdout.trim();
}

function commandExists(command) {
  return spawnSync("bash", ["-lc", `command -v ${command}`], { encoding: "utf8" }).status === 0;
}

function checkMergeConflictMarkers(repoRoot, files) {
  if (files.length === 0) {
    return { ok: true, status: 0, output: "No changed files to inspect." };
  }

  const result = spawnSync(
    "git",
    ["grep", "-nE", "^(<<<<<<<|=======|>>>>>>>)", "--", ...files],
    { cwd: repoRoot, encoding: "utf8" },
  );

  if (result.status === 0) {
    return {
      ok: false,
      status: 1,
      output: `Merge conflict markers found:\n${result.stdout}`,
    };
  }

  if (result.status === 1) {
    return { ok: true, status: 0, output: "No conflict markers found." };
  }

  return {
    ok: false,
    status: result.status || 1,
    output: result.stderr || "git grep failed while scanning conflict markers",
  };
}

function checkSuspiciousSecrets(repoRoot, files) {
  if (files.length === 0) {
    return { ok: true, status: 0, output: "No changed files to inspect." };
  }

  const patterns = [
    { id: "openai", regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
    { id: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
    { id: "github-token", regex: /\bghp_[A-Za-z0-9]{36}\b/g },
    { id: "private-key", regex: /-----BEGIN (RSA|EC|OPENSSH|DSA) PRIVATE KEY-----/g },
    { id: "slack-token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  ];
  const allowHints = ["example", "dummy", "placeholder", "redacted", "sample"];
  const findings = [];

  for (const relativePath of files) {
    const absPath = join(repoRoot, relativePath);
    if (!existsSync(absPath)) {
      continue;
    }

    let file;
    try {
      file = readFileSync(absPath, "utf8");
    } catch {
      continue;
    }

    const lines = file.split("\n");
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const lowered = line.toLowerCase();
      if (allowHints.some((hint) => lowered.includes(hint))) {
        continue;
      }

      for (const pattern of patterns) {
        if (pattern.regex.test(line)) {
          findings.push(`${relativePath}:${lineIndex + 1} (${pattern.id})`);
        }
        pattern.regex.lastIndex = 0;
      }
    }
  }

  if (findings.length > 0) {
    return {
      ok: false,
      status: 1,
      output: `Suspicious secrets found:\n${findings.join("\n")}`,
    };
  }

  return { ok: true, status: 0, output: "No suspicious secrets found." };
}

function runBuiltin(builtin, context) {
  if (builtin === "merge-conflict-markers") {
    return checkMergeConflictMarkers(context.repoRoot, context.files);
  }

  if (builtin === "suspicious-secrets") {
    return checkSuspiciousSecrets(context.repoRoot, context.files);
  }

  return { ok: false, status: 1, output: `Unknown builtin check: ${builtin}` };
}

function runProcess({ command, args, cwd, timeoutSec, logPath, env = process.env, stdinText = "" }) {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now();
    let settled = false;
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000);
    }, Math.max(1, timeoutSec) * 1000);

    if (stdinText) {
      child.stdin.write(stdinText);
    }
    child.stdin.end();

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      writeFileSync(logPath, error.message, "utf8");
      resolvePromise({ ok: false, status: 1, elapsedMs: Date.now() - startedAt });
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const elapsedMs = Date.now() - startedAt;
      const status = timedOut ? 124 : code ?? 1;
      const ok = status === 0;
      const finalOutput = timedOut ? `${output}\nTimed out after ${timeoutSec}s` : output;

      writeFileSync(logPath, finalOutput, "utf8");
      resolvePromise({ ok, status, elapsedMs });
    });
  });
}

function runShell(command, cwd, timeoutSec, logPath, env = process.env) {
  return runProcess({
    command: "bash",
    args: ["-lc", command],
    cwd,
    timeoutSec,
    logPath,
    env,
  });
}

function buildAuditPrompt(check, context, artifactPaths) {
  const basePrompt = typeof check.prompt === "string" && check.prompt.trim()
    ? check.prompt.trim()
    : DEFAULT_AUDIT_PROMPT;

  return [
    basePrompt,
    "",
    `Repository root: ${context.repoRoot}`,
    `Hook: ${context.hookName}`,
    `Branch: ${context.branch || "(unknown)"}`,
    `Diff range: ${context.pushContext.range || "staged changes"}`,
    `Changed files list: ${artifactPaths.changedFilesPath}`,
    `Unified diff patch: ${artifactPaths.diffPath}`,
    "",
    "Read the changed files list and diff patch before producing findings.",
  ].join("\n");
}

function writeAuditArtifacts(runDir, checkId, context, check) {
  const promptPath = join(runDir, `${slug(checkId)}.prompt.txt`);
  const diffPath = join(runDir, `${slug(checkId)}.diff.patch`);
  const changedFilesPath = join(runDir, `${slug(checkId)}.changed-files.txt`);
  const contextPath = join(runDir, `${slug(checkId)}.git-context.json`);

  writeFileSync(diffPath, context.diff || "", "utf8");
  writeFileSync(changedFilesPath, context.files.join("\n"), "utf8");
  writeFileSync(
    contextPath,
    JSON.stringify(
      {
        hook: context.hookName,
        branch: context.branch,
        diffRange: context.pushContext.range,
        baseRef: context.pushContext.baseRef,
        upstream: context.pushContext.upstream,
        changedFiles: context.files,
      },
      null,
      2,
    ),
    "utf8",
  );

  const prompt = buildAuditPrompt(check, context, {
    diffPath,
    changedFilesPath,
    contextPath,
  });
  writeFileSync(promptPath, prompt, "utf8");

  return {
    prompt,
    promptPath,
    diffPath,
    changedFilesPath,
    contextPath,
  };
}

function skippedOutcome(logPath, reason) {
  writeFileSync(logPath, reason, "utf8");
  return {
    ok: true,
    skipped: true,
    status: 0,
    elapsedMs: 0,
  };
}

async function runAudit(check, context, logPath, runDir) {
  const artifacts = writeAuditArtifacts(runDir, check.id, context, check);
  const env = {
    ...process.env,
    AI_AGENT_HOOKS_PROMPT_FILE: artifacts.promptPath,
    AI_AGENT_HOOKS_DIFF_FILE: artifacts.diffPath,
    AI_AGENT_HOOKS_CHANGED_FILES_FILE: artifacts.changedFilesPath,
    AI_AGENT_HOOKS_GIT_CONTEXT_FILE: artifacts.contextPath,
    AI_AGENT_HOOKS_REPO_ROOT: context.repoRoot,
    AI_AGENT_HOOKS_HOOK: context.hookName,
    AI_AGENT_HOOKS_DIFF_RANGE: context.pushContext.range || "",
  };

  if (check.runner === "codex-review") {
    if (!commandExists("codex")) {
      if (check.skipIfMissing) {
        return skippedOutcome(logPath, "Skipped codex-review: codex CLI not found.");
      }
      throw new Error("codex CLI not found");
    }

    const args = ["review"];
    if (check.model) {
      args.push("-c", `model=${JSON.stringify(check.model)}`);
    }
    if (context.pushContext.baseRef) {
      args.push("--base", context.pushContext.baseRef, "-");
    } else {
      args.push("--uncommitted", "-");
    }

    return runProcess({
      command: "codex",
      args,
      cwd: context.repoRoot,
      timeoutSec: check.timeoutSec,
      logPath,
      env,
      stdinText: artifacts.prompt,
    });
  }

  if (check.runner === "claude") {
    if (!commandExists("claude")) {
      if (check.skipIfMissing) {
        return skippedOutcome(logPath, "Skipped claude audit: claude CLI not found.");
      }
      throw new Error("claude CLI not found");
    }

    const args = [
      "-p",
      "--output-format",
      "text",
      "--permission-mode",
      "bypassPermissions",
    ];
    if (check.model) {
      args.push("--model", check.model);
    }
    args.push(artifacts.prompt);

    return runProcess({
      command: "claude",
      args,
      cwd: context.repoRoot,
      timeoutSec: check.timeoutSec,
      logPath,
      env,
    });
  }

  if (check.runner === "command") {
    return runShell(check.command, context.repoRoot, check.timeoutSec, logPath, env);
  }

  throw new Error(`Unknown audit runner: ${check.runner}`);
}

function normalizeChecks(hookConfig) {
  const checks = Array.isArray(hookConfig?.checks) ? hookConfig.checks : [];
  return checks.map((check, index) => {
    if (typeof check !== "object" || check === null) {
      throw new Error(`Invalid check at index ${index}`);
    }

    const id = typeof check.id === "string" && check.id.trim() ? check.id : `check-${index + 1}`;
    const required = check.required !== false;
    const group = check.group === "ensemble" ? "ensemble" : "sequential";
    const timeoutSec =
      typeof check.timeoutSec === "number" && Number.isFinite(check.timeoutSec) ? check.timeoutSec : 300;

    if (typeof check.builtin === "string") {
      if (!BUILTIN_IDS.has(check.builtin)) {
        throw new Error(`Unknown builtin '${check.builtin}' for check '${id}'`);
      }
      return { id, required, group, timeoutSec, kind: "builtin", builtin: check.builtin };
    }

    if (typeof check.audit === "object" && check.audit !== null) {
      const runner = typeof check.audit.runner === "string" ? check.audit.runner : "";
      if (!runner) {
        throw new Error(`Audit check '${id}' is missing audit.runner`);
      }

      return {
        id,
        required,
        group,
        timeoutSec,
        kind: "audit",
        runner,
        command: typeof check.audit.command === "string" ? check.audit.command : "",
        prompt: typeof check.audit.prompt === "string" ? check.audit.prompt : DEFAULT_AUDIT_PROMPT,
        model: typeof check.audit.model === "string" ? check.audit.model : "",
        skipIfMissing: check.audit.skipIfMissing === true,
      };
    }

    if (typeof check.run === "string" && check.run.trim()) {
      return { id, required, group, timeoutSec, kind: "shell", run: check.run };
    }

    throw new Error(`Check '${id}' must define either 'builtin' or 'run'`);
  });
}

function defaultConfig() {
  return {
    artifactsDir: ".git/ai-agent-hooks/runs",
    hooks: {
      "pre-commit": {
        checks: [
          { id: "merge-conflict-markers", builtin: "merge-conflict-markers", required: true },
          { id: "suspicious-secrets", builtin: "suspicious-secrets", required: true },
        ],
      },
      "pre-push": {
        checks: [
          { id: "merge-conflict-markers", builtin: "merge-conflict-markers", required: true },
          { id: "suspicious-secrets", builtin: "suspicious-secrets", required: true },
          {
            id: "codex-review",
            group: "ensemble",
            required: false,
            timeoutSec: 900,
            audit: {
              runner: "codex-review",
              prompt: DEFAULT_AUDIT_PROMPT,
              skipIfMissing: true,
            },
          },
          {
            id: "claude-review",
            group: "ensemble",
            required: false,
            timeoutSec: 900,
            audit: {
              runner: "claude",
              prompt: DEFAULT_AUDIT_PROMPT,
              skipIfMissing: true,
            },
          },
        ],
      },
    },
  };
}

async function loadConfig(repoRoot) {
  const modulePath = join(repoRoot, ".ai-agent-hooks.mjs");
  if (existsSync(modulePath)) {
    const mod = await import(`${pathToFileURL(modulePath).href}?ts=${Date.now()}`);
    return mod.default || defaultConfig();
  }

  const jsonPath = join(repoRoot, ".ai-agent-hooks.json");
  if (existsSync(jsonPath)) {
    return JSON.parse(readFileSync(jsonPath, "utf8"));
  }

  return defaultConfig();
}

function slug(value) {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

function writeSummary(runDir, hookName, results) {
  writeFileSync(
    join(runDir, "summary.json"),
    JSON.stringify(
      {
        hook: hookName,
        finishedAt: new Date().toISOString(),
        results,
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function runHookCommand(rawArgs) {
  const { positionals } = parseArgs(rawArgs);
  const hookName = positionals[0];
  if (hookName !== "pre-commit" && hookName !== "pre-push") {
    throw new Error("run requires hook name: pre-commit or pre-push");
  }

  const repoRoot = resolveRepoRoot();
  const config = await loadConfig(repoRoot);
  const hookConfig = config?.hooks?.[hookName];
  const checks = normalizeChecks(hookConfig);

  if (checks.length === 0) {
    console.log(`No checks configured for ${hookName}`);
    process.exit(0);
  }

  const artifactsRoot = resolve(repoRoot, config.artifactsDir || ".git/ai-agent-hooks/runs");
  const runDir = join(
    artifactsRoot,
    slug(`${new Date().toISOString().replaceAll(":", "-")}-${hookName}`),
  );
  mkdirSync(runDir, { recursive: true });

  const pushContext = resolvePushDiffContext(repoRoot);
  const files = changedFiles(repoRoot, hookName, pushContext);
  const context = {
    repoRoot,
    hookName,
    branch: currentBranch(repoRoot),
    pushContext,
    files,
    diff: diffText(repoRoot, hookName, pushContext),
  };

  console.log(`ai-agent-hooks: hook=${hookName}`);
  console.log(`ai-agent-hooks: changed_files=${files.length}`);
  console.log(`ai-agent-hooks: artifacts=${runDir}`);

  const sequentialChecks = checks.filter((check) => check.group === "sequential");
  const ensembleChecks = checks.filter((check) => check.group === "ensemble");
  const results = [];

  for (const check of sequentialChecks) {
    const logPath = join(runDir, `${slug(check.id)}.log`);
    const started = Date.now();

    let outcome;
    if (check.kind === "builtin") {
      outcome = runBuiltin(check.builtin, context);
      writeFileSync(logPath, outcome.output || "", "utf8");
      outcome.elapsedMs = Date.now() - started;
    } else if (check.kind === "audit") {
      outcome = await runAudit(check, context, logPath, runDir);
    } else {
      outcome = await runShell(check.run, repoRoot, check.timeoutSec, logPath);
    }

    const result = {
      id: check.id,
      required: check.required,
      ok: outcome.ok,
      status: outcome.status,
      elapsedMs: outcome.elapsedMs,
      logPath,
      skipped: outcome.skipped === true,
    };

    results.push(result);
    console.log(
      `- ${
        result.skipped ? "skipped" : result.ok ? "ok" : result.required ? "failed" : "warn"
      } ${check.id}`,
    );

    if (!result.ok && result.required) {
      writeSummary(runDir, hookName, results);
      process.exit(1);
    }
  }

  if (ensembleChecks.length > 0) {
    const ensembleResults = await Promise.all(
      ensembleChecks.map(async (check) => {
        const logPath = join(runDir, `${slug(check.id)}.log`);
        const started = Date.now();

        if (check.kind === "builtin") {
          const outcome = runBuiltin(check.builtin, context);
          writeFileSync(logPath, outcome.output || "", "utf8");
          return {
            id: check.id,
            required: check.required,
            ok: outcome.ok,
            status: outcome.status,
            elapsedMs: Date.now() - started,
            logPath,
            skipped: false,
          };
        }

        if (check.kind === "audit") {
          const outcome = await runAudit(check, context, logPath, runDir);
          return {
            id: check.id,
            required: check.required,
            ok: outcome.ok,
            status: outcome.status,
            elapsedMs: outcome.elapsedMs,
            logPath,
            skipped: outcome.skipped === true,
          };
        }

        const outcome = await runShell(check.run, repoRoot, check.timeoutSec, logPath);
        return {
          id: check.id,
          required: check.required,
          ok: outcome.ok,
          status: outcome.status,
          elapsedMs: outcome.elapsedMs,
          logPath,
          skipped: false,
        };
      }),
    );

    results.push(...ensembleResults);
    for (const result of ensembleResults) {
      console.log(
        `- ${
          result.skipped ? "skipped" : result.ok ? "ok" : result.required ? "failed" : "warn"
        } ${result.id}`,
      );
    }
  }

  writeSummary(runDir, hookName, results);
  if (results.some((result) => !result.ok && result.required)) {
    process.exit(1);
  }

  process.exit(0);
}

async function doctorCommand(rawArgs) {
  const { flags } = parseArgs(rawArgs);
  const repoRoot = resolveRepoRoot(flags.get("repo"));
  const config = await loadConfig(repoRoot);
  const hooksPath = runGit(repoRoot, ["config", "--get", "core.hooksPath"], true).stdout.trim();

  console.log(`repo: ${repoRoot}`);
  console.log(`core.hooksPath: ${hooksPath || "(not set)"}`);
  const configuredHooks = config?.hooks ? Object.keys(config.hooks) : [];
  console.log(`configured_hooks: ${configuredHooks.join(", ") || "(none)"}`);

  for (const hookName of configuredHooks) {
    const checks = normalizeChecks(config.hooks[hookName]);
    console.log(`- ${hookName}: ${checks.length} checks`);
  }
}

function printHelp() {
  console.log(`ai-agent-hooks

Usage:
  ai-agent-hooks install [--repo <path>] [--hooks-dir <path>] [--force] [--init-config]
  ai-agent-hooks init-config [--repo <path>] [--force]
  ai-agent-hooks run <pre-commit|pre-push>
  ai-agent-hooks doctor [--repo <path>]
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "-h" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "install") {
    await installCommand(args.slice(1));
    return;
  }

  if (command === "init-config") {
    initConfigCommand(args.slice(1));
    return;
  }

  if (command === "run") {
    await runHookCommand(args.slice(1));
    return;
  }

  if (command === "doctor") {
    await doctorCommand(args.slice(1));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`ai-agent-hooks error: ${error.message}`);
  process.exit(1);
});
