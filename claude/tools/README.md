# Claude Tools

Custom CLI tools for managing Claude Code. Installed via `install.sh` which symlinks tools to `~/bin/`.

## claude-profile

Switch between multiple Claude Max/Codex subscriptions. Swaps `~/.claude/.credentials.json` per named profile.

### Setup

```bash
# Save your current logged-in account:
claude-profile add main-acct

# Log into another account (`claude /login`), save it:
claude-profile add work-acct

# List all profiles:
claude-profile list
#  * main-acct            (max)
#    work-acct            (max)
```

### Manual switching

```bash
claude-profile use work-acct
claude-profile current        # → work-acct
```

### Per-directory auto-switch

Drop a `.claude-profile` file in any project root:

```bash
echo "main-acct" > ~/code/myproject/.claude-profile
```

Add the shell hook to `~/.zshrc` or `~/.bashrc`:

```bash
eval "$(claude-profile shell-hook)"
```

Now `cd ~/code/myproject` auto-switches to `main-acct`.

### Pool mode — rotation when exhausted

For heavy projects that burn through one account's limits:

```bash
cd ~/code/myproject
claude-profile pool main-acct work-acct codex-acct
```

Creates `.claude-pool` and activates the first profile. When you hit rate limits:

```bash
claude-profile next    # rotates → work-acct → codex-acct → main-acct
claude-profile pool-status   # show pool and active profile
```

### What's safe to commit?

- `.claude-profile` / `.claude-pool` contain only **profile names** (e.g., "main-acct"), not credentials. Safe to commit but machine-specific, so `.gitignore` is cleaner.
- Actual tokens live in `~/.claude/profiles/*.json` — never committed.

### All commands

| Command | Description |
|---|---|
| `add <name>` | Save current credentials as a named profile |
| `use <name>` | Switch to a named profile |
| `list` | List saved profiles (active `*`, pool members tagged) |
| `current` | Print active profile name |
| `remove <name>` | Delete a saved profile |
| `pool <n1> <n2> ...` | Create rotation pool in current directory |
| `next` | Rotate to next profile in the pool |
| `pool-status` | Show pool config and active profile |
| `auto` | Auto-select based on `.claude-profile` or `.claude-pool` |
| `shell-hook` | Print shell hook for auto-switching on `cd` |

### How it works

- **Profiles** stored as JSON in `~/.claude/profiles/`. Switching copies into `~/.claude/.credentials.json`.
- **Pool files** (`.claude-pool`) are plain text, one profile name per line.
- **Shell hook** calls `claude-profile auto` on every `cd`.
- `.claude-profile` takes precedence over `.claude-pool` if both exist.
- `next` wraps around — after the last profile, goes back to the first.
- No hardcoded paths — uses `$HOME`, works on macOS (`/Users/`) and Linux (`/home/`).
