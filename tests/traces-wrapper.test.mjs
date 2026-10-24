// The traces wrapper through its boundary: argv in, the CLI's stdout or a refusal on stderr out.
// A build from any commit but the checkout's HEAD must never run (2026-10-24: a 10-07 dist ran at a 10-23 HEAD).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const WRAPPER = resolve("claude/tools/traces");

function setup(builtFrom) {
  const checkout = mkdtempSync(join(tmpdir(), "traces-checkout-"));
  const git = (...args) => spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: checkout, encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" } });
  git("init", "-q");
  git("commit", "-q", "--allow-empty", "-m", "head");
  const head = git("rev-parse", "HEAD").stdout.trim();
  const build = mkdtempSync(join(tmpdir(), "traces-build-"));
  mkdirSync(join(build, "dist"));
  writeFileSync(join(build, "dist", "cli.js"), "console.log('ran ' + process.argv.slice(2).join(' '))\n");
  if (builtFrom) writeFileSync(join(build, "SOURCE_COMMIT"), `${builtFrom === "head" ? head : builtFrom}\n`);
  const env = { ...process.env, TRACES_CHECKOUT: checkout, TRACES_BUILD: build, PATH: `${dirname(process.execPath)}:/usr/bin:/bin` };
  return { head, run: (...args) => spawnSync(WRAPPER, args, { env, encoding: "utf8" }) };
}

test("a build from HEAD runs with its arguments", () => {
  const r = setup("head").run("facts", "--since", "7d");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "ran facts --since 7d\n");
});

test("a build from an older commit is refused with the exact rebuild command", () => {
  const { head, run } = setup("0123456789abcdef0123456789abcdef01234567");
  const r = run("facts");
  assert.equal(r.status, 2);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, new RegExp(`refusing to run a stale build: .* is from 0123456789abcdef.*, the checkout .* is at ${head}`));
  assert.match(r.stderr, new RegExp(`pnpm install --frozen-lockfile && pnpm build .*echo ${head} > SOURCE_COMMIT`));
  if (process.platform === "darwin") assert.match(r.stderr, new RegExp(`ssh beelink1-wsl .*git checkout -q --detach ${head} .*rsync -a --delete`));
});

test("a build with no recorded commit is refused", () => {
  const r = setup(null).run();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /is from no commit/);
});
