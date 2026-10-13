import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

// ops-board #10097: a fleet lane with an open PR is refused another `pr create`.
// A fake gh answers the identity check and the create; a fake gh-read answers
// the state of each ledger PR. Nothing here reaches GitHub.
const ghDrew = resolve("claude/tools/gh-drew");
const TOKEN = "ghp_FAKEtokenFAKEtokenFAKEtoken0002";
const LANE = "run_lane0000000000000000000000000001";
const OPEN_PR = "https://github.com/o/r/pull/7";
const NEW_PR = "https://github.com/o/r/pull/8";

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "gh-drew-pr-wip-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  const gh = join(bin, "gh");
  writeFileSync(gh, `#!/usr/bin/env bash
case "$*" in
  "api graphql -f query={viewer{login}} --jq .data.viewer.login") echo drewstone ;;
  "api rate_limit --jq .resources.core.remaining") echo 4000 ;;
  "api rate_limit --jq .resources.core.reset") echo 1790332087 ;;
  "pr create"*)
    if [[ "\${FAKE_CREATE_NO_URL:-}" == 1 ]]; then echo "Opening in your browser."
    else echo "Creating pull request"; echo "${NEW_PR}"; fi ;;
  "pr view ${NEW_PR} --json body --jq .body") echo "Base body" ;;
  "pr edit ${NEW_PR}"*) printf '%s\\n' "$@" > "$FAKE_EDIT_ARGS" ;;
  *) echo "gh ran" ;;
esac
`);
  chmodSync(gh, 0o755);
  // gh-read records each state read so a test can prove no read happened.
  const reads = join(root, "reads.log");
  const reader = join(bin, "gh-read");
  writeFileSync(reader, `#!/usr/bin/env bash
echo "$*" >>"${reads}"
echo "\${FAKE_PR_STATE-OPEN}"
`);
  chmodSync(reader, 0o755);
  const wip = join(root, "pr-wip");
  const env = { PATH: `${bin}:${process.env.PATH}`, HOME: join(root, "home"), DREW_GH_TOKEN: TOKEN,
    GH_DREW_CACHE_DIR: join(root, "cache"), GH_DREW_LOG_DIR: join(root, "logs"),
    GH_DREW_SECRETS_FILE: join(root, "absent.env"), GH_DREW_PR_WIP_DIR: wip,
    FAKE_EDIT_ARGS: join(root, "edit-args") };
  delete env.TANGLE_ROOT_RUN_ID;
  delete env.TANGLE_RUN_ID;
  return { root, wip, reads, ledger: join(wip, `${LANE}.tsv`), env };
}

function create(s, extra = {}) {
  return spawnSync(ghDrew, ["pr", "create", "--title", "t", "--body", "b"],
    { env: { ...s.env, ...extra }, encoding: "utf8" });
}

function seed(s, url) {
  mkdirSync(s.wip, { recursive: true });
  writeFileSync(s.ledger, `2026-10-12T00:00:00Z\tcreated\t${url}\n`);
}

test("a shell with no lane id creates freely and keeps no ledger", () => {
  const s = sandbox();
  try {
    const r = create(s);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes(NEW_PR));
    assert.ok(!existsSync(s.wip));
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test("a lane's first create is allowed without a state read and joins its ledger", () => {
  const s = sandbox();
  try {
    const r = create(s, { TANGLE_RUN_ID: LANE });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes(NEW_PR));
    assert.match(readFileSync(s.ledger, "utf8"), new RegExp(`\\tcreated\\t${NEW_PR}\\n$`));
    assert.ok(!existsSync(s.reads), "an empty ledger needs no GitHub read");
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test("a lane's fill create records the PR and appends its run line", () => {
  const s = sandbox();
  try {
    const r = spawnSync(ghDrew, ["pr", "create", "--title", "t", "--fill"],
      { env: { ...s.env, TANGLE_RUN_ID: LANE }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes(NEW_PR));
    assert.match(readFileSync(s.ledger, "utf8"), new RegExp(`\\tcreated\\t${NEW_PR}\\n$`));
    const editArgs = readFileSync(s.env.FAKE_EDIT_ARGS, "utf8");
    assert.ok(editArgs.includes("Base body\n\nRun ID: " + LANE), editArgs);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test("a successful create without a printed URL keeps its status and records no PR", () => {
  const s = sandbox();
  try {
    const r = create(s, { TANGLE_RUN_ID: LANE, FAKE_CREATE_NO_URL: "1" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Opening in your browser/);
    assert.ok(!existsSync(s.ledger));
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test("a lane with an open PR is refused, and the refusal names that PR", () => {
  const s = sandbox();
  try {
    seed(s, OPEN_PR);
    const r = create(s, { TANGLE_RUN_ID: LANE, FAKE_PR_STATE: "OPEN" });
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes(`already has open PR ${OPEN_PR}`), r.stderr);
    assert.ok(r.stderr.includes("ops-board #10097"));
    assert.ok(!r.stdout.includes(NEW_PR), "gh must not run");
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test("a root-level repo flag cannot evade the open-PR lane guard", () => {
  const s = sandbox();
  try {
    seed(s, OPEN_PR);
    const r = spawnSync(ghDrew, ["-R", "o/r", "pr", "create", "--body", "b"],
      { env: { ...s.env, TANGLE_RUN_ID: LANE, FAKE_PR_STATE: "OPEN" }, encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes(`already has open PR ${OPEN_PR}`), r.stderr);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test("a subagent shares its lane's ledger through the root run id", () => {
  const s = sandbox();
  try {
    seed(s, OPEN_PR);
    const r = create(s, { TANGLE_ROOT_RUN_ID: LANE, TANGLE_RUN_ID: "run_subagent", FAKE_PR_STATE: "OPEN" });
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes(OPEN_PR));
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test("an unreadable PR state refuses rather than admits", () => {
  const s = sandbox();
  try {
    seed(s, OPEN_PR);
    const r = create(s, { TANGLE_RUN_ID: LANE, FAKE_PR_STATE: "" });
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes("state: unreadable"), r.stderr);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

for (const state of ["MERGED", "CLOSED"]) {
  test(`a lane whose PR is ${state} may create the next one`, () => {
    const s = sandbox();
    try {
      seed(s, OPEN_PR);
      const r = create(s, { TANGLE_RUN_ID: LANE, FAKE_PR_STATE: state });
      assert.equal(r.status, 0, r.stderr);
      assert.ok(readFileSync(s.ledger, "utf8").includes(`created\t${NEW_PR}`));
    } finally { rmSync(s.root, { recursive: true, force: true }); }
  });
}

test("an override is allowed and its reason is logged to the ledger", () => {
  const s = sandbox();
  try {
    seed(s, OPEN_PR);
    const r = create(s, { TANGLE_RUN_ID: LANE, PR_WIP_OVERRIDE: "stacked child of #7" });
    assert.equal(r.status, 0, r.stderr);
    const ledger = readFileSync(s.ledger, "utf8");
    assert.ok(ledger.includes("\toverride\tstacked child of #7\n"));
    assert.ok(ledger.includes(`created\t${NEW_PR}`));
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test("other commands in a lane are not limited", () => {
  const s = sandbox();
  try {
    seed(s, OPEN_PR);
    const r = spawnSync(ghDrew, ["pr", "view", "7"], { env: { ...s.env, TANGLE_RUN_ID: LANE }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), "gh ran");
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});
