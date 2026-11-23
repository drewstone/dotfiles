# Ambition probe

A behavioral test for guidance meant to raise agents' targets: does a skill's text make an agent name the best known result, aim above today's number, and change mechanism?
Use this probe to compare numerical target-setting on improvement tasks. Its scores do not assess open-ended research.

## What it runs

- [`scenarios.json`](scenarios.json): realistic tasks, each stating today's number, tagged with the skill that serves it now (`skill`) and the skill that served it at the base revision (`base_skill`, which differs where skills were merged). A scenario with `"split": "heldout"` is never used to edit skill text; the rest are `tuned`. Report the two splits separately, and add held-out scenarios before tuning against the tuned ones.
- [`rubric.md`](rubric.md): three yes/no questions, fixed before any arm was scored.
- [`control.md`](control.md): neutral repository conventions, cut to the new text's word count, so length alone cannot explain a difference.
- [`run.py`](run.py): gives each scenario to an agent under each arm's text, then has a judge from another model family score each reply blind, in shuffled order, without the arm.

| Arm | Skill text the agent receives |
|---|---|
| current | `base_skill` at `--base` (default `origin/main`) |
| new | `skill` at `--head` (default the working tree) |
| control | `control.md` cut to the new text's length |

The agent is the Claude Code CLI on its own subscription login with no settings; the judge is the `grok` CLI (or `codex exec` with `--judge codex`) with no tools and a JSON schema.
`--agent-tools none` (the default) gives the agent no tools, so it can only promise to look up a best known result. `--agent-tools search` gives it web search, web fetch and read-only file tools inside a snapshot of the arm's revision of this repository without `_probes/`, so the skill's links resolve and the rubric stays out of reach; each reply records its tool calls.
Calls are cached by digest beside `--out`, so a rerun makes only the missing calls.

```bash
python3 claude/skills/_probes/ambition/run.py --samples 2 --out <scratch>/probe.json
python3 claude/skills/_probes/ambition/run.py --agent-tools search --samples 2 --out <scratch>/probe-tools.json
python3 claude/skills/_probes/ambition/run.py --table <scratch>/probe-tools.json   # the Markdown tables
```

## Reading the result

Each arm reports, out of `n` replies, how many the judge scored YES on each question and on all three, overall, per split and per skill.
The paired comparison counts, per scenario, sample and question, the replies where only the new arm or only the other arm scored YES, with McNemar's exact two-sided p on those discordant pairs; the pooled count treats one reply's three questions as independent, so read the per-question rows.
The change passes when the new arm beats both the current text and the control on the first two questions; a question every arm saturates says nothing and is reported as such.
Results live in [`results/`](results/), one JSON file per run with every reply and judgment, and one Markdown table.
