import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

// The wrapper runs as an entrypoint named after the package manager, next to `<name>.gtr-original`.
// Exit 125 is a refusal; an allowed command runs the original, which here prints "ran".

const GUARD = resolve("host/gtr-install-guard/guard.py");
const HOME = mkdtempSync(join(tmpdir(), "gtr-install-guard-"));
const BIN = join(HOME, "bin");
mkdirSync(BIN);
for (const name of ["pnpm", "npm", "yarn", "uv", "corepack", "git"]) {
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
// `cap` worktrees under _wt, a new tree must fit Tangle Tools' size-aware admission, and installs are not refused.
// The admission owner is a separate module (/usr/local/libexec/tangle-fleet-disk-policy.py); this stand-in
// answers with its contract: free - reservations - request >= minimum.
function policy(home, reserved, minimum) {
  const path = join(home, "policy.py");
  writeFileSync(path, `def admission_headroom(host, path, request_bytes, free_bytes):
    headroom = free_bytes - ${reserved} - request_bytes - ${minimum}
    return {"free_bytes": free_bytes, "reserved_bytes": ${reserved}, "requested_bytes": request_bytes,
            "minimum_bytes": ${minimum}, "headroom_bytes": headroom, "fits": headroom >= 0}
`);
  return path;
}
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
  const { home, repo, git } = beelinkGit({ cap: 2, });
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
  const other = add("b0", { FLEET_LANE: "op-research:other" });
  assert.equal(other.status, 0);
  assert.ok(!existsSync(join(home, "code/_wt/a3")));

  assert.equal(add("b1", { FLEET_LANE: "op-research:other" }).status, 0, "another lane has its own cap");
  assert.equal(git(["worktree", "add", "-q", "--detach", join(home, "scratch/outside")]).status, 0, "outside _wt is not capped");
  assert.equal(git(["status", "--short"]).status, 0);
});

test("a Beelink counts nested _wt trees and records the lane when a post-checkout hook fails", () => {
  const { home, repo, git } = beelinkGit({ cap: 2, });
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

test("a Beelink refuses a _wt worktree that does not fit size-aware admission, and names the inventory to read", () => {
  const { home, git } = beelinkGit({ cap: 4 });
  assert.equal(git(["worktree", "add", "-q", "--detach", join(home, "code/_wt/x1")], { FLEET_LANE: "op-a:one" }).status, 0);
  // Reservations larger than any disk: the tree cannot fit.
  writeFileSync(join(home, "bin/git.worktree-cap.json"), JSON.stringify({ cap: 4, admission_policy: policy(home, Number.MAX_SAFE_INTEGER, 50e9) }));
  const r = git(["worktree", "add", "-q", "--detach", join(home, "code/_wt/f1")], { FLEET_LANE: "op-company:wt-cap" });
  assert.equal(r.status, 125);
  assert.match(r.err, /GiB reserved - [\d.]+ GiB for this tree, under the 47 GiB lifecycle minimum/);
  assert.match(r.err, /storage-lifecycle run --exclusive-inventory/);
  assert.ok(!existsSync(join(home, "code/_wt/f1")));
});

test("a tree that fits admits however little is free above the minimum, and an unreadable owner admits (10-19..26: 33 refusals at 123-153 GiB free)", () => {
  const { home, git } = beelinkGit({ cap: 4, admission_policy: "/nonexistent/policy.py" });
  const unknown = git(["worktree", "add", "-q", "--detach", join(home, "code/_wt/u1")], { FLEET_LANE: "op-a:one" });
  assert.equal(unknown.status, 0, unknown.err);
  assert.match(unknown.err, /storage admission unreadable/);
  writeFileSync(join(home, "bin/git.worktree-cap.json"), JSON.stringify({ cap: 4, admission_policy: policy(home, 0, 1) }));
  assert.equal(git(["worktree", "add", "-q", "--detach", join(home, "code/_wt/u2")], { FLEET_LANE: "op-a:one" }).status, 0);
});

test("a symlink to the installed Git wrapper delegates through the wrapper's own preserved executable", () => {
  // ADC's run-devtools.test.mjs links `which git` into a temporary bin; the alias has no
  // git.gtr-original beside it, and every signoff failed with "missing preserved executable".
  const { home, repo } = beelinkGit({ cap: 4, });
  const stub = join(home, "stub-bin");
  mkdirSync(stub);
  symlinkSync(join(home, "bin/git"), join(stub, "git"));
  const r = spawnSync("python3", [join(stub, "git"), "rev-parse", "--is-inside-work-tree"], {
    cwd: repo,
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: home, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
  });
  assert.equal(r.stderr.includes("missing preserved executable"), false, r.stderr);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "true");
});

test("the Beelink shim sends only worktree commands to Python", () => {
  const shim = readFileSync(resolve("host/gtr-install-guard/beelink-git"), "utf8");
  assert.match(shim, /\*" worktree "\*\) exec \/usr\/bin\/python3 -I -S \/usr\/local\/lib\/beelink-worktree-cap\/git "\$@"/);
  const r = spawnSync("sh", [resolve("host/gtr-install-guard/beelink-git"), "--version"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^git version/);
});

test("a Beelink worktree move into _wt is held to the same cap and admission as an add", () => {
  const { home, git } = beelinkGit({ cap: 1, });
  const lane = { FLEET_LANE: "op-devplatform:mover" };
  const outside = (name) => join(home, "code/repo/.worktrees", name);
  assert.equal(git(["worktree", "add", "-q", "--detach", outside("m1")], lane).status, 0, "outside _wt is not capped");
  assert.equal(git(["worktree", "move", outside("m1"), join(home, "code/_wt/m1")]).status, 125, "a move into _wt needs a lane");
  assert.equal(git(["worktree", "move", outside("m1"), join(home, "code/_wt/m1")], lane).status, 0);
  const admin = readFileSync(join(home, "code/_wt/m1/.git"), "utf8").trim().slice("gitdir: ".length);
  assert.equal(readFileSync(join(admin, "fleet-lane"), "utf8"), "op-devplatform:mover\n");
  assert.equal(git(["worktree", "add", "-q", "--detach", outside("m2")], lane).status, 0);
  const second = git(["worktree", "move", "-f", outside("m2"), join(home, "code/_wt/m2")], lane);
  assert.equal(second.status, 125, "the moved tree counts against the lane");
  assert.match(second.err, /holds 1 of 1/);
  writeFileSync(join(home, "bin/git.worktree-cap.json"), JSON.stringify({ cap: 4, admission_policy: policy(home, Number.MAX_SAFE_INTEGER, 1) }));
  const floor = git(["worktree", "move", outside("m2"), join(home, "code/_wt/m3")], lane);
  assert.equal(floor.status, 125, "lane-10080 moved a tree into _wt under the floor on 2026-10-12");
  assert.match(floor.err, /lifecycle minimum/);
});

test("GTR refuses a worktree move into _wt like an add", () => {
  const r = run("git", ["worktree", "move", "/tmp/elsewhere", join(HOME, "code/_wt/moved")], HOME);
  assert.equal(r.status, 125);
  assert.match(r.err, /refused/);
});
