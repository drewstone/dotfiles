---
name: problem-sourcing
description: Sweep a researcher's or lab's recent record, extract open problems, grade machine-fit, and promote candidates into research-director line charters
---

# Problem Sourcing

Turn a source (professor, company lab, workshop) into graded, dispatchable research problems for the discovery factory.
The standing store is `~/code/discovery/meta/problem-sourcing/` (README there owns the rubric and rules; this skill is the procedure).

## Procedure

1. **Register.** Add or update the source in `registry.json` (id, kind, topics, sweep cadence).
2. **Sweep with a cheap agent** (sonnet or below), one agent per source, writing `sources/<id>-<years>.md`. The prompt must demand: 2-year paper enumeration with honest `unfetched` marks; ACTIVE THREADS; STATED OPEN PROBLEMS verbatim with paper id + location, inferred gaps marked `inferred`; MACHINE-FIT 1–5 per problem with the one-sentence executable-handle justification; a Candidate section (FIT ≥ 4 only) each with the first dispatchable experiment. Give the agent the Semantic Scholar key path (`~/company/devops/secrets/semantic-scholar.env`) and the 1 req/sec limit.
3. **Review adversarially.** One pass (different model family when stakes are high) challenging: inflated fit scores, dressed-up inferred problems, missing citations. Fix in place.
4. **Distill** into `candidates.md`: cross-source shortlist, FIT ≥ 4, deduped against `discovery-lab/lines/` and the kb (`kb_search` by meaning, not wording). Each row: problem · source · fit · first experiment · status (candidate | chartered:<line> | rejected:<why>).
5. **Charter** the accepted few: write `discovery-lab/lines/<id>.md` (open problem, verified state = none yet, killed approaches = none yet, frontier moves = the first experiments), register in `lines/lines.json`. The loop commissions the director automatically.
6. **Log** the promotion in `registry.json` (`promoted`) and the meta findings log.

## Rules (from the README, enforced here)

- Verbatim or `inferred` — never dress a guess as a stated problem.
- Every fit grade names its executable handle or admits there is none.
- GPT-Pro or other expensive seats only for stage 3 on high-stakes promotions, never for stage 2 extraction.
- A candidate covered by an existing line becomes a note on that line's charter, not a new line.

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| ≥1 candidate chartered | stop — the loop takes over | the line id |
| A sweep found a benchmark/reproducibility claim with public code | /verify | the claim + the repro command |
