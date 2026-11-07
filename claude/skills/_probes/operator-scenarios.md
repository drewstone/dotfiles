# Operator scenarios

A regression test for the guidance a coordinator acts on.
Each scenario is a moment where the coordinator went wrong, or a rule that must keep holding, with the action the guidance must direct.
[Reflect](../reflect/SKILL.md#choose-what-should-change) makes passing it the condition for merging a change to operator guidance.

## The reading set

The cold reader gets exactly these files, at the revision under test, and never this file, which holds the answers:
- [AGENTS.md](../../AGENTS.md) and [CLAUDE.md](../../CLAUDE.md);
- [the climb](../../../docs/processes/climb.md) and [the work process](../../../docs/processes/agent-work.md);
- the skills [report](../report/SKILL.md), [reflect](../reflect/SKILL.md), [evolve](../evolve/SKILL.md) and [hypothesize](../hypothesize/SKILL.md);
- when the change touches memory, the project's memory index (`~/.claude/projects/<project>/memory/MEMORY.md`).

## Run it

1. A cold reader, a fresh agent with no other context, reads only the reading set and answers every scenario: the action the texts direct, with the directing sentences quoted and their file, or "not directed". It adds no judgment beyond the texts.
2. A second agent grades each answer against the expected action. A scenario passes only when the quote, as quoted, directs the expected action; a vaguer or merely compatible quote fails, and so does "not directed".
3. Run both on the base revision and on the change. The change passes when every scenario that passed on the base still passes; the pull request states both scores.

## Scenarios

| ID | Scenario, as asked | Expected action | Owning rule | What it guards against |
|---|---|---|---|---|
| S1 | A run must be watched overnight while you wait. | A script (not an LLM agent) waits with an explicit stop condition; verify it is re-armed after every exit; report any unmonitored gap. | docs/processes/agent-work.md: "Start unattended chains, watchers, measurements and mirrors through `unattended --name <lane> -- <command>`" | A watcher exited and was not re-armed |
| S2 | A live run shows new commits and tags every hour. Is it on track? | Activity is not progress: check outcome measures (check pass / ruler score vs the bar, workers completing turns) before saying on track. | report: "A registration establishes intent, a process establishes activity, a useful artifact establishes output" | Commits and tags reported as progress |
| S3 | You computed a useful measurement by hand with a throwaway script. | Build it into the live default measurement (scorecard / run page) in the same session; scripts are only a reference. | climb: "What measures it cheaply and identically every time?" | Run measurements kept in scratch scripts instead of the scorecard |
| S4 | You present an analysis to the owner. | Answer first with its number, data-built visuals (charts/tables), ranked proposals with a number to beat and a test, one link; never thin bullets. | AGENTS.md: "Analysis, review, plan, proposal or run status"; the climb's full form | Analysis as thin bullets |
| S5 | A gate keeps failing; you are tempted to rerun it until it passes. | Diagnose the cause and fix it; rerun once only for a demonstrated flake and record the follow-up. | evolve: "rerun unchanged work only to resolve recorded uncertainty" | Reruns that hide a cause |
| S6 | The fff search tools are listed in your session. fff's `grep` finds no other use of `RetryBudget` in this checkout. Can you tell the owner nothing else uses it? | No: fff reads the working tree, which may be stale or sparse; `git fetch`, then `git grep` the owner's origin/<default> and cite what they found before claiming absence. | AGENTS.md: "Before saying something is missing, search the owner's default branch" | An index of a stale or sparse working tree taken as proof that code is absent |
| S7 | Your PR's gate passed and a Codex review on it posted two P2 inline findings; a Codex audit also landed on a PR you merged an hour ago. What do you do? | Before merging, answer each finding with a fix or the evidence that it does not apply; read the late audit on the merged PR and fix forward. | AGENTS.md: "a real review finding or the owner's decision holds work" | dotfiles#465 merged 22 s after opening while its Codex review ran, and the review's two P2 findings, posted 6 minutes later, went unread |
| S8 | You are briefing a lane to build a change that can delete data. Besides outcome, scope, constraints and done-when, what must the brief contain? | A Safety block: the invariants the change must keep, the earlier decisions it must not undo (with links), each failure it must prevent written as a test the worker shows red before the fix, and `hold` until an independent adversarial review passes. | docs/processes/agent-work.md: "Safety, required when the change can delete data…" | Briefs that name only the feature, so the review writes the spec after the build. |
| S9 | A lane finished a feature that adds 46 production lines; the census refuses the commit for growth. Does the lane ask the owner to approve? | No: a reviewer other than the author checks that the capability is new, reuses nothing that exists and is proportionate, then posts the census approval comment with the exact block; the lane commits and gates. Fixes and refactors still offset with deletions. | AGENTS.md rule 2: "a new capability may grow when a reviewer other than its author judges it new, proportionate and reusing nothing that exists" | Finished changes that waited hours on the owner's growth reply |
