# GTR package install guard

On `drew-GTR-Pro`, `host/gtr-install-guard/install.py` wraps the existing PATH
entrypoints for `pnpm`, `npm`, `yarn`, and `uv` in `~/.local/bin`, `~/bin`, the
pnpm home, and installed nvm Node versions. Each original executable stays next
to its wrapper as `<name>.gtr-original`; allowed commands delegate to it. The
wrapper refuses install commands when the working directory, an explicit target,
or an active uv environment lies under `~/code/_wt` or `~/webb/_wt`. It points
operators to `beelink-gate`. Commands outside those worktrees are preserved.

Install after updating the durable `~/code/dotfiles` checkout:

```sh
python3 host/gtr-install-guard/install.py
python3 host/gtr-install-guard/install.py --check
```

The host guard installer also invokes it on GTR during normal provisioning.
Run `--uninstall` to restore every preserved original. New Node versions add
new entrypoints; rerun the installer or provision check after installing one.
This is a PATH guard for ordinary package manager commands, not a replacement
for the fleet rule to run dependency installs and gates on a Beelink.
