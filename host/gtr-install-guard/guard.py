#!/usr/bin/python3
"""Refuse package installs and direct GTR worktree creates; delegate all other invocations.

Installs and gates belong on a Beelink (`beelink-gate beelink1|beelink2 <repo> <sha> -- <cmd>`).
GTR is resource-constrained and shared by many agent sessions.

pnpm, npm and yarn installs (including `--frozen-lockfile`, and the same through `corepack`) are
refused in any git checkout on GTR. Refused inside `_wt`, an agent cloned a new
checkout at ~/code/gate-gtm-20261010 and ran its frozen install and tests there instead.

Exempt: the deploy-managed service checkouts that tangle-tools-deploy installs
(~/.config/fleet/checkouts, DISCO_LAB in ~/.config/fleet/lab.env, the tangle-tools deploy clone),
the pinned discovery-lab copies under ~/code/_deploy that Discovery runs execute from, the
beelink-gate cache, global installs, lockfile-only resolution, and directories that are not
checkouts (tool caches such as agent-record's renderers, a scratch directory probing a package).

GTR runs no gates: an install in any GTR checkout, ~/.cache/gtr-gate included, is refused. uv keeps its
narrower rule: refused only inside a `_wt` worktree, because GTR tools use uv from their checkouts.

On a Beelink, /usr/local/bin/git is a shell shim (beelink-git) that runs this file, with `git.worktree-cap.json` beside it,
only for `worktree` commands. There it applies only the
worktree cap: a `git worktree add` into `_wt` must name its fleet lane, and is refused while that lane
already holds `cap` worktrees there or the tree does not fit Tangle Tools' size-aware storage admission. The refusal
lists the longest-idle trees to release with wt-remove. Installs stay allowed: Beelinks are where they run.
"""
import os
import sys
from pathlib import Path

HOME = Path.home()
ROOTS = (HOME / "code/_wt", HOME / "webb/_wt")
TARGET_FLAGS = {"-C", "--dir", "--prefix", "--cwd", "--directory", "--project", "--target", "--python"}
MUTATING = {
    "pnpm": {"install", "i", "add", "update", "up", "rebuild", "fetch"},
    "npm": {"install", "i", "ci", "add", "update", "up", "rebuild"},
    "yarn": {"install", "add", "up", "upgrade", "rebuild"},
    "uv": {"sync", "add", "pip", "run", "tool"},
}
COREPACK_MANAGERS = {"pnpm": "pnpm", "pnpx": "pnpm", "yarn": "yarn", "yarnpkg": "yarn", "npm": "npm", "npx": "npm"}
NO_INSTALL = {"-g", "--global", "--location=global", "--lockfile-only", "--package-lock-only"}
GIT_VALUE_FLAGS = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--attr-source"}
WORKTREE_VALUE_FLAGS = {"-b", "-B", "--reason", "--orphan"}


def resolved(value: str, cwd: Path) -> list[Path]:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = cwd / path
    return [Path(os.path.abspath(path)), path.resolve(strict=False)]


def under(path: Path, roots) -> bool:
    for root in roots:
        for base in (root, root.resolve(strict=False)):
            if path == base or base in path.parents:
                return True
    return False


def inside_worktree(value: str, cwd: Path) -> bool:
    return any(under(candidate, ROOTS) for candidate in resolved(value, cwd))


def is_checkout(directory: Path) -> bool:
    """A git working tree: `.git` is a repository directory, or a worktree's `gitdir:` file.
    GTR's home holds a stray `.git/info` with no repository; that is not a checkout."""
    marker = directory / ".git"
    try:
        if marker.is_dir():
            return (marker / "HEAD").is_file()
        if marker.is_file():
            return marker.read_text(errors="replace").startswith("gitdir:")
    except OSError:
        return False
    return False


def checkout_root(path: Path):
    for directory in (path, *path.parents):
        if directory == HOME or directory == HOME.parent:
            return None  # the home directory is never a gate checkout
        if is_checkout(directory):
            return directory
    return None


