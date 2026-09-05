---
name: install-anti-slop
description: Install or migrate the anti-slop Oxlint plugin in a local JavaScript or TypeScript repository.
---

# Install anti-slop

Install or migrate the bundled Oxlint plugin within the repository's existing lint setup.
Preserve unrelated configuration, dependency ranges, and working-tree changes.

## Install

1. Read repository instructions and identify its package manager, lockfile, lint commands, and Oxlint configuration.
2. Inspect any existing anti-slop installation and compare its rules with the bundled source before replacing files.
3. Run [the installer](scripts/install.mjs) from the target repository:

   ```bash
   node <skill-directory>/scripts/install.mjs
   ```

   The default destination is `tools/oxlint/anti-slop/`.
   Pass a relative destination when the repository has an established tooling location.
   The script refuses an existing destination; use `--force` only after preserving and reviewing its contents.
4. Resolve compatible `oxlint` and `@oxlint/plugins` versions from current package metadata and the repository's dependency constraints.
   Install them as development dependencies for a local plugin, using the existing package manager.
5. Register the copied `index.ts` as the `anti-slop` JavaScript plugin in the current Oxlint configuration.
   Use [the bundled export map](assets/anti-slop/index.ts) as the rule list and enable its rules at `error` severity.
   Preserve unrelated plugins and rules.
6. Exclude the copied plugin and generated or installed agent assets from application linting.
   Identify those paths from the repository; do not ignore every hidden directory, which may contain owned source.
   For a Vite+ project, read [Vite+ integration](references/vite-plus.md) before updating its lint and format configuration.
7. Run the repository's lint and type checks, including any combined check that also formats files.

## Migration and result

Keep project-specific rules in their existing owner rather than silently replacing them with the generic bundle.
Compare removed files and diagnostics when migrating an older copy.
Fix existing application violations when migration or cleanup is part of the request; an installation-only request should report them.
Preserve rule severity and required behavior while resolving findings.
Do not hide violations with unsafe assertions or suppression.

Report the copied path, resolved versions, configuration changes, checks, and unresolved findings.

## Log the run

```bash
skill-run-log /install-anti-slop --target "<repository>" --verdict <INSTALLED|BLOCKED> --next /<next-skill-or-stop>
```
