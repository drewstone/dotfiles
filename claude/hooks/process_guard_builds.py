"""Process-guard rule no-build-host: a host named in guard-config `process_guard.no_build_hosts` runs no builds.

That entry maps each host name to its refusal's hint. Refused there: cargo build/check/test/clippy/run, pnpm/npm
build scripts, docker build, nix build/develop, cmake and make. A remote runner's `-- <command>` and
`ssh <host> '<command>'` run elsewhere and pass, as do commands that only name a build (grep, echo, commit messages).
No override.
"""
import os
import shlex

from secret_scan import guard_config

NO_BUILD_HOSTS = {host.lower(): hint for host, hint in guard_config("process_guard", {}).get("no_build_hosts", {}).items()}

CARGO_BUILD = {"build", "b", "check", "c", "test", "t", "clippy", "run", "r", "bench", "nextest", "install"}
VALUE_OPTS = {"-C", "--config", "-Z", "--color", "--extra-experimental-features", "--experimental-features"}
LIGHT = {"--version", "-V", "--help", "-h"}
LIGHT_BY_PROG = {"make": {"-v", "-n", "--dry-run", "--just-print", "-q", "--question"}, "cmake": {"-E"}}


def host_name():
    return (os.environ.get("CC_GUARD_HOST") or os.uname().nodename).lower()


def classify_compile(prog, args):
    """cargo, nix, cmake and make invocations that compile; version, help and dry runs pass."""
    if any(a in LIGHT or a in LIGHT_BY_PROG.get(prog, ()) for a in args):
        return None
    if prog in ("cmake", "make", "nix-build"):
        return "build"
    i = 0
    while i < len(args) and args[i].startswith(("-", "+")):
        i += 2 if args[i] in VALUE_OPTS else 1
    sub = args[i] if i < len(args) else None
    if (prog == "cargo" and sub in CARGO_BUILD) or (prog == "nix" and sub in ("build", "develop")):
        return "build"
    return None


def rule_no_build_host(cmd, classify_tool):
    """classify_tool is process_guard's package-manager and docker classifier, shared with the Mac rule."""
    if cmd.remote or not cmd.argv or host_name() not in NO_BUILD_HOSTS:
        return None
    prog = os.path.basename(cmd.argv[0])
    if prog in ("cargo", "nix", "nix-build", "cmake", "make"):
        kind = classify_compile(prog, cmd.argv[1:])
    else:
        kind = classify_tool(cmd.argv, cmd)
    if kind not in ("build", "image build"):
        return None
    shown = " ".join(cmd.argv)[:80]
    return ("no-build-host", f"{kind} on {host_name()}",
            f"`{shown}` is a {kind}, and {host_name()} runs no builds. "
            f"{NO_BUILD_HOSTS[host_name()].replace('{command}', shlex.join(cmd.argv))}".rstrip(), None)
