import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

// process_guard.py reads a PreToolUse payload on stdin. A denial is JSON on stdout with
// permissionDecision "deny"; an allowed override prints a systemMessage; anything else
// prints nothing. Each rule replays the commands agents actually ran (2026-10-03..10)
// and the ordinary commands that must keep working.

const HOOK = resolve("claude/hooks/process_guard.py");
const HOME = mkdtempSync(join(tmpdir(), "process-guard-home-"));
const ROOT = realpathSync(mkdtempSync(join(tmpdir(), "process-guard-")));
const SESSION = "11111111-2222-3333-4444-555555555555";
const CLEAN_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("CC_ALLOW_")));

function run(command, { cwd = process.cwd(), uname = "Linux", env = {}, transcript } = {}) {
  const payload = { tool_name: "Bash", tool_input: { command }, cwd, session_id: SESSION, transcript_path: transcript };
  const r = spawnSync(HOOK, [], {
    input: JSON.stringify(payload),
    env: { ...CLEAN_ENV, HOME, CC_GUARD_UNAME: uname, ...env },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : {};
}

function decide(command, options) {
  return run(command, options).hookSpecificOutput?.permissionDecision ?? "allow";
}

function reason(command, options) {
  return run(command, options).hookSpecificOutput?.permissionDecisionReason ?? "";
}

function git(cwd, ...args) {
  const r = spawnSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "user.email=t@example.invalid", "-c", "user.name=T", ...args],
    { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

function repo(dir, { remote = false } = {}) {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, "a.txt"), "a\n");
  git(dir, "add", "a.txt");
  git(dir, "commit", "-qm", "base");
  if (remote) git(dir, "remote", "add", "origin", "https://github.com/example/example.git");
  return dir;
}

function stash(dir, text) {
  writeFileSync(join(dir, "a.txt"), text);
  git(dir, "stash", "push", "-q", "-m", text.trim());
}

function check(cases, expected, options) {
  for (const command of cases) {
    assert.equal(decide(command, options), expected, `${expected} expected for: ${command}`);
  }
}

// ---------------------------------------------------------------------------- admin-merge

test("admin-merge: refuses the admin merges agents ran, locally and over ssh", () => {
  check([
    "gh-drew pr merge 951 --repo tangle-network/tangle-tools --squash --admin 2>&1 | tail -2 || true; gh-drew pr view 951 --repo tangle-network/tangle-tools --json state --jq .state",
    "gh-drew pr merge 1578 --repo tangle-network/blueprint --squash --admin --delete-branch 2>&1 | tail -3",
    "ssh beelink2-wsl 'gh-drew pr merge 259 --repo drewstone/dotfiles --squash --admin 2>&1 | tail -2; sleep 3; gh-drew pr view 259 --repo drewstone/dotfiles --json state --jq .state; cd ~/code/dotfiles && git status --porcelain | head -3'",
    "R=tangle-network/agent-dev-container; gh-drew pr merge 9066 -R $R --merge --admin 2>&1 | tail -2",
    "gh api -X DELETE repos/tangle-network/gtm-agent/branches/main/protection",
  ], "deny");
  assert.match(reason("gh pr merge 1 --admin"), /--squash --auto/);
});

test("admin-merge: ordinary PR commands pass", () => {
  check([
    "gh-drew pr merge 1426 --repo tangle-network/gtm-agent --squash --auto",
    "gh-drew pr merge 1426 --repo tangle-network/gtm-agent --squash --delete-branch",
    "gh pr create --title 'fix: x' --body 'never merge with --admin'",
    "gh pr view 1 --json state,mergeStateStatus",
    "gh api repos/tangle-network/gtm-agent/branches/main/protection",
  ], "allow");
});

// ----------------------------------------------------------------------------- force-push

test("force-push: refuses the force pushes agents ran on their own branches", () => {
  check([
    "cd /Users/drew/webb/_wt/tangle-router-fal-video && git diff --name-only HEAD...origin/main; git rebase -q origin/main 2>&1 | tail -2; git log --oneline -2 && git push -q -f-with-lease 2>/dev/null; git push -q --force-with-lease origin feat/fal-video-pricing 2>&1 | grep -v '^remote:\\|ai-agent-hooks\\|^- ok' | tail -2",
    "cd /Users/drew/webb/_wt/physim-deploy-lane-20261009 && git add .github/actionlint.yaml && git commit -q --amend --no-edit && git push -q -f-with-lease 2>/dev/null; git push -q --force-with-lease origin ci/deploy-lane-20261009 2>&1 | tail -1; git rev-parse HEAD",
    "git commit -q -m \"docs(jobmap): name the own-website headquarters step on the page and in the README\" && git push -q --force-with-lease origin feat/jobmap-entities-defense 2>&1 | grep -v \"^remote:\" | tail -3",
    "git commit -qam \"chore: v0.27.2\" && git push -qf origin HEAD:fix/overview-wall-scale 2>&1 | tail -1",
    "D=$(git rev-parse HEAD) && git push -q --force-with-lease=exp/mutation-drill-20261009:c1c1055fc12165bd9fdf0eb0cc64e16f3dd2b7a2 origin exp/mutation-drill-20261009 2>&1 | tail -1",
    "timeout 1500 git -c credential.helper= -c \"credential.helper=!/home/drew/bin/gh-drew auth git-credential\" push --force-with-lease > /tmp/dw-push3c.log 2>&1",
    "git push origin +HEAD:feat/x",
    "git push --force origin main",
    "git push --mirror backup",
    "ssh beelink1-wsl 'cd ~/code/_wt/x && git push -f origin x'",
    "ssh beelink1-wsl bash -s <<'EOF'\ncd ~/code/_wt/x\ngit push --force-with-lease origin x\nEOF",
    "for b in a b; do git push -f origin $b; done",
  ], "deny");
  assert.match(reason("git push -f origin x"), /CC_ALLOW_FORCE_PUSH=1 only with Drew's authorization/);
});

test("force-push: normal pushes and text that mentions force pushing pass", () => {
  check([
    "git push -u origin feat/x",
    "git push -q origin HEAD:refs/heads/fix/y 2>&1 | tail -1",
    "git push origin --delete old-branch",
    "git push --follow-tags origin main",
    "git push -o ci.skip origin feat/x",
    "git commit -m 'docs: never git push --force'",
    "cat > notes.md <<'EOF'\ngit push --force rewrites history\nEOF",
    "echo 'git push -f is refused'",
    "git fetch -f origin main:main",
  ], "allow");
});

test("force-push: CC_ALLOW_FORCE_PUSH=1 lets one push through and says so", () => {
  const out = run("CC_ALLOW_FORCE_PUSH=1 git push --force-with-lease origin feat/x");
  assert.equal(out.hookSpecificOutput, undefined);
  assert.match(out.systemMessage, /CC_ALLOW_FORCE_PUSH=1/);
  assert.equal(decide("git push -f origin x", { env: { CC_ALLOW_FORCE_PUSH: "1" } }), "allow");
  assert.match(readFileSync(join(HOME, ".claude/logs/process-guard.log"), "utf8"), /BYPASS rule=force-push/);
});

// --------------------------------------------------------------------------- hooks-bypass

test("hooks-bypass: refuses hooksPath overrides and --no-verify commits", () => {
  const real = repo(join(ROOT, "hooks-real"), { remote: true });
  check([
    // The lead's commit on gtr, 2026-10-10.
    "ssh -o BatchMode=yes gtr 'set -e; cd ~/code/_wt/adc-p0-luna-output; git add -A; git -c core.hooksPath=.husky commit -q -m \"fix(opencode): include the required output limit for long-context models\" 2>&1 | tail -3; git log --oneline -1'",
    "git config user.name && git config user.email && git add -A && git -c core.hooksPath=/dev/null commit -q -m \"wip: parked evacuation\" && git rebase -q origin/develop",
    "git -c core.hooksPath=.git/hooks commit -q -F - <<'EOF'\nfeat(readout): every settled run gets a design-checked readout\nEOF",
    "git add -A && git commit -q --no-verify -m \"wip: headroom floor of one large sandbox or 20% of capacity\"",
    "git commit -nm 'wip'",
    "git config core.hooksPath /dev/null",
    "git config --global core.hooksPath /tmp/none",
    "git config --unset core.hooksPath",
    "GIT_CONFIG_GLOBAL=/dev/null git commit -qm x",
    "export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null; git commit -qm x",
    "git -c core.hooksPath=/dev/null am -q /tmp/wip.patch",
  ], "deny", { cwd: real });
  mkdirSync(join(real, "jobmap"));
  assert.equal(decide("git -C .. commit -qm \"wip(jobmap): sources, resolution, snapshot, taxonomy\" --no-verify",
    { cwd: join(real, "jobmap") }), "deny");
  assert.match(reason("git commit --no-verify -m x", { cwd: real }), /privacy denylist/);
});

test("hooks-bypass: reads, restatements and throwaway fixtures pass", () => {
  const real = repo(join(ROOT, "hooks-ok"), { remote: true });
  const fixture = repo(join(ROOT, "hooks-fixture"));
  const githooks = repo(join(ROOT, "hooks-githooks"), { remote: true });
  git(githooks, "config", "core.hooksPath", ".githooks");
  check([
    "git -c core.hooksPath= diff >/dev/null",
    "git -c core.hooksPath=/dev/null diff --cached --quiet && echo none",
    "git config --global core.hooksPath",
    "git config --get core.hooksPath",
    "git config core.hooksPath .githooks",
    "git -c core.hooksPath=\"$(git config core.hooksPath)\" commit -q -F - <<'EOF'\nfix: x\nEOF",
    "git commit -qam 'fix: x'",
    "git commit -q -m 'docs: explain --no-verify'",
    "git -c core.hooksPath=.git/hooks-none commit -q -m x --dry-run >/dev/null 2>&1",
    "ssh beelink1-wsl 'cd ~/code/_wt/adc-tc-cli && git -c core.hooksPath=.githooks commit -q -m \"test: x\"'",
    "cd $(mktemp -d) && git init -q && git -c core.hooksPath=/dev/null commit --allow-empty -qm base",
  ], "allow", { cwd: real });
  assert.equal(decide("GIT_ALLOW_TEST_IDENTITY=1 git -c core.hooksPath=/dev/null commit -qm base", { cwd: fixture }), "allow");
  assert.equal(decide("git config core.hooksPath /dev/null", { cwd: fixture }), "allow");
  assert.equal(decide("git -c core.hooksPath=.githooks commit -qm x", { cwd: githooks }), "allow");
});

// --------------------------------------------------------------------------- shared-stash

test("shared-stash: refuses the bare pops agents ran in shared checkouts", () => {
  check([
    // 2026-10-09: the pop that took another session's entry.
    "cd /Users/drew/webb/_wt/gtm-seo-data && git stash -q -u && pnpm exec vitest run src/lib/.server/chat/system-prompt-budget.test.ts 2>&1 | /usr/bin/grep -E \"Tests |expected\" | head -3; git stash pop -q && git status --short | wc -l",
    "cd /Users/drew/webb/_wt/gtm-seo-data && git stash -q && pnpm exec vitest run src/lib/.server/chat/system-prompt-budget.test.ts 2>&1 | head -3; git stash pop -q && git status --short | head -3",
    "git stash -q && git fetch -q origin && git rebase -q origin/master && git stash pop -q",
    "git stash apply",
    "ssh beelink1-wsl 'cd ~/code/_wt/runtime-offbox-evidence-20261003 && git stash pop -q && git diff --stat'",
  ], "deny");
  assert.match(reason("git stash pop"), /stash@\{N\}/);
});

test("shared-stash: a named entry needs this session's worktree and branch", () => {
  const other = repo(join(ROOT, "_wt", "other-session"));
  stash(other, "other\n");
  assert.equal(decide("git stash pop stash@{0}", { cwd: other }), "deny");

  const own = repo(join(ROOT, "_wt", "own-marker"));
  writeFileSync(join(own, ".wt-owner"), `owner=${SESSION}\n`);
  stash(own, "mine\n");
  assert.equal(decide("git stash pop stash@{0}", { cwd: own }), "allow");
  assert.equal(decide("git stash apply 0", { cwd: own }), "allow");
  git(own, "checkout", "-q", "-b", "elsewhere");
  assert.match(reason("git stash pop stash@{0}", { cwd: own }), /made on branch main/);

  const created = repo(join(ROOT, "_wt", "own-transcript"));
  stash(created, "mine\n");
  const transcript = join(ROOT, `${SESSION}.jsonl`);
  writeFileSync(transcript, JSON.stringify({ type: "assistant", message: { content: [
    { type: "tool_use", name: "Bash", input: { command: `git worktree add -b feat/x ${created} origin/main` } }] } }) + "\n");
  assert.equal(decide("git stash pop stash@{0}", { cwd: created }), "deny");
  assert.equal(decide("git stash pop stash@{0}", { cwd: created, transcript }), "allow");

  const outside = repo(join(ROOT, "main-checkout"));
  writeFileSync(join(outside, ".wt-owner"), `owner=${SESSION}\n`);
  stash(outside, "x\n");
  assert.match(reason("git stash pop stash@{0}", { cwd: outside }), /not a _wt worktree/);
});

test("shared-stash: listing, pushing and showing stashes pass", () => {
  check([
    "git stash list | head -3",
    "git stash push -q -m \"jobmap-guessed-domains-wip\" -- jobmap/jobmap/resolve.py",
    "git stash show -p stash@{0}",
    "git stash -q -u",
    "ssh gtr 'cd ~/code/_wt/x && git stash pop -q stash@{0}'",
  ], "allow");
});

// ------------------------------------------------------------------------------ mac-build

test("mac-build: refuses whole-repo installs, builds and test runs on the Mac", () => {
  const mac = { uname: "Darwin" };
  check([
    "W=$(wt-new /Users/drew/code/traces feat/skill-usage --base origin/main) && echo \"$W\" && cd \"$W\" && git log --oneline -1 && ls node_modules >/dev/null 2>&1 || (cd \"$W\" && pnpm install --frozen-lockfile 2>&1 | tail -3)",
    "cd ~/webb/_wt/adc-warm-eviction-20261008 && /bin/bash -c 'export PATH=$HOME/.nvm/versions/node/v24.18.0/bin:$PATH; pnpm exec turbo build --filter=\"@tangle-network/orchestrator^...\" --output-logs=errors-only 2>&1 | tail -4'",
    "cd ~/webb/agent-dev-container/.worktrees/wt-warm-1791508609-cold && L=~/.local/state/agent-work/agent-dev-container/signoff-9800.log && (PATH=$HOME/.nvm/versions/node/v24.18.0/bin:$PATH nohup /bin/bash -c 'pnpm signoff; echo \"SIGNOFF_EXIT=$?\"' > $L 2>&1 &) ; echo started",
    "source /tmp/env.sh; rtk proxy pnpm run test > /tmp/test.log 2>&1; echo exit=$? >> /tmp/test.log",
    "cd /Users/drew/webb/_wt/gtm-asset-detail-20261008 && ./node_modules/.bin/vitest run --reporter=dot 2>&1 | tail -5",
    "pnpm exec vitest run tests/creative-tools.test.ts tests/creative-critique.test.ts tests/outcomes.test.ts tests/asset-detail-facts.test.ts",
    "pnpm build",
    "pnpm -r test",
    "npm ci --no-audit --no-fund",
    "docker build -t gtm-agent .",
    "docker compose up --build -d",
  ], "deny", mac);
  const text = reason("pnpm install --frozen-lockfile", mac);
  assert.match(text, /ssh gtr/);
  assert.match(text, /beelink-gate/);
});

test("mac-build: single test files, remote runs and light commands pass on the Mac", () => {
  const mac = { uname: "Darwin" };
  check([
    "pnpm exec vitest run src/lib/.server/chat/system-prompt-budget.test.ts 2>&1 | tail -3",
    "npx vitest run tests/unit/fal-video-pricing.test.ts tests/unit/video-routes.test.ts",
    "for f in tests/a.test.ts tests/b.test.ts; do pnpm exec vitest run --pool=forks --maxWorkers=1 $f; done",
    "pnpm test -- tests/workspace-config-routes.test.ts",
    "pnpm typecheck",
    "pnpm exec tsc --noEmit -p .",
    "pnpm install --lockfile-only",
    "npm view @tangle-network/agent-app version",
    "node --test tests/kill-guard.test.mjs",
    "ssh gtr 'cd ~/code/gtm-agent && pnpm install --frozen-lockfile && pnpm test'",
    "timeout 900 ssh beelink2-wsl 'bash -lc \"cd ~/code/_wt-router && pnpm install --frozen-lockfile && npx vitest run tests/unit\"'",
    "ssh gtr 'beelink-gate beelink2 git@github.com:tangle-network/gtm-agent.git c1c1055fc12165bd9fdf0eb0cc64e16f3dd2b7a2 -- pnpm test'",
    "S=/tmp/probe; mkdir -p $S/cpu-probe && cd $S/cpu-probe && npm init -y >/dev/null && npm i -s @tangle-network/sandbox@latest 2>&1 | tail -2",
    "cd ~/webb/x && echo '{\"name\":\"e2e-runner\",\"private\":true}' > package.json && npm install --silent playwright@1.56",
    "docker ps --format '{{.Names}}'",
  ], "allow", mac);
  check(["pnpm install --frozen-lockfile", "pnpm test", "pnpm build", "turbo run build"], "allow", { uname: "Linux" });
  assert.equal(decide("CC_ALLOW_MAC_BUILD=1 pnpm install --frozen-lockfile", mac), "allow");
});

// ------------------------------------------------------------------------ ad-hoc scripts

test("scripts: a script written to a file and run later is read like the command itself", () => {
  // 2026-10-04: the bare pop sat in a scratchpad script that the agent then ran.
  const scratch = join(ROOT, "scratchpad");
  mkdirSync(scratch, { recursive: true });
  const gate = join(scratch, "gate1699.sh");
  writeFileSync(gate, "set -uo pipefail\ncd ~/code/_wt/adc-child-allowance-20261004\ngit fetch -q origin develop\n" +
    "git stash -q && git merge -q --no-edit origin/develop && git stash pop -q || { echo MERGE_PROBLEM; git status --short | head; exit 1; }\n");
  const writing = `cat > ${gate} <<'EOF'\ngit stash -q && git stash pop -q\nEOF\nchmod +x ${gate}`;
  assert.equal(decide(writing), "allow", "writing a script is not running it");
  assert.equal(decide(`bash -n ${gate} && echo syntax-ok && scp -q ${gate} gtr:/tmp/`), "allow", "a syntax check runs nothing");
  for (const command of [`bash ${gate}`, `nohup bash ${gate} > /tmp/g.log 2>&1 &`, gate, `source ${gate}`, `. ${gate}`]) {
    assert.equal(decide(command), "deny", `deny expected for: ${command}`);
  }
  assert.match(reason(`bash ${gate}`), new RegExp(`The script ${gate}`));

  const push = join(scratch, "push.sh");
  writeFileSync(push, "git push -q --force-with-lease origin feat/x\n");
  assert.equal(decide(`ssh beelink1-wsl bash -s < ${push}`), "deny");
  assert.equal(decide(`bash -s < ${push}`), "deny");

  const mac = { uname: "Darwin" };
  assert.equal(decide("cat > /tmp/pg-inline.sh <<'EOF'\ncd ~/webb/_wt/x\npnpm install --frozen-lockfile\nEOF\nbash /tmp/pg-inline.sh", mac), "deny");
  assert.equal(decide("cat > /tmp/pg-inline.sh <<'EOF'\nssh gtr 'cd ~/code/x && pnpm install'\nEOF\nbash /tmp/pg-inline.sh", mac), "allow");
});

test("scripts: repository scripts and binaries are not read", () => {
  // claude/tools/adc-wt runs `pnpm install` inside the worktrees it claims; it is maintained code.
  const mac = { uname: "Darwin" };
  assert.equal(decide("bash claude/tools/adc-wt --help", mac), "allow");
  assert.equal(decide("./claude/tools/adc-wt --help", mac), "allow");
  const bin = join(ROOT, "scratchpad", "tool");
  writeFileSync(bin, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0x67, 0x69, 0x74, 0x20, 0x70, 0x75, 0x73, 0x68, 0x20, 0x2d, 0x66]));
  assert.equal(decide(bin), "allow");
});

// -------------------------------------------------------------------------------- general

test("logs never hold a key-shaped value from the command", () => {
  const token = "ghp_" + randomBytes(27).toString("base64").replace(/[^A-Za-z0-9]/g, "A").slice(0, 36);
  assert.equal(decide(`GH_TOKEN=${token} git push -f origin x`), "deny");
  const log = readFileSync(join(HOME, ".claude/logs/process-guard.log"), "utf8");
  assert.ok(!log.includes(token), "the token reached the log");
  assert.match(log, /DENY rule=force-push/);
});

test("other tools and malformed input pass through", () => {
  const write = spawnSync(HOOK, [], { input: JSON.stringify({ tool_name: "Write", tool_input: { content: "git push -f" } }), encoding: "utf8" });
  assert.equal(write.stdout.trim(), "");
  const bad = spawnSync(HOOK, [], { input: "not json", encoding: "utf8" });
  assert.equal(bad.status, 0);
  assert.equal(bad.stdout.trim(), "");
});
