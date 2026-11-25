#!/usr/bin/env python3
"""Stop hook: a final message that hands the owner a credential lookup, or holds work for the owner's
word, goes back to the agent once.

Credentials: a final message that asks the owner for a password, key, token, secret, login or unlock is
sent back with an instruction to look first (the vault via dotenvx, the repo's secret stores, the
owner's earlier messages, guard-config's "blocked_guard" `places`) and either resolve it or cite where it
looked.

The owner's word: a final message that waits for "go", an approval or a yes is sent back with the
instruction to decide, act and report, because an ask whose only useful answer is "go" is the agent's
own decision. An ask stands when it says, next to the ask, that the action cannot be undone or that a
rule reserves it for the owner; guard-config's "blocked_guard" `authority` names where those rules are.

It is a lead, not a wall: a message that cites a completed search or the reason the decision is the
owner's passes, and a second stop in the same chain (stop_hook_active) always passes, so a real ask
still reaches the owner.

Hits are logged to ~/.claude/logs/blocked-guard.jsonl. Fail-open: an unreadable payload exits 0.
"""
import datetime
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))
from secret_scan import guard_config  # noqa: E402

LOG = os.path.join(os.path.expanduser("~"), ".claude", "logs", "blocked-guard.jsonl")
CONFIG = guard_config("blocked_guard", {})
PLACES = CONFIG.get("places", {})  # {shown place: regex of a search citing it}
AUTHORITY = CONFIG.get("authority", {})  # {shown rule: regex of an ask citing it}

# Phrases that hand an action to the owner.
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
# isn't something I should do" is not a search.
SEARCHED = re.compile(r"\b(?:checked|searched|looked (?:in|through|at)|grepped|queried|listed|ran)\b", re.I)
STORE = re.compile("|".join([
    r"vault|dotenvx|\.env\b|secret stores?|secrets? (?:file|store)|keychain|1password"
    r"|gh secret list|(?:earlier|prior|previous) messages|transcripts?", *PLACES.values()]),
    re.I,
)
WINDOW = 160

# Phrases that hold an action until the owner says yes. Markdown and quote marks may wrap the word.
MARK = "[\"'`*“”]*"
HOLD = re.compile(
    r"\b(?:needs?|waits? (?:on|for)|waiting (?:on|for)|awaits?|awaiting|held for|holding for|pending|on|with|until)\s+your\s+" + MARK
    + r"(?:go(?:[- ]ahead)?|word|approval|ok(?:ay)?|sign[- ]?off|yes|confirmation|permission|say[- ]so)\b"
    r"|\bsay\s+" + MARK + r"(?:go|yes|the word)\b"
    r"|\b(?:reply|answer|respond)\s+(?:with\s+)?[\"'`*“]+(?:go|yes)\b"
    r"|\b(?:once|when|if|until) you (?:approve|confirm|agree|say (?:so|go|yes)|give (?:the|your) (?:word|go[- ]ahead|ok(?:ay)?))\b"
    r"|\b(?:may|shall|should) I (?!have\b)"
    r"|\b(?:want|like) me to\b"
    r"|\bif you(?:'d| would)? (?:like|want|prefer)\b"
    r"|\bready when you are\b",
    re.I,
)
# The reason an ask is the owner's: the action cannot be undone, or a rule reserves it.
RESERVED = re.compile("|".join([
    r"irreversibl|not reversible|(?:cannot|can't|can ?not) be (?:undone|reversed|taken back)|no back-?out"
    r"|reserve[sd]? (?:it |this |that |them )?(?:for|to) (?:you|the owner)|per[- ]action", *AUTHORITY.values()]),
    re.I,
)
REASON_WINDOW = 2 * WINDOW


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


def unexplained_holds(text):
    """Each phrase that holds work for the owner's word with no reason near it, as a short quote."""
    hits = []
    for m in HOLD.finditer(text):
        lo, hi = max(0, m.start() - REASON_WINDOW), min(len(text), m.end() + REASON_WINDOW)
        if not RESERVED.search(text, lo, hi):
            hits.append(" ".join(text[max(0, m.start() - 60):m.end() + 60].split()))
    return hits


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
    """(kind, quotes) for the first rule the final message breaks, or None when it passes."""
    if payload.get("stop_hook_active"):
        return None
    text = last_message(payload)
    hits = credential_asks(text)
    if hits and not cites_search(text):
        return "credential", hits
    hits = unexplained_holds(text)
    if hits:
        return "word", hits
    return None


def credential_reason(hit):
    return (
        f"blocked-guard: your final message asks the owner for a credential or login (\"{hit}\"). "
        "You have access to the secrets. Look before asking: the vault "
        "(`dotenvx get` on the repo's vault files), the repo's secret stores and `gh secret list`, "
        + "".join(f"{place}, " for place in PLACES) + "and the owner's earlier messages in this session's transcript. "
        "Read a value only into the process that needs it; never type it into a command. If you find it, "
        "finish the work. If it is truly absent, end with one sentence naming each place you checked "
        "and what it returned, then the ask."
    )


def word_reason(hit):
    rules = " and ".join(AUTHORITY)
    return (
        f"blocked-guard: your final message holds work for the owner's word (\"{hit}\"). "
        "If \"go\" is the only useful answer, the decision is yours: when the action is inside your task and can be "
        "undone, do it now, then report what you did and how to undo it. Work outside your task is a one-line "
        "recommendation, not a question. Ask only when the action cannot be undone or a rule reserves it for the owner"
        + (f" (read {rules} before deciding that one does)" if rules else "")
        + ". Then say which, next to the ask, with the exact call, its cost and your recommendation, and keep "
        "working on everything that does not depend on the answer."
    )


REASONS = {"credential": credential_reason, "word": word_reason}


def log(payload, kind, hits):
    try:
        os.makedirs(os.path.dirname(LOG), exist_ok=True)
        with open(LOG, "a") as fh:
            fh.write(json.dumps({
                "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
                "session_id": payload.get("session_id"), "cwd": payload.get("cwd"), "kind": kind, "asks": hits[:3],
            }) + "\n")
    except OSError:
        pass


def main():
    try:
        payload = json.loads(sys.stdin.read())
        found = verdict(payload)
    except Exception:
        return 0
    if not found:
        return 0
    kind, hits = found
    log(payload, kind, hits)
    print(json.dumps({"decision": "block", "reason": REASONS[kind](hits[0])}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
