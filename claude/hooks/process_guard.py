#!/usr/bin/env python3
"""PreToolUse(Bash) guard for the process rules that agent briefs kept failing to hold.

Each rule below replays a command agents actually ran between 2026-10-03 and 2026-10-10
while their briefs said not to:

  admin-merge   `gh-drew pr merge ... --admin` (15 times in a week), and branch-protection
                writes through `gh api`. Both bypass the repository's merge protection.
  force-push    `git push -f`, `--force-with-lease`, `+refspec` (20 times), mostly to amend an
                agent's own fresh branch. AGENTS.md: force-push needs Drew's explicit authorization.
                Allowed when the command (or Drew, session-wide) sets CC_ALLOW_FORCE_PUSH=1.
  hooks-bypass  `git -c core.hooksPath=/dev/null commit`, `-c core.hooksPath=.husky commit`,
                `commit --no-verify`, GIT_CONFIG_* overrides and `git config core.hooksPath`.
                Each skips the global privacy, secret and commit-msg hooks. A throwaway fixture
                repo (under a temp dir with no remote, or created by `git init` in the same
                command) may still set core.hooksPath, the pattern the global hooks document.
  shared-stash  bare `git stash pop` / `apply`. Every worktree of a repo shares one stash list, so
                the newest entry can be another session's; on 2026-10-09 an agent popped one.
                The entry must be named, the checkout must be a `_wt` worktree this session
                created (wt-new's .wt-owner, or a `git worktree add` in this session's
                transcripts), and a named entry must come from the branch checked out there.
  mac-build     whole-repo installs, builds, test runs, turbo runs, image builds and signoff
                on the Mac (10 cores; agents drove its load to 120). Single test files stay
                local. Allowed when the command sets CC_ALLOW_MAC_BUILD=1.

Commands inside `ssh host '...'`, `bash -c`, `eval` and heredocs fed to a shell are parsed
too: an admin merge or force push run on a Beelink has the same effect on GitHub. The Mac
build rule skips remote commands, which is where that work belongs.

So are ad-hoc scripts the command runs (`bash x.sh`, `./x.sh`, `source x.sh`, `bash -s < x.sh`,
`ssh host bash -s < x.sh`): one written by a heredoc earlier in the same command, or a file under
a temp root such as a scratchpad. On 2026-10-04 an agent wrote a bare `git stash pop` into
scratchpad/gate1699.sh and ran the file, which no inline check could see. A repository's own
scripts are not read.

Denials and overrides are logged to ~/.claude/logs/process-guard.log with key-shaped values
redacted. Fail-open: an unparsable payload exits 0 with no output.
"""
import datetime
import glob
import json
import os
import platform
import re
import shlex
import subprocess
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))
from secret_scan import redact  # noqa: E402

HOME = os.path.expanduser("~")
LOG = os.path.join(HOME, ".claude", "logs", "process-guard.log")

# ---------------------------------------------------------------------------------------
# Shell lexing: a list of simple commands, each a list of words with quotes removed.
# Command substitutions become their own commands; heredoc bodies stay attached to the
# command that reads them.


class Segment:
    def __init__(self):
        self.words = []
        self.heredocs = []  # bodies, in order
        self.writes = []  # output redirection targets
        self.inputs = []  # `< file` input redirection sources


def lex(src):
    segments = []
    _lex(src, 0, segments, stop_paren=False)
    return [s for s in segments if s.words or s.heredocs]


