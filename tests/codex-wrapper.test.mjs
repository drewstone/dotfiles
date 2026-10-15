import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
        // The wrapper's fast path execs the first codex it can name, and on a host with the
        // Homebrew build that is the real binary, not the fake under NVM_DIR: this test then
        // ran real codex with `run` and read its usage error. Pin the fake through the same
        // override an operator would use.
        CODEX_REAL_BIN: fakeCodexPath,
        CODEX_HOME: testRoot,
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

test("new brokers and exec calls allocate once through acct and retain explicit pins", () => {
  const home = mkdtempSync(join(tmpdir(), "codex-routing-"));
  const bin = join(home, "bin");
  mkdirSync(bin);
  const real = join(bin, "codex");
  const log = join(home, "route.json");
  writeFileSync(real, `#!/usr/bin/env node
require('fs').writeFileSync(process.env.ROUTE_LOG, JSON.stringify({args: process.argv.slice(2), routed: process.env.ACCT_ROUTED, home: process.env.CODEX_HOME}));
process.exit(Number(process.env.CODEX_EXIT || 0));
`);
  writeFileSync(join(bin, "acct"), `#!/usr/bin/env bash
printf '%s\\n' "$@" > "$ACCT_ARGS"
[ "$1" = run ] && [ "$2" = -- ] || exit 90
shift 2
export ACCT_ROUTED=codex CODEX_HOME="$ALLOCATED_HOME"
exec "$@"
`);
  chmodSync(real, 0o755);
  chmodSync(join(bin, "acct"), 0o755);
  writeFileSync(join(bin, "getent"), '#!/bin/sh\nprintf "fixture:x:1:1::%s:/bin/bash\\n" "$FIXTURE_HOME"\n');
  chmodSync(join(bin, "getent"), 0o755);
  mkdirSync(join(home, ".local/bin"), { recursive: true });
  symlinkSync(real, join(home, ".local/bin/codex"));
  const route = (args, extra = {}) => {
    rmSync(join(home, "acct.args"), { force: true });
    const result = spawnSync(wrapperPath, args, {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CODEX_REAL_BIN: real,
        HOME: home, XDG_CONFIG_HOME: join(home, ".config"), CODEX_HOME: "", ACCT_ROUTED: "", ROUTE_LOG: log, ACCT_ARGS: join(home, "acct.args"),
        ALLOCATED_HOME: join(home, "allocated"), FIXTURE_HOME: home, ...extra },
    });
    return { result, launch: JSON.parse(readFileSync(log, "utf8")) };
  };
  try {
    for (const args of [["app-server"], ["exec", "prompt with spaces", "--model", "explicit-model"],
      ["--model", "explicit-model", "exec", "prompt"]]) {
      const { result, launch } = route(args, { ACCT_ROUTED: "claude" });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(readFileSync(join(home, "acct.args"), "utf8").trimEnd().split("\n"), ["run", "--", real, ...args]);
      assert.deepEqual(launch, { args, routed: "codex", home: join(home, "allocated") });
    }
    for (const [args, extra] of [
      [["exec", "pinned"], { CODEX_HOME: join(home, "pinned") }],
      [["app-server"], { ACCT_ROUTED: "codex" }],
      [["login", "status"], {}], [["--version"], {}],
      [["app-server", "--help"], {}], [["exec", "-h"], {}],
      [["app-server", "generate-ts", "--out", "/fixture/output"], {}],
      [["app-server", "generate-json-schema", "--out", "/fixture/output"], {}],
      [["app-server", "daemon", "status"], {}], [["app-server", "proxy"], {}],
      [["exec", "--oss", "--local-provider", "ollama", "local prompt"], {}],
      [["--oss", "exec", "local prompt"], {}],
      [["exec", "--local-provider=lmstudio", "local prompt"], {}],
    ]) {
      const { result, launch } = route(args, extra);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(launch.args, args);
      assert.throws(() => readFileSync(join(home, "acct.args")), { code: "ENOENT" });
    }
    assert.equal(route(["exec", "failure"], { CODEX_EXIT: "29" }).result.status, 29);
    // Linux provisioning installs this native binary even without nvm.
    if (process.platform === "linux") {
      assert.equal(route(["app-server", "--listen=unix:///fixture/socket"], { CODEX_REAL_BIN: "", NVM_DIR: join(home, "no-nvm") }).result.status, 0);
      assert.equal(readFileSync(join(home, "acct.args"), "utf8").split("\n")[2], join(home, ".local/bin/codex"));
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
