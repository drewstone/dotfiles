#!/usr/bin/env python3
"""PreToolUse(Bash) guard for the process rules that agent briefs kept failing to hold.

Each rule below replays a command agents actually ran while their briefs said not to:

  admin-merge   `gh pr merge ... --admin` (or through a `gh-<name>` wrapper), and branch-protection
                writes through `gh api`. Both bypass the repository's merge protection.
  raw-gh        GitHub reached around the operator's gh wrapper (merge_check's `gh`), as an agent replayed a merge it refused: a word
                naming a gh other than the shim (first gh on PATH, a script) outside path probes and --version/help; `command -p`,
                `env -i` or a PATH whose first gh is not the shim; `which -a gh`; a `raw_gh` variable; `gh auth token`; `dotenvx get`
                of a `github_tokens` name; curl/wget/httpie/python/node sending api.github.com a token or write. No override; `raw_gh_instead`: what to run.
  force-push    `git push -f`, `--force-with-lease`, `+refspec`, mostly to amend an agent's own fresh branch.
                AGENTS.md: it needs the owner's explicit authorization. The command (or the owner, session-wide) sets CC_ALLOW_FORCE_PUSH=1.
  hooks-bypass  `git -c core.hooksPath=/dev/null commit`, `-c core.hooksPath=.husky commit`,
                `commit --no-verify`, GIT_CONFIG_* overrides and `git config core.hooksPath` skip the global privacy,
                secret and commit-msg hooks. A throwaway fixture repo (under a temp dir with no remote, or created by
                `git init` in the same command) may still set core.hooksPath, as the global hooks document.
  shared-stash  bare `git stash pop` / `apply`. Every worktree of a repo shares one stash list, so the newest entry can be
                another session's. A named entry must come from a `_wt` worktree this session created
                (wt-new's .wt-owner, or a `git worktree add` in its transcripts) and its branch. Passes: a bare pop of the entry
                the same command pushed in a one-worktree checkout; `git stash apply ${s:?}` of `s=$(git stash create)`.
  mac-build     whole-repo installs, builds, test runs, turbo runs, image builds and signoff on a Mac whose
                guard-config sets `mac_build` (the refusal's hint). Single test files stay local. Allowed when
                the command sets CC_ALLOW_MAC_BUILD=1. no-build-host: process_guard_builds.py.
  pattern-kill  `pkill`/`killall` by pattern, and `kill` fed by `pgrep <pattern>` or `pidof` (`kill $(pgrep -f X)`, a variable,
                a for/while loop, `| xargs kill`). Over ssh the pattern also matches the ssh session's own command line.
                `pgrep -P <pid>` and `pkill -P <pid>` (not 0 or 1) stay allowed.
  broadcast-kill  `kill 0`, `kill -1`, `kill -9 -1`, `kill -- -<pgid>`: a target of 0 or a negative pid
                signals the caller's process group, a whole group or every process the user owns. Both kill
                rules: override CC_ALLOW_BROADCAST_KILL=1, set by the owner for the session (not on a command).
  prod-d1-read  an unbounded or unkeyed-aggregate SELECT against production Cloudflare D1, through `wrangler d1 execute
                --remote` or the D1 query API: one 473k-row read overloaded D1 (process_guard_d1.py).
  xtrace-secrets  shell tracing (`bash -x`, `sh -x`, `set -x`, `set -o xtrace`, BASH_XTRACEFD)
                while the traced scope loads or expands a secret: dotenvx run/get, sourcing or
                reading a .env, key, token or secrets file, a *_KEY/*_TOKEN variable set from an
                expansion or expanded in a command, `gh auth token`. A traced script is read (a remote one over ssh,
                once, 10 s timeout; unreadable means allowed).
  env-dump      printing environment VALUES into the transcript: bare `env`/`printenv`/`export -p`/`declare -x`/`set`,
                `env | grep X`, /proc/<pid>/environ, `printenv KEY` or `echo $X_TOKEN` of a secret-named variable, env written
                to a file, a python or node one-liner printing os.environ or process.env whole, and a read of a secret file
                (process_guard_secrets.py). Names (`compgen -e`, `sorted(os.environ)`, `grep -o '^(A|B)='`),
                counts (`wc`), exact non-secret names (`grep '^(PORT|TMPDIR)='`, `printenv PORT`), a non-command `env` and
                `env VAR=x cmd` pass, but not `cut -d= -f1`, sed or awk: a multi-line value's later lines hold no NAME=.
                Override CC_ALLOW_ENV_DUMP=1, set by the owner for the session.
  ledger-write  a shell write (`>>`, `tee -a`, `>`) into a file matching `ledgers`, a regex, around the checked append
                `ledger_hint` names. Override: CC_ALLOW_LEDGER_WRITE=1 in the command, for a repair the owner approved.
  tail-sleep    `tail -f /dev/null` as a command, usually `read -t N < <(tail -f /dev/null)` as a sleep. Under
                the Mac's bash 3.2 the read can outlive its timeout and each poll leaks a tail. Override: CC_ALLOW_TAIL_SLEEP=1 on the tail command itself.
  detached-gate `<gate> ... &` (a command named in `gates`) in a foreground Bash call: the gate runs, but nothing
                wakes the caller when it ends, so its result sits unread. Launch the gate itself with
                run_in_background. Override: CC_ALLOW_DETACHED_GATE=1 on the gate command.
  refused-call  a call matching an operator rule in `refused_calls` (a purchase API, say), whose owning tool must make it instead;
                override CC_ALLOW_REFUSED_CALL=1, set by the owner for the session (process_guard_calls.py).

A wrapper's command (`sudo`, `timeout`, `npx`, `uv run`, `dotenvx run --`, `docker exec <container>`: WRAPPERS) is the command.
Commands inside `ssh host '...'`, `bash -c`, `eval`, heredocs fed to a shell and `<runner> ... -- <command>` (a command named
in `remote_runners`) are parsed too (an admin merge on another host has the same effect); the build rules skip remote
commands. So are ad-hoc scripts the command runs (`bash x.sh`, `./x.sh`, `source x.sh`, `bash -s < x.sh`, `ssh host bash -s
< x.sh`) when a heredoc in the same command wrote them or they sit under a temp root. A repository's own scripts are not
read. Operator values (hosts, commands, secret stores) come from guard-config.json's "process_guard"; absent keys: rule off.
Denials and overrides are logged to ~/.claude/logs/process-guard.log with key-shaped values
redacted. Only a payload that is not JSON passes unread (exit 0, no output); a command no rule can read is refused.
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
from secret_scan import guard_config, redact  # noqa: E402
from process_guard_waits import rule_detached_gate, rule_tail_sleep  # noqa: E402
from process_guard_secrets import SECRET_DIRS, flush_secret_read, track_secret_read  # noqa: E402
from process_guard_builds import rule_no_build_host  # noqa: E402
from process_guard_github import rule_raw_gh  # noqa: E402
from process_guard_d1 import rule_prod_d1_read  # noqa: E402
from process_guard_calls import rule_refused_call  # noqa: E402

CONFIG = guard_config("process_guard", {})
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
        self.pipe_in = False  # stdin comes from the previous segment through `|`
        self.substituted = False  # inside $( ): its stdout goes to the command holding it


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
        for s in inner:
            s.substituted = True
        out.extend(s for s in inner if s.words or s.heredocs)
        word.append("$(" + src[j:end - 1] + ")")
        return end

    def expansion(i):
        """Consume $(( )), $( ) or a backquote at i into the word: the index after it, or None."""
        if src.startswith("$((", i):
            j = src.find("))", i)
            word.append(src[i:] if j < 0 else src[i:j + 2])
            return n if j < 0 else j + 2
        if src.startswith("$(", i):
            return substitution(i + 2)
        if src[i] != "`":
            return None
        j = src.find("`", i + 1)
        out.extend(lex(src[i + 1:n if j < 0 else j]))
        word.append("$(...)")
        return n + 1 if j < 0 else j + 1

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
                elif c in "$`" and (j := expansion(i)) is not None:
                    i = j
                else:
                    word.append(c)
                    i += 1
            i += 1
            continue
        if ch in "$`" and (j := expansion(i)) is not None:
            i, started = j, True
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
        if ch == "|" and not src.startswith("||", i) and not (i and src[i - 1] == "|"):
            end_segment()
            seg.pipe_in = True
            i += 2 if src.startswith("|&", i) else 1
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
    def __init__(self, argv, env, ctx, seg, upstream, piped_from):
        self.argv, self.env, self.remote, self.cwd, self.ctx = argv, env, ctx.remote, ctx.cwd, ctx
        self.origin = ctx.origin  # the script file this command was read from, if any
        self.tainted = frozenset(ctx.tainted)  # taint as of this command, not the end of the script
        self.stream_tainted = upstream  # stdin carries pids from a pattern match
        self.loops = dict(ctx.loops)  # loop variables as of this command
        self.upstream = piped_from  # the argvs piped into this command
        self.prefix = seg.words[:len(seg.words) - len(argv)]  # env assignments and wrappers (sudo, env, command, xargs)
        self.via_xargs = "xargs" in self.prefix  # this command's arguments come from its stdin through xargs
        tee = [a for a in argv[1:] if not a.startswith("-")] if self.prog == "tee" else []
        self.writes = list(seg.writes) + tee  # files this command writes: redirection targets, and tee's arguments
        self.heredocs, self.inputs = seg.heredocs, seg.inputs  # heredoc and herestring bodies, and `< file` sources, fed to its stdin
        self.stashed = ctx.stashed  # this command pushed a stash before this point

    @property
    def prog(self):
        return os.path.basename(self.argv[0]) if self.argv else ""


class Context:
    """State shared by the commands of one shell: exported variables and cwd."""

    def __init__(self, cwd, remote, events=None, host=None):
        self.vars = {}
        self.cwd = cwd
        self.remote = remote
        self.host = host  # the ssh host a remote context runs on
        self.events = [] if events is None else events  # ("secret", what, traced) and ("remote-traced-script", ...)
        self.xtrace = False  # this shell prints each command with its expansions (set -x, bash -x)
        self.git_init = False
        self.scratch_package = False  # a package.json was created here (npm init, > package.json)
        self.written = {}  # path -> heredoc body written to it earlier in this command
        self.depth = 0  # nesting of scripts read from files
        self.origin = None
        self.tainted = set()  # variables holding pids from a pattern match (pgrep <pattern>, pidof)
        self.stream_tainted = False  # the previous pipeline stage emits such pids
        self.loops = {}  # loop variable -> ("words", words, cwd, vars) or ("chain", upstream argvs, cwd, vars)
        self.chain = []  # argvs of the pipeline so far, for what feeds `xargs` or `while read`
        self.env_pending = None  # an env dump upstream in this pipeline, cleared by a names-only stage
        self.secret_pending = None  # a secret file's bytes still flowing, see process_guard_secrets
        self.stashed = False  # a `git stash` / `stash push` ran earlier in this command


# Programs that run the command after their options, here, in a container or on a pod: the words they take first (a duration,
# profile, container or pod) and their options that take a value. `--` ends their options; `command -v` looks a name up.
WRAPPERS = {"env": (0, "-u -C -S"), "command": (0, ""), "exec": (0, "-a"), "setsid": (0, ""), "stdbuf": (0, "-i -o -e"),
            "watch": (0, "-n"), "sudo": (0, "-u -g -C -D -h -p -R -T -U"), "nice": (0, "-n"), "timeout": (1, "-s -k"),
            "rtk proxy": (0, ""), "rtk": (0, ""), "xargs": (0, "-I -n -P -L -s -E -d"), "npx": (0, "-p --package"),
            "uv run": (0, "--with -p --python --project --directory --package --env-file"), "poetry run": (0, "-C -P --directory"),
            "dotenvx run": (0, "-f -fk --env-file --env-keys-file -e --env"), "op run": (0, "--env-file"), "doppler run": (0, "-p -c"),
            "infisical run": (0, "--env --path"), "aws-vault exec": (1, "-d --duration --region"),
            "docker exec": (1, "-e -u -w --env --env-file --user --workdir"), "docker compose exec": (1, "-e -u -w --env --user --workdir"),
            "kubectl exec": (1, "-n -c --namespace --container --context")}


def strip_prefix(words):
    env, i = {}, 0
    while i < len(words):
        w = words[i]
        m = ASSIGN.match(w)
        name = next((n for n in WRAPPERS if [os.path.basename(w)] + words[i + 1:i + len(n.split())] == n.split()), None)
        if m:
            env[m.group(1)] = m.group(2)
            i += 1
        elif w in KEYWORDS or w in ("nohup", "time", "builtin", "caffeinate", "noglob"):
            i += 1
        elif name:
            (before, values), i = WRAPPERS[name], i + len(name.split())
            while i < len(words) and words[i] != "--" and (words[i][:1] == "-" or before) and not (
                    name == "command" and words[i] in ("-v", "-V")):
                before -= words[i][:1] != "-"
                i += 2 if words[i] in values.split() else 1
            i += words[i:i + 1] == ["--"]
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


def ssh_target(args):
    """Return (host, remote command words) of an ssh invocation."""
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
                        i += 1
                    break
            i += 1
            continue
        break
    return (args[i], args[i + 1:]) if i < len(args) else (None, [])



PGREP_VALUE = {"-P", "--parent", "-u", "--euid", "-U", "--uid", "-g", "--pgroup", "-G", "--group", "-s",
               "--session", "-t", "--terminal", "-F", "--pidfile", "-d", "--delimiter", "--ns", "--nslist",
               "-r", "--runstates", "--signal"}


def references(text, names):
    return any(m.group(1) in names or m.group(2) in names for m in VAR.finditer(text))


def pattern_pids(argv, tainted):
    """The pattern (or True) when argv selects pids by one: `pgrep <pattern>`, `pgrep -u <user>`, `pidof <name>`, or `pgrep -P`
    of 0, 1 (every orphan: Slack, postgres) or a parent found that way. `pgrep -P <pid>` and `-F <pidfile>` select exactly."""
    if not argv:
        return False
    prog = os.path.basename(argv[0])
    if prog == "pidof":
        return True
    if prog != "pgrep":
        return False
    exact, i = False, 1
    while i < len(argv):
        a = argv[i]
        name = a.split("=", 1)[0]
        if name in PGREP_VALUE:
            value = a.split("=", 1)[1] if "=" in a else (argv[i + 1] if i + 1 < len(argv) else "")
            if name in ("-P", "--parent", "-F", "--pidfile"):
                if references(value, tainted) or "$(" in value or {"0", "1"} & set(value.split(",")):
                    return True
                exact = True
            i += 1 if "=" in a else 2
            continue
        if a.startswith("-"):
            i += 1
            continue
        return a or True  # a pattern
    return not exact


def pattern_source(text, tainted):
    """True when a word's value comes from a pattern match: a substitution running one, or a
    variable that holds one's output."""
    if references(text, tainted):
        return True
    if "$(" not in text and "`" not in text:
        return False
    for seg in lex(text):
        _, argv = strip_prefix(seg.words)
        if pattern_pids(argv, tainted):
            return True
    return False


