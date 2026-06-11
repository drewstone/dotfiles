---
name: report
description: "Answer analytical / status / 'did X work' / 'how did X perform' questions as a domain expert's research artifact — BLUF + quantified tables/distributions + threats-to-validity + next actions — not assistant prose. Triggers: 'what's the status', 'how did X go/work/perform', 'did X work', 'analyze/assess/evaluate this run/system/data', 'give me the numbers', 'what happened with', 'how are the runs', 'is X healthy', any vague analytical ask where the user wants findings, not exposition."
---

# Report — expert findings, not exposition

The user asked an **analytical** question (status, results, "did it work", "how did it perform", "analyze this"). They want the artifact a **domain expert** would hand them — quantified, structured, decision-first — NOT a helpful-assistant essay. The format IS the expertise.

This skill fires whenever the answer is *findings about a system/run/dataset*, even when the user is vague or unsure what to ask. Especially then: a 10/10 answer tells them what matters.

## A report the user FOLLOWS, not a data dump

The output is a thing the reader reads top-to-bottom and *acts on without a follow-up question*. It opens with the verdict + the decision, and closes with ordered, do-this-next steps. If it ends and the reader still asks "ok… so what do I do?", it failed. Telemetry is not a report; a report drives a decision.

## The rules that fix 80% of it

1. **Decision-first.** First line = the answer + the single most decision-relevant number, and the call to make. Then the evidence. Verdict before any table.
2. **Numbers, not adjectives.** Never "fast", "most", "healthy", "a lot". Always the quantity + its distribution: `median 40 min, p90 76 min, max 126 min, n=374`. Every claim carries a number and an `n`.
3. **Force method, not just form.** Compute real statistics; show the *distribution shape* (ascii histogram/sparkline), not only summary stats — a median hides bimodality. State a **falsifiable test** with a result (e.g. `Spearman ρ(passRate, realness) = −0.10 → H₀ rejected`), a **baseline** to compare against, and **uncertainty** (n, CI, "wide CI at n=12"). A nice table without a test/baseline is EDA cosplaying as a finding.
4. **End in ordered actions.** A numbered "what to do" list, most-important first, each concretely executable.

## Self-gate (apply the realness gate to your OWN report)

