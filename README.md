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

The same installer places the cli-bridge LLM slice and its CPU cap in `~/.config/systemd/user`.
`CPUQuota=2400%` and `CPUWeight=50` hold every cli-bridge LLM scope, including discovery-lab's kissat campaign, to 24 of 32 cores.
Run `./host/install-cli-bridge-slice.sh` alone to install only the slice; it needs no sudo.

## Worktree reaper

`git/install.sh` installs `wt-reaper`: a systemd user timer on Linux and a launchd agent on macOS, both at 04:15 daily.
It covers every linked worktree registered with a repository under `~/code` or `~/company`, wherever that worktree lives (for example `~/code/_wt/*`, `~/worktrees/*`, or `/tmp`).
It removes one only when every check passes:

- The worktree is not locked and has no merge, rebase, bisect, cherry-pick, or revert in progress.
- Nothing in it, its index, HEAD, or reflogs changed in the last 24 hours.
- `git status` is empty; only ignored build output such as `node_modules/` may remain. An ignored `.env` keeps the tree.
- It holds no nested repository.
- After `git fetch --all --prune`, every commit on its HEAD is on a remote-tracking ref.
- No process has its cwd, an open file, or a mapped file inside it (`/proc` on Linux, `lsof` on macOS).
  The scan must read every live process, so it uses `sudo -n`; if any live process stays unreadable, the run removes nothing.
  On macOS this needs a sudoers rule for `/usr/sbin/lsof`; the installer prints it.

Any error or doubt skips the tree, and every decision is logged to `~/.local/state/wt-reaper/wt-reaper.log`.
Removal uses `git worktree remove` without `--force`.
The local branch is deleted only when it is merged into the remote default branch.
Run `wt-reaper --dry-run` to see the decisions without removing anything.
Main checkouts are never candidates, and the reaper refuses to run as root.

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

4. Run the provisioning from a terminal on the box.
   Ubuntu Desktop has no SSH server; the run installs one that accepts keys only.
   Give the Wi-Fi name.
   When the box stores no passphrase for that network, the run asks for it.
   The run asks for the sudo password once; the `guards` module then makes sudo passwordless.

   ```bash
   ~/code/dotfiles/host/provision.sh --wifi-ssid '<SSID>'
   ```

   GDM logs `drew` in at boot, so the fleet wall and chatgpt-fleet come back after an unattended reboot.
   Anyone at the keyboard then has `drew`'s session, and `drew` has passwordless sudo.
   Keep the box where only trusted people can reach it, or add `--no-autologin` to wait for a person to log in.
5. Do each step in the "steps for a person" list at the end of the run, in order.
   The list has the GitHub, Tailscale, Claude and Codex sign-ins, the Git identity, and the agent-bus name.
   It also has the `ssh-copy-id` step that authorizes the Mac's key for ssh.
   While the login keyring has a password, it has the keyring step: automatic login cannot unlock that keyring, and chatgpt-fleet's Chrome waits for it.
6. Run the provisioning again, from the box or over ssh.
   It installs the tangle-tools commands and the Claude plugins from the private marketplaces, which need the sign-ins.
   It also prints the account, fleet and ChatGPT steps from the tangle-tools READMEs until each one is done.
7. Check the box. The command must exit 0:

   ```bash
   ~/code/dotfiles/host/provision.sh --check
   ```

Each module can run alone, for example `host/provision.sh wifi --wifi-ssid '<SSID>'`.
`host/provision.sh --help` lists the modules and options.

| Module | What it does |
|---|---|
| `guards` | Runs `host/install.sh`: root wrappers, sudoers, and the frozen-root watchdog. |
| `tools` | Installs base packages, the OpenSSH server with key-only login, Google Chrome, Tailscale, GitHub's build of the GitHub CLI, the hostlab packages, and uv. |
| `desktop` | Boots to GNOME, logs the user in, links the Ghostty config, and removes the old Ghostty autostart entry, so the fleet wall is the only window at login. It never starts GDM itself; a restart of the box does. |
| `wifi` | Turns Wi-Fi power save off, stores the passphrase system-wide, and installs a reconnect watchdog. |
| `nosleep` | Masks the sleep targets and stops logind, the login screen, and the GNOME session from sleeping. logind's keys live in a drop-in; the run comments out the same keys in `/etc/systemd/logind.conf`. |
| `shell` | Installs starship with the catppuccin-powerline preset; the Linux text console keeps the plain prompt. |
| `git` | Runs `git/install.sh`. |
| `tmux` | Links `tmux/tmux.conf`, clones its plugins, and runs `tmux/install-heal.sh`. It never reloads a running server. |
| `agents` | Installs Claude Code, Codex and rtk, then runs `claude/install.sh`. |
| `traces` | Mounts the ext4 drive labelled `traces` at `/mnt/traces` for the user. |
| `tangle-tools` | Runs the tangle-tools install for `acct`, `fleet` and `chatgpt-fleet`, and enables the fleet wall unit from the deploy clone. |
| `handoff` | Prints the sign-ins and the other steps for a person. |

The Wi-Fi name and passphrase come from the command line or a prompt, never from this repository.
The passphrase reaches NetworkManager on standard input, so it never appears in a command line or in the sudo log.
For a run without a prompt, put the passphrase in a file and pass `--wifi-psk-file <file>`.
The run never replaces a different passphrase that the box already stores, because a wrong one strands the box at its next reconnect.
To replace it on purpose, add `--replace-psk`; the old profile settings go to `/var/backups/NetworkManager` first.

To make a new drive the trace drive, find its model and serial, then run the eraser yourself, in a terminal outside Claude and Codex:

```bash
lsblk -dno NAME,MODEL,SERIAL,TRAN,SIZE
sudo ~/code/dotfiles/host/bin/format-traces-drive --model '<MODEL>' --serial '<SERIAL>' --transport usb
```

It refuses unless exactly one disk has that serial and model.
It also refuses the system disk and a disk that is in use, and it asks you to type ERASE.
After ERASE it checks the disk again and writes only through the `/dev/disk/by-id` name that carries the serial.
It refuses to run under a `claude` or `codex` process.
The Claude hook refuses any command that names it, ssh included, except one local read-only command such as `cat` or `grep`, or one `hostlab` command.
These checks stop a mistake, not an agent that means to erase a disk: an agent with sudo can erase one without the script.
When it is done, it runs the `traces` module.

Other repositories install their own services: cli-bridge, pr-reviewer, and the trace units.
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
