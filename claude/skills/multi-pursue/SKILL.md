---
name: multi-pursue
description: Generational leaps in PARALLEL — decompose a large initiative into N independent pursue-able tracks, fan them out with pinned briefs, adversarially verify each, then synthesize. Triggers - "multi-pursue", "all of these in parallel", "fan out these initiatives", "pursue these tracks at once", "boil the ocean on X", a large architectural initiative that splits into independent buildable pieces. The parallel sibling of /pursue (one track) and the discipline layer on top of the Workflow tool (raw fan-out).
---

# multi-pursue

`/pursue` makes ONE coherent generational leap. `multi-pursue` makes SEVERAL
at once. It is `pursue`'s design discipline × the `Workflow` tool's deterministic
fan-out × an adversarial verification gate. Use it when a single ask decomposes
into multiple **independent** architectural tracks that each deserve a real
build — not parameter tweaks, not a checklist of chores.

## When to use vs not

USE when:
- The initiative splits into ≥2 tracks that can be built without waiting on each
  other (e.g. "add domain dims AND truth anchors AND a benchmark AND a skill").
- Each track is a real build (new module, new subsystem), not a one-line edit.
- You want them done concurrently, not serialized over days.

DO NOT use when:
- The tracks are sequentially dependent (B needs A's output) — use `/pursue` per
  track in order, or a single `Workflow` pipeline.
- It's a metric-convergence loop — use `/evolve`.
- It's one coherent change — use `/pursue`.
- The work is mechanical/chore-shaped — just do it.

## The method

### 1. Decompose into independent tracks
Audit the initiative. Split into the smallest set of tracks that are (a) truly
independent (no shared mutable file, no ordering dependency) and (b) each a
coherent leap. Name each track's **deliverable** and **done-criteria** (a test
that proves it). If two tracks must touch the same file, either merge them into
one track or designate ONE track as the owner of that file and have the others
return data the owner splices (never two agents writing one file — that races).

Sequence the dependent tracks OUTSIDE the fan-out: do the foundational one
yourself (or as track 0), then fan out the rest against its output.

### 2. Pin every track's brief (the pursue discipline, per agent)
A fanned-out agent must NEVER re-derive the design. Each brief carries:
- **Full context** — the goal, where it fits, the architecture it plugs into.
- **A reference implementation** — point at an existing file that is the proven
  pattern to mirror exactly (e.g. "copy the shape of `standards/functional-safety.ts`").
- **The exact contract** — interfaces, types, file paths, naming.
- **Forbidden anti-patterns** — the specific mistakes to avoid, with reasons.
- **The done-criteria + how to self-verify** — "write a test, RUN it, report the
  real exit code; do not claim pass without running."
- **Isolation rules** — which files it may write, which it must NOT touch
  (especially shared registries/indexes — reserve those for the synthesis step).

Use `Workflow` with `schema:` on each `agent()` so tracks return structured
wiring info (file paths, export names, import lines, test status), not prose.

### 3. Fan out via Workflow
Author a `Workflow` script: one `phase()` per logical group, `parallel()` or
`pipeline()` of `agent()` calls — one per track. For tracks that mutate files in
parallel and could conflict, use `isolation: 'worktree'`. Otherwise keep them in
separate files and integrate centrally.

Scale to the ask: "do all of these" → one agent per track. "be exhaustive" →
add an adversarial-verify phase per deliverable.

### 4. Adversarially verify each track (don't trust "tests pass")
A subagent's "builds green / tests pass" is a CLAIM, not verification. After the
fan-out returns, the ORCHESTRATOR (you) must:
- Run the full gate yourself — typecheck + every test — and read the real output.
- For each track, run one adversarial check the agent wouldn't have: an input it
  probably didn't handle, a skip/edge case, a cross-track interaction.
- Prove ONE track fully before trusting the pattern across all N.

### 5. Synthesize centrally
Wire every track into the shared registry/index YOURSELF, one edit at a time
(this is the file you reserved from the agents). Splice returned data (personas,
configs) into shared arrays. Re-run the full gate. Fix what the integration
surfaces (agents introduce schema drift, missing awaits, naming collisions —
expect it). Commit only when the WHOLE thing is green, not when the agents said so.

## Hard-won failure modes (encode these)
- **One error in a `parallel()` batch cancels all siblings.** When you, the
  orchestrator, run dependent shell/read calls to integrate, do them
  SEQUENTIALLY — a single throw (a missing file, a bad parse) aborts the batch.
- **Agents write tests with the wrong idiom.** Pin the project's test convention
  in the brief (e.g. "tsx assertion script, NOT vitest") or you'll delete and
  rewrite their tests during synthesis.
- **Agents drift on shared schemas.** Anything validated against a Zod schema /
  enum / known-list: give them the exact allowed values in the brief, and
  re-validate centrally — don't trust the literal they return.
- **Don't let agents edit the index/registry.** Reserve it. Race-free synthesis
  is the orchestrator's job.
- **Verify the commit actually landed.** Re-read HEAD after committing; a
  cancelled tool batch can swallow a commit you thought ran.

## Output
A short report: tracks built, what each delivered, the adversarial check you ran
on each, the final gate result, the commit hash. Name any track that came back
weak and what you fixed during synthesis.
