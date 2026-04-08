# Claude Skills

Portable Claude Code skills maintained in this dotfiles repo.

The source of truth for what each skill does is its `SKILL.md` frontmatter (`name`, `description`). To list current skills, read the directory:

```bash
ls claude/skills/
```

## Maintenance notes

- Skills live at `claude/skills/<name>/SKILL.md`. Each one needs YAML frontmatter (`name`, `description`) at the top — without it, Claude Code's description-based loader cannot trigger the skill.
- Run `./install.sh` from the repo root to symlink skills into `~/.claude/skills/`.
- A subset is also synced to `~/.pi/agent/skills/` — see the `PI_SKILLS` array in `install.sh`.
- Keep skill names in docs aligned with directory names.
- If a skill references helper scripts that aren't shipped in this repo, mark them explicitly as external.
