# Reflect: Self-Improving Stack Series First Pass
Date: 2026-06-06

## Run Grade: 8.4/10

| Dimension | Score | Evidence |
|---|---:|---|
| Goal achievement | 9 | The numbered series now has 12 leaf posts, each with outline, draft, and polish provenance rows. The leaf posts total 36,492 words, averaging 3,041 words each. |
| Research depth | 8.5 | Posts moved from a tool list into a layered theory: mutable surface, feedback signal, search operator, promotion gate, failure mode. Later posts re-audited local Tangle package surfaces instead of relying on stale package memory. |
| Writing quality | 8 | The anti-pattern scans are now clean on leaf posts for public process labels, em dashes, scaffold language, and recipe/cookbook analogies. The voice is more technical and direct than the initial scaffolds. |
| Efficiency | 7 | The series needed repeated manual metadata patches because `pnpm blog finish` reported "appended revision entry" while frontmatter did not actually receive draft/polish rows when the trace id was reused. |
| Self-correction | 9 | Operator feedback led to explicit anti-pattern rules: no "first post" phrasing, no em dashes, no process labels in public prose, no childish ELI5 framing, and higher research-level technical explanation. |
| Learning capture | 8 | `.evolve/skill-runs.jsonl`, trace folders, post frontmatter, and research checkpoints now capture the flow. The remaining weakness is stale README/status metadata. |
| Overall | 8.4 | The leaf series is strong enough for overview synthesis, but not ready to publish as a coherent package until the umbrella article, status table, and final source review are updated. |

## Session Flow Analysis

1. **Trigger: "what's next?"**
   Flow: inspect `.evolve/skill-runs.jsonl` and checkpoint map -> identify next scaffold -> dispatch draft or polish.
   Outcome: two governor decisions recorded. One routed post 4 to polish; one routed post 12 to draft.

2. **Trigger: "do it" / "continue"**
   Flow: run `pnpm blog write` -> replace scaffold -> update checkpoint -> scan anti-patterns -> finish trace -> manually repair frontmatter -> build.
   Outcome: posts 5 through 12 got repeatable draft/polish passes with trace and build verification.

3. **Trigger: package relevance concern**
   Flow: audit local package export surface before writing package placement -> write package fit section from actual source.
   Outcome: posts on runtime, eval, traces, memory, and governance include concrete local surfaces such as `createSurfaceKnowledgeAdapter`, `HeldOutGate`, `GovernanceContext`, `assertRealBackend`, and MCP delegation.

4. **Trigger: operator flags AI slop**
   Flow: add anti-patterns -> run `rg` scans -> patch prose.
   Outcome: public process labels were removed from leaf posts. The umbrella article still contains `OutlineHandoff`, `Working Thesis`, `Outline Notes`, and scaffold text.

## Project Health

Trajectory: improving. The project now has a real series spine instead of a set of notes.

Evidence:
- 12 numbered leaf posts have `role: 'outline'`, `role: 'draft'`, and `role: 'polish'`.
- `.evolve/skill-runs.jsonl` has 22 recorded events: 8 draft, 12 polish, 2 governor.
- Recent builds passed after post 11 and post 12, producing `/posts/self-improving-stack-memory-flywheels/` and `/posts/self-improving-stack-governance/`.
- Known unrelated warning remains: unused `stat` import in `tools/og-render.ts`.

Main gap:
- `src/content/posts/the-self-improving-stack.mdx` is still a 327-word scaffold with public handoff/process language.
- `research/self-improving-agent-systems/00-series-overview.md` still says `Status: scaffold`.
- `research/self-improving-agent-systems/README.md` still marks every entry as `scaffold`, despite the leaf posts being drafted and polished.

Next highest-value action: draft and polish the umbrella article, then sync the overview and README status map.

## Cross-Project Patterns

- The "audit full dependency surface before writing" rule mattered. It prevented shallow claims about `agent-eval`, `agent-runtime`, and `agent-knowledge`.
- The blog trace lifecycle is close but has a real bug: finish hooks produce trace files but do not reliably mutate frontmatter with reused trace ids.
- Repeated status-map drift is now the main repo hygiene problem. Content changes happened faster than the research README and overview could keep up.
- The operator's bar is not "popular AI explainer." It is technical public writing with math, source trail, package placement, and high-level research framing.

## Skill Effectiveness

| Skill | Evidence | Assessment |
|---|---|---|
| `/draft` | 8 logged draft passes, plus earlier draft frontmatter rows for posts 1-4 | Effective when paired with source/package audit and checkpoint update. |
| `/polish` | 12 logged polish passes | High value. Best improvements came from adding formalism, package placement, and anti-pattern scans. |
| `/governor` | 2 logged decisions | Effective for series sequencing, but the generic optimization-repo decision tree needed adaptation to content-series state. |
| `/reflect` | current run | Correctly timed after all 12 leaf posts reached draft/polish state. |

Failure mode:
- `pnpm blog finish` claims frontmatter mutation even when it skips the row. This creates false provenance confidence unless inspected manually.

## Product Signals

1. **Traceable AI writing is useful only if provenance semantics are strict.**
   The user cares about the distinction between supporting research traces and authorship/edit traces.

2. **Technical readers need layer separation.**
   The useful taxonomy is not "tools that optimize prompts." It is mutable surface, evaluator, gate, and failure mode.

3. **Agent-stack package audits are content infrastructure.**
   The strongest posts were the ones that tied public research to local package surfaces and version boundaries.

4. **Anti-slop scanning should be automated.**
   The current manual `rg` scans caught real issues. They should be a first-class blog command.

5. **Overview synthesis should happen after leaf completion.**
   The umbrella article can now be better than the original outline because the leaf posts have converged on a common theory.

## Proposed Automations

1. **`pnpm blog verify <post>`**
   Runs anti-pattern scan, em dash scan, trailing whitespace scan, provenance/frontmatter role check, source-trail presence check, and optional build.

2. **Fix `pnpm blog finish` frontmatter mutation**
   The command should either append the requested revision row or fail. "Appended revision entry" with no frontmatter change is a provenance bug.

3. **`pnpm blog sync-series-status the-self-improving-stack`**
   Reads each post frontmatter and updates `research/self-improving-agent-systems/README.md` status cells.

4. **Package-surface audit checklist**
   For posts mentioning `@tangle-network/*`, capture local package version, exported subpaths, and relevant source files in the checkpoint before drafting.

5. **Source freshness lint**
   Flag "latest", "current", "SOTA", and named governance/framework claims unless a dated source trail appears in the post.

## Action Items

1. Draft `src/content/posts/the-self-improving-stack.mdx` as the umbrella article using the completed 12-post spine.
2. Update `research/self-improving-agent-systems/00-series-overview.md` from scaffold to synthesized overview.
3. Update `research/self-improving-agent-systems/README.md` status table from `scaffold` to actual draft/polish states.
4. Fix or harden `tools/blog-loop.mjs` so `finish` cannot falsely report a frontmatter append.
5. Add a blog verification command for anti-pattern and provenance checks.

## Dispatch

Next: `/draft` targeting `the-self-improving-stack` and `00-series-overview.md`.

Brief: the 12 leaf posts are drafted and polished. Synthesize the series into an umbrella article that introduces the stack, the common loop, the layer table, and the core rule: self-improvement is run, observe, diagnose, propose, validate, promote, remember, govern. Remove `OutlineHandoff` and all scaffold/process language. End with `/polish`, then sync the research README status table.
