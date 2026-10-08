import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const hook = resolve("git/hooks/pre-commit");
// Fictional detail: the real denylist is a local, untracked file and never appears here.
const DETAIL = "77 Fictional Test Lane";

function repoWith(content, { denylist = `# local only\n${DETAIL}\n` } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "privacy-guard-"));
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "drewstone329@gmail.com");
  git("config", "user.name", "Drew Stone");
  writeFileSync(join(dir, "file.txt"), content);
  git("add", "file.txt");
  const list = join(dir, "..", `denylist-${Date.now()}-${Math.random()}`);
  writeFileSync(list, denylist);
  return spawnSync("bash", [hook], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, GIT_PRIVACY_DENYLIST: list },
  });
}

test("refuses a staged personal detail from the local denylist, case-insensitively, without echoing it", () => {
  const result = repoWith(`footer: ${DETAIL.toUpperCase()}\n`);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /personal detail/);
  assert.doesNotMatch(result.stdout + result.stderr, /Fictional/i);
});

test("refuses a Luhn-valid card number in a card shape", () => {
  const result = repoWith("card: 4539 1488 0343 6467\n");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /payment card number/);
});

test("accepts published processor test cards, timestamps and ordinary content", () => {
  for (const content of [
    "stripe test card 4242 4242 4242 4242\n",
    "created_at 1791416871000 and id 4539148803436467123\n",
    "nothing personal here\n",
  ]) {
    assert.equal(repoWith(content).status, 0, content);
  }
});

test("passes when no local denylist exists", () => {
  assert.equal(repoWith(`footer: ${DETAIL}\n`, { denylist: "" }).status, 0);
});