def _lex(src, i, out, stop_paren):
    n = len(src)
    seg = Segment()
    word = []
    started = False
    pending = []  # (delimiter, strip_tabs, segment) waiting for the next newline
    redirect_target = None  # "skip", "heredoc:<dash>", "herestring"
    depth = 0

    def end_word():
        nonlocal word, started, redirect_target
        if started:
            text = "".join(word)
            if redirect_target == "skip":
                seg.writes.append(text)
            elif redirect_target == "input":
                seg.inputs.append(text)
            elif redirect_target and redirect_target.startswith("heredoc"):
                pending.append((text, redirect_target.endswith("-"), seg))
            elif redirect_target == "herestring":
                seg.heredocs.append(text)
            else:
                seg.words.append(text)
            redirect_target = None
        word, started = [], False

    def end_segment():
        nonlocal seg
        end_word()
        if seg.words or seg.heredocs:
            out.append(seg)
        seg = Segment()

    def substitution(j):
        """Lex $( ... ) starting after the opening paren; keep its source in the word."""
        inner = []
        end = _lex(src, j, inner, stop_paren=True)
        out.extend(s for s in inner if s.words or s.heredocs)
        word.append("$(" + src[j:end - 1] + ")")
        return end

    while i < n:
        ch = src[i]
        if ch == "\n":
            end_segment()
            i += 1
            for delim, strip_tabs, owner in pending:
                body = []
                while i < n:
                    j = src.find("\n", i)
                    line = src[i:] if j < 0 else src[i:j]
                    i = n if j < 0 else j + 1
                    if (line.lstrip("\t") if strip_tabs else line) == delim:
                        break
                    body.append(line)
                owner.heredocs.append("\n".join(body))
            pending = []
            continue
        if ch in " \t":
            end_word()
            i += 1
            continue
        if ch == "#" and not started:
            j = src.find("\n", i)
            i = n if j < 0 else j
            continue
        if ch == "\\":
            if i + 1 < n and src[i + 1] == "\n":
                i += 2
                continue
            word.append(src[i + 1] if i + 1 < n else "")
            started = True
            i += 2
            continue
        if ch == "'":
            j = src.find("'", i + 1)
            j = n if j < 0 else j
            word.append(src[i + 1:j])
            started = True
            i = j + 1
            continue
        if ch == '"':
            started = True
            i += 1
            while i < n and src[i] != '"':
                c = src[i]
                if c == "\\" and i + 1 < n and src[i + 1] in '"\\$`\n':
                    if src[i + 1] != "\n":
                        word.append(src[i + 1])
                    i += 2
                elif c == "$" and src.startswith("$((", i):
                    j = src.find("))", i)
                    j = n if j < 0 else j + 2
                    word.append(src[i:j])
                    i = j
                elif c == "$" and src.startswith("$(", i):
                    i = substitution(i + 2)
                elif c == "`":
                    j = src.find("`", i + 1)
                    j = n if j < 0 else j
                    out.extend(lex(src[i + 1:j]))
                    word.append("$(...)")
                    i = j + 1
                else:
                    word.append(c)
                    i += 1
            i += 1
            continue
        if ch == "$" and src.startswith("$((", i):
            j = src.find("))", i)
            j = n if j < 0 else j + 2
            word.append(src[i:j])
            started = True
            i = j
            continue
        if ch == "$" and src.startswith("$(", i):
            i = substitution(i + 2)
            started = True
            continue
        if ch == "`":
            j = src.find("`", i + 1)
            j = n if j < 0 else j
            out.extend(lex(src[i + 1:j]))
            word.append("$(...)")
            started = True
            i = j + 1
            continue
        if ch in "<>" and i + 1 < n and src[i + 1] == "(" :
            # process substitution <( ... ) / >( ... )
            i = substitution(i + 2)
            started = True
            continue
        if ch in "<>" or (ch == "&" and src.startswith("&>", i)):
            # a pure number just before the operator is a file descriptor
            if started and "".join(word).isdigit():
                word, started = [], False
            end_word()
            if src.startswith("<<<", i):
                redirect_target, i = "herestring", i + 3
            elif src.startswith("<<-", i):
                redirect_target, i = "heredoc-", i + 3
            elif src.startswith("<<", i):
                redirect_target, i = "heredoc", i + 2
            else:
                j = i + 1
                while j < n and src[j] in "<>&|":
                    j += 1
                redirect_target = "input" if src[i:j] == "<" else "skip"
                i = j
                # `>&2`, `2>&1`: the target is attached digits
                while i < n and src[i] in " \t":
                    i += 1
            continue
        if ch in ";&|":
            end_segment()
            i += 1
            continue
        if ch == "(":
            end_segment()
            depth += 1
            i += 1
            continue
        if ch == ")":
            end_segment()
            i += 1
            if depth:
                depth -= 1
                continue
            if stop_paren:
                return i
            continue
        word.append(ch)
        started = True
        i += 1
    end_segment()
    for _delim, _strip, owner in pending:
        owner.heredocs.append("")
    return i


# ---------------------------------------------------------------------------------------
# Commands: words with prefixes stripped, the environment they run with, and where.

ASSIGN = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", re.S)
KEYWORDS = {"if", "then", "else", "elif", "fi", "do", "done", "while", "until", "for", "in", "!", "{", "}", "case", "esac"}
SHELLS = {"bash", "sh", "zsh", "dash", "ksh"}


class Command:
    def __init__(self, argv, env, remote, cwd, ctx):
        self.argv, self.env, self.remote, self.cwd, self.ctx = argv, env, remote, cwd, ctx
        self.origin = ctx.origin  # the script file this command was read from, if any

    @property
    def prog(self):
        return os.path.basename(self.argv[0]) if self.argv else ""


class Context:
    """State shared by the commands of one shell: exported variables and cwd."""

    def __init__(self, cwd, remote):
        self.vars = {}
        self.cwd = cwd
        self.remote = remote
        self.git_init = False
        self.scratch_package = False  # a package.json was created here (npm init, > package.json)
        self.written = {}  # path -> heredoc body written to it earlier in this command
        self.depth = 0  # nesting of scripts read from files
        self.origin = None


