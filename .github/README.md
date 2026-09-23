# Merge gate

The default-branch `Merge gate` workflow scans open, same-repository pull requests every five minutes.
Run it manually when a pull request needs a fresh check.
Fork pull requests cannot start this self-hosted workflow.

The scanner publishes `merge-gate/ci` and `merge-gate/codex-p1` on each pull request head.
`main` requires both checks on the current branch, resolved conversations, and a pull request.
It requires zero approving reviews.

After reviewing a clean head, use `gh pr merge --auto --merge` to queue GitHub's native auto-merge.
GitHub merges when the required checks and branch rules pass.