SECRET_NAME = re.compile(r"(?:^|_)(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PAT|CREDENTIALS?)$", re.I)
SECRET_PATH = re.compile(r"(?:^|/)(?:\.env(?:\.[\w-]+)*|[\w.-]+\.env|\.envrc|[\w.-]+\.(?:key|pem|p12)|credentials(?:\.json)?"
                         r"|[\w.-]*tokens?(?:\.json|\.txt)?|secrets?(?:\.\w+)?)$|/secrets/|/job-keys/", re.I)
NOT_SECRET_PATH = re.compile(r"example|sample|template|\.pub$", re.I)
READERS = {"cat", "head", "tail", "less", "more", "base64", "tr", "xxd", "od", "strings", "jq", "sed", "awk", "grep"}
SECRET_PRINTERS = CONFIG.get("secret_printers", {})  # "<prog> <subcommand>" -> the option that writes it to a file instead
GH = re.compile(r"gh(?:-[\w.-]+)?$")  # gh, or a gh-<name> wrapper that runs it as another identity
MERGE_GH = guard_config("merge_check", {}).get("gh") or "gh"  # the gh the operator merges with


def secret_path(word):
    return bool(SECRET_PATH.search(word)) and not NOT_SECRET_PATH.search(word)


def secret_load(argv):
    """What in this command reads or prints a secret, or None."""
    prog = os.path.basename(argv[0])
    args = argv[1:]
    pos = [a for a in args if not a.startswith("-")]
    if prog == "dotenvx" and pos[:1] and pos[0] in ("run", "get", "decrypt"):
        return f"dotenvx {pos[0]}"
    if prog in ("source", ".") and pos and secret_path(pos[0]):
        return f"{prog} {pos[0]}"
    if prog in READERS and any(secret_path(a) for a in pos):
        return f"{prog} {next(a for a in pos if secret_path(a))}"
    if GH.match(prog) and pos[:2] == ["auth", "token"]:
        return f"{prog} auth token"
    printer = " ".join([prog] + pos[:1])
    if printer in SECRET_PRINTERS and not (SECRET_PRINTERS[printer] and SECRET_PRINTERS[printer] in args):
        return printer
    if prog == "security" and pos[:1] and pos[0].startswith("find-") and "-w" in args:
        return f"security {pos[0]} -w"
    if prog in ("op", "pass", "vault") and pos[:1] and pos[0] in ("read", "show", "kv", "item"):
        return f"{prog} {pos[0]}"
    return None