def env_file_value(path: Path, key: str):
    try:
        for line in path.read_text().splitlines():
            line = line.strip()
            if line.startswith("export "):
                line = line[len("export "):]
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip().strip("'\"")
    except OSError:
        return None
    return None


def exempt_roots() -> list[Path]:
    """Checkouts whose installs are a deploy path, not a gate."""
    roots = [HOME / ".cache/beelink-gate",
             Path(os.environ.get("TANGLE_TOOLS_DEPLOY", HOME / ".local/share/tangle-tools")).expanduser(),
             HOME / "code/_deploy",  # pinned discovery-lab copies that Discovery runs execute from
             # The Lab keeper's deploy path: each deploy is a fresh discovery-lab-<sha> checkout here,
             # installed before the keeper starts settle work from it. DISCO_LAB names the rollup, not
             # these. Refusing them left every deploy without node_modules from 2026-10-10 09:35Z,
             # and settle checks, ledger rows and wrapups silently did not run.
             HOME / ".local/share/discovery-lab-deploys"]
    lab = os.environ.get("DISCO_LAB") or env_file_value(HOME / ".config/fleet/lab.env", "DISCO_LAB")
    if lab:
        roots.append(Path(os.path.expandvars(lab)).expanduser())
    try:
        lines = (HOME / ".config/fleet/checkouts").read_text().splitlines()
    except OSError:
        lines = []
    for line in lines:
        fields = line.split()
        if fields and not fields[0].startswith("#"):
            roots.append(Path(os.path.expandvars(fields[0])).expanduser())
    return roots



def refused_checkout(values: list[str], cwd: Path):
    """The checkout an install would write into, unless it is exempt or not a checkout."""
    exempt = exempt_roots()
    for value in values:
        if not value:
            continue
        for candidate in resolved(value, cwd):
            root = checkout_root(candidate)
            if root and not under(candidate, exempt):
                return root
    return None


def invocation(argv: list[str]) -> tuple[list[str], list[str]]:
    words = []
    targets = []
    index = 0
    while index < len(argv):
        word = argv[index]
        flag = word.split("=", 1)[0]
        if flag in TARGET_FLAGS:
            if "=" in word:
                targets.append(word.split("=", 1)[1])
            elif index + 1 < len(argv):
                targets.append(argv[index + 1])
                index += 1
        elif not word.startswith("-"):
            words.append(word)
        index += 1
    return words, targets


def is_install(manager: str, argv: list[str]) -> tuple[bool, list[str]]:
    words, targets = invocation(argv)
    if manager == "yarn" and not words:
        return True, targets  # bare yarn is install
    if not words or not any(word in MUTATING[manager] for word in words):
        return False, targets
    if manager == "uv":
        if words[0] == "run" and "--no-sync" in argv:
            return False, targets
        if words[0] == "pip" and (len(words) < 2 or words[1] not in {"install", "sync"}):
            return False, targets
        if words[0] == "tool" and (len(words) < 2 or words[1] != "install"):
            return False, targets
    return True, targets


def git_worktree_add_target(argv: list[str], cwd: Path):
    """Return where `worktree add` or `worktree move` puts a tree, respecting Git's chdir and option forms.
    A move into _wt is an add there: lane-10080 created a tree outside _wt and moved it in under the floor."""
    i = 0
    while i < len(argv):
        word = argv[i]
        if word == "-C" and i + 1 < len(argv):
            cwd = Path(os.path.abspath(cwd / argv[i + 1]))
            i += 2
        elif word.startswith("-C") and len(word) > 2:
            cwd = Path(os.path.abspath(cwd / word[2:]))
            i += 1
        elif word in GIT_VALUE_FLAGS:
            i += 2
        elif any(word.startswith(flag + "=") for flag in GIT_VALUE_FLAGS if flag.startswith("--")):
            i += 1
        elif word.startswith("-"):
            i += 1
        else:
            break
    if argv[i:i + 1] != ["worktree"] or argv[i + 1:i + 2] not in (["add"], ["move"]):
        return None
    positional = 1 if argv[i + 1] == "move" else 0  # move <worktree> <new-path>: the destination is second
    i += 2
    while i < len(argv):
        word = argv[i]
        if word == "--":
            i += 1 + positional
            break
        if word in WORKTREE_VALUE_FLAGS:
            i += 2
        elif any(word.startswith(flag + "=") for flag in WORKTREE_VALUE_FLAGS if flag.startswith("--")):
            i += 1
        elif word.startswith("-"):
            i += 1
        elif positional:
            positional -= 1
            i += 1
        else:
            break
    return (argv[i], cwd) if i < len(argv) else None


