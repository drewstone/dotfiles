# Claude Tools

Custom CLI tools for managing Claude Code. Installed via `install.sh` which symlinks tools to `~/bin/`.

## claude-profile

Switch between multiple Claude Code accounts (Max, Pro, Codex, etc.) cleanly — no shared-file races, no "oops my session logged me out when I cd'd," no sync step after re-auth.

### Mental model

Each profile is its own complete `CLAUDE_CONFIG_DIR` under `~/.claude-profiles/<name>/`. When you activate a profile, the tool exports `CLAUDE_CONFIG_DIR` in your shell — that's the entire mechanism. Claude Code reads credentials, history, projects, settings — everything — from that one directory.

Two terminals on two different accounts never touch each other's state. Logging in under one account never clobbers the other. There is no `.active` file to keep in sync, no creds to "sync back," no conflict detection because there's no shared file to conflict over.

### Machine setup

```bash
./claude/install.sh
which claude-profile

# Add this to ~/.bashrc or ~/.zshrc:
eval "$(claude-profile shell-hook)"
```

The shell hook does two things:
1. Wraps `claude-profile` in a shell function so `use` can mutate the current shell's env.
2. At shell startup, sets `CLAUDE_CONFIG_DIR` from the default profile (if one is configured).

### Getting started

```bash
# If you're already logged in under ~/.claude/, snapshot that account as a profile:
claude-profile import personal

# Add another account (this runs the login flow in an isolated dir):
claude-profile add work

# Pick a default for new terminals:
claude-profile default personal

# Switch THIS shell right now:
claude-profile use work

# See where you are:
claude-profile list
# → personal              (max) [default]
# → work                  (max)
# This shell: work   (via CLAUDE_CONFIG_DIR)
```

### Common flows

**"I just got a new subscription — how do I switch to it?"**
```bash
claude-profile add newsub   # runs login in an isolated dir; you're done.
```
No sync step. No "remember to update the active name." The login happens in the profile's own dir; Claude writes the credentials there and nowhere else.

**"My token expired / subscription changed — how do I re-auth one profile?"**
```bash
claude-profile login work
```
Re-runs the OAuth flow against the `work` profile dir. Other profiles are untouched.

**"Which account is this terminal on?"**
```bash
claude-profile current
# work
```

**"Are any of my profiles about to expire?"**
```bash
claude-profile doctor
# ✓ personal — max (expires in 5d)
# ✓ work     — max (expires in 2d)
# ✗ oldacct  — no credentials file
```

### All commands

| Command | Description |
|---|---|
| `list` | List profiles; mark the active + default ones |
| `current` | Print this shell's active profile |
| `add <name>` | Create a new profile dir and run `claude /login` inside it |
| `import <name>` | Snapshot `~/.claude/.credentials.json` into a new profile |
| `login <name>` | Re-run login inside an existing profile dir |
| `use <name>` | Switch THIS shell's `CLAUDE_CONFIG_DIR` to `<name>` |
| `default <name>` | Pick the default profile for newly opened shells |
| `default --unset` | Clear default; new shells use `~/.claude/` |
| `remove <name>` | Delete a profile dir (prompts for confirmation) |
| `doctor` | Audit all profiles, flag expired or missing tokens |
| `shell-hook` | Emit the bash/zsh integration snippet |

### Layout on disk

```
~/.claude-profiles/
├── .default                       # text file with default profile name (optional)
├── personal/
│   ├── .credentials.json          # OAuth tokens (Claude writes these)
│   ├── .claude.json               # runtime state
│   ├── projects/
│   ├── sessions/
│   └── backups/
└── work/
    ├── .credentials.json
    └── ...
```

Each `<name>/` dir is exactly what `~/.claude/` would be for that account if it were the only one. Claude Code treats it as the full config home when `CLAUDE_CONFIG_DIR` points at it.

### Why the rewrite?

The v1 design kept one shared `~/.claude/.credentials.json` and copied saved profile snapshots into it on every `cd`. That created a race window: a running `claude` session refreshing its OAuth token while `cd` overwrote the file from an old snapshot → logout / corrupted creds / "why do I have to log in again." The v2 design eliminates the shared file entirely — per-process isolation via `CLAUDE_CONFIG_DIR`.

### Migrating from the v1 script

If you had profiles saved as `~/.claude/profiles/<name>.json` under the v1 layout:

```bash
# Move each one into the new layout:
for f in ~/.claude/profiles/*.json; do
  [ -f "$f" ] || continue
  name=$(basename "$f" .json)
  mkdir -p ~/.claude-profiles/"$name"
  mv "$f" ~/.claude-profiles/"$name"/.credentials.json
  chmod 600 ~/.claude-profiles/"$name"/.credentials.json
done
rm -rf ~/.claude/profiles/
```

Then add `eval "$(claude-profile shell-hook)"` to your shell rc and reload.
