import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

// secret_scan.py reads a PostToolUse payload. A credential in the tool's output (or in a
// Bash command) produces decision "block" with rotation instructions and a ledger line.
// Neither may contain the value. Keys are generated per run so no key-shaped literal is
// committed.

const HOOK = resolve("claude/hooks/secret_scan.py");
const HOME = mkdtempSync(join(tmpdir(), "secret-scan-home-"));
const LEDGER = join(HOME, ".claude/logs/secret-exposures.jsonl");
const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// The scanner skips values containing placeholder words; a random draw that happens to
// contain one is drawn again so the test cannot flake.
const PLACEHOLDER = /example|fake|dummy|sample|placeholder|redact|fixture|test|your|secret|xxxx|0000|1234|abcd/i;

function random(n, alphabet = ALNUM) {
  for (;;) {
    const s = [...randomBytes(n)].map((b) => alphabet[b % alphabet.length]).join("");
    if (!PLACEHOLDER.test(s) && /[0-9]/.test(s) && /[A-Za-z]/.test(s)) return s;
  }
}

function scan(tool_response, { tool = "Bash", command = "cat keeper-sandbox.json" } = {}) {
  const payload = { tool_name: tool, tool_input: { command }, tool_response, session_id: "s1", tool_use_id: "toolu_1", cwd: "/tmp" };
  const r = spawnSync(HOOK, [], { input: JSON.stringify(payload), env: { ...process.env, HOME }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return { raw: r.stdout, out: r.stdout.trim() ? JSON.parse(r.stdout) : null };
}

const KEYS = {
  "Tangle Platform key": () => "sk-tan-" + random(43, ALNUM + "_-"),
  "GTM operator key": () => "gak_" + random(40),
  "Legal Agent operator key": () => "lak_" + random(40),
  "ph0ny key": () => "plabs_" + random(40),
  "webhook signing secret": () => "whsec_" + random(32),
  "Stripe live key": () => "rk_live_" + random(99),
  "GitHub token": () => "ghp_" + random(36),
  "GitHub fine-grained token": () => "github_pat_" + random(22) + "_" + random(59),
  "OpenAI key": () => "sk-proj-" + random(156, ALNUM + "_-"),
  "Anthropic key": () => "sk-ant-api03-" + random(95, ALNUM + "_-"),
};

for (const [kind, make] of Object.entries(KEYS)) {
  test(`warns on a printed ${kind} without repeating it`, () => {
    const key = make();
    const { raw, out } = scan({ stdout: `{ "ok": true, "key": "${key}", "expiresAt": null }\n`, stderr: "" });
    assert.ok(out, `no warning for ${kind}`);
    assert.equal(out.decision, "block");
    assert.match(out.reason, new RegExp(kind.replace(/[()]/g, "\\$&")));
    assert.match(out.reason, /Rotate:/);
    assert.match(out.systemMessage, /secret-scan/);
    assert.ok(!raw.includes(key), "the hook output repeats the key");
    const sha = createHash("sha256").update(key).digest("hex");
    assert.match(out.reason, new RegExp(`sha256:${sha}`));
    const ledger = readFileSync(LEDGER, "utf8");
    assert.ok(!ledger.includes(key), "the ledger holds the key");
    assert.match(ledger, new RegExp(sha));
  });
}

test("the real exposure shapes warn: account files, clone errors, env dumps, commands", () => {
  const tan = KEYS["Tangle Platform key"]();
  assert.ok(scan({ stdout: `== keeper-sandbox.json\n{ "ok": true, "key": "${tan}", "expiresAt": null, "runId": null }` }).out);
  const gh = KEYS["GitHub token"]();
  assert.ok(scan({ stderr: `fatal: Command failed: git clone --quiet https://drewstone:${gh}@github.com/tangle-network/x.git` }).out);
  const gak = KEYS["GTM operator key"]();
  assert.ok(scan({ stdout: `GTM_OPERATOR_API_KEY=${gak}\nOTHER=1` }).out);
  const fromCommand = scan({ stdout: "200" }, { command: `curl -H "Authorization: Bearer ${gak}" https://gtm.tangle.tools/api/operator/v1/me` }).out;
  assert.match(fromCommand.reason, /in the tool command/);
  const read = scan({ type: "text", file: { filePath: "/x/.env", content: `SANDBOX_API_KEY=${tan}\n` } }, { tool: "Read" }).out;
  assert.match(read.reason, /Tangle Platform key/);
  assert.match(read.reason, /tangle-admin key-lineage sha256:[0-9a-f]{64}/);
});

test("placeholders, fixtures, display prefixes and ordinary output pass", () => {
  for (const text of [
    "sk-tan-test",
    "export SANDBOX_API_KEY=sk-tan-test",
    "key_prefix: sk-tan-AbCd1234",
    "sk-tan-<REDACTED>",
    "const RAW = 'gak_fixture00000000000000000000000000'",
    "const TOKEN = 'ghp_fakeTokenForTests0123456789abcdefgh'",
    "whsec_placeholder_for_local_development",
    "signingSecret: 'whsec_automation_signing_secret_value'",
    "headers: { 'webhook-secret': 'whsec_lead_engine_signing_secret' }",
    "sk_live_" + "x".repeat(32),
    "c1c1055fc12165bd9fdf0eb0cc64e16f3dd2b7a2 fix: x",
    "/private/tmp/claude-501/-Users-drew-webb-gtm-agent/331066bf-9727-4d82-8f09-0de183a1b87b/scratchpad",
    "Tests  14 passed (14)",
  ]) {
    assert.equal(scan({ stdout: text }).out, null, `warned on: ${text}`);
  }
});

test("malformed input fails open", () => {
  const r = spawnSync(HOOK, [], { input: "not json", env: { ...process.env, HOME }, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});
