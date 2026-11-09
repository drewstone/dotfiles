"""Process-guard rule refused-call: a call the operator routes through an owning tool, refused when made directly.

guard-config.json's "process_guard" "refused_calls" lists {"rule", "match": [regex], "write": regex, "reason"}; absent: rule off.
A `write` or `reason` that names a key of "refused_call_texts" is that text, so rules share one write signal or owner text.
A command matches when every `match` pattern, and `write` (multiline) when set, finds its text, one line each: `cwd <dir>`,
`> <target>` per file it writes, its words with known variables expanded (each word's own whitespace turned to NUL, so a flag
inside a quoted string is not the command's flag), each such word again, its heredocs, and the ad-hoc script an interpreter runs
or that `< file` or `cat file |` feeds ssh or an interpreter's stdin (process_guard's script_text). Shell scripts are parsed into
their own commands. An inert command (cat, grep) only shows text: it is judged by its cwd and targets, and a script it writes is
judged when a command runs it.
"""
import json
import re
from urllib.parse import unquote

from process_guard_d1 import INTERPRETERS, script_of
from process_guard_github import expand
from secret_scan import guard_config

CONFIG = guard_config("process_guard", {})
TEXTS = CONFIG.get("refused_call_texts", {})
PAGES = [(r["rule"], [re.compile(p) for p in r["match"]], TEXTS.get(r["reason"], r["reason"])) for r in CONFIG.get("refused_pages", [])]
RULES = [(r["rule"], [re.compile(p) for p in r["match"]], r.get("write") and re.compile(TEXTS.get(r["write"], r["write"]), re.M),
          TEXTS.get(r["reason"], r["reason"])) for r in CONFIG.get("refused_calls", [])]
OVERRIDE = "CC_ALLOW_REFUSED_CALL"  # process_guard.SESSION_ONLY: an agent's command cannot set it
INERT = {"grep", "egrep", "fgrep", "rg", "ag", "git", "cat", "head", "tail", "less", "more", "wc", "ls", "bat", "diff", "jq",
         "sort", "uniq", "cut", "tr", "file", "stat", "nl", "column"}


def rule_refused_page(payload):
    """An mcp__ (browser or computer-use) tool whose input, percent-decoded, names a "refused_pages" page; a click names none."""
    text = unquote(json.dumps(payload.get("tool_input"), ensure_ascii=False)) if str(payload.get("tool_name")).startswith("mcp__") else ""
    hit = next((p for p in PAGES if all(m.search(text) for m in p[1])), None)
    return hit and (hit[0], f"{hit[0]} in a browser", f"{hit[2]} A browser order or create page is never the owning path.", None)


def rule_refused_call(cmd, script_text):
    inert, writes = cmd.prog in INERT, [w for w in cmd.writes if w != "/dev/null" and not w.isdigit()]  # `2>&1` writes no file
    if not RULES or not cmd.argv or (inert and not writes):
        return None
    texts = [f"cwd {cmd.cwd or ''}", *(f"> {target}" for target in writes)]
    if not inert:
        words = [expand(w, cmd.env) for w in cmd.argv]
        texts += [" ".join(re.sub(r"\s", "\0", w) for w in words), *(w for w in words if re.search(r"\s", w)), *cmd.heredocs]
    script = INTERPRETERS.match(cmd.prog) and script_of(cmd.argv[1:])
    fed = [*cmd.inputs, *(a for up in cmd.upstream[-1:] if up[:1] == ["cat"] for a in up[1:])]
    for path in [script] if script else fed if cmd.prog == "ssh" or INTERPRETERS.match(cmd.prog) else []:
        texts.append(script_text(path, cmd.cwd, cmd.env, cmd.ctx) or "")
    text = "\n".join(texts)
    for rule, patterns, write, reason in RULES:
        if all(p.search(text) for p in patterns) and (not write or write.search(text)):
            why = f"{reason} The owner can allow it for a session with {OVERRIDE}=1 (logged)."
            return rule, f"{rule} outside its owning tool", why, OVERRIDE
    return None
