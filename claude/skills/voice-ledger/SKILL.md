---
name: voice-ledger
description: Voice ledger, day profiles, "what makes my agents productive": mine Drew's own messages to coding agents across harnesses and hosts into day, master and domain AgentProfiles, contrast best and worst days, prove profiles live, record operator baselines.
---

# Voice ledger

Reverse-engineer what makes Drew's agents productive from his own words: every turn he typed, which turns corrected an agent, what shipped that day, and the profiles that would have worked the way he wanted.

Run it on the Mac and read the GTR over ssh (`drew-gtr-pro`).
Set up these names first:

- `OUT=~/.local/state/voice-ledger/<YYYY-MM-DD>` is the run directory, with `extract/`, `corpus/`, `profiles/`, `analysis/`, `page/` and `proof/` inside it.
- `K=~/.claude/skills/voice-ledger` is this skill. Bare script names below mean `$K/scripts/<name>`, run with `python3 -I` or `$N`.
- `N` is an absolute node path, because the zsh node shim exits 0 on an error.
- `DOT` is the dotfiles checkout: `git -C "$(readlink -f $K)" rev-parse --show-toplevel`.

Transcripts stay on this machine. They leave it only as profiles that passed `validate.mjs` and as the private page.

## Rules for workflow steps

Launch each workflow with `Workflow({scriptPath: "<absolute $K>/workflows/<name>.js", args})` and save its result as `$OUT/corpus/<name>-result.json`.
The agent-cap-guard counts a Workflow as three Opus agents, so a workflow starts only when no Opus agent is live in this session. The bulk passes inside the workflows run on haiku and sonnet; keep them there.

## Before starting

1. Read the hill. Run `grep '"hill":"operator:voice"' $DOT/.agent/climb.jsonl`. Until the first run's rows are in the ledger, its numbers are in agent-dev-container memory `project_drew_voice_ledger_2026_10_15.md`.
   Done when the numbers to beat for correction share and merged PRs per correction are written down.
2. Pick the window. Start it where every host and harness store has turns (see `corpus/days.json` from step 2), and end it yesterday.

## 1. Extract every store on every host

- **Claude Code.** `traces` owns the turn classification (it reads through harness-sessions). Check `traces --version` is at least 0.23.0 on each host, then:
  `traces facts --harness claude-code --since ISO --until ISO --format json > $OUT/extract/claude-<host>.facts.json`
  (on the GTR: `ssh drew-gtr-pro 'PATH=$HOME/.local/bin:$PATH traces facts …' > …`).
  If its `selection.unreadSessions` names a session outside a `/tmp` project, also run trace-mine's extractor for the same window, `E=~/.local/share/tangle-tools/trace-insights/mine/analyst/extract.mjs`:
  `$N --max-old-space-size=12000 $E extract --since ISO --until ISO > $OUT/extract/claude-<host>.extract.jsonl` (GTR: `ssh drew-gtr-pro 'PATH=$HOME/.local/bin:/usr/local/bin:$PATH node --max-old-space-size=12000 --input-type=module - extract --since ISO --until ISO' < $E`).
  Then `python3 -I $K/scripts/from_traces.py $OUT/extract/claude-<host>.facts.json --host <host> [--fallback $OUT/extract/claude-<host>.extract.jsonl] > $OUT/extract/claude-<host>.jsonl`.
  It prints every unread session and whether the fallback recovered it; name each one in the report, and file it against traces when it is a reader error.
- **Codex, Pi and OpenCode.** Run `python3 -I $K/scripts/multi_extract.py <codex|pi|opencode>` locally. On the GTR, run `ssh drew-gtr-pro "python3 -I - <harness>" < $K/scripts/multi_extract.py`.
  Write each output to `$OUT/extract/<harness>-<host>.jsonl`. The host defaults to the short lowercase hostname, which matches trace-mine's turn ids.
  It reads both Codex account homes, Pi sessions and the OpenCode database. Kimi stores hold product runs, so skip them.
  Mac Claude sessions that the live store purged (August) exist only in the GTR trace archive (`/mnt/traces`). Name that gap if the window reaches it.
