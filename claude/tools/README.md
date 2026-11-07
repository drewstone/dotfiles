# Claude Tools

Custom CLI tools for managing Claude Code. Installed via `install.sh` which symlinks tools to `~/bin/`.

## Codex account choice

The `codex` wrapper admits fresh subscription execs through `acct run`.
Codex Companion's stdio broker keeps its connection while each new thread gets
an account; in-flight and continued threads retain their original account.
Completed workers exit through stdin EOF. Exhaustion notifications invalidate
acct quota snapshots before the next task; other app servers allocate per process.
Explicit `CODEX_HOME` pins, local inference, tooling, help and probes bypass allocation.

Exec resume/fork resolves enrolled saved-session homes, including names and
cwd-filtered `--last` ordered by last update time. `--all` removes the cwd filter.
Missing sessions retain native errors; continuations report exhaustion in their
original home. Lookup honors `ACCT_CONFIG` and enrolled symlinks.

Claude settings put `~/bin` before Homebrew. The wrapper resolves its symlink to
load adjacent routing helpers, using Node from PATH or the managed nvm default
and Python for read-only session lookup. Existing brokers and running lanes keep their current processes.

## journeys-env

Run a command with an agent app's journey test identities loaded from the host's dotenvx vault, and nothing else from it.
The `prove-journeys` skill uses it to record journeys with agent-app's `agent-app-journeys`.

```bash
cd <app checkout>                                     # holds journeys.config.mjs
journeys-env -- pnpm exec agent-app-journeys run journeys/core-path.ts
JOURNEYS_ENV_NAMES="A_EMAIL A_PASSWORD" journeys-env -- <command>   # names without a config
```