def strip_prefix(words):
    env, i = {}, 0
    while i < len(words):
        w = words[i]
        m = ASSIGN.match(w)
        if m:
            env[m.group(1)] = m.group(2)
            i += 1
        elif w in KEYWORDS or w in ("nohup", "time", "command", "exec", "builtin", "caffeinate", "noglob"):
            i += 1
        elif w == "sudo":
            i += 1
            while i < len(words) and words[i].startswith("-"):
                i += 2 if words[i] in ("-u", "-g", "-C", "-D", "-h", "-p", "-R", "-T", "-U") else 1
        elif w == "env":
            i += 1
            while i < len(words) and words[i].startswith("-"):
                i += 2 if words[i] in ("-u", "-C", "-S") else 1
        elif w == "nice":
            i += 1
            if i < len(words) and words[i] == "-n":
                i += 2
            elif i < len(words) and re.match(r"^-\d+$", words[i]):
                i += 1
        elif w == "timeout":
            i += 1
            while i < len(words) and words[i].startswith("-"):
                i += 2 if words[i] in ("-s", "-k") else 1
            i += 1  # duration
        elif w == "rtk":
            i += 1
            if i < len(words) and words[i] == "proxy":
                i += 1
        elif w == "xargs":
            i += 1
            while i < len(words) and words[i].startswith("-"):
                i += 2 if words[i] in ("-I", "-n", "-P", "-L", "-s", "-E", "-d") else 1
        else:
            break
    return env, words[i:]


VAR = re.compile(r"\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))")


def expand_path(path, base, env=None):
    """Resolve a path the way the shell would, or None when it depends on something unknown."""
    if path is None:
        return None
    values = dict(env or {})
    values.setdefault("HOME", HOME)

    def var(m):
        value = values.get(m.group(1) or m.group(2))
        if value is None:
            return m.group(0)
        if value.startswith("$(mktemp"):
            return "/tmp/mktemp"
        return value

    path = VAR.sub(var, path)
    if path == "~" or path.startswith("~/"):
        path = HOME + path[1:]
    if "$" in path or "`" in path:
        return None
    if base is None and not path.startswith("/"):
        return None
    return os.path.normpath(os.path.join(base or "/", path))


SSH_VALUE = set("bcDEeFIiJLlmOopQRSWw")


def ssh_remote(args):
    """Return the remote command words of an ssh invocation (after options and host)."""
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--":
            i += 1
            break
        if a.startswith("-") and len(a) > 1:
            for k, ch in enumerate(a[1:]):
                if ch in SSH_VALUE:
                    if k == len(a) - 2:
                        i += 1  # value is the next word
                    break
            i += 1
            continue
        break
    return args[i + 1:] if i < len(args) else []


SCRIPT_LIMIT = 256 * 1024
SCRIPT_DEPTH = 3


def script_text(path, cmd_cwd, env, ctx):
    """The body of an ad-hoc script the command runs: one written by a heredoc earlier in the same
    command, or a file under a temp root (scratchpads, /tmp), where agents write throwaway
    scripts. A repository's own entrypoints (dx.sh, scripts/ship.sh) are not read: they are
    maintained, reviewed code, and the documented local flows run them on the Mac."""
    if ctx.remote or ctx.depth >= SCRIPT_DEPTH:
        return None
    resolved = expand_path(path, cmd_cwd, env)
    if not resolved:
        return None
    if resolved in ctx.written:
        return ctx.written[resolved]
    if not under_temp_root(resolved):
        return None
    try:
        if os.path.getsize(resolved) > SCRIPT_LIMIT:
            return None
        with open(resolved, "rb") as fh:
            data = fh.read()
    except OSError:
        return None
    if b"\0" in data:
        return None  # a binary, not a script
    return data.decode("utf-8", "replace")


def nested(text, cwd, remote, ctx, origin):
    ctx.depth += 1
    outer, ctx.origin = ctx.origin, origin
    try:
        return commands(text, cwd, remote, ctx)
    finally:
        ctx.depth -= 1
        ctx.origin = outer


