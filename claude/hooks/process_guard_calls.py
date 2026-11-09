"""Process-guard rules refused-call (a call the operator routes through an owning tool, made directly) and override-grant.

"process_guard" "refused_calls" in guard-config.json lists {"rule", "match": [regex], "write": regex, "reason"}; a `write` or `reason`
naming a "refused_call_texts" key is that text. A command matches when every `match`, and `write` (multiline) when set, finds its
text, one line each: `cwd <dir>`, `> <target>` per file it writes, its words with known variables expanded (a word's own whitespace
as NUL, so a flag inside a quoted string is not the command's flag), each such word again, its heredocs, the ad-hoc script it runs
or `< file` / `cat file |` feeds it (script_text), and `| <stage>` per stage piped into a shell or interpreter reading its program
from stdin; 'a'+'b' reads 'ab'. Text is not a call: an inert command (cat, grep) counts only its cwd and targets, a message command
(gh pr comment, "message_commands") not its prose. No agent's command lifts a refusal: the owner runs the call in their own terminal.
override-grant: a CC_ALLOW_* set for an agent or session launcher ("agent_launchers"), a session flag set by any command, or a
CC_ALLOW_* assigned in a command's code or bare words or written to settings*.json, a shell profile or an env file (Write, Edit too).
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
INERT = {"grep", "egrep", "fgrep", "rg", "ag", "git", "cat", "head", "tail", "less", "more", "wc", "ls", "bat", "diff", "jq",
         "sort", "uniq", "cut", "tr", "file", "stat", "nl", "column", "tee"}
MESSAGE = re.compile("|".join([r"(?:\S*/)?gh(?:-[\w.-]+)? (?:pr|issue|release) (?:comment|create|edit|review|close|merge)\b",
                               *CONFIG.get("message_commands", [])]))
SESSION_ONLY = {"CC_ALLOW_BROADCAST_KILL", "CC_ALLOW_D1_SCAN", "CC_ALLOW_ENV_DUMP", "CC_ALLOW_REFUSED_CALL"}  # the owner's alone
LAUNCHERS = {"claude", "codex", "opencode", "tmux", "screen", "systemd-run", *CONFIG.get("agent_launchers", [])}
GRANT = re.compile(r"(?<![$\w{])CC_ALLOW_\w+(?:['\"]\]?)?\s*[:=](?!=)|\b(?:set-?env(?:ironment)?|setdefault|putenv)\b.*\bCC_ALLOW_")
TARGET = re.compile(r"(?:^|/)(?:settings[\w.-]*\.json|\.\w*(?:rc|env|profile))\b")
GRANT_WHY = ("A CC_ALLOW_* in a process's environment lifts that rule for every command of the agents and shells it starts, so it "
             "is never handed to a child, a settings file or a profile. Put a per-command flag on the one command it is for "
             "(`CC_ALLOW_FORCE_PUSH=1 git push ...`); session flags are the owner's, set before the session starts.")


def rule_refused_page(payload):
    """An mcp__ (browser or computer-use) tool whose input, percent-decoded, names a "refused_pages" page; a click names none."""
    text = unquote(json.dumps(payload.get("tool_input"), ensure_ascii=False)) if str(payload.get("tool_name")).startswith("mcp__") else ""
    hit = next((p for p in PAGES if all(m.search(text) for m in p[1])), None)
    return hit and (hit[0], f"{hit[0]} in a browser", f"{hit[2]} A browser order or create page is never the owning path.", None)


def rule_refused_call(cmd, script_text):
    inert, writes = cmd.prog in INERT, [w for w in cmd.writes if w != "/dev/null" and not w.isdigit()]  # `2>&1` writes no file
    if not RULES or not cmd.argv or (inert and not writes):
        return None
    texts, words = [f"cwd {cmd.cwd or ''}", *(f"> {target}" for target in writes)], [expand(w, cmd.env) for w in cmd.argv]
    prose = MESSAGE.match(" ".join(words))  # a message's quoted words and heredocs describe calls; they make none
    if not inert:
        words = [w for w in words if not (prose and re.search(r"\s", w))]
        texts += [" ".join(re.sub(r"\s", "\0", w) for w in words), *(w for w in words if re.search(r"\s", w)), *([] if prose else cmd.heredocs)]
    script = INTERPRETERS.match(cmd.prog) and script_of(cmd.argv[1:])
    piped = cmd.prog == "ssh" or (re.fullmatch(r"(?:ba|z|da|k)?sh", cmd.prog) or INTERPRETERS.match(cmd.prog)) and not script and not any(
        re.fullmatch(r"-\w*[ce]\w*|-[mp]|--eval|--print", a) for a in cmd.argv[1:])  # its program comes from stdin
    fed = [*cmd.inputs, *(a for up in cmd.upstream[-1:] if up[:1] == ["cat"] for a in up[1:])]
    for path in [script] if script else fed if piped else []:
        texts.append(script_text(path, cmd.cwd, cmd.env, cmd.ctx) or "")
    texts += [f"| {' '.join(up)}" for up in cmd.upstream] + [w for up in cmd.upstream for w in up if re.search(r"\s", w)] if piped else []
    text = re.sub(r"(['\"])\s*\+\s*\1", "", "\n".join(texts))
    for rule, patterns, write, reason in RULES:
        if all(p.search(text) for p in patterns) and (not write or write.search(text)):
            return rule, f"{rule} outside its owning tool", f"{reason} Only the owner runs it, in their own terminal.", None
    return None


def rule_override_grant(cmd):
    names, text = {n for n in cmd.env if n.startswith("CC_ALLOW_")}, " ".join(cmd.argv + cmd.heredocs)
    code = " ".join(w for w in cmd.argv[1:] + cmd.heredocs if INTERPRETERS.match(cmd.prog) or not re.search(r"\s", w))
    files = cmd.writes + (cmd.argv[1:] if cmd.prog not in INERT else [])
    if names & SESSION_ONLY or names and cmd.prog in LAUNCHERS or cmd.prog not in INERT and GRANT.search(code) or (
            "CC_ALLOW_" in text and any(TARGET.search(f) for f in files)):
        return "override-grant", "a CC_ALLOW_* handed to a child", GRANT_WHY, None
    return None


def rule_grant_file(payload):
    edit = payload.get("tool_input") or {}
    if TARGET.search(edit.get("file_path") or "") and "CC_ALLOW_" in json.dumps([edit.get("content"), edit.get("new_string"), edit.get("edits")]):
        return "override-grant", f"a CC_ALLOW_* written into {edit['file_path']}", GRANT_WHY, None
    return None