The names come from `agent-app-journeys env-names`, or `JOURNEYS_ENV_NAMES`.
Each is read from the first file under `JOURNEYS_SECRETS_DIR` (the environment, else the private layer's `claude/config/journeys-env.env`) that defines it, decrypted with `dotenvx get`, and exported into the command only; a name already set is kept.
It never prints a value, and exits 2 when that directory is unset or a name is missing, empty or not a variable name.

## run-jobs-watch

`run-jobs-watch [-v] <run-id> [owner/repo]` watches a GitHub Actions run at the job level (default repo: `RUN_JOBS_WATCH_REPO`, else the current checkout's).
It exits 1 on the first job that concludes anything other than success or skipped, and prints that job's link.
It exits 0 when the run completes and prints the run's conclusion.
It retries transient read errors and exits 2 after 5 failed reads in a row.
Use it for deploys: a run-level watch misses a failed job while the run waits on a later one.
Run it as a tracked background task, so its exit reaches the session.
`--require-job <name>` exits 3 unless that job itself concluded success: a deploy can conclude success while every deploy job was skipped as superseded.

## wt-new, wt-save

Scoped worktree lifecycle for parallel agent sessions sharing one Unix user.

```bash
wt-new agent-eval feat/my-branch   # creates ~/code/_wt/agent-eval-feat-my-branch,
                                    # writes .wt-owner=$CLAUDE_CODE_SESSION_ID
wt-save                            # commits + pushes every worktree THIS session owns
wt-save --all                      # also lists other sessions' worktrees (never touches them)
wt-save --dry-run
wt-save /path/to/some/worktree     # explicit path is always treated as owned
```

A worktree is owned when its `.wt-owner` marker's `owner=` line matches
`$CLAUDE_CODE_SESSION_ID`, or when it is named explicitly. Without a marker
match, `wt-save` never commits or pushes in it — an unscoped version of this
once committed and pushed another session's in-progress work.
Mid-merge/mid-rebase trees are always skipped. A dirty tree whose pre-commit
hook refuses the commit gets a patch backup under
`~/attic/wt-save-patches/<date>/` instead (never `--no-verify`). Runs up to
8 worktrees in parallel (`--parallel N`).

## wf-status

Summarize Claude Code workflow runs (parallel subagent fan-outs) from
`~/.claude/projects/*/<session>/subagents/workflows/<run>/`:

```bash
wf-status                  # one line per run touched in the last 24h
wf-status --since 3d
wf-status --all            # no time filter
wf-status wf_22b9e051      # expand one run: one line per agent
wf-status --agents --since 6h
```

Reports start time, idle minutes, tool-call count, and the agent's last
text per run (or per agent with `--agents`). Verdicts: `done` (journal
recorded a result), `failed` (journal recorded a failure), `USAGE-LIMIT`
(a `quotaLimits.status=="rejected"` record in the transcript — a fact, not
a guess), or `DIED-LIKELY?` (no concluding journal event and no activity
for 10+ minutes — a hypothesis; could be a crash or an interrupt instead).

## skill-run-log, skill-scoreboard, lead-scorecard

The instrument for the climb's "operator tools" and "operator" layers ([climb.md](../../docs/processes/climb.md)).
Each skill's `## Log the run` calls `skill-run-log`, which appends a schema-2 row to the repository's `skill-runs.jsonl` under `${XDG_STATE_HOME:-~/.local/state}/agent-work/<repo>/`.

```bash
skill-run-log /verify --target "<scope>" --verdict PASS --pr https://github.com/o/r/pull/12 --next /ship
skill-run-log /evolve --target "<hill>" --verdict PARTIAL --detail ITERATE --prediction "p90 below 30 s" \
  --metric "p90 cold start" --unit s --before 41 --after 33 --source .agent/runs/evolve-12/
skill-run-log --override --theme rigor --note "<what you corrected>"   # this session's latest run
skill-run-log --backfill        # link this host's schema-1 rows into skill-runs.v2.jsonl
skill-scoreboard                # this machine plus the SKILL_SCOREBOARD_HOSTS hosts
skill-scoreboard --by-version --since 30d --skill /verify
skill-scoreboard --climb --append .agent/climb.jsonl
lead-scorecard --days 7
lead-scorecard incident open <id> --started <time> --detected <time> --summary "<what broke>"
lead-scorecard decision ask <id> --question "<what only you can decide>"
```

- **Verdict:** `PASS`, `FAIL`, `PARTIAL`, `BLOCKED` or `ABANDONED`, for the target against the skill's bar. Schema-1 labels map through a table derived from the 110 labels in the first 421 rows; the skill's own label stays in `verdictDetail`.
- **Captured without flags:** session, harness and lineage ids (`CLAUDE_CODE_SESSION_ID` or `CODEX_THREAD_ID`, the runtime's lineage variables), the transcript that ran the command (main session or subagent), the trace directory, the duration from the skill's first invocation since its last logged result, tokens in that window, the PRs it created or merged, and the SKILL.md sha.
- **Outcome:** with the private layer's outcome joiner, scoreboard and row writes read the PR signals it keeps at `~/.local/state/skill-outcomes/pr-signals.json` and queue due refs without GitHub calls; without it, rows keep the outcome they were logged with. Original-goal acceptance stays `UNKNOWN`.
- **Corrections:** the SessionEnd hook `skill-run-settle.sh` reads the operator's next message after each run, and interrupts during it, and writes a judgment to `skill-run-events.jsonl` (layer `operator`). Quotes stay in that local file; climb exports carry a transcript pointer. Subagent runs stay unknown. The same hook runs the daily outcome join and settles Codex sessions.
- **Scoreboard:** reads only these ledger files on each host over ssh (`SKILL_SCOREBOARD_HOSTS` names them; none by default) and orders signals as the climb ranks rewards: outcome, corrections, brief-judge score, then the author's claim. It draws its charts with `viz` and falls back to the small renderer in `skill_ledger/core.py` when node or viz is missing.
- **Lead scorecard:** per local day, corrections, guard refusals from `agent-work/_guards/*.jsonl`, your revert and rollback PRs, incidents with time to detect and recover (`_lead/incidents.jsonl`), and decisions waiting on you (`_lead/decisions.jsonl`).

## skills

List installed skills or check the skill catalog budget:

```bash
skills
skills eval
skills --check
```

The check scans Claude, Codex, shared Agent Skills, and Codex system roots.
It flags descriptions over 160 characters and measures the rendered names, descriptions, and resolved source paths.
It fails on duplicate names and broken links.
It warns when the list exceeds Codex's documented 8,000-character fallback for an unknown model context.
With a known model context, Codex instead limits the initial list to 2% of that context.
See [OpenAI's skill documentation](https://learn.chatgpt.com/docs/build-skills).