def commands(src, cwd, remote=False, ctx=None):
    """Flatten a shell command into Command objects, descending into nested shells."""
    ctx = ctx or Context(cwd, remote)
    result = []
    for seg in lex(src):
        env, argv = strip_prefix(seg.words)
        if not argv:
            ctx.vars.update(env)
            continue
        prog = os.path.basename(argv[0])
        if prog == "export" or prog == "declare" or prog == "typeset":
            for w in argv[1:]:
                m = ASSIGN.match(w)
                if m:
                    ctx.vars[m.group(1)] = m.group(2)
            continue
        merged = dict(ctx.vars)
        merged.update(env)
        cmd = Command(argv, merged, ctx.remote, ctx.cwd, ctx)
        result.append(cmd)
        if prog in ("cd", "pushd"):
            target = next((a for a in argv[1:] if not a.startswith("-")), "~")
            # A remote path is kept as written and never checked against the local disk.
            ctx.cwd = target if ctx.remote else expand_path(target, ctx.cwd, merged)
        elif prog == "git" and "init" in argv[1:3]:
            ctx.git_init = True
        elif prog in ("npm", "pnpm", "yarn", "bun") and "init" in argv[1:3]:
            ctx.scratch_package = True
        if any(os.path.basename(w) == "package.json" for w in seg.writes):
            ctx.scratch_package = True
        if seg.heredocs and not ctx.remote:
            targets = list(seg.writes) + ([a for a in argv[1:] if not a.startswith("-")] if prog == "tee" else [])
            for target in targets:
                resolved = expand_path(target, ctx.cwd, merged)
                if resolved:
                    ctx.written[resolved] = seg.heredocs[-1]
        # A script file run directly (`./x.sh`, `/tmp/x.sh`) or sourced (`source x.sh`, `. x.sh`).
        script_path = None
        if "/" in argv[0] and prog not in SHELLS:
            script_path = argv[0]
        elif prog in ("source", ".") and len(argv) > 1:
            script_path = argv[1]
        if script_path:
            body = script_text(script_path, ctx.cwd, merged, ctx)
            if body is not None:
                result.extend(nested(body, ctx.cwd, ctx.remote, ctx, script_path))
        # Nested shells.
        if prog in SHELLS:
            script, has_c, noexec, positional, k = None, False, False, False, 1
            while k < len(argv):
                a = argv[k]
                if a in ("-o", "+o", "-O", "+O"):
                    noexec = noexec or (a == "-o" and k + 1 < len(argv) and argv[k + 1] == "noexec")
                    k += 2
                    continue
                if a.startswith("-") and a not in ("-", "--"):
                    has_c = has_c or "c" in a[1:]
                    noexec = noexec or "n" in a[1:]  # `bash -n x.sh` only checks syntax
                    k += 1
                    continue
                positional = True
                script = a if has_c else None
                break
            if script is not None:
                result.extend(commands(script, ctx.cwd, ctx.remote, ctx))
            elif noexec:
                pass
            elif positional:  # `bash script.sh`: read an ad-hoc script file
                body = script_text(argv[k], ctx.cwd, merged, ctx)
                if body is not None:
                    result.extend(nested(body, ctx.cwd, ctx.remote, ctx, argv[k]))
            else:  # `bash`, `bash -s`: the heredoc or the `< file` input is the script
                for body in seg.heredocs:
                    result.extend(commands(body, ctx.cwd, ctx.remote, ctx))
                for source in seg.inputs:
                    body = script_text(source, ctx.cwd, merged, ctx)
                    if body is not None:
                        result.extend(nested(body, ctx.cwd, ctx.remote, ctx, source))
        elif prog == "ssh":
            words = ssh_remote(argv[1:])
            sub = Context(None, True)
            sub.vars.update(merged)
            if words:
                result.extend(commands(" ".join(words), None, True, sub))
            if not words or os.path.basename(words[0].split()[0] if words[0].split() else "") in SHELLS:
                for body in seg.heredocs:
                    result.extend(commands(body, None, True, sub))
                for source in seg.inputs:  # `ssh host bash -s < local.sh` runs the local file remotely
                    body = script_text(source, ctx.cwd, merged, ctx)
                    if body is not None:
                        result.extend(nested(body, None, True, sub, source))
        elif prog == "eval":
            result.extend(commands(" ".join(argv[1:]), ctx.cwd, ctx.remote, ctx))
        elif prog in ("beelink-gate", "hostlab") and "--" in argv:
            sub = Context(None, True)
            sub.vars.update(merged)
            result.extend(commands(shlex.join(argv[argv.index("--") + 1:]), None, True, sub))
    return result


# ---------------------------------------------------------------------------------------
# Rules. Each returns None, or (rule, summary, reason, override_variable or None).

def flag_on(cmd, name):
    return cmd.env.get(name) == "1" or os.environ.get(name) == "1"


def gh_positionals(args):
    out, i = [], 0
    while i < len(args):
        a = args[i]
        if a in ("-R", "--repo", "-X", "--method", "-H", "--header", "-f", "-F", "--field", "--raw-field", "-q", "--jq", "-t", "--template", "--input", "--hostname"):
            i += 2
            continue
        if a.startswith("-"):
            i += 1
            continue
        out.append(a)
        i += 1
    return out


def rule_admin_merge(cmd):
    if cmd.prog not in ("gh", "gh-drew"):
        return None
    args = cmd.argv[1:]
    pos = gh_positionals(args)
    if pos[:2] == ["pr", "merge"] and any(a == "--admin" or a.startswith("--admin=") for a in args):
        return ("admin-merge", "gh pr merge --admin",
                "`gh pr merge --admin` bypasses branch protection and is refused. Merge through protection: once the local "
                "Beelink gate passes, `gh-drew pr merge <number> --repo <owner/repo> --squash --auto` (or without --auto when "
                "the required checks are already green), and fix a failing required check forward. If protection itself is "
                "wrong, tell Drew; only Drew runs an admin merge, from his own terminal.", None)
    if pos[:1] == ["api"] and len(pos) > 1:
        method = "GET"
        for k, a in enumerate(args):
            if a in ("-X", "--method") and k + 1 < len(args):
                method = args[k + 1].upper()
            elif a.startswith("--method="):
                method = a.split("=", 1)[1].upper()
        if re.search(r"/branches/[^/\s]+/protection|/rulesets\b", pos[1]) and method in ("PUT", "PATCH", "POST", "DELETE"):
            return ("admin-merge", "gh api write to branch protection",
                    "Changing branch protection or rulesets through `gh api` bypasses the merge gate it enforces and is "
                    "refused. Merge through protection with `gh-drew pr merge <number> --squash --auto`; if a protection "
                    "rule is wrong, tell Drew.", None)
    return None


