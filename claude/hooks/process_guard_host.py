"""Process-guard rules for the host itself: broad-scan (a recursive search over a sprawling tree) and host-blast (a verb that
can freeze, wedge or unboot the host). process_guard.py's docstring states both; each judges one parsed command."""
import os
import re

from secret_scan import guard_config

HOME = os.path.expanduser("~")
# ~/code holds every checkout and worktree with their node_modules; a scan there is a scan of all of them.
BROAD = {"/", "/home", "/mnt", "/mnt/traces", *(HOME + t for t in ("", "/.local", "/.local/state", "/.local/share", "/.config",
         "/.cache", "/Library", "/.codex", "/.claude", "/code", "/code/_wt")), *guard_config("scan-guard", {}).get("broad", [])}
SMALL = {HOME + t for t in ("/.config", "/.codex", "/.claude")}  # broad on the Mac only
ARCHIVE = {"/", "/mnt", "/mnt/traces"}
SCAN_VALUE = {"-e", "-f", "--regexp", "--file", "-m", "--max-count", "-A", "-B", "-C", "-g", "--glob", "-t", "--type", "-T",
              "--type-not", "-name", "-iname", "-path", "-ipath", "-type", "-maxdepth", "-mindepth", "-newer", "-size", "-mtime",
              "-mmin", "-user", "-perm", "-regex", "-exec", "-d", "--max-depth"}


def scan_path(word, base):
    path = word.replace("${HOME}", HOME).replace("$HOME", HOME)
    path = HOME + path[1:] if path == "~" or path.startswith("~/") else path
    path = re.sub(r"^/home/[^/]+(?=/|$)", HOME, os.path.normpath(os.path.join(base, path)))  # a remote home is judged as this one
    return path.rstrip("/") or "/"


def rule_broad_scan(cmd, mac):
    """mac: the command runs on this Mac (a remote command is judged by a Linux host's rules)."""
    words = cmd.argv
    if cmd.prog not in ("grep", "rg", "find", "fd", "du") or words[1:2] and words[1].startswith("=") or \
            any(w.startswith("--files0-from") for w in words) or (cmd.cwd is None and not cmd.remote):
        return None  # `fd = os.open(...)` is an assignment, `du --files0-from` reads its list, an unknown cwd is no root
    if cmd.prog == "grep" and "--recursive" not in words and not any(re.match(r"-[^-]*[rR]", w) for w in words[1:]):
        return None
    takes = SCAN_VALUE | ({"-r", "--replace"} if cmd.prog == "rg" else set())  # rg's -r is a replacement, not recursion
    roots, skip, ended = [], False, False
    for w in words[1:]:  # operands: options and the value an option takes dropped, every word after `--` kept
        if skip:
            skip = False
        elif w in takes and not ended or w == "--" and not ended:
            skip, ended = w != "--", w == "--"
        elif w and (ended or w[0] != "-"):
            roots.append(w)
    if cmd.prog in ("grep", "rg", "fd") and roots and not {"-e", "-f", "--regexp", "--file", "--files"} & set(words):
        roots = roots[1:]  # the first operand is the pattern
    known = [r for r in roots if "`" not in r and "$" not in r.replace("${HOME}", "").replace("$HOME", "")]
    if roots and not known or {"--help", "--version"} & set(words) or \
            not roots and (cmd.via_xargs or cmd.prog == "rg" and (cmd.upstream or cmd.inputs or cmd.heredocs)):
        return None  # roots set by variables or by xargs' input are unknown; a piped rg with no path reads its stdin
    base = scan_path(cmd.cwd or "~", HOME)
    broad = BROAD - (set() if mac else SMALL)
    hits = [r for r in known or ["."] if scan_path(r, base) in broad]
    if cmd.prog == "du" and not mac and ("--one-file-system" in words or any(re.match(r"-[a-zA-Z]*x", w) for w in words[1:])):
        hits = [r for r in hits if scan_path(r, base) == "/mnt/traces"]  # on Linux -x keeps du off the archive drive
    if cmd.prog == "find" and hits:
        depth = next((words[k + 1] for k, w in enumerate(words[:-1]) if w == "-maxdepth"), "")
        depth, xdev = int(depth) if depth.isdigit() else None, "-xdev" in words or "-mount" in words
        if depth is not None and depth <= 3:
            return None
        hits = [r for r in hits if not (xdev and scan_path(r, base) == "/mnt") and (
            mac or depth is None or depth > 6 or scan_path(r, base) in ARCHIVE and not xdev)]
    if not hits:
        return None
    return ("broad-scan", f"recursive {cmd.prog} over {', '.join(sorted(set(hits)))}",
            f"A recursive {cmd.prog} over {', '.join(sorted(set(hits)))} walks every checkout, cache and state tree under it. "
            "On Linux a find with -maxdepth up to 6 passes (add -xdev on /), and so does du -x. Search the owning place instead: `qmd query` for "
            "the markdown docs, `fd <name> <path>` or `find <path> -maxdepth 3` on a named directory, or `git grep <pattern>` "
            "in the owning repo.", None)


