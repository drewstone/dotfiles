# Claude Skills

Portable Claude Code skills maintained in this dotfiles repo.

The source of truth for what each skill does is its `SKILL.md` frontmatter (`name`, `description`). To list current skills, read the directory:

```bash
ls claude/skills/
```

## Authoring conventions

**Read [`_common.md`](./_common.md) before writing or editing a skill.** It defines the shared rules (state-first reads, persist-to-`.evolve/`, dispatch-at-end, no AI attribution, the `skill-runs.jsonl` schema, the `transcriptPath` / `traceDir` pointer pattern) so skills don't copy-paste them eight times. It also lists what NOT to put in a skill (no Decision Capture blocks, no defensive fit-check routing, no decorative banners).

The skill writing checklist at the bottom of `_common.md` is the merge gate.

## Maintenance notes

- Skills live at `claude/skills/<name>/SKILL.md`. Each one needs YAML frontmatter (`name`, `description`) at the top — without it, Claude Code's description-based loader cannot trigger the skill.
- Frontmatter `description` should be ≤ 40 words and lead with trigger phrases. Bloated descriptions dilute the trigger and consume context in every session.
- `_common.md` is intentionally NOT a skill (no `description` and not loaded as a directory). It's authoring documentation.
- Run `./install.sh` from the repo root to symlink skill directories into `~/.claude/skills/`.
- A subset is also synced to `~/.pi/agent/skills/` — see the `PI_SKILLS` array in `install.sh`.
- Helper scripts referenced by a skill (e.g. `${SKILL_DIR}/preflight.sh`) must live alongside `SKILL.md` in the same directory; `install.sh` symlinks the whole directory.

## Measurement

Every skill SHOULD append one line to `.evolve/skill-runs.jsonl` on completion via `tools/skill-run-log` (symlinked into `~/bin/skill-run-log`). Schema and rationale in `_common.md`. `/reflect` and `/governor` consume this log to grade skills empirically and detect drift; without it every "should we merge / archive" decision is vibes.
