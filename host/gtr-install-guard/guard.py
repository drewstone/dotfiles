#!/usr/bin/python3
"""Refuse package installs into GTR checkouts; delegate every other invocation.

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
             HOME / "code/_deploy"]  # pinned discovery-lab copies that Discovery runs execute from
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


def refusal(manager: str, argv: list[str], cwd: Path):
    """The refusal message for this invocation, or None when it may run."""
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


def main() -> None:
    entry = Path(sys.argv[0]).absolute()
    manager = entry.name
    original = Path(str(entry) + ".gtr-original")
    if (manager not in MUTATING and manager != "corepack") or not original.exists():
        print(f"gtr-install-guard: missing preserved executable for {entry}", file=sys.stderr)
        raise SystemExit(127)
    argv = sys.argv[1:]
    message = refusal(manager, argv, Path.cwd())
    if message:
        print(message, file=sys.stderr)
        raise SystemExit(125)
    real = str(original.resolve(strict=True))
    os.execv(real, [real, *argv])


if __name__ == "__main__":
    main()