Before sending, run the skeptic pass: *is this real analysis or report-shaped vibes?* Did I compute the numbers or assert them? Is there a test that could have failed? Did I correct false premises? Am I overclaiming a weak statistic (state the CI, don't sell ρ=−0.10 as "strongly inverted")? A polished report with no method underneath is the same failure mode as a fake-but-buildable submission — gate it.

## Charts

ASCII is the **in-chat primary** — histograms, sparklines, ranked dual-columns all do the job in plaintext; if a finding *needs* a rendering engine to be legible, you're overengineering it. Exception: when the project already has a report/chart pipeline (e.g. `vb-render-charts`, a scorecard HTML), it is good to *also* persist the figures there — extend that existing infra, never hand-roll a new chart stack.

## Get the data first

If you don't already have the numbers, **go query them** (read the files, run the counts, parse the artifacts) before writing a word. Never answer an analytical question from memory or vibes. If a number is unknowable, say so explicitly — that's a finding too.

## The universal skeleton

Emit in this order. Use tables/lists; prose only for the one-line interpretations.

1. **Verdict (BLUF)** — 1–2 lines. The answer + the headline number. If the real answer corrects the premise of the question, say that first.
2. **Method** — what was measured, source path, time window, `n`, and the tool/query. Provenance so it's reproducible and auditable.
3. **Results** — tables / distributions / counts / rates. For any quantity over many units, give `min / median / p90 / max` (not an average alone). For categoricals, counts + %. ASCII bars/sparklines when they add signal.
4. **Interpretation** — 1 line per result: what it means / the mechanism. Mark each as **measured** or **inferred**.
5. **Threats to validity** — what's NOT measured, confounds, sampling gaps, proxies used, where the number could mislead. (This is what separates a researcher from a dashboard.)
6. **Next actions** — decision-oriented: what to do, what to measure next, the one experiment that would resolve the biggest unknown.
7. **What you didn't ask but should know** — 1–3 bullets the expert volunteers because the user may not know to ask.

Cut any section that's genuinely empty; never pad.

## Flow waterfalls & ASCII distributions (default for anything with a time axis)

When the subject is a FLOW — an agent turn, eval run, pipeline, deploy, request — render it as an annotated waterfall cascade, not prose. Map every span to latency AND cost, decompose totals, and name the dominant term:

```
0.0s    POST /chat/stream
0.8s    ├─ turn marker            ← pipeline overhead (queue + buffer)
16.9s   ├─ model turn 1 (reasoning TTFT 16s)
~17-27s │   └─ sandbox_create     ← raw platform: 9.3-13.4s (n=3)
92.5s   ├─ model turn 6 → destroy (4.3-5.5s)
118.2s  └─ complete                12,326p + 859c tok = $0.00138
```
Rules: real timestamps from instrumentation (never invented); per-span attribution sums to the total ("~96s model, ~20s tools, ~2s pipeline"); cold vs warm called out; n stated; measurement quantization noted when it limits precision.

For multi-run / distribution questions (evals, hill-climbs, retries, latency sweeps), draw ASCII histograms + the summary row instead of listing runs:

```
turn latency (n=24)        p50=41s  p90=96s  max=118s
  0-20s   ████████ 8
 20-40s   ██████ 6
 40-80s   ███████ 7
 80-120s  ███ 3
```
Always close with the decision-relevant lever the waterfall reveals (e.g. "model TTFT dominates; switching model cuts perceived latency 3-5x").

## Pick the domain lens (the artifact shape)

| The question is about… | Answer as a… | Canonical artifact |
|---|---|---|
| an eval / benchmark / model run | research scientist | experimental results section: hypothesis → method → results table → interpretation → threats → ablation/next |
| infra / scaling / "did it hold up" / reliability | SRE / DevOps | ops report: what scaled (n, util), SLIs vs targets, error budget, anomalies, evidence, timeline |
| a dataset / metrics / distributions | data scientist | EDA: shape, distributions, outliers, correlations, missingness, caveats |
| latency / throughput / cost | perf engineer | benchmark: p50/p95/p99, cost/unit, baseline delta, regression flags |
| a security posture / findings | security analyst | findings table: severity × likelihood, evidence, repro, remediation |
| spend / GTM / funnel | analyst | memo: the number, drivers, trend, sensitivity, recommendation |

Name the lens implicitly by using its vocabulary and artifact. When unsure which lens, default to the research-results shape.

## Rigor checklist (apply before sending)

- [ ] First line is the verdict + headline number.
- [ ] Every claim has a number and an `n` / denominator.
- [ ] Distributions, not just means (min/median/p90/max).
- [ ] Each result tagged measured vs inferred.
- [ ] Provenance: where the numbers came from (path/query).
- [ ] Threats-to-validity section present and honest.
- [ ] Ends in decisions/next actions.
- [ ] If a premise of the question was wrong, the verdict corrects it.
- [ ] Tables over paragraphs. No hedging prose.

## 0/10 → 10/10 (worked example)

Question: *"We completed hundreds super fast. Did autoscaling work, and did they really multi-shot?"*

**0/10 (what to stop doing)** — paragraphs: "Yes, the runs completed and did real multishot. They weren't actually that fast — many took a while. Autoscaling wasn't really used because it's the cli-bridge backend which runs locally with concurrency 3. The harness worked well…" (claims without numbers, buried verdict, no provenance, no threats).

**10/10 (what to produce):**

> **Verdict.** Two premises are wrong: (1) it did **not** use autoscaling — `--backend cli-bridge` runs **locally** (concurrency 3, 198 `/tmp` workspaces); Hetzner autoscaling is a different backend. (2) Cells were **not** fast — **median 40 min, p90 76 min, max 126 min (n=374)**; throughput came from 3-wide parallelism over days. Multishot **did** engage: **87% used 4–5 shots**.
>
> **Method.** Parsed `results/fhenix-pilot-yB/checkpoints/*.json` (n=374 completed cells) + `ps`/workspace counts, 2026-06-02.
>
> **Results.**
> | metric | value |
> |---|---|
> | shotsUsed = 4 / 5 | 296 / 31 (87%) |
> | shotsUsed = 1 | 18 (5%) |
> | duration min/median/p90/max | 7 / 40 / 76 / 126 min |
> | outcome satisfied/gave-up/error/wall | 201 / 100 / 49 / 24 |
> | previewSucceeded · converged | 332 (89%) · 221 (59%) |
>
> **Interpretation.** Real long multishot work (measured). `error.json` ≠ failure: 658 files but only 49 `error` outcomes (measured).
>
> **Threats to validity.** "max-shot from file counts" over-counts 1-shot (incomplete cells lack checkpoints — use `shotsUsed`, not file counts). Run still live; n grows.
>
> **Next actions.** None needed to trust the result; the realness gate is the separate quality question.
>
> **Didn't ask but matters.** 40 min of real effort still produced mostly fakes → model gaming a weak objective, not an infra problem.

## Output discipline

Match length to the question — a one-metric status check gets a 3-line verdict + a tiny table, not the full skeleton. Scale the artifact to the decision. The skeleton is the ceiling, not a quota.
