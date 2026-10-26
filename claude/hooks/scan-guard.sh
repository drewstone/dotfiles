#!/usr/bin/env bash
# PreToolUse(Bash) block for recursive searches over the whole home or state trees.
#
# Agents ran `find /Users/drew ...`, `grep -rl <key> ~/.config
# ~/.local/state ...` and `grep -rl clef-flash ~/.local/state` on the Mac. Each ran
# 4-10 min at ~100% CPU and heavy I/O while the Mac sat at load 50-110 with swap
# full, and each answer was available from a narrower path (the repo, the owning
# state file, or the vault by key name).
#
# Four `find / -name ...` searches ran 20-75 min
# each. They walked the trace archive HDD (/mnt/traces, 11M inodes) and evicted the
# inode cache the hourly trace-archive capture needs, which then read about 115
# entries/s instead of over 1,000.
#
# Scope: grep -r/-R, rg, find, du and fd whose search roots include the filesystem
# root, /home, /mnt, the archive drive, the home directory itself or a broad
# state/cache/config tree under it. Searches inside a repository or a named
# subdirectory stay allowed.
#
# Bounded finds stay allowed on a broad root: `-maxdepth` up to 3, or `-xdev` on
# /mnt (its own filesystem, without the archive drive). `-xdev` on / or the home
# still walks every checkout.
#
# Linux hosts (drew-gtr-pro, the Beelinks, sandboxes; also any command after `ssh`) are judged by
# their own harm, the archive drive and multi-million-entry walks, not the Mac's CPU. From 10-19 to
# 10-26 202 of 319 refusals were there, mostly bounded finds. Measured on drew-gtr-pro 10-26 at
# load 30: `find ~ -maxdepth 4` 5.5 s, `find / -xdev -maxdepth 6` 16 s, ~/.config 0.6 s,
# ~/.claude 1.5 s, ~/.codex 0.2 s. So there a find with `-maxdepth` up to 6 passes unless it can
# enter /mnt/traces (a root of /, /mnt or /mnt/traces without -xdev), and the small config trees
# pass. Codex runs this hook too (~/.codex/hooks.json,
# installed by claude/install.sh); a Codex session's
# `find / -name ...` walked /mnt/traces for 35+ min on drew-gtr-pro because only
# Claude ran the guard.
#
# Fail-open: any parse failure exits 0 so normal Bash use is never blocked.

set -uo pipefail
exec 2>/dev/null

payload="$(cat 2>/dev/null || true)"
[ -z "$payload" ] && exit 0
# A JSON payload escapes a newline as \n, so a search on a line of its own follows a letter: no word boundary here.
printf '%s' "$payload" | grep -qE '(grep|rg|find|fd|du)' || exit 0
command -v python3 >/dev/null || exit 0

read -r -d '' GUARD_PY <<'PY'
import json, os, platform, re, shlex, sys
try:
    d = json.loads(sys.stdin.read())
except Exception:
    sys.exit(0)
cmd = (d.get("tool_input") or {}).get("command") or ""
# Codex can pass the command as argv; judge the script a shell is given.
if isinstance(cmd, list):
    words = [str(w) for w in cmd]
    shell = len(words) >= 3 and os.path.basename(words[0]) in ("bash", "sh", "zsh") and words[1] in ("-c", "-lc", "-ilc")
    cmd = words[2] if shell else shlex.join(words)
if not isinstance(cmd, str):
    sys.exit(0)
home = os.path.expanduser("~")
# Roots too broad to scan: the filesystem root, /home, /mnt and the archive drive, the home itself and its
# sprawling hidden trees.
# ~/code and ~/webb hold every checkout and worktree with their node_modules; a scan there is a scan of all of them.
BROAD = {"/", "/home", "/mnt", "/mnt/traces", home, home + "/", home + "/.local", home + "/.local/state", home + "/.local/share",
         home + "/.config", home + "/.cache", home + "/Library", home + "/.codex", home + "/.claude",
         home + "/code", home + "/code/_wt", home + "/webb", home + "/webb/_wt"}
# A relative or implicit path resolves against the session's cwd: a lane ran `grep -rln ... .` from
# ~/code on drew-gtr-pro at 43 MB/s while the box sat at load 90, and the literal "." matched nothing here.
cwd = d.get("cwd") or os.getcwd()
# SCAN_GUARD_PLATFORM stands in for uname in tests, so both hosts' rules run on either.
MAC = (os.environ.get("SCAN_GUARD_PLATFORM") or platform.system()) == "Darwin"
SMALL = {home + "/.config", home + "/.codex", home + "/.claude"}  # under 2 s to walk on drew-gtr-pro
ARCHIVE = {"/", "/mnt", "/mnt/traces"}

def norm(tok):
    tok = tok.strip("'\"")
    tok = tok.replace("$HOME", home).replace("${HOME}", home)
    if tok == "~" or tok.startswith("~/"):
        tok = home + tok[1:]
    return tok.rstrip("/") or "/"

def resolve(tok, base):
    path = norm(tok)
    if not path.startswith("/"):
        path = os.path.normpath(os.path.join(base, path))
    path = re.sub(r"^/home/[^/]+(?=/|$)", home, path)  # a remote host's home is judged as this one
    return path.rstrip("/") or "/"

