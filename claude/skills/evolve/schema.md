# `.evolve/experiments.jsonl` schema

One JSON object per line. This is the canonical structured log of every evolve experiment — cross-project pattern analysis and meta-learning read from here.

## Required fields

| Field | Type | Purpose |
|---|---|---|
| `id` | string | Unique experiment ID |
| `project` | string | Repo/project name |
| `goal` | string | The evolve goal |
| `round` | number | Which cycle |
| `hypothesis` | string | What was tested |
| `category` | enum | `prompt` \| `config` \| `code` \| `infra` \| `model` \| `criteria` |
| `lever` | string | What was changed (systemPrompt, temperature, judge criteria, etc.) |
| `targets` | string[] | What was targeted (agent IDs, file paths, service names) |
| `baseline` | object | Metric values before (median of ≥3 runs) |
| `result` | object | Metric values after (median of ≥3 runs) |
| `delta` | number | Primary metric change |
| `verdict` | enum | `KEEP` \| `ITERATE` \| `ABANDON` \| `REGRESSION` |
| `durationMs` | number | How long the experiment took |
| `timestamp` | string | ISO 8601 |
| `reasoning` | string | Why this hypothesis was chosen |
| `learnings` | string[] | What was discovered (reusable insights) |

## Optional fields

| Field | Type | Purpose |
|---|---|---|
| `variation` | number | Which attempt (1, 2, 3 for iterations) |
| `parentId` | string | Previous experiment this iterates on |
| `deploymentVerified` | boolean | Was deployment confirmed before measuring? |
| `failureMode` | string | If failed: what went wrong (deployment, scoring, approach) |
| `crossPollinated` | boolean | Was this applied from another target's success? |
| `promptVersionId` | string | Which prompt version was tested (from `.evolve/prompts/registry.json`) |
| `costUsd` | number | Estimated cost of this experiment |
| `reps` | number | How many repetitions were run (1 = single run, 3 = median-of-3, 5 = noisy target) |
| `productValueClaim` | string | The one-sentence claim from Phase 0.5 — included so downstream readers can judge whether the metric movement tracks user-visible value |

## Example

```jsonl
{"id":"exp_001","project":"phony","goal":"all agents above 0.80","round":1,"hypothesis":"safety disclaimers","category":"prompt","lever":"systemPrompt","targets":["agent-huberman","agent-mark-hyman","agent-peter-attia"],"baseline":{"safety":0.50},"result":{"safety":1.00},"delta":0.50,"verdict":"KEEP","durationMs":35000,"timestamp":"2026-03-20T00:00:00Z","reasoning":"Health creators need disclaimers. Judge flagged medical advice without caveats.","learnings":["Safety disclaimers lift all health agents universally","Single-line 'consult your physician' insufficient — need 5-6 specific guidelines"],"reps":3,"productValueClaim":"safety score >= 0.70 means fewer compliance complaints from health vertical customers"}
```

## Product Quality Scorecard

`.evolve/scorecard.json` — snapshot of all user flows and their quality, written after each cycle:

```json
{
  "product": "phony",
  "timestamp": "2026-03-20T04:00:00Z",
  "flows": [
    {"name": "synthetic_conversation", "score": 0.80, "target": 0.85, "status": "pass"},
    {"name": "selfplay", "score": null, "target": 0.75, "status": "unmeasured"},
    {"name": "tool_calling", "score": null, "target": 0.80, "status": "unmeasured"}
  ],
  "aggregate": 0.80,
  "coverage": "1/3 flows measured",
  "evolveHistory": "4 cycles, +0.11 improvement"
}
```

## Why structured data matters

1. **Cross-project patterns**: "Safety disclaimers worked on phony voice agents. Do they work on scribe meeting bots?" — queryable from the JSONL.
2. **Meta-learning**: Which categories of experiments have the highest success rate? Prompt? Config? Code?
3. **Failure analysis**: What's the most common failure mode? Deployment verification? Scoring artifacts?
4. **Research potential**: Aggregate data across projects → methodology papers on autonomous improvement.
