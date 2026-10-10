#!/usr/bin/env python3
"""PostToolUse scanner: warn when a tool call put a live-looking credential into the transcript.

Between 2026-10-05 and 2026-10-09 agents printed newly minted or stored keys into tool
output at least three times (`sk-tan-` keys read back from account files on gtr, a GTM
operator key, a GitHub token inside a clone error). Each one then sat in the session
transcript, where every later prompt, summary and subagent brief could carry it on.

The output has already reached the model when this runs, so the hook cannot hide it.
process_guard.py refuses the commands most likely to print one before they run (xtrace while
loading a secret).
It tells the agent the value is exposed and how to rotate that kind of key, shows Drew
a one-line warning, and appends the event to ~/.claude/logs/secret-exposures.jsonl.
Neither the warning nor the ledger contains the value: only its kind, length and
SHA-256 (the Platform stores the same hash, so `tangle-admin key-lineage sha256:<hash>`
finds an `sk-tan-` key without anyone seeing it).

Placeholders and fixtures (`gak_fixture0000...`, `sk-tan-test`, values containing
"example", "fake", "redacted", long runs of one character) are skipped.

`process_guard.py` imports `redact()` from here so its log never stores a key either.
Fail-open: any parse error exits 0 with no output.
"""
import datetime
import hashlib
import json
import math
import os
import re
import sys
from collections import Counter

DEVOPS = "~/company/devops/secrets"
STORE = (f"Store the replacement straight into its vault slot so the value never reaches output: "
         f"dotenvx set <NAME> \"$(<command that prints the new key>)\" -f {DEVOPS}/<file>.env")

# kind, prefix, body pattern, rotation instruction
SHAPES = [
    ("Tangle Platform key (sk-tan-)", "sk-tan-", r"[A-Za-z0-9_-]{32,}",
     "Find it with `tangle-admin key-lineage sha256:{sha256}`, revoke it with `tangle-admin revoke-key <key_id> --yes`, "
     "and mint the replacement with `tangle-admin key-for <product>` (or `tangle-admin create-key`). " + STORE),
    ("GTM operator key (gak_)", "gak_", r"[A-Za-z0-9_-]{24,}",
     "Revoke it on https://gtm.tangle.tools/app/api-access (account menu, API access) and create a replacement with the same "
     f"scopes. The page shows the new key once: paste it into GTM_OPERATOR_API_KEY in {DEVOPS}/agent-state.env with dotenvx."),
    ("Legal Agent operator key (lak_)", "lak_", r"[A-Za-z0-9_-]{24,}",
     "Revoke it on Legal Agent's API access page (https://legal.tangle.tools, account menu, API access) and create a "
     f"replacement with the same scopes; store it in LEGAL_OPERATOR_API_KEY in {DEVOPS}/agent-state.env with dotenvx."),
    ("ph0ny key (plabs_)", "plabs_", r"[A-Za-z0-9_-]{24,}",
     "Revoke it in the ph0ny developer portal (API keys), mint a replacement, update PHONY_API_KEY in "
     f"{DEVOPS}/tangle-router.env with dotenvx, and redeploy the router through its deploy path."),
    ("webhook signing secret (whsec_)", "whsec_", r"[A-Za-z0-9+/=_-]{24,}",
     "Roll it on the issuing endpoint (Stripe Dashboard: Developers, Webhooks, the endpoint, Roll secret; Svix and Resend have "
     "the same control), then update the consuming Worker's secret through its deploy path. " + STORE),
    ("Stripe live key", "sk_live_|rk_live_", r"[A-Za-z0-9]{24,}",
     "Roll it in the Stripe Dashboard (Developers, API keys, live mode, Roll key), then update every vault slot that holds it "
     "and redeploy those consumers through their deploy paths. " + STORE),
    ("Stripe test key", "sk_test_|rk_test_", r"[A-Za-z0-9]{24,}",
     "Roll it in the Stripe Dashboard in test mode (Developers, API keys, Roll key) and update its vault slot. " + STORE),
    ("GitHub token", "ghp_|gho_|ghu_|ghs_|ghr_", r"[A-Za-z0-9]{36,}",
     "Revoke it at https://github.com/settings/tokens (an app's installation or OAuth token: revoke it in that app), create a "
     f"replacement with the same scopes, and store it in its vault slot (DREW_GH_TOKEN is in {DEVOPS}/agent-state.env). " + STORE),
    ("GitHub fine-grained token", "github_pat_", r"[A-Za-z0-9_]{60,}",
     "Revoke it at https://github.com/settings/personal-access-tokens, create a replacement with the same repository access, "
     f"and store it in its vault slot (DREW_GH_TOKEN is in {DEVOPS}/agent-state.env). " + STORE),
    ("OpenAI key", "sk-proj-|sk-svcacct-|sk-admin-", r"[A-Za-z0-9_-]{40,}",
     "Revoke it at https://platform.openai.com/api-keys (admin keys: https://platform.openai.com/settings/organization/admin-keys), "
     f"create a replacement, update its vault slot (the router's is OPENAI_API_KEY in {DEVOPS}/tangle-router.env), and redeploy "
     "consumers through their deploy paths. " + STORE),
    ("OpenAI key (legacy)", "sk-", r"[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}",
     "Revoke it at https://platform.openai.com/api-keys, create a replacement, and update its vault slot. " + STORE),
    ("Anthropic key", "sk-ant-", r"[a-z]+[0-9]*-[A-Za-z0-9_-]{40,}",
     "Revoke it at https://console.anthropic.com/settings/keys, create a replacement, and update its vault slot. " + STORE),
]

