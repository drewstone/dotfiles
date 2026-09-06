# Projects under ~/code

Shared agent defaults apply here.
Read the owning repository's instructions before changing it.

Development cost gets zero weight in technical decisions here, stronger than the shared default of little weight.
Choose for quality, simplicity, robustness, scalability, and long-term maintainability.
Do not choose an inferior design because the better design takes longer to build.

Find existing implementations before creating a new project or module.
Use repository sources and current documentation to identify ownership and supported interfaces.
Check Git remotes and worktree metadata when directories are aliases or alternate checkouts.
A worktree can contain active work; its name and `.git` file do not make it disposable.
For nontrivial code changes, obtain an independent review before shipping and resolve its applicable findings.

For company operations, start with `~/company/CLAUDE.md`.
Dotfiles owns this tree's instructions; resolve this file's installed symlink to find its source checkout.
