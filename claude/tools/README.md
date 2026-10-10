# Claude Tools

Custom CLI tools for managing Claude Code. Installed via `install.sh` which symlinks tools to `~/bin/`.

## gh-drew

Run `gh` as `drewstone` with the token from the environment or the devops vault.
Below 150 core calls left (`GH_DREW_MIN_CORE`), it refuses reads and keeps the rest for writes.

Each call appends one line to `~/.local/state/gh-drew/calls-<hour>.tsv` (`GH_DREW_LOG_DIR`):

```text
epoch  outcome  caller  session  directory  command shape
1790332581  called  pr-drive-watch  tmux:%7  ~/code/lane  api repos/o/r/actions/runs?status=queued
```

- The caller is the first ancestor that is not a shell or launcher; an interpreter is named by its script.
- The session is the tmux pane, else the systemd service, else the Claude Code session.
- The shape keeps subcommands, the API path, numbers and repository names.
  It never holds the token or a flag value, such as a body, a field or a header.
- On Linux the line costs about 0.8 ms and no fork. Files older than 25 hours are deleted.

The fleet invariant "GitHub core quota" in tangle-tools reads these files to name the top callers.

## viz

Charts drawn to scale from data, for the terminal and for brief pages.
It reads JSON or TSV from a file or stdin, needs no network or packages, and prints the same bytes for the same input.

```bash
viz bars causes.tsv --total 171 --source "reliability endpoint" --asof 2026-10-10   # shares, and any (unaccounted) remainder
viz grouped success.tsv --target 95                    # cells may be ratios like 33/36: the bar is the rate, the label keeps the denominator
viz spark latency.tsv --unit s                         # one line per numeric column, with first→last, min, max and n
viz strip canary.tsv                                   # ✓/✗ cells on a time axis, the pass rate and the longest failing run
viz stack turn.tsv --unit s                            # parts of one whole; a group column adds a rollup
viz waterfall outage.tsv --unit m --start 00:45 --end 07:31   # offset rows with clock ranges; the span must equal the parts
viz timeline events.tsv                                # events with the gap since the previous one
viz table repos.tsv --sum
viz brief spec.json                                    # a brief spec as a terminal status
viz brief spec.json -o page.html                       # the same spec as an artifact-ready page
```

Width follows the terminal, then `$COLUMNS`, then 80; `--width` overrides it, and every line fits.
Parts that exceed their whole, ratios above their denominator and values past `--max` exit 2 with the row named; a whole larger than its parts prints the remainder as its own row.
A chart without `--source` warns on stderr.
The models live in `viz-kit/core.mjs`, and `viz-kit/brief.mjs` checks brief specs and fills the report skill's [brief kit](../skills/report/references/brief-kit.md).
Run `viz --help` for every option.

## agent-ask

Hand an outcome-level ask to any Tangle agent app through the standard operator API every app mounts at `/api/operator/v1`.
The `agent-ask` skill says how a session phrases the ask and gates what comes back.

```bash
agent-ask --app gtm "<ask>"                                  # GTM; Drew's workspace by default
agent-ask --app tax --workspace <id> "<ask>"                 # any app: gtm, tax, legal, insurance, creative, hospitality, builder, physim, super
agent-ask --app tax status <thread> --wait 30m               # follow a running turn
agent-ask --app tax file <path>                              # read a file the agent wrote
agent-ask --app tax approvals | scorecard | journal | workspaces
agent-ask apps                                               # known apps and origins
```

It starts the turn with a client-generated turn id, so a retried start never runs twice, then holds `?wait=25` turn reads until the turn settles, waits on a decision, or `--wait` ends.
Exit codes match `gtm-ask`: 0 completed, 1 failed, 2 usage or config, 3 still running, 4 waiting on a decision.
The key is that app's operator key from `<APP>_OPERATOR_API_KEY`, else the one Tangle agent key `TANGLE_AGENT_KEY`, from the environment or `~/company/devops/secrets/agent-state.env`; the origin defaults to the app's production host and is overridden by `--origin` or `<APP>_BASE_URL` (HTTPS, or loopback HTTP).
An app that has not mounted the operator API answers that it does not serve it yet.

## gtm-ask

