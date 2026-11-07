import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const tool = resolve("claude/tools/unattended");
const env = (state) => ({ ...process.env, XDG_STATE_HOME: state });

test("runs the command below interactive priority and returns its exit code", () => {
  const state = mkdtempSync(join(tmpdir(), "unattended-"));
  try {
    const shown = spawnSync("bash", [tool, "--name", "probe", "--", "bash", "-c", "nice; exit 7"], { encoding: "utf8", env: env(state) });
    assert.equal(shown.status, 7, shown.stderr);
    assert.equal(shown.stdout.trim(), "10");
    assert.equal(existsSync(join(state, "unattended", `probe.${shown.pid}.pid`)), false);
  } finally { rmSync(state, { recursive: true, force: true }); }
});

test("waits while the host already runs its cap of unattended jobs, and ignores stale pid files", async () => {
  const state = mkdtempSync(join(tmpdir(), "unattended-"));
  try {
    mkdirSync(join(state, "unattended"), { recursive: true });
    writeFileSync(join(state, "unattended", "dead.999999.pid"), "999999");
    const first = spawn("bash", [tool, "--name", "first", "--max", "1", "--", "sleep", "3"], { env: env(state), stdio: "ignore" });
    await new Promise((ok) => setTimeout(ok, 500));
    const started = Date.now();
    const second = spawnSync("bash", [tool, "--name", "second", "--max", "1", "--", "true"], { encoding: "utf8", env: env(state) });
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stderr, /1 jobs already run on .*; second waits/);
    assert.ok(Date.now() - started >= 2000);
    await new Promise((ok) => first.on("close", ok));
  } finally { rmSync(state, { recursive: true, force: true }); }
});

test("refuses a bad name, cap or missing command", () => {
  for (const args of [["--name", "a b", "--", "true"], ["--max", "0", "--", "true"], ["--name", "x"]]) {
    assert.equal(spawnSync("bash", [tool, ...args], { encoding: "utf8" }).status, 2);
  }
});
