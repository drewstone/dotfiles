# Ambition probe

A behavioral test for guidance meant to raise agents' targets: does a skill's text make an agent name the best known result, aim above today's number, and change mechanism?
[Reflect](../../reflect/SKILL.md#choose-what-should-change) and [writing for agents](../../writing-for-agents/SKILL.md) send such changes here; the pull request states the three arms' rates.

## What it runs

- [`scenarios.json`](scenarios.json): realistic tasks, each stating today's number, tagged with the skill that serves it now (`skill`) and the skill that served it at the base revision (`base_skill`, which differs where skills were merged).
- [`rubric.md`](rubric.md): three yes/no questions, fixed before any arm was scored.
- [`control.md`](control.md): neutral repository conventions, cut to the new text's word count, so length alone cannot explain a difference.
- [`run.py`](run.py): gives each scenario to an agent under each arm's text, then has a judge from another model family score each reply blind, in shuffled order, without the arm.

| Arm | Skill text the agent receives |
|---|---|
| current | `base_skill` at `--base` (default `origin/main`) |
| new | `skill` at `--head` (default the working tree) |
| control | `control.md` cut to the new text's length |

The agent is the Claude Code CLI on its own subscription login with no tools and no settings; the judge is the `grok` CLI (or `codex exec` with `--judge codex`) with no tools and a JSON schema.
Calls are cached by digest beside `--out`, so a rerun makes only the missing calls.

```bash
python3 claude/skills/_probes/ambition/run.py --samples 2 --out <scratch>/probe.json
```

## Reading the result

Each arm reports, out of `n` replies, how many the judge scored YES on each question and on all three.
The paired comparison counts, per scenario and sample, the questions where only the new arm or only the other arm scored YES, with McNemar's exact two-sided p on those discordant pairs.
The change passes when the new arm beats both the current text and the control on the first two questions; a question every arm saturates says nothing and is reported as such.
Results live in [`results/`](results/), one JSON file per run with every reply and judgment, and one Markdown table.
