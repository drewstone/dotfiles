# pstack skills — pi port

Vendored from https://github.com/cursor/plugins (pstack, MIT, (c) 2026 Lauren Tan).
Upstream skill set: 50 skills. This is a curated operator-side subset for pi.

## Curated set (18)

- `correct` — the star: find repeated agent mistakes, fix each at the highest
  enforcement level (architecture > types > lint > test > docs), prove each
  check fails on a real past mistake. Pairs with discovery-lab's
  known-failures discipline.
- `arena`, `swarm` — fleet patterns: N-candidates + cross-judge + graft;
  fan-out/drain/report with PASS/ISSUES/BLOCKED contracts.
- `interrogate`, `show-me-your-work`, `unslop`, `technical-writing`,
  `figure-it-out`, `blast-radius`, `benchmark-checklist` — craft and scrutiny.
- 9 `principle-*` skills — harness-agnostic engineering principles.

## Deliberately not installed (collisions / not applicable)

- `reflect`, `tdd`, `prototype`, `code-review` — pi already ships equivalents.
- `poteto-mode`, `setup-pstack`, `make-bot-ui`, `automate-me`, `recall`,
  `teach`, `why`, `how`, `bro`, `no-comments`, `architect` — Cursor-specific
  or redundant with pi's existing set.
- Remaining principles — add on demand; see below.

## Adaptation notes

- pi ignores the Cursor-specific `disable-model-invocation` frontmatter flag.
  For `arena`/`swarm`: references to `~/.cursor/rules/pstack-models.mdc`,
  the `Task` tool, `subagent_type`, and `environment: cloud` are Cursor
  mechanics. In pi, spawn subagents via the harness's subagent mechanism or
  background `pi` processes; pick models from what your providers actually
  offer; keep the parts that matter — standalone briefs, declared
  done-predicates, pre-registered rubrics, report contracts with evidence,
  and gap-does-not-count-as-pass.
- Skill descriptions ride in every session's system prompt; that is why this
  is a curated set, not all 50.

## Adding more from upstream

    git clone --depth 1 --filter=blob:none --sparse https://github.com/cursor/plugins /tmp/pp
    cd /tmp/pp && git sparse-checkout set pstack
    cp -r pstack/skills/<name> ~/dotfiles/pi/pstack-skills/
    ~/dotfiles/pi/install-pstack-skills.sh

## Install

    ~/dotfiles/pi/install-pstack-skills.sh

Copies into ~/.agents/skills/ (canonical store) and symlinks each into
~/.pi/agent/skills/ following the existing pattern. Re-running is safe.
