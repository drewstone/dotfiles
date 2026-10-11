#!/usr/bin/python3
"""Refuse package installs and direct GTR worktree creates; delegate all other invocations.

Installs and gates belong on a Beelink (`beelink-gate beelink1|beelink2 <repo> <sha> -- <cmd>`).
GTR is resource-constrained and shared by many agent sessions.

pnpm, npm and yarn installs (including `--frozen-lockfile`, and the same through `corepack`) are
refused in any git checkout on GTR. On 2026-10-10, refused inside `_wt`, an agent cloned a new
checkout at ~/code/gate-gtm-20261010 and ran its frozen install and tests there instead.

Exempt: the deploy-managed service checkouts that tangle-tools-deploy installs
(~/.config/fleet/checkouts, DISCO_LAB in ~/.config/fleet/lab.env, the tangle-tools deploy clone),
the pinned discovery-lab copies under ~/code/_deploy that Discovery runs execute from, the
beelink-gate cache, global installs, lockfile-only resolution, and directories that are not
checkouts (tool caches such as agent-record's renderers, a scratch directory probing a package).

uv keeps its narrower rule: refused only inside a `_wt` worktree, because GTR's own tools run
through `uv run` from their checkouts.

On a Beelink the same Git entrypoint carries `git.worktree-cap.json` beside it and applies only the
worktree cap: a `git worktree add` into `_wt` must name its fleet lane, and is refused while that lane
already holds `cap` worktrees there or the filesystem has less than `floor_bytes` free. The refusal
lists the longest-idle trees to release with wt-remove. Installs stay allowed: Beelinks are where they run.
"""
import json
import os
import socket
import subprocess
import sys
import time
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
GIT_VALUE_FLAGS = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env"}
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
    """Return the add destination, respecting Git's chdir and option argument forms."""
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
    if argv[i:i + 2] != ["worktree", "add"]:
        return None
    i += 2
    while i < len(argv):
        word = argv[i]
        if word == "--":
            i += 1
            break
        if word in WORKTREE_VALUE_FLAGS:
            i += 2
        elif any(word.startswith(flag + "=") for flag in WORKTREE_VALUE_FLAGS if flag.startswith("--")):
            i += 1
        elif word.startswith("-"):
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
            return ("gtr-install-guard: refused direct git worktree add into GTR _wt. "
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
            "beelink-gate beelink1|beelink2 <repo-url> <full-sha> -- <command> "
            "(the gate does the frozen install in its own cache). A new clone outside _wt is a checkout too. "
            "Deploy-managed service checkouts (~/.config/fleet/checkouts, DISCO_LAB) are exempt.")


def cap_config(entry: Path):
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
    """(path, lane or None, idle seconds) for each linked worktree directly under a _wt root."""
    now = time.time()
    rows = []
    for root in ROOTS:
        try:
            children = sorted(root.iterdir())
        except OSError:
            continue
        for tree in children:
            admin = admin_dir(tree)
            if admin is None:
                continue
            try:
                lane = (admin / "fleet-lane").read_text().strip() or None
            except OSError:
                lane = None
            rows.append((tree, lane, idle_seconds(admin, now)))
    return rows


def release_list(rows, limit=5) -> str:
    rows = sorted(rows, key=lambda row: -row[2])[:limit]
    return "".join(f"\n  OWNER_RELEASED=1 wt-remove {tree}   # idle {idle / 3600:.1f} h" for tree, _, idle in rows)


def cap_refusal(config: dict, argv: list[str], cwd: Path):
    """On a Beelink: the refusal for a capped worktree add, or None; also the lane to record."""
    target = git_worktree_add_target(argv, cwd)
    if not target or not inside_worktree(target[0], target[1]):
        return None, None
    lane = fleet_lane()
    host = socket.gethostname().split(".")[0]
    if not lane:
        return ("beelink-worktree-cap: refused git worktree add into _wt without a fleet lane. "
                "Prefix the command with FLEET_LANE=<operator>:<lane> (your fleet STATUS file name, "
                f"with '--' read as ':'); each lane may hold {config['cap']} worktrees on {host}."), None
    rows = trees()
    mine = [row for row in rows if row[1] == lane]
    if len(mine) >= config["cap"]:
        return (f"beelink-worktree-cap: refused git worktree add for {lane}: it holds {len(mine)} of "
                f"{config['cap']} worktrees on {host}. Release one first; longest idle:{release_list(mine)}"), None
    free = None
    probe = resolved(target[0], target[1])[0]
    while free is None:
        try:
            stat = os.statvfs(probe)
            free = stat.f_bavail * stat.f_frsize
        except OSError:
            if probe == probe.parent:
                break
            probe = probe.parent
    if free is not None and free < config["floor_bytes"]:
        named = mine or rows
        whose = "this lane's" if mine else "the host's"
        return (f"beelink-worktree-cap: refused git worktree add for {lane}: {host} has "
                f"{free / 2**30:.0f} GiB free, under its {config['floor_bytes'] / 2**30:.0f} GiB floor. "
                f"Free space first; {whose} longest-idle trees:{release_list(named)}"), None
    return None, lane


def record_lane(argv: list[str], cwd: Path, lane: str) -> None:
    target, base = git_worktree_add_target(argv, cwd)
    tree = resolved(target, base)[0]
    admin = admin_dir(tree)
    if admin is not None:
        try:
            (admin / "fleet-lane").write_text(lane + "\n")
        except OSError as error:
            print(f"beelink-worktree-cap: could not record lane for {tree}: {error}", file=sys.stderr)


def main() -> None:
    entry = Path(sys.argv[0]).absolute()
    manager = entry.name
    original = Path(str(entry) + ".gtr-original")
    if (manager not in MUTATING and manager not in {"corepack", "git"}) or not original.exists():
        print(f"gtr-install-guard: missing preserved executable for {entry}", file=sys.stderr)
        raise SystemExit(127)
    argv = sys.argv[1:]
    config = cap_config(entry) if manager == "git" else None
    if config is not None:
        message, lane = cap_refusal(config, argv, Path.cwd())
        if message:
            print(message, file=sys.stderr)
            raise SystemExit(125)
        real = str(original.resolve(strict=True))
        if lane is None:
            os.execv(real, [real, *argv])
        code = subprocess.call([real, *argv])
        if code == 0:
            record_lane(argv, Path.cwd(), lane)
        raise SystemExit(code)
    message = refusal(manager, argv, Path.cwd())
    if message:
        print(message, file=sys.stderr)
        raise SystemExit(125)
    real = str(original.resolve(strict=True))
    os.execv(real, [real, *argv])


if __name__ == "__main__":
    main()
