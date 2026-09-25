import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

// gh-drew logs one line per call so the fleet can name who spends the shared GitHub quota.
// A fake gh answers the identity check and the quota read; nothing here reaches GitHub.
const ghDrew = resolve("claude/tools/gh-drew");
const TOKEN = "ghp_FAKEtokenFAKEtokenFAKEtoken0001";

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "gh-drew-log-"));
  const home = join(root, "home");
  const bin = join(root, "bin");
  const logs = join(root, "logs");
  const work = join(home, "code", "lane");
  mkdirSync(bin, { recursive: true });
  mkdirSync(work, { recursive: true });
  const gh = join(bin, "gh");
  writeFileSync(gh, `#!/usr/bin/env bash
case "$*" in
  "api user --jq .login") echo drewstone ;;
  "api rate_limit --jq .resources.core.remaining") echo "\${FAKE_CORE:-4000}" ;;
  "api rate_limit --jq .resources.core.reset") echo 1790332087 ;;
  *) echo "gh ran" ;;
esac
`);
  chmodSync(gh, 0o755);
  // A polling loop as agents write them: a script that calls gh-drew as a child.
  const loop = join(bin, "pr-drive-watch");
  writeFileSync(loop, `#!/usr/bin/env bash\n"${ghDrew}" "$@"\n`);
  chmodSync(loop, 0o755);
  const poll = join(bin, "op-meta-poll.py");
  writeFileSync(poll, `import subprocess, sys\nsys.exit(subprocess.run([${JSON.stringify(ghDrew)}, *sys.argv[1:]]).returncode)\n`);
  const env = { PATH: `${bin}:${process.env.PATH}`, HOME: home, DREW_GH_TOKEN: TOKEN,
    GH_DREW_CACHE_DIR: join(root, "cache"), GH_DREW_LOG_DIR: logs, GH_DREW_SECRETS_FILE: join(root, "absent.env") };
  return { root, home, work, logs, loop, poll, env };
}

function lines(logs) {
  const files = existsSync(logs) ? readdirSync(logs) : [];
  assert.ok(files.every((f) => /^calls-\d{10}\.tsv$/.test(f)), files.join(","));
  return files.flatMap((f) => readFileSync(join(logs, f), "utf8").split("\n").filter(Boolean));
}

function fields(line) {
  const [epoch, outcome, caller, session, cwd, shape] = line.split("\t");
  return { epoch: Number(epoch), outcome, caller, session, cwd, shape };
}

test("a call logs its caller script, tmux pane, directory and API path, and never the token or a flag value", () => {
  const s = sandbox();
  try {
    const before = Math.floor(Date.now() / 1000);
    const result = spawnSync(s.loop, ["api", "-i", "--jq", "[.total_count]", "-H", "Authorization: token ghp_HEADERSECRET0000",
      "repos/o/r/actions/runs?status=queued&per_page=100"], { cwd: s.work, env: { ...s.env, TMUX_PANE: "%7" }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "gh ran");
    const logged = lines(s.logs);
    assert.equal(logged.length, 1);
    const row = fields(logged[0]);
    assert.ok(row.epoch >= before && row.epoch <= before + 60);
    assert.deepEqual({ ...row, epoch: 0 }, { epoch: 0, outcome: "called", caller: "pr-drive-watch", session: "tmux:%7",
      cwd: "~/code/lane", shape: "api repos/o/r/actions/runs?status=queued&per_page=100" });
    const text = readdirSync(s.logs).map((f) => readFileSync(join(s.logs, f), "utf8")).join("");
    assert.ok(!text.includes(TOKEN) && !text.includes("HEADERSECRET") && !text.includes("total_count"));
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("the shape keeps the method, numbers and repositories, and drops bodies, fields and secret values", () => {
  const s = sandbox();
  try {
    const env = { ...s.env, CLAUDE_CODE_SESSION_ID: "abcdef1234567890" };
    delete env.TMUX_PANE;
    for (const args of [["api", "-X", "PATCH", "repos/o/r/pulls/5", "-f", "body=hunter2"],
      ["pr", "view", "12", "--json", "state", "-R", "o/r"],
      ["secret", "set", "NAME", "--body", "123456"],
      ["api", "user?access_token=ghp_QUERYSECRET"]]) {
      const result = spawnSync(ghDrew, args, { cwd: s.root, env: { ...env, GH_DREW_MIN_CORE: "0" }, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    }
    const rows = lines(s.logs).map(fields);
    assert.deepEqual(rows.map((r) => r.shape), ["api PATCH repos/o/r/pulls/5", "pr view 12 o/r", "secret set", "api user"]);
    const text = rows.map((r) => Object.values(r).join("\t")).join("\n");
    assert.ok(!text.includes("hunter2") && !text.includes("123456") && !text.includes("QUERYSECRET"));
    // The Claude session names the caller unless a systemd service does (as on the CI runner).
    let unit = "";
    try {
      unit = readFileSync("/proc/self/cgroup", "utf8").trim().split("\n").pop().split("/").pop();
    } catch {}
    const expected = unit.endsWith(".service") && !unit.startsWith("user@") ? `unit:${unit}` : "claude:abcdef12";
    assert.ok(rows.every((r) => r.session === expected), JSON.stringify(rows));
    assert.ok(rows.every((r) => r.cwd === s.root));
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("a read refused at the quota floor is logged as refused, and a Python caller is named by its script", () => {
  const s = sandbox();
  try {
    const refused = spawnSync(s.loop, ["run", "list", "-R", "o/r"], { cwd: s.work, env: { ...s.env, FAKE_CORE: "10" }, encoding: "utf8" });
    assert.equal(refused.status, 3);
    assert.match(refused.stderr, /refusing a read/);
    const called = spawnSync("python3", [s.poll, "api", "rate_limit"], { cwd: s.work, env: { ...s.env, FAKE_CORE: "10" }, encoding: "utf8" });
    assert.equal(called.status, 0, called.stderr);
    const rows = lines(s.logs).map(fields);
    assert.deepEqual(rows.map((r) => [r.outcome, r.caller, r.shape]),
      [["refused", "pr-drive-watch", "run list o/r"], ["called", "op-meta-poll", "api rate_limit"]]);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("a log directory that cannot be written never fails the call", () => {
  const s = sandbox();
  try {
    writeFileSync(s.logs, "a file where the directory should be\n");
    const result = spawnSync(ghDrew, ["pr", "list"], { cwd: s.work, env: s.env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "gh ran");
    assert.equal(result.stderr, "");
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});
