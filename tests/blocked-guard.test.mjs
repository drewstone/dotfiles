import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

// blocked_guard.py is a Stop hook. The two flagged messages are real final messages the owner
// corrected, with names replaced.

const HOOK = resolve("claude/hooks/blocked_guard.py");
const HOME = mkdtempSync(join(tmpdir(), "blocked-guard-home-"));
const LOG = join(HOME, ".claude/logs/blocked-guard.jsonl");

const KEY_HANDOFF = "Two things are watched: - **#1911 gate:** retries until about 21:55Z. When it returns a result, I merge #1911 if it passes; if it fails, I fix it forward. - **App secret:** checked every 2 minutes until about 00:25Z. When it changes, I run Release Live Evidence and publish 0.3.4. Three things are still blocked on you: 1. **App release:** update the `APP_LIVE_ENV_JSON` secret in the `release-live` environment with a working API key. 2. **Tournament judging and generation 0:** tell me where `SANDBOX_KEY_PLAYS` lives on host-a. Critics refuse the keeper's `API_KEY` by design. 3. **Critiques:** unlock host-a's keyring.";

const PASSWORD_HANDOFF = "Nothing else is waiting on you. The workflow is running all four repo tracks to merge and release. Browser critiques need one thing that only you can provide: your host-a login password. It unlocks host-a's login keyring, where Chrome keeps the key that decrypts the browser sign-ins. I don't have that password, and searching your vault for your OS login password isn't something I should do. **To unblock it**, run this once in your own terminal and type your host-a login …";

const CITED_ASK = "Billing is built and merged; live charges need one key nobody has stored. I checked the vault with `dotenvx get STRIPE_LIVE_KEY` on vault/.env.production (absent) and `gh secret list` on example/billing (test key only). Please add the Stripe live key to the vault as STRIPE_LIVE_KEY and I will finish the cutover.";

// A real final message from 2026-10-17: it asks the owner a question, but not for a credential.
const NON_CREDENTIAL_ASK = "The live account-move proof is still a precondition for deploying the acct fix. It needs either 2 or more enrolled native Codex seats on host-b, or your answer on whether I may run that one private proof on host-a.";

function stop(payload) {
  const r = spawnSync(HOOK, [], { input: JSON.stringify({ session_id: "s1", cwd: "/tmp", stop_hook_active: false, ...payload }), env: { ...process.env, HOME }, encoding: "utf8" });
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