def refusal(manager: str, argv: list[str], cwd: Path):
    """The refusal message for this invocation, or None when it may run."""
    if manager == "git":
        target = git_worktree_add_target(argv, cwd)
        if target and inside_worktree(target[0], target[1]):
            if os.environ.get("TANGLE_STORAGE_LIFECYCLE_CREATE") == "1":
                return None
            return ("gtr-install-guard: refused direct git worktree add or move into GTR _wt. "
                    "Use storage-lifecycle create with a sparse exclusion, budget and lane; "
                    "author on a Beelink when its space admission refuses.")
        return None
    if manager == "corepack":
        index = next((i for i, word in enumerate(argv) if not word.startswith("-")), None)
        if index is None or argv[index] not in COREPACK_MANAGERS:
            return None  # corepack's own commands (enable, prepare, install -g) install no dependencies
        manager, argv = COREPACK_MANAGERS[argv[index]], argv[index + 1:]
        if manager == "npm" and argv[:1] == ["exec"]:
            return None
    install, targets = is_install(manager, argv)
    if not install:
        return None
    candidates = [str(cwd), *targets]
    if manager == "uv":
        candidates += [os.environ.get(key, "") for key in ("VIRTUAL_ENV", "UV_PROJECT_ENVIRONMENT")]
    # Anything under _wt stays refused as before, whatever its flags or checkout state.
    if any(value and inside_worktree(value, cwd) for value in candidates):
        return (f"gtr-install-guard: refused {manager} install into a GTR _wt worktree. "
                "Run the frozen install and checks through "
                "beelink-gate beelink1|beelink2 <repo-url> <full-sha> -- <command>.")
    if manager == "uv":
        return None
    if any(word in NO_INSTALL or word.startswith("--location=global") for word in argv):
        return None
    root = refused_checkout([str(cwd), *targets], cwd)
    if root is None:
        return None
    return (f"gtr-install-guard: refused {manager} install in {root}, a checkout on GTR. Installs and gates run on "
            "a Beelink: push the commit, then from GTR run "
            "beelink-gate auto <repo-url> <full-sha> -- <command> "
            "(the gate does the frozen install in its own cache, on a Beelink or a Tangle sandbox). "
            "Any other new clone, inside _wt or not, is a checkout too. "
            "Deploy-managed service checkouts (~/.config/fleet/checkouts, DISCO_LAB) are exempt.")


CAP_DEPTH = 3  # worktrees nested this deep under a _wt root still count against their lane


def cap_config(entry: Path):
    import json
    try:
        return json.loads(Path(str(entry) + ".worktree-cap.json").read_text())
    except (OSError, ValueError):
        return None


def fleet_lane():
    """The lane creating this tree: FLEET_LANE, else the fleet STATUS file name (sent over ssh)."""
    lane = os.environ.get("FLEET_LANE", "").strip()
    if lane:
        return lane
    name = Path(os.environ.get("FLEET_STATUS_FILE", "")).name
    if name.endswith(".md") and "--" in name:
        operator, window = name[:-3].split("--", 1)
        return f"{operator}:{window}"
    return None


def admin_dir(tree: Path):
    try:
        text = (tree / ".git").read_text(errors="replace").strip()
    except OSError:
        return None
    if not text.startswith("gitdir:"):
        return None
    path = Path(text[len("gitdir:"):].strip())
    return path if path.is_absolute() else (tree / path).resolve()


def idle_seconds(admin: Path, now: float) -> float:
    stamps = []
    for name in ("HEAD", "index", "logs/HEAD"):
        try:
            stamps.append((admin / name).stat().st_mtime)
        except OSError:
            pass
    return now - max(stamps) if stamps else 0.0


