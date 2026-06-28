---
name: product-innovation-audit
description: First-principles product innovation audit for any product, platform, workflow, AI agent, hardware system, marketplace, developer tool, enterprise app, or frontier product bet. Use when the user wants the hardest questions, world-class critique, real competitive substitute analysis, user-experience proof loops, moonshot mapping, dynamic fanout, what to kill, what to ship, whether the product is actually differentiated, or how to get from current reality to a 10/10 marketable product.
---

# Product Innovation Audit

Use this skill when the real question is not "is this polished?" but:

- Is this product meaningfully better than what people already do?
- Is this a breakthrough user experience or AI/product theater?
- What would a world-class version do from first principles?
- What should be killed, simplified, or rebuilt?
- What proof would make a skeptical buyer, user, founder, investor, or operator believe?

This is an adversarial operator workflow. Product narratives, demos, eval scores, roadmaps, dashboards, traces, and founder conviction are claims until evidence proves them.

This skill pairs with `product-design-audit`. Design audit judges the visible interface. Innovation audit judges whether the product deserves to exist, what the real user journey should be, how it wins, and what to do next.

## Non-Negotiable Stance

- Innovation is not feature count. It is a changed user outcome.
- The benchmark is not other AI demos. The benchmark is the user's real alternative.
- A general product must win one specific job before claiming generality.
- AI is not the product unless it produces a new capability, faster cycle time, lower cost, higher trust, or a result the user could not otherwise get.
- Internal architecture matters only when it changes the user-visible result.
- If the output cannot beat a strong human, a strong incumbent, or a vanilla frontier chat session on a chosen wedge, say so plainly.
- Do not protect work because it was expensive to build.
- Do not inflate weak evidence into a product verdict.

## Aggression Level

Default to **8/10**. Escalate to **10/10** when the user says any version of:

- 10/10, A+++, moonshot, no bullshit, step it up
- better than Claude, ChatGPT, Cursor, OpenRouter, incumbent, consultant, agency, or internal team
- product lead, operator, innovation, marketable, launch-ready, investor-grade
- stop overengineering, kill slop, delete legacy, greenfield, take the lead
- evals are wrong, benchmark it, compare outputs, prove it

At 10/10, the audit must be uncomfortable and concrete. "Interesting" is a fail. "Could become useful" is not a win. A product is winning only if a specific user would choose it over the obvious substitute for a concrete job.

## First-Principles Question Stack

Ask the hardest questions first. Answer with evidence, not vibes.

1. **What job is the user hiring this product to do?**
   - What trigger makes them start?
   - What painful consequence exists if they do nothing?
   - What does "done" mean in the user's language?

2. **What is the real substitute?**
   - Spreadsheet, search, documents, internal expert, contractor, consultant, vertical SaaS, marketplace, script, phone call, email thread, agency, status quo, Claude/ChatGPT/Cursor, or no action.
   - What does the user actually choose today when under time pressure?

3. **What would a world-class human or team do?**
   - What questions would they ask?
   - What artifacts would they produce?
   - What work would they do in parallel?
   - What risks would they catch that a generic assistant misses?

4. **What should the product make disappear?**
   - Waiting, ambiguity, project setup, copy/paste, tool switching, coordination, source hunting, reformatting, QA, compliance checklists, procurement friction, review loops, or expert bottlenecks.

5. **What is the 10x outcome delta?**
   - Faster, deeper, cheaper, safer, more complete, more trusted, more actionable, more collaborative, more repeatable, or impossible before.
   - Name the dimension. If there is no 10x dimension, narrow the wedge.

6. **What is fake sophistication?**
   - Knobs, templates, dashboards, lifecycle labels, eval badges, "agentic" labels, streaming process, visible delegation, or docs that do not improve the user's answer.

7. **What must be inspectable for trust?**
   - Sources, assumptions, calculations, files, traces, tool calls, decisions, costs, provenance, edits, retries, limits, uncertainty, and side effects.

8. **What is the sharpest switch moment?**
   - The moment when the user says, "I would use this instead of my current workflow."
   - If that moment is not visible in the first session, define it.

9. **What proof would change your mind?**
   - A side-by-side task, raw transcript, generated artifact, time-to-result, expert judge, user preference, willingness to pay, repeat usage, or conversion.

10. **What should be killed today?**
   - Anything that consumes attention, latency, code complexity, maintenance, or screen space without increasing the switch moment.

## Fanout Workflow

