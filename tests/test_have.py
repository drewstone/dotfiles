"""have answers "do we already have X?" from each repository's default branch, never its working tree.

The fixture is a stale clone of a repository whose origin gained a file after the clone, with the
tracked files deleted from the working tree; the GitHub CLI is a script that serves canned answers.
"""
import json
import os
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path

TOOL = Path(__file__).resolve().parent.parent / "claude" / "tools" / "have"
SLUG = "acme/widgets"

WORKFLOW = "name: Benchmark (Staging)\non: workflow_dispatch\njobs:\n  run:\n    steps:\n      - run: pnpm bench\n"
FAKE_GH = textwrap.dedent('''\
    #!/usr/bin/env python3
    import json, os, sys
    path = sys.argv[2]
    with open(os.environ["FAKE_GH_LOG"], "a") as log:
        log.write(path + "\\n")
    flows = [{"id": 1000 + i, "name": f"filler {i}", "path": f".github/workflows/filler-{i}.yml", "state": "active"}
             for i in range(100)]
    wanted = {"id": 7, "name": "Benchmark (Staging)", "path": ".github/workflows/benchmark-staging.yml",
              "state": "disabled_manually"}
    if "/actions/workflows?" in path:
        page = int(path.rsplit("page=", 1)[1])
        print(json.dumps({"total_count": 101, "workflows": flows if page == 1 else [wanted]}))
    elif path.endswith("/workflows/7/runs?per_page=1"):
        print(json.dumps({"workflow_runs": [{"conclusion": "failure", "created_at": "2026-09-08T10:00:00Z"}]}))
    else:
        sys.stderr.write("unexpected " + path + "\\n")
        sys.exit(1)
''')


def git(cwd, *args):
    return subprocess.run(["git", "-c", "core.hooksPath=/dev/null", *args], cwd=cwd, check=True,
                          capture_output=True, text=True).stdout.strip()


class HaveTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        for name in ("GIT_AUTHOR_NAME", "GIT_COMMITTER_NAME"):
            os.environ[name] = "t"
        for name in ("GIT_AUTHOR_EMAIL", "GIT_COMMITTER_EMAIL"):
            os.environ[name] = "t@example.invalid"
        self.env = {**os.environ, "HOME": str(self.base / "home"), "GIT_CONFIG_GLOBAL": "/dev/null",
                    "HAVE_CACHE_DIR": str(self.base / "cache"), "FAKE_GH_LOG": str(self.base / "gh.log"),
                    "GH": str(self.base / "fake-gh"), "COLUMNS": "200"}
        self.env.pop("HAVE_CONFIG", None)
        (self.base / "home").mkdir()
        (self.base / "fake-gh").write_text(FAKE_GH)
        (self.base / "fake-gh").chmod(0o755)
        self.origin = self.base / "origin.git"
        git(self.base, "init", "-q", "--bare", "-b", "main", str(self.origin))
        self.seed = self.base / "seed"
        git(self.base, "clone", "-q", str(self.origin), str(self.seed))
        self.write(self.seed, {
            "products/sandbox/evals/run.ts": "export const presets = []\n",
            "products/sandbox/evals/perf-gate.ts": "export const gate = 1\n",
            ".github/workflows/benchmark-staging.yml": WORKFLOW,
            "package.json": json.dumps({"scripts": {"eval:ci": "pnpm --dir products/sandbox/evals run", "lint": "x"}}),
            "docs/readme.md": "Nothing to see.\n",
        })
        git(self.seed, "add", "-A")
        git(self.seed, "commit", "-q", "-m", "one")
        git(self.seed, "push", "-q", "origin", "HEAD:main")
        self.roots = self.base / "roots"
        self.roots.mkdir()
        self.repo = self.clone("widgets")
        # The checkout is stale and sparse: origin moves on and the tracked files leave the tree.
        self.write(self.seed, {"tools/ledger-view.ts": "export const ledger = 1\n"})
        git(self.seed, "add", "-A")
        git(self.seed, "commit", "-q", "-m", "two")
        git(self.seed, "push", "-q", "origin", "HEAD:main")
        git(self.repo, "rm", "-rq", "--cached", "products")
        subprocess.run(["rm", "-rf", str(self.repo / "products")], check=True)

    def tearDown(self):
        self.tmp.cleanup()

    @staticmethod
    def write(root, files):
        for name, text in files.items():
            path = Path(root) / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)

    def clone(self, name, origin_url=f"https://github.com/{SLUG}.git"):
        repo = self.roots / name
        git(self.roots, "clone", "-q", str(self.origin), str(repo))
        git(repo, "config", f"url.{self.origin}.insteadOf", origin_url)
        git(repo, "remote", "set-url", "origin", origin_url)
        return repo

    def config(self, text=""):
        path = self.base / "config"
        path.write_text(f"root = {self.roots}\ngh = {self.base / 'fake-gh'}\n" + text)
        return path

    def have(self, *args, config=None, env=None):
        cmd = [str(TOOL), "--config", str(config or self.config()), *args]
        return subprocess.run(cmd, env={**self.env, **(env or {})}, capture_output=True, text=True, cwd=self.base)

    def gh_calls(self):
        log = self.base / "gh.log"
        return log.read_text().splitlines() if log.exists() else []

    def test_reads_the_default_branch_after_a_fetch_not_the_working_tree(self):
        r = self.have("eval", "harness")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("products/sandbox/evals/", r.stdout, "deleted from the working tree, tracked on origin/main")
        self.assertIn("perf-gate.ts", r.stdout)
        r = self.have("ledger")
        self.assertIn(f"{SLUG}:tools/   1 file; e.g. ledger-view.ts", r.stdout, "pushed after the clone: needs the fetch")
        self.assertIn("1 fetched", r.stdout)

    def test_no_fetch_reads_the_refs_as_they_are(self):
        r = self.have("--no-fetch", "ledger")
        self.assertEqual(r.returncode, 1, "the new file is not in the stale ref")
        self.assertIn("NO HITS", r.stdout)
        self.assertIn("1 not refreshed", r.stdout)

    def test_synonyms_widen_a_term_and_one_concept_covers_its_family(self):
        r = self.have("--offline", "sandbox", "latency")
        self.assertIn("sandbox | latency (also eval*", r.stdout)
        self.assertIn("products/sandbox/evals/", r.stdout, "latency reaches evals through the family")
        self.assertIn("eval", self.have("--offline", "eval", "bench").stdout.split("concepts:")[1].split("\n")[0])

    def test_workflow_state_and_latest_run_come_from_the_api_with_pagination(self):
        r = self.have("benchmark", "staging")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn(f"{SLUG}:.github/workflows/benchmark-staging.yml   disabled_manually; last run failure 2026-09-08",
                      r.stdout)
        calls = self.gh_calls()
        self.assertEqual([c for c in calls if "/workflows?" in c],
                         [f"repos/{SLUG}/actions/workflows?per_page=100&page=1",
                          f"repos/{SLUG}/actions/workflows?per_page=100&page=2"],
                         "the workflow is on page 2 of 2, and the listing stops there")
        self.assertEqual(len([c for c in calls if c.endswith("/runs?per_page=1")]), 1)

    def test_a_second_run_is_answered_from_the_cache(self):
        self.have("benchmark", "staging")
        before = len(self.gh_calls())
        r = self.have("benchmark", "staging")
        self.assertEqual(len(self.gh_calls()), before)
        self.assertIn("0 API calls, 3 answered from cache", r.stdout)
        self.have("benchmark", "staging", "--refresh")
        self.assertGreater(len(self.gh_calls()), before)

    def test_offline_makes_no_api_call_and_says_the_state_was_not_read(self):
        r = self.have("--offline", "benchmark", "staging")
        self.assertEqual(self.gh_calls(), [])
        self.assertIn("benchmark-staging.yml   state unread", r.stdout)
        self.assertIn("github: not read (offline)", r.stdout)

    def test_the_budget_stops_the_reads_and_says_so(self):
        r = self.have("benchmark", "staging", env={"HAVE_GH_BUDGET": "1"})
        self.assertEqual(len(self.gh_calls()), 1)
        self.assertIn("call budget of 1 used", r.stdout)
        self.assertIn("benchmark-staging.yml   state unread", r.stdout)

    def test_scripts_match_by_name_or_command(self):
        r = self.have("--offline", "--only", "scripts", "eval")
        self.assertIn("package.json   scripts.eval:ci = pnpm --dir products/sandbox/evals run", r.stdout)
        self.assertNotIn("scripts.lint", r.stdout)

    def test_content_needs_a_word_of_every_concept(self):
        self.write(self.seed, {"docs/design.md": "The sandbox needs a harness.\nsandbox again\n", "docs/other.md": "sandbox only\n"})
        git(self.seed, "add", "-A")
        git(self.seed, "commit", "-q", "-m", "three")
        git(self.seed, "push", "-q", "origin", "HEAD:main")
        r = self.have("--only", "content", "sandbox", "harness")
        self.assertIn("widgets:docs/design.md   2 matching lines", r.stdout.replace(f"{SLUG}:", "widgets:"))
        self.assertNotIn("docs/other.md", r.stdout)

    def test_clones_of_one_origin_count_once(self):
        self.clone("widgets-again")
        r = self.have("--offline", "eval")
        self.assertIn("searched: 1 repositories", r.stdout)

    def test_in_narrows_the_sweep_to_matching_repositories(self):
        other = self.roots / "scratch"
        git(self.roots, "init", "-q", "-b", "main", str(other))
        self.write(other, {"eval/notes.md": "x\n"})
        git(other, "add", "-A")
        git(other, "commit", "-q", "-m", "one")
        both = self.have("--offline", "eval")
        self.assertIn("searched: 2 repositories", both.stdout)
        only = self.have("--offline", "--in", "widgets", "eval")
        self.assertIn("searched: 1 repositories", only.stdout)
        self.assertNotIn("scratch:", only.stdout)

    def test_a_checkout_without_origin_is_read_at_its_local_branch_and_named(self):
        local = self.roots / "scratch"
        git(self.roots, "init", "-q", "-b", "main", str(local))
        self.write(local, {"eval/notes.md": "x\n"})
        git(local, "add", "-A")
        git(local, "commit", "-q", "-m", "one")
        r = self.have("--offline", "eval")
        self.assertIn("scratch:eval/", r.stdout)
        self.assertIn("1 checkouts: local branch: scratch", r.stdout)

    def test_a_json_task_list_is_matched_by_title_and_text(self):
        listing = json.dumps([
            {"id": 44, "title": "Sandbox resume latency census", "state": "RUNNING", "next_action": "x"},
            {"id": 45, "title": "Unrelated", "state": "DONE", "repo_surface": "sandbox bench lane"},
            {"id": 46, "title": "Nothing", "state": "DONE"},
        ])
        (self.base / "tasks.json").write_text(listing)
        cfg = self.config(f"tasks board = cat {self.base / 'tasks.json'}\n")
        r = self.have("--only", "boards", "sandbox", "latency", config=cfg)
        self.assertIn("tasks:board #44   [RUNNING] Sandbox resume latency census", r.stdout)
        self.assertIn("tasks:board #45", r.stdout)
        self.assertNotIn("#46", r.stdout)
        self.assertLess(r.stdout.index("#44"), r.stdout.index("#45"), "a title match outranks a text match")

    def test_a_text_task_list_survives_a_block_reason_at_column_zero(self):
        (self.base / "tasks.txt").write_text(textwrap.dedent('''\
              ● #10 [RUNNING] first task
                 next: nothing
              ✗ #11 [BLOCKED] second task
                 block: stuck because
            (1) a wrapped line at column zero mentions a sandbox
            (2) and another
              ○ #12 [INBOX] sandbox eval harness lane
                 repo: acme/widgets
            '''))
        cfg = self.config(f"tasks board = cat {self.base / 'tasks.txt'}\n")
        r = self.have("--only", "boards", "sandbox", config=cfg)
        self.assertIn("tasks:board #12   [INBOX] sandbox eval harness lane", r.stdout)
        self.assertIn("tasks:board #11", r.stdout, "the wrapped lines belong to the task above them")
        self.assertNotIn("line ", r.stdout)

    def test_notes_name_the_file_and_the_best_line(self):
        notes = self.base / "notes"
        self.write(notes, {"2026-10-feedback.md": "intro\nthe sandbox eval harness exists\n", "other.md": "nothing\n"})
        cfg = self.config(f"notes memo = {notes}\n")
        r = self.have("--only", "boards", "sandbox", "harness", config=cfg)
        self.assertIn("notes:memo:2026-10-feedback.md:2   the sandbox eval harness exists", r.stdout)
        self.assertNotIn("other.md", r.stdout)

    def test_no_hits_says_what_was_searched_and_exits_1(self):
        r = self.have("--offline", "zzzquux")
        self.assertEqual(r.returncode, 1)
        self.assertIn("NO HITS", r.stdout)
        self.assertIn("searched: 1 repositories", r.stdout)

    def test_a_task_command_that_fails_is_reported_not_fatal(self):
        r = self.have("--offline", "eval", config=self.config("tasks broken = exit 3\n"))
        self.assertEqual(r.returncode, 0)
        self.assertIn("tasks broken: `exit 3` failed", r.stdout)

    def test_terminal_control_characters_in_repository_text_are_not_printed(self):
        self.write(self.seed, {"docs/eval\x1b[2Jreport.md": "x\n"})
        git(self.seed, "add", "-A")
        git(self.seed, "commit", "-q", "-m", "evil")
        git(self.seed, "push", "-q", "origin", "HEAD:main")
        r = self.have("eval")
        self.assertNotIn("\x1b", r.stdout)

    def test_usage_errors_exit_2(self):
        self.assertEqual(self.have().returncode, 2)
        self.assertEqual(self.have("--only", "nonsense", "eval").returncode, 2)
        missing = subprocess.run([str(TOOL), "--config", str(self.base / "nope"), "eval"], env=self.env,
                                 capture_output=True, text=True)
        self.assertEqual(missing.returncode, 2)

    def test_help_documents_the_config_format(self):
        r = subprocess.run([str(TOOL), "--help"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0)
        for key in ("root =", "repo =", "github =", "tasks <label>", "notes <label>", "synonyms ="):
            self.assertIn(key, r.stdout)


if __name__ == "__main__":
    unittest.main()
