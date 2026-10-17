import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

// gh-drew reads a PR's Codex review before merging it. The fixtures are GitHub's GraphQL answers
// for real PRs: dotfiles#465 after its review (two unanswered P2 threads), dotfiles#465 as it was
// when it merged 22 s after opening (the summary comment's first version, from its edit history:
// review running on the head), and dotfiles#464 (a failed review and a usage-limit comment).
// A fake gh serves them in order; nothing here reaches GitHub.
const ghDrew = resolve("claude/tools/gh-drew");
const fixtures = resolve("tests/fixtures/gh-drew-review");
const DONE = join(fixtures, "pr465-review-done.json");
const RUNNING = join(fixtures, "pr465-review-running.json");
const LIMIT = join(fixtures, "pr464-usage-limit.json");

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "gh-drew-review-"));
  const bin = join(root, "bin");
  const state = join(root, "state");
  mkdirSync(bin, { recursive: true });
  mkdirSync(state, { recursive: true });
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env bash
case "$*" in
  "api graphql -f query={viewer{login}} --jq .data.viewer.login") echo drewstone ;;
  "api rate_limit --jq .resources.core.remaining") echo 4000 ;;
  "api graphql "*reviewThreads*)
    n=$(( $(cat "${state}/reads" 2>/dev/null || echo 0) + 1 )); echo "$n" > "${state}/reads"
    for a in "$@"; do printf '%s\\0' "$a"; done > "${state}/read-$n"
    if [ -n "\${FAKE_REVIEW_FAIL:-}" ]; then echo "\$FAKE_REVIEW_FAIL" >&2; exit 1; fi
    IFS=, read -r -a files <<< "$FAKE_REVIEWS"
    i=$(( n < \${#files[@]} ? n - 1 : \${#files[@]} - 1 ))
    cat "\${files[$i]}" ;;
  "pr view"*"--json title --jq .title") echo "fix(x): one change" ;;
  "pr view"*"--json body --jq .body") echo "Does a thing." ;;
  "pr merge"*|"pr -R "*" merge"*) for a in "$@"; do printf '%s\\0' "$a"; done > "${state}/merge" ;;
  *) echo "unexpected: $*" >&2; exit 9 ;;
esac
`);
  chmodSync(join(bin, "gh"), 0o755);
  const env = { PATH: `${bin}:${process.env.PATH}`, HOME: join(root, "home"), DREW_GH_TOKEN: "ghp_FAKEtokenFAKEtokenFAKEtoken0001",
    GH_DREW_CACHE_DIR: join(root, "cache"), GH_DREW_LOG_DIR: join(root, "logs"), GH_DREW_SECRETS_FILE: join(root, "absent.env") };
  return { root, state, env };
}

function run(s, args, reviews, extra = {}) {
  const result = spawnSync(ghDrew, args, { cwd: s.root, env: { ...s.env, FAKE_REVIEWS: reviews.join(","), ...extra }, encoding: "utf8" });
  const merged = existsSync(join(s.state, "merge")) ? readFileSync(join(s.state, "merge"), "utf8").split("\0").slice(0, -1) : null;
  const reads = existsSync(join(s.state, "reads")) ? Number(readFileSync(join(s.state, "reads"), "utf8")) : 0;
  return { ...result, merged, reads };
}

function readArgs(s, n = 1) {
  return readFileSync(join(s.state, `read-${n}`), "utf8").split("\0").slice(0, -1);
}

function logged(s) {
  const dir = s.env.GH_DREW_LOG_DIR;
  const files = existsSync(dir) ? readdirSync(dir) : [];
  return files.flatMap((f) => readFileSync(join(dir, f), "utf8").split("\n").filter(Boolean)).map((l) => l.split("\t")[1]);
}

// A copy of the #465 answer with its pull request changed by `edit`.
function variant(s, edit) {
  const answer = JSON.parse(readFileSync(DONE, "utf8"));
  edit(answer.data.repository.pullRequest);
  const file = join(s.root, `variant-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify(answer));
  return file;
}

