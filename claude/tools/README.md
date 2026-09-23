# Claude Tools

Custom CLI tools for managing Claude Code. Installed via `install.sh` which symlinks tools to `~/bin/`.

## agent-doc-lengths

Measure Markdown and skill size across the dotfiles repo:

```bash
agent-doc-lengths --top 25
agent-doc-lengths --all --format markdown
agent-doc-lengths --format json
```

Reports lines, words, chars, approximate tokens, skill-description size, category totals, largest files, and threshold findings.
Skill descriptions default to a 96-character limit because every description competes for the discovery context before a skill is selected.

## skills

List installed skills or check the discovery catalog budget:

```bash
skills
skills eval
skills --check
```

The check scans Claude, Codex, shared Agent Skills, and Codex system roots.
It flags descriptions over 160 characters and measures the rendered names, descriptions, and resolved source paths.
It fails on duplicate names and broken links.
It warns when the list exceeds Codex's documented 8,000-character fallback for an unknown model context.
With a known model context, Codex instead limits the initial list to 2% of that context.
See [OpenAI's skill documentation](https://learn.chatgpt.com/docs/build-skills).
