#!/usr/bin/env python3
"""Growth is reported at a commit and enforced at merge: the real hooks and merge check, a temporary repository, a fake gh.

Usage: python3 tests/census-growth.integration.py [tool-root]
The commits run the hooks under git/hooks; the merge check is `loc-ratchet <merge-base>..<head> o/r#7`.
GitHub is the only fake: CENSUS_GH names a gh that serves the authenticated user and the PR's comments from a file.
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
LIMIT = json.loads((ROOT / "git/census/patterns.json").read_text())["growthLimit"]
PR = "o/r#7"
FAKE_GH = """#!/usr/bin/env python3
import json, pathlib, re, sys
args, state = sys.argv[1:], pathlib.Path(__file__).with_name("comments.json")
if args == ["api", "user"]:
    print(json.dumps({"login": "reviewer"}))
elif args == ["api", "repos/o/r/issues/7"] and state.exists():
    print(json.dumps({"body": state.with_name("body").read_text()}))
elif args[:3] == ["api", "repos/o/r/issues/7/comments", "--paginate"] and state.exists():
    login = re.search(r'\\.user\\.login == "([^"]+)"', args[-1])[1]
    for comment in json.loads(state.read_text()):
        if comment["user"] == login:
            print(json.dumps({"body": comment["body"]}))
else:
    sys.exit(9)