HB = guard_config("host-blast-guard", {})  # vm_command (a regex), vm_hint, eraser_hint
VM_HINT = HB.get("vm_hint") or "Run it in a throwaway VM."
VM = re.compile(r"(^|[\s;&|(])(?:" + HB["vm_command"] + r")\b") if HB.get("vm_command") else None
KERNEL_DIR = r"/(?:proc|sys|dev|run|boot(?:/efi)?)/?(?=\s|$)"
DISK = r"/dev/(?:nvme\d+n\d+(?:p\d+)?|sd[a-z]+\d*|vd[a-z]+\d*|hd[a-z]+\d*|mmcblk\d+(?:p\d+)?)\b"
LVM = "pvcreate|vgcreate|lvcreate|lvremove|vgremove|pvremove|lvchange|vgchange|lvconvert|lvresize|lvextend|lvreduce|vgextend|vgreduce|pvresize|pvmove"
VERBS = [(re.compile(p), why) for p, why in (
    (r"fsfreeze\s+(?:\S+\s+)*(?:-f|--freeze)\b", "freezes the filesystem under the path; on a plain directory that is / itself"),
    (r"unshare\s+(?:-\S+\s+)*(?:-[a-zA-Z]*m[a-zA-Z]*\b|--mount(?:-proc)?\b)",
     "copies the mount table, not the disk; rmdir and writes inside it hit the real root"),
    (r"mount\s+(?:\S+\s+)*(?:--move|-M)\s+" + KERNEL_DIR, "moves a kernel filesystem"),
    (r"mount\s+(?:\S+\s+)*" + KERNEL_DIR + "$", "mounts over /, /proc, /sys, /dev, /run or /boot"),
    (r"umount\s+(?:-\S+\s+)*" + KERNEL_DIR, "unmounts a kernel filesystem"),
    (r"umount\s+(?:-\S+\s+)*(?:-a|--all)\b", "unmounts every filesystem"),
    (r"(?:rmdir|rm)\s+(?:-\S+\s+)*" + KERNEL_DIR, "removes a kernel filesystem mountpoint"),
    (r"dmsetup\s+(?:remove_all|suspend|remove|create|reload|load|message|clear|wipe_table|rename)\b", "mutates device-mapper on the host"),
    (r"(?:lvm\s+)?(?:" + LVM + r")\s+(?:\S+\s+)*" + DISK, "runs LVM on a real disk"),
    (r"(?:mkfs(?:\.\w+)?|mke2fs|mkswap|wipefs|blkdiscard|sgdisk|sfdisk|fdisk|parted)\s+(?:\S+\s+)*" + DISK, "writes a real disk"),
    (r"dd\s+(?:\S+\s+)*of=" + DISK, "writes a real disk"),
    (r"(?:systemctl\s+(?:reboot|poweroff|halt|kexec)|reboot|poweroff|halt|shutdown|init\s+[06])(?:\s|$)", "reboots or powers off the host"),
)]
LISTING = [(r"wipefs\b", r"\s(?:-a|--all|-o\S*|--offset)\b", True), (r"fdisk\b", r"\s-l\b", False),
           (r"sfdisk\b", r"\s(?:-l|-d|--list|--dump)\b", False), (r"parted\b", r"\s(?:-l|--list|print)\b", False)]
OWNER = "If it truly must run on the host, the owner runs it themselves (they prefix it with ! in the prompt); a wrapper (sh -c, env, python, an absolute path) is refused the same way. "


def listing(text):
    return any(re.match(verb, text) and bool(re.search(flags, text)) != invert for verb, flags, invert in LISTING)


def host_blast_command(command):
    """(eraser finding or None, whether the command is handed to the VM tool and its verbs pass)."""
    if "format-traces-drive" in command:  # fails closed: every narrower rule had a bypass (continuations, variables, ssh config)
        return ("host-blast", "a command naming format-traces-drive", "format-traces-drive erases a whole disk, so no Bash command "
                "may name it, read-only and VM forms included; only the owner runs it, in a terminal outside Claude. Read it with "
                f"the Read or Grep tool and commit with -F FILE. {HB.get('eraser_hint') or VM_HINT}", None), False
    return None, bool(VM and VM.search(command))


def rule_host_blast(cmd):
    if cmd.remote:
        return None
    if "HOST_BLAST_GUARD=off" in cmd.prefix:
        return ("host-blast", "HOST_BLAST_GUARD=off", "HOST_BLAST_GUARD=off is a bypass for a human at a terminal, never an agent. "
                + OWNER + VM_HINT, None)
    text = " ".join([cmd.prog, *cmd.argv[1:]])
    why = "triggers sysrq, which reboots or crashes the host" if "/proc/sysrq-trigger" in cmd.writes else next(
        (why for pattern, why in VERBS if pattern.match(text)), None)
    if not why or listing(text):
        return None
    return ("host-blast", f"{cmd.prog} on the host", f"`{text[:80]}` {why}. " + OWNER + VM_HINT, None)