def git_split(argv):
    """Return (global config values, -C dir, subcommand, subcommand args) for a git argv."""
    configs, cdir, i = [], None, 1
    while i < len(argv):
        a = argv[i]
        if a == "-c" and i + 1 < len(argv):
            configs.append(argv[i + 1])
            i += 2
        elif a.startswith("--config-env="):
            configs.append(a.split("=", 1)[1])
            i += 1
        elif a == "--config-env" and i + 1 < len(argv):
            configs.append(argv[i + 1])
            i += 2
        elif a == "-C" and i + 1 < len(argv):
            cdir = argv[i + 1] if cdir is None or argv[i + 1].startswith("/") else os.path.join(cdir, argv[i + 1])
            i += 2
        elif a in ("--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix") and i + 1 < len(argv):
            i += 2
        elif a.startswith("-"):
            i += 1
        else:
            return configs, cdir, a, argv[i + 1:]
    return configs, cdir, None, []


def git_dir(cmd, cdir):
    if cmd.remote:
        return cdir or cmd.cwd
    return expand_path(cdir, cmd.cwd, cmd.env) if cdir else cmd.cwd


def rule_force_push(cmd):
    if cmd.prog != "git":
        return None
    _, _, sub, args = git_split(cmd.argv)
    if sub != "push":
        return None
    hit, skip = None, False
    for a in args:
        if skip:
            skip = False
            continue
        if a.startswith("--"):
            name = a.split("=", 1)[0]
            if name in ("--force", "--force-with-lease", "--force-if-includes", "--mirror"):
                hit = name
            elif name in ("--push-option", "--repo", "--receive-pack", "--exec") and "=" not in a:
                skip = True
        elif a.startswith("-") and len(a) > 1:
            for k, ch in enumerate(a[1:]):
                if ch == "f":
                    hit = "-f"
                    break
                if ch == "o":
                    skip = k == len(a) - 2
                    break
        elif a.startswith("+") and len(a) > 1:
            hit = f"+refspec ({a})"
    if not hit:
        return None
    return ("force-push", f"git push {hit}",
            f"Force push refused (`{hit}`): it rewrites published history, and force-push needs Drew's explicit "
            "authorization. Push new commits instead: commit the fix (not --amend) and `git push origin HEAD:<branch>`; "
            "bring the base in with `git merge origin/<base>`; to start a branch over, push it under a new name. "
            "Set CC_ALLOW_FORCE_PUSH=1 only with Drew's authorization for this push: rerun it as "
            "`CC_ALLOW_FORCE_PUSH=1 git push ...` (logged).", "CC_ALLOW_FORCE_PUSH")


HOOK_SUBCOMMANDS = {"commit", "push", "merge", "pull", "rebase", "am", "cherry-pick", "revert"}
TEMP_ROOTS = ("/tmp/", "/private/tmp/", "/var/folders/", "/private/var/folders/")


def under_temp_root(path):
    if not path:
        return False
    real = os.path.realpath(path) + "/"
    tmp = os.path.realpath(os.environ.get("TMPDIR", "/tmp")) + "/"
    return real.startswith(TEMP_ROOTS) or real.startswith(tmp)


def is_fixture_repo(cmd, directory):
    """A throwaway repo: made by `git init` in this command, or under a temp dir with no remote."""
    if cmd.ctx.git_init:
        return True
    if cmd.remote or not under_temp_root(directory):
        return False
    try:
        r = subprocess.run(["git", "-C", directory, "remote"], capture_output=True, text=True, timeout=5)
    except Exception:
        return False
    # Not a repository yet, or one with no remote: nothing it commits can reach GitHub.
    return r.returncode != 0 or not r.stdout.strip()


def same_hooks_path(cmd, cdir, value):
    """An override that names the hooks path the repo already uses changes nothing."""
    if re.match(r"^\$\(\s*git config (?:--get )?core\.hooks[Pp]ath\b", value):
        return True  # `-c core.hooksPath="$(git config core.hooksPath)"` restates the configured path
    if cmd.remote:
        # The remote repo's config is out of reach. `.githooks` is the repo-owned hook directory
        # git-push-preflight.sh routes preflight repos to, so naming it is taken as restating it.
        return value == ".githooks"
    directory = git_dir(cmd, cdir)
    if not directory or not value:
        return False
    current = git_out(directory, "config", "--get", "core.hooksPath")
    top = git_out(directory, "rev-parse", "--show-toplevel")
    if not current or not top:
        return False
    resolve = lambda p: os.path.normpath(os.path.join(top, os.path.expanduser(p)))  # noqa: E731
    return resolve(current) == resolve(value)


HOOKS_FIX = ("These skip the global Git hooks (privacy denylist, secret and card scans, commit-msg trailer check). "
             "Fix what the hook reports and run the command normally. A throwaway fixture repo (under a temp dir with no "
             "remote) may set core.hooksPath=/dev/null. If a global hook is wrong, fix it in dotfiles git/hooks.")


