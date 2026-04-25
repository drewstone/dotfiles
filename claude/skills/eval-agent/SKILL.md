---
name: eval-agent
description: "Build LLM-as-judge systems with rubrics generated from real reference material (not hand-written). Scores targets, returns structured findings, drives improvement loops. Triggers: 'build an evaluator', 'LLM as judge', 'scoring pipeline', 'quality gate', 'rubric generation'."
---

# Eval Agent — Build Agentic Evaluation Systems

Build LLM-as-judge systems that evaluate targets (code, conversations, outputs, agents) using dynamically generated rubrics grounded in real reference material. Shared conventions in `_common.md`.

## Prerequisites

- **Subjective target.** Two humans could disagree on quality (writing, conversation, design, generated code-fit). Objectively checkable (compiles, test passes, HTTP 200, string match) → write a test, not an eval. LLM judges on objective criteria waste tokens and add variance.
- **Reference material exists.** Rubrics come from real examples (good outputs, bad outputs, domain docs). No references → scope a gathering pass first via agentic `claude -p` with Read/Grep. Don't hand-write the rubric — that's the anti-pattern this skill replaces.
- **A consumer.** Almost always dispatched BY another skill (`/evolve` needs measurement, `/pursue` needs a subjective success criterion, `/polish` needs a domain-specific rubric). Direct invocation → confirm who consumes the rubric. An eval nothing reads is infrastructure debt.
- **Resume**: if `.evolve/eval-agent/rubrics/<domain>.json` exists, re-hash the reference blob to verify it hasn't drifted. Stale rubrics silently score against old criteria.

## Core Pattern

```
REFERENCES → RUBRIC GENERATOR → RUBRIC → EVALUATOR → FINDINGS → (optional) DRIVER → IMPROVEMENT
```

Every eval system has the same 4 components. This skill builds them.

## Component 1: Reference Gatherer

Collects domain knowledge the evaluator needs. Does NOT hardcode it — uses tools to discover it dynamically.

**Implementation:** An agentic subprocess (`claude -p`, `codex`, or `opencode`) with Read/Glob/Grep/Bash permissions that:

1. Reads skill references for the domain (e.g., `~/.claude/skills/<skill>/references/`)
2. Greps real-world examples in the codebase or adjacent repos
3. Reads API docs, SDK patterns, test fixtures
4. Returns a structured context blob

```bash
# Example: gather context for evaluating a project
claude -p "Read the project's CLAUDE.md, README.md, and test fixtures. \
  Grep for common patterns in src/. \
  Output a JSON with: required_patterns, anti_patterns, file_structure, \
  build_commands, test_commands." \
  --model sonnet --allowedTools Read Glob Grep Bash \
  --add-dir . --dangerously-skip-permissions \
  --output-format json
```

**Key design decisions:**
- Use `claude -p` / `codex -p` for gathering, NOT a single LLM call with crammed context. The agent can explore, follow links, read selectively.
- Cache the output per domain. Reference material changes slowly.
- Truncation budget: 20K chars max for the context blob. More is noise.
- Return structured output (JSON), not prose.

## Component 2: Rubric Generator

Takes a reference context blob + a specific target description → produces a scoring rubric custom to THAT target.

**Input:**
```typescript
interface RubricInput {
  target: string           // what's being evaluated ("oracle-blueprint scaffold")
  intent: string           // what it should do ("price oracle with 3+ data sources")
  domain: string           // category ("tangle-blueprint", "react-frontend", etc.)
  referenceContext: string  // from Component 1
  dimensions?: string[]    // override default dimensions
}
```

**Output:**
```typescript
interface Rubric {
  systemPrompt: string      // system prompt for the evaluator agent
  dimensions: Dimension[]   // what to score on
  checklist: CheckItem[]    // per-turn or per-review checklist
  antiPatterns: string[]    // what to flag as wrong
  doneWhen: string          // completion criteria
}

interface Dimension {
  name: string              // "structure", "build", "tests", "domain_logic", "security"
  weight: number            // 0-1, must sum to 1
  description: string       // what 10/10 looks like
  scoringGuide: string      // how to assign 0-10
}
```

**Implementation options (pick based on latency budget):**

