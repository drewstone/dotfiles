# Anti-pattern: sprawl (bolt-on instead of unify)

The single most expensive failure mode in this repo is not a wrong fix — it is
**solving the same problem N times in N places** and then paying to keep the N
copies in sync forever. Every time a new need appears we are tempted to add a
new module, a new timer, a new counter, a new gate. That is bolt-on. The
opposite — find the one place the concept already lives and extend it — is
unify. Default to unify.

## How to recognize it

- **Duplicated measurement.** Five `Date.now()` timers (ship receipt, eval
  benchmark, billing `compute_ms`, agent `ExecutionTrace`, ad-hoc
  `Server-Timing`) each timing a slice of the same operation, joined by nothing.
  A number reported by one cannot be reconciled against another.
- **Parallel abstractions for one concept.** Two SSE parsers, two "customer
  count" definitions, two host-health signals — each drifting independently, so
  a bug fixed in one silently persists in the other.
- **Counters that count different things under one name.** `customerActiveCount`
  meaning "customer sessions" in one reader and "running containers" (warm seeds
  + egress proxies included) in another. The name lies; every consumer inherits
  the lie.
- **A new flag/gate per symptom.** Each production incident adds one more
  `if (specialCase)` instead of fixing the invariant the special case violates.

## Why it is expensive

Sprawl multiplies the surface that must stay correct. A drift between two copies
is invisible until it causes an incident, and then the fix has to be applied in
every copy or it reappears. The warm-accounting bug shipped as *three* live
symptoms (empty-proof deadlock, 503-past-warm, batch-50 cap) precisely because
one polluted counter was read by three subsystems. One truthful counter fixes
all three; three separate patches would have left two of them latent.

## The rule

1. **Before adding, search for the existing home.** grep/ls for the primitive,
   the counter, the parser, the timer that already covers this concept. If one
   exists, extend it. A `[[reference]]` to it beats a fork of it.
2. **One concept, one definition, one source of truth.** If two readers need the
   same quantity, they read the same computed value — never two look-alike
   computations. Downstream reads a value; it does not re-derive it.
3. **Extend the primitive, don't wrap it.** SSE goes through the shared
   `parseSSEStream`; telemetry through the one `StageSpan`; warm detection off
   one durable identity. New behavior is a new field/case on the primitive, not
   a sibling of it.
4. **A gate proves an invariant; a special-case flag hides its violation.** If
   you reach for a per-symptom flag, the invariant is wrong — fix the invariant.
5. **When you must diverge, make the divergence first-class and named** (e.g. an
   explicit per-role split), not two things wearing one interface's clothes.

## The tell

If your change adds a module/counter/timer/gate whose *description* is nearly
identical to something that already exists, stop. You are about to sprawl. The
correct change is almost always smaller and lives inside the thing you were
about to duplicate.