def trees():
    """(path, lane or None, idle seconds) for each linked worktree under a _wt root, CAP_DEPTH deep."""
    import time
    now = time.time()
    rows = []

    def visit(directory: Path, depth: int) -> None:
        try:
            children = sorted(child for child in directory.iterdir() if child.is_dir() and not child.is_symlink())
        except OSError:
            return
        for tree in children:
            if (tree / ".git").exists():
                admin = admin_dir(tree)
                if admin is None:
                    continue  # a full clone: not a linked worktree, and nothing below it is either
                try:
                    lane = (admin / "fleet-lane").read_text().strip() or None
                except OSError:
                    lane = None
                rows.append((tree, lane, idle_seconds(admin, now)))
            elif depth < CAP_DEPTH:
                visit(tree, depth + 1)

    for root in ROOTS:
        visit(root, 1)
    return rows


def release_list(rows, lane, limit=5) -> str:
    """The lane releases its own trees; another lane's tree goes through wt-remove's idle guard."""
    rows = sorted(rows, key=lambda row: -row[2])[:limit]
    return "".join(f"\n  {'OWNER_RELEASED=1 ' if owner == lane else ''}wt-remove {tree}   # idle {idle / 3600:.1f} h"
                   for tree, owner, idle in rows)


def free_bytes(path: Path):
    while True:
        try:
            stat = os.statvfs(path)
            return stat.f_bavail * stat.f_frsize
        except OSError:
            if path == path.parent:
                return None
            path = path.parent


def cap_refusal(config: dict, target, lane: str):
    """The refusal for a Beelink worktree add into _wt, or None when it may run."""
    import socket
    host = socket.gethostname().split(".")[0]
    if not lane:
        return ("beelink-worktree-cap: refused git worktree add into _wt without a fleet lane. "
                "Prefix the command with FLEET_LANE=<operator>:<lane> (your fleet STATUS file name, "
                f"with '--' read as ':'); each lane may hold {config['cap']} worktrees on {host}.")
    rows = trees()
    mine = [row for row in rows if row[1] == lane]
    if len(mine) >= config["cap"]:
        return (f"beelink-worktree-cap: refused git worktree add for {lane}: it holds {len(mine)} of "
                f"{config['cap']} worktrees on {host}. Release one first; longest idle:{release_list(mine, lane)}")
    free = free_bytes(resolved(target[0], target[1])[0])
    verdict = admission(config, host, request_bytes(target[1]), free) if free is not None else None
    if verdict and not verdict["fits"]:
        return (f"beelink-worktree-cap: refused git worktree add for {lane}: {host} has {free / 2**30:.0f} GiB free "
                f"- {verdict['reserved_bytes'] / 2**30:.0f} GiB reserved - {verdict['requested_bytes'] / 2**30:.1f} GiB "
                f"for this tree, under the {verdict['minimum_bytes'] / 2**30:.0f} GiB lifecycle minimum. "
                "Free space first; run storage-lifecycle run --exclusive-inventory --max-seconds 20 "
                "for the read-only owner/allocation ranking. Removal still requires wt-remove.")
    return None


def request_bytes(cwd: Path) -> int:
    """A new tree's own size: the tracked bytes at HEAD of the repository it is added from."""
    import subprocess
    try:
        out = subprocess.run(["/usr/bin/git", "-C", str(cwd), "ls-tree", "-r", "-l", "--full-tree", "HEAD"],
                             capture_output=True, text=True, timeout=30).stdout
    except (OSError, subprocess.SubprocessError):
        return 0
    return sum(int(f[3]) for f in (line.split(None, 4) for line in out.splitlines()) if len(f) > 3 and f[3].isdigit())


