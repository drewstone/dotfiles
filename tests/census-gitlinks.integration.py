#!/usr/bin/env python3
"""Public Git/census regression; optional argument selects the complete candidate tool root.

Uses inherited identity and all candidate hooks. No installs, hook bypasses or network access.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
CENSUS, HOOKS = ROOT / "git/census/census", ROOT / "git/hooks"
failures = []
checks = 0


def run(repo, *args, status=0, contains=None):
    global checks
    checks += 1
    result = subprocess.run([str(a) for a in args], cwd=repo, text=True, capture_output=True, timeout=45,
                            env={**os.environ, "XDG_CACHE_HOME": str(repo / ".git/census-cache")})
    output = result.stdout + result.stderr
    if result.returncode != status or (contains and contains not in output):
        failures.append(f"{args}: expected {status}, got {result.returncode}\n{output}")
    return result.stdout.strip()


def write(repo, path, text):
    target = repo / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text)


def commit(repo, message, **expected):
    return run(repo, "git", "commit", "-qm", message, **expected)


def readers(repo, base, rev):
    listed = run(repo, CENSUS, "files", ".", rev)
    measured = run(repo, CENSUS, "measure", ".", rev)
    if measured:
        report = json.loads(measured)
        assert report["files_read"] == {"logic": 3, "source": 1, "functions": 2, "docs": 1}, report
        assert report["metrics"]["prod_lines"] == 3, report  # three 8-token code lines; an interpreter line is not code
    if listed:
        assert listed == "bin/tool\t2\tlogic\nsrc/main.py\t1\tlogic\nsrc/main.ts\t1\tlogic", listed
    run(repo, CENSUS, "floors", ".", base, rev, "--floor", "lines", "--floor", "god", "--floor", "copies",
        "--floor", "confusion", "--peer", f"self={repo}:{rev}")
    crossed = run(repo, CENSUS, "xrepo", f"self={repo}:{rev}")
    if crossed:
        assert json.loads(crossed)["per_repo_files"] == {"self": 1}, crossed


with tempfile.TemporaryDirectory(prefix="census-gitlinks-") as temporary:
    repo = Path(temporary)
    run(repo, "git", "init", "-q", "-b", "main")
    run(repo, "git", "config", "core.hooksPath", str(HOOKS))
    for path, text in {"src/main.ts": "export const mainValue = pick(1)\n", "src/main.py": "value = compute(1, 2)\n",
                       "bin/tool": "#!/bin/sh\necho ready to serve the next request now\n", "README.md": "Fixture.\n" * 2000, "LICENSE": "MIT\n", "Makefile": "all:\n"}.items():
        write(repo, path, text)
    run(repo, "git", "add", "-A")
    commit(repo, "feat: base")
    base = run(repo, "git", "rev-parse", "HEAD")
    absent = "f" * len(base)
    run(repo, "git", "cat-file", "-e", absent, status=1)
    links = ["dependencies/forge-std", "links/module.py", "links/module.ts", "links/module.md"]
    for path in links:
        run(repo, "git", "update-index", "--add", "--cacheinfo", f"160000,{absent},{path}")
    staged = run(repo, "git", "write-tree")
    # Read staged trees directly: uninitialized links need no worktree directory or local target object.
    readers(repo, base, staged)
    commit(repo, "feat: declare submodules", contains="ai-agent-hooks: hook=pre-commit")
    if not failures:
        readers(repo, base, "HEAD")
        for path in links:
            run(repo, "git", "update-index", "--cacheinfo", f"160000,{base},{path}")
        commit(repo, "fix: update submodules to available commits")
        readers(repo, base, "HEAD")
        for old in links:
            run(repo, "git", "update-index", "--force-remove", old)
            run(repo, "git", "update-index", "--add", "--cacheinfo", f"160000,{absent},{old}.moved")
        commit(repo, "refactor: rename submodules")
        readers(repo, base, "HEAD")
        for path in links:
            run(repo, "git", "update-index", "--force-remove", path + ".moved")
        commit(repo, "refactor: remove submodules")
        readers(repo, base, "HEAD")
        (repo / "lib").mkdir()
        run(repo, "git", "mv", "src/main.py", "lib/moved.py")
        commit(repo, "refactor: move regular source across areas")
        run(repo, "git", "mv", "lib/moved.py", "src/main.py")
        commit(repo, "refactor: restore regular source path")
        # A type change must charge its blob side; Git reports T rather than M.
        for path in ("src/main.py", "src/main.ts"):
            run(repo, "git", "update-index", "--cacheinfo", f"160000,{absent},{path}")
            commit(repo, "refactor: replace source with submodule")
            run(repo, "git", "add", path)
            commit(repo, "fix: restore source", contains="this change adds 1 production lines")
        write(repo, "src/main.py", "value = compute(1, 2)\nsecond = compute(3, 4)\n")
        run(repo, "git", "add", "src/main.py")
        run(repo, HOOKS / "loc-ratchet", contains="this change adds 1 production lines")
        run(repo, CENSUS, "floors", ".", "HEAD", "WORKTREE", "--floor", "lines", status=1, contains="REFUSED: may not rise")
        for path, body, why in [("src/large.py", "value = 1\n" * 1001, "1001 lines (new file)"),
                                ("src/long.py", "def large():\n" + "    pass\n" * 301, "fn-ratchet: refusing commit"),
                                ("src/long.ts", "export function large() {\n" + "    void 0;\n" * 301 + "}\n", "fn-ratchet: refusing commit"),
                                ("src/bad.py", "*** malformed\n", "python functions refused:")]:
            write(repo, path, body)
            write(repo, "README.md", "Fixture.\n" * 1000)
            run(repo, "git", "add", path, "README.md")
            commit(repo, "fix: forbidden source", status=1, contains=why)
            if path.endswith("bad.py"):
                run(repo, CENSUS, "measure", ".", "WORKTREE", status=2, contains="python functions refused:")
            run(repo, "git", "rm", "--cached", "-q", path)
            (repo / path).unlink()
        write(repo, "bin/tool", "#!/bin/sh\n" + "echo ready\n" * 1000)
        run(repo, "git", "add", "bin/tool")
        commit(repo, "fix: oversized script", status=1, contains="bin/tool: 1001 lines (was 2)")
        write(repo, "bin/tool", "#!/bin/sh\necho ready\n")
        write(repo, "src/main.py", "value = 1\n")
        run(repo, "git", "add", "bin/tool", "src/main.py")
        run(repo, "git", "update-index", "--add", "--cacheinfo", f"160000,{absent},src/linked.ts")
        commit(repo, "feat: declare source-named submodule")
        write(repo, "README.md", "Fixture.\n" * 999)
        write(repo, "src/linked.ts", "export const mainValue = 2\n")
        run(repo, "git", "add", "README.md", "src/linked.ts")
        commit(repo, "fix: duplicate export through type change", status=1, contains="dup-export-ratchet: refusing commit")
        run(repo, "git", "rm", "--cached", "-q", "src/linked.ts")
        (repo / "src/linked.ts").unlink()
        commit(repo, "refactor: remove source-named submodule")
        write(repo, "README.md", "Fixture.\n" * 998)
        write(repo, "src/duplicate.ts", "export const mainValue = 2\n")
        run(repo, "git", "add", "README.md", "src/duplicate.ts")
        commit(repo, "fix: duplicate export", status=1, contains="dup-export-ratchet: refusing commit")
        run(repo, "git", "rm", "--cached", "-q", "src/duplicate.ts")
        (repo / "src/duplicate.ts").unlink()
        write(repo, "README.md", "See `src/main.ts`.\n")
        run(repo, "git", "add", "README.md")
        commit(repo, "docs: reference current source")
        run(repo, "git", "mv", "src/main.ts", "src/moved.ts")
        commit(repo, "refactor: stale reference", status=1, contains="doc-ref-ratchet: refusing commit")
        run(repo, "git", "mv", "src/moved.ts", "src/main.ts")
        incomplete = repo / ".git/incomplete-census"
        shutil.copytree(ROOT / "git/census", incomplete)
        (incomplete / "python_functions.py").unlink()
        run(repo, incomplete / "census", "measure", ".", "HEAD", status=2, contains="cannot read instrument python_functions.py")
        # Only this private fixture loses a regular blob, after normal commits created its tree.
        write(repo, "src/main.ts", "export const mainValue = 2\n")
        run(repo, "git", "add", "src/main.ts")
        blob = run(repo, "git", "rev-parse", "HEAD:src/main.ts")
        object_path = repo / ".git/objects" / blob[:2] / blob[2:]
        object_path.unlink()
        shutil.rmtree(repo / ".git/census-cache")
        for args in [("files", ".", "HEAD"), ("measure", ".", "HEAD"),
                     ("floors", ".", base, "HEAD", "--floor", "lines"), ("xrepo", f"self={repo}:HEAD")]:
            run(repo, CENSUS, *args, status=2, contains="did not read as a blob")
        run(repo, HOOKS / "loc-ratchet", status=2, contains="did not read as a blob")
        commit(repo, "fix: missing regular source", status=1, contains="did not read as a blob")
    if failures:
        print("\n".join(failures), file=sys.stderr)
        sys.exit(1)
    print(f"PASS: {checks} public CLI checks; normal Gitlink lifecycle; four census readers; growth/caps/syntax/missing-blob controls")