- **trace-mine Opus labels.** `scp drew-gtr-pro:.local/state/trace-mine/analyst/turns.jsonl $OUT/extract/trace-mine-labels.jsonl`

Done when there is one file per harness per host, no stderr holds a Traceback, every empty file is explained (for example, no store on that host), and from_traces.py reports no session as LOST.

## 2. Merge

Run `$N $K/scripts/merge.mjs $OUT`. It writes `corpus/turns.jsonl`, `days.json` and `merge-stats.json`.
merge.mjs owns the day rule: an America/Los_Angeles date with a 04:00 cutoff. Keep that rule, so runs compare.
Done when it prints `machineDropped`, `turns` and `days`, and the 15 most repeated 70-character prefixes in `turns.jsonl` contain no machine text. A repeated template is an agent: add its prefix to `MACHINE` in merge.mjs and rerun.

## 3. Outcomes

Run `python3 -I $K/scripts/outcomes.py $OUT <first> <last>` in the background right after step 2. GitHub search rate-limits it, and it resumes from `corpus/prs.days`.
Done when `prs.days` lists every day in the window.

## 4. Authorship (mandatory before any voice analysis)

About half of the long "user" turns are other agents: operator and cofounder relays typed into panes, mostly GTR Codex. The first run's count is in the memory file.

1. Run `stage.py authorship $OUT`. It prints `{dir, batches}`.
2. Run `authorship.js` with those args. Add `adcRoot` (an agent-dev-container checkout at `origin/develop`) only when the AgentProfile interface may have changed; otherwise, copy the previous run's `corpus/profile-brief.md`.
3. Run `stage.py authorship-join $OUT <result>`.

Done when authorship-join exits 0: the blind re-label agrees on at least 90% of audited lines. Below that, sharpen `GUIDE` in authorship.js and rerun.

## 5. Features

Run `python3 -I $K/scripts/features.py $OUT`.
Done when it prints Drew's turns, the scored turns and the days.

## 6. Corrections and day profiles

trace-mine's lexical detector misses about two thirds of corrections, so every analysis uses model labels from trace-mine's `ADJUDICATION_SYSTEM`.

1. Run `$N $K/scripts/adjudicate.mjs $OUT > $OUT/corpus/day-profiles-args.json`. It holds `corpus`, `batches`, `days` and that prompt.
2. Add `models`: one AgentProfile model block for each of `claude-code`, `codex` and `pi`, current per `/model-freshness`.
3. Run `day-profiles.js` with those args.
4. Run `python3 -I $K/scripts/post.py $OUT <result>`. It drops every quote that is not verbatim in that day's own text, and it scores shipping as merged PRs against the trailing 14-day median. Fleet volume grew about 50x, so raw counts would rank the calendar.

Done when post.py exits 0 (every turn labelled) and you have read its calibration line, which compares Sonnet with trace-mine Opus on 150 blind turns, and carried its agreement and over-call rate into the report.
Codex and Pi turns all carry Sonnet labels, so harness and label source are entangled. Compare harnesses only within one label source (`src`).

## 7. Contrast inputs

Run `stage.py contrast $OUT --from <first>`, then `$N $K/scripts/validate.mjs $OUT/profiles/day-profiles.json`.
Done when every day profile prints OK. A profile passes only if it meets the schema at the sidecar's agent-interface version, the catalog security policy and harness/model support, and keeps no private residue.

## 8. Contrast, profiles and red team

Run `contrast.js` with these args: `{out, scripts: "$K/scripts", node: $N, window, nDays, nTurns, nProfiles, calibration, models}`. Save the result as `corpus/contrast-result.json`.
Done when both of these hold:
- every file in `profiles/` passes validate.mjs;
- every finding has three lens verdicts.

