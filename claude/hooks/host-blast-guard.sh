#!/usr/bin/env bash
# PreToolUse(Bash) block for commands that can freeze, wedge, or unboot the
# host. Exit 2 with the reason on stderr blocks the call and shows Claude why.
#
# Why: two outages came from root storage commands that look scoped and act on
# the whole host. 2026-08-20: `unshare --mount` then `rmdir /proc` deleted the
# real /proc directory (5 days down). 2026-09-02: `fsfreeze -f` on a directory
# whose mount had failed froze the root filesystem (16 days down).
#
# This hook is the first line: it stops the verb before sudo sees it and names
# the allowed venue (a throwaway VM via `hostlab`). The root wrappers in
# /usr/local/sbin (dotfiles/host) are the second line for every other caller.
#
# Scope: the verb must appear in command position (start of a command, after
# sudo, ;, &&, ||, |, $( or a newline). `grep fsfreeze` and a remote command
# after `ssh host '...'` pass. `hostlab run -- ...` passes.
# One exception, which fails closed: a command that names format-traces-drive
# is refused unless it is one read-only command (cat, head, grep and the like,
# never git), also when that command runs over ssh, or one hostlab command. So
# variables, line continuations, bash -c, script -c, tmux send-keys and remote
# runs are all refused. It exists only on the Linux boxes, where an
# ssh session has no claude ancestor for the script's own check to find.

# Fail-open on parse failure: a missing python3 or malformed payload exits 0.

set -uo pipefail

payload="$(cat 2>/dev/null || true)"
[ -z "$payload" ] && exit 0

# Cheap pre-filter: skip the parser unless a guarded word is present at all.
printf '%s' "$payload" | grep -qE 'format-traces-drive|fsfreeze|unshare|dmsetup|lvcreate|lvremove|lvchange|lvconvert|lvresize|lvextend|lvreduce|vgcreate|vgremove|vgchange|vgextend|vgreduce|pvcreate|pvremove|pvmove|mkfs|mke2fs|mkswap|wipefs|blkdiscard|sgdisk|sfdisk|fdisk|parted|umount|mount|rmdir|sysrq|reboot|poweroff|shutdown|halt|init 0|init 6|HOST_BLAST_GUARD|/proc|/sys|/dev|/run|/boot' || exit 0
command -v python3 >/dev/null || exit 0

read -r -d '' GUARD_PY <<'PY'
import json
import re
import shlex
import sys

try:
    d = json.loads(sys.stdin.read())
except Exception:
    sys.exit(0)

inp = d.get("tool_input") or {}
cmd = inp.get("command") or ""
if not cmd:
    sys.exit(0)

# Erasing the trace drive belongs to Drew at a terminal outside Claude. Only
# a single read-only command may name the script; anything else that names it
# is refused, however its options are spelled. Each listed command runs no
# other command whatever its options; sed (e, -e) and awk (system) can.
READ_ONLY = {"cat", "grep", "head", "tail", "wc", "ls", "stat", "file", "diff", "shellcheck", "readlink", "realpath"}
# git is left out: every subcommand can start a configured helper (an editor,
# a hook, a pager, a filter, an external diff or core.fsmonitor). Commit with
# -F FILE, or stage the directory, to leave the name off the command line.
# ssh options that run nothing: -o, -F and -J can start a ProxyCommand or a
# LocalCommand, so any other option refuses the command.
SSH_FLAGS = {"-t", "-tt", "-T", "-q", "-n", "-4", "-6"}
SSH_ARG_FLAGS = {"-p", "-l", "-i"}
HOSTLAB_RUNS = {"run", "shell", "build", "ssh"}

def one_command(c):
    """The tokens of C when it is one simple command, else None."""
    if re.search(r"[\n`]|\$\(|<\(|>\(", c):
        return None
    try:
        lex = shlex.shlex(c, posix=True, punctuation_chars=True)
        lex.whitespace_split = True
        tokens = list(lex)
    except ValueError:
        return None
    # An operator or a redirection outside quotes makes it more than one
    # command.
    if not tokens or any(t and set(t) <= set(";&|()<>") for t in tokens):
        return None
    return tokens