Hand an outcome-level ask to the production GTM agent (gtm.tangle.tools) and read back its result.
The `gtm-ask` skill says how a session phrases the ask and gates what comes back.

```bash
gtm-ask "Make on-brand Reddit ads for Sandbox; find our real logo, fonts and screenshots yourself"
gtm-ask --thread <id> "Revise: hold the policy ad"     # continue a conversation
gtm-ask --wait 0 "<ask>"                               # return once the turn is admitted
gtm-ask status <thread> --wait 30m                     # follow a running turn
gtm-ask file research/plan.md                          # read a vault file the agent wrote
gtm-ask --json --download ./assets "<ask>"             # one JSON object; save referenced asset files
```

It starts a new thread unless `--thread` names one, sends `gpt-6.1-sol` unless `--model` overrides it, and follows the turn through its stream, the replay route, then slow `/api/chat/running` polls.
The result comes from the persisted thread, not the stream: reply, failure notice, asset-version URLs, vault paths the turn created or edited, and open questions or Hub approvals.
Exit codes: 0 completed, 1 failed, 2 usage or config, 3 still running, 4 waiting on an approval or question.

The workspace defaults to `GTM_WORKSPACE_ID`, else Drew's "GTM Agent" workspace.
The key is a `gak_` operator key with `operator:read`, `operator:write` and `operator:run`, read from `GTM_OPERATOR_API_KEY` or that slot in `~/company/devops/secrets/agent-state.env` through dotenvx.
Each request, reads included, spends the key's allowance of 60 a minute and 1,000 a day.
The API itself is documented in gtm-agent's `docs/operator-api.md`.

## wt-new, wt-save

Scoped worktree lifecycle for parallel agent sessions sharing one Unix user.

```bash
wt-new agent-eval feat/my-branch   # creates ~/webb/_wt/agent-eval-feat-my-branch,
                                    # writes .wt-owner=$CLAUDE_CODE_SESSION_ID
wt-save                            # commits + pushes every worktree THIS session owns
wt-save --all                      # also lists other sessions' worktrees (never touches them)
wt-save --dry-run
wt-save /path/to/some/worktree     # explicit path is always treated as owned
```

A worktree is owned when its `.wt-owner` marker's `owner=` line matches
`$CLAUDE_CODE_SESSION_ID`, or when it is named explicitly. Without a marker
match, `wt-save` never commits or pushes in it — an unscoped version of this
once committed and pushed another session's in-progress work (2026-09-24).
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

## pr-gate

The 2-minute merge gate: fetch + merge the default branch (auto-resolving
CHANGELOG-only conflicts by keeping both sides), run the repo's own quick
check, push, and merge through `gh-drew`. Never waits on CI.

```bash
pr-gate 802                          # repo inferred from origin, dir = cwd
pr-gate 802 --repo owner/name --dir ~/webb/_wt/some-branch
pr-gate 802 --dry-run
pr-gate 802 --admin                  # force --admin on the gh merge
```

A repo opts into the quick check by adding an executable `.pr-gate` file at
its root (same idea as a checked-in `.ai-agent-hooks.mjs`: the repo owns the
content — frozen install, typecheck, an optional proof command). No file
means no quick check; pr-gate still does the merge/push/gh-merge steps. Any
merge conflict outside CHANGELOG.md stops the gate for manual resolution.

## beelink-gate

From GTR, run a full-SHA gate on a beelink without creating a lane worktree there:

```bash
beelink-gate beelink2 git@github.com:owner/repo.git <full-sha> -- bash -c 'pnpm typecheck && pnpm test'
beelink-gate --no-install beelink2 git@github.com:owner/repo.git <full-sha> -- node scripts/check-processes.mjs
```

