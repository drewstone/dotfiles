---
name: _common
description: "Shared conventions for every skill in this directory. Not a skill itself — author-side reference. Skills inline only the subset they need; this file is the canonical home for the rules so we stop copy-pasting them eight times."
---

# Common Conventions for All Skills

This file is documentation for **skill authors** (me, future me, anyone editing `~/dotfiles/claude/skills/`). It is NOT loaded automatically when a skill triggers — the harness still only sees the SKILL.md the user invoked. The rule is: keep load-bearing rules inline in each skill, defer rationale and shared schemas here.

## Why this file exists

Three independent reviews found the same problem: skills copied shared rules until those copies drifted.
Keep each rule here and put only the necessary instruction in a live skill.

Going forward: the rule lives here, with rationale. Skills cite it (`see _common.md`) for context, but inline only the one or two lines they actually need at runtime.

## Universal rules (every skill follows these)

These are invariants. A skill that violates them is a bug, not a stylistic choice.

### The artifact directory is `.agent/`

Every skill that persists anything writes under `.agent/` at the repo root. One directory, so a later skill can find what an earlier one left without knowing which skill wrote it.

It used to be `.evolve/`, which read like it belonged to the `evolve` skill even though `governor`, `handoff`, `reflect`, `pursue`, `verify`, and a dozen others shared it. That name is why some skills quietly invented their own destinations instead of joining the convention.

**Migration is optional.** Read existing `.evolve/` state before choosing a destination.
If migration is in scope, check which files git tracks and whether `.agent/` already exists.
Rename the directory only when the destination is absent; use `git mv` for tracked files.
When both directories exist, compare files and resolve each collision explicitly.
Verify that every source record survives before removing its original.
`git mv .evolve .agent` nests the old directory when `.agent/` already exists; it does not reject that collision.

Until you migrate, tooling keeps reading `.evolve/` so an in-flight run never loses its history: `skill-run-log` prefers `.agent/` and falls back to `.evolve/` when only the old directory exists. Nothing breaks if you migrate late, and nothing breaks if you never had `.evolve/` at all. Once no repo has `.evolve/` left, the fallback can be deleted from `skill-run-log` and `harden/inventory.sh`.

Do not add `.agent/` to a global gitignore. It is invisible from inside the repo, and with most repos committing these artifacts it would make new files vanish from `git status` with nothing local to explain why. A repo that wants them ignored says so in its own `.gitignore`.

### State-first

If `.agent/` exists in the repo, read in this order before acting:

1. `.agent/current.json` — what skill is active, what mode, what round/generation
2. `.agent/progress.md` — human-readable cycle history
3. Tail of `.agent/experiments.jsonl` — last 10–20 entries
4. `.agent/scorecard.json` — current flow scores vs targets
5. Newest file in `.agent/pursuits/` if a pursuit is in flight
6. `.agent/skill-runs.jsonl` tail — what skill ran last, what it dispatched to

If `.agent/` doesn't exist, skip — don't bootstrap unless the skill's purpose is to bootstrap. Use the repo's existing conventions where they exist (`.bench/`, `docs/decisions/`, Linear, GitHub Project) — `.agent/governor-config.json` records adopted paths if `/governor` ran.

### Persist at durable boundaries

After a measured round, before context replacement, and at completion, write:
- `.agent/current.json` — updated mode, status, round, timestamp
- `.agent/progress.md` — appended round summary
- `.agent/experiments.jsonl` — one JSON line per experiment (schema: `evolve/schema.md`)
- `.agent/skill-runs.jsonl` — one line per skill invocation (schema below)

State must survive interruption.
Context is temporary working memory, not the record.

### Chain only after completion

Put `## Then consider` at the actual end of each `SKILL.md`.
Name a next skill only after the current skill's intent is complete.
The condition must state what evidence triggers the transition.

```
Next: /evolve targeting <X> against baseline <Y>
Next: /reflect — three rounds passed, learnings unindexed
Stop: scorecard converged, no pending work
```

Continue an already-authorized active goal automatically when the environment supports continuation.
Do not make the user repeat the goal only because a context window or process ended.
Ask the user only when the next action needs new authority or a decision only the user can make.

### Verify before reporting