For substantial audits, fan out independent lanes using subagents, a dynamic workflow engine, or separate analysis threads when available. If no subagent tool exists, emulate the lanes serially and label them as emulated.

The point of fanout is independent pressure, not more prose. Each lane must produce hard findings, evidence demands, and kill/ship recommendations.

| Lane | Persona | Assignment |
|---|---|---|
| User Reality | User anthropologist | Identify the real user, trigger, job, current workaround, objections, and switching threshold. |
| Substitute Reality | Competitive strategist | Compare against all real substitutes, including non-AI and no-action alternatives. |
| First-Principles Product | Product physicist | Rebuild the experience from the desired user outcome backward. |
| World-Class UX | Experience designer | Define what the product should feel like minute by minute, including trust and control. |
| Capability Truth | Technical operator | Separate claimed capability from observed behavior, traces, artifacts, and side effects. |
| Proof and Evals | Measurement lead | Design the benchmark, raw-output comparison, judge rubric, and replayable evidence loop. |
| Business Wedge | GTM operator | Pick the first buyer/user, pricing logic, distribution path, adoption risk, and retention mechanism. |
| Red Team | Skeptical buyer | Attack the pitch, evidence, complexity, market, risk, and willingness to switch. |
| Compression Lead | Principal product lead | Resolve contradictions and compress the bet into decisions. |

Rules for fanout:

- Do not let all lanes share the same assumptions.
- Force at least one lane to argue that the product should be narrowed, killed, or rebuilt.
- Compare against the strongest substitute, not the easiest.
- Preserve disagreements in the synthesis when they affect the decision.
- End with one compressed product bet and one proof loop, not a pile of opinions.

## Real Experience Map

Map what the user actually experiences. Do this before roadmap planning.

| Moment | Hard Question | World-Class Behavior | Failure Mode | Evidence Needed |
|---|---|---|---|---|
| Trigger | Why did the user come now? | Product recognizes the job and context fast. | Generic intake, wrong framing, asking what it should infer. | Prompt/session/support/sales evidence. |
| First action | What can the user do immediately? | User starts with one natural action. | Busy homepage, labels, setup friction, dead panels. | Screen recording or first-click path. |
| First useful output | When does value appear? | A concrete answer, artifact, analysis, or action appears quickly. | Spinner theater, JSON, boilerplate, repeated questions. | Time to useful output and raw transcript. |
| Depth | Does it do work the user would not do manually? | Research, computation, file creation, coding, analysis, delegation, comparison, or action happens in the background. | Static chat response or fixed pipeline. | Trace, tool calls, files, sources, artifacts. |
| Trust | Can the user inspect and verify? | Sources, assumptions, calculations, provenance, edits, and limits are visible on demand. | Raw machinery dumped into chat or hidden claims. | Rendered trace, source links, artifact viewer. |
| Steering | Can the user change direction midstream? | Stop, retry, ask follow-up, switch model/tool, edit, branch, compare, or fuse. | Lost history, no cancellation, no attribution. | Interaction replay. |
| Collaboration | Can the output leave the chat? | Export, share, commit, task, RFQ, report, spec, ticket, deck, file, or integration handoff. | Nice text trapped in chat. | Exported artifact and downstream usage. |
| Retention | Why would they come back? | Product compounds context, memory, files, workflows, and trust. | One-off novelty. | Repeat use, saved projects, re-opened artifacts. |

## Competitive Reality Matrix

Always compare against the real competitive set, not just AI products.

| Alternative | Why User Chooses It | Where It Wins | Where Product Must Beat It |
|---|---|---|---|
| Status quo / no action | Lowest effort and risk. | No procurement, no new habit, no trust burden. | Create urgency and immediate payoff. |
| Search plus docs | Familiar, broad, cheap. | Quick facts, source discovery. | Synthesize, decide, execute, maintain context. |
| Spreadsheet / internal template | Flexible and controllable. | Familiar artifacts and calculations. | Automate structure, validation, provenance, reuse. |
| Human expert / consultant | Trust, judgment, accountability. | Ambiguity, tacit knowledge, risk. | Lower cycle time/cost while preserving judgment evidence. |
| Internal team | Context and authority. | Existing processes and relationships. | Coordinate work, reduce bottlenecks, produce better artifacts. |
| Vertical SaaS | Purpose-built workflows. | Compliance, integrations, repeatability. | Better adaptability, automation, and depth. |
| Agency / contractor | Done-for-you outcome. | Execution and ownership transfer. | Faster iteration, transparency, lower marginal cost. |
| Claude/ChatGPT/Cursor | Strong general reasoning and coding. | Conversational quality and model capability. | Domain workflow, artifacts, tools, memory, evals, collaboration, provenance. |
| Marketplace/vendor | Direct procurement or fulfillment. | Existing supply and transaction flow. | Better specification, comparison, negotiation, and readiness. |

