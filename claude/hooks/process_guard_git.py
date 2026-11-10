"""Process-guard rule shared-stash (process_guard.py's docstring), and git_out, which hooks-bypass shares."""
import os
import re

HOME = os.path.expanduser("~")
STATIC_STASH = re.compile(r"^(?:stash@\{\d+\}|refs/stash(?:@\{\d+\})?|\d+|[0-9a-f]{7,40})$")


def git_out(directory, *args):
    try:
        import subprocess
        r = subprocess.run(["git", "-C", directory, *args], capture_output=True, text=True, timeout=5)
    except Exception:
        return None
    return r.stdout.strip() if r.returncode == 0 else None


def session_created(toplevel, payload):
    """True when this session's transcripts record creating the worktree at toplevel."""
    transcript = payload.get("transcript_path") or ""
    session = payload.get("session_id") or ""
    if not transcript:
        return False
    # <project>/<session>.jsonl, plus every subagent's <project>/<session>/subagents/*.jsonl.
    parent = os.path.dirname(transcript)
    if os.path.basename(parent) == "subagents":
        session_dir = os.path.dirname(parent)
        files = [transcript, session_dir + ".jsonl"]
    else:
        session_dir = os.path.join(parent, session) if session else None
        files = [transcript]
    if session_dir:
        import glob
        files += glob.glob(os.path.join(session_dir, "subagents", "*.jsonl"))
    needles = {toplevel.encode()}
    if toplevel.startswith(HOME + "/"):
        rest = toplevel[len(HOME):]
        needles |= {("~" + rest).encode(), ("$HOME" + rest).encode()}
    for path in files:
        try:
            with open(path, "rb") as fh:
                for line in fh:
                    if (b"worktree add" in line or b"git clone" in line) and any(n in line for n in needles):
                        return True
        except OSError:
            continue
    return False


def worktree_owner(toplevel):
    try:
        with open(os.path.join(toplevel, ".wt-owner")) as fh:
            for line in fh:
                if line.startswith("owner="):
                    return line.strip().split("=", 1)[1]
    except OSError:
        return None
    return None


STASH_WHY = "Every worktree of a repo shares one stash list, so the newest entry can be another session's work."


def rule_shared_stash(cmd, payload, git_split, git_dir):
    if cmd.prog != "git":
        return None
    _, cdir, sub, args = git_split(cmd.argv)
    if sub != "stash" or not args or args[0] not in ("pop", "apply", "branch"):
        return None
    action = args[0]
    pos = [a for a in args[1:] if not a.startswith("-")]
    ref = (pos[1] if len(pos) > 1 else None) if action == "branch" else (pos[0] if pos else None)
    label = f"git stash {action}"
    if not ref and cmd.stashed and not cmd.remote and (d := git_dir(cmd, cdir)) and action != "branch" and \
            (git_out(d, "worktree", "list", "--porcelain") or "").count("worktree ") == 1:
        return None  # pops the entry this command just pushed, in a checkout no other worktree shares
    if not ref:
        return ("shared-stash", f"bare {label}", f"Bare `{label}` is refused. {STASH_WHY} " + (
            "A push of a clean tree saves nothing, so the pop takes the newest entry, whoever made it. Carry your change "
            "off the shared list instead: `s=$(git stash create) && git reset -q --hard && <check>; git stash apply -q "
            "--index ${s:?}`." if cmd.stashed else f"Find your entry with `git stash list`, then `git stash {action} "
            "stash@{N}` in your own worktree (`wt-new <repo> <branch>`), or copy it and leave it listed: `git stash show "
            "-p stash@{N} | git apply`."), None)
    if (var := re.fullmatch(r"\$\{(\w+):\?\}", ref)) and cmd.env.get(var.group(1)) == "$(git stash create)":
        return None  # this command's own commit, never on the shared list; ${s:?} stops the command when s is empty
    if cmd.remote:
        return None
    directory = git_dir(cmd, cdir)
    toplevel = git_out(directory, "rev-parse", "--show-toplevel") if directory else None
    if not toplevel:
        return ("shared-stash", f"{label} in an unresolved checkout", f"`{label} {ref}` is refused because the checkout it "
                f"runs in cannot be resolved from the command. {STASH_WHY} Name your own worktree by its literal path: "
                f"`git -C <worktree path> stash {action} {ref}`.", None)
    session = payload.get("session_id") or os.environ.get("CLAUDE_CODE_SESSION_ID") or ""
    own = "/_wt/" in toplevel + "/" and (
        (session and worktree_owner(toplevel) == session) or session_created(toplevel, payload))
    if not own:
        return ("shared-stash", f"{label} outside this session's worktree", f"`{label} {ref}` is refused: {toplevel} is not "
                "a _wt worktree this session created (no .wt-owner or `git worktree add` for it in this session's transcripts). "
                f"{STASH_WHY} Make your own worktree with `wt-new <repo> <branch>`, or copy the entry and leave it listed: "
                f"`git stash show -p {ref} | git apply`.", None)
    if STATIC_STASH.match(ref):
        target = f"stash@{{{ref}}}" if ref.isdigit() else ref
        subject = git_out(toplevel, "log", "-1", "--format=%s", target)
        current = git_out(toplevel, "symbolic-ref", "--short", "-q", "HEAD") or "(no branch)"
        m = re.match(r"^(?:WIP on|On) (.+?): ", subject or "")
        if m and m.group(1) != current:
            return ("shared-stash", f"{label} of another branch's entry", f"`{label} {ref}` is refused: that entry was made "
                    f"on branch {m.group(1)}, and this worktree is on {current}, so it is probably another session's. {STASH_WHY} "
                    "Pick your own entry from `git stash list`.", None)
    return None