def secret_assignment(name, value):
    """A secret-named variable set from an expansion: xtrace prints the expanded value."""
    return bool(SECRET_NAME.search(name)) and ("$" in value or "`" in value)


def secret_references(words):
    for word in words:
        for m in VAR.finditer(word):
            name = m.group(1) or m.group(2)
            if SECRET_NAME.search(name):
                return f"${name}"
    return None


def shell_xtrace(argv):
    """True when a shell is started with xtrace on (bash -x, sh -ex, bash -o xtrace)."""
    k = 1
    while k < len(argv):
        a = argv[k]
        if a in ("-o", "+o") and k + 1 < len(argv):
            if a == "-o" and argv[k + 1] == "xtrace":
                return True
            k += 2
            continue
        if a.startswith("-") and a not in ("-", "--") and not a.startswith("--"):
            if "x" in a[1:]:
                return True
            k += 1
            continue
        break
    return False


def set_xtrace(argv):
    """The xtrace state a `set` command leaves: True, False, or None when it does not change it."""
    state, args = None, argv[1:]
    for k, a in enumerate(args):
        if a == "--":
            break
        if a in ("-o", "+o") and k + 1 < len(args) and args[k + 1] == "xtrace":
            state = a == "-o"
        elif len(a) > 1 and a[0] in "-+" and a[1] != "-" and "x" in a[1:]:
            state = a[0] == "-"
    return state