## World-Class Innovation Bar

A world-class product usually does several of these at once:

- Compresses a workflow from days to minutes or from many tools to one coherent loop.
- Produces durable artifacts users can inspect, edit, export, and use.
- Makes a novice meaningfully more capable while preserving expert control.
- Turns ambiguous intent into high-quality action without forcing the user to become the system designer.
- Builds trust through provenance, evidence, reversibility, and visible judgment.
- Learns from context, files, prior work, and outcomes instead of resetting every session.
- Coordinates parallel work that a single human would struggle to orchestrate.
- Makes the next step obvious without locking the user into a rigid wizard.
- Creates compounding advantage through data, workflow memory, integrations, network, or evaluation loops.
- Has a demo that works without narration.

If the product is an agent product, world-class means the agent actually does work: plans, researches, writes, codes, calls tools, creates files, delegates, checks itself, asks only necessary questions, and returns a coherent user-facing result with inspectable provenance.

## Evidence Order

Prefer direct user-outcome evidence over strategy prose:

1. Raw user sessions, transcripts, recordings, support complaints, sales calls, onboarding friction, churn, usage paths.
2. Product artifacts: files generated, decisions made, calculations, approvals, exports, integrations, durable side effects.
3. Competitive baselines: same task in incumbent products, screenshots, outputs, time-to-result, trust signals.
4. Evals and benchmarks: scenario definitions, traces, raw outputs, judges, scorecards, regressions, confidence intervals.
5. Funnel/business evidence: activation, repeat use, willingness to pay, sales cycle, objection logs, pricing tests.
6. Architecture and roadmap only after behavior evidence explains what users actually experience.
7. Founder/team intuition, docs, and labels only as hypotheses to test.

Do not use fabricated scores, synthetic-only wins, cherry-picked demos, hardcoded domain examples, hidden fallback outputs, or artifact counts as proof of product value.

## Audit Workflow

1. **Name the product truth.**
   - One sentence: user, job, outcome, substitute, and why this wins.
   - If you cannot write it cleanly, the product strategy is not clear.

2. **Define the real user and job.**
   - Primary user, trigger, success state, current workaround, switch threshold.
   - If multiple users exist, pick the sharpest beachhead. Generality comes later.

3. **Inspect the current experience.**
   - Run or read it like a user: first prompt, first output, follow-up, stop/retry, export, collaboration, integrations, error states.
   - Record exactly where trust increases or collapses.

4. **Fan out critique lanes.**
   - Use the lanes above for independent pressure.
   - Require each lane to cite observed evidence or name the missing evidence.

5. **Audit capability truth.**
   - Separate promised capability from observed behavior.
   - For agents, inspect model calls, tool calls, delegated work, files, memory, eval records, source provenance, retries, and user-visible synthesis.
   - A capability does not exist until it changes the user's result.

6. **Compare against real substitutes.**
   - Same task, same constraints, same user goal.
   - Compare raw outputs, timing, artifact quality, trust, control, cost, and next-step usefulness.

7. **Map the world-class version.**
   - Work backward from the user outcome.
   - Define what the product should do in the first minute, first session, first week, and repeat usage loop.

8. **Kill or compress.**
   - Delete, hide, merge, or postpone anything that weakens the core loop.
   - Prefer one magical workflow over ten mediocre configurable ones.

9. **Design the proof loop.**
   - Create a replayable benchmark that proves the wedge against the strongest substitute.
   - Require raw transcript, generated artifacts, user-facing output, time-to-useful-answer, cost/usage if real, and judge findings.

10. **Set the execution cut.**
   - Pick the 1-3 highest-leverage changes that improve the live user outcome.
   - If architecture must change, tie it directly to a user-visible failure.

## Scoring Rubric

Score 0-10. A product below 7 is not launch-ready. A product below 5 should narrow or rebuild the core loop before adding features.