def rule_hooks_bypass(cmd):
    if cmd.prog != "git":
        return None
    configs, cdir, sub, args = git_split(cmd.argv)
    if sub is None:
        return None
    what = None
    if sub == "commit" and "--dry-run" in args:
        return None  # a dry run runs no hooks and writes no commit
    if sub in HOOK_SUBCOMMANDS:
        overrides = [c.split("=", 1)[1] if "=" in c else "" for c in configs if c.lower().startswith("core.hookspath")]
        if overrides and not all(same_hooks_path(cmd, cdir, v) for v in overrides):
            what = "git -c core.hooksPath=..."
        elif "hookspath" in cmd.env.get("GIT_CONFIG_PARAMETERS", "").lower():
            what = "GIT_CONFIG_PARAMETERS with core.hooksPath"
        elif any(re.match(r"GIT_CONFIG_KEY_\d+$", k) and v.lower() == "core.hookspath" for k, v in cmd.env.items()):
            what = "GIT_CONFIG_KEY_n=core.hooksPath"
        elif "GIT_CONFIG_GLOBAL" in cmd.env:
            what = "GIT_CONFIG_GLOBAL (drops the global core.hooksPath)"
        elif "--no-verify" in args:
            what = f"git {sub} --no-verify"
        elif sub == "commit":
            for a in args:
                if a.startswith("-") and not a.startswith("--"):
                    for ch in a[1:]:
                        if ch == "n":
                            what = "git commit -n (--no-verify)"
                            break
                        if ch in "mFCctSu":
                            break
                if what:
                    break
        if what and is_fixture_repo(cmd, git_dir(cmd, cdir)):
            what = None
        if sub == "push" and what and what.endswith("--no-verify"):
            what = None  # git-push-preflight.sh owns push --no-verify
    elif sub == "config":
        lowered = [a.lower() for a in args]
        if "core.hookspath" in lowered:
            k = lowered.index("core.hookspath")
            value = args[k + 1] if k + 1 < len(args) else None
            unset = any(a in ("--unset", "--unset-all", "unset") for a in args)
            reading = any(a in ("--get", "--get-all", "--show-origin", "--list", "-l", "get") for a in args)
            scope_global = "--global" in args or "--system" in args
            if unset or (value is not None and not reading):
                allowed = (not unset and not scope_global and value == ".githooks") or \
                          (not unset and scope_global and value.rstrip("/").endswith("/git/hooks"))
                if not allowed and not is_fixture_repo(cmd, git_dir(cmd, cdir)):
                    what = f"git config {'--unset ' if unset else ''}core.hooksPath {value or ''}".strip()
    if not what:
        return None
    return ("hooks-bypass", what, f"`{what}` is refused. " + HOOKS_FIX, None)


STATIC_STASH = re.compile(r"^(?:stash@\{\d+\}|refs/stash(?:@\{\d+\})?|\d+|[0-9a-f]{7,40})$")


def git_out(directory, *args):
    try:
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


STASH_WHY = ("Every worktree of a repo shares one stash list, so the newest entry can be another session's "
             "work (2026-10-09: an agent popped one).")


def rule_shared_stash(cmd, payload):
    if cmd.prog != "git":
        return None
    _, cdir, sub, args = git_split(cmd.argv)
    if sub != "stash" or not args or args[0] not in ("pop", "apply", "branch"):
        return None
    action = args[0]
    pos = [a for a in args[1:] if not a.startswith("-")]
    ref = (pos[1] if len(pos) > 1 else None) if action == "branch" else (pos[0] if pos else None)
    label = f"git stash {action}"
    if not ref:
        return ("shared-stash", f"bare {label}",
                f"Bare `{label}` is refused. {STASH_WHY} Name the entry you made: find it with `git stash list`, "
                f"then `git stash {action} stash@{{N}}` in your own worktree (create one with `wt-new <repo> <branch>`). "
                "To test against the base, check the base out in a separate worktree "
                "(`git worktree add --detach <dir> origin/<base>`) instead of stashing.", None)
    if cmd.remote:
        return None
    directory = git_dir(cmd, cdir)
    toplevel = git_out(directory, "rev-parse", "--show-toplevel") if directory else None
    if not toplevel:
        return ("shared-stash", f"{label} in an unresolved checkout",
                f"`{label} {ref}` is refused because the checkout it runs in cannot be resolved from the command. "
                f"{STASH_WHY} cd to the literal path of your own worktree first.", None)
    session = payload.get("session_id") or os.environ.get("CLAUDE_CODE_SESSION_ID") or ""
    own = "/_wt/" in toplevel + "/" and (
        (session and worktree_owner(toplevel) == session) or session_created(toplevel, payload))
    if not own:
        return ("shared-stash", f"{label} outside this session's worktree",
                f"`{label} {ref}` is refused: {toplevel} is not a _wt worktree this session created (no .wt-owner naming "
                f"this session, and no `git worktree add` for it in this session's transcripts). {STASH_WHY} Leave the "
                "stash in place and recreate your change in your own worktree (`wt-new <repo> <branch>`), or ask Drew.", None)
    if STATIC_STASH.match(ref):
        target = f"stash@{{{ref}}}" if ref.isdigit() else ref
        subject = git_out(toplevel, "log", "-1", "--format=%s", target)
        current = git_out(toplevel, "symbolic-ref", "--short", "-q", "HEAD") or "(no branch)"
        m = re.match(r"^(?:WIP on|On) (.+?): ", subject or "")
        if m and m.group(1) != current:
            return ("shared-stash", f"{label} of another branch's entry",
                    f"`{label} {ref}` is refused: that entry was made on branch {m.group(1)}, and this worktree is on "
                    f"{current}, so it is probably another session's. {STASH_WHY} Pick your own entry from "
                    "`git stash list`.", None)
    return None


