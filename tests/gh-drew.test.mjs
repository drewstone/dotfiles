import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  "api graphql -f query={viewer{login}} --jq .data.viewer.login") echo drewstone ;;
  "api user --jq .login") echo '{"message":"API rate limit exceeded"}'; exit 1 ;;
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

test("one caller's core reads are capped per window, while other callers, writes and free reads pass", () => {
  const s = sandbox();
  try {
    const env = { ...s.env, TZ: "UTC", TMUX_PANE: "%7", GH_DREW_CALLER_10M: "3", GH_DREW_CALLER_1H: "5" };
    const run = (args, extra = {}) => spawnSync(s.loop, args, { cwd: s.work, env: { ...env, ...extra }, encoding: "utf8" });
    for (let i = 0; i < 3; i++) assert.equal(run(["api", "repos/o/r/actions/runs/9/jobs"]).status, 0);
    const capped = run(["run", "view", "9", "-R", "o/r"]);
    assert.equal(capped.status, 3);
    assert.match(capped.stderr, /pr-drive-watch \(tmux:%7\) made 3 core reads in the last 10 minutes/);
    // GraphQL, /rate_limit, explicit and implicit writes, and another pane are not this caller's core reads.
    for (const args of [["api", "graphql", "-f", "query=q"], ["api", "rate_limit"], ["pr", "view", "5"],
      ["api", "-X", "POST", "repos/o/r/issues/5/comments"], ["api", "repos/o/r/issues/5/comments", "-f", "body=x"]]) {
      assert.equal(run(args).status, 0, args.join(" "));
    }
    assert.equal(run(["api", "repos/o/r/pulls/5"], { TMUX_PANE: "%8" }).status, 0);
    const rows = lines(s.logs).map(fields);
    assert.deepEqual(rows.filter((r) => r.outcome === "refused").map((r) => r.shape), ["run view 9 o/r"]);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("reads older than ten minutes still count toward the hourly cap", () => {
  const s = sandbox();
  try {
    const then = Math.floor(Date.now() / 1000) - 1200;
    const hour = new Date(then * 1000).toISOString().replace(/[-T:]/g, "").slice(0, 10);
    mkdirSync(s.logs, { recursive: true });
    writeFileSync(join(s.logs, `calls-${hour}.tsv`),
      `${then}\tcalled\tpr-drive-watch\ttmux:%7\t~/code/lane\tapi repos/o/r/pulls/1\n`.repeat(5));
    const env = { ...s.env, TZ: "UTC", TMUX_PANE: "%7", GH_DREW_CALLER_10M: "3", GH_DREW_CALLER_1H: "5" };
    const capped = spawnSync(s.loop, ["api", "repos/o/r/pulls/2"], { cwd: s.work, env, encoding: "utf8" });
    assert.equal(capped.status, 3);
    assert.match(capped.stderr, /made 0 core reads in the last 10 minutes\n\(cap 3\) and 5 in the last hour \(cap 5\)/);
    const off = spawnSync(s.loop, ["api", "repos/o/r/pulls/2"], { cwd: s.work, env: { ...env, GH_DREW_CALLER_1H: "0" }, encoding: "utf8" });
    assert.equal(off.status, 0, off.stderr);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("a Node 24 caller, whose process is named MainThread, is named by its script", () => {
  const s = sandbox();
  try {
    const node = join(s.root, "bin", "MainThread");
    copyFileSync("/bin/bash", node);
    chmodSync(node, 0o755);
    const script = join(s.root, "bin", "revision-receipt.mjs");
    writeFileSync(script, `"${ghDrew}" "$@"\n`);
    const result = spawnSync(node, [script, "api", "repos/o/r/pulls/3"], { cwd: s.work, env: s.env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(lines(s.logs).map(fields).map((r) => r.caller), ["revision-receipt"]);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

// GitHub appends "Co-authored-by:" to a squash merge it writes itself when PR commits carry an unverified email.
// gh-drew supplies --body to every squash merge that names none, so GitHub never writes that message.
function mergeSandbox(description) {
  const s = sandbox();
  const argsFile = join(s.root, "merge-args");
  writeFileSync(join(s.root, "bin", "gh"), `#!/usr/bin/env bash
case "$*" in
  "api graphql -f query={viewer{login}} --jq .data.viewer.login") echo drewstone ;;
  "api user --jq .login") echo '{"message":"API rate limit exceeded"}'; exit 1 ;;
  "api rate_limit --jq .resources.core.remaining") echo 4000 ;;
  "pr view"*"--json title --jq .title") echo "fix(x): one change" ;;
  "pr view"*"--json body --jq .body") printf '%s' "$FAKE_BODY" ;;
  "pr merge"*|"pr -R "*" merge"*) for a in "$@"; do printf '%s\\0' "$a"; done > "${argsFile}" ;;
  *) echo "unexpected: $*" >&2; exit 9 ;;
esac
`);
  return { ...s, argsFile, env: { ...s.env, FAKE_BODY: description } };
}

function merge(s, args) {
  const result = spawnSync(resolve(ghDrew), args, { cwd: s.work, env: s.env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return readFileSync(s.argsFile, "utf8").split("\0").slice(0, -1);
}

test("a squash merge without a body gets the PR title and the first prose paragraph, never a trailer", () => {
  const s = mergeSandbox("## Summary\n\n- Fixes the parser so empty input\n  returns null.\n\nSecond paragraph.\n\nCo-authored-by: X <x@tangle.tools>\n🤖 Generated with [Claude Code](https://claude.com/claude-code)");
  try {
    const args = merge(s, ["pr", "merge", "12", "--squash", "-R", "o/r", "--delete-branch"]);
    assert.deepEqual(args.slice(0, 7), ["pr", "merge", "12", "--squash", "-R", "o/r", "--delete-branch"]);
    assert.equal(args[7], "--body");
    assert.equal(args[8], "fix(x): one change\n\nFixes the parser so empty input returns null.");
    assert.ok(!args[8].includes("Co-authored-by") && !args[8].includes("Generated with"));
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("a description of only trailers yields the title alone; an explicit body and non-squash merges pass through", () => {
  const s = mergeSandbox("Co-authored-by: X <x@tangle.tools>\n");
  try {
    assert.deepEqual(merge(s, ["pr", "merge", "-s", "--repo=o/r"]), ["pr", "merge", "-s", "--repo=o/r", "--body", "fix(x): one change"]);
    assert.deepEqual(merge(s, ["pr", "merge", "3", "--squash", "--body", "mine"]), ["pr", "merge", "3", "--squash", "--body", "mine"]);
    assert.deepEqual(merge(s, ["pr", "merge", "3", "-s", "-F", "msg.txt"]), ["pr", "merge", "3", "-s", "-F", "msg.txt"]);
    assert.deepEqual(merge(s, ["pr", "merge", "3", "--merge"]), ["pr", "merge", "3", "--merge"]);
    assert.deepEqual(merge(s, ["pr", "merge", "3", "-sd"]), ["pr", "merge", "3", "-sd", "--body", "fix(x): one change"]);
    assert.deepEqual(merge(s, ["pr", "merge", "3", "-ds", "-Ro/r"]), ["pr", "merge", "3", "-ds", "-Ro/r", "--body", "fix(x): one change"]);
    assert.deepEqual(merge(s, ["pr", "merge", "3", "-sb", "mine"]), ["pr", "merge", "3", "-sb", "mine"]);
    assert.deepEqual(merge(s, ["pr", "-R", "o/r", "merge", "3", "-s"]), ["pr", "-R", "o/r", "merge", "3", "-s", "--body", "fix(x): one change"]);
    assert.deepEqual(merge(s, ["pr", "merge", "--squash", "--", "3"]), ["pr", "merge", "--squash", "--body", "fix(x): one change", "--", "3"]);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

// Lane provenance: a PR body or squash message gh-drew writes ends with the run that made it
// ("Run ID:" or "Session:"), the line hills merges-lane-attributed counts. Never a trailer.
function prSandbox() {
  const s = sandbox();
  const argsFile = join(s.root, "pr-args");
  const editFile = join(s.root, "edit-args");
  writeFileSync(join(s.root, "bin", "gh"), `#!/usr/bin/env bash
case "$*" in
  "api graphql -f query={viewer{login}} --jq .data.viewer.login") echo drewstone ;;
  "api user --jq .login") echo '{"message":"API rate limit exceeded"}'; exit 1 ;;
  "api rate_limit --jq .resources.core.remaining") echo 4000 ;;
  "pr view"*"--json title --jq .title") echo "fix(x): one change" ;;
  "pr view"*"--json body --jq .body") printf '%s' "$FAKE_BODY" ;;
  "pr edit https://"*) for a in "$@"; do printf '%s\\0' "$a"; done > "${editFile}" ;;
  "pr create"*|"pr edit"*|"pr merge"*|"pr -R "*) for a in "$@"; do printf '%s\\0' "$a"; done > "${argsFile}"
    case "$*" in *--fill*|*" -df"*) echo "https://github.com/o/r/pull/77" ;; esac ;;
  *) echo "unexpected: $*" >&2; exit 9 ;;
esac
`);
  return { ...s, argsFile, editFile };
}

function runPr(s, args, env = {}, input) {
  const result = spawnSync(resolve(ghDrew), args, { cwd: s.work, env: { ...s.env, ...env }, encoding: "utf8", input });
  assert.equal(result.status, 0, result.stderr);
  return { args: readFileSync(s.argsFile, "utf8").split("\0").slice(0, -1), stdout: result.stdout };
}

const RUN = { TANGLE_RUN_ID: "run_abc123" };

test("pr create and pr edit bodies end with the run's Run ID line, once", () => {
  const s = prSandbox();
  try {
    assert.deepEqual(runPr(s, ["pr", "create", "--title", "t", "--body", "Does a thing."], RUN).args,
      ["pr", "create", "--title", "t", "--body", "Does a thing.\n\nRun ID: run_abc123"]);
    assert.deepEqual(runPr(s, ["pr", "-R", "o/r", "edit", "5", "-b", "x\n\n"], RUN).args,
      ["pr", "-R", "o/r", "edit", "5", "-b", "x\n\nRun ID: run_abc123"]);
    assert.deepEqual(runPr(s, ["pr", "create", "--body=y"], RUN).args, ["pr", "create", "--body=y\n\nRun ID: run_abc123"]);
    // A body that already names its lane, run or session is left alone (any case, markdown emphasis allowed).
    for (const body of ["x\n\nRun ID: run_other", "x\n**Lane:** gtm", "x\nsession: abc"]) {
      assert.deepEqual(runPr(s, ["pr", "create", "--body", body], RUN).args, ["pr", "create", "--body", body]);
    }
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("a body file or stdin body is read and passed as --body with the line; Session is the fallback", () => {
  const s = prSandbox();
  try {
    const file = join(s.root, "body.md");
    writeFileSync(file, "From a file.\n");
    assert.deepEqual(runPr(s, ["pr", "create", "--body-file", file], RUN).args,
      ["pr", "create", "--body", "From a file.\n\nRun ID: run_abc123"]);
    assert.deepEqual(runPr(s, ["pr", "create", `--body-file=${file}`], { TANGLE_CLAUDE_SESSION: "sess-9" }).args,
      ["pr", "create", "--body", "From a file.\n\nSession: sess-9"]);
    assert.deepEqual(runPr(s, ["pr", "create", "-F", "-"], RUN, "From stdin.\n").args,
      ["pr", "create", "--body", "From stdin.\n\nRun ID: run_abc123"]);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("with no run or session in the environment nothing changes", () => {
  const s = prSandbox();
  try {
    const file = join(s.root, "body.md");
    writeFileSync(file, "Plain.\n");
    assert.deepEqual(runPr(s, ["pr", "create", "--body", "Plain."]).args, ["pr", "create", "--body", "Plain."]);
    assert.deepEqual(runPr(s, ["pr", "create", "-F", file]).args, ["pr", "create", "-F", file]);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("pr create --fill gets the line added to the body gh wrote, after creation", () => {
  const s = prSandbox();
  try {
    const out = runPr(s, ["pr", "create", "--fill"], { ...RUN, FAKE_BODY: "Commit body." });
    assert.deepEqual(out.args, ["pr", "create", "--fill"]);
    assert.match(out.stdout, /pull\/77/);
    const edit = readFileSync(s.editFile, "utf8").split("\0").slice(0, -1);
    assert.deepEqual(edit, ["pr", "edit", "https://github.com/o/r/pull/77", "--body", "Commit body.\n\nRun ID: run_abc123"]);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("a squash merge message gh-drew writes ends with the Run ID line, and never a trailer", () => {
  const s = prSandbox();
  try {
    const args = runPr(s, ["pr", "merge", "12", "--squash"], { ...RUN, FAKE_BODY: "Fixes it.\n\nCo-authored-by: X <x@y>" }).args;
    assert.deepEqual(args.slice(0, 4), ["pr", "merge", "12", "--squash"]);
    assert.equal(args[5], "fix(x): one change\n\nFixes it.\n\nRun ID: run_abc123");
    assert.ok(!args[5].includes("Co-authored-by"));
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("short flags alone, attached or clustered get the line; a cluster with f is a fill", () => {
  const s = prSandbox();
  try {
    const file = join(s.root, "b.md");
    writeFileSync(file, "Filed.\n");
    assert.deepEqual(runPr(s, ["pr", "create", "-bInline"], RUN).args, ["pr", "create", "--body", "Inline\n\nRun ID: run_abc123"]);
    assert.deepEqual(runPr(s, ["pr", "create", `-F${file}`], RUN).args, ["pr", "create", "--body", "Filed.\n\nRun ID: run_abc123"]);
    assert.deepEqual(runPr(s, ["pr", "create", "-db", "Drafted"], RUN).args, ["pr", "create", "-d", "--body", "Drafted\n\nRun ID: run_abc123"]);
    assert.deepEqual(runPr(s, ["pr", "create", "-t", "T", "-b", "B"], RUN).args, ["pr", "create", "-t", "T", "-b", "B\n\nRun ID: run_abc123"]);
    const out = runPr(s, ["pr", "create", "-df"], { ...RUN, FAKE_BODY: "Commits." });
    assert.deepEqual(out.args, ["pr", "create", "-df"]);
    assert.deepEqual(readFileSync(s.editFile, "utf8").split("\0").slice(0, -1),
      ["pr", "edit", "https://github.com/o/r/pull/77", "--body", "Commits.\n\nRun ID: run_abc123"]);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("an unreadable body file leaves the arguments for gh to reject, and a fill that prints no URL keeps its status", () => {
  const s = prSandbox();
  try {
    assert.deepEqual(runPr(s, ["pr", "edit", "12", "--body-file", "missing.md"], RUN).args, ["pr", "edit", "12", "--body-file", "missing.md"]);
    writeFileSync(join(s.root, "bin", "gh"), `#!/usr/bin/env bash
case "$*" in
  "api graphql -f query={viewer{login}} --jq .data.viewer.login") echo drewstone ;;
  "api user --jq .login") echo '{"message":"API rate limit exceeded"}'; exit 1 ;;
  "api rate_limit --jq .resources.core.remaining") echo 4000 ;;
  "pr create"*) echo "Opening in your browser." ;;
  *) echo "unexpected: $*" >&2; exit 9 ;;
esac
`);
    const result = spawnSync(resolve(ghDrew), ["pr", "create", "--fill", "--web"], { cwd: s.work, env: { ...s.env, ...RUN }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /browser/);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});
