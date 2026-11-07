#!/usr/bin/env bash
# PreToolUse(Bash) block for commands that can freeze, wedge, or unboot the
# host. Exit 2 with the reason on stderr blocks the call and shows Claude why.
#
# This hook is the first line: it stops the verb before sudo sees it and names
# the allowed venue (a throwaway VM). The root wrappers in /usr/local/sbin
# (dotfiles/host) are the second line for every other caller.
#
# Scope: the verb must appear in command position (start of a command, after
# sudo, ;, &&, ||, |, $( or a newline). `grep fsfreeze` and a remote command
# after `ssh host '...'` pass, as does a command matching guard-config's `vm_command`.
# One exception, which fails closed: any command that names format-traces-drive
# is refused, wherever the name appears. That includes read-only commands, git,
# ssh and the VM tool. Each narrower rule had a bypass: line continuations, option
# variables, ssh -o and ~/.ssh/config, sed -e, and git helpers. Over ssh the
# remote session has no claude ancestor for the script's own check to find.

# Fail-open on parse failure: a missing python3 or malformed payload exits 0.

set -uo pipefail

payload="$(cat 2>/dev/null || true)"
[ -z "$payload" ] && exit 0

# Cheap pre-filter: skip the parser unless a guarded word is present at all.
printf '%s' "$payload" | grep -qE 'format-traces-drive|fsfreeze|unshare|dmsetup|lvcreate|lvremove|lvchange|lvconvert|lvresize|lvextend|lvreduce|vgcreate|vgremove|vgchange|vgextend|vgreduce|pvcreate|pvremove|pvmove|mkfs|mke2fs|mkswap|wipefs|blkdiscard|sgdisk|sfdisk|fdisk|parted|umount|mount|rmdir|sysrq|reboot|poweroff|shutdown|halt|init 0|init 6|HOST_BLAST_GUARD|/proc|/sys|/dev|/run|/boot' || exit 0
command -v python3 >/dev/null || exit 0

read -r -d '' GUARD_PY <<'PY'
import json
import os
import re
import sys

try:
    d = json.loads(sys.stdin.read())
except Exception:
    sys.exit(0)

inp = d.get("tool_input") or {}
cmd = inp.get("command") or ""
if not cmd:
    sys.exit(0)
try:  # a broken shared module must not lift the guard
    sys.path.insert(0, os.path.dirname(os.path.realpath(sys.argv[1])))
    from secret_scan import guard_config
    CONFIG = guard_config("host-blast-guard") or {}  # vm_command (a regex), vm_hint, eraser_hint
except Exception:
    CONFIG = {}
VM = CONFIG.get("vm_hint") or "Run the experiment in a throwaway VM."

# Erasing the trace drive belongs to the owner at a terminal outside Claude. The
# hook sees only Bash commands, so the Read and Grep tools still read the
# script, and a commit can name it through -F FILE.
if "format-traces-drive" in cmd:
    err = sys.stderr
    print("host-blast-guard: blocked format-traces-drive: it erases a whole disk; only the owner runs it, in a terminal outside Claude.", file=err)
    print("No Bash command may name it. Give the owner the command to run themselves. Read the script with the Read or Grep tool, and commit with -F FILE.", file=err)
    if CONFIG.get("eraser_hint"):
        print(CONFIG["eraser_hint"], file=err)
    sys.exit(2)

# A heredoc that `cat` or `tee` writes to a file is data; one fed to a shell (`bash -s <<EOF`) is still judged.
cmd = re.sub(r"(\b(?:cat|tee)\b[^\n]*<<-?\s*['\"]?([A-Za-z_]\w*)['\"]?[^\n]*\n)(?:.*?\n)??\2(?=\n|$)", r"\1", cmd, flags=re.S)

# The VM is the allowed venue; a command handed to it passes whole. The
# eraser rule above comes first, so a VM command that names it is refused.
if CONFIG.get("vm_command") and re.search(r"(^|[\s;&|(])(?:" + CONFIG["vm_command"] + r")\b", cmd):
    sys.exit(0)

# A bypass belongs to a human at a real terminal, never to an agent. Only the
# assignment form in command position counts; the name inside prose, a heredoc
# sentence, or backticks passes.
if re.search(r"(?:^|[\s;&|(])HOST_BLAST_GUARD=off\s+\S", cmd, re.M):
    print("host-blast-guard: HOST_BLAST_GUARD=off is a human-only bypass. " + VM + " Or ask the owner to run this themselves (prefix it with ! in the prompt).", file=sys.stderr)
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
    # The verb must end its word: in `grep -E "x/(quiesce|shutdown)"` and `grep "a|reboot|b"` it is a pattern.
    (r"(?:systemctl\s+(?:reboot|poweroff|halt|kexec)|reboot|poweroff|halt|shutdown|init\s+[06])(?=\s|$|[;&\n])", "rebooting or powering off the host"),
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
        segment = re.split(r"[;&|\n]", cmd[m.start(1):], maxsplit=1)[0]
        if is_listing(segment):
            continue
        err = sys.stderr
        print("host-blast-guard: blocked `%s`: %s." % (verb_text.strip().splitlines()[0][:80], why), file=err)
        print(VM, file=err)
        print("If it truly must run on the host, ask the owner to run it themselves (they can prefix it with ! in the prompt). Do not wrap it in sh -c, env, python, or an absolute path.", file=err)
        sys.exit(2)
sys.exit(0)
PY

printf '%s' "$payload" | python3 -c "$GUARD_PY" "$0"
