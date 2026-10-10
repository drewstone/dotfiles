#!/usr/bin/python3
"""Refuse package installs into GTR worktrees; delegate every other invocation."""
import os
import sys
from pathlib import Path

ROOTS = (Path.home() / "code/_wt", Path.home() / "webb/_wt")
TARGET_FLAGS = {"-C", "--dir", "--prefix", "--cwd", "--directory", "--project", "--target", "--python"}
MUTATING = {
    "pnpm": {"install", "i", "add", "update", "up", "rebuild", "fetch"},
    "npm": {"install", "i", "ci", "add", "update", "up", "rebuild"},
    "yarn": {"install", "add", "up", "upgrade", "rebuild"},
    "uv": {"sync", "add", "pip", "run", "tool"},
}


def inside_worktree(value: str, cwd: Path) -> bool:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = cwd / path
    for candidate in (Path(os.path.abspath(path)), path.resolve(strict=False)):
        for root in ROOTS:
            for base in (root, root.resolve(strict=False)):
                if candidate == base or base in candidate.parents:
                    return True
    return False


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


def main() -> None:
    entry = Path(sys.argv[0]).absolute()
    manager = entry.name
    original = Path(str(entry) + ".gtr-original")
    if manager not in MUTATING or not original.exists():
        print(f"gtr-install-guard: missing preserved executable for {entry}", file=sys.stderr)
        raise SystemExit(127)
    argv = sys.argv[1:]
    install, targets = is_install(manager, argv)
    if install:
        cwd = Path.cwd()
        candidates = [str(cwd), *targets]
        if manager == "uv":
            candidates.extend(os.environ.get(key, "") for key in ("VIRTUAL_ENV", "UV_PROJECT_ENVIRONMENT"))
        if any(value and inside_worktree(value, cwd) for value in candidates):
            print(
                f"gtr-install-guard: refused {manager} install into a GTR _wt worktree. "
                "Run the frozen install and checks through "
                "beelink-gate beelink2 <repo-url> <full-sha> -- <command>.",
                file=sys.stderr,
            )
            raise SystemExit(125)
    real = str(original.resolve(strict=True))
    os.execv(real, [real, *argv])


if __name__ == "__main__":
    main()
