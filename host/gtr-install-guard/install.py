#!/usr/bin/python3
"""Install reversible PATH entrypoint guards on GTR without touching Beelinks."""
import os
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
HOME = Path.home()
DEST = HOME / ".local/libexec/gtr-install-guard/guard.py"
MANAGERS = ("pnpm", "npm", "yarn", "uv", "corepack")


def entries():
    dirs = [HOME / ".local/bin", HOME / ".local/share/pnpm", HOME / "bin"]
    dirs.extend(sorted((HOME / ".nvm/versions/node").glob("*/bin")))
    paths = [directory / name for directory in dirs for name in MANAGERS]
    return [path for path in paths if path.exists() or path.is_symlink() or Path(str(path) + ".gtr-original").exists()]


def guarded(path: Path) -> bool:
    return path.is_symlink() and path.resolve(strict=False) == DEST


def install() -> int:
    DEST.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=DEST.parent, delete=False) as output:
        temp = Path(output.name)
        with (HERE / "guard.py").open("rb") as source:
            shutil.copyfileobj(source, output)
    temp.chmod(0o755)
    os.replace(temp, DEST)
    changed = 0
    for path in entries():
        original = Path(str(path) + ".gtr-original")
        if guarded(path):
            if not original.exists():
                raise RuntimeError(f"guarded entry lost its original: {path}")
            continue
        if original.exists():
            if path.exists() or path.is_symlink():
                raise RuntimeError(f"existing original conflicts with unguarded entry: {path}")
        else:
            if not path.is_file():
                raise RuntimeError(f"not a regular executable: {path}")
            os.replace(path, original)
        temporary = Path(str(path) + ".gtr-new")
        temporary.symlink_to(DEST)
        os.replace(temporary, path)
        changed += 1
    print(f"gtr-install-guard: installed {changed} entrypoints; {len(entries())} guarded")
    return 0


def check() -> int:
    bad = [str(path) for path in entries() if not guarded(path) or not Path(str(path) + ".gtr-original").exists()]
    if not DEST.exists() or DEST.read_bytes() != (HERE / "guard.py").read_bytes():
        bad.append(str(DEST))
    if bad:
        print("gtr-install-guard: drift: " + ", ".join(bad), file=sys.stderr)
        return 1
    print(f"gtr-install-guard: {len(entries())} entrypoints guarded")
    return 0


def uninstall() -> int:
    restored = 0
    for path in entries():
        original = Path(str(path) + ".gtr-original")
        if original.exists() and (guarded(path) or not path.exists() and not path.is_symlink()):
            os.replace(original, path)
            restored += 1
    print(f"gtr-install-guard: restored {restored} original entrypoints")
    return 0


def main() -> int:
    if len(sys.argv) > 2 or (len(sys.argv) == 2 and sys.argv[1] not in {"--check", "--uninstall"}):
        print("usage: install.py [--check|--uninstall]", file=sys.stderr)
        return 2
    if os.uname().nodename.split(".")[0] != "drew-GTR-Pro":
        print("gtr-install-guard: not GTR; no changes")
        return 0
    action = sys.argv[1] if len(sys.argv) == 2 else "--install"
    try:
        return {"--install": install, "--check": check, "--uninstall": uninstall}[action]()
    except (OSError, RuntimeError) as error:
        print(f"gtr-install-guard: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
