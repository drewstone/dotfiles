import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

// The gh shim routes plain `gh` through gh-drew so no pane spends the shared
// token unlogged. Nothing here reaches GitHub or the real binaries.
const shim = resolve("claude/tools/gh");

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "gh-shim-"));
  const home = join(root, "home");
  const bin = join(home, "bin");
  mkdirSync(bin, { recursive: true });

  const fakeDrew = join(bin, "gh-drew");
  writeFileSync(fakeDrew, `#!/usr/bin/env bash
printf 'gh-drew shim=%s args=%s\\n' "\${GH_DREW_SHIM:-unset}" "$*"
`);
  chmodSync(fakeDrew, 0o755);

  const realGh = join(root, "real-gh");
  writeFileSync(realGh, `#!/usr/bin/env bash
printf 'real-gh shim=%s args=%s\\n' "\${GH_DREW_SHIM:-unset}" "$*"
`);
  chmodSync(realGh, 0o755);

  const env = { PATH: `${bin}:${process.env.PATH}`, HOME: home,
    GH_SHIM_REAL_GH: realGh, GH_SHIM_GH_DREW: fakeDrew };
  return { root, env };
}

test("without the marker the shim delegates to gh-drew and exports the marker", () => {
  const s = sandbox();
  try {
    const result = spawnSync(shim, ["pr", "view", "301"], { env: s.env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "gh-drew shim=1 args=pr view 301");
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("with the marker set the shim runs the real gh directly", () => {
  const s = sandbox();
  try {
    const result = spawnSync(shim, ["api", "rate_limit"], { env: { ...s.env, GH_DREW_SHIM: "1" }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "real-gh shim=1 args=api rate_limit");
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});
