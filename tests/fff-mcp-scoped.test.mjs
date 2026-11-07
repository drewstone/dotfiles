import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const wrapper = resolve(dirname(fileURLToPath(import.meta.url)), "../claude/tools/fff-mcp-scoped");

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "fff-scoped-"));
  // The fake server prints the arguments it was started with.
  const bin = join(root, "fake-fff");
  writeFileSync(bin, "#!/usr/bin/env bash\necho \"ran $*\"\n");
  chmodSync(bin, 0o755);
  const run = (cwd, env = {}) => spawnSync("bash", [wrapper, bin, "--no-update-check"], {
    cwd, encoding: "utf8", env: { ...process.env, HOME: root, GIT_CONFIG_NOSYSTEM: "1", ...env },
  });
  const repo = (dir) => {
    mkdirSync(dir, { recursive: true });
    spawnSync("git", ["init", "-q", dir]);
  };
  return { root, bin, run, repo };
};

test("a directory outside any git work tree starts no server", () => {
  const f = setup();
  try {
    const parent = join(f.root, "code");
    f.repo(join(parent, "a"));
    f.repo(join(parent, "b"));
    const r = f.run(parent);
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /ran/);
    assert.match(r.stderr, /not inside a git work tree; not indexing/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a session inside a repo indexes the repo root, with warmup off and caps set", () => {
  const f = setup();
  try {
    const repo = join(f.root, "repo");
    f.repo(repo);
    mkdirSync(join(repo, "src"));
    const r = f.run(join(repo, "src"));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), `ran --no-warmup --max-cached-files 5000 --idle-timeout-secs 900 --no-update-check ${repo}`);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a repo holding other repos is refused unless it ignores them", () => {
  const f = setup();
  try {
    const parent = join(f.root, "company");
    f.repo(parent);
    for (let i = 0; i < 6; i++) f.repo(join(parent, "repos", `r${i}`));
    const refused = f.run(parent);
    assert.equal(refused.status, 0);
    assert.doesNotMatch(refused.stdout, /ran/);
    assert.match(refused.stderr, /holds more than 5 other repos/);
    writeFileSync(join(parent, ".gitignore"), "repos/\n");
    const ignored = f.run(parent);
    assert.match(ignored.stdout, /^ran .*\/company$/m, ignored.stderr);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a repo over the tracked-file cap is refused", () => {
  const f = setup();
  try {
    const repo = join(f.root, "big");
    f.repo(repo);
    for (const n of ["a", "b", "c"]) writeFileSync(join(repo, n), n);
    spawnSync("git", ["-C", repo, "add", "."]);
    const r = f.run(repo, { FFF_MCP_MAX_FILES: "2" });
    assert.doesNotMatch(r.stdout, /ran/);
    assert.match(r.stderr, /tracks more than 2 files/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