def is_mac():
    return (os.environ.get("CC_GUARD_UNAME") or platform.system()) == "Darwin"


def test_files(args, cmd):
    """Count the arguments that select specific test files (not directories or the whole suite).

    A variable (`$f`, `$(...)`) counts as one file: the command names its selection, which is
    what `for f in ...; do vitest run $f; done` loops do.
    """
    count, skip = 0, False
    value_opts = {"-t", "--testNamePattern", "--project", "-c", "--config", "-r", "--root", "--dir", "--reporter",
                  "--outputFile", "--pool", "--environment", "--testTimeout", "--hookTimeout", "--shard", "--maxWorkers",
                  "--minWorkers", "--mode", "--exclude", "--include", "--retry", "--bail", "--maxConcurrency",
                  "--test-name-pattern", "--grep", "-g", "--filter", "-F", "--workers", "-j"}
    for k, a in enumerate(args):
        if skip:
            skip = False
            continue
        if a == "--":
            continue
        if a.startswith("-"):
            skip = a in value_opts
            # `--dir <scratch dir>` runs only the tests written there, not the repo's suite.
            if a == "--dir" and k + 1 < len(args) and under_temp_root(expand_path(args[k + 1], cmd.cwd, cmd.env)):
                count += 1
            continue
        if "$" in a or re.search(r"[._](?:test|spec)\.|\.(?:c|m)?[jt]sx?$|\.py$", a):
            count += 1
        elif "/" in a and not a.endswith("/"):
            path = expand_path(a, cmd.cwd, cmd.env)
            if not (path and os.path.isdir(path)):
                count += 1
    return count


def selects_few_tests(args, cmd):
    return 1 <= test_files(args, cmd) <= MAX_TEST_FILES


MAX_TEST_FILES = 3
INSTALL = {"install", "i", "add", "update", "up", "upgrade", "dedupe", "fetch", "rebuild", "rb", "ci", "install-test", "it"}
TURBO_META = {"login", "logout", "link", "unlink", "prune", "gen", "generate", "daemon", "ls", "query", "info",
              "telemetry", "scan", "bin", "completion", "boundaries", "devtools"}


def classify_vitest(args, cmd):
    sub = args[0] if args and args[0] in ("run", "watch", "dev", "related", "bench", "list", "typecheck", "init") else None
    if sub in ("related", "init"):
        return None
    return None if selects_few_tests(args[1:] if sub else args, cmd) else "whole-suite vitest run"


def classify_turbo(args):
    pos = [a for a in args if not a.startswith("-")]
    if not pos or pos[0] in TURBO_META:
        return None
    return "turbo run"


def classify_script(name, args, cmd):
    if name == "test" or name.startswith("test:") or name in ("t", "tst"):
        return None if selects_few_tests(args, cmd) else "whole-suite test run"
    if name == "build" or name.startswith("build:"):
        return "build"
    if name == "signoff" or name.startswith("signoff:"):
        return "signoff"
    return None


def in_scratch_dir(cmd):
    """A package.json made in this command, or a working directory under a temp root."""
    return cmd.ctx.scratch_package or under_temp_root(cmd.cwd)


def classify_pm(prog, args, cmd):
    """pnpm / npm / yarn / bun: install, build, test, signoff, or exec of vitest/turbo."""
    value_opts = {"-C", "--dir", "--filter", "-F", "--filter-prod", "--reporter", "--workspace-concurrency",
                  "--loglevel", "--prefix", "--workspace", "--cwd"}
    if prog != "pnpm":
        value_opts.add("-w")  # pnpm's -w is the workspace-root flag; npm's names a workspace
    i = 0
    while i < len(args):
        a = args[i]
        if a in value_opts:
            i += 2
        elif a.startswith("-"):
            i += 1
        else:
            break
    if i >= len(args):
        return None
    sub, rest = args[i], args[i + 1:]
    if sub in INSTALL:
        if any(a in ("--lockfile-only", "--package-lock-only", "-g", "--global") for a in args):
            return None
        # Probing a published package: named packages into a scratch directory.
        named = [a for a in rest if not a.startswith("-")]
        if sub in ("install", "i", "add") and named and in_scratch_dir(cmd):
            return None
        return "install"
    if sub in ("run", "run-script"):
        return classify_script(rest[0], rest[1:], cmd) if rest else None
    if sub in ("exec", "x", "dlx"):
        k = 0
        while k < len(rest) and rest[k].startswith("-"):
            k += 1
        return classify_tool(rest[k:], cmd) if k < len(rest) else None
    if sub in ("vitest", "turbo"):
        return classify_tool([sub] + rest, cmd)
    return classify_script(sub, rest, cmd)


