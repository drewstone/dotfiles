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
PER_LINE = json.loads((pathlib.Path(__file__).resolve().parents[1] / "git/census/patterns.json").read_text())["tokensPerLine"]
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
    """`n` code lines of exactly PER_LINE tokens each: `name = -i + 0 + 0`."""
    return "".join(f"{word}_{i} = {'-' * ((PER_LINE - 3) % 2)}{i}{' + 0' * ((PER_LINE - 3) // 2)}\n" for i in range(n))


with tempfile.TemporaryDirectory(prefix="census-growth-") as temporary:
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

    run("git", "checkout", "-q", "-b", "grown", "main")
    (repo / "src/new.py").write_text(lines(LIMIT + 10))
    (repo / "src/output.py").write_text("# @generated DO NOT EDIT\n" + lines(1001))
    (repo / "src/literal.py").write_text('description = "@generated or DO NOT EDIT"\n' + lines(1, "second"))
    run("git", "add", "-A")
    run("git", "-c", f"core.hooksPath={HOOKS}", "commit", "-qm", "feat: grow", contains=f"loc-ratchet: this change adds {LIMIT + 11} production lines")
    run("git", "init", "--bare", "-q", scratch / "origin.git")
    run("git", "-c", f"core.hooksPath={HOOKS}", "push", "-q", scratch / "origin.git", "HEAD:refs/heads/grown")
    assert "src/literal.py\t2\tlogic" in run(CENSUS, "files", ".", "HEAD") and "src/output.py\t1002\texempt" in run(CENSUS, "files", ".", "HEAD")
    print("PASS: a commit and a push that grow production are not refused; a quoted marker stays production, a generated header exempt")

    run("git", "checkout", "-q", "-b", "caps", "main")
    commit({"src/large.py": lines(1001)}, hooks=HOOKS, status=1, contains="1001 lines (new file)")
    commit({"src/large.py": None, "src/function.py": "def large():\n" + "".join(f"    value_{i} = {i}\n" for i in range(301))},
           hooks=HOOKS, status=1, contains="fn-ratchet: refusing commit")
    run(CENSUS, "floors", ".", "main", "grown", "--floor", "lines", status=1, contains="REFUSED: may not rise")
    run("git", "reset", "-q", "--hard")
    print("PASS: the file limit, the function limit and the census lines floor remain enforced")

    for extra in (0, PER_LINE // 2, 1, PER_LINE // 2 + 1):
        branch(f"small-{extra}", {"src/new.py": lines(LIMIT) + "pass\n" * extra})
        merge_check(pr=None, status=int(extra > 0))
    branch("offset", {"src/new.py": lines(LIMIT), "lib/new.py": lines(LIMIT), "old/dead.py": None})
    merge_check(pr=None)
    print(f"PASS: {LIMIT} production lines merge unapproved, every extra token needs approval, and production deletions offset additions")

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

    commit({"src/more.py": lines(LIMIT)})
    run("git", "checkout", "-q", "main")
    commit({"lib/base.py": lines(3 * LIMIT)})
    run("git", "checkout", "-q", "feature")
    run("git", "merge", "-q", "--no-edit", "main")
    merge_check(contains=f"census: production growth approved at {head}")
    later = commit({"src/more.py": lines(LIMIT + 1)})
    merge_check(status=1, contains=f"Growth approved: {PR} at {later}: <why>")
    print("PASS: an approval at an ancestor holds through small later growth and a base merge, and lapses one line past the limit")

    run("git", "checkout", "-q", "-B", "feature", "main")
    commit({"src/new.py": lines(LIMIT), "lib/new.py": lines(LIMIT)})
    merge_check(status=1, contains="refusing merge")
    (config / "comments.json").unlink()
    merge_check(status=2, contains="loc-ratchet: REFUSED: repos/o/r/issues/7 could not be read")
    merge_check(pr="not a pull request", status=2, contains="needs the pull request as <owner>/<repo>#<number>")
    print("PASS: a rewritten head needs a new approval; unreadable comments and an unnamed PR refuse the merge")

    comments()

    def tokens_not_lines():
        args = ", ".join(["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa"])
        charged = round(6 * 24 / PER_LINE)  # six calls of 24 tokens each
        for name, call in (("packed", "total_{} = combine(" + args + ")\n"), ("wrapped", "total_{} = combine(\n    " + args.replace(", ", ",\n    ") + "\n)\n")):
            run("git", "checkout", "-q", "-b", name, "main")
            (repo / "src/calls.py").write_text("".join(call.format(i) for i in range(6)))
            run("git", "add", "-A")
            run("git", "-c", f"core.hooksPath={HOOKS}", "commit", "-qm", "feat: calls", contains=f"this change adds {charged} production lines")
            merge_check(pr=None)
        return f"six calls on 6 lines and wrapped on 72 both charge {charged} lines and merge unapproved"

    def comments_pay_nothing():
        run("git", "checkout", "-q", "main")
        commit({"src/documented.py": '"""' + "Explains the module.\n" * 60 + '"""\n' + "# A note.\n" * 60 + lines(1)})
        branch("uncommented", {"src/documented.py": lines(1), "src/added.py": lines(LIMIT + 10)})
        merge_check(status=1, contains=f"the PR adds {LIMIT + 10} production lines")
        return f"deleting a 61-line docstring and 60 comment lines pays for none of {LIMIT + 10} new lines"

    def tests_do_not_pay():
        run("git", "checkout", "-q", "main")
        commit({"tests/test_old.py": lines(758, "check")})
        branch("retired", {"tests/test_old.py": None, "src/feature.py": lines(227)})
        merge_check(status=1, contains="the PR adds 227 production lines")
        return "227 production lines with 758 test lines deleted need an approval"

    def restores():
        run("git", "checkout", "-q", "main")
        commit({"src/kept.py": lines(300, "kept")})
        deleting = commit({"src/kept.py": None})
        branch("uncited", {"src/kept.py": lines(300, "kept")})
        merge_check(status=1, contains="the PR adds 300 production lines")
        for name, extra in (("cited", ""), ("cited-more", lines(LIMIT + 1, "fresh"))):
            run("git", "checkout", "-q", "-b", name, "main")
            (repo / "src/kept.py").write_text(lines(300, "kept") + extra)
            run("git", "add", "-A")
            run("git", "-c", "core.hooksPath=/dev/null", "commit", "-qm", f"fix: bring the parser back\n\nRestores: {deleting}")
        merge_check(status=1, contains=f"the PR adds {LIMIT + 1} production lines")
        run("git", "checkout", "-q", "cited")
        merge_check(contains="300 code lines restore deleted code: charged 0")
        return f"an uncited restore of 300 lines charges 300; cited, it charges 0, and {LIMIT + 1} new lines beside it charge {LIMIT + 1}"

    def blobless_clone_refuses_restore():  # reads the branches restores() made
        clone = scratch / "blobless"
        run("git", "config", "uploadpack.allowFilter", "true")
        run("git", "clone", "-q", "--no-local", "--no-checkout", "--filter=blob:none", f"file://{repo}", clone)
        fork = run("git", "merge-base", "origin/main", "origin/cited-more", cwd=clone)
        out = run(HOOKS / "loc-ratchet", f"{fork}..origin/cited-more", PR, cwd=clone, status=1, contains=f"the PR adds {300 + LIMIT + 1} production lines")
        assert "no restore credit from" in out, out
        return "a clone without the deleted blobs refuses the restore claim and charges it in full"

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


    failed = []
    for case in (incomplete_python, tokens_not_lines, comments_pay_nothing, tests_do_not_pay, restores, blobless_clone_refuses_restore, wide_lines):
        try:
            print(f"PASS: {case()}")
        except AssertionError as why:
            failed.append(case.__name__)
            print(f"FAIL: {case.__name__}: {' '.join(str(why).split())[:400]}")
            run("git", "reset", "-q", "--hard")
    sys.exit(f"FAILED: {', '.join(failed)}" if failed else 0)