The command streams output and a receipt with the SHA, command, exit code, and duration.
It uses one cached, detached checkout per host/repo in `~/.cache/beelink-gate/` and
locks that checkout through the install and command. It cleans the prior run's
outputs, fetches the requested commit with complete history, and runs a frozen
pnpm or npm install against that user's shared package store.
Use `--no-install` only for dependency-free checks, such as docs content or
structure checks. The gate still fetches and verifies the exact SHA, and its
receipt records `install=no-install`.
Different repos can gate in parallel; gates for the same repo wait. The cache is independent of main
checkouts and lane worktrees. An older partial cache is rebuilt once under its
repo lock so history checks do not fetch missing blobs one at a time. The gate
refreshes `origin/` refs for the remote default branch, `main` or `develop`,
and branches whose remote head matches the requested SHA. It fetches only those
branch histories; the requested SHA remains detached. Its 40 GiB total cap evicts
the least recently used idle checkout before and after gates;
keep retained proof outside the cache. A gate refuses before fetching when
beelink1 has less than 100 GiB or beelink2 has less than 162 GiB free on its
root filesystem. A second floor
check after installation keeps the requested command from starting if its
install consumed the reserve.

## skill-run-log, skill-scoreboard, lead-scorecard

The instrument for the climb's "operator tools" and "operator" layers ([climb.md](../../docs/processes/climb.md)).
Each skill's `## Log the run` calls `skill-run-log`, which appends a schema-2 row to the repository's `skill-runs.jsonl` under `${XDG_STATE_HOME:-~/.local/state}/agent-work/<repo>/`.

```bash
skill-run-log /verify --target "<scope>" --verdict PASS --pr https://github.com/o/r/pull/12 --next /ship
skill-run-log /evolve --target "<hill>" --verdict PARTIAL --detail ITERATE --prediction "p90 below 30 s" \
  --metric "p90 cold start" --unit s --before 41 --after 33 --source .agent/runs/evolve-12/
skill-run-log --override --theme rigor --note "<what Drew corrected>"   # this session's latest run
skill-run-log --backfill        # link this host's schema-1 rows into skill-runs.v2.jsonl
skill-scoreboard                # this machine plus gtr, beelink1-wsl, beelink2-wsl
skill-scoreboard --by-version --since 30d --skill /verify
skill-scoreboard --climb --append .agent/climb.jsonl
lead-scorecard --days 7
lead-scorecard incident open <id> --started <time> --detected <time> --summary "<what broke>"
lead-scorecard decision ask <id> --question "<what only Drew can decide>"
```

- **Verdict:** `PASS`, `FAIL`, `PARTIAL`, `BLOCKED` or `ABANDONED`, for the target against the skill's bar. Schema-1 labels map through a table derived from the 110 labels in the first 421 rows; the skill's own label stays in `verdictDetail`.
- **Captured without flags:** session, harness and lineage ids (`CLAUDE_CODE_SESSION_ID` or `CODEX_THREAD_ID`, `TANGLE_*`), the transcript that ran the command (main session or subagent), the trace directory, the duration from the skill's first invocation since its last logged result, tokens in that window, the PRs it created or merged, and the SKILL.md sha.
- **Outcome:** each PR is checked on GitHub through `gh-drew`, when the row is written and again daily: merged and clean for 7 days passes; reverted or hot-fixed within 7 days (a fix that names the PR as the cause), red CI on the merge commit, or closed unmerged fails. Snapshots go to `agent-work/_outcomes/prs.jsonl`.
- **Corrections:** the SessionEnd hook `skill-run-settle.sh` reads the operator's next message after each run, and interrupts during it, and writes a judgment to `skill-run-events.jsonl` (layer `operator`). Quotes stay in that local file; climb exports carry a transcript pointer. Subagent runs stay unknown. The same hook runs the daily outcome join and settles Codex sessions.
- **Scoreboard:** reads only these ledger files on each host over ssh (`SKILL_SCOREBOARD_HOSTS` overrides the list) and orders signals as the climb ranks rewards: outcome, corrections, brief-judge score, then the author's claim. It draws its charts with `viz` and falls back to the small renderer in `skill_ledger/core.py` when node or viz is missing.
- **Lead scorecard:** per local day, corrections, guard refusals from `agent-work/_guards/*.jsonl`, revert and rollback PRs by drewstone, incidents with time to detect and recover (`_lead/incidents.jsonl`), and decisions waiting on Drew (`_lead/decisions.jsonl`).

## skills

List installed skills or check the discovery catalog budget:

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

For usage, run `traces skills --since 30d`: it counts each skill's Claude Code loads and Codex `SKILL.md` reads across every local session, with no model call.
`traces skills --unused --since 30d` lists installed skills with no use, the candidates to delete.
