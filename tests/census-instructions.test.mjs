import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import assert from "node:assert/strict";

// `census instructions` reads files, not a tree: a fixture home, then the load this repository installs.
const scratch = mkdtempSync(join(tmpdir(), "census-instructions-"));
after(() => rmSync(scratch, { recursive: true, force: true }));
const instructions = (home, ...args) => spawnSync(resolve("git/census/census"), ["instructions", "--home", home, "--cwd", home, ...args], { encoding: "utf8" });

test("census instructions measures a fixture's load, duplicates, conflicts, hook-enforced lines and dangling references", () => {
  const home = join(scratch, "fixture");
  cpSync(resolve("tests/fixtures/census-instructions"), home, { recursive: true });
  const run = instructions(home, "--cwd", join(home, "project"), "--json");
  assert.equal(run.status, 0, run.stderr);
  const m = JSON.parse(run.stdout), at = (ref) => `${basename(dirname(ref))}/${basename(ref)}`;
  assert.deepEqual(m.files.map((f) => [f.kind, f.rules]), [["user", 4], ["include", 4], ["project", 1], ["catalog", 0]]);
  assert.deepEqual([m.totals.loaded.tokens, m.totals.linked.files], [142, 2]);
  assert.deepEqual([m.duplication.rules_with_duplicate, m.duplication.rules, m.duplication.clusters.length], [4, 9, 2]);
  assert.deepEqual(m.contradictions.map((c) => [at(c.a.ref), at(c.b.ref), c.reasons]), [[".claude/CLAUDE.md:7", ".claude/RULES.md:2", ['number 8 vs 3 on "live widget"']]]);
  assert.deepEqual(m.enforced.lines.map((e) => [at(e.ref), e.hook, e.by]), [[".claude/CLAUDE.md:5", "hooks/push-guard.sh", "--no-verify"]]);
  assert.deepEqual(m.dangling.map((d) => [at(d.ref), d.kind, d.target]), [[".claude/RULES.md:3", "path", "docs/gone.md"], [".claude/RULES.md:4", "command", "zz-missing-tool"]]);
  assert.deepEqual(m.move.drop.map((d) => at(d.copy)), [".claude/process.md:1", ".claude/process.md:1"]);
});

test("census instructions holds this repository's installed load to the numbers measured on 2026-11-06", () => {
  const home = join(scratch, "installed"), claude = join(home, ".claude");
  mkdirSync(join(claude, "skills"), { recursive: true });
  for (const name of ["CLAUDE.md", "AGENTS.md", "RTK.md", "directives", "hooks"]) symlinkSync(resolve("claude", name), join(claude, name));
  for (const skill of readdirSync(resolve("claude/skills")).filter((s) => !s.startsWith("_"))) symlinkSync(resolve("claude/skills", skill), join(claude, "skills", skill));
  const held = instructions(home, "--budget-tokens", "3147", "--max-dup-share", "0");
  assert.equal(held.status, 0, held.stderr);
  const tighter = instructions(home, "--budget-tokens", "3146", "--max-dup-share", "0");
  assert.equal(tighter.status, 1);
  assert.match(tighter.stderr, /loaded tokens 3147 exceed --budget-tokens 3146/);
});