Report a finding as a finding only if it survives all three lenses. The rest are leads.

## 9. Page

1. Run `stage.py chart $OUT --from <first> --to <last>`.
2. Run `build_page.py $OUT`. On the first run it writes a `page-text.json` skeleton.
3. Fill every TODO in it from this run's outputs. Give each number its window and denominator, and set it beside the previous run's value.
4. Rerun build_page.py, then run `$N $K/scripts/validate.mjs --scan $OUT/page/voice-ledger.html`.
5. Write the page under `~/reviews/` and open it.

Done when the scan prints CLEAN and the publish returns a URL.

## 10. Live proof

The router can run out of quota for the Pi model (`provider_quota_exhausted`), so proofs run on subscriptions through `acct sandbox resolve --key-env SANDBOX_API_KEY --base-url https://sandbox.tangle.tools`, and acct refuses a resolve without that base URL.

1. Run `npm i --prefix $OUT/cli @tangle-network/sandbox@latest`.
2. Run `$N $K/scripts/proof.mjs $OUT`. Use `--only <arm>` for one arm and `--router <provider/model>` for Pi.

proof.mjs reads the key from the environment or `~/.config/tangle/vb-publish.env`. Never print, echo or `env` it; process-guard blocks environment dumps.
Done when both of these hold:
- every arm prints `ok:true` and `deleted:true`;
- each profile arm's materialized file begins with the profile's instructions: `/home/agent/CLAUDE.md` for claude-code, `/home/agent/AGENTS.md` for codex.

Then compare each profile arm's answers with the baseline arm on the same harness.

## Judge success honestly

Use these rules for every claim the run makes.
- **Friction:** the model-labelled correction share.
- **Shipping:** merged PRs against the trailing 14-day median.
- **Value:** what the day's work earned, from benchmark and Discovery scorecard results and climb `PASS` rows joined per day. The first run had no value dimension; a day can ship many PRs and still lose.
- **Cause:** only the directive A/B (`claude/directives`) shows cause. Every other contrast is observational: say so, and report the three red-team lenses beside it.
- **Profile acceptance:** accept a profile on held-out replay. Score it against the person's real next turn, with a control arm, a blind judge and the best predictor without the persona. A live check written from the profile's own rules is a smoke test, not a score (agent-runtime `profile-authoring`, section 6).
- **Predictor to beat:** on 2026-10-08..14, previous-turn correction plus a gap under 30 minutes reached AUC 0.605. System One `typesafe/jev-1.13.0` (Tangle Router `POST /v1/systemone`) reached 0.528 on the agent message alone and 0.604 with session state. Read the latest `agents:operator-proxy` rows before claiming a better one.

Done when every headline number names its dimension, its baseline and whether it is causal, observational or judged.

## 11. Baselines

1. Run `python3 -I $K/scripts/baselines.py $OUT --from <first> --to <last> --ledger $DOT/.agent/climb.jsonl > $OUT/baselines.jsonl`. It prints each metric beside its latest earlier row.
2. In a dotfiles worktree, run `climb-log append --file $OUT/baselines.jsonl`, then land the rows through a pull request ([the ledger](../../../docs/processes/climb.md#the-ledger)).

Done when `climb-log check` passes.
Lead the report with each metric against its number to beat, then the surviving findings, the page URL and the proof result.

## Log the run

```bash
skill-run-log /voice-ledger --target "<window> on <hosts>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --metric "correction share" --unit share --before <number to beat> --after <this run> --source "$DOT/.agent/climb.jsonl" --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A surviving finding names a change to a profile, skill or directive | `/evolve` | the finding, its number to beat and its baseline row |
| A gate failed or a result looks wrong | `/diagnose` | the failing step, its output and the run directory |
| The master or a domain profile should reach the catalog | `/profile-authoring` | the validated profile file and its proof results |