| Method | Latency | Quality | Cost | Use when |
|---|---|---|---|---|
| `claude -p` with tools | 60-180s | Best (explores refs) | ~$0.10 | Batch eval, offline pipelines |
| LiteLLM single call | 10-30s | Good (pre-loaded context) | ~$0.01 | Per-request eval, CI gates |
| Static rubric from file | 0s | Fixed (no adaptation) | Free | Known domains, regression tests |

**The rubric IS the system prompt.** The evaluator agent receives the rubric as its system prompt. This means the rubric must be:
- Self-contained (evaluator has no other context)
- Specific to the target (not generic)
- Actionable (names files, types, APIs — not "write good code")
- Include a per-turn/per-review checklist

## Component 3: Evaluator

Applies the rubric to a target. Produces structured findings.

**Input:** Rubric (system prompt) + target state (files, build output, conversation transcript, etc.)

**Output:**
```typescript
interface EvalResult {
  score: number              // 0-10 overall
  dimensions: DimensionScore[] // per-dimension breakdown
  findings: Finding[]        // structured issues
  doneWhen: boolean          // rubric completion criteria met?
  durationMs: number
  costUsd: number | null
}

interface Finding {
  severity: 'critical' | 'major' | 'minor'
  dimension: string          // which dimension this affects
  description: string        // what's wrong
  location?: string          // file:line or element reference
  fix?: string               // suggested fix
}
```

**Three evaluator modes:**

### Mode A: Single-shot judge
Score once, return findings. Use for CI gates, regression checks, quality snapshots.

```
evaluator(rubric, targetState) → EvalResult
```

### Mode B: Per-turn evaluator
Score after each turn of a multi-turn interaction. Use for agent benchmarks, conversation quality.

```
for each turn:
  evaluator(rubric, cumulativeState) → EvalResult
  if result.doneWhen: break
```

Tracks: score trajectory, convergence turn, plateau detection.

### Mode C: Reviewer-driver loop
Score AND drive improvement. The evaluator's findings become instructions for a builder/agent.

```
for each turn:
  state = readTargetState()
  result = evaluator(rubric, state)
  if result.doneWhen: break
  instruction = result.findings → actionable message
  sendToBuilder(instruction)
```

This is the meta-reviewer pattern from scaffold enrichment. The evaluator doesn't just score — it tells the builder what to fix next.

## Component 4: Driver (optional)

Closes the loop between evaluator and target. Only needed for Mode C.

**Driver types:**

| Driver | Target | How it sends instructions |
|---|---|---|
| Sidecar prompt | Sandbox container | POST to sidecar /agents/run/stream |
| SDK box.prompt() | Sandbox via SDK | box.prompt(instruction) |
| File write | Local codebase | Write instruction to file, agent reads it |
| API call | External service | POST/PUT to service endpoint |
| Human | User | Print findings, user acts |

**Driver interface:**
```typescript
interface Driver {
  sendInstruction(msg: string, timeoutMs?: number): Promise<{
    success: boolean
    writeCount: number
    error?: string
  }>
  readState(): Promise<string>  // current target state for next eval
}
```

## Building an Eval System

### Step 1: Define the target type
What are you evaluating? Code? Conversation? API output? Design?

### Step 2: Identify references
Where does domain knowledge live? Skills? Repos? Docs? Test fixtures?

### Step 3: Choose latency budget
Batch (minutes OK) → claude -p gatherer + rubric gen.
Online (seconds) → pre-cached rubric, LiteLLM evaluator.
CI gate (sub-minute) → static rubric, single LLM call.

### Step 4: Define dimensions
5-8 dimensions. Each with weight, description, scoring guide. Must sum to 1.

**Common dimension sets:**

| Domain | Dimensions |
|---|---|
| Code scaffold | structure, build, tests, domain_logic, content_richness |
| Conversation | relevance, accuracy, safety, engagement, task_completion |
| API output | correctness, completeness, format, latency, error_handling |
| UI/design | layout, typography, interactivity, accessibility, responsiveness |
| Security | input_validation, auth, injection, encryption, logging |

### Step 5: Wire the loop
Single-shot? Per-turn? Reviewer-driver? Pick the mode and wire Components 1-4.

