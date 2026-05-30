---
name: intake-interviewer
description: "Interview the user one question at a time to turn vague intent into a clear brief, plan, or next action. Triggers: 'interview me', 'scope this', 'ask me questions', 'help me clarify', 'onboard me', 'debrief me'. Inspects the codebase/context first and only asks what can't be discovered. Hands the brief onward (→ /plan, /eval-agent, or /capture-decisions)."
---

# Intake Interviewer

Use this skill to convert unclear intent into a usable brief, plan, eval
scenario, or next action without overwhelming the user.

## Rules

1. Ask one question at a time.
2. Include your recommended answer with each question.
3. State what decision the question unlocks.
4. Do not ask anything that can be discovered from repo context, local files,
   tools, logs, screenshots, traces, or prior conversation.
5. Maintain a running understanding:
   - goal
   - constraints
   - known decisions
   - unresolved branches
   - risks
   - next action
6. Stop interviewing once the next action is obvious, then execute it or produce
   the requested brief.

## Interview Shape

Ask compact questions. Prefer concrete choices over open-ended prompts, but do
not force a false multiple-choice answer when nuance matters.

For each question, use this structure:

```text
Question: <one direct question>
Recommended answer: <your best default>
Unlocks: <the decision this resolves>
```

After the user answers, update the running understanding silently unless the
updated state helps the user decide the next branch.

## Good Uses

- product idea intake
- project scoping
- user onboarding
- feedback debriefs
- requirements gathering
- design review
- eval scenario creation
- workflow discovery
- customer interview prep

## Creative-Agent Dogfooding

When collecting creative-agent feedback, extract:

- the concrete user action
- what happened
- what the user expected
- severity and frequency
- desired product behavior
- whether this should become an eval scenario
- whether the next step is design, product logic, infra, or docs

If the user is actively dogfooding the app, keep the interview short and bias
toward capturing reproducible failures and high-signal product friction.
