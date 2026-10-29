#!/usr/bin/env python3
"""Real normal commits and push, with one exact-scope comment in the supplied private approval issue.

Usage: python3 tests/census-growth.integration.py /private/source.json [tool-root]
source.json contains the source object documented in git/census/README.md. This qualification posts
one derivative comment containing only its exact fixture scopes and the supplied authorization.
No hooks, identities, HOME or CODEX_HOME are disabled or replaced.
"""
import copy
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else pathlib.Path(__file__).resolve().parents[1]
HOOKS = ROOT / "git/hooks"
CENSUS = ROOT / "git/census/census"
SOURCE = json.loads(pathlib.Path(sys.argv[1]).read_text())


def run(cwd, *args, status=0, contains=None, data=None):
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True, input=data)
    if result.returncode != status or (contains and contains not in result.stdout + result.stderr):
        raise AssertionError(f"{args}: expected exit {status}, containing {contains!r}\n{result.stdout}\n{result.stderr}")
    return result.stdout.strip()


def write(repo, path, text):
    target = repo / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text)


def fixture(scratch, name, files, changed, areas):
    repo = scratch / name
    repo.mkdir()
    run(repo, "git", "init", "-q", "-b", "main")
    run(repo, "git", "config", "core.hooksPath", str(HOOKS))
    remote = scratch / f"{name}.git"
    run(scratch, "git", "init", "--bare", "-q", str(remote))
    run(repo, "git", "remote", "add", "origin", str(remote))
    for path, text in files.items():
        write(repo, path, text)
    run(repo, "git", "add", "-A")
    run(repo, "git", "commit", "-qm", "feat: base")
    run(repo, "git", "push", "origin", "HEAD:refs/heads/main", contains="ai-agent-hooks: hook=pre-push")
    for path, text in changed.items():
        write(repo, path, text)
    run(repo, "git", "add", "-A")
    record = {"repository": str(remote), "base": run(repo, "git", "rev-parse", "HEAD"),
              "tree": run(repo, "git", "write-tree"), "areas": areas}
    return repo, record


def approval(repo, record, source):
    path = repo.parent / f"{repo.name}-approval.json"
    record = {**record, "source": source}
    path.write_text(json.dumps(record))
    run(repo, "git", "config", "--local", "census.growthApproval", str(path))
    return path, record


def commit(repo, status=0, contains=None):
    return run(repo, "git", "commit", "-qm", "feat: scoped growth", status=status, contains=contains)


