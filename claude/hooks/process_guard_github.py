"""Process-guard rule raw-gh: GitHub reached around the operator's gh wrapper (process_guard.py's docstring)."""
import os
import re

from secret_scan import guard_config

SHIM_VARS = guard_config("process_guard", {}).get("raw_gh")  # variables that make the gh shim pass through; absent: rule off
TOKENS = set(guard_config("process_guard", {}).get("github_tokens", []))  # vault names of the GitHub token
WRAPPER = guard_config("merge_check", {}).get("gh") or "gh"
INSTEAD = guard_config("process_guard", {}).get("raw_gh_instead") or [f"`{WRAPPER} api <path>` for REST and GraphQL calls."]
# The first gh on the hook's PATH is the operator's shim when it is a script, not a gh binary.
_SHIM = next((p for d in os.environ.get("PATH", "").split(":") if os.path.isfile(p := os.path.join(d or ".", "gh")) and os.access(p, os.X_OK)), None)
SHIMS = {_SHIM, os.path.realpath(_SHIM)} if _SHIM and open(_SHIM, "rb").read(2) == b"#!" else set()
GH_PATH = re.compile(r"(?<![\w.:/~$-])(?:~|\.{1,2})?(?:/+[\w.@+-]+)*/+gh(?![\w.-])")
WHICH_ALL = re.compile(r"\bwhich\s+(?:-\w+\s+)*-\w*a\w*\s[^)]*\bgh\b")
DODGE = re.compile(r"(?:^| )(?:command -p|env (?:\S+ )*(?:-i|--ignore-environment|-|-u PATH))(?= )")
RUNNERS = {"perl", "ruby", "python", "python3", "node", "bun", "deno", "php", "watch", "script", "find", "parallel", "flock", "unbuffer",
           "ionice", "chroot", "su", "runuser", "systemd-run", "tmux", "screen"}  # run a command named in their arguments
CLIENTS = {"curl", "wget", "http", "https", "xh", "python", "python3", "node", "bun", "deno"}
AUTH = re.compile(r"authorization|\w*(?:gh|github)_?\w*token\b|auth token|(?:^| )(?:-u|--user)(?: |=)", re.I)
WRITE = re.compile(r"(?:^|[\s'\"=:])(?:PUT|POST|PATCH|DELETE)\b|(?:^| )(?:-d|-F|-T|--data\S*|--json|--form|--post-\w+|--upload-file)\b"
                   r"|/merges?\b|git/refs|graphql")
GH = re.compile(r"gh(?:-[\w.-]+)?$")  # gh, or a gh-<name> wrapper
EXPAND = re.compile(r"\$\{(\w+)(?::?[-=]([^}]*))?\}|\$(\w+)")


def expand(text, env):
    """Variables replaced by their known values (`${V:-default}` by the default when V is unknown)."""
    return EXPAND.sub(lambda m: env.get(m.group(1) or m.group(3)) or (m.group(0) if m.group(2) is None else m.group(2)), text)


def normal(path, cwd):
    """An absolute path with ~, cwd, //, .. and /proc/self/root resolved; a remote relative path stays as written."""
    path = os.path.expanduser(os.path.join(cwd or "", os.path.expanduser(path)))
    return path if path[:1] != "/" else re.sub(r"^/proc/(?:self|\d+)/root(?=/)", "", os.path.normpath(re.sub(r"/+", "/", path)))


def rule_raw_gh(cmd):
    if SHIM_VARS is None:
        return None
    env, head = {"HOME": os.path.expanduser("~"), **cmd.env}, " ".join(cmd.prefix + cmd.argv[:1]) + " "
    words = [expand(w, env) for w in cmd.argv]
    what = next((f"{v}= set for this command" for v in SHIM_VARS if v in cmd.env), None)
    verb = [w for w in words[1:] if not w.startswith("-")][:2]
    if cmd.prog == "dotenvx" and verb[:1] == ["get"] and TOKENS & set(words) or verb == ["auth", "token"] and GH.match(cmd.prog):
        what = what or f"`{cmd.prog} {' '.join(verb)}`, which reads the GitHub token"
    path = cmd.env.get("PATH", os.defpath if DODGE.search(head) else None) if words[0] == "gh" else None
    if not what and path is not None:
        dirs = expand(path, {**env, "PATH": os.environ.get("PATH", "")}).split(":")
        found = next((p for p in (normal(os.path.join(d or ".", "gh"), cmd.cwd) for d in dirs) if os.path.isfile(p)), None)
        what = None if found in SHIMS else f"`{head.strip()}`, which runs {found or 'no shim'} instead of the shim"
    for k, word in enumerate([] if what else words if cmd.prog in RUNNERS else words[:1]):
        for m in GH_PATH.finditer(word):
            if normal(m.group(0), cmd.cwd) not in SHIMS and not (k == 0 and words[1:] in (["--version"], ["version"], ["help"])):
                what = what or f"the real gh at {m.group(0)}"
        what = what or ("`which -a gh`, which finds the real gh" if "$(" in word and WHICH_ALL.search(word) else None)
    text = " ".join(words[1:])
    if not what and cmd.prog in CLIENTS and re.search(r"api\.github\.com", text, re.I) and (AUTH.search(text) or WRITE.search(text)):
        what = f"{cmd.prog} to api.github.com with a token or a write"
    if not what:
        return None
    return ("raw-gh", what,
            f"This command reaches GitHub around {WRAPPER} ({what}), which pins the identity, applies the merge gate and logs the "
            "call. A merge it refuses stays refused: fix the red it names, or take it to the owner. There is no override. Instead:"
            + "".join(f"\n- {line}" for line in INSTEAD), None)
