# Interaction Directives

The **response-shaping layer**: a swappable directive injected into *every* agent turn that
governs voice, lead/ask behavior, and how a run is closed out. This is distinct from
`CLAUDE.md` (global *rules*) — directives shape *how* a response is delivered, and are
**measured and rotated** so we can learn which style actually produces better runs.

## Files

- `active` — single line. Either a variant slug (`evidence-lead-v1`) or a rotation spec
  (`rotate:evidence-lead-v1,<new-slug>`) for randomized-by-session A/B.
- `variants/<slug>.md` — one directive variant. Keep them tight; this is injected on every turn.

## How it reaches a response

- **Claude (per-turn):** the `UserPromptSubmit` hook `hooks/inject-directive.sh` reads `active`,
  resolves the variant (deterministic per-session pick when rotating), and injects it as
  `additionalContext` wrapped in `<interaction-directive variant="...">`. Fail-open: any error
  injects nothing and never blocks the prompt.
- **Codex (session-level):** *next increment* — Codex has no per-turn hook; the active variant
  will be composed into its `AGENTS.md` surface at switch time. Not yet wired; see TODO below.

## Control surface (`directive` CLI, symlinked to `~/bin`)

    directive               # show active + available variants
    directive show          # print the resolved active variant body
    directive list          # list variants
    directive set <slug>    # make <slug> active
    directive rotate a,b    # enable A/B rotation across sessions
    directive new <slug>    # scaffold a new variant
    directive log [N]       # tail the session→variant assignment log

## Measurement seam

Each new session's variant assignment is logged once to `~/.claude/directives-log.jsonl`:

    {"ts":"...","session":"<id>","variant":"<slug>","cwd":"..."}

The `trace-insights` engine (offline, daily) joins these assignments against the session
transcripts to score each variant — did runs under a variant need fewer corrective
turns, fewer re-asks, less back-and-forth? Winning variants get promoted into `active`;
losers get retired or rewritten. That join is what closes the loop: the engine learns the
style, the directive applies it, the engine re-measures.

## Adding a variant

`directive new my-idea` → edit `variants/my-idea.md` → `directive rotate <current>,my-idea`
to start splitting traffic. Each variant should encode a *distinct hypothesis* about what
makes a response better (structure vs. density, more vs. less proactive checkpointing, etc.),
not a cosmetic tweak — otherwise the measurement can't separate them.

## Measurement status (2026-10-11)

`terse-ops-v1` was the single active variant from 2026-09-20 to 2026-10-10, across 4,011 sessions in the Mac's assignment log.
So no variant had a measured result by 2026-10-11.
On 2026-10-10 Drew rejected terse output for analysis ("These bullet points just aint cutting it"), and `evidence-lead-v1` became active.
The inactive variants (`terse-ops-v1`, `lead-checkpoint-v1`, `gate-checkpoint-v1`) were then deleted; git history keeps them.
Before the join existed, the measurement was the corrections ledger in [the climb](../../docs/processes/climb.md#corrections-are-data): Drew's corrections per session, by theme, under each variant.

On 2026-10-11 Drew rejected the terminal output itself: two colors, no fixed order for what, why, how and focus, unambitious answers that lean on old records, and no visible sign of learning from a week of Terraform mistakes.
`evidence-lead-v1` was rewritten in place, keeping its slug, with the same blocks in the same order every turn, emoji color for status and charts, the owner's voice, and a Learned block that shows each mistake, its durable fix and its status.
The assignment log records the slug, not the text, so split its sessions at the merge time of the PR that made this rewrite (`git log --format='%cI %s' -- claude/directives/variants/evidence-lead-v1.md` lists it).
The measure is the corrections ledger's communication theme after that time against before it.

## Rotation (2026-10-15)

The trace-insights join now exists: trace-mine's daily analyst writes a "Directive scores" table, with corrections per hour and per turn and 95% intervals per variant.
On 2026-10-14 `evidence-lead-v1` had 43 labelled turns at 18.6% corrections per turn [9.7%, 32.6%].

The rotation `evidence-lead-v1` vs `evidence-lead-rhythm-v1` starts 2026-10-15.
`evidence-lead-rhythm-v1` is `evidence-lead-v1` plus a Rhythm section; the hypothesis is that long unattended work units, a written finish line, and a restate-after-two-corrections reset lower Drew's correction rate.
Decision rule: after at least 300 labelled Drew turns per arm or 14 days, whichever comes first, keep `evidence-lead-rhythm-v1` if its per-turn correction rate is at least 5 points lower than `evidence-lead-v1`'s; otherwise set `evidence-lead-v1` back with `directive set evidence-lead-v1`.
Record the result here and in the climb ledger.