## Unified Finding Type

All eval systems produce the same finding shape (matches `AuditResult` from blueprint-agent):

```typescript
interface AuditResult {
  kind: string               // evaluator identifier
  score: number              // 0-10
  findings: AuditFinding[]   // [{severity, category, description}]
  durationMs: number
  available: boolean
  error?: string
}
```

This lets findings from different evaluators compose: structural audit + design audit + category scorer + custom evaluator → single unified report.

## Agentic Execution Patterns

### Pattern 1: claude -p as evaluator
```bash
claude -p "Evaluate this code against the rubric. Return JSON with score, dimensions, findings." \
  --model sonnet \
  --append-system-prompt "<rubric>" \
  --allowedTools Read Glob Grep Bash \
  --add-dir /path/to/target \
  --dangerously-skip-permissions \
  --output-format json \
  --json-schema '{"type":"object","properties":{"score":{"type":"number"},"findings":{"type":"array"}}}'
```

### Pattern 2: codex as evaluator
```bash
codex -q "Evaluate this code against the rubric. Output structured findings." \
  --model o3 \
  --full-auto \
  --dir /path/to/target
```

### Pattern 3: LiteLLM as evaluator (fast, cheap)
```typescript
const result = await callLlm({
  model: 'zai/glm-5.1',
  messages: [
    { role: 'system', content: rubric.systemPrompt },
    { role: 'user', content: targetState },
  ],
  jsonMode: true,
  maxTokens: 2000,
})
```

### Pattern 4: Multi-evaluator consensus
Run 3 evaluators (different models) on same target, take median score. Use when single-evaluator variance is >15%.

```typescript
const scores = await Promise.all([
  evaluate(rubric, target, { model: 'claude-opus-4-6' }),
  evaluate(rubric, target, { model: 'gpt-5.4' }),
  evaluate(rubric, target, { model: 'zai/glm-5.1' }),
])
const median = scores.sort((a, b) => a.score - b.score)[1]
```

## Anti-Patterns

1. **Hardcoded rubrics.** If you're writing the scoring criteria by hand, you're doing it wrong. Generate them from references.
2. **Single-dimension scoring.** "Rate this 1-10" is useless. Break into 5+ dimensions with weights.
3. **No findings, only scores.** A score without findings is an opinion, not an evaluation. Every deduction needs a specific finding.
4. **Evaluating the wrong artifact.** If users see a rendered page, evaluate the rendered page — not the source code. Measure what the user experiences.
5. **No baseline.** Always score before AND after changes. Delta matters more than absolute score.
6. **Crammed context.** Don't stuff 50K chars of reference into a single LLM call. Use agentic gathering (claude -p with tools) to let the evaluator read selectively.
7. **Same model judges itself.** The evaluator should be a different model or at minimum a different prompt role than the builder. Same-model self-eval is unreliable.
8. **Evaluating mocked outputs as if they were real.** If the target system under eval is behind mocks (stubbed DB, mocked HTTP, fake agent responses), the eval measures the mocks, not the system. Rubrics must score what the user's real environment produces — real agent calls, real DB reads, real downstream effects. If real execution is expensive, cache real runs; don't substitute synthetic fixtures. A high score on a mocked target is worse than no score — it creates false confidence that ships.
9. **Metric with no product-value claim.** Before a dimension enters a rubric, write one sentence: "If this dimension's score moves, what user-visible outcome moves with it?" Dimensions that can't carry that sentence are proxies — they converge happily while product stays flat.

## Persistence

Eval results go to `.evolve/experiments.jsonl` (if inside an evolve loop) or to a project-specific results directory. Always include rubric version hash, target identifier, timestamp + model + cost.

Append a `.evolve/skill-runs.jsonl` line on completion.

## Rules

- **Generate rubrics from references, don't write them by hand.**
- **Every score needs findings. No naked numbers.**
- **Use tools (Read/Grep/Bash) for context gathering, not context stuffing.**
- **Cache rubrics per domain. Regenerate when references change.**
- **5+ dimensions, explicit weights, scoring guides.**
- **Different model evaluates than builds.** Or at minimum different role.
- **Report median with N≥3 for noisy domains.**
