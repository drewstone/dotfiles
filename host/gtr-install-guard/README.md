# GTR package install guard

On `drew-GTR-Pro`, `host/gtr-install-guard/install.py` wraps the existing PATH
entrypoints for `pnpm`, `npm`, `yarn`, `uv` and `corepack` in `~/.local/bin`, `~/bin`, the
pnpm home, and installed nvm Node versions. Each original executable stays next to its
wrapper as `<name>.gtr-original`; allowed commands delegate to it.

The wrapper refuses pnpm, npm and yarn installs (frozen included, and the same through
`corepack`) in any git checkout on GTR, not only inside `~/code/_wt` and `~/webb/_wt`: on
2026-10-10 an agent refused in `_wt` cloned `~/code/gate-gtm-20261010` and gated there. It
points to `beelink-gate beelink1|beelink2 <repo-url> <full-sha> -- <command>`. Exempt: the
deploy-managed service checkouts tangle-tools-deploy installs (`~/.config/fleet/checkouts`,
`DISCO_LAB` in `~/.config/fleet/lab.env`, the tangle-tools deploy clone), the beelink-gate cache,
global installs, lockfile-only resolution, and directories that are not checkouts. `uv` installs
stay refused only inside `_wt`, because GTR's tools run through `uv run` from their checkouts.

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