def classify_tool(argv, cmd):
    prog = os.path.basename(argv[0])
    args = argv[1:]
    if prog == "vitest":
        return classify_vitest(args, cmd)
    if prog == "turbo":
        return classify_turbo(args)
    if prog in ("pnpm", "npm", "yarn", "bun"):
        return classify_pm(prog, args, cmd)
    if prog == "npx":
        k = 0
        while k < len(args) and args[k].startswith("-"):
            k += 2 if args[k] in ("-p", "--package") else 1
        return classify_tool(args[k:], cmd) if k < len(args) else None
    if prog in ("docker", "docker-compose"):
        return classify_docker(prog, args)
    return None


def classify_docker(prog, args):
    pos, i = [], 0
    remote = False
    while i < len(args):
        a = args[i]
        if a in ("--context", "-c", "-H", "--host"):
            remote = remote or (i + 1 < len(args) and args[i + 1] not in ("default", "desktop-linux", "colima"))
            i += 2
            continue
        if a in ("-f", "--file", "-p", "--project-name", "--profile", "--env-file", "--project-directory", "--log-level", "--config"):
            i += 2
            continue
        if not a.startswith("-"):
            pos.append(a)
        i += 1
    if remote:
        return None
    if prog == "docker-compose":
        pos = ["compose"] + pos
    if pos[:1] == ["build"] or pos[:2] in (["buildx", "build"], ["buildx", "bake"], ["image", "build"], ["builder", "build"],
                                           ["compose", "build"]):
        return "image build"
    if pos[:2] == ["compose", "up"] and "--build" in args:
        return "image build"
    return None


def rule_mac_build(cmd):
    if cmd.remote or not is_mac() or not cmd.argv:
        return None
    docker_host = cmd.env.get("DOCKER_HOST") or os.environ.get("DOCKER_HOST") or ""
    if docker_host.startswith(("ssh://", "tcp://")) and cmd.prog in ("docker", "docker-compose"):
        return None
    kind = classify_tool(cmd.argv, cmd)
    if not kind:
        return None
    shown = " ".join(cmd.argv)[:80]
    return ("mac-build", f"{kind} on the Mac",
            f"`{shown}` is a {kind}, and this is the Mac: 10 cores, and agents' installs, builds and full test runs drove "
            "its load to 120. Run it on a Beelink: push, then `ssh gtr 'beelink-gate beelink2 <repo-url> <full-sha> -- "
            "<command>'` (the gate does the frozen install; gtr itself refuses installs into its worktrees), or "
            "`ssh beelink1-wsl 'cd ~/code/<repo> && <command>'` (beelink2-wsl when beelink1 is busy). Single test files stay local: "
            f"`pnpm exec vitest run path/to/file.test.ts` (up to {MAX_TEST_FILES} files). "
            "Set CC_ALLOW_MAC_BUILD=1 only with Drew's authorization for this run.", "CC_ALLOW_MAC_BUILD")


# ---------------------------------------------------------------------------------------

def evaluate(payload):
    """Return a list of (rule, summary, reason, override, bypassed) findings for a PreToolUse payload."""
    if payload.get("tool_name") not in (None, "Bash"):
        return []
    command = (payload.get("tool_input") or {}).get("command") or ""
    if not command:
        return []
    cwd = payload.get("cwd") or None
    findings, seen = [], set()
    for cmd in commands(command, cwd):
        for hit in (rule_admin_merge(cmd), rule_force_push(cmd), rule_hooks_bypass(cmd),
                    rule_shared_stash(cmd, payload), rule_mac_build(cmd)):
            if not hit or hit[:2] in seen:
                continue
            seen.add(hit[:2])
            rule, summary, reason, override = hit
            if cmd.origin:
                summary += f" (in {cmd.origin})"
                reason = f"The script {cmd.origin}, which this command runs, contains it. " + reason
            findings.append((rule, summary, reason, override, bool(override and flag_on(cmd, override))))
    return findings


def log(kind, rule, payload):
    try:
        os.makedirs(os.path.dirname(LOG), exist_ok=True)
        command = redact((payload.get("tool_input") or {}).get("command") or "").replace("\n", " ")[:400]
        now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        with open(LOG, "a") as fh:
            fh.write(f"{now} {kind} rule={rule} session={payload.get('session_id') or '-'} "
                     f"cwd={payload.get('cwd') or '-'} command={json.dumps(command)}\n")
    except OSError:
        pass


def main():
    try:
        payload = json.loads(sys.stdin.read())
        findings = evaluate(payload)
    except Exception:
        return 0
    denied = [f for f in findings if not f[4]]
    bypassed = [f for f in findings if f[4]]
    for rule, *_ in bypassed:
        log("BYPASS", rule, payload)
    if denied:
        for rule, *_ in denied:
            log("DENY", rule, payload)
        reason = "\n\n".join(f"process-guard ({rule}): {reason}" for rule, _, reason, _, _ in denied)
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                                                 "permissionDecisionReason": reason}}))
    elif bypassed:
        names = ", ".join(f"{summary} via {override}=1" for _, summary, _, override, _ in bypassed)
        print(json.dumps({"systemMessage": f"process-guard: allowed {names}; logged to {LOG}."}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