with tempfile.TemporaryDirectory(prefix="census-growth-") as temporary:
    scratch = pathlib.Path(temporary)
    exact = fixture(scratch, "exact-scope", {"src/main.py": "value = 1\n"},
                    {"src/main.py": "value = 1\nsecond = 2\n"}, {"src": 1})
    large = fixture(scratch, "hard-file", {"src/main.py": "value = 1\n"},
                    {"src/large.py": "".join(f"value_{i} = {i}\n" for i in range(1001))}, {"src": 1001})
    function = fixture(scratch, "hard-function", {"src/main.py": "value = 1\n"},
                       {"src/function.py": "def large():\n" + "".join(f"    value_{i} = {i}\n" for i in range(301))}, {"src": 302})
    literal = 'description = '"@generated" or "DO NOT EDIT"'\n'
    quoted_comment = '# The markers "@generated" and "DO NOT EDIT" are quoted.\nvalue = 1\n'
    marker, _ = fixture(scratch, "marker-mentions", {"src/main.py": literal, "src/comment.py": quoted_comment},
                        {"src/main.py": literal + "second = 2\n", "src/comment.py": quoted_comment + "third = 3\n"}, {"src": 2})
    commit(marker, status=1, contains="src gains 2 production lines")
    write(marker, "src/main.py", literal)
    write(marker, "src/comment.py", quoted_comment)
    write(marker, "src/output.py", "# @generated DO NOT EDIT\n" + "".join(f"value_{i} = {i}\n" for i in range(1001)))
    run(marker, "git", "add", "-A")
    marker_base = run(marker, "git", "rev-parse", "HEAD")
    commit(marker)
    run(marker, str(CENSUS), "floors", ".", marker_base, "HEAD", "--floor", "lines", "--floor", "god")
    listed = run(marker, str(CENSUS), "files", ".", "HEAD")
    assert "src/main.py\t1\tlogic" in listed and "src/comment.py\t2\tlogic" in listed and "src/output.py\t1002\texempt" in listed, listed
    print("PASS: quoted marker mentions remain production; actual comment headers remain generated")
    body = "".join(f"const item_{i} = {i};\n" for i in range(15))
    copies = fixture(scratch, "copies", {"src/first.ts": body}, {"src/second.ts": body}, {"src": 15})

    match = re.fullmatch(r"https://github.com/([^/]+/[^/]+)/(?:issues|pull)/([1-9]\d*)#issuecomment-([1-9]\d*)", SOURCE["url"])
    assert match, "qualification needs a real cited GitHub approval comment"
    original = json.loads(run(scratch, "gh-drew", "api", f"repos/{match[1]}/issues/comments/{match[3]}"))
    assert original["user"]["login"] == json.loads(run(scratch, "gh-drew", "api", "user"))["login"]
    assert SOURCE["quote"] in original["body"] and hashlib.sha256(original["body"].encode()).hexdigest() == SOURCE["sha256"]
    body = f"Normal-hook qualification. Existing requester authorization: {SOURCE['url']}\n\n{SOURCE['quote']}\n\n"
    body += "\n\n".join("```census-growth-approval\n" + json.dumps(record, indent=2, sort_keys=True) + "\n```" for _, record in (exact, large, function, copies))
    comment = json.loads(run(scratch, "gh-drew", "api", f"repos/{match[1]}/issues/{match[2]}/comments", "--method", "POST", "--input", "-", data=json.dumps({"body": body})))
    source = {"url": comment["html_url"], "sha256": hashlib.sha256(comment["body"].encode()).hexdigest(), "quote": SOURCE["quote"]}
    print(f"Qualification scope source: {source['url']}")

    repo, scope = exact
    commit(repo, status=1, contains="src gains 1 production lines")
    path, record = approval(repo, scope, source)
    for field, value in (("repository", "wrong"), ("base", "0" * 40), ("tree", "0" * 40), ("areas", {"other": 1}), ("areas", {"src": True})):
        path.write_text(json.dumps({**record, field: value}))
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
    fresh = {**scope, "tree": run(repo, "git", "write-tree"), "areas": {"src": 2}}
    approval(repo, fresh, source)
    commit(repo, status=1, contains="fetched source does not approve this scope")
    run(repo, "git", "rm", "-q", "--cached", "src/extra.py")
    (repo / "src/extra.py").unlink()
    path.write_text(json.dumps(record))
    commit(repo)
    base = record["base"]
    run(repo, str(HOOKS / "loc-ratchet"), f"{base}..HEAD")
    run(repo, "git", "push", "origin", "HEAD:refs/heads/main", contains="ai-agent-hooks: hook=pre-push")
    assert run(repo, "git", "--git-dir", record["repository"], "rev-parse", "refs/heads/main") == run(repo, "git", "rev-parse", "HEAD")
    result = run(repo, str(CENSUS), "floors", ".", base, "HEAD", "--floor", "lines", "--floor", "god", "--growth-approval", str(path))
    assert "approved growth" in result and '"prod_lines": 1' in result, result
    run(repo, str(CENSUS), "floors", ".", base, "HEAD", "--floor", "lines", status=1, contains="REFUSED: may not rise")
    run(repo, "git", "config", "--unset", "census.growthApproval")
    write(repo, "src/main.py", "value = 1\nsecond = 2\nfourth = 4\n")
    run(repo, "git", "add", "-A")
    commit(repo, status=1, contains="src gains 1 production lines")
    print("PASS: exact comment-bound scope; forged fresh local scope refused; normal commit/range/push; truthful Census")

    repo, scope = large
    approval(repo, scope, source)
    commit(repo, status=1, contains="1001 lines (new file)")
    print("PASS: valid growth approval never exempts the hard file limit")

    repo, scope = function
    path, record = approval(repo, scope, source)
    commit(repo, status=1, contains="fn-ratchet: refusing commit")
    run(repo, str(CENSUS), "floors", ".", record["base"], record["tree"], "--floor", "lines", "--floor", "god", "--growth-approval", str(path), status=1, contains="REFUSED: may not rise")
    print("PASS: normal downstream function hook and Census god floor remain enforced")

    repo, scope = copies
    path, record = approval(repo, scope, source)
    run(repo, str(CENSUS), "floors", ".", record["base"], record["tree"], "--floor", "lines", "--floor", "copies", "--growth-approval", str(path), status=1, contains="REFUSED: may not rise")
    print("PASS: exact growth approval preserves the duplication floor")
