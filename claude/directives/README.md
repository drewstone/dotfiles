# Interaction Directives

The **response-shaping layer**: a swappable directive injected once into every context window that
governs voice, lead/ask behavior, and how a run is closed out. This is distinct from
`CLAUDE.md` (global *rules*) — directives shape *how* a response is delivered, and are
**measured and rotated** so we can learn which style actually produces better runs.

## Files

- `active` — single line. Either a variant slug (`evidence-lead-v1`) or a rotation spec
  (`rotate:evidence-lead-v1,<new-slug>`) for randomized-by-session A/B.
- `variants/<slug>.md` — one directive variant. Keep them tight; every context window carries one.

## How it reaches a response

- **Claude (per context):** the `SessionStart` hook `hooks/inject-directive.sh` runs for the
  sources startup, resume, clear and compact. It reads `active`, resolves the variant (the
  session's pinned variant, or a deterministic per-session pick when rotating), and injects it as
  `additionalContext` wrapped in `<interaction-directive variant="...">`, so each context window
  carries one copy and a compaction adds it back. On `UserPromptSubmit` it
  added ~4 KB on every prompt, mid-turn messages included. Fail-open: any error injects
  nothing and never blocks the session.
- **Codex (session-level):** *next increment* — Codex has no per-turn hook; the active variant
  will be composed into its `AGENTS.md` surface at switch time. Not yet wired.

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

The same assignment lands as `agent.directive.variant` on the session's identity record,
`~/.local/state/session-identity/claude-code/<id>.json`, beside the harness, model, profile
and skills the SessionStart hook records there (`hooks/session-identity.sh`).

## Adding a variant

`directive new my-idea` → edit `variants/my-idea.md` → `directive rotate <current>,my-idea`
to start splitting traffic. Each variant should encode a *distinct hypothesis* about what
makes a response better (structure vs. density, more vs. less proactive checkpointing, etc.),
not a cosmetic tweak — otherwise the measurement can't separate them.
