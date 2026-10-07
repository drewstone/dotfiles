import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const hook = resolve("git/hooks/commit-msg");

function run(message, env = {}) {
  const file = join(mkdtempSync(join(tmpdir(), "commit-msg-")), "COMMIT_EDITMSG");
  writeFileSync(file, message);
  return spawnSync("bash", [hook, file], { encoding: "utf8", env: { ...process.env, ...env } });
}

test("refuses a co-authorship trailer in any case, even with the secret escape hatch", () => {
  for (const trailer of ["Co-Authored-By: Claude <noreply@anthropic.com>", "co-authored-by: someone <a@b.c>"]) {
    const result = run(`feat: thing\n\nbody\n\n${trailer}\n`, { GIT_ALLOW_SECRET_IN_MESSAGE: "1" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no co-authorship trailers/);
  }
});

test("accepts a message without a trailer, and ignores comment lines", () => {
  assert.equal(run("feat: thing\n\nbody\n").status, 0);
  assert.equal(run("feat: thing\n# Co-authored-by: in a comment\n").status, 0);
});
