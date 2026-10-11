import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

// The wrapper runs as an entrypoint named after the package manager, next to `<name>.gtr-original`.
// Exit 125 is a refusal; an allowed command runs the original, which here prints "ran".

const GUARD = resolve("host/gtr-install-guard/guard.py");
const HOME = mkdtempSync(join(tmpdir(), "gtr-install-guard-"));
const BIN = join(HOME, "bin");
mkdirSync(BIN);
for (const name of ["pnpm", "npm", "yarn", "uv", "corepack"]) {
  copyFileSync(GUARD, join(BIN, name));
  writeFileSync(join(BIN, `${name}.gtr-original`), "#!/bin/sh\necho ran \"$@\"\n", { mode: 0o755 });
}

function checkout(path) {
  const dir = join(HOME, path);
  mkdirSync(join(dir, ".git"), { recursive: true });
  writeFileSync(join(dir, ".git/HEAD"), "ref: refs/heads/main\n");
  return dir;
}

// GTR's home holds a stray .git/info with no repository; it must not make every directory a checkout.
mkdirSync(join(HOME, ".git/info"), { recursive: true });

function run(manager, args, cwd, env = {}) {
  const r = spawnSync("python3", [join(BIN, manager), ...args], {
    cwd, encoding: "utf8", env: { PATH: process.env.PATH, HOME, ...env },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

const gate = checkout("code/gate-gtm-20261010");
const wt = checkout("code/_wt/gtm-round4");
const tmpClone = checkout("tmp-clone/gtm-agent");
const service = checkout("code/cli-bridge-reviewer");
const lab = checkout("code/_deploy/discovery-lab");
const deploy = checkout(".local/share/tangle-tools");
const cache = checkout(".cache/beelink-gate/github.com/tangle-network/gtm-agent");
mkdirSync(join(HOME, ".config/fleet"), { recursive: true });
writeFileSync(join(HOME, ".config/fleet/checkouts"),
  "# <path> <branch> <unit|-> <pnpm|-> [idle command]\n~/code/cli-bridge-reviewer main cli-bridge.service pnpm curl -sf http://127.0.0.1:3355/health\n");
writeFileSync(join(HOME, ".config/fleet/lab.env"), `DISCO_LAB=${lab}\n`);
const scratch = join(HOME, "scratch/probe");
mkdirSync(scratch, { recursive: true });
const renderers = join(HOME, ".local/share/agent-record/renderers/0.35.0-31d306e2");
mkdirSync(renderers, { recursive: true });
const runDeploy = checkout("code/_deploy/discovery-lab-792973ca-20261009g");
const worktreeFile = join(HOME, "code/gate-router-openai-bound");
mkdirSync(worktreeFile, { recursive: true });
writeFileSync(join(worktreeFile, ".git"), "gitdir: /home/drew/code/tangle-router/.git/worktrees/gate\n");

test("refuses installs in any GTR checkout, including the clone outside _wt from 2026-10-10", () => {
  for (const [manager, args, cwd] of [
    ["pnpm", ["install", "--frozen-lockfile"], gate],
    ["pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], wt],
    ["npm", ["ci"], tmpClone],
    ["corepack", ["pnpm", "install", "--frozen-lockfile"], gate],
    ["pnpm", ["-C", gate, "install"], HOME],
    ["yarn", [], gate],
    ["pnpm", ["add", "@tangle-network/agent-app@0.60.40"], gate],
    ["pnpm", ["install", "--frozen-lockfile"], worktreeFile],
  ]) {
    const r = run(manager, args, cwd);
    assert.equal(r.status, 125, `${manager} ${args.join(" ")} in ${cwd} ran: ${r.out}${r.err}`);
    assert.match(r.err, /beelink-gate beelink1\|beelink2 <repo-url> <full-sha> -- <command>/);
  }
});

test("deploy-managed service checkouts, the gate cache and non-installs still run", () => {
  for (const [manager, args, cwd] of [
    ["corepack", ["pnpm", "install", "--frozen-lockfile", "--prefer-offline"], service],
    ["corepack", ["pnpm", "install", "--frozen-lockfile", "--prefer-offline"], lab],
    ["pnpm", ["install", "--frozen-lockfile"], deploy],
    ["pnpm", ["install", "--frozen-lockfile"], cache],
    ["npm", ["install", "-g", "@openai/codex"], gate],
    ["pnpm", ["install", "--lockfile-only"], gate],
    ["npm", ["install", "@tangle-network/sandbox@latest"], scratch],
    ["npm", ["install", "--omit=dev", "--no-audit"], renderers],
    ["pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], runDeploy],
    ["pnpm", ["typecheck"], gate],
    ["pnpm", ["exec", "vitest", "run", "tests/a.test.ts"], gate],
    ["npm", ["view", "@tangle-network/agent-app", "version"], gate],
    ["corepack", ["enable"], gate],
    ["uv", ["run", "python", "-m", "fleet"], gate],
  ]) {
    const r = run(manager, args, cwd);
    assert.equal(r.status, 0, `${manager} ${args.join(" ")} in ${cwd} refused: ${r.err}`);
    assert.match(r.out, /^ran/);
  }
});

test("uv keeps its _wt-only rule", () => {
  assert.equal(run("uv", ["sync"], wt).status, 125);
  assert.equal(run("uv", ["sync"], gate).status, 0);
});

// On a Beelink the Git entrypoint has git.worktree-cap.json beside it: each fleet lane may hold
// `cap` worktrees under _wt, nothing new lands under the free-space floor, and installs are not refused.
function beelinkGit(config) {
  const home = mkdtempSync(join(tmpdir(), "beelink-cap-"));
  const bin = join(home, "bin");
  mkdirSync(bin);
  copyFileSync(GUARD, join(bin, "git"));
  symlinkSync("/usr/bin/git", join(bin, "git.gtr-original"));
  writeFileSync(join(bin, "git.worktree-cap.json"), JSON.stringify(config));
  const repo = join(home, "code/repo");
  mkdirSync(join(home, "code/_wt"), { recursive: true });
  const env = { PATH: process.env.PATH, HOME: home, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  spawnSync("/usr/bin/git", ["init", "-q", "-b", "main", repo], { env });
  spawnSync("/usr/bin/git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.hooksPath=/dev/null",
    "commit", "-q", "--allow-empty", "-m", "seed"], { env });
  const git = (args, extra = {}) => {
    const r = spawnSync("python3", [join(bin, "git"), ...args], { cwd: repo, encoding: "utf8", env: { ...env, ...extra } });
    return { status: r.status, out: r.stdout, err: r.stderr };
  };
  return { home, repo, git };
}

test("a Beelink worktree add into _wt needs a lane, records it, and stops at the lane cap", () => {
  const { home, repo, git } = beelinkGit({ cap: 2, floor_bytes: 0 });
  const add = (name, env) => git(["worktree", "add", "-q", "--detach", join(home, "code/_wt", name)], env);

  const anonymous = add("anon");
  assert.equal(anonymous.status, 125);
  assert.match(anonymous.err, /FLEET_LANE=/);
  assert.ok(!existsSync(join(home, "code/_wt/anon")));

  const viaStatus = { FLEET_STATUS_FILE: "/state/fleet/status/op-company--wt-cap.md" };
  assert.equal(add("a1", viaStatus).status, 0);
  const admin = readFileSync(join(home, "code/_wt/a1/.git"), "utf8").trim().slice("gitdir: ".length);
  assert.equal(readFileSync(join(admin, "fleet-lane"), "utf8"), "op-company:wt-cap\n");
  assert.equal(add("a2", { FLEET_LANE: "op-company:wt-cap" }).status, 0);

  const third = add("a3", viaStatus);
  assert.equal(third.status, 125);
  assert.match(third.err, /holds 2 of 2 worktrees/);
  assert.match(third.err, new RegExp(`OWNER_RELEASED=1 wt-remove ${join(home, "code/_wt/a1")}`));
  assert.ok(!existsSync(join(home, "code/_wt/a3")));

  assert.equal(add("b1", { FLEET_LANE: "op-research:other" }).status, 0, "another lane has its own cap");
  assert.equal(git(["worktree", "add", "-q", "--detach", join(home, "scratch/outside")]).status, 0, "outside _wt is not capped");
  assert.equal(git(["status", "--short"]).status, 0);
});

test("a Beelink counts nested _wt trees and records the lane when a post-checkout hook fails", () => {
  const { home, repo, git } = beelinkGit({ cap: 2, floor_bytes: 0 });
  const lane = { FLEET_LANE: "op-company:hooks" };
  mkdirSync(join(repo, ".git/hooks"), { recursive: true });
  writeFileSync(join(repo, ".git/hooks/post-checkout"), "#!/bin/sh\nexit 3\n", { mode: 0o755 });
  const hooked = git(["-c", "core.hooksPath=" + join(repo, ".git/hooks"), "worktree", "add", "-q", "--detach",
    join(home, "code/_wt/grp/h1")], lane);
  assert.equal(hooked.status, 3, "git's own exit code is kept");
  assert.equal(git(["--attr-source", "HEAD", "worktree", "add", "-q", "--detach", join(home, "code/_wt/grp/deeper/h2")], lane).status, 3, "--attr-source does not hide the add");
  const third = git(["worktree", "add", "-q", "--detach", join(home, "code/_wt/h3")], lane);
  assert.equal(third.status, 125, "the hook-failed and nested trees both count");
  assert.match(third.err, /holds 2 of 2/);
});

test("a Beelink under its free-space floor refuses new _wt worktrees and names idle trees", () => {
  const { home, git } = beelinkGit({ cap: 4, floor_bytes: Number.MAX_SAFE_INTEGER });
  const r = git(["worktree", "add", "-q", "--detach", join(home, "code/_wt/f1")], { FLEET_LANE: "op-company:wt-cap" });
  assert.equal(r.status, 125);
  assert.match(r.err, /under its \d+ GiB floor/);
  assert.ok(!existsSync(join(home, "code/_wt/f1")));
});