def admission(config: dict, host: str, request: int, free: int):
    """Tangle Tools' size-aware admission (free - live reservations - request >= its minimum), the rule
    beelink-gate uses. The fixed 160 GiB floor it replaces refused 33 adds from 10-19 to 10-26 at 123-153 GiB
    free, for trees of a few GiB. An unreadable owner admits: an unknown is not disk pressure."""
    import importlib.util
    try:
        spec = importlib.util.spec_from_file_location(
            "fleet_disk_policy", config.get("admission_policy", "/usr/local/libexec/tangle-fleet-disk-policy.py"))
        owner = importlib.util.module_from_spec(spec)
        sys.dont_write_bytecode = True
        spec.loader.exec_module(owner)
        return owner.admission_headroom(host, "/", request, free)
    except Exception as error:  # noqa: BLE001  any owner failure is an unknown
        print(f"beelink-worktree-cap: storage admission unreadable ({type(error).__name__}); add admitted", file=sys.stderr)
        return None


def capped_add(real: str, argv: list[str], target, lane: str, config: dict) -> int:
    """Count, create and record under one per-lane lock, so parallel adds cannot pass the count together."""
    import fcntl
    import re
    import signal
    import subprocess
    if not lane:
        print(cap_refusal(config, target, lane), file=sys.stderr)
        return 125
    locks = Path(os.environ.get("XDG_RUNTIME_DIR") or "/tmp") / "beelink-worktree-cap"
    locks.mkdir(mode=0o700, exist_ok=True)
    with open(locks / (re.sub(r"[^A-Za-z0-9_.-]", "_", lane) + ".lock"), "w") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        message = cap_refusal(config, target, lane)
        if message:
            print(message, file=sys.stderr)
            return 125
        # Git handles interrupts and cleans up its own half-made tree; the wrapper waits for it
        # so the marker is still written, and reports a signal death as a shell would.
        previous = {sig: signal.signal(sig, signal.SIG_IGN) for sig in (signal.SIGINT, signal.SIGTERM)}
        try:
            child = subprocess.Popen([real, *argv], restore_signals=True,
                                     preexec_fn=lambda: [signal.signal(sig, signal.SIG_DFL) for sig in previous])
            code = child.wait()
        finally:
            for sig, handler in previous.items():
                signal.signal(sig, handler)
        # Record the lane whenever the tree exists: a failing post-checkout hook (git-lfs, husky)
        # makes git exit nonzero after the checkout is complete.
        admin = admin_dir(resolved(target[0], target[1])[0])
        if admin is not None and admin.is_dir():
            try:
                (admin / "fleet-lane").write_text(lane + "\n")
            except OSError as error:
                print(f"beelink-worktree-cap: could not record lane in {admin}: {error}", file=sys.stderr)
    return 128 - code if code < 0 else code


def main() -> None:
    entry = Path(sys.argv[0]).absolute()
    if not Path(str(entry) + ".gtr-original").exists():
        # Invoked through a symlink to the installed wrapper (a test's stub bin/git that links
        # `which git`): the preserved executable and the worktree cap sit beside the wrapper's
        # real path, not beside the alias. The alias path refused every ADC script
        # test that builds such a stub, so no signoff could pass on either Beelink.
        installed = Path(__file__).resolve()
        if Path(str(installed) + ".gtr-original").exists():
            entry = installed
    manager = entry.name
    original = Path(str(entry) + ".gtr-original")
    if (manager not in MUTATING and manager not in {"corepack", "git"}) or not original.exists():
        print(f"gtr-install-guard: missing preserved executable for {entry}", file=sys.stderr)
        raise SystemExit(127)
    argv = sys.argv[1:]
    if manager == "git" and Path(str(entry) + ".worktree-cap.json").exists():
        # A Beelink: only the worktree cap applies, and only to adds into _wt.
        target = git_worktree_add_target(argv, Path.cwd())
        real = str(original.resolve(strict=True))
        if target and inside_worktree(target[0], target[1]):
            config = cap_config(entry)
            if config is None:
                print(f"beelink-worktree-cap: unreadable {entry}.worktree-cap.json; worktree add refused", file=sys.stderr)
                raise SystemExit(125)
            raise SystemExit(capped_add(real, argv, target, fleet_lane(), config))
        os.execv(real, [real, *argv])
    message = refusal(manager, argv, Path.cwd())
    if message:
        print(message, file=sys.stderr)
        raise SystemExit(125)
    real = str(original.resolve(strict=True))
    os.execv(real, [real, *argv])


if __name__ == "__main__":
    main()
