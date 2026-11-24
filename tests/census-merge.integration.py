#!/usr/bin/env python3
"""No commit and no merge is refused for the code it adds; file size is advisory and function size is enforced: the real hooks, a temporary repository, a fake gh.

Usage: python3 tests/census-merge.integration.py [tool-root]
The commits run the hooks under git/hooks; the merge check is `loc-ratchet <merge-base>..<head> o/r#7`, as the merging tool calls it.
The merge check runs with origin https://github.com/o/r.git; commits run with no origin, so every commit ratchet runs.
GitHub is the only fake: CENSUS_GH names a gh that serves the PR's body, its comments and the repository from files, byte for
byte, and logs every call it receives.
"""
import json
import os
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parents[1]
HOOKS = ROOT / "git/hooks"
CENSUS = ROOT / "git/census/census"
PER_LINE = json.loads((pathlib.Path(__file__).resolve().parents[1] / "git/census/patterns.json").read_text())["tokensPerLine"]
PR = "o/r#7"
FAKE_GH = """#!/usr/bin/env python3
import json, pathlib, sys
args, here = sys.argv[1:], pathlib.Path(__file__).parent
with (here / "calls").open("a") as calls:
    calls.write(" ".join(args[:2]) + "\\n")
served = {"repos/o/r/issues/7": "body", "repos/o/r/issues/7/comments": "comments.json", "repos/o/r": "repo.json"}
source = here / served.get(args[1] if args[:1] == ["api"] and len(args) > 1 else "", "unserved")
if not source.exists():
    sys.exit(9)
text = source.read_bytes().decode()
print(json.dumps({"body": text}) if source.name == "body" else text)
"""


def lines(n, word="value"):
    """`n` code lines of exactly PER_LINE tokens each: `name = -i + 0 + 0`."""
    return "".join(f"{word}_{i} = {'-' * ((PER_LINE - 3) % 2)}{i}{' + 0' * ((PER_LINE - 3) // 2)}\n" for i in range(n))


