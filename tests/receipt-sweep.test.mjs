import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const sweep = resolve("claude/tools/receipt-sweep");

// Fake gh-drew serves GraphQL PR reads from <stub>/pr-<N> (one TSV line per read, the last repeats)
// and develop history from <stub>/history. Fake beelink-gate plays <stub>/gate-<N> (one "rc|text" per
// run, the last repeats) and logs its argv and FLEET_LANE. Fake sleep logs its argument.
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "receipt-sweep-"));
  const bin = join(root, "bin");
  const stub = join(root, "stub");
  const state = join(root, "state");
  mkdirSync(bin); mkdirSync(stub);
  const exe = (name, body) => { writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`); chmodSync(join(bin, name), 0o755); };
  exe("gh-drew", `
[ "$1" = api ] && [ "$2" = graphql ] || { echo "unexpected gh-drew $*" >&2; exit 9; }
q=""; n=""
while [ $# -gt 0 ]; do case "$1" in -f) case "$2" in query=*) q="\${2#query=}" ;; esac; shift 2 ;; -F) n="\${2#n=}"; shift 2 ;; *) shift ;; esac; done
if [[ "$q" == *history* ]]; then cat "${stub}/history" 2>/dev/null; exit 0; fi
c="${stub}/count-$n"; k=$(( $(cat "$c" 2>/dev/null || echo 0) + 1 )); echo $k > "$c"
f="${stub}/pr-$n"; [ -f "$f" ] || exit 1
total=$(wc -l < "$f"); [ "$k" -gt "$total" ] && k=$total
sed -n "\${k}p" "$f"`);
  exe("beelink-gate", `
n="\${@: -1}"
printf '%s lane=%s\\n' "$*" "$FLEET_LANE" >> "${stub}/gate.log"
c="${stub}/gcount-$n"; k=$(( $(cat "$c" 2>/dev/null || echo 0) + 1 )); echo $k > "$c"
f="${stub}/gate-$n"; total=$(wc -l < "$f"); [ "$k" -gt "$total" ] && k=$total
line=$(sed -n "\${k}p" "$f"); rc=\${line%%|*}; text=\${line#*|}
printf '%b\\n' "$text"; exit "$rc"`);
  exe("sleep", `echo "$1" >> "${stub}/sleep.log"`);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, RECEIPT_SWEEP_SLEEP: join(bin, "sleep"), RECEIPT_SWEEP_MERGE_POLL: "30", TZ: "Etc/UTC" };
  delete env.FLEET_LANE;
  const pr = (n, ...lines) => writeFileSync(join(stub, `pr-${n}`), lines.join("\n") + "\n");
  const gate = (n, ...lines) => writeFileSync(join(stub, `gate-${n}`), lines.join("\n") + "\n");
  const open = (head, branch = "feat/x") => `drewstone\tfalse\tOPEN\t${branch}\t${head}\t`;
  const merged = (head, merge = "m".repeat(40)) => `drewstone\tfalse\tMERGED\tfeat/x\t${head}\t${merge}`;
  const run = (args) => spawnSync("bash", [sweep, "--state-dir", state, ...args], { encoding: "utf8", env });
  const read = (name) => (existsSync(join(stub, name)) ? readFileSync(join(stub, name), "utf8") : "");
  const result = (n) => readFileSync(join(state, `${n}.result`), "utf8");
  return { root, bin, stub, state, env, pr, gate, open, merged, run, read, result };
}

const A = "a".repeat(40);
const B = "b".repeat(40);

test("green gate merges: one result line, stdout equals file, gate called with the contract", () => {
  const f = fixture();
  f.pr(5, f.open(A), f.open(A), f.merged(A));
  f.gate(5, "0|revision-receipt: merged #5");
  const r = f.run(["5"]);
  assert.equal(r.status, 0, r.stderr);
  const line = f.result(5);
  assert.equal(line.trim().split("\n").length, 1);
  assert.equal(r.stdout, line);
  assert.match(line, /^\d{4}-\d\d-\d\dT[\d:]+Z pr=5 head=a{40} attempts=1 exit=0 state=MERGED merge=m{40} receipt=revision-receipt: merged #5\n$/);
  assert.match(f.read("gate.log"), /^--branch feat\/x auto git@github\.com:tangle-network\/agent-container\.git a{40} -- node scripts\/ci\/revision-receipt\.mjs merge 5 lane=op-company:receipt-sweep$/m);
});

test("exit 75 sleeps until next_allowed plus 20s, clamped, then retries", () => {
  const f = fixture();
  const soon = new Date(Date.now() + 100_000).toISOString().replace(/\.\d+Z/, "Z");
  f.pr(6, f.open(A), f.open(A), f.open(A), f.merged(A));
  f.gate(6, `75|beelink-gate: TEMPFAIL next_allowed=${soon} load`, "0|revision-receipt: merged");
  const r = f.run(["6"]);
  assert.equal(r.status, 0, r.stderr);
  const waited = Number(f.read("sleep.log").split("\n")[0]);
  assert.ok(waited >= 100 && waited <= 125, `waited ${waited}`);
  assert.match(f.result(6), /attempts=2 exit=0 state=MERGED/);
});

test("exit 75 with a past or missing next_allowed waits the 30 s floor", () => {
  const f = fixture();
  f.pr(7, f.open(A), f.open(A), f.open(A), f.merged(A));
  f.gate(7, "75|beelink-gate: TEMPFAIL next_allowed=2020-01-01T00:00:00Z old", "0|ok");
  assert.equal(f.run(["7"]).status, 0);
  assert.equal(f.read("sleep.log").split("\n")[0], "30");
});

test("deadline stops the retries when the next window is past it", () => {
  const f = fixture();
  const later = new Date(Date.now() + 3 * 3600_000).toISOString().replace(/\.\d+Z/, "Z");
  f.pr(8, f.open(A));
  f.gate(8, `75|beelink-gate: TEMPFAIL next_allowed=${later} update window`);
  const r = f.run(["--deadline", "10m", "8"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(f.result(8), /attempts=1 exit=75 state=OPEN .*receipt=beelink-gate: TEMPFAIL next_allowed=/);
  assert.equal(f.read("sleep.log"), "");
});

test("repeated 75 inside the deadline has no attempt cap", () => {
  const f = fixture();
  const soon = new Date(Date.now() + 1000).toISOString().replace(/\.\d+Z/, "Z");
  f.gate(9, ...Array(12).fill(`75|beelink-gate: TEMPFAIL next_allowed=${soon} busy`), "0|ok");
  f.pr(9, ...Array(14).fill(f.open(A)), f.merged(A));
  const r = f.run(["9"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(f.result(9), /attempts=13 exit=0/);
});

test("receipt step failure after a passing signoff reruns once, not twice", () => {
  const f = fixture();
  const msg = "1|revision-receipt: receipt step failed after the full signoff passed";
  f.pr(10, f.open(A));
  f.gate(10, msg, msg, "0|never");
  const r = f.run(["10"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(f.result(10), /attempts=2 exit=1 .*receipt=revision-receipt: receipt step failed/);
});

test("a red exit is recorded and the sweep moves on to the next PR", () => {
  const f = fixture();
  f.pr(11, f.open(A));
  f.gate(11, "1|signoff: 3 tests failed\\nrevision-receipt: refusing, signoff red");
  f.pr(12, f.open(B), f.open(B), f.merged(B));
  f.gate(12, "0|revision-receipt: merged");
  const r = f.run(["11", "12"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(f.result(11), /attempts=1 exit=1 state=OPEN .*receipt=revision-receipt: refusing, signoff red/);
  assert.match(f.result(12), /exit=0 state=MERGED/);
  assert.equal(r.stdout.trim().split("\n").length, 2);
  assert.equal(f.read("gate.log").trim().split("\n").length, 2);
});

test("draft, closed and foreign-author PRs are skipped with a reason and never gated", () => {
  const f = fixture();
  f.pr(13, `drewstone\ttrue\tOPEN\tfeat/x\t${A}\t`);
  f.pr(14, `drewstone\tfalse\tCLOSED\tfeat/x\t${A}\t`);
  f.pr(15, `someone\tfalse\tOPEN\tfeat/x\t${A}\t`);
  const r = f.run(["13", "14", "15"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(f.result(13), /attempts=0 .*receipt=skip: author=drewstone state=OPEN draft=true/);
  assert.match(f.result(14), /receipt=skip: .*state=CLOSED/);
  assert.match(f.result(15), /receipt=skip: author=someone/);
  assert.equal(f.read("gate.log"), "");
});

test("the head is re-read before every attempt", () => {
  const f = fixture();
  const soon = new Date(Date.now() + 1000).toISOString().replace(/\.\d+Z/, "Z");
  f.pr(16, f.open(A), f.open(A), f.open(B), f.merged(B));
  f.gate(16, `75|beelink-gate: TEMPFAIL next_allowed=${soon} busy`, "0|ok");
  const r = f.run(["16"]);
  assert.equal(r.status, 0, r.stderr);
  const calls = f.read("gate.log").trim().split("\n");
  assert.match(calls[0], new RegExp(`${A} --`));
  assert.match(calls[1], new RegExp(`${B} --`));
  assert.match(f.result(16), new RegExp(`head=${B} attempts=2`));
});

test("a merge visible on develop before GitHub marks it merged is polled for", () => {
  const f = fixture();
  const m = "c".repeat(40);
  f.pr(17, f.open(A), f.open(A), `drewstone\tfalse\tOPEN\tfeat/x\t${A}\t${m}`, f.merged(A, m));
  f.gate(17, "0|ok");
  writeFileSync(join(f.stub, "history"), `${m} Merge feat (#17)\n`);
  const r = f.run(["17"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(f.result(17), new RegExp(`exit=0 state=MERGED merge=${m}`));
  assert.match(f.read("sleep.log"), /^15$/m);
});

// The headlines develop actually carried on 2026-10-14: revision-receipt merges, GitHub
// merges and the checked version PR. GitHub's merge oid is unknown until it marks the PR.
for (const headline of [
  "chore: merge locally signed PR #19",
  "Merge pull request #19 from tangle-network/feat/x",
  "chore: merge checked version PR 19",
]) {
  test(`a merge headline "${headline}" counts as on develop`, () => {
    const f = fixture();
    f.pr(19, f.open(A), f.open(A), `drewstone\tfalse\tOPEN\tfeat/x\t${A}\t`, f.merged(A, "d".repeat(40)));
    f.gate(19, "0|ok");
    writeFileSync(join(f.stub, "history"), `${"e".repeat(40)} ${headline}\n`);
    const r = f.run(["19"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(f.result(19), /exit=0 state=MERGED/);
  });
}

test("a longer PR number in a headline does not count as this PR's merge", () => {
  const f = fixture();
  f.pr(19, f.open(A), f.open(A), `drewstone\tfalse\tOPEN\tfeat/x\t${A}\t`);
  f.gate(19, "0|ok");
  writeFileSync(join(f.stub, "history"), `${"e".repeat(40)} chore: merge locally signed PR #190\n`);
  f.run(["19"]);
  assert.match(f.result(19), /exit=0 state=OPEN/);
  assert.doesNotMatch(f.read("sleep.log"), /^15$/m);
});

test("results append across runs, one line per run per PR", () => {
  const f = fixture();
  f.pr(18, f.open(A));
  f.gate(18, "1|revision-receipt: red");
  f.run(["18"]); f.run(["18"]);
  assert.equal(f.result(18).trim().split("\n").length, 2);
});

test("bad usage is refused before any call", () => {
  const f = fixture();
  assert.equal(f.run([]).status, 2);
  assert.equal(f.run(["abc"]).status, 2);
  assert.equal(f.run(["--deadline", "soon", "1"]).status, 2);
});

test("--detach starts a login-shell child, writes pidfile and log, reports paths", () => {
  const f = fixture();
  f.pr(19, f.open(A), f.open(A), f.merged(A));
  f.gate(19, "0|revision-receipt: merged");
  const env = { ...f.env, RECEIPT_SWEEP_DETACH_WAIT: "2", RECEIPT_SWEEP_SLEEP: "sleep" };
  const r = spawnSync("bash", [sweep, "--detach", "--state-dir", f.state, "19"], { encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /log: .*run-.*\.log/);
  assert.match(r.stdout, new RegExp(`result: ${f.state}/19\\.result`));
  for (let i = 0; i < 50 && !existsSync(join(f.state, "19.result")); i++) spawnSync("sleep", ["0.2"]);
  assert.match(f.result(19), /pr=19 .*exit=0 state=MERGED/);
});