COMPILED = [
    (kind, re.compile(r"(?<![A-Za-z0-9_])(" + prefix + r")(" + body + r")(?![A-Za-z0-9_-])"), rotation)
    for kind, prefix, body, rotation in SHAPES
]

PLACEHOLDER = re.compile(r"example|fake|dummy|sample|placeholder|redact|fixture|test|your|secret|xxxx|0000|1234|abcd", re.I)

# For logs and ledgers: every scanner shape, plus any long mixed-case run with digits, the
# look of an unknown key. Paths and hex commit ids stay readable.
OPAQUE = re.compile(r"(?<![A-Za-z0-9_/.-])(?=[A-Za-z0-9+_-]*[a-z])(?=[A-Za-z0-9+_-]*[A-Z])(?=[A-Za-z0-9+_-]*[0-9])"
                    r"[A-Za-z0-9+_-]{32,}={0,2}(?![A-Za-z0-9+_/-])")


def entropy(s):
    counts, n = Counter(s), len(s)
    return -sum(c / n * math.log2(c / n) for c in counts.values())


def plausible(body):
    """A real key body is random: letters and digits, no placeholder words, many distinct characters.

    Fixtures such as `whsec_automation_signing_secret_value` are words; a random body of 24 or
    more characters lacks a digit about 1% of the time, an accepted miss.
    """
    if PLACEHOLDER.search(body) or not (re.search(r"[0-9]", body) and re.search(r"[A-Za-z]", body)):
        return False
    return len(set(body)) >= 10 and entropy(body) >= 3.0


def find_secrets(text):
    """Yield (kind, token, rotation) for each live-looking credential in text."""
    for kind, pattern, rotation in COMPILED:
        for m in pattern.finditer(text):
            if plausible(m.group(2)):
                yield kind, m.group(0), rotation


# Any run after a known prefix, even a fragment too short to be a whole key.
PREFIXES = re.compile(r"(?<![A-Za-z0-9_])(" + "|".join(prefix for _, prefix, _, _ in SHAPES) + r")[A-Za-z0-9+/=_-]{6,}")


def redact(text):
    text = PREFIXES.sub(lambda m: m.group(1) + "<REDACTED>", text)
    return OPAQUE.sub("<REDACTED>", text)


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings(item)


def ledger_path():
    return os.path.join(os.path.expanduser("~"), ".claude", "logs", "secret-exposures.jsonl")


def scan(payload):
    """Return one finding per distinct credential in the tool's input command and output."""
    tool = payload.get("tool_name") or ""
    sources = [("output", payload.get("tool_response"))]
    if tool == "Bash":
        sources.append(("command", (payload.get("tool_input") or {}).get("command")))
    found = {}
    for source, value in sources:
        for text in strings(value):
            for kind, token, rotation in find_secrets(text):
                digest = hashlib.sha256(token.encode()).hexdigest()
                found.setdefault(digest, {"kind": kind, "sha256": digest, "length": len(token),
                                          "source": source, "rotation": rotation.replace("{sha256}", digest)})
    return list(found.values())


def message(findings, tool):
    lines = [f"secret-scan: this {tool} call put {len(findings)} live-looking credential(s) into the session transcript. "
             "Treat each as exposed and rotate it now."]
    for f in findings:
        lines.append(f"- {f['kind']}, {f['length']} chars, sha256:{f['sha256']} (in the tool {f['source']}). Rotate: {f['rotation']}")
    lines.append("Do not repeat, quote or save the value anywhere: messages, files, commits, PR text, logs or prompts. "
                 "Tell Drew which key leaked (kind and sha256 prefix) and what you rotated. Next time pipe a minted or "
                 "stored key straight into its consumer, or print only its length or fingerprint. If this is a test "
                 "fixture or an already-revoked value, say so and continue. Logged to " + ledger_path() + ".")
    return "\n".join(lines)


def record(payload, findings):
    path = ledger_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    command = (payload.get("tool_input") or {}).get("command") or (payload.get("tool_input") or {}).get("file_path") or ""
    with open(path, "a") as fh:
        for f in findings:
            fh.write(json.dumps({
                "ts": now, "session_id": payload.get("session_id"), "tool": payload.get("tool_name"),
                "tool_use_id": payload.get("tool_use_id"), "cwd": payload.get("cwd"), "kind": f["kind"],
                "sha256": f["sha256"], "length": f["length"], "source": f["source"],
                "command": redact(str(command))[:300],
            }) + "\n")


def main():
    try:
        payload = json.loads(sys.stdin.read())
        findings = scan(payload)
    except Exception:
        return 0
    if not findings:
        return 0
    tool = payload.get("tool_name") or "tool"
    try:
        record(payload, findings)
    except OSError:
        pass
    kinds = ", ".join(f"{f['kind']} sha256:{f['sha256'][:12]}" for f in findings)
    print(json.dumps({
        "decision": "block",
        "reason": message(findings, tool),
        "systemMessage": f"secret-scan: {tool} output exposed {kinds}. The agent was told to rotate it; logged to {ledger_path()}.",
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
