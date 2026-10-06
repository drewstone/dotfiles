import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "git" / "main-checkout-ff" / "main-checkout-ff"


def git(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


class MainCheckoutFfTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.home = base / "home"
        self.root = base / "code"
        self.home.mkdir()
        self.root.mkdir()
        self.env = {**os.environ, "HOME": str(self.home), "MAIN_CHECKOUT_ROOTS": str(self.root),
                    "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com",
                    "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com",
                    "GIT_CONFIG_GLOBAL": "/dev/null"}
        os.environ.update({k: self.env[k] for k in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                                                     "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL")})
        self.origin = base / "origin.git"
        git(base, "init", "-q", "--bare", "-b", "main", str(self.origin))
        seed = base / "seed"
        git(base, "clone", "-q", str(self.origin), str(seed))
        (seed / "a.txt").write_text("1\n")
        git(seed, "add", "a.txt")
        git(seed, "commit", "-q", "-m", "one")
        git(seed, "push", "-q", "origin", "HEAD:main")
        self.seed = seed

    def tearDown(self):
        self.tmp.cleanup()

    def clone(self, name):
        repo = self.root / name
        git(self.root, "clone", "-q", str(self.origin), str(repo))
        return repo

    def advance_origin(self):
        (self.seed / "a.txt").write_text("2\n")
        git(self.seed, "commit", "-q", "-am", "two")
        git(self.seed, "push", "-q", "origin", "HEAD:main")
        return git(self.seed, "rev-parse", "HEAD")

    def run_ff(self, *args):
        return subprocess.run([str(SCRIPT), *args], env=self.env, capture_output=True, text=True, cwd=self.tmp.name)

    def test_fast_forwards_clean_default_branch_and_keeps_untracked(self):
        repo = self.clone("clean")
        (repo / "notes.txt").write_text("keep me\n")
        target = self.advance_origin()
        self.run_ff()
        self.assertEqual(git(repo, "rev-parse", "HEAD"), target)
        self.assertEqual((repo / "notes.txt").read_text(), "keep me\n")

    def test_learns_default_branch_when_origin_head_is_missing(self):
        repo = self.clone("no-origin-head")
        git(repo, "remote", "set-head", "origin", "--delete")
        target = self.advance_origin()
        self.run_ff()
        self.assertEqual(git(repo, "rev-parse", "HEAD"), target)

    def test_leaves_tracked_changes_alone(self):
        repo = self.clone("dirty")
        (repo / "a.txt").write_text("local edit\n")
        before = git(repo, "rev-parse", "HEAD")
        self.advance_origin()
        self.run_ff()
        self.assertEqual(git(repo, "rev-parse", "HEAD"), before)
        self.assertEqual((repo / "a.txt").read_text(), "local edit\n")

    def test_leaves_feature_branch_alone(self):
        repo = self.clone("feature")
        git(repo, "switch", "-q", "-c", "feat/x")
        before = git(repo, "rev-parse", "HEAD")
        self.advance_origin()
        self.run_ff()
        self.assertEqual(git(repo, "branch", "--show-current"), "feat/x")
        self.assertEqual(git(repo, "rev-parse", "HEAD"), before)

    def test_reports_diverged_default_branch_without_moving_it(self):
        repo = self.clone("diverged")
        (repo / "b.txt").write_text("local\n")
        git(repo, "add", "b.txt")
        git(repo, "commit", "-q", "-m", "local only")
        before = git(repo, "rev-parse", "HEAD")
        self.advance_origin()
        dry = self.run_ff("--dry-run")
        self.assertIn("diverged", dry.stdout)
        self.assertNotIn("would fast-forward", dry.stdout)
        self.run_ff()
        self.assertEqual(git(repo, "rev-parse", "HEAD"), before)

    def test_never_replaces_a_locally_ignored_file(self):
        repo = self.clone("ignored")
        (repo / ".git" / "info").mkdir(exist_ok=True)
        (repo / ".git" / "info" / "exclude").write_text(".env\n")
        (repo / ".env").write_text("SECRET=local\n")
        before = git(repo, "rev-parse", "HEAD")
        (self.seed / ".env").write_text("SECRET=origin\n")
        git(self.seed, "add", ".env")
        git(self.seed, "commit", "-q", "-m", "track env")
        git(self.seed, "push", "-q", "origin", "HEAD:main")
        self.run_ff()
        self.assertEqual(git(repo, "rev-parse", "HEAD"), before)
        self.assertEqual((repo / ".env").read_text(), "SECRET=local\n")

    def test_dry_run_moves_nothing(self):
        repo = self.clone("preview")
        before = git(repo, "rev-parse", "HEAD")
        self.advance_origin()
        out = self.run_ff("--dry-run")
        self.assertIn("would fast-forward", out.stdout)
        self.assertEqual(git(repo, "rev-parse", "HEAD"), before)

    def test_leaves_repos_owned_by_another_lane(self):
        repo = self.clone("discovery-lab")
        before = git(repo, "rev-parse", "HEAD")
        self.advance_origin()
        self.run_ff()
        self.assertEqual(git(repo, "rev-parse", "HEAD"), before)

    def test_skips_checkout_a_process_runs_by_path(self):
        repo = self.clone("service")
        (repo / "run.sh").write_text("sleep 30\n")
        before = git(repo, "rev-parse", "HEAD")
        self.advance_origin()
        holder = subprocess.Popen(["bash", str(repo / "run.sh")], cwd=self.tmp.name)
        try:
            self.run_ff()
        finally:
            holder.kill()
            holder.wait()
        self.assertEqual(git(repo, "rev-parse", "HEAD"), before)

    def test_skips_checkout_with_a_process_inside(self):
        repo = self.clone("busy")
        before = git(repo, "rev-parse", "HEAD")
        self.advance_origin()
        holder = subprocess.Popen(["sleep", "30"], cwd=repo)
        try:
            self.run_ff()
        finally:
            holder.kill()
            holder.wait()
        self.assertEqual(git(repo, "rev-parse", "HEAD"), before)


if __name__ == "__main__":
    unittest.main()