def note(ctx, what):
    ctx.events.append(("secret", what, ctx.xtrace))


def read_local(path, cwd, env):
    resolved = expand_path(path, cwd, env)
    if not resolved:
        return None
    try:
        if os.path.getsize(resolved) > SCRIPT_LIMIT:
            return None
        with open(resolved, "rb") as fh:
            data = fh.read()
    except OSError:
        return None
    return None if b"\0" in data else data.decode("utf-8", "replace")


def remote_quote(path):
    if path in ("~", "$HOME"):
        return '"$HOME"'
    for prefix in ("~/", "$HOME/", "${HOME}/"):
        if path.startswith(prefix):
            return '"$HOME"/' + shlex.quote(path[len(prefix):])
    return shlex.quote(path)


def fetch_remote(host, cwd, path):
    """A remote script's text, read over ssh, or None (no fetch, failure, timeout)."""
    if os.environ.get("CC_GUARD_NO_REMOTE_FETCH") == "1" or not host or "$" in path.replace("$HOME", ""):
        return None
    remote = (f"cd {remote_quote(cwd)} 2>/dev/null; " if cwd and "$" not in cwd.replace("$HOME", "") else "") + \
        f"head -c {SCRIPT_LIMIT} -- {remote_quote(path)}"
    ssh = os.environ.get("CC_GUARD_SSH", "ssh")
    try:
        r = subprocess.run([ssh, "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", host, remote],
                           capture_output=True, timeout=10)
    except Exception:
        return None
    if r.returncode != 0 or b"\0" in r.stdout:
        return None
    return r.stdout.decode("utf-8", "replace")


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
    return read_local(resolved, None, env) if under_temp_root(resolved) else None  # None for a binary too


def nested(text, cwd, remote, ctx, origin):
    ctx.depth += 1
    outer, ctx.origin = ctx.origin, origin
    try:
        return commands(text, cwd, remote, ctx)
    finally:
        ctx.depth -= 1
        ctx.origin = outer


ENV_SECRET_VAR = re.compile(r"^(?!.*(?:_FILE|_PATH|_DIR|_SOCK|NAME)$).*(?:KEY|TOKEN|SECRET|PASSW|CREDENTIAL|AUTH|COOKIE)", re.I)
PROC_ENVIRON = re.compile(r"/proc/[^\s/]+/environ")
ENV_PASSTHROUGH = {"grep", "egrep", "fgrep", "rg", "sort", "uniq", "head", "tail", "tr", "cat", "column"}
NAMED_ENV = re.compile(r"(?:sorted|list|len|set|keys)\(\s*(?:os\.environ|process\.env)\s*\)|\bin\s+(?:os\.environ|process\.env)"
                       r"\b(?!\s*[.\[])|(?:os\.environ|process\.env)\s*(?:\[\s*[\"']|\.get\(\s*[\"']|\.keys\(\))|process\.env\.\w")


