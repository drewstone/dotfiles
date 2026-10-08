# Shared agent skills

This repository owns the skill directories beside this file.
The current `SKILL.md` descriptions define their capabilities.
Run `skills` to discover the installed collection, including skills owned by sibling repositories and plugins.

Read [the authoring guidance](_common.md) before creating or changing a skill.
It defines conditional references, current source ownership, task boundaries, and the shared run log.

## Installation

From the repository root, run `bash claude/install.sh` to install the configuration.
[The installer](../install.sh) owns the destination paths and the conversation subset.
Resolve existing links before updating an installation; local settings or skills can point into a different working tree.
Preserve unrelated edits and external skills.

Skills owned by another maintained repository, such as agent-runtime's, stay linked to that source.
A skill adapted from outside work is rewritten here in our own words and credits it in one line ("Derived from <repo> (MIT)").

## Validation

Run `node --test tests/skills.test.mjs` for discovery, installation, logging, chaining, and local-reference checks.
Run `npm test` for the repository's complete checks.
Structural checks do not establish whether a skill helps with real work; use independent task checks for substantial instruction changes.
