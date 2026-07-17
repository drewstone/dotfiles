import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const wrapperPath = resolve("claude/tools/codex");

test("maps legacy run calls to exec without changing current exec calls", () => {
  const testRoot = mkdtempSync(join(tmpdir(), "codex-wrapper-"));
  const nvmDir = join(testRoot, "nvm");
  const fakeBinDir = join(nvmDir, "versions", "node", "v-test", "bin");
  const fakeCodexPath = join(fakeBinDir, "codex");
  const argsPath = join(testRoot, "args.txt");

  mkdirSync(fakeBinDir, { recursive: true });
  writeFileSync(
    fakeCodexPath,
    `#!/usr/bin/env bash
printf '%s\\n' "$@" > "$CODEX_ARGS_FILE"
`,
    "utf8",
  );
  chmodSync(fakeCodexPath, 0o755);

  const runWrapper = (args) => {
    const result = spawnSync(wrapperPath, args, {
      encoding: "utf8",
      env: {
        ...process.env,
        CODEX_ARGS_FILE: argsPath,
        NVM_DIR: nvmDir,
      },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return readFileSync(argsPath, "utf8").trimEnd().split("\n");
  };

  try {
    assert.deepEqual(runWrapper(["run", "legacy prompt", "run"]), ["exec", "legacy prompt", "run"]);
    assert.deepEqual(runWrapper(["exec", "current prompt", "--json"]), ["exec", "current prompt", "--json"]);
  } finally {
    rmSync(testRoot, { recursive: true, force: true });
  }
});