def env_dump(seg, argv):
    """What in this pipeline stage prints environment values, or None."""
    words = seg.words
    for w in list(words) + list(getattr(seg, "inputs", [])):  # a path word, not prose that names one
        if PROC_ENVIRON.fullmatch(w) and not env_names_only(argv):
            return shlex.join(argv) + "".join(" < " + i for i in seg.inputs) if argv else f"read of {w}"
    # `env` as the command (consumed by strip_prefix, or argv[0]) with none of its own prints everything.
    k = next((i for i, w in enumerate(words[:len(words) - len(argv)]) if os.path.basename(w) == "env" and "=" not in w),
             len(words) - len(argv) if argv and os.path.basename(argv[0]) == "env" else None)
    if k is not None:
        rest, j = words[k + 1:], 0
        while j < len(rest):
            if rest[j] in ("-u", "-C", "-S", "--unset", "--chdir", "--split-string"):
                j += 2
            elif rest[j].startswith("-") or ASSIGN.match(rest[j]):
                j += 1
            else:
                break
        if j >= len(rest):
            return "env"
    if not argv:
        return None
    prog = os.path.basename(argv[0])
    args = argv[1:]
    names = [a for a in args if not a.startswith("-")]
    if prog == "printenv":
        if not names:
            return "printenv"
        secret = [n for n in names if ENV_SECRET_VAR.search(n)]
        return f"printenv {secret[0]}" if secret else None
    if prog in ("export", "declare", "typeset") and not names and all(
            re.match(r"^-[a-zA-Z]*[px][a-zA-Z]*$", a) for a in args):
        return f"{prog} {' '.join(args)}".strip()
    if prog == "set" and not args:
        return "set with no arguments"
    code = " ".join(args + seg.heredocs)  # a python or node program that prints the whole environment rather than named keys
    if re.fullmatch(r"python[\d.]*|node|bun", prog) and re.search(r"\b(?:print|pprint|console|stdout|stderr)\b|(?:^| )-p ", code) and (
            re.search(r"\b(?:os\.environ|process\.env)\b", NAMED_ENV.sub("", code))):
        return f"{prog} printing the environment"
    if prog in ("echo", "printf", "print"):
        for a in args:  # a $( ) in the argument runs, and is checked, as its own command
            for m in VAR.finditer(re.sub(r"\$\((?:[^()]|\([^()]*\))*\)", "", a)):
                name = m.group(1) or m.group(2)
                if ENV_SECRET_VAR.search(name):
                    return f"{prog} ${name}"
    return None


def env_names_only(argv):
    """A pipeline stage that prints no value: a count, a fingerprint or a grep for names. A multi-line value's later lines
    hold no NAME=, so a filter that keeps the text before `=` (cut -d= -f1, sed 's/=.*//', awk -F=) prints them whole."""
    prog, args = (os.path.basename(argv[0]), argv[1:]) if argv else ("", [])
    flags = "".join(a[1:] for a in args if re.match(r"^-[a-zA-Z]+$", a))
    pat = "|".join(b for a, b in zip(args, args[1:]) if a == "-e") or next((a for a in args if a[:1] != "-"), "")
    if prog in ("grep", "egrep", "rg"):  # counts, file names, -o of an anchored name pattern, or exact non-secret names
        alts = re.fullmatch(r"\^\(([\w|]+)\)=", pat)  # ^(A|B)= or ^A=|^B=
        alts = alts.group(1).split("|") if alts else [a[1:-1] for a in pat.split("|") if re.fullmatch(r"\^\w+=", a)]
        exact = "v" not in flags and len(alts) == pat.count("|") + 1 and not any(ENV_SECRET_VAR.search(a) for a in alts)
        stops = all(b[:1] == "^" for b in re.split(r"\|(?![^()]*\))", pat.replace("\\", ""))) and all(  # each branch ends at =
            re.fullmatch(r"(?:A-Z|a-z|0-9|\w)+", c) for c in re.findall(r"\[([^]]*)\]", pat)) and not re.search(r"\.|\\[^()|]|=[^|)]", pat)
        return bool(re.search(r"[clLq]", flags)) or exact or ("o" in flags and stops)
    return prog in ("wc", "sha256sum", "shasum", "sha1sum", "md5sum", "b2sum", "b3sum")  # a count or a fingerprint


def env_dump_flush(ctx):
    if ctx.env_pending:
        ctx.events.append(("env-dump", ctx.env_pending))
        ctx.env_pending = None


