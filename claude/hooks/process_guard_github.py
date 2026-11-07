"""Process-guard rule raw-gh: GitHub reached around the operator's gh wrapper (process_guard.py's docstring)."""
import os
import re

from secret_scan import guard_config

SHIM_VARS = guard_config("process_guard", {}).get("raw_gh")  # variables that make the gh shim pass through; absent: rule off
WRAPPER = guard_config("merge_check", {}).get("gh") or "gh"
REAL_GH = re.compile(r"^(?:/usr(?:/local)?|/opt/homebrew|/home/linuxbrew/\.linuxbrew|/snap)?/bin/gh$|/Cellar/gh/[^/]+/bin/gh$")
CLIENTS = {"curl", "wget", "http", "https", "xh", "python", "python3", "node", "bun", "deno"}
AUTH = re.compile(r"authorization|\w*(?:gh|github)_?\w*token\b|auth token|(?:^| )(?:-u|--user)(?: |=)", re.I)
WRITE = re.compile(r"(?:^|[\s'\"=:])(?:PUT|POST|PATCH|DELETE)\b|(?:^| )(?:-d|-F|-T|--data\S*|--json|--form|--post-\w+|--upload-file)\b"
                   r"|/merges?\b|git/refs|graphql")
VAR = re.compile(r"\$\{?([A-Za-z_]\w*)\}?")


def rule_raw_gh(cmd):
    if SHIM_VARS is None:
        return None
    path = VAR.sub(lambda m: cmd.env.get(m.group(1), m.group(0)), cmd.argv[0])
    prefix = " ".join(cmd.prefix)
    what = next((f"{v}= set for this command" for v in SHIM_VARS if v in cmd.env), None)
    if not what and os.path.basename(path) == "gh":
        dodged = re.search(r"(?:^| )(?:command|env (?:\S+ )*(?:-i|--ignore-environment|-|-u PATH))(?= )", prefix + " ") or \
            not re.search(r"\$\{?PATH\b", cmd.env.get("PATH", "$PATH"))
        what = f"the real gh at {path}" if REAL_GH.search(path) else (f"`{prefix} gh`, which skips the shim" if dodged else None)
    text = " ".join(cmd.argv[1:])
    if not what and cmd.prog in CLIENTS and "api.github.com" in text and (AUTH.search(text) or WRITE.search(text)):
        what = f"{cmd.prog} to api.github.com with a token or a write"
    if not what:
        return None
    return ("raw-gh", what,
            f"This command reaches GitHub around {WRAPPER} ({what}). {WRAPPER} is the one path to GitHub: it pins the identity, "
            "applies the merge gate and logs the call, and a real gh binary run by path, a shim bypass variable or a token sent "
            f"straight to api.github.com skips all of it. Run `{WRAPPER} <args>` instead, reads included. When {WRAPPER} refuses "
            "a merge, that refusal stands: fix the red it names, or take it to the owner. There is no override.", None)
