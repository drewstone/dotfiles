# Claude Skills

Portable Claude Code skills maintained in this dotfiles repo.

## Inventory

Current count: 18 skills.

### Workflow

- `code-review` — review diffs, branches, commits, or PRs
- `critical-audit` — parallelized staff-level review
- `diagnose` — failure triage and clustering
- `evolve` — orchestrated improvement loop
- `improve` — build experiment infrastructure
- `init-context` — onboard into a repo quickly
- `polish` — finish and tighten work
- `research` — run improvement experiments
- `verify` — pre-ship verification
- `work-status` — quick status check

### Analysis and compression

- `ai-conversation-extractor` — convert AI JSONL transcripts to Markdown
- `layered-summary` — generate layered repo summaries
- `repomix-analysis` — pack repos for LLM analysis with `repomix`
- `session-stripper` — compact and repair Claude Code sessions

### Security and scanning

- `semgrep` — multi-pass Semgrep scan orchestration

### Product and design

- `site-clone` — pixel-faithful site migration workflow
- `tangle-branded-designer` — Tangle-specific UI guidance

### Environment-specific

- `bad` — Browser Agent Driver CLI reference and workflow

## Maintenance notes

- Source of truth is `claude/skills/<name>/SKILL.md`.
- Keep skill names in docs aligned with directory names. Example: the status skill is `work-status`, not `status`.
- If a skill references helper workflows that are not shipped in this repo, mark them explicitly as external rather than implying they are locally available.
- When adding or removing a skill, update this file and the top-level `README.md` in the same change.