const REFUSAL_465 = `gh-drew: refusing to merge https://github.com/drewstone/dotfiles/pull/465: 2 Codex review finding(s) have no answer:
  claude/tools/beelink-gate:1517  P2 Always measure the pnpm store used by the frozen install
    https://github.com/drewstone/dotfiles/pull/465#discussion_r4279903162
  claude/tools/beelink-gate:1066  P2 Bound each disk scan by the remaining gate hold time
    https://github.com/drewstone/dotfiles/pull/465#discussion_r4279903172
For each, fix it and reply on the thread with the commit, reply with the evidence that it
does not apply, or resolve the thread. Then merge again.
Override: GH_DREW_REVIEW_OVERRIDE=<reason>
`;

test("dotfiles#465 as it was at its merge: the running review is waited for, then its findings refuse", () => {
  const s = sandbox();
  try {
    const r = run(s, ["pr", "merge", "465", "--squash", "-R", "drewstone/dotfiles"], [RUNNING, DONE], { GH_DREW_REVIEW_WAIT: "3" });
    assert.equal(r.status, 1, r.stderr);
    assert.equal(r.stderr, "gh-drew: waiting up to 3s to merge https://github.com/drewstone/dotfiles/pull/465: "
      + "Codex code review of b132bb7 is running.\n" + REFUSAL_465);
    assert.equal(r.merged, null);
    assert.equal(r.reads, 2);
    assert.deepEqual(logged(s), ["refused"]);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("a review still running when the wait ends refuses with exit 75, and a wait of 0 refuses at once", () => {
  const s = sandbox();
  try {
    const r = run(s, ["pr", "merge", "465", "--auto", "--squash", "-R", "drewstone/dotfiles"], [RUNNING], { GH_DREW_REVIEW_WAIT: "0" });
    assert.equal(r.status, 75, r.stderr);
    assert.match(r.stderr, /refusing to merge https:\/\/github\.com\/drewstone\/dotfiles\/pull\/465: Codex code review of b132bb7 is running \(waited 0s, GH_DREW_REVIEW_WAIT=0\)/);
    assert.match(r.stderr, /Merge again once Codex answers, or override with GH_DREW_REVIEW_OVERRIDE=<reason>/);
    assert.equal(r.merged, null);
    assert.equal(r.reads, 1);
    assert.deepEqual(logged(s), ["refused"]);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

// Of 44 dotfiles Codex reviews from 2026-10-11 to 10-15, 9 started after a merge made 3 to 12 s after
// the PR opened or turned ready, before Codex had commented (#423, #424, #428, #429, #439, #442 and others).
test("a PR merged seconds after it turned ready waits for Codex to comment; an older PR with no Codex comment merges", () => {
  const s = sandbox();
  try {
    const justReady = variant(s, (pr) => {
      pr.reviewThreads.nodes = [];
      pr.comments.nodes = [];
      pr.timelineItems.nodes = [{ createdAt: new Date(Date.now() - 5000).toISOString().replace(/\.\d+Z$/, "Z") }];
    });
    const r = run(s, ["pr", "merge", "465", "--squash", "-R", "drewstone/dotfiles"], [justReady, DONE], { GH_DREW_REVIEW_WAIT: "4" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /^gh-drew: waiting up to [1-4]s to merge https:\/\/github\.com\/drewstone\/dotfiles\/pull\/465: no Codex comment yet, \d+s after the PR opened or turned ready\.\n/);
    assert.ok(r.stderr.endsWith(REFUSAL_465), r.stderr);
    assert.equal(r.merged, null);
    assert.equal(r.reads, 2);

    const s2 = sandbox();
    try {
      const refused = run(s2, ["pr", "merge", "465", "-R", "drewstone/dotfiles"], [justReady], { GH_DREW_REVIEW_WAIT: "0" });
      assert.equal(refused.status, 75, refused.stderr);
      assert.match(refused.stderr, /: no Codex comment yet, \d+s after the PR opened or turned ready \(waited 0s, GH_DREW_REVIEW_WAIT=0\)/);
      assert.equal(refused.merged, null);
    } finally {
      rmSync(s2.root, { recursive: true, force: true });
    }

    const s3 = sandbox();
    try {
      const quiet = variant(s3, (pr) => { pr.reviewThreads.nodes = []; pr.comments.nodes = []; });
      const merged = run(s3, ["pr", "merge", "465", "-R", "drewstone/dotfiles"], [quiet]);
      assert.equal(merged.status, 0, merged.stderr);
      assert.equal(merged.stderr, "");
      assert.deepEqual(merged.merged, ["pr", "merge", "465", "-R", "drewstone/dotfiles"]);
      assert.equal(merged.reads, 1);
    } finally {
      rmSync(s3.root, { recursive: true, force: true });
    }
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("dotfiles#464, with a failed review and a usage-limit comment, carries on to the merge", () => {
  const s = sandbox();
  try {
    const r = run(s, ["pr", "merge", "464", "--squash", "-R", "drewstone/dotfiles"], [LIMIT]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, "");
    assert.deepEqual(r.merged, ["pr", "merge", "464", "--squash", "-R", "drewstone/dotfiles", "--body", "fix(x): one change\n\nDoes a thing."]);
    assert.equal(r.reads, 1);
    assert.deepEqual(logged(s), ["called"]);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("a finding answered by a person or resolved carries on, also after waiting; a bot's reply is no answer", () => {
  const s = sandbox();
  try {
    const reply = (login, typename) => ({ author: { __typename: typename, login }, body: "Fixed in abc1234.", url: "https://github.com/drewstone/dotfiles/pull/465#discussion_r1" });
    const answered = variant(s, (pr) => {
      pr.reviewThreads.nodes[0].comments.nodes.push(reply("drewstone", "User"));
      pr.reviewThreads.nodes[1].isResolved = true;
    });
    const r = run(s, ["pr", "merge", "465", "--squash", "-R", "drewstone/dotfiles"], [RUNNING, answered], { GH_DREW_REVIEW_WAIT: "3" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /^gh-drew: waiting up to 3s to merge .*: Codex code review of b132bb7 is running\.\n$/);
    assert.deepEqual(r.merged.slice(0, 3), ["pr", "merge", "465"]);
    assert.equal(r.reads, 2);

    const s2 = sandbox();
    try {
      const botOnly = variant(s2, (pr) => {
        pr.reviewThreads.nodes[0].comments.nodes.push(reply("github-actions", "Bot"));
        pr.reviewThreads.nodes[1].isResolved = true;
      });
      const refused = run(s2, ["pr", "merge", "465", "-R", "drewstone/dotfiles"], [botOnly]);
      assert.equal(refused.status, 1, refused.stderr);
      assert.match(refused.stderr, /1 Codex review finding\(s\) have no answer:\n  claude\/tools\/beelink-gate:1517  P2 Always measure/);
      assert.doesNotMatch(refused.stderr, /1066/);
      assert.equal(refused.merged, null);
    } finally {
      rmSync(s2.root, { recursive: true, force: true });
    }
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("the override merges past Codex findings and logs its reason; a read that fails refuses", () => {
  const s = sandbox();
  try {
    const r = run(s, ["pr", "merge", "465", "-R", "drewstone/dotfiles", "--merge"], [DONE], { GH_DREW_REVIEW_OVERRIDE: "findings fixed in #466" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /merging without the Codex review check: findings fixed in #466/);
    assert.deepEqual(r.merged, ["pr", "merge", "465", "-R", "drewstone/dotfiles", "--merge"]);
    // One read still asks whether the PR's author holds it.
    assert.equal(r.reads, 1);
    assert.deepEqual(logged(s), ["review-override: findings fixed in #466", "called"]);

    const s2 = sandbox();
    try {
      const failed = run(s2, ["pr", "merge", "465", "-R", "drewstone/dotfiles"], [DONE], { FAKE_REVIEW_FAIL: "HTTP 502: Bad Gateway" });
      assert.equal(failed.status, 1, failed.stderr);
      assert.match(failed.stderr, /refusing to merge: cannot read the PR's reviews: HTTP 502: Bad Gateway/);
      assert.equal(failed.merged, null);
      assert.deepEqual(logged(s2), ["refused"]);
    } finally {
      rmSync(s2.root, { recursive: true, force: true });
    }
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("the PR is read once by number, URL, -R repository or head branch; --disable-auto reads nothing", () => {
  const vars = (args) => args.filter((a, i) => (args[i - 1] === "-f" || args[i - 1] === "-F") && !a.startsWith("query="));
  const query = (args) => args.find((a) => a.startsWith("query="));
  const cases = [
    [["pr", "merge", "https://github.com/drewstone/dotfiles/pull/464", "-s"], ["owner=drewstone", "name=dotfiles", "number=464"], "pullRequest("],
    [["pr", "-R", "github.com/drewstone/dotfiles", "merge", "#464", "-d"], ["owner=drewstone", "name=dotfiles", "number=464"], "pullRequest("],
    [["pr", "merge", "-Rdrewstone/dotfiles", "fix/gh-drew-codex-review-guard"], ["owner=drewstone", "name=dotfiles", "branch=fix/gh-drew-codex-review-guard"], "pullRequests(headRefName"],
    [["pr", "merge", "--auto", "--squash"], ["owner={owner}", "name={repo}", "branch={branch}"], "pullRequests(headRefName"],
  ];
  for (const [args, expected, shape] of cases) {
    const s = sandbox();
    try {
      const r = run(s, args, [LIMIT]);
      assert.equal(r.status, 0, `${args.join(" ")}: ${r.stderr}`);
      assert.equal(r.reads, 1);
      assert.deepEqual(vars(readArgs(s)), expected);
      assert.ok(query(readArgs(s)).includes(shape), query(readArgs(s)));
    } finally {
      rmSync(s.root, { recursive: true, force: true });
    }
  }
  const s = sandbox();
  try {
    const r = run(s, ["pr", "merge", "465", "--disable-auto", "-R", "drewstone/dotfiles"], [DONE]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.reads, 0);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

// agent-container#11312 (2026-10-17): merge-on-green skipped it for six hours on "merge only after the
// pre-deploy check below"; a lane merged it by hand, under the host-wide review override, before the
// check was shown. A hold is refused whatever the override says, and lifted only with evidence.
test("a held PR is refused, override or not; GH_DREW_PRECONDITIONS_SHOWN merges it and logs the evidence", () => {
  const body = "Ops item #10252. Carries the `hold` label: merge only after the pre-deploy check below.\n\n## Pre-deploy check";
  for (const extra of [{}, { GH_DREW_REVIEW_OVERRIDE: "Codex seats full" }]) {
    const s = sandbox();
    try {
      const held = variant(s, (pr) => { pr.body = body; pr.labels = { nodes: [] }; pr.reviewThreads.nodes = []; });
      const r = run(s, ["pr", "merge", "465", "-R", "drewstone/dotfiles", "--merge"], [held], extra);
      assert.equal(r.status, 1, r.stderr);
      assert.equal(r.stderr, "gh-drew: refusing to merge https://github.com/drewstone/dotfiles/pull/465: its author holds it "
        + "(hold phrase in body: Ops item #10252. Carries the `hold` label: merge only after the pre-deploy check below.).\n"
        + "Show every precondition its body names is true, then merge with GH_DREW_PRECONDITIONS_SHOWN=<evidence>.\n");
      assert.equal(r.merged, null);
      assert.deepEqual(logged(s), ["refused"]);
    } finally {
      rmSync(s.root, { recursive: true, force: true });
    }
  }
  const s = sandbox();
  try {
    const held = variant(s, (pr) => { pr.body = "x"; pr.labels = { nodes: [{ name: "hold" }] }; pr.reviewThreads.nodes = []; });
    const r = run(s, ["pr", "merge", "465", "-R", "drewstone/dotfiles", "--merge"], [held], { GH_DREW_PRECONDITIONS_SHOWN: "audit 39047733579: 0 unsettleable" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /merging a held PR \(hold label\); preconditions shown: audit 39047733579: 0 unsettleable/);
    assert.deepEqual(r.merged, ["pr", "merge", "465", "-R", "drewstone/dotfiles", "--merge"]);
    assert.deepEqual(logged(s), ["preconditions-shown: audit 39047733579: 0 unsettleable", "called"]);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});
