#!/usr/bin/env python3
"""Stop hook: a final message that hands Drew a credential lookup goes back to the agent once.

Agents twice asked for a key or password they could find themselves.

The rule: a final message that asks Drew for a password, key, token, secret, login or unlock is
sent back once with an instruction to look first (the vault via dotenvx, ~/.config/disco/env,
the repo's secret stores, `have`, Drew's earlier messages) and either resolve it or cite where it
looked. It is a lead, not a wall: a message that cites a completed search passes, and a second
stop in the same chain (stop_hook_active) always passes, so a real ask still reaches Drew.

Hits are logged to ~/.claude/logs/blocked-guard.jsonl. Fail-open: an unreadable payload exits 0.
"""
import datetime
import json
import os
import re
import sys

LOG = os.path.join(os.path.expanduser("~"), ".claude", "logs", "blocked-guard.jsonl")

# Phrases that hand an action to Drew.
ASK = re.compile(
    r"blocked on you|only you can|from you\b|tell me where|your (?:one )?answer|to unblock"
    r"|\b(?:send|give|share|paste|provide) me\b|\bin your own terminal\b|\bunlock\b"
    r"|\b(?:please|can you|could you|you(?:'ll)? need to)\s+(?:add|update|set|provide|share|send|paste|rotate|enter|type|log ?in|sign ?in)\b",
    re.I,
)
# What is being asked for. The env-name branch is case-sensitive (FOO_KEY, not "monkey").
CREDENTIAL = re.compile(
    r"(?i:password|passphrase|credential|secret|api[ -]?key|\btoken\b|keyring|keychain|\blog ?in\b|sign[ -]?in)"
    r"|\b[A-Z][A-Z0-9_]*_(?:KEY|TOKEN|SECRET|PASSWORD)S?(?:_[A-Z0-9_]+)?\b"
)
# A completed search, in the past tense, of a place credentials live. "Searching your vault
# isn't something I should do" (the 2026-10-17 message) is not a search.
SEARCHED = re.compile(r"\b(?:checked|searched|looked (?:in|through|at)|grepped|queried|listed|ran)\b", re.I)
STORE = re.compile(
    r"vault|dotenvx|disco/env|\.env\b|secret stores?|secrets? (?:file|store)|keychain|1password"
    r"|gh secret list|`have\b|(?:earlier|prior|previous) messages|transcripts?",
    re.I,
)
WINDOW = 160


def credential_asks(text):
    """Each ask phrase with a credential term within WINDOW characters, as a short quote."""
    hits = []
    for m in ASK.finditer(text):
        lo, hi = max(0, m.start() - WINDOW), min(len(text), m.end() + WINDOW)
        if CREDENTIAL.search(text, lo, hi):
            hits.append(" ".join(text[max(0, m.start() - 40):m.end() + 80].split()))
    return hits


def cites_search(text):
    """True when one sentence names a completed search and the store it searched."""
    return any(SEARCHED.search(s) and STORE.search(s) for s in re.split(r"(?<=[.!?;])\s+|\n+", text))


def last_message(payload):
    text = payload.get("last_assistant_message")
    if isinstance(text, str):
        return text
    path = payload.get("transcript_path") or ""
    if not path or not os.path.isfile(path):
        return ""
    last = ""
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            if entry.get("type") != "assistant":
                continue
            content = (entry.get("message") or {}).get("content")
            parts = [c.get("text", "") for c in content or [] if isinstance(c, dict) and c.get("type") == "text"]
            if any(p.strip() for p in parts):
                last = "\n".join(parts)
    return last


def verdict(payload):
    if payload.get("stop_hook_active"):
        return None
    text = last_message(payload)
    hits = credential_asks(text)
    if not hits or cites_search(text):
        return None
    return hits


def log(payload, hits):
    try:
        os.makedirs(os.path.dirname(LOG), exist_ok=True)
        with open(LOG, "a") as fh:
            fh.write(json.dumps({
                "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
                "session_id": payload.get("session_id"), "cwd": payload.get("cwd"), "asks": hits[:3],
            }) + "\n")
    except OSError:
        pass


def main():
    try:
        payload = json.loads(sys.stdin.read())
        hits = verdict(payload)
    except Exception:
        return 0
    if not hits:
        return 0
    log(payload, hits)
    print(json.dumps({
        "decision": "block",
        "reason": (
            f"blocked-guard: your final message asks Drew for a credential or login (\"{hits[0]}\"). "
            "You have access to the secrets. Look before asking: the vault "
            "(`dotenvx get` on the repo's vault files), ~/.config/disco/env, the repo's secret stores and "
            "`gh secret list`, `have <name>`, and Drew's earlier messages in this session's transcript. "
            "Read a value only into the process that needs it; never type it into a command. If you find it, "
            "finish the work. If it is truly absent, end with one sentence naming each place you checked "
            "and what it returned, then the ask."
        ),
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
