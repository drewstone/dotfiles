"""Process-guard rule for secret files: each file under a guard-config `process_guard.secret_dirs` directory (a path
under home) holds one raw value and no NAME=, so `cut -d= -f1`, which keeps the text before `=`, prints the secret.
`secret_dir_public` is a regex of the file names there that hold no secret.

A read is refused only when its bytes reach the transcript: every stage they flow through is a filter that keeps
them. A program that consumes them passes (`KEY=$(cat f) cmd`, `curl -H "$(cat f)"`, `cat f | sha256sum`, `... | ssh`).
"""
import os
import re

from secret_scan import guard_config

CONFIG = guard_config("process_guard", {})
SECRET_DIRS = [d.strip("/") for d in CONFIG.get("secret_dirs", [])]
STORE = re.compile(r"(?<![\w-])(?:" + "|".join(map(re.escape, SECRET_DIRS)) + ")/") if SECRET_DIRS else None
NOT_SECRET = re.compile(CONFIG.get("secret_dir_public") or r"(?!)")
VAR = re.compile(r"\$(?:\{(\w+)\}|(\w+))")
GREPS = {"grep", "egrep", "fgrep", "rg"}
SILENT = re.compile(r"^-[a-zA-Z]*[clLq]")  # a grep reporting a count, file names or nothing
READERS = GREPS | {"cat", "cut", "sed", "awk", "gawk", "head", "tail", "less", "more", "strings", "xxd", "od", "hexdump",
                   "base64", "nl", "paste", "sort", "uniq", "tr", "column", "tee", "diff", "dd", "jq"}
FILTERS = READERS | {"echo", "printf", "print"}


def values(word, ctx):
    """The word, then the word with each variable replaced by what assignments and loops gave it."""
    found = [word]
    for m in VAR.finditer(word):
        name = m.group(1) or m.group(2)
        loop = ctx.loops.get(name)
        held = (loop[1] if loop[0] == "words" else [w for a in loop[1] for w in a]) if loop else []
        found += [word.replace(m.group(0), v) for v in held + [ctx.vars.get(name, "")]]
    return found


def stage_read(seg, argv, ctx):
    """The secret file this pipeline stage reads, or None."""
    if STORE is None or seg.writes or not argv:
        return None
    prog, args = os.path.basename(argv[0]), argv[1:]
    # Given the directory itself, only these reach its files; any other reader just fails on a directory.
    walks = prog == "rg" or (prog in GREPS and any(re.match(r"^-[a-zA-Z]*[rR]", a) for a in args))
    if prog not in READERS or (prog in GREPS and any(SILENT.match(a) for a in args)):
        return None
    for word in args + seg.inputs:
        for v in values(word, ctx):
            if STORE.search(v + "/" if walks else v) and not NOT_SECRET.search(v):
                return f"{prog} of {v}"
    relative = any(a and a[0] not in "-/~$" for a in args)
    return f"{prog} in {ctx.cwd}" if relative and ctx.cwd and STORE.search(ctx.cwd + "/") else None


def track_secret_read(ctx, seg, argv):
    """Follow a secret read through the flat segment list; a $( )'s segments come just before the command holding it."""
    if ctx.secret_pending:
        label, from_substitution = ctx.secret_pending
        keeps = bool(argv) and not seg.writes and os.path.basename(argv[0]) in FILTERS and not (
            os.path.basename(argv[0]) in GREPS and any(SILENT.match(a) for a in argv[1:]))
        if seg.pipe_in or (from_substitution and not seg.substituted):  # the bytes flow into this stage
            ctx.secret_pending = (label, seg.substituted) if keeps else None
        elif not from_substitution:
            flush_secret_read(ctx)
    read = stage_read(seg, argv, ctx)
    if read and not ctx.secret_pending:
        ctx.secret_pending = (read, seg.substituted)


def flush_secret_read(ctx):
    if ctx.secret_pending:
        ctx.events.append(("env-dump", ctx.secret_pending[0]))
        ctx.secret_pending = None


def rule_env_dump(events):
    """A command that prints environment values: environments carry live keys, and the transcript keeps them."""
    found = [e[1] for e in events if e[0] == "env-dump"]
    if not found:
        return None
    return ("env-dump", "print of environment values",
            f"This command prints environment values (`{found[0]}`), and the transcript keeps them; the owner can allow it for a "
            "session with CC_ALLOW_ENV_DUMP=1 (logged). `cut -d= -f1`, `sed` and `awk` print a multi-line value's later lines "
            "whole. A dotenvx file's names: `grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' <file>`; "
            "one non-secret variable: `printenv NAME`; a key by its length: `${#VAR}`. "
            + "".join(f"A ~/{d} file holds one raw value, which a filter prints: use `ls`, `wc -c` or `sha256sum`. " for d in SECRET_DIRS)
            + "Print the names instead (also after `dotenvx run -f <file> --`): `bash -c 'compgen -e'`.", "CC_ALLOW_ENV_DUMP")
