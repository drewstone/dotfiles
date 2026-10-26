---
name: systemone
description: Design, dry-run, calibrate and label a System One question set over traces with agent-eval's decisionPoint, and turn calibrated labels into training episodes.
---

# System One question sets

Derived from wuyoscar/jev-skill (MIT).

A System One model answers bounded questions about supplied evidence with a probability per option.
It routes and labels; it never writes plans, code or prose, and it never does arithmetic, counting, date comparison or exact matching. Those stay in code.
In our stack a question set is an agent-eval `decisionPoint` (`@tangle-network/agent-eval/systemone`, `src/decision-point.ts`). Read its exports before relying on a field named here.

The loop below ends in one calibrated, versioned question set whose labels export as rollout episodes.

## 1. Name the decision and its consumer

Write down who acts on the answer and what they do with each option: continue, inspect a failed check, retrieve missing evidence, escalate, or record only.
Include an `insufficient_evidence` or `none` option when the supplied choices may not fit.
Done when every option maps to a `DecisionRoute` the consumer already implements.

## 2. Convert the prompt into questions

`decisionPoint` takes Choice questions only. Convert each part of the source prompt:

| Part of the judgment | Becomes |
|---|---|
| One label from a finite set | Choice with those labels |
| One proposition (Jev's Noul) | Choice `yes` / `no` / `insufficient_evidence`, criteria aligned so `yes` is the positive condition |
| A graded judgment (Jev's Score) | Choice whose options are ordered levels, each described on its own (never bare `"0"`, `"1"`) |
| Counts, money, timestamps, equality, thresholds | Code over parsed inputs; not a question |
| Writing a reply, plan or patch | A generative model; not a question |
| "Return JSON" | Dropped; answers are typed |

Ask atomic, literal questions and combine their answers in code. "Is it done and safe?" is two questions.
Read [question design](references/question-design.md) when writing criteria, choosing what goes in `state`, or batching questions over shared evidence.
Done when each question names one observable condition and its options separate neighbouring cases.

## 3. Freeze the set and the window policy

Create the point with an `id`, a `version`, the requested `model`, `layers`, the questions and one policy per question.
The question digest binds the question text, option order, model and served model, so any edit is a new `version` and voids its certificates.
Windows (the evidence each call sees) come from a named, versioned extraction policy. A window is self-contained: the goal, the stage, a short action trace, tool observations and the proposed next action, separated from untrusted content.
Never put labels, rewards, expected outputs or test answers in `state`; gold travels only to calibration.
Done when the definition digest and window policy name are recorded beside the run.

## 4. Dry-run on development windows

Run `decide()` on about 50 windows from the development split. Uncalibrated policies always recommend `escalate`, so a dry run cannot drive work.
Read the probability distributions, invalid answers and abstentions; fix wording on development windows only, and bump `version` for each change.
Done when the answers are valid on every window and no question is constant across them.

## 5. Build gold with a different model family

Label the same windows with a model from another family, or a person, working from the window and the criteria alone, never from the System One answers.
Record each label with `observe()`; an unsure label is an exclusion, never `no`.
List every disagreement between gold and System One with its window, and send that list to Drew. His answers replace the gold label.
Done when every window has a gold label or a recorded exclusion, and Drew has the disagreement list.

## 6. Calibrate

Read `reliability()` per question. A question is calibrated when Cohen's κ is at or above `DECISION_POINT_MIN_KAPPA` (read the constant from agent-eval) and every class has at least 10 gold positives.
Split development and evaluation windows by task family or run, never by repeated checkpoints of one episode.
Install the certificate (κ, question digest, served model, evidence references) in that question's policy. A model, wording or window-policy change invalidates it.
Done when at least one question carries a certificate built from held-out windows. A question below the bar stays record-only.

## 7. Label and export episodes

Run the calibrated point over the target windows. Only answers whose reason is `threshold` count as labels; `uncertain`, `uncalibrated` and `model-mismatch` are gaps.
Write each label onto its rollout line as a reward or metric with its source (`decision-point/<id>@<version>`), and read the result back through agent-eval's exporters.
Done when the export produces rows whose labels trace to a certified question and a stored decision record.

## Pitfalls

- Confidence measures how concentrated the distribution is; it is not the probability of being right and it grants no authority.
- Separate questions do not obey logical identities: P(x) need not equal 1 − P(not x). Enforce invariants in code.
- Model agreement is consistency, not ground truth; a second call to the same family is not gold.
- Long irrelevant context lowers accuracy; give the evidence the question needs, not the whole conversation.
- Thresholds are per question, model and domain; never copy one across.

## Log the run

```bash
skill-run-log /systemone --target "<decision point id@version>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The calibrated labels should grade agents or gate a release | `/eval-engineering` | the certified point and its reliability report |
| The labeled episodes feed a training run | `/evolve` | the exported rows and the label source |