def in_vm(c):
    """C is one hostlab command, which runs its argument inside the VM."""
    tokens = one_command(c)
    return bool(tokens) and tokens[0] == "hostlab" and len(tokens) > 1 and tokens[1] in HOSTLAB_RUNS

def read_only(c, depth=0):
    tokens = one_command(c) if depth <= 2 else None
    if not tokens:
        return False
    verb = tokens[0]
    if verb in READ_ONLY:
        return True
    if verb == "ssh":
        i = 1
        while i < len(tokens) and tokens[i].startswith("-"):
            if tokens[i] in SSH_FLAGS:
                i += 1
            elif tokens[i] in SSH_ARG_FLAGS and i + 1 < len(tokens):
                i += 2
            else:
                return False
        remote = tokens[i + 1:]
        return bool(remote) and read_only(" ".join(remote), depth + 1)
    return False

if "format-traces-drive" in cmd and not (read_only(cmd) or in_vm(cmd)):
    err = sys.stderr
    print("host-blast-guard: blocked format-traces-drive: it erases a whole disk; only Drew runs it, in a terminal outside Claude.", file=err)
    print("Give Drew the command to run himself. Reading the script (cat, head, grep) is allowed as one command; git is not, so commit with -F FILE.", file=err)
    print("To test it, use a throwaway VM:  hostlab run -- '<command>'   (hostlab --help).", file=err)
    sys.exit(2)

# The VM lane is the allowed venue; a command handed to it passes whole. The
# eraser rule above comes first: there only one hostlab command counts.
if re.search(r"(^|[\s;&|(])hostlab\s+(run|shell|build|ssh)\b", cmd):
    sys.exit(0)

# A bypass belongs to a human at a real terminal, never to an agent. Only the
# assignment form in command position counts; the name inside prose, a heredoc
# sentence, or backticks passes.
if re.search(r"(?:^|[\s;&|(])HOST_BLAST_GUARD=off\s+\S", cmd, re.M):
    print("host-blast-guard: HOST_BLAST_GUARD=off is a human-only bypass. Run the experiment in a throwaway VM (hostlab run -- '<command>') or ask Drew to run this himself (prefix it with ! in the prompt).", file=sys.stderr)
    sys.exit(2)

# Command position: start, after a separator, or after sudo/exec/timeout.
# A backtick is not a separator here: inline code in a heredoc or commit
# message mentions these verbs far more often than backtick substitution runs
# them, and the root wrappers still catch the substitution case.
SUDO_OPT = r"(?:-[ugCDhpRrTU]\s+\S+|--(?:user|group|chdir|host|prompt|chroot|close-from|command-timeout|other-user)(?:=|\s+)\S+|-\S+)\s+"
LEAD = r"(?:^|[\n;&|({]|\$\()\s*(?:sudo\s+(?:" + SUDO_OPT + r")*|exec\s+|nohup\s+|env\s+|timeout\s+\S+\s+|nice\s+(?:-n\s*\S+\s+)?|(?:do|then|else)\s+)*"
KERNEL_DIR = r"/(?:proc|sys|dev|run|boot(?:/efi)?)/?(?=\s|$|['\"])"
ROOT_DISK = r"/dev/(?:nvme\d+n\d+(?:p\d+)?|sd[a-z]+\d*|vd[a-z]+\d*|hd[a-z]+\d*|mmcblk\d+(?:p\d+)?)\b"

