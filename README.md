# dotfiles

Personal developer tooling: shared agent guidance and Git hooks.

## Agent setup

Run `./claude/install.sh` from the durable checkout that will own installed symlinks.
Use `--force` only when replacing existing configuration is intended.
The installer shares instructions, skills, commands, and tools across supported agent homes.
It also installs Claude settings, hooks, and plugins.
See [skills](claude/skills/README.md) and [tools](claude/tools/README.md) for their maintained guidance.

For Codex, add this top-level setting to `~/.codex/config.toml`:

```toml
project_doc_fallback_filenames = ["CLAUDE.md"]
```

This lets Codex discover repositories that use only `CLAUDE.md`.
If fallback names already exist, append this name to that list.
On a Linux box, `host/provision.sh agents` adds the setting.
Codex prefers `AGENTS.override.md`, then `AGENTS.md`, then configured fallback names within each directory.
Keep shared repository guidance in `AGENTS.md` when both agents use it; a Claude entry can import `@AGENTS.md`.
See the [current Codex discovery rules](https://developers.openai.com/codex/guides/agents-md) for scope and limits.

## Host guards

`host/` keeps a Linux box alive under agents that hold passwordless sudo.
Install with `./host/install.sh` (sudo).
Run `./host/install.sh --check` to report drift without a change.

- Root wrappers in `/usr/local/sbin` refuse `fsfreeze`, `dmsetup`, LVM, `mkfs`, `mount`, and `unshare` forms that touch the root disk or a kernel filesystem; loop-backed work passes.
- `/etc/sudoers.d/zz-agent-blast-guard` closes the absolute-path route to the real binaries.
- The watchdog daemon runs `/etc/watchdog.d/root-write`; a frozen root blocks it and a kernel softdog resets the box in about four minutes (measured 247 s in a VM).
- A udev rule names the softdog `/dev/watchdog-softdog`, and the daemon opens that name, not a probe-order number.
  PID 1 is pinned to a hardware timer (`/dev/watchdog-hw`), so a `RuntimeWatchdogSec` setting never takes the softdog.
- `claude/hooks/host-blast-guard.sh` blocks the same verbs inside Claude Code before sudo sees them.
  It also blocks `host/bin/format-traces-drive`, which erases a disk.
- `claude/tools/hostlab` boots a throwaway VM (root, lvm2, dm-thin, xfs, the cwd at /work) where the same commands are allowed.

## Tmux recovery

Install the tmux watcher and make its user manager a last-resort memory-pressure target:

```bash
./tmux/install-heal.sh
```

The watcher saves a workspace index every minute.
It also asks tmux-resurrect to save its standard snapshot every 15 minutes when installed.
After server loss, it recreates session and window names with shells in their prior directories.
It cannot revive processes, pane splits, scrollback, or unsaved work.
The installer keeps normal pane processes eligible for memory-pressure cleanup.

## Provision a new Beelink

`host/provision.sh` makes a fresh Ubuntu 24.04 Beelink into an agent box like drew-gtr-pro.
Each step tests the box first and changes only what differs, so a second run changes nothing.
`host/provision.sh --check` reports drift and changes nothing; it exits 1 when something differs.
The run never signs in to an account and never erases a disk.
It prints those steps as exact commands at the end.

Do these steps in this order:

1. Install Ubuntu 24.04 Desktop, and create the user `drew` as an administrator.
2. Connect the box to a network. Use Ethernet or the Wi-Fi menu of the installer.
3. Clone this repository to the durable checkout:

   ```bash
   sudo apt-get install -y git
   git clone https://github.com/drewstone/dotfiles.git ~/code/dotfiles
   ```

4. Run the provisioning from a terminal on the box or over ssh.
   Give the Wi-Fi name; the run asks for the passphrase.
   The run asks for the sudo password once; the `guards` module then makes sudo passwordless.

   ```bash
   ~/code/dotfiles/host/provision.sh --wifi-ssid '<SSID>'
   ```

   To log in to the desktop at boot without a password, add `--autologin`.
   Without it, Ghostty and chatgpt-fleet start only after a person logs in.
5. Do each step in the "steps for a person" list at the end of the run, in order.
   The list has the GitHub, Tailscale, Claude and Codex sign-ins, the Git identity, and the agent-bus name.
6. Run the provisioning again.
   It installs the tangle-tools commands and the Claude plugins, which need the sign-ins.
   It also prints the account and fleet steps from the tangle-tools READMEs.
7. Check the box. The command must exit 0:

   ```bash
   ~/code/dotfiles/host/provision.sh --check
   ```

Each module can run alone, for example `host/provision.sh wifi --wifi-ssid '<SSID>'`.
`host/provision.sh --help` lists the modules and options.

| Module | What it does |
|---|---|
| `guards` | Runs `host/install.sh`: root wrappers, sudoers, and the frozen-root watchdog. |
| `tools` | Installs base packages, Google Chrome, Tailscale, the GitHub CLI, the hostlab packages, and uv. |
| `wifi` | Turns Wi-Fi power save off, stores the passphrase system-wide, and installs a reconnect watchdog. |
| `desktop` | Boots to GNOME and starts Ghostty full screen on the tmux session `work`. |
| `nosleep` | Masks the sleep targets and stops logind, the login screen, and the GNOME session from sleeping. |
| `shell` | Installs starship with the catppuccin-powerline preset; the Linux text console keeps the plain prompt. |
| `git` | Runs `git/install.sh`. |
| `tmux` | Links `tmux/tmux.conf`, clones its plugins, and runs `tmux/install-heal.sh`. It never reloads a running server. |
| `agents` | Installs Claude Code, Codex and rtk, then runs `claude/install.sh`. |
| `traces` | Mounts the ext4 drive labelled `traces` at `/mnt/traces` for the user. |
| `tangle-tools` | Runs the tangle-tools install for `acct`, `fleet` and `chatgpt-fleet`. |
| `handoff` | Prints the sign-ins and the other steps for a person. |

The Wi-Fi name and passphrase come from the command line or a prompt, never from this repository.
For a run without a prompt, put the passphrase in a file and pass `--wifi-psk-file <file>`.

To make a new drive the trace drive, find its model and serial, then run the eraser yourself:

```bash
lsblk -dno NAME,MODEL,SERIAL,TRAN,SIZE
sudo ~/code/dotfiles/host/bin/format-traces-drive --model '<MODEL>' --serial '<SERIAL>' --transport usb
```

It refuses unless exactly one disk has that serial and model.
It also refuses the system disk and a disk that is in use, and it asks you to type ERASE.
When it is done, it runs the `traces` module.

Other repositories install their own services: cli-bridge, pr-reviewer, the trace units, and the fleet wall.
The provisioning does not install Docker, ROCm, Ollama, nvm, or Rust.

`tests/provision.hostlab.sh` runs the whole provisioning twice in a hostlab VM on a KVM host.
It also reboots the VM, formats a test disk, and freezes the root filesystem to prove the reset.

## Global Git Etiquette Guard

Install the universal fast guards once:

```bash
./git/install.sh
```

The installer points `core.hooksPath` and `init.templateDir` into this checkout.
It also installs the shared ignore file unless another one is already configured.

Global baseline behavior:

- `pre-commit`: blocks merge conflict markers and suspicious hard-coded secrets.
- `pre-push`: blocks merge conflict markers, suspicious hard-coded secrets, and branches that do not merge cleanly into `origin/main`.

Repos can still opt into stricter review gates with a checked-in `.ai-agent-hooks.mjs`; that config overrides the global baseline for that repo.

## What It Does

`ai-agent-hooks` installs reusable `pre-commit` and `pre-push` hooks into any Git repository.

Default behavior:

- `pre-commit`
  - blocks merge conflict markers
  - blocks suspicious hard-coded secrets
- `pre-push`
  - repeats the static guards
  - runs a required Codex review gate using the installed Codex model and reasoning settings
  - requires structured JSON output
  - fails closed on invalid output, runner failure, or blocking findings

## Install

From a target repository:

```bash
node "$HOME/code/dotfiles/bin/ai-agent-hooks.mjs" install --init-config
```

Use the path to your durable dotfiles checkout if it differs.
An explicit `audit.model` or `audit.reasoningEffort` in repository configuration overrides the inherited choice.

That writes:

- `.githooks/pre-commit`
- `.githooks/pre-push`
- `.ai-agent-hooks.mjs`

## Review Contract

The default Codex review must return structured JSON with:

- `status`: `pass` or `fail`
- `summary`: short human-readable result
- `findings`: array of typed findings

Each finding includes:

- `severity`: `low | medium | high | critical`
- `category`
- `title`
- optional `file`
- optional `line`
- optional `evidence`
- `recommendation`

Default blocking policy:

- fail on `high`
- fail on `critical`

## Artifacts

Each hook run writes a directory under:

```bash
.git/ai-agent-hooks/runs/<timestamp>-<hook>/
```

Expected files for review checks:

- `summary.json`
- `<check>.prompt.txt`
- `<check>.diff.patch`
- `<check>.changed-files.txt`
- `<check>.git-context.json`
- `<check>.schema.json`
- `<check>.result.json`
- `<check>.runner-meta.json`
- `<check>.log`
