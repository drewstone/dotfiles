import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

// gh-drew merges a discovery-lab or agent-runtime PR only on a passing beelink-gate receipt for its head.
// On 2026-10-18 discovery-lab#2009 merged through a lane script that recorded exit=0 for gate
// beelink2-b1b7743870eff2dc7da8260d77e65fcd, whose receipt says exit=1. These tests run the real gh-drew and
// the real beelink-gate it calls; GitHub is a fake gh and each beelink is a fake ssh that runs the remote side
// locally over one receipts file. Nothing here reaches GitHub or a beelink.
const ghDrew = resolve("claude/tools/gh-drew");
const HEAD = "1".repeat(40);
const OTHER = "2".repeat(40);
const RED_GATE = "beelink2-b1b7743870eff2dc7da8260d77e65fcd";

function sandbox({ repo = "tangle-network/discovery-lab", number = 2009 } = {}) {
  const root = mkdtempSync(join(tmpdir(), "gh-drew-receipt-"));
  const bin = join(root, "bin");
  const state = join(root, "state");
  const gateState = join(root, "gate-state");
  mkdirSync(bin, { recursive: true });
  mkdirSync(state, { recursive: true });
  mkdirSync(gateState, { recursive: true });
  const answer = { data: { repository: { pullRequest: {
    url: `https://github.com/${repo}/pull/${number}`, headRefOid: HEAD, createdAt: "2026-10-18T00:00:00Z", body: "", labels: { nodes: [] },
    timelineItems: { nodes: [] }, reviewThreads: { nodes: [] }, comments: { nodes: [] } } } } };
  writeFileSync(join(root, "pr.json"), JSON.stringify(answer));
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env bash
case "$*" in
  "api graphql -f query={viewer{login}} --jq .data.viewer.login") echo drewstone ;;
  "api rate_limit --jq .resources.core.remaining") echo 4000 ;;
  "api graphql "*reviewThreads*) cat "${join(root, "pr.json")}" ;;
  "api repos/"*"/pulls/"*" --jq .head.sha") echo "${HEAD}" ;;
  "pr view"*"--json title --jq .title") echo "fix(x): one change" ;;
  "pr view"*"--json body --jq .body") echo "Does a thing." ;;
  "pr merge"*|"api -X PUT"*) for a in "$@"; do printf '%s\\0' "$a"; done > "${state}/merge" ;;
  *) echo "unexpected: $*" >&2; exit 9 ;;
esac
`);
  chmodSync(join(bin, "gh"), 0o755);
  // ssh <opts> <ip> wsl.exe -- env ... bash -s -- --receipts 720, run here.
  writeFileSync(join(bin, "ssh"), `#!/usr/bin/env bash