def commands(src, cwd, remote=False, ctx=None):
    """Flatten a shell command into Command objects, descending into nested shells."""
    ctx = ctx or Context(cwd, remote)
    result = []
    for seg in lex(src):
        upstream = ctx.stream_tainted if seg.pipe_in else False
        lead = [w for w in seg.words if w not in ("do", "then", "else", "{", "!", "(")]
        if len(lead) >= 3 and lead[0] == "for" and lead[2] == "in":
            if any(pattern_source(w, ctx.tainted) for w in lead[3:]):
                ctx.tainted.add(lead[1])
            else:
                ctx.tainted.discard(lead[1])
        elif len(lead) >= 2 and lead[0] == "while" and lead[1] == "read":
            names = [w for w in lead[2:] if not w.startswith("-") and re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", w)]
            for name in names:
                (ctx.tainted.add if upstream else ctx.tainted.discard)(name)
            if names and seg.pipe_in:
                ctx.loops[names[0]] = ("chain", list(ctx.chain), ctx.cwd, dict(ctx.vars))
        if len(lead) >= 3 and lead[0] == "for" and lead[2] == "in":
            ctx.loops[lead[1]] = ("words", lead[3:], ctx.cwd, dict(ctx.vars))
        env, argv = strip_prefix(seg.words)
        out = [w for w in seg.writes if w != "/dev/null" and not w.isdigit()]  # `2>/dev/null`, `2>&1` write no file
        if ctx.env_pending and seg.pipe_in and argv and not out and env_names_only(argv):
            ctx.env_pending = None
        elif ctx.env_pending and seg.pipe_in and argv and not out and os.path.basename(argv[0]) in ENV_PASSTHROUGH:
            ctx.env_pending += " | " + shlex.join(argv)
        elif ctx.env_pending:
            env_dump_flush(ctx)
        dumped = env_dump(seg, argv)
        if dumped:
            env_dump_flush(ctx)
            ctx.env_pending = dumped + (" > " + out[0] if out else "")
            if out:
                env_dump_flush(ctx)
        piped_from = list(ctx.chain) if seg.pipe_in else []
        track_secret_read(ctx, seg, argv)
        ctx.chain = (piped_from + [argv]) if argv else []
        for name, value in env.items():
            (ctx.tainted.add if pattern_source(value, ctx.tainted) else ctx.tainted.discard)(name)
            if name == "BASH_XTRACEFD" or (name == "SHELLOPTS" and "xtrace" in value):
                ctx.xtrace = True
            if secret_assignment(name, value):
                note(ctx, f"{name}={value[:40]}")
        ctx.stream_tainted = bool(argv) and (pattern_pids(argv, ctx.tainted) or (
            upstream and os.path.basename(argv[0]) in ("grep", "egrep", "head", "tail", "awk", "sort", "uniq", "cut", "tr", "sed", "cat")))
        if not argv:
            ctx.vars.update(env)
            continue
        prog = os.path.basename(argv[0])
        if prog in ("export", "declare", "typeset", "local", "readonly"):
            for w in argv[1:]:
                m = ASSIGN.match(w)
                if m:
                    ctx.vars[m.group(1)] = m.group(2)
                    (ctx.tainted.add if pattern_source(m.group(2), ctx.tainted) else ctx.tainted.discard)(m.group(1))
                    if secret_assignment(m.group(1), m.group(2)):
                        note(ctx, f"{prog} {m.group(1)}={m.group(2)[:40]}")
            continue
        merged = dict(ctx.vars)
        merged.update(env)
        cmd = Command(argv, merged, ctx, seg, upstream, piped_from)
        result.append(cmd)
        g = git_split(argv) if prog == "git" else None
        ctx.stashed |= bool(g and g[2] == "stash" and next((a for a in g[3] if a[:1] != "-"), "push") in ("push", "save"))
        loaded = next(filter(None, map(secret_load, (seg.words[k:] for k in range(len(cmd.prefix) + 1)))), None) or (  # dotenvx run --
            secret_references(argv[1:]) if ctx.xtrace else None)
        if loaded:
            note(ctx, loaded)
        if prog == "set":
            state = set_xtrace(argv)
            if state is not None:
                ctx.xtrace = state
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
                traced = ctx.xtrace
                if prog not in ("source", "."):
                    ctx.xtrace = False  # a child shell starts untraced
                result.extend(nested(body, ctx.cwd, ctx.remote, ctx, script_path))
                if prog not in ("source", "."):
                    ctx.xtrace = traced
        # Nested shells.
        if prog in SHELLS or prog == "script":  # `script -qc '<command>' /dev/null` runs its -c string like a shell
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
            traced, ctx.xtrace = ctx.xtrace, shell_xtrace(argv)  # a child shell traces only with -x
            if script is not None:
                result.extend(commands(script, ctx.cwd, ctx.remote, ctx))
            elif noexec:
                pass
            elif positional:  # `bash script.sh`: read an ad-hoc script file
                body = script_text(argv[k], ctx.cwd, merged, ctx)
                if body is not None:
                    result.extend(nested(body, ctx.cwd, ctx.remote, ctx, argv[k]))
                elif ctx.xtrace and ctx.remote:
                    ctx.events.append(("remote-traced-script", ctx.host, ctx.cwd, argv[k]))
                elif ctx.xtrace:
                    text = ctx.written.get(expand_path(argv[k], ctx.cwd, merged) or "") or read_local(argv[k], ctx.cwd, merged)
                    if text is not None:  # any traced script, repository scripts included, for secrets only
                        scan = Context(ctx.cwd, False, events=ctx.events)
                        scan.vars.update(merged)
                        scan.xtrace, scan.depth = True, ctx.depth + 1
                        if scan.depth <= SCRIPT_DEPTH:
                            commands(text, ctx.cwd, False, scan)
            else:  # `bash`, `bash -s`: the heredoc or the `< file` input is the script
                for body in seg.heredocs:
                    result.extend(commands(body, ctx.cwd, ctx.remote, ctx))
                for source in seg.inputs:
                    body = script_text(source, ctx.cwd, merged, ctx)
                    if body is not None:
                        result.extend(nested(body, ctx.cwd, ctx.remote, ctx, source))
            ctx.xtrace = traced
        elif prog == "ssh":
            host, words = ssh_target(argv[1:])
            sub = Context(None, True, events=ctx.events, host=host)
            sub.vars.update(merged)
            sub.tainted |= ctx.tainted  # `ssh host "kill $p"` expands $p before ssh runs
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
        elif prog in CONFIG.get("remote_runners", []) and "--" in argv:
            sub = Context(None, True, events=ctx.events)
            sub.vars.update(merged)
            result.extend(commands(shlex.join(argv[argv.index("--") + 1:]), None, True, sub))
    env_dump_flush(ctx)
    flush_secret_read(ctx)
    return result


# ---------------------------------------------------------------------------------------
# Rules. Each returns None, or (rule, summary, reason, override_variable or None).

SESSION_ONLY = {"CC_ALLOW_BROADCAST_KILL", "CC_ALLOW_D1_SCAN", "CC_ALLOW_REFUSED_CALL"}  # the owner sets these for a session; an agent's command cannot


def flag_on(cmd, name):
    return (name not in SESSION_ONLY and cmd.env.get(name) == "1") or os.environ.get(name) == "1"


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
    if not GH.match(cmd.prog):
        return None
    args = cmd.argv[1:]
    pos = gh_positionals(args)
    if pos[:2] == ["pr", "merge"] and any(a == "--admin" or a.startswith("--admin=") for a in args):
        return ("admin-merge", "gh pr merge --admin",
                "`gh pr merge --admin` bypasses branch protection and is refused. Merge through protection: once the local "
                f"gate passes, `{MERGE_GH} pr merge <number> --repo <owner/repo> --squash --auto` (or without --auto when "
                "the required checks are already green), and fix a failing required check forward. If protection itself is "
                "wrong, tell the owner; only the owner runs an admin merge, from their own terminal.", None)
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
                    f"refused. Merge through protection with `{MERGE_GH} pr merge <number> --squash --auto`; if a protection "
                    "rule is wrong, tell the owner.", None)
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
            f"Force push refused (`{hit}`): it rewrites published history, and force-push needs the owner's explicit "
            "authorization. Push new commits instead: commit the fix (not --amend) and `git push origin HEAD:<branch>`; "
            "bring the base in with `git merge origin/<base>`; to start a branch over, push it under a new name. "
            "Set CC_ALLOW_FORCE_PUSH=1 only with the owner's authorization for this push: rerun it as "
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


