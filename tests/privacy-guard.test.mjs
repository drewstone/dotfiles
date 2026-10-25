import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const hook = resolve("git/hooks/pre-commit");
// Fictional detail: the real denylist is a local, untracked file and never appears here.
const DETAIL = "77 Fictional Test Lane";
// A Luhn-valid 16-digit run, assembled at runtime so this file never stages one itself.
const LUHN_DIGITS = ["4539", "1488", "0343", "6467"].join("");
const AMEX_DIGITS = ["3412", "345678", "90127"].join("");

function repoWith(content, { denylist = `# local only\n${DETAIL}\n` } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "privacy-guard-"));
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "drewstone329@gmail.com");
  git("config", "user.name", "Drew Stone");
  git("config", "core.hooksPath", dirname(hook));
  writeFileSync(join(dir, "file.txt"), content);
  git("add", "file.txt");
  const list = join(dir, "denylist");
  writeFileSync(list, denylist);
  try {
    return spawnSync("git", ["commit", "-qm", "test: privacy boundary fixture"], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, GIT_PRIVACY_DENYLIST: list },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
    `cost_per_slot 0.${LUHN_DIGITS} and ${LUHN_DIGITS}.5 usd\n`,
    "nothing personal here\n",
  ]) {
    assert.equal(repoWith(content).status, 0, content);
  }
});

test("passes when no local denylist exists", () => {
  assert.equal(repoWith(`footer: ${DETAIL}\n`, { denylist: "" }).status, 0);
});


test("accepts card-shaped numeric spans only when they belong to an alphanumeric token", () => {
  for (const digits of [LUHN_DIGITS, AMEX_DIGITS]) {
    for (const token of [`a${digits}`, `${digits}B`, `f${digits}e`]) {
      const result = repoWith(`revision: ${token}\n`);
      assert.equal(result.status, 0, "an alphanumeric token was misclassified as a card");
    }
    const hex = `abc${digits}${"f".repeat(37 - digits.length)}`;
    assert.equal(hex.length, 40);
    assert.equal(repoWith(`revision: ${hex}\n`).status, 0, "a hexadecimal revision was misclassified as a card");
  }
});

test("still refuses unexempted compact and grouped PANs at punctuation boundaries without exposing them", () => {
  const grouped = [
    LUHN_DIGITS.match(/.{4}/g).join(" "),
    LUHN_DIGITS.match(/.{4}/g).join("-"),
    `${AMEX_DIGITS.slice(0, 4)} ${AMEX_DIGITS.slice(4, 10)} ${AMEX_DIGITS.slice(10)}`,
    `${AMEX_DIGITS.slice(0, 4)}-${AMEX_DIGITS.slice(4, 10)}-${AMEX_DIGITS.slice(10)}`,
  ];
  for (const digits of [LUHN_DIGITS, AMEX_DIGITS, ...grouped]) {
    for (const content of [digits, `card: "${digits}",`, `(${digits})`, `_${digits}_`, `${digits}.`]) {
      const result = repoWith(`${content}\n`);
      assert.equal(result.status, 1, "an unexempted delimited card was accepted");
      assert.match(result.stderr, /payment card number/);
      assert.ok(!result.stdout.includes(digits) && !result.stderr.includes(digits), "hook output exposed the card");
    }
  }
});
