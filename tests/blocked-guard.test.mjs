import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

// blocked_guard.py is a Stop hook. The two flagged messages are real final messages the owner
// corrected, with names replaced.

const HOOK = resolve("claude/hooks/blocked_guard.py");
const HOME = mkdtempSync(join(tmpdir(), "blocked-guard-home-"));
test.after(() => rmSync(HOME, { recursive: true, force: true }));
const LOG = join(HOME, ".claude/logs/blocked-guard.jsonl");

const KEY_HANDOFF = "Two things are watched: - **#1911 gate:** retries until about 21:55Z. When it returns a result, I merge #1911 if it passes; if it fails, I fix it forward. - **App secret:** checked every 2 minutes until about 00:25Z. When it changes, I run Release Live Evidence and publish 0.3.4. Three things are still blocked on you: 1. **App release:** update the `APP_LIVE_ENV_JSON` secret in the `release-live` environment with a working API key. 2. **Tournament judging and generation 0:** tell me where `SANDBOX_KEY_PLAYS` lives on host-a. Critics refuse the keeper's `API_KEY` by design. 3. **Critiques:** unlock host-a's keyring.";

const PASSWORD_HANDOFF = "Nothing else is waiting on you. The workflow is running all four repo tracks to merge and release. Browser critiques need one thing that only you can provide: your host-a login password. It unlocks host-a's login keyring, where Chrome keeps the key that decrypts the browser sign-ins. I don't have that password, and searching your vault for your OS login password isn't something I should do. **To unblock it**, run this once in your own terminal and type your host-a login …";

const CITED_ASK = "Billing is built and merged; live charges need one key nobody has stored. I checked the vault with `dotenvx get STRIPE_LIVE_KEY` on vault/.env.production (absent) and `gh secret list` on example/billing (test key only). Please add the Stripe live key to the vault as STRIPE_LIVE_KEY and I will finish the cutover.";

// A real final message from 2026-10-17: it asks the owner a question, but not for a credential.
const NON_CREDENTIAL_ASK = "The live account-move proof is still a precondition for deploying the acct fix. It needs either 2 or more enrolled native Codex seats on host-b, or your answer on whether I may run that one private proof on host-a.";

// Two real incident statuses from 2026-11-24, with names and the product's details replaced. A ready,
// reversible fix waited hours for the owner's word, and the owner said afterwards that an ask two
// letters can answer is the agent's own decision.
const GO_ASK = "**Incident status. The service has refused new requests for 75 minutes. The fix is known and needs your go, because it is a hand change on one production host.**\n\n**The ask: on host-a only, may I**\n1. move the one half-written record to a holding directory, so it can be put back, and then\n2. restart that host's worker?\n\n**What it costs**\n- Nothing of a customer's.\n- Time: minutes.";

const STILL_WAITING = "**Incident status. Unchanged: the service has refused new requests for 107 minutes and the fix waits on your \"go\".**\n\n- Host-a is still not ready for the same reason. The other six hosts are healthy.\n\nNext incident status in 15 minutes.";

// Asks that are the owner's, and say why next to the ask.
const RESERVED_ASK = "The benchmark's real-model run is model spend, which the spending rule reserves for the owner per action: `keys create bench-models --budget-usd 40`, about $36 for 50 paired runs. I recommend yes; it needs your word. The three free runs do not depend on it and are in their gate now.";

const IRREVERSIBLE_ASK = "Removing the old volume cannot be undone, so it waits for your word: `volume rm ws-old` frees 40 GB. I recommend it, because the copy matched every checksum. The migration continues without it.";

const CITED_RULE_ASK = "Widening the smoke key to three paid models is on the authority list, so it needs your approval: one row in the key policy, about 2 cents a deploy. I recommend yes. Deploys keep passing on the free model meanwhile.";

function stop(payload, home = HOME) {
  const r = spawnSync(HOOK, [], { input: JSON.stringify({ session_id: "s1", cwd: "/tmp", stop_hook_active: false, ...payload }), env: { ...process.env, HOME: home }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

for (const [name, text, quote] of [
  ["the 2026-10-16 key hand-off", KEY_HANDOFF, /blocked on you|tell me where|unlock/],
  ["the 2026-10-17 password hand-off", PASSWORD_HANDOFF, /only you can/],
]) {
  test(`sends back ${name}`, () => {
    const out = stop({ last_assistant_message: text });
    assert.equal(out?.decision, "block");
    assert.match(out.reason, quote);
    assert.match(out.reason, /dotenvx get/);
  });
}

test("passes an ask that cites where it looked", () => {
  assert.equal(stop({ last_assistant_message: CITED_ASK }), null);
});

test("passes a question to the owner that is not about a credential", () => {
  assert.equal(stop({ last_assistant_message: NON_CREDENTIAL_ASK }), null);
});

test("passes the second stop, so a real ask still reaches the owner", () => {
  assert.equal(stop({ last_assistant_message: PASSWORD_HANDOFF, stop_hook_active: true }), null);
  assert.equal(stop({ last_assistant_message: GO_ASK, stop_hook_active: true }), null);
});

for (const [name, text, quote] of [
  ["the 2026-11-24 ask for the owner's go on a reversible fix", GO_ASK, /needs your go/],
  ["the status that still waits on the owner's \"go\"", STILL_WAITING, /waits on your "go"/],
]) {
  test(`sends back ${name}`, () => {
    const out = stop({ last_assistant_message: text, session_id: "s-word" });
    assert.equal(out?.decision, "block");
    assert.match(out.reason, quote);
    assert.match(out.reason, /only useful answer, the decision is yours/);
    assert.doesNotMatch(out.reason, /dotenvx get/);
    const rows = readFileSync(LOG, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.ok(rows.some((r) => r.session_id === "s-word" && r.kind === "word"));
  });
}

test("passes an ask that says a rule reserves the action for the owner", () => {
  assert.equal(stop({ last_assistant_message: RESERVED_ASK }), null);
});

test("passes an ask that says the action cannot be undone", () => {
  assert.equal(stop({ last_assistant_message: IRREVERSIBLE_ASK }), null);
});

test("names the operator's authority rules, and passes an ask that cites one", (t) => {
  const home = mkdtempSync(join(tmpdir(), "blocked-guard-authority-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(join(home, ".claude/guard-config.json"), JSON.stringify({
    blocked_guard: { authority: { "the authority list in docs/authority.md": "authority (?:list|table)" } },
  }));
  assert.equal(stop({ last_assistant_message: CITED_RULE_ASK })?.decision, "block");
  assert.equal(stop({ last_assistant_message: CITED_RULE_ASK }, home), null);
  assert.match(stop({ last_assistant_message: GO_ASK }, home).reason, /read the authority list in docs\/authority\.md before deciding/);
});

test("reads the final message from the transcript and logs the hit", () => {
  const transcript = join(HOME, "session.jsonl");
  const entry = (type, content) => JSON.stringify({ type, message: { role: type, content } });
  writeFileSync(transcript, [
    entry("user", "finish the critiques"),
    entry("assistant", [{ type: "text", text: "Checking the keyring." }, { type: "tool_use", id: "t1", name: "Bash", input: {} }]),
    entry("user", [{ type: "tool_result", tool_use_id: "t1", content: "Locked" }]),
    entry("assistant", [{ type: "text", text: PASSWORD_HANDOFF }]),
  ].join("\n") + "\n");
  assert.equal(stop({ transcript_path: transcript, session_id: "s-transcript" })?.decision, "block");
  const rows = readFileSync(LOG, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(rows.some((r) => r.session_id === "s-transcript" && r.asks.length > 0));
});