| Category | What Good Looks Like |
|---|---|
| User pain | A specific user has a frequent, costly, urgent job and hates current options. |
| Wedge clarity | One use case can be demoed end-to-end without explaining the whole platform. |
| Outcome delta | The product produces a better result than the obvious substitute. |
| Time to value | First useful result appears fast enough that the user feels agency. |
| Trust | Sources, traces, files, provenance, edits, retries, limits, and uncertainty are inspectable without dumping raw machinery. |
| Agency | The product takes real steps and creates durable side effects. |
| Control | User can stop, steer, compare, edit, export, retry, switch, and understand provenance. |
| Generality | The system generalizes by primitives and workflow design, not hardcoded domains or regex triggers. |
| Simplicity | The product hides internal complexity until inspection is useful. |
| Distribution | There is a believable path to reach and convert the first users. |
| Business model | Pricing, margin, buyer, sales motion, support burden, and expansion path are plausible. |
| Defensibility | Data, workflow, integrations, eval loop, taste, ecosystem, or network effects can compound. |

## Output Format

For nontrivial audits, produce this compressed artifact. Keep it decisive.

```markdown
# Product Innovation Audit

Status:
Product:
Primary user:
Core job:
Strongest substitute:
Evidence inspected:

## BLUF
- Verdict:
- Strongest wedge:
- Biggest illusion:
- 10x dimension:
- Ship now:
- Kill now:

## Hard Questions
| question | answer | evidence | risk |
|---|---|---|---|

## Fanout Findings
| lane | strongest finding | kill/ship recommendation | confidence |
|---|---|---|---:|

## Real Experience Map
| moment | current reality | world-class target | required change |
|---|---|---|---|

## Competitive Reality
| substitute | current product vs substitute | verdict | proof needed |
|---|---|---|---|

## Capability Truth
| capability | claim | observed behavior | user-visible outcome | verdict |
|---|---|---|---|---|

## World-Class Gap
What a world-class version would do:
What the current product does:
The gap that matters most:

## Compressed Product Bet
One-sentence truth:
Beachhead:
Hero workflow:
Trust mechanism:
Distribution path:
Retention loop:

## Kill List
| item | why it hurts | decision |
|---|---|---|

## Ship Cut
1.
2.
3.

## Proof Loop
Scenario:
Baselines:
Raw artifacts:
Metrics:
Judge:
Pass/fail threshold:
Replay path:

## Decision
```

## Compression Rules

End every serious audit with:

- One product truth.
- One wedge.
- One hero workflow.
- One proof loop.
- Top 3 things to kill.
- Top 3 things to ship.
- One benchmark that would prove the bet.
- One experience target that must become non-negotiable.

If the audit cannot compress to these, the strategy is still muddy.

## Red Flags

- The best demo needs narration to explain why it is useful.
- The product claims "agentic" but the trace is a single static answer or fixed pipeline.
- Evals score highly while a human prefers a vanilla incumbent.
- The product creates artifacts users cannot inspect, edit, export, or trust.
- The UI shows process theater instead of a better user result.
- Visible delegation exists but does not improve output quality.
- Model/fusion/delegation controls exist but do not change the user outcome.
- The agent asks questions it should infer or research.
- The system repeats itself because history or state is broken.
- Safety, compliance, or policy boilerplate blocks safe useful planning.
- Generality is claimed but domain logic is hardcoded in the main agent.
- Roadmap is full of medium-priority features while the core loop still fails.
- "Moonshot" work has no proof loop, baseline, buyer, or demo.
- The product optimizes artifact count, traces, or dashboards while the user's answer is worse.
- Configuration exists because the product has not made a clear decision.

## Operator Rules

- Say the uncomfortable thing first.
- Judge the raw user experience before judging architecture.
- Do not preserve work because it was expensive to build.
- Do not add more knobs when the core loop is weak.
- Every feature must earn its screen space, latency, maintenance, and cognitive load.
- If the product cannot beat the substitute on the chosen wedge, narrow the wedge or change the product.
- If a benchmark says pass but the raw output is bad, the benchmark is wrong.
- If the answer needs current facts, prices, laws, model names, competitor claims, or sources, verify them.
- If the product is an agent product, judge transcript and artifacts first; architecture is secondary.
- Compression is not simplification theater. It is the act of choosing what matters.

## Stop Conditions

Stop only when one of these is true:

- The highest-impact product bet has a clear verdict and execution cut.
- A live proof loop passes against the chosen substitute with inspectable raw outputs.
- The core loop is blocked by a real external dependency and the unblocker is named.
- The product should be narrowed, paused, killed, or rebuilt, and the reason is evidence-backed.

Do not stop at a roadmap. A roadmap without a proof loop is a wish list.