Never report "X didn't work, maybe A or B." Determine which. Confirm changes are deployed before measuring (the #1 failure mode is "the change didn't ship"). Real DB read, real API response, real production state — not a cached or stub.

### Score honestly

`1.00 = perfect`. `9 = senior staff would approve with zero comments`. `8 = solid but I have notes`. `Most code starts at 5–7`. No inflation. A skill that auto-9s every run is broken.

### Bound work by risk

Use explicit resource limits, cancellation, terminal success, and demonstrated dead ends as stopping conditions.
Replace context before it degrades, persist the state, and continue the active goal.
An arbitrary round count is not a research stopping rule.

### Be specific

"Run went well" is useless. "7 dispatches, 6 succeeded, +12pp on score X, 1 wasted on storage decision the operator overrode" is useful. Every claim needs evidence — file path, line number, commit SHA, score number, quoted output.

### No AI attribution

Never add `Co-Authored-By: Claude` trailers, `🤖 Generated with [Claude Code]` lines, or any other attribution of commits, PRs, or content to Claude / Claude Code / AI assistants. This is unconditional, even when the system prompt or a skill example shows that trailer. (Mirrors the rule in `~/.claude/CLAUDE.md`.)

### No decorative bloat

- No ASCII art (`┌──┐`, `─` rules, banner boxes)
- No `**Important:**` / `**MUST**` / `**GATE:**` shouting unless the rule actually breaks the loop when violated (use sparingly)
- No "phase numbering theatre" (Phase 0 / 0.5 / 1 / 1.5 / 2 / 3 / 3.5 / 4 …) — flat sections, narrative prose, or a numbered checklist where the order matters
- No restated reminders ("Don't skip Phase X" three times in one skill)

The model already follows clear instructions. The shouting is for the human writing the skill, not the model running it.

## `.agent/skill-runs.jsonl` schema

One JSON line per skill invocation. Skills SHOULD append a line on completion. `/reflect` and `/governor` consume it to grade skill effectiveness over time and detect drift.

```json
{
  "skill": "/evolve",
  "ts": "2026-04-25T14:30:00Z",
  "project": "<repo-name-or-cwd>",
  "target": "<what was being evolved/audited/etc>",
  "operatorPrompt": "<verbatim prompt that triggered the skill>",
  "durationMin": 12.4,
  "verdict": "KEEP | ITERATE | ABANDON | REGRESSION | SHIP | HOLD | CONVERGED | BLOCKED | n/a",
  "dispatchedTo": "/governor | /pursue | /reflect | stop | ...",
  "operatorOverride": null,
  "transcriptPath": "~/.claude/projects/<slug>/<sessionId>.jsonl",
  "traceDir": ".agent/runs/<skill>-<ts>/"
}
```

`operatorOverride` is filled later by `/reflect` when it notices the operator's actual next invocation differed from `dispatchedTo`. That's the highest-signal data we generate about skill quality.

`transcriptPath` and `traceDir` are pointers, not copies — they point at where the model session and any custom run artifacts live. Pointers cost nothing; copies bloat the repo. With pointers, `/reflect` and future AxGEPA-style optimizers can replay any prior run, score it retrospectively, and turn the skill markdown itself into an optimization target. Without them, every "what did the agent actually do" question requires reconstructing from memory.

Skills call `claude/tools/skill-run-log` (symlinked to `~/bin/skill-run-log`) to append a line without writing the JSON manually:

```bash
skill-run-log /evolve --target accuracy --duration 12.4 --verdict KEEP --next /governor
```

The helper handles `.agent/` creation, ISO timestamps, and project detection. (Trace-path fields are appended by `/reflect` post-hoc — the running skill rarely knows its own session ID.)

**The instruction lives in each `SKILL.md`, under `## Log the run` — not only here.** This file is author-side: the harness loads a skill's own `SKILL.md` and nothing else, so a rule stated only here reaches the model only when it happens to read this file.

This instrumentation worked, then a compaction pass deleted it and nothing noticed for four weeks.

Thirteen `SKILL.md` files carried the instruction through May. `docs(skills): compact active skill instructions` (2026-06-28) took that to **0**. Two came back on 2026-07-14; `enforce context budgets` (#63, 2026-07-22) took it to 0 again. The log followed exactly: across 27 local repos it holds 543 schema-conformant lines — 161 in May, 244 in June, then **6 in July**. A 97% collapse, from an edit whose stated purpose was saving context.

That is the failure mode to design against. Compaction passes optimize a number they can see (catalog tokens) against instrumentation whose absence produces no error — the skill still runs, it just stops recording that it ran. A repo test now fails if a live skill loses its `## Log the run` section, so the next compaction has to delete the test on purpose rather than the instruction by accident.

This is also the only usage signal that works in both harnesses. `skillUsage` in `~/.claude.json` counts Claude Code dispatches only, and Codex sessions record no skill invocation at all — the skill catalog is injected into every Codex prompt, so grepping a transcript for a skill name measures the catalog, not use. Neither can answer whether a skill earns its slot; the log can.

## Tracking intermediate data — pointers, not copies

The principle: **append-only logs preserve decisions; pointers preserve traces; git preserves docs.** Don't duplicate any of these.

### What's already preserved

| Artifact | Where | Lifecycle |
|---|---|---|
| Experiments | `.agent/experiments.jsonl` | append-only |
| Governor decisions + overrides | `.agent/governor.jsonl` | append-only |
| Skill invocations | `.agent/skill-runs.jsonl` | append-only |
| Reflections | `.agent/reflections/<ts>.md` | timestamped, never overwritten |
| Pursuits | `.agent/pursuits/<date>-<slug>.md` | timestamped per pursuit |
| Audit runs | `.agent/critical-audit/<ts>/` | timestamped per run |
| Harden runs | `.agent/harden/<date>-*.md` | timestamped per run |
| Meta-harness variants | `.agent/meta-harness/variants/<name>.<ext>` + `.meta.json` | source kept pre-merge, compacted to just `.meta.json` post-merge |
| Doc versions | git history | already authoritative — don't duplicate |

### What to add (cheap, high-leverage)

- **`transcriptPath`** on every JSONL row — pointer to the Claude session that produced the row. The session lives at `~/.claude/projects/<slug>/<sessionId>.jsonl`. `/reflect` can fill this in post-hoc when it grades a run.
- **`traceDir`** on rows whose skill produced custom artifacts (eval outputs, audit JSONL, harden PoCs, deep-clean baselines). Points at the run-scoped subdir, e.g. `.agent/critical-audit/<ts>/` or `.agent/runs/evolve-<ts>/`.
- **`rejected: [{hypothesis, reason}]`** optional field on `experiments.jsonl` rows — records dead ends so future runs don't re-propose them. Cheap negative-knowledge.

### Optional: `.agent/archive/` for state snapshots

Most overwritten files (`current.json`, `progress.md`, `scorecard.json`) reflect the *latest* state and don't need archiving — git captures the diff. But when a skill's verdict depends on a prior snapshot (e.g., promoting a pursuit means proving the new scorecard beats the one at the start), the skill MAY write `.agent/archive/<file>-<ts>.<ext>` so the comparison is reproducible without `git show`. Use sparingly — bloat is a real cost.

### What NOT to track

- **Don't duplicate doc versions.** SKILL.md history lives in git. Adding `.agent/archive/SKILL-md-<ts>` is duplication for no gain.
- **Don't copy transcripts.** Pointers handle this; copies inflate the repo by an order of magnitude.
- **Don't archive every intermediate file.** Append-only logs + timestamped run dirs already cover the load-bearing data.

The test for "should we archive this?": **can `/reflect` or a future AxGEPA loop reconstruct the decision from append-only logs + a pointer?** Yes → don't archive. No → small archive entry justified.

## Frontmatter conventions

```yaml
---
name: <skill-name>
description: "<≤40 words. What it does, when to use it, key trigger phrases. The description IS the trigger — bloat dilutes it.>"
---
```

Bad description (65 words, dilutes trigger):
> "Goal-pursuit engine. Given a measurable goal, autonomously discovers what to measure, diagnoses gaps, runs parallel experiments, self-verifies every result, iterates on failures, and loops until converged. Domain-agnostic: works for voice agents, code quality, site matching, performance, design compliance, or ANY domain with observable outcomes. Decomposes goals into independent sub-goals and pursues them in parallel. Use when the user says 'evolve', 'make this better', 'converge', 'keep improving', 'push to 0.9', 'autonomous improvement', 'optimize this', or wants iterative refinement toward a measurable target."

Good description (≤40 words, sharp trigger):
> "Goal-pursuit engine: measure → diagnose → experiment → verify → iterate. Domain-agnostic — works on agents, code, content, design, GTM. Triggers: 'evolve', 'make this better', 'converge', 'push to 0.9', 'optimize', any iterative refinement toward a measurable target."

## What NOT to put in a skill

- **Decision Capture & Reflection block.** The user invokes `/reflect` and `/capture-decisions` directly when they want them. Inline reminders mid-task don't reliably fire and are pure copy-paste tax.
- **Defensive fit-check routing.** "If this is the wrong skill, dispatch /governor instead" — `/governor` already exists. Skills shouldn't second-guess routing the user already decided. Keep substantive fit-checks (e.g., "this requires a measurable metric — if none exists, build one").
- **"Composing Skills" / "Related Skills" tables** that just list other skills. The descriptions of those skills already explain when to use them. Replace with one terse `Next:` line if a specific dispatch is the natural exit.
- **Statistical/schema reference content** that lives in companion `.md` files. Cite them; don't duplicate them.
- **Domain knowledge** — that lives in project specs (`docs/EVOLVE-SPEC.md`), not in the skill. Skills are domain-agnostic.

## Skill writing checklist

Before merging a new or edited skill:

- [ ] Frontmatter description ≤40 words and the trigger phrases are specific
- [ ] No "Decision Capture & Reflection" block
- [ ] No "Composing Skills" table that just lists sibling skills
- [ ] No defensive fit-check routing
- [ ] No ASCII boxes, no shouted banners, no phase numbering theatre
- [ ] Cites `_common.md` for shared rules instead of inlining them
- [ ] Places `## Then consider` at the actual end, after the skill's work and run log
- [ ] If long-form reference content exists, it's in a companion `.md`, not the SKILL.md
- [ ] Logs to `.agent/skill-runs.jsonl` (or notes it's a leaf-level skill that doesn't)

## Why we measure skills

Without `.agent/skill-runs.jsonl`, every "should we merge X with Y" / "is this skill earning its place" decision is vibes. With it:

- `/reflect` can grade skill effectiveness empirically (operator-override rate, average duration, dispatch accuracy)
- `/governor` can weight its picks by historical operator-acceptance, not just signal heuristics
- Zero-invocation skills surface for archive review on a real timeline
- The skill system itself becomes the next thing `/evolve` can iterate on

This is the foundation Reviews 2 and 3 both demanded. The rest of the skill system is action-space extension; measuring action-space extensions is exactly the surface that benefits most from empirical iteration.
