#!/usr/bin/python3
"""Install reversible PATH entrypoint guards on GTR without touching Beelinks."""
import argparse
import hashlib
import guard
import os
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
HOME = Path.home()
DEST = HOME / ".local/libexec/gtr-install-guard/guard.py"
GIT_ENTRY = HOME / "bin/git"
entries, guarded = guard.entries, guard.guarded


def install(prefixes=()) -> int:
    DEST.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=DEST.parent, delete=False) as output:
        temp = Path(output.name)
        with (HERE / "guard.py").open("rb") as source:
            shutil.copyfileobj(source, output)
    temp.chmod(0o755)
    os.replace(temp, DEST)
    changed = 0
    for path in entries(prefixes):
        original = Path(str(path) + ".gtr-original")
        if guarded(path):
            if not original.exists():
                raise RuntimeError(f"guarded entry lost its original: {path}")
            continue
        if original.exists():
            if path.exists() or path.is_symlink():
                raise RuntimeError(f"existing original conflicts with unguarded entry: {path}")
        else:
            if path == GIT_ENTRY and not path.exists() and not path.is_symlink():
                # Preserve the system Git as the delegation target; the guard owns only ~/bin/git.
                original.symlink_to("/usr/bin/git")
            else:
                if not path.is_file():
                    raise RuntimeError(f"not a regular executable: {path}")
                os.replace(path, original)
        temporary = Path(str(path) + ".gtr-new")
        temporary.symlink_to(DEST)
        os.replace(temporary, path)
        changed += 1
    print(f"gtr-install-guard: installed {changed} entrypoints; {len(entries(prefixes))} guarded")
    return 0


def check(prefixes=()) -> int:
    bad = [str(path) for path in entries(prefixes) if not guarded(path) or not Path(str(path) + ".gtr-original").exists()]
    if not DEST.exists() or DEST.read_bytes() != (HERE / "guard.py").read_bytes():
        bad.append(str(DEST))
    if bad:
        print("gtr-install-guard: drift: " + ", ".join(bad), file=sys.stderr)
        return 1
    print(f"gtr-install-guard: {len(entries(prefixes))} entrypoints guarded")
    return 0


def uninstall(prefixes=()) -> int:
    restored = 0
    for path in entries(prefixes):
        original = Path(str(path) + ".gtr-original")
        if original.exists() and (guarded(path) or not path.exists() and not path.is_symlink()):
            os.replace(original, path)
            restored += 1
    print(f"gtr-install-guard: restored {restored} original entrypoints")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--check", action="store_const", const="--check", dest="action")
    action.add_argument("--uninstall", action="store_const", const="--uninstall", dest="action")
    parser.add_argument("--prefix", action="append", type=Path, default=[],
                        help="enroll only a prepared/installed prefix within this user's nvm version store; repeatable")
    args = parser.parse_args()
    prefixes = []
    store = (HOME / ".nvm/versions/node").resolve()
    for prefix in args.prefix:
        prefix = prefix.expanduser().resolve()
        if (store not in prefix.parents or not (prefix / "bin").is_dir() or (prefix / "bin").is_symlink()
                or (prefix / "bin").resolve().parent != prefix):
            parser.error("--prefix must be a prepared or installed directory within the nvm version store")
        prefixes.append(prefix)
    if os.uname().nodename.split(".")[0] != "drew-GTR-Pro":
        print("gtr-install-guard: not GTR; no changes")
        return 0
    selected = args.action or "--install"
    try:
        if selected == "--check":
            return check(prefixes)
        admission, caches = guard.lifecycle()
        cfg = admission.Config.load()
        with caches.package_install_fence(cfg):
            result = {"--install": install, "--uninstall": uninstall}[selected](prefixes)
            if selected == "--install" and not prefixes:
                guard.package_sources(HOME)
                caches.producer_owner().update(cfg, hashlib.sha256((HERE / "guard.py").read_bytes()).hexdigest(), enroll=True)
            return result
    except (OSError, RuntimeError) as error:
        print(f"gtr-install-guard: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
