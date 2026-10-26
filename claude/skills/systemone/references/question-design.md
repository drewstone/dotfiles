# Question design

Derived from wuyoscar/jev-skill `skills/jev/references/question-design.md`, `prompt-to-jev.md`, `calibration.md`, `decision-datasets.md` and `pitfalls.md` (MIT).
Read this when writing criteria, deciding what a window carries, or batching questions.

## Evidence in `state`

A window is the only thing the model sees; it inherits no conversation.
For an agent checkpoint, give:

- the user's goal and acceptance criteria;
- the current stage and a short trace of recent actions;
- tool observations and failure output, not only the agent's reading of them;
- the proposed next action with its real arguments or stable candidate ids;
- constraints and policy, kept apart from untrusted content;
- which evidence is missing and which checks have not run.

Give the evidence the question needs. A pasted full transcript adds irrelevant context and lowers accuracy.
Question ids are routing keys; the full judgment goes in the question's instructions.

## Criteria that separate neighbours

Describe observable conditions with inclusions and exclusions. Add a compact example for a label that is easy to confuse.
Each ordered level stands alone ("partial verification: at least one required check ran and passed"), never relative to the previous level.
For a yes/no question, `yes` is the positive condition; never invert criteria to manufacture a different score.

Prefer several independent questions:

- Does the proposed action modify a check instead of the implementation it checks?
- Is a required verification result absent from the observations?
- Does the proposed action address the failure currently observed?
- Does the proposed action exceed the user's stated scope?

## Preference, suitability, uncertainty, authorization, success

These are five different claims. The highest-probability option is a preference; whether it fits the task needs its own question; the distribution's concentration is uncertainty; permission comes from the user and the host's policy; success is an observed result.
A System One answer speaks only to the first three.
On an unattended task, uncertainty triggers bounded evidence gathering, escalation or a checkpoint. It never widens scope, lowers a test or stands in for approval.

## Batching

Questions in one request share the evidence and cannot read each other's answers.
Batch independent questions over the same window. A question whose state depends on another answer needs a second request after that answer.
For many records, scope each question to an explicit record id and run requests with bounded concurrency.

## Fixtures before automation

Test positive, negative, ambiguous, missing-evidence, contradictory and adversarial windows, and windows where the right answer is to leave the agent alone.
Record raw outputs, served model, cost and latency.
Tune on development windows; report on held-out windows.

## Measuring a question

Report per question: n, the confusion matrix, κ, and the disagreement list.
For probability quality, report negative log-likelihood and Brier score from the returned option probabilities, with reliability bins and their counts.
For routing, report coverage (accepted / all), selective risk (wrong accepted / accepted) and the escalation rate. Zero acceptance means undefined risk, not zero.
Correlated repeats of one episode are not independent evidence.