"""


def lines(n, word="value"):
    return "".join(f"{word}_{i} = {i}\n" for i in range(n))


with tempfile.TemporaryDirectory(prefix="census-growth-") as temporary:
    scratch = pathlib.Path(temporary)
    repo, config = scratch / "repo", scratch / "private/claude/config"
    config.mkdir(parents=True)
    (config / "gh").write_text(FAKE_GH)
    (config / "gh").chmod(0o755)
    (config / "census.env").write_text(f"CENSUS_GH={config / 'gh'}\n")
    env = dict(os.environ, DOTFILES_PRIVATE=str(scratch / "private"), XDG_CACHE_HOME=str(scratch / "cache"), GIT_ALLOW_TEST_IDENTITY="1",
               GIT_AUTHOR_NAME="f", GIT_AUTHOR_EMAIL="f@example.invalid", GIT_COMMITTER_NAME="f", GIT_COMMITTER_EMAIL="f@example.invalid")

    def run(*args, status=0, contains=None):
        result = subprocess.run([str(a) for a in args], cwd=repo, text=True, capture_output=True, env=env)
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

    def merge_check(pr=PR, **expect):
        return run(HOOKS / "loc-ratchet", f"{run('git', 'merge-base', 'main', 'HEAD')}..HEAD", *([pr] if pr else []), **expect)

    def comments(*rows):
        (config / "comments.json").write_text(json.dumps([{"user": user, "body": body} for user, body in rows]))

    repo.mkdir()
    comments()
    (config / "body").write_text("Adds a parser.\n\nRun ID: run_author\n")
    run("git", "init", "-q", "-b", "main")
    commit({"src/main.py": lines(40), "lib/main.py": lines(40), "old/dead.py": lines(LIMIT), "NOTES.md": lines(100, "note"),
            "src/literal.py": 'description = "@generated or DO NOT EDIT"\n'})

    # A commit and a push are never refused for growth: the real hooks print what the change adds.
    run("git", "checkout", "-q", "-b", "grown", "main")
    (repo / "src/new.py").write_text(lines(LIMIT + 10))
    (repo / "src/output.py").write_text("# @generated DO NOT EDIT\n" + lines(1001))
    (repo / "src/literal.py").write_text('description = "@generated or DO NOT EDIT"\nsecond = 2\n')
    run("git", "add", "-A")
    run("git", "-c", f"core.hooksPath={HOOKS}", "commit", "-qm", "feat: grow", contains=f"loc-ratchet: this change adds {LIMIT + 11} production lines")
    run("git", "init", "--bare", "-q", scratch / "origin.git")
    run("git", "-c", f"core.hooksPath={HOOKS}", "push", "-q", scratch / "origin.git", "HEAD:refs/heads/grown")
    assert "src/literal.py\t2\tlogic" in run(CENSUS, "files", ".", "HEAD") and "src/output.py\t1002\texempt" in run(CENSUS, "files", ".", "HEAD")
    print("PASS: a commit and a push that grow production are not refused; a quoted marker stays production, a generated header exempt")

    # Every other cap holds at the commit, and the lines floor has no approval.
    run("git", "checkout", "-q", "-b", "caps", "main")
    commit({"src/large.py": lines(1001)}, hooks=HOOKS, status=1, contains="1001 lines (new file)")
    commit({"src/large.py": None, "src/function.py": "def large():\n" + "".join(f"    value_{i} = {i}\n" for i in range(301))},
           hooks=HOOKS, status=1, contains="fn-ratchet: refusing commit")
    run(CENSUS, "floors", ".", "main", "grown", "--floor", "lines", status=1, contains="REFUSED: may not rise")
    run("git", "reset", "-q", "--hard")
    print("PASS: the file limit, the function limit and the census lines floor remain enforced")

    # At or under the limit merges with no approval; deletions anywhere offset additions anywhere.
    branch("small", {"src/new.py": lines(LIMIT)})
    merge_check(pr=None)
    branch("offset", {"src/new.py": lines(LIMIT), "lib/new.py": lines(LIMIT), "old/dead.py": None})
    merge_check(pr=None)
    branch("fix", {"src/new.py": lines(LIMIT + 10), "NOTES.md": lines(100 - LIMIT - 10, "note")})
    merge_check(pr=None)
    print(f"PASS: {LIMIT} production lines, {2 * LIMIT} offset by {LIMIT} deleted elsewhere, and growth that adds no net text merge unapproved")

    # Above it the merge is refused with the approval line filled in; one approval covers growth in two directories.
    head = branch("feature", {"src/new.py": lines(LIMIT), "lib/new.py": lines(LIMIT)})
    line = f"Growth approved: {PR} at {head}: "
    merge_check(status=1, contains=f"the PR adds {2 * LIMIT} production lines")
    merge_check(status=1, contains=line + "<why>\n  Session: <the reviewer's own>")
    merge_check(pr=None, status=1, contains="Growth approved: <owner>/<repo>#<number> at")
    signed = "\nSession: reviewer-1"
    comments(("reviewer", line + "<why>" + signed), ("reviewer", f"Growth approved: o/r#8 at {head}: another PR" + signed),
             ("author", line + "mine is new." + signed), ("reviewer", "Looks fine to me." + signed))
    merge_check(status=1, contains=line + "<why>")
    print("PASS: growth over the limit is refused; an unwritten why, another PR's approval and a comment by another account approve nothing")
    # The reviewer is not the author: the comment names a session or run, and not the one the PR's body names.
    written = line + "the parser is new and reuses nothing."
    comments(("reviewer", written), ("reviewer", written + "\nRun ID: run_author"), ("reviewer", written + "\nSession: <the reviewer's own>"),
             ("reviewer", written + signed + "\nRun ID: run_author"))
    merge_check(status=1, contains=line + "<why>")
    comments(("reviewer", written + signed))
    (config / "body").write_text("Adds a parser.\n")
    merge_check(status=1, contains="the PR's body carries no `Run ID:` or `Session:` line")
    (config / "body").write_text("Adds a parser.\n\nRun ID: run_author\n")
    print("PASS: an approval with no session line, with the PR's own, or on a PR whose body names no author approves nothing")
    comments(("reviewer", f"Reviewed.\r\n{written}\r\nSession: reviewer-1\r\n"))
    merge_check(contains=f"census: production growth approved at {head}")
    print("PASS: one approval at the head admits growth across two directories")

    # The approval holds for a descendant head while the PR grows at most the limit, the base merging in included.
    commit({"src/more.py": lines(LIMIT)})
    run("git", "checkout", "-q", "main")
    commit({"lib/base.py": lines(3 * LIMIT)})
    run("git", "checkout", "-q", "feature")
    run("git", "merge", "-q", "--no-edit", "main")
    merge_check(contains=f"census: production growth approved at {head}")
    later = commit({"src/more.py": lines(LIMIT + 1)})
    merge_check(status=1, contains=f"Growth approved: {PR} at {later}: <why>")
    print("PASS: an approval at an ancestor holds through small later growth and a base merge, and lapses one line past the limit")

    # A rewritten history is not a descendant, and a check that cannot read GitHub refuses.
    run("git", "checkout", "-q", "-B", "feature", "main")
    commit({"src/new.py": lines(LIMIT), "lib/new.py": lines(LIMIT)})
    merge_check(status=1, contains="refusing merge")
    (config / "comments.json").unlink()
    merge_check(status=2, contains="loc-ratchet: REFUSED: repos/o/r/issues/7 could not be read")
    merge_check(pr="not a pull request", status=2, contains="needs the pull request as <owner>/<repo>#<number>")
    print("PASS: a rewritten head needs a new approval; unreadable comments and an unnamed PR refuse the merge")