with tempfile.TemporaryDirectory(prefix="census-merge-") as temporary:
    scratch = pathlib.Path(temporary)
    repo, config = scratch / "repo", scratch / "private/claude/config"
    config.mkdir(parents=True)
    (config / "gh").write_text(FAKE_GH)
    (config / "gh").chmod(0o755)
    (config / "census.env").write_text(f"CENSUS_GH={config / 'gh'}\n")
    env = dict(os.environ, DOTFILES_PRIVATE=str(scratch / "private"), XDG_CACHE_HOME=str(scratch / "cache"), GIT_ALLOW_TEST_IDENTITY="1",
               GIT_AUTHOR_NAME="f", GIT_AUTHOR_EMAIL="f@example.invalid", GIT_COMMITTER_NAME="f", GIT_COMMITTER_EMAIL="f@example.invalid")

    def run(*args, status=0, contains=None, cwd=None):
        result = subprocess.run([str(a) for a in args], cwd=cwd or repo, text=True, capture_output=True, env=env)
        if result.returncode != status or (contains and contains not in result.stdout + result.stderr):
            raise AssertionError(f"{args}: expected exit {status}, containing {contains!r}\n{result.stdout}\n{result.stderr}")
        return (result.stdout + result.stderr).strip()

    def commit(files, hooks="/dev/null", **expect):
        for path, text in files.items():
            (repo / path).parent.mkdir(parents=True, exist_ok=True)
            (repo / path).write_text(text) if text is not None else (repo / path).unlink()
        run("git", "add", "-A")
        out = run("git", "-c", f"core.hooksPath={hooks}", "commit", "-qm", "feat: change", **expect)
        return out if expect.get("status") else run("git", "rev-parse", "HEAD")

    def branch(name, files):
        run("git", "checkout", "-q", "-b", name, "main")
        return commit(files)

    def merge_check(pr=PR, origin="https://github.com/o/r.git", **expect):
        if origin:
            run("git", "remote", "add", "origin", origin)
        try:
            return run(HOOKS / "loc-ratchet", f"{run('git', 'merge-base', 'main', 'HEAD')}..HEAD", *([pr] if pr else []), **expect)
        finally:
            if origin:
                run("git", "remote", "remove", "origin")

    def reads():
        """The GitHub calls since the last look, as `api <endpoint>`."""
        log = config / "calls"
        found = log.read_text().splitlines() if log.exists() else []
        log.unlink(missing_ok=True)
        return found

    repo.mkdir()
    run("git", "init", "-q", "-b", "main")
    commit({"src/main.py": lines(40), "lib/main.py": lines(40), "src/literal.py": 'description = "@generated or DO NOT EDIT"\n'})

    run("git", "checkout", "-q", "-b", "grown", "main")
    (repo / "src/new.py").write_text(lines(600))
    (repo / "src/output.py").write_text("# @generated DO NOT EDIT\n" + lines(1001))
    (repo / "src/literal.py").write_text('description = "@generated or DO NOT EDIT"\n' + lines(1, "second"))
    run("git", "add", "-A")
    out = run("git", "-c", f"core.hooksPath={HOOKS}", "commit", "-qm", "feat: grow", contains="loc-ratchet: this change adds 601 production lines.")
    assert "Growth" not in out, out
    run("git", "init", "--bare", "-q", scratch / "origin.git")
    run("git", "-c", f"core.hooksPath={HOOKS}", "push", "-q", scratch / "origin.git", "HEAD:refs/heads/grown")
    assert "src/literal.py\t2\tlogic" in run(CENSUS, "files", ".", "HEAD") and "src/output.py\t1002\texempt" in run(CENSUS, "files", ".", "HEAD")
    reads()
    out = merge_check()
    assert "refusing" not in out and "Growth" not in out and reads() == [], (out, "a merge that adds 600 production lines read GitHub or was refused")
    print("PASS: a commit, a push and a merge that add 600 production lines are not refused, ask for no declaration and read GitHub never")

    run("git", "checkout", "-q", "-b", "caps", "main")
    commit({"src/large.py": lines(1001)}, hooks=HOOKS, contains="warning: src/large.py: 1001 lines (new file)")
    commit({"src/large.py": None, "src/function.py": "def large():\n" + "".join(f"    value_{i} = {i}\n" for i in range(301))},
           hooks=HOOKS, status=1, contains="fn-ratchet: refusing commit")
    run(CENSUS, "floors", ".", "main", "grown", "--floor", "lines", status=1, contains="REFUSED: may not rise")
    run("git", "reset", "-q", "--hard")
    branch("big-file", {"src/huge.py": lines(1001)})
    merge_check(contains="warning: src/huge.py: 1001 lines (new file)")
    print("PASS: an oversized file passes at commit and merge with a warning; the function limit and the census lines floor remain enforced")

    failed = []

    def wide_lines():
        run("git", "checkout", "-q", "-b", "wide", "main")
        (repo / "src/wide.py").write_text(f"message = '{'x' * 170}'\nsource = 'https://example.com/{'a' * 200}'\n")
        run("git", "add", "-A")
        warning = "loc-ratchet: warning: 1 added production lines over"
        run("git", "-c", f"core.hooksPath={HOOKS}", "commit", "-qm", "feat: wide", contains=f"{warning}")
        out = merge_check(pr=None, contains="  src/wide.py:1 (182 characters)")
        assert warning in out and "src/wide.py:2" not in out, out
        return "a 182-character line is a warning at the commit and at merge, which exits 0; a line whose excess is one URL is not flagged"

    def incomplete_python():
        for name, text in (("open-string", '"""unterminated\n'), ("open-call", "value = (\n")):
            branch(name, {"src/incomplete.py": text})
            merge_check(pr=None)
        return "incomplete Python strings and calls are counted without crashing the merge check"



    for case in (incomplete_python, wide_lines):
        try:
            print(f"PASS: {case()}")
        except AssertionError as why:
            failed.append(case.__name__)
            print(f"FAIL: {case.__name__}: {' '.join(str(why).split())[:400]}")
            run("git", "reset", "-q", "--hard")
    sys.exit(f"FAILED: {', '.join(failed)}" if failed else 0)