STASH_WHY = "Every worktree of a repo shares one stash list, so the newest entry can be another session's work."


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
                f"runs in cannot be resolved from the command. {STASH_WHY} cd to the literal path of your own worktree first.", None)
    session = payload.get("session_id") or os.environ.get("CLAUDE_CODE_SESSION_ID") or ""
    own = "/_wt/" in toplevel + "/" and (
        (session and worktree_owner(toplevel) == session) or session_created(toplevel, payload))
    if not own:
        return ("shared-stash", f"{label} outside this session's worktree", f"`{label} {ref}` is refused: {toplevel} is not "
                "a _wt worktree this session created (no .wt-owner or `git worktree add` for it in this session's transcripts). "
                f"{STASH_WHY} Copy the entry and leave it listed (`git stash show -p {ref} | git apply`), or use `wt-new`.", None)
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


KILL_OVERRIDE = "CC_ALLOW_BROADCAST_KILL"
EXACT_PID = ("Run `{}` on its own, read the command lines, then `kill <pid>` the ones you started. Keep a pid when you "
             "start a process (`cmd >log 2>&1 & echo $! >pidfile`, later `kill $(cat pidfile)`); a port's listener is "
             "`kill $(lsof -tiTCP:<port> -sTCP:LISTEN)`, a pid's children `pkill -P <pid>`. "
             f"User override: {KILL_OVERRIDE}=1 (session-wide, set by the owner).")


def kill_targets(args):
    """The targets of `kill <args>`, or None when it sends no signal (-l, -L, -0, -s 0, -n 0).
    The first dash argument is the signal; a dash argument after it is a target (a negative pid)."""
    signal, i = False, 0
    while i < len(args):
        a = args[i]
        if a in ("-l", "-L"):
            return None
        if a in ("-s", "-n"):
            if i + 1 < len(args) and args[i + 1] == "0":
                return None
            signal, i = True, i + 2
            continue
        if a == "--":
            return args[i + 1:]
        if a.startswith("-") and len(a) > 1 and not signal:
            if a == "-0":
                return None  # a liveness check sends no signal
            signal, i = True, i + 1
            continue
        return args[i:]
    return []


def rule_kill(cmd):
    """pkill and killall; kill of 0, -1 or a process group; kill fed by pgrep <pattern> or pidof through
    $(...), a variable, a for/while loop or xargs. Commands run over ssh or in nested shells are included."""
    if cmd.prog in ("pkill", "killall"):
        pattern = pattern_pids(["pgrep", *cmd.argv[1:]], cmd.tainted)
        if cmd.prog == "pkill" and not pattern:
            return None  # only -P <pid> or -F <pidfile>: the pids `kill $(pgrep -P <pid>)` may already signal
        p = pattern if isinstance(pattern, str) else "<pattern>"
        line = "pgrep -af " + shlex.quote(f"[{p[0]}]{p[1:]}" if p[0].isalnum() else p)  # the bracket skips its own shell
        line = f"ssh {cmd.ctx.host} " + (shlex.quote(line) if re.search(r'["$`\\]', line) else f'"{line}"') if cmd.remote and cmd.ctx.host else line
        return ("pattern-kill", cmd.prog, f"`{cmd.prog}` selects by name or pattern, which also matches other sessions' "
                "processes and, over ssh, this command's own shell. " + EXACT_PID.format(line), KILL_OVERRIDE)
    if cmd.prog != "kill":
        return None
    targets = kill_targets(cmd.argv[1:])
    if targets is None:
        return None
    group = next((t for t in targets if t == "0" or re.match(r"^-[\d$]", t)), None)
    if group is not None:
        scope = {"0": "the caller's own process group", "-1": "every process the user owns"}.get(group, "a whole process group")
        return ("broadcast-kill", "kill of a process group or every process", f"`kill {group}` signals {scope}, which on a "
                "shared host includes other sessions and runs. " + EXACT_PID.format("pgrep -af '<pattern>'"), KILL_OVERRIDE)
    if any(pattern_source(t, cmd.tainted) for t in targets) or (not targets and cmd.stream_tainted):
        return ("pattern-kill", "kill of pids from a pattern match", "This kill takes its pids from `pgrep <pattern>` (or "
                "pidof), and over ssh the pattern also matches the ssh session's own command line. "
                + EXACT_PID.format("pgrep -af '<pattern>'"), KILL_OVERRIDE)
    return None


LEDGER = re.compile(CONFIG["ledgers"]) if CONFIG.get("ledgers") else None


def rule_ledger_write(cmd):
    """A shell write into an append-only ledger skips its checked append (and `>` erases its history)."""
    hit = LEDGER and next((w for w in cmd.writes if LEDGER.search(w.strip("'\""))), None)
    if not hit:
        return None
    return ("ledger-write", "shell write into a ledger", f"This command writes {hit} from the shell, and a `>` would "
            f"erase its append-only history. {CONFIG.get('ledger_hint', '')} To repair a malformed line with the "
            "owner's approval, rerun with CC_ALLOW_LEDGER_WRITE=1 (logged).", "CC_ALLOW_LEDGER_WRITE")


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
    docker_host = cmd.env.get("DOCKER_HOST") or os.environ.get("DOCKER_HOST") or ""
    if prog in ("docker", "docker-compose") and not docker_host.startswith(("ssh://", "tcp://")):
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
    if "mac_build" not in CONFIG or cmd.remote or not is_mac() or not cmd.argv:
        return None
    kind = classify_tool(cmd.argv, cmd)
    if not kind:
        return None
    shown = " ".join(cmd.argv)[:80]
    return ("mac-build", f"{kind} on the Mac",
            f"`{shown}` is a {kind}, which this Mac does not run. {CONFIG['mac_build']} Single test files stay local: "
            f"`pnpm exec vitest run path/to/file.test.ts` (up to {MAX_TEST_FILES} files). "
            "Set CC_ALLOW_MAC_BUILD=1 only with the owner's authorization for this run.", "CC_ALLOW_MAC_BUILD")


