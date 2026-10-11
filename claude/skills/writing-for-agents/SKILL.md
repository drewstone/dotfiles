---
name: writing-for-agents
description: Write or edit documents agents read, such as skills, AGENTS.md, CLAUDE.md, and the docs they point to, so agents act on them reliably.
---

# Writing for agents

Derived from mattpocock/skills writing-for-agents (MIT).

In the dotfiles repository, also follow [skill authoring](../_common.md) for structure, the run log, and the final `## Then consider` footer.

## Pointers decide when material is read

A skill description, or an AGENTS.md line naming a doc, is a pointer: always loaded, and its wording decides when the agent reaches the target.
Lead with the word that should trigger it, give one trigger per distinct case, and cut identity the body already carries.
Every word of an always-loaded pointer costs on every turn; prune it harder than the body.
If needed material is reached unreliably, sharpen the pointer before inlining the material.

## Put each piece at the right level

- Steps every run needs stay in the main file, in order.
- Reference consulted on demand can sit in the main file when every branch needs it.
- Detail only some branches need moves to a linked file, with a pointer at the decision point that says when to read it.

Keep a concept's definition, rules, and caveats together under one heading.
A document that is too long thins attention even when every line is live; disclose detail and split by branch.

## Steps end on a checkable condition

End each step on a completion condition the agent can observe, such as "every modified model accounted for" or "one command already run that goes red on this bug".
A vague end invites stopping early; sharpen it before hiding later steps.
The condition's demand sets how thorough the work is.

## Words that do work

- Prefer a precise existing word the model already understands (red, tight, frontier) to a phrase repeated in several places.
- State the behavior you want; a prohibition makes the forbidden behavior more salient. Keep a ban only as a hard guardrail, paired with the positive target.
- Keep each meaning in one place. Leave facts that a file, script, or `--help` can answer to that source; write down what the agent cannot look up: conventions, reasons, gotchas.
- Delete a sentence that does not change behavior compared with the model's default, and lines that no longer bear on the task.

## Skills

Keep a description when the agent or another skill must reach the skill on its own; it costs context on every turn.
Use `disable-model-invocation: true` for a skill only a person starts; its description becomes a short human summary.
Split out a separate skill only when it has its own trigger word or another skill must invoke it.

## Log the run

```bash
skill-run-log /writing-for-agents --target "<document>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The document makes factual claims that need checking | `/critical-audit` | the document and its sources |
