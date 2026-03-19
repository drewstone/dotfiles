# Claude Tools

Custom CLI tools for managing Claude Code. Live in `~/dotfiles/claude/tools/`, symlinked to `~/bin/`.

## claude-profile

Switch between multiple Claude Max/Codex subscriptions. Swaps `~/.claude/.credentials.json` — no Docker, no env vars.

### Setup

```bash
# Save your current logged-in account:
claude-profile add drew-main

# Log into another account, save it:
claude-profile add drew-work

# List all profiles:
claude-profile list
#  * drew-main            (max)
#    drew-work            (max)
```

### Manual switching

```bash
claude-profile use drew-work
claude-profile current        # → drew-work
```

### Auto-switch per directory

Drop a `.claude-profile` file in any project root:

```bash
echo "drew-main" > ~/code/phony/.claude-profile
echo "drew-work" > ~/code/client-project/.claude-profile
```

Add the shell hook to `~/.zshrc` or `~/.bashrc`:

```bash
eval "$(claude-profile shell-hook)"
```

Now `cd ~/code/phony` auto-switches to `drew-main`. `cd ~/code/client-project` switches to `drew-work`. Switching only happens when the profile actually changes (no-op if already active).

### Commands

| Command | Description |
|---|---|
| `add <name>` | Save current credentials as a named profile |
| `use <name>` | Switch to a named profile |
| `list` | List saved profiles (active marked with `*`) |
| `current` | Print active profile name |
| `remove <name>` | Delete a saved profile |
| `auto` | Auto-select based on `.claude-profile` in cwd ancestors |
| `shell-hook` | Print shell hook for auto-switching on `cd` |

### How it works

Profiles are stored as JSON files in `~/.claude/profiles/`. Switching copies the profile into `~/.claude/.credentials.json` (what Claude Code reads for auth). The active profile name is tracked in `~/.claude/profiles/.active`.

The shell hook calls `claude-profile auto` on every directory change. `auto` walks up from `$PWD` looking for a `.claude-profile` file, reads the profile name, and switches if different from current.

### Notes

- `.claude-profile` files are plain text, one profile name, no newlines needed
- Add `.claude-profile` to `.gitignore` — it's machine-specific
- Profiles survive `claude` CLI updates (stored outside the CLI's managed files)
- Works with both Max and Codex subscriptions
