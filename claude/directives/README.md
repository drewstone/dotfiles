# Interaction Directives

The **response-shaping layer**: a swappable directive injected into *every* agent turn that
governs voice, lead/ask behavior, and how a run is closed out. This is distinct from
`CLAUDE.md` (global *rules*) — directives shape *how* a response is delivered, and are
**measured and rotated** so we can learn which style actually produces better runs.

## Files

- `active` — single line. Either a variant slug (`lead-checkpoint-v1`) or a rotation spec
  (`rotate:lead-checkpoint-v1,terse-ops-v1`) for randomized-by-session A/B.
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
transcripts to score each variant — did runs under `terse-ops-v1` need fewer corrective
turns, fewer re-asks, less back-and-forth? Winning variants get promoted into `active`;
losers get retired or rewritten. That join is what closes the loop: the engine learns the
style, the directive applies it, the engine re-measures.

## Adding a variant

`directive new my-idea` → edit `variants/my-idea.md` → `directive rotate <current>,my-idea`
to start splitting traffic. Each variant should encode a *distinct hypothesis* about what
makes a response better (structure vs. density, more vs. less proactive checkpointing, etc.),
not a cosmetic tweak — otherwise the measurement can't separate them.