def broad_roots(seg, base, mac):
    try:
        toks = shlex.split(seg)
    except ValueError:
        return []
    if toks and os.path.basename(toks[0]) == "rtk":
        toks = toks[1:]
    if not toks:
        return []
    prog = os.path.basename(toks[0])
    # `fd = os.open(...)` and `du = ...` in a script body are assignments, and `du --files0-from` reads its list.
    if prog not in ("grep", "rg", "find", "fd", "du") or (len(toks) > 1 and toks[1].startswith("=")) \
            or any(t.startswith("--files0-from") for t in toks):
        return []
    if prog == "grep" and not any(t.startswith("-") and ("r" in t or "R" in t) and not t.startswith("--") for t in toks[1:]) \
            and "--recursive" not in toks:
        return []
    # Operands only: drop options and the separate value an option takes (-e PATTERN, -g GLOB, find's -name X).
    takes_value = {"-e", "-f", "--regexp", "--file", "-m", "--max-count", "-A", "-B", "-C", "-g", "--glob", "-t",
                   "--type", "-T", "--type-not", "-name", "-iname", "-path", "-ipath", "-type", "-maxdepth",
                   "-mindepth", "-newer", "-size", "-mtime", "-mmin", "-user", "-perm", "-regex", "-exec", "-d", "--max-depth"}
    if prog == "rg":
        takes_value |= {"-r", "--replace"}  # rg's -r is a replacement string, not recursion
    args, skip = [], False
    for t in toks[1:]:
        if skip:
            skip = False
        elif t in takes_value:
            skip = True
        elif t and not t.startswith("-"):  # an empty operand once resolved to "/"
            args.append(t)
    # grep and rg take the pattern as their first operand unless -e or -f supplies it; fd's first operand is its pattern.
    if prog in ("grep", "rg", "fd") and args and not any(t in ("-e", "-f", "--regexp", "--file", "--files") for t in toks[1:]):
        args = args[1:]
    # With no path operand they search the cwd.
    if not args:
        args = ["."]
    broad = {norm(b) for b in BROAD} - (set() if mac else SMALL)
    hits = [t for t in args if resolve(t, base) in broad]
    if prog == "find" and hits:
        depth = next((toks[i + 1] for i, t in enumerate(toks[:-1]) if t == "-maxdepth"), None)
        depth = int(depth) if depth is not None and depth.isdigit() else None
        xdev = "-xdev" in toks or "-mount" in toks
        if depth is not None and depth <= 3:
            return []
        if xdev:
            hits = [t for t in hits if resolve(t, base) != "/mnt"]
        if not mac and depth is not None and depth <= 6:
            hits = [t for t in hits if resolve(t, base) in ARCHIVE and not xdev]
    return hits

# A heredoc that `cat` or `tee` writes to a file is data, not a command: a test script of scan cases was refused.
cmd = re.sub(r"(\b(?:cat|tee)\b[^\n]*<<-?\s*['\"]?([A-Za-z_]\w*)['\"]?[^\n]*\n)(?:.*?\n)??\2(?=\n|$)", r"\1", cmd, flags=re.S)
hits = []
# Everything after the first `ssh` runs on a Linux host, from that host's home.
ssh = re.search(r"(?:^|[\s;&|(])ssh\s", cmd)
parts = [(cmd, cwd, MAC)]
if ssh:
    remote = cmd[ssh.start():]
    try:  # the remote script is the operand after ssh's options and the host
        toks, i = shlex.split(remote), 1
        while i < len(toks) and toks[i].startswith("-"):
            i += 2 if toks[i][-1] in "bcDEeFIiJLlmOopQRSWw" and len(toks[i]) == 2 else 1
        remote = toks[i + 1] if len(toks) == i + 2 else remote
    except ValueError:
        pass
    parts = [(cmd[:ssh.start()], cwd, MAC), (remote, home, False)]
for text, base, mac in parts:
    # Follow `cd` within the command, so `cd ~/code && grep -r x .` is judged from ~/code.
    for seg in re.split(r"\|\||&&|;|\||\n", text):
        seg = seg.strip()
        m = re.match(r"cd\s+(\S+)\s*$", seg)
        if m:
            base = resolve(m.group(1), base)
            continue
        hits += broad_roots(seg, base, mac)
if hits:
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": (
            f"scan-guard: recursive search over a broad tree ({', '.join(sorted(set(hits)))}) is blocked. "
            "On the Mac these ran 4-10 min at full CPU while load was 50-110; on drew-gtr-pro `find /` "
            "walked the archive drive for up to 75 min and stalled its trace capture. On Linux a find with "
            "-maxdepth up to 6 passes (add -xdev on /). Use `git grep` in the "
            "owning repo, `fd <name> <path>` or `find <path> -maxdepth 3` on a named directory, `qmd` for the "
            "markdown docs, the specific state file, or vault secrets by key name (dotenvx get -f <file>)."
        ),
    }}))
sys.exit(0)
PY

printf '%s' "$payload" | python3 -c "$GUARD_PY" 2>/dev/null || exit 0
exit 0