# ---------------------------------------------------------------------------------------

def evaluate_full(payload):
    """(findings, warnings): (rule, summary, reason, override, bypassed) refusals, and warnings that let the command run."""
    if payload.get("tool_name") not in (None, "Bash"):
        return [], []
    command = (payload.get("tool_input") or {}).get("command") or ""
    if not command:
        return [], []
    cwd = payload.get("cwd") or None
    findings, seen = [], set()
    root = Context(cwd, False)
    cmds = commands(command, cwd, False, root)
    for cmd in cmds:
        for hit in (rule_admin_merge(cmd), rule_force_push(cmd), rule_hooks_bypass(cmd),
                    rule_shared_stash(cmd, payload), rule_mac_build(cmd), rule_no_build_host(cmd, classify_tool), rule_kill(cmd),
                    rule_ledger_write(cmd), rule_tail_sleep(cmd), rule_detached_gate(cmd, payload), rule_raw_gh(cmd),
                    rule_prod_d1_read(cmd, read_local, script_text), rule_refused_call(cmd, script_text)):
            if not hit or hit[:2] in seen:
                continue
            seen.add(hit[:2])
            rule, summary, reason, override = hit
            if cmd.origin:
                summary += f" (in {cmd.origin})"
                reason = f"The script {cmd.origin}, which this command runs, contains it. " + reason
            findings.append((rule, summary, reason, override, bool(override and flag_on(cmd, override))))
    hit = rule_xtrace_secrets(root.events)
    if hit:
        findings.append((*hit, False))
    hit = rule_env_dump(root.events)
    if hit:
        findings.append((*hit, os.environ.get(hit[3]) == "1"))
    warnings = []
    if not findings and re.search(r"\bpr\s+merge\b", command):
        try:
            import merge_check
            warnings = merge_check.warnings(cmds, payload)
        except Exception as exc:  # a warning tool never blocks or breaks a command
            warnings = [f"merge-check: could not check the PRs this command merges ({type(exc).__name__}: {exc})."]
    return findings, warnings


def traced_secrets(events):
    return [what for kind, what, *rest in events if kind == "secret" and rest and rest[0]]


def rule_xtrace_secrets(events):
    """xtrace on while a secret is loaded or expanded: the trace prints the value into the transcript."""
    found = traced_secrets(events)
    if not found:
        for event in [e for e in events if e[0] == "remote-traced-script"]:
            _, host, cwd, path = event
            text = fetch_remote(host, cwd, path)
            if text is None:
                continue
            scan = Context(cwd, True, events=[], host=host)
            scan.xtrace = True
            commands(text, cwd, True, scan)
            found += [f"{w} (in {host}:{path})" for w in traced_secrets(scan.events)]
    if not found:
        return None
    return ("xtrace-secrets", "xtrace while loading a secret",
            f"This command turns on shell tracing (bash -x, sh -x, set -x, set -o xtrace or BASH_XTRACEFD) while it loads "
            f"or expands a secret ({found[0]}). The trace prints every expanded value, so the secret would land in the "
            "transcript. Run it without -x, or wrap only the non-secret part: `set +x` before the line that reads the key and "
            "`set -x` after it. To check a key, print its length or a fingerprint, never the value.", None)


def rule_env_dump(events):
    """A command that prints environment values: environments carry live keys, and the transcript keeps them."""
    found = [e[1] for e in events if e[0] == "env-dump"]
    if not found:
        return None
    return ("env-dump", "print of environment values",
            f"This command prints environment values (`{found[0]}`), and the transcript keeps them. `cut -d= -f1`, `sed` and `awk` "
            "print a multi-line value's later lines whole. Print the names with `bash -c 'compgen -e'` (also after `dotenvx run -f "
            "<file> --`), a dotenvx file's names with `grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' <file>`, or one non-secret variable "
            "(`printenv NAME`); check a key by its length (`${#VAR}`) or `printf %s \"$VAR\" | sha256sum`. "
            + "".join(f"A ~/{d} file holds one raw value, which a filter prints: use `ls`, `wc -c` or `sha256sum`. " for d in SECRET_DIRS)
            + "The owner can allow it for a session with CC_ALLOW_ENV_DUMP=1 (logged).", "CC_ALLOW_ENV_DUMP")


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
        findings, warnings = evaluate_full(payload)
    except Exception as exc:  # refuse what no rule can read: failing open let one `$( )` nested 400 deep turn every rule off
        findings, warnings = [("unreadable", "", f"No rule can read this command ({type(exc).__name__}); split it.", None, False)] * ("payload" in locals()), []
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
    elif bypassed or warnings:
        lines = []
        if bypassed:
            names = ", ".join(f"{summary} via {override}=1" for _, summary, _, override, _ in bypassed)
            lines.append(f"process-guard: allowed {names}; logged to {LOG}.")
        lines += warnings
        text = "\n".join(lines)
        out = {"systemMessage": text}
        if warnings:
            out["hookSpecificOutput"] = {"hookEventName": "PreToolUse", "additionalContext": text}
        print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
