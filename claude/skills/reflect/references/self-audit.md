# Self-audit

Read this when measuring an operator period for a reflection.
The audit counts; the reflection explains each count from the transcript.

## Choose the files

- Claude Code: `~/.claude/projects/<project-dir>/<session>.jsonl`; subagents write theirs under `<session>/subagents/`.
- Codex: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`.
- Select by the period, for example `find ~/.claude/projects -name '*.jsonl' -newermt '2026-10-10 00:00'`, and name the files you could not read.

```bash
~/.claude/skills/reflect/scripts/self-audit <files>... --repo <checkout>   # bars and tables; --json for the raw counts
```

## Read the counts

| Count | What it is | What to check before calling it a failure |
|---|---|---|
| Guardrail matches | Commands that force-push, merge with `--admin`, bypass hooks, add attribution, or build on the Mac; hook refusals; secret-shaped output | The command ran, on that host, and was not a search for the pattern |
| Repeated commands | The same command run more than once | A run after a change is iteration; a run with nothing changed between is rework |
| Rollbacks and reverts | `git revert` or `reset --hard` commands, and revert commits in `--repo` | Which change was undone, and whether a check could have caught it first |
| Stalls | Gaps of 10 minutes or more not ended by the person: waiting on a command, or idle | What the work was blocked on, and the minute someone could have unblocked it |

## Incidents

Time to detect runs from the first failing signal to the first action on it; time to recover runs from the first failing signal to the first passing check on the real path.
Take the times from the system's own records: the systemd journal (`journalctl --user -u <unit> --since <time>`), CI run logs, release logs, and the synthetic turn journal.
Draw them with `viz strip` for the check outcomes and `viz waterfall --unit m --start <first failure> --end <recovered>` for where the time went; the [incident section](../../tangle-ops/SKILL.md#run-an-incident) has the Oct 10 example.
