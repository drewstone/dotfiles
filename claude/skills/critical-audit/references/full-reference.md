# Critical Audit — worked examples

Not a contract. `SKILL.md` is the only normative file; nothing here overrides it.

## Worked example 1 — persona fan-out on a streaming SDK (5 personas)

Target: a public streaming SDK package (`sdk/`, `docs/`, `examples/`). Flag: `--personas=indie-cf,enterprise-platform,researcher-batch,ai-coding-agent,sdk-surface-designer`.

Result: 4 wire-chain breaks (Zod schemas rejecting payloads the internal types accepted) + 1 durable-state anti-pattern — a customer had reimplemented the SDK's session-client and idempotency logic inside their own Durable Objects because the README never anchored them. A single-pass A/B/C audit found 0 of the 5: the surface-designer persona traced the wire breaks, the ai-coding-agent persona named the missing anchor.

Read as: personas pay for themselves only on customer-facing surfaces, and only at ≥3 personas.

| Persona | Uniquely catches |
|---|---|
| `indie-cf` | stream-drop / reconnect gaps, reload survivability, "shipped the primitive but not the prose" |
| `enterprise-platform` | idempotency for billing-grade retry, audit-trail gaps, deploy resilience, billable-vs-not signals |
| `researcher-batch` | resume-after-crash on hour-long runs, per-turn idempotency against double-billing |
| `ai-coding-agent` | exported subpaths with no narrative anchor; silently invents DOs / KV / hand-rolled replay state |
| `sdk-surface-designer` | end-to-end wire-chain breaks; internal type vs public Zod schema mismatches |

Synthesis shape that worked: convergent findings (flagged by ≥2 personas) ranked first, then per-persona uniques kept separate so ownership is obvious, then fixes grouped by area (`docs/`, `sdk/`, `examples/`) rather than by persona.

## Worked example 2 — persisted run layout

```
.agent/critical-audit/2026-04-17T20:30:00Z/
├── manifest.json   # {scope, base, head, project_type, flags, findings_count_by_severity, priorRun?}
├── findings.jsonl  # {severity, file, line, defect, scenario, status, evidence, fix, verification, costIfShipped, savedIfFixed}
└── summary.md      # the emitted artifact
```

`--reaudit` reads the prior `findings.jsonl`, re-checks each `file:line` against HEAD, and writes a new timestamped run whose `manifest.json` carries `priorRun`.

## Worked example 3 — parallel dispatch cost

Three documented `--parallel` runs (skills-workflow, hosting-skill-workflow, gpu-providers-session) hit provider 429s and returned partial reviewer output; findings were silently lost, not retried. Serial A→B→C on the same scopes returned complete output. This is the measurement behind the serial default.
