# Claude Tools

Custom CLI tools for managing Claude Code. Installed via `install.sh` which symlinks tools to `~/bin/`.

## claude-profile

Switch between multiple Claude Max/Codex subscriptions. Session-aware credential management that prevents concurrent sessions from clobbering each other.

### Machine setup

```bash
./claude/install.sh
which claude-profile
```

`install.sh` symlinks `claude-profile` into `~/bin/claude-profile`. This machine already has `~/bin` on `PATH`; if another machine does not, add `export PATH="$HOME/bin:$PATH"` to shell startup.

### Setup

```bash
# Save your current logged-in account:
claude-profile add main-acct

# Log into another account, then save it:
claude /login
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

### Concurrent sessions

Multiple terminals can use different profiles simultaneously. When you switch profiles, `claude-profile` checks for other active shells:

- **No conflict**: writes `~/.claude/.credentials.json` normally.
- **Conflict detected**: registers the shell with the new profile but skips the creds file write. The shell hook exports `ANTHROPIC_OAUTH_TOKEN` per-shell for isolation.
- **Force override**: `claude-profile use --force <name>` writes the creds file regardless.

```bash
# See which shells are using which profiles:
claude-profile sessions

# List shows active PIDs per profile:
claude-profile list
#  * main-acct            (max) [active: PID 12345]
#    work-acct            (max) [active: PID 67890]
```

Stale sessions (dead PIDs) are cleaned up automatically.

### Per-directory auto-switch

Drop a `.claude-profile` file in any project root:

```bash
echo "main-acct" > ~/code/myproject/.claude-profile
# or use the set command:
claude-profile set main-acct
```

Add the shell hook to `~/.zshrc` or `~/.bashrc`:

```bash
eval "$(claude-profile shell-hook)"
```

Now `cd ~/code/myproject` auto-switches to `main-acct`. The hook is conflict-aware — it won't clobber credentials if another terminal has a running Claude session.

### First-time credential bootstrap

If `claude-profile add <name>` says no credentials exist, log into Claude Code once first:

```bash
claude /login
claude-profile add main-acct
```

Profiles are copied from `~/.claude/.credentials.json` into `~/.claude/profiles/<name>.json`.

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

### Token / env integration

Use profile tokens with other tools (pi, curl, etc.):

```bash
# Print the OAuth token for the current shell's profile:
claude-profile token

# Export as env var:
eval "$(claude-profile env)"

# Run a command with the token set:
claude-profile wrap pi --provider anthropic --model claude-sonnet-4-6
```

`token` reads from the shell's registered profile directly, not the global creds file — safe for concurrent use.

### What's safe to commit?

- `.claude-profile` / `.claude-pool` contain only **profile names** (e.g., "main-acct"), not credentials. Safe to commit but machine-specific, so `.gitignore` is cleaner.
- Actual tokens live in `~/.claude/profiles/*.json` — never committed.

### All commands

| Command | Description |
|---|---|
| `add <name>` | Save current credentials as a named profile |
| `use <name>` | Switch to a named profile (conflict-aware) |
| `use --force <name>` | Switch and write creds file even if conflicts exist |
| `set <name>` | Set profile for this project directory |
| `list` | List profiles with status, pool, and active sessions |
| `current` | Print active profile name |
| `remove <name>` | Delete a saved profile |
| `pool <n1> <n2> ...` | Create rotation pool in current directory |
| `next` | Rotate to next profile in the pool |
| `pool-status` | Show pool config and active profile |
| `sessions` | Show active shell sessions and their profiles |
| `sync` | Update active profile after re-authentication |
| `token [profile]` | Print OAuth access token |
| `env [profile]` | Print `export ANTHROPIC_OAUTH_TOKEN=...` |
| `wrap <cmd> [args]` | Run a command with `ANTHROPIC_OAUTH_TOKEN` set |
| `auto` | Auto-select based on `.claude-profile` or `.claude-pool` |
| `shell-hook` | Print shell hook for auto-switching on `cd` |

### How it works

- **Profiles** stored as JSON in `~/.claude/profiles/`. Switching copies into `~/.claude/.credentials.json`.
- **Sessions** tracked in `~/.claude/profiles/sessions/` as `<PID>.session` files mapping shell PID to profile name.
- **Conflict detection**: before writing the global creds file, checks if other shells have active sessions with different profiles. Skips the write if so.
- **Shell hook** calls `claude-profile auto` on every `cd` and exports `ANTHROPIC_OAUTH_TOKEN` per-shell.
- **Pool files** (`.claude-pool`) are plain text, one profile name per line.
- `.claude-profile` takes precedence over `.claude-pool` if both exist.
- `next` wraps around — after the last profile, goes back to the first.
- No hardcoded paths — uses `$HOME`, works on macOS (`/Users/`) and Linux (`/home/`).
- Compatible with macOS system bash (3.2) — no `mapfile` or associative arrays.