RULES = [
    (r"fsfreeze\s+(?:-f|--freeze)\b", "fsfreeze -f freezes the filesystem under the path; on a plain directory that is / itself"),
    (r"fsfreeze\s+(?!-u\b|--unfreeze\b)\S+\s+(?:-f|--freeze)\b", "fsfreeze -f freezes the filesystem under the path; on a plain directory that is / itself"),
    (r"unshare\s+(?:-\S+\s+)*(?:-[a-zA-Z]*m[a-zA-Z]*\b|--mount(?:-proc)?\b)", "unshare --mount copies the mount table, not the disk; rmdir and writes inside it hit the real root"),
    (r"mount\s+(?:\S+\s+)*(?:--move|-M)\s+" + KERNEL_DIR, "mount --move of a kernel filesystem"),
    (r"mount\s+(?:\S+\s+)*" + KERNEL_DIR + r"\s*(?:$|[;&|\n)])", "mounting over /, /proc, /sys, /dev, /run or /boot"),
    (r"umount\s+(?:-\S+\s+)*" + KERNEL_DIR, "unmounting a kernel filesystem"),
    (r"umount\s+(?:-\S+\s+)*(?:-a|--all)\b", "umount -a unmounts every filesystem"),
    (r"(?:rmdir|rm)\s+(?:-\S+\s+)*" + KERNEL_DIR, "removing a kernel filesystem mountpoint"),
    (r"dmsetup\s+(?:remove_all|suspend|remove|create|reload|load|message|clear|wipe_table|rename)\b", "device-mapper mutation on the host"),
    (r"(?:pvcreate|vgcreate|lvcreate|lvremove|vgremove|pvremove|lvchange|vgchange|lvconvert|lvresize|lvextend|lvreduce|vgextend|vgreduce|pvresize|pvmove)\s+(?:\S+\s+)*" + ROOT_DISK, "LVM on a real disk"),
    (r"lvm\s+(?:pvcreate|vgcreate|lvcreate|lvremove|vgremove|pvremove|lvchange|vgchange|lvconvert|pvmove)\s+(?:\S+\s+)*" + ROOT_DISK, "LVM on a real disk"),
    (r"(?:mkfs(?:\.\w+)?|mke2fs|mkswap|wipefs|blkdiscard|sgdisk|sfdisk|fdisk|parted)\s+(?:\S+\s+)*" + ROOT_DISK, "writing a real disk"),
    (r"dd\s+(?:\S+\s+)*of=" + ROOT_DISK, "dd onto a real disk"),
    (r"(?:echo|printf)\s+\S+\s*>\s*/proc/sysrq-trigger", "sysrq reboots or crashes the host"),
    (r"(?:systemctl\s+(?:reboot|poweroff|halt|kexec)|reboot|poweroff|halt|shutdown|init\s+[06])\b", "rebooting or powering off the host"),
]

# Listing forms are read-only and pass.
LISTING = [
    (r"^wipefs\b", r"\s(?:-a|--all|-o\S*|--offset)\b", True),
    (r"^fdisk\b", r"\s-l\b", False),
    (r"^sfdisk\b", r"\s(?:-l|-d|--list|--dump)\b", False),
    (r"^parted\b", r"\s(?:-l|--list|print)\b", False),
]

def is_listing(text):
    for verb, flags, invert in LISTING:
        if re.match(verb, text):
            has = re.search(flags, text) is not None
            return (not has) if invert else has
    return False

def first_ssh_pos(s):
    m = re.search(r"(?:^|[\s;&|(])ssh\s", s)
    return m.start() if m else None

ssh_at = first_ssh_pos(cmd)
for pat, why in RULES:
    for m in re.finditer(LEAD + r"(" + pat + r")", cmd, re.M):
        # A verb inside a remote command after `ssh host '...'` runs elsewhere.
        if ssh_at is not None and m.start(1) > ssh_at:
            continue
        verb_text = m.group(1)
        # Listing flags may follow the device (`parted /dev/nvme0n1 print`), so
        # judge the whole command segment, not only the matched span.
        segment = re.split(r"[;&|\n]", cmd[m.start(1):], 1)[0]
        if is_listing(segment):
            continue
        err = sys.stderr
        print("host-blast-guard: blocked `%s`: %s." % (verb_text.strip().splitlines()[0][:80], why), file=err)
        print("This class of command took this host down on 2026-08-20 (5 days) and 2026-09-02 (16 days).", file=err)
        print("Run the experiment in a throwaway VM:  hostlab run -- '<command>'   (hostlab --help: lvm2, dm-thin, xfs, root, the cwd at /work).", file=err)
        print("If it truly must run on the host, ask Drew to run it himself (he can prefix it with ! in the prompt). Do not wrap it in sh -c, env, python, or an absolute path.", file=err)
        sys.exit(2)
sys.exit(0)
PY

printf '%s' "$payload" | python3 -c "$GUARD_PY"
