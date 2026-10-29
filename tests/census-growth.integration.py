#!/usr/bin/env python3
"""Real commits through the complete maintained hook chain, with a live cited approval source.

Usage: python3 tests/census-growth.integration.py /private/source.json
source.json contains the source object documented in git/census/README.md.
No hooks, identities, HOME or CODEX_HOME are disabled or replaced.
"""
import copy
import json
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else pathlib.Path(__file__).resolve().parents[1]
HOOKS = ROOT / "git/hooks"
CENSUS = ROOT / "git/census/census"
SOURCE = json.loads(pathlib.Path(sys.argv[1]).read_text())


def run(cwd, *args, status=0, contains=None):
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True)
    if result.returncode != status or (contains and contains not in result.stdout + result.stderr):
        raise AssertionError(f"{args}: expected exit {status}, containing {contains!r}\n{result.stdout}\n{result.stderr}")
    return result.stdout.strip()


def write(repo, path, text):
    target = repo / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text)


def fixture(scratch, name, files):
    repo = scratch / name
    repo.mkdir()
    run(repo, "git", "init", "-q", "-b", "main")
    run(repo, "git", "config", "core.hooksPath", str(HOOKS))
    run(repo, "git", "remote", "add", "origin", f"https://github.com/example/{name}.git")
    for path, text in files.items():
        write(repo, path, text)
    run(repo, "git", "add", "-A")
    run(repo, "git", "commit", "-qm", "feat: base")
    return repo


def approval(repo, areas):
    record = {"repository": run(repo, "git", "remote", "get-url", "origin"),
              "base": run(repo, "git", "rev-parse", "HEAD"), "tree": run(repo, "git", "write-tree"),
              "areas": areas, "source": SOURCE}
    path = repo.parent / f"{repo.name}-approval.json"
    path.write_text(json.dumps(record))
    run(repo, "git", "config", "--local", "census.growthApproval", str(path))
    return path, record


def commit(repo, status=0, contains=None):
    return run(repo, "git", "commit", "-qm", "feat: scoped growth", status=status, contains=contains)


with tempfile.TemporaryDirectory(prefix="census-growth-") as temporary:
    scratch = pathlib.Path(temporary)
    repo = fixture(scratch, "exact-scope", {"src/main.py": "value = 1\n"})
    write(repo, "src/main.py", "value = 1\nsecond = 2\n")
    run(repo, "git", "add", "-A")
    commit(repo, status=1, contains="src gains 1 production lines")
    path, record = approval(repo, {"src": 1})
    for field, value in (("repository", "wrong"), ("base", "0" * 40), ("tree", "0" * 40), ("areas", {"other": 1}), ("areas", {"src": True})):
        bad = {**record, field: value}
        path.write_text(json.dumps(bad))
        commit(repo, status=1, contains="growth approval does not match")
    for field, value in (("url", "https://example.invalid/approval"), ("sha256", "0" * 64), ("quote", "missing explicit authorization")):
        bad = copy.deepcopy(record)
        bad["source"][field] = value
        path.write_text(json.dumps(bad))
        commit(repo, status=1, contains="growth approval source")
    path.write_text(json.dumps(record))
    write(repo, "src/extra.py", "third = 3\n")
    run(repo, "git", "add", "-A")
    commit(repo, status=1, contains="growth approval does not match")
    run(repo, "git", "rm", "-q", "--cached", "src/extra.py")
    (repo / "src/extra.py").unlink()
    commit(repo)
    base = record["base"]
    run(repo, str(HOOKS / "loc-ratchet"), f"{base}..HEAD")
    result = run(repo, str(CENSUS), "floors", ".", base, "HEAD", "--floor", "lines", "--floor", "god", "--growth-approval", str(path))
    assert "approved growth" in result and '"prod_lines": 1' in result, result
    run(repo, str(CENSUS), "floors", ".", base, "HEAD", "--floor", "lines", status=1, contains="REFUSED: may not rise")
    run(repo, "git", "config", "--unset", "census.growthApproval")
    write(repo, "src/main.py", "value = 1\nsecond = 2\nfourth = 4\n")
    run(repo, "git", "add", "-A")
    commit(repo, status=1, contains="src gains 1 production lines")
    print("PASS: default, exact scope, changed tree, wrong source, range and truthful Census")

    repo = fixture(scratch, "hard-file", {"src/main.py": "value = 1\n"})
    write(repo, "src/large.py", "".join(f"value_{i} = {i}\n" for i in range(1001)))
    run(repo, "git", "add", "-A")
    approval(repo, {"src": 1001})
    commit(repo, status=1, contains="1001 lines (new file)")
    print("PASS: valid growth approval never exempts the hard file limit")

    repo = fixture(scratch, "hard-function", {"src/main.py": "value = 1\n"})
    write(repo, "src/function.py", "def large():\n" + "".join(f"    value_{i} = {i}\n" for i in range(301)))
    run(repo, "git", "add", "-A")
    path, record = approval(repo, {"src": 302})
    commit(repo, status=1, contains="fn-ratchet: refusing commit")
    run(repo, str(CENSUS), "floors", ".", record["base"], record["tree"], "--floor", "lines", "--floor", "god", "--growth-approval", str(path), status=1, contains="REFUSED: may not rise")
    print("PASS: normal downstream function hook and Census god floor remain enforced")

    repo = fixture(scratch, "copies", {"src/first.ts": "".join(f"const item_{i} = {i};\n" for i in range(15))})
    write(repo, "src/second.ts", (repo / "src/first.ts").read_text())
    run(repo, "git", "add", "-A")
    path, record = approval(repo, {"src": 15})
    run(repo, str(CENSUS), "floors", ".", record["base"], record["tree"], "--floor", "lines", "--floor", "copies", "--growth-approval", str(path), status=1, contains="REFUSED: may not rise")
    print("PASS: exact growth approval preserves the duplication floor")