args=("$@"); i=0
while [[ "\${args[$i]}" == -o ]]; do i=$((i + 2)); done
rest=("\${args[@]:$((i + 1))}")
[[ -z "\${FAKE_SSH_DOWN:-}" ]] || exit 255
exec "\${rest[@]:2}"
`);
  chmodSync(join(bin, "ssh"), 0o755);
  const env = { PATH: `${bin}:${process.env.PATH}`, HOME: join(root, "home"), DREW_GH_TOKEN: "ghp_FAKEtokenFAKEtokenFAKEtoken0001",
    GH_DREW_CACHE_DIR: join(root, "cache"), GH_DREW_LOG_DIR: join(root, "logs"), GH_DREW_SECRETS_FILE: join(root, "absent.env"),
    GH_DREW_REVIEW_OVERRIDE: "receipt test: the Codex check is not under test", GH_DREW_REVIEW_WAIT: "0",
    BEELINK_GATE_SELF: "none", BEELINK_GATE_STATE_DIR: gateState, BEELINK_GATE_PROBE_RETRY_SECONDS: "0", TZ: "Etc/UTC" };
  return { root, state, gateState, env, repo, number };
}

const receipt = (s, fields) => JSON.stringify({ at: "2026-10-18T01:38:59Z", host: "beelink2", repo: `github.com/${s.repo}`, sha: HEAD,
  mode: "install", class: "normal", command: "pnpm test", exit: 0, gate_id: "beelink2-" + "a".repeat(32), ...fields });

function run(s, args, receipts, extra = {}) {
  writeFileSync(join(s.gateState, "receipts.jsonl"), receipts.map((r) => receipt(s, r)).join("\n") + (receipts.length ? "\n" : ""));
  const result = spawnSync(ghDrew, args, { cwd: s.root, env: { ...s.env, ...extra }, encoding: "utf8", timeout: 60_000 });
  const merged = existsSync(join(s.state, "merge")) ? readFileSync(join(s.state, "merge"), "utf8").split("\0").slice(0, -1) : null;
  return { ...result, merged };
}

const merge = (s, head = HEAD) => ["pr", "merge", String(s.number), "-R", s.repo, "--squash", "--match-head-commit", head];

test("a release-path merge is refused unless a full-test receipt passed on its exact head", () => {
  const s = sandbox();
  try {
    const cases = [
      [[{ exit: 1, gate_id: RED_GATE, mode: "light", class: "light", command: "bash -lc python3 -c ..." }], /beelink2-b1b7743870eff2dc7da8260d77e65fcd .* exit=1 mode=light .*<- exit 1, mode light, class light, not the full test command/],
      [[{ mode: "light", class: "light" }], /<- mode light, class light$/m],
      [[{ command: "node --test runner/status.test.mjs" }], /<- not the full test command$/m],
      [[{ class: "dev" }], /<- class dev$/m],
      [[{ sha: OTHER }], /Receipts for this head: none/],
      [[], /Receipts for this head: none/],
    ];
    for (const [rows, why] of cases) {
      const r = run(s, merge(s), rows);
      assert.equal(r.status, 1, r.stderr);
      assert.match(r.stderr, /refusing to merge https:\/\/github\.com\/tangle-network\/discovery-lab\/pull\/2009: no beelink-gate receipt shows its full test command \(pnpm test or pnpm run test\) passed on head 1{40}/);
      assert.match(r.stderr, why);
      assert.equal(r.merged, null, "nothing merged");
    }
    // The review override reaches only the Codex check.
    assert.match(run(s, merge(s), [{ exit: 1 }]).stderr, /merging without the Codex review check.*\n.*refusing to merge/s);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test("a passing pnpm test receipt merges, pinned to the head, and under beelink-gate --merge it must be that gate's", () => {
  const s = sandbox();
  try {
    const unpinned = run(s, ["pr", "merge", "2009", "-R", s.repo, "--squash"], [{}]);
    assert.equal(unpinned.status, 1, unpinned.stderr);
    assert.match(unpinned.stderr, /pinned to the head its gate ran on;\nname it with --match-head-commit <head> \(head is 1{40}\)/);
    assert.equal(unpinned.merged, null);

    const other = run(s, merge(s), [{}], { BEELINK_GATE_ID: "beelink1-" + "b".repeat(32) });
    assert.equal(other.status, 1, other.stderr);
    assert.match(other.stderr, /<- not gate beelink1-b{32}/);

    const green = run(s, merge(s), [{ exit: 1, gate_id: RED_GATE }, { command: "pnpm run test" }], { BEELINK_GATE_ID: "beelink2-" + "a".repeat(32) });
    assert.equal(green.status, 0, green.stderr);
    assert.deepEqual(green.merged.slice(0, 3), ["pr", "merge", "2009"]);
    assert.ok(green.merged.includes("--match-head-commit") && green.merged.includes(HEAD), green.merged.join(" "));
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test("the REST merge is held to the same receipt, and an unreadable beelink refuses with 75", () => {
  const s = sandbox({ repo: "tangle-network/agent-runtime", number: 1818 });
  try {
    const put = ["api", "-X", "PUT", "repos/tangle-network/agent-runtime/pulls/1818/merge", "-f", "merge_method=squash", "-f", `sha=${HEAD}`];
    const subset = run(s, put, [{ command: "pnpm vitest run test/stream.test.ts" }]);
    assert.equal(subset.status, 1, subset.stderr);
    assert.match(subset.stderr, /refusing to merge https:\/\/github\.com\/tangle-network\/agent-runtime\/pull\/1818: no beelink-gate receipt/);
    assert.equal(subset.merged, null);

    const unpinned = run(s, put.slice(0, 6), [{}]);
    assert.match(unpinned.stderr, /name it with -f sha=<head>/);
    assert.equal(unpinned.merged, null);

    const down = run(s, put, [{}], { FAKE_SSH_DOWN: "1" });
    assert.equal(down.status, 75, down.stderr);
    assert.match(down.stderr, /cannot read the beelinks' gate receipts .*could not read beelink1's receipts/);
    assert.equal(down.merged, null);

    const green = run(s, put, [{}]);
    assert.equal(green.status, 0, green.stderr);
    assert.deepEqual(green.merged, put);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test("other repos merge as before, with no receipt and no pin", () => {
  const s = sandbox({ repo: "drewstone/dotfiles", number: 465 });
  try {
    const r = run(s, ["pr", "merge", "465", "-R", s.repo, "--squash"], [], { FAKE_SSH_DOWN: "1" });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.merged.includes("465"), r.merged.join(" "));
    const put = run(s, ["api", "-X", "PUT", "repos/drewstone/dotfiles/pulls/465/merge"], [], { FAKE_SSH_DOWN: "1" });
    assert.equal(put.status, 0, put.stderr);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});
