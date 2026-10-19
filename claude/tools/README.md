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
and Python for read-only session lookup. Deploy tangle-tools `acct run` support
first. Existing brokers and running lanes keep their current processes.

## gh-drew

Run `gh` as `drewstone` with the token from the environment or the devops vault.
Below 150 core calls left (`GH_DREW_MIN_CORE`), it refuses reads and keeps the rest for writes.

Before `pr merge`, `--auto` included, it reads the PR's head, review threads and comments in one GraphQL query:

- An unresolved review thread that a Codex reviewer started and no person has answered refuses the merge, naming each finding's `path:line`, title and link.
- A Codex review running on the head is waited for, up to `GH_DREW_REVIEW_WAIT` seconds (default 600), then refuses with exit 75.
- A PR that opened or turned ready under 30 s ago, with no Codex comment yet, waits out those 30 s: Codex comments 12 to 16 s after either.
- No Codex comment, a usage-limit comment, a failed review, or a finished review whose findings are all answered or resolved carries on.
- `GH_DREW_REVIEW_OVERRIDE=<reason>` merges without the check and logs the reason. A read that fails refuses.

Before `run cancel <id>`, or a request to `repos/<o>/<r>/actions/runs/<id>/cancel` or `force-cancel`, it reads the run's event and workflow.
A scheduled run of `benchmark-production.yml` or `create-waterfall.yml` is refused (exit 1, logged as `refused`) before anything changes; company-01 approved this on 2026-10-19.
A `workflow_dispatch` run of either, and a scheduled run of any other workflow, stays cancellable. A read that fails refuses.

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

## gh-read

Run a read-only `gh` call as the `tangletools` machine account (`TANGLETOOLS_GH_TOKEN`), which has its own 5,000-call core quota.
Automated fleet reads use it so they never spend drewstone's quota, which merges, PR writes and deploy dispatches need.

- It accepts `gh api` GETs, GraphQL queries without a mutation, `search`, and `list`, `view`, `status`, `checks` and `diff` of `pr`, `issue`, `run`, `release`, `workflow`, `repo`, `label`, `cache` and `ruleset`.
  Everything else exits 3 before `gh` runs; use `gh-drew` for it.
- It runs through `gh-drew`, so the identity check and log format are the same.
  Calls are logged to `~/.local/state/gh-read/` (`GH_READ_LOG_DIR`), apart from Drew's.
- Reads stop under 500 core calls left (`GH_READ_MIN_CORE`), so the auto-approver keeps its share of the same quota.

## viz

Charts drawn to scale from data, for the terminal and for brief pages.
It reads JSON or TSV from a file or stdin, needs no network or packages, and prints the same bytes for the same input.

```bash
viz bars causes.tsv --total 171 --source "reliability endpoint" --asof 2026-10-10   # shares, and any (unaccounted) remainder
viz grouped success.tsv --target 95                    # cells may be ratios like 33/36: the bar is the rate, the label keeps the denominator
viz spark latency.tsv --unit s                         # one line per numeric column, with first→last, min, max and n
viz strip canary.tsv                                   # ✓/✗ cells on a time axis, the pass rate and the longest failing run
viz bars causes.tsv --total 171 --color emoji          # colored squares for a markdown chat; VIZ_COLOR=emoji sets the default
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

### Color in a markdown chat

Claude Code renders chat as markdown with about two text colors and drops ANSI escapes, but emoji keep their color.
`--color emoji`, or `VIZ_COLOR=emoji` in the environment, draws every chart with them; `--color plain` overrides the variable, and plain output is unchanged.
Plain is the default everywhere. Drew, 2026-10-11: "cut the emojis, i want depth, not toys"; emoji squares are opt-in, for a chart that needs them.

| Mark | Plain | Emoji |
|---|---|---|
| bar by tone | `█` | 🟩 good · 🟨 warn · 🟧 serious · 🟥 bad or crit · 🟦 accent or no tone · ⬜ remainder or unaccounted |
| series and groups | `█ ▓ ▒ ░` | 🟦 first · 🟪 second · 🟫 third, then status hues |
| status cell | `✓ ! ✗ ·` | 🟢 good · 🟡 warn · 🟠 serious · 🔴 bad · ⚪ no signal · 🔵 info · 👉 needs you |
| strip cell | `✓ ✗ ! - ·` | ✅ pass · ❌ fail · ⚠️ warn · ➖ skip · ⚪ no report |
| target | `┆` | 🏁 |

An emoji is two columns wide, so a bar holds half as many squares as a block bar has cells.
Each square stands for one round unit, the scale divided by the squares that fit and rounded up to 1, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 times a power of ten, and the footer states it (`1 square = 5%`).
A bar is its value in those units, rounded to the nearest whole square, so it reads to scale within half a square; a nonzero value keeps at least one square.
Stacks and waterfalls tile the same squares from rounded running totals, as their block forms do.
Paste a chart into chat inside a ```` ```text ```` fence, where its columns hold.

In emoji mode, `viz brief spec.json` prints the chat status as markdown to paste as it is: a bold headline with the decision and the hill's number, then 🎯 Focus, 📊 Evidence, 🛠️ Doing, 🧠 Learned and ⏭️ Next, with each chart in its own text fence.
The [brief kit](../skills/report/references/brief-kit.md#chat-status) lists the spec field behind each line; `--section` still prints whole sections.

An excerpt of the [example spec](../skills/report/assets/brief-example.json)'s status, from the [golden file](../../tests/fixtures/viz/brief-example.emoji.txt):

````markdown
**Pin Apple Pay to SDK 4.1 tonight and gate every deploy on a canary · time to restore checkout 0.6 h vs target < 1 h (from 9.2 h)**

📊 **Evidence**
**Payment success by day, card and Apple Pay**
```text
10-10  card      🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦    39,950/40,100 99.6%
       applepay  🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪              🏁      6,170/9,950 62.0%
scale 0–100% · 1 square = 5% · 🏁 SLO 99.5%
```

🛠️ **Doing**
🔴 **Apple Pay declines at the gateway** · Down since 10-10 21:05Z · Token format changed in SDK 4.2; 38% of Apple Pay attempts fail. · owner payments-lane · next: pin SDK 4.1, ship
````

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
Model selection uses `--model`, then `AGENT_ASK_MODEL`, then the workspace's saved model.
Text labels the existing `costUsd` as model cost and preserves tiny positive amounts.
When the API supplies `sandboxSettlement`, JSON retains that receipt and text shows its recorded agent-key Sandbox share separately.
`settledAt` confirms the ACK; a positive `consumedUsd` can still await ACK, and a null amount remains pending.
The recorded share may be capped or use the whole hold as a fallback; it is not an exact economic or total cost.
Exit codes match `gtm-ask`: 0 completed, 1 failed, 2 usage or config, 3 still running, 4 waiting on a decision.
The key is that app's operator key from `<APP>_OPERATOR_API_KEY`, else the one Tangle agent key `TANGLE_AGENT_KEY`, from the environment or `~/company/devops/secrets/agent-state.env`; the origin defaults to the app's production host and is overridden by `--origin` or `<APP>_BASE_URL` (HTTPS, or loopback HTTP).
An app that has not mounted the operator API answers that it does not serve it yet.

## gtm-ask

Hand an outcome-level ask to the production GTM agent (gtm.tangle.tools) and read back its result.
The [agent-ask GTM bar](../skills/agent-ask/references/gtm.md) says how a session phrases the ask and gates what comes back.

```bash
gtm-ask "Make on-brand Reddit ads for Sandbox; find our real logo, fonts and screenshots yourself"
gtm-ask --thread <id> "Revise: hold the policy ad"     # continue a conversation
gtm-ask --wait 0 "<ask>"                               # return once the turn is admitted
gtm-ask status <thread> --wait 30m                     # follow a running turn
gtm-ask file research/plan.md                          # read a vault file the agent wrote
gtm-ask --json --download ./assets "<ask>"             # one JSON object; save referenced asset files
```

It starts a new thread unless `--thread` names one, uses the workspace's saved model unless `--model` overrides it, and follows the turn through its stream, the replay route, then slow `/api/chat/running` polls.
The result comes from the persisted thread, not the stream: reply, failure notice, asset-version URLs, vault paths the turn created or edited, and open questions or Hub approvals.
Exit codes: 0 completed, 1 failed, 2 usage or config, 3 still running, 4 waiting on an approval or question.

The workspace defaults to `GTM_WORKSPACE_ID`, else Drew's "GTM Agent" workspace.
The key is a `gak_` operator key with `operator:read`, `operator:write` and `operator:run`, read from `GTM_OPERATOR_API_KEY` or that slot in `~/company/devops/secrets/agent-state.env` through dotenvx.
Each request, reads included, spends the key's allowance of 60 a minute and 1,000 a day.
The API itself is documented in gtm-agent's `docs/operator-api.md`.

## journeys-env

Run a command with an agent app's journey test identities loaded from the host's vault, and nothing else from it.
The `prove-journeys` skill uses it to record journeys with agent-app's `agent-app-journeys`.

```bash
cd <app checkout>                                     # holds journeys.config.mjs
journeys-env -- pnpm exec agent-app-journeys run journeys/core-path.ts
JOURNEYS_ENV_NAMES="A_EMAIL A_PASSWORD" journeys-env -- <command>   # names without a config
```

The names come from `agent-app-journeys env-names`, or `JOURNEYS_ENV_NAMES`.
Each is read from the first file under `~/company/devops/secrets` (`TANGLE_SECRETS_DIR`) that defines it, decrypted with `dotenvx get`, and exported into the command only; a name already set is kept.
It never prints a value, and exits 2 when a name is missing, empty or not a variable name.

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

## merge-on-green

Merges every green agent-container PR into develop. It runs every 2 minutes on drew-gtr-pro (`host/agents/merge-on-green.timer`), as drewstone through `gh-drew`, so its merges fire develop CI and release automation like any merge.

A PR merges when it is not a draft, not conflicting and not a release branch; Fast Checks, Build and Type Check succeeded on its head; no check failed; no unresolved review thread opens with P0 or P1; it has no `hold` label or hold phrase ("do not merge", "merge only after"); and its head is at least 2 minutes old. The merge pins that head (`--match-head-commit`). Failed, missing or skipped gates leave the head unchanged for its author to diagnose and fix forward. Only a conflict reported by GitHub permits merging develop into the branch; a conflict git cannot resolve gets one comment per head. gh-drew's Codex review check runs on each merge without waiting (`GH_DREW_REVIEW_WAIT=0`), so a PR whose review is still running or has an unanswered Codex finding is refused and tried again on the next tick.

```bash
merge-on-green --dry-run                 # print decisions, merge nothing
cat ~/.local/state/merge-on-green/status.md       # what each open PR waits on
tail ~/.local/state/merge-on-green/decisions.jsonl
```

To keep a ready PR open, add the `hold` label.

To give a release a clean CI window, pause it on drew-gtr-pro, where the timer runs. While paused, each pass still runs but merges only PRs labelled `release-critical`; version PRs (`changeset-release/*`) stay with release.yml, paused or not, and every other PR gets one line, `paused until … (reason): skipped #N`. A pause ends on its own at its `until`; `pause` refuses more than 120 minutes, so a longer hold is a new pause.

```bash
# A login shell puts ~/bin (gh-drew) on PATH, as the timer's unit does.
ssh drew-gtr-pro "bash -lc 'merge-on-green pause --minutes 60 --reason \"version PR #11196 CI window\"'"
ssh drew-gtr-pro "bash -lc 'merge-on-green status'"   # paused or not, reason, until, who, allowlist
ssh drew-gtr-pro "bash -lc 'merge-on-green resume'"   # ends the pause and the repo variable
```

From any host, the repo variable pauses the same way; it ends at its until or 120 minutes after it was set, whichever is first:

```bash
# GNU date; on macOS use $(date -u -v+60M +%FT%TZ)
gh-drew variable set MERGE_ON_GREEN_PAUSED -R tangle-network/agent-container --body "$(date -u -d '+60 min' +%FT%TZ) version PR #11196"
```

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
keep retained proof outside the cache. A repo keeps tracked paths its gated
commands never read out of the checkout by committing
`.beelink-gate/sparse-checkout` (`git sparse-checkout --no-cone` patterns), as
Discovery Lab does for `/pursuits/`. The gate sets the patterns before checkout and applies them to idle checkouts when
it prunes, before evicting any, and the receipt records `sparse`. A gate refuses before fetching when
beelink1 has less than 100 GiB or beelink2 has less than 162 GiB free on its
root filesystem. A second floor
check after installation keeps the requested command from starting if its
install consumed the reserve.

A gate that cannot start or prove its result now exits 75 (EX_TEMPFAIL), never
a red exit. That covers the Windows Update window, load that stayed over its
limit, a disk floor, no reachable beelink or readable update policy, and a
preempted or inconclusive preview. Its last line says when to ask again:

```text
beelink-gate: TEMPFAIL next_allowed=2026-10-11T09:30:00Z no beelink can start this gate
```

Callers retry at `next_allowed`. Any other non-zero exit is the command's own
failure or, with 2, a broken request.
Install-reserve hints and remote update-policy reads use the wall deadline in
`beelink-gate`'s `bounded_transport`, through GNU `timeout` or `gtimeout`. A connected
SSH session with an unresponsive WSL read cannot hold these lookups indefinitely.
A failed hint is reported as unavailable; the target still reads its own receipts
and enforces its disk floor. An unavailable update policy retains its existing
cache and TEMPFAIL behavior. Host probes can recover cache space and retain
their existing lifecycle, as do submitted gates and attached runs.
The same transport bound applies to staging the gate script and requesting
cancellation. A staging failure reports that submission was not attempted and
remote files may be partial. Cancellation keeps its existing retry loop within
an elapsed deadline and reports unconfirmed remote state unless the host
acknowledges cancellation. A transport timeout never writes a canceled receipt
or changes a submitted gate's hold; retry the reported cancellation command
when the host is reachable.

`--retry <minutes>` does that retrying: on exit 75 it waits until the
TEMPFAIL's `next_allowed` (at least 30 s, or 5 minutes when the line names no
time) and submits again, until the window passes. A TEMPFAIL for a lost
connection to a gate that is still running (`run beelink-gate --attach <id>`)
is re-attached after 10 s, not resubmitted, so it never starts a duplicate
gate; a re-attached `auto` gate that gave its host back is submitted again at
once, and with `--cancel-on-term` a stop cancels the re-attached gate too. A 75
without a TEMPFAIL line, such as a canceled gate or the command's own 75, is
not retried. Whenever `--retry` stops on 75, its last line is a TEMPFAIL line.

`--summary` ends a red exit (not 0 or 75) with the command's test counts and
failing tests, read from both output streams: the node test runner's spec
reporter (`ℹ tests` counts and the `✖ failing tests:` section) and TAP
(`# tests` counts and each `not ok` block). It caps the failing-test lines at
200 and prints the counts last, so a caller that keeps only the tail still sees
the cause.

```bash
beelink-gate --retry 60 --summary auto git@github.com:owner/repo.git <full-sha> -- node --test tests/
```

`--light` is for small checks such as a shell syntax check, a linter or one
test file. It installs no dependencies, gets no browser, and declares at most
`BEELINK_GATE_LIGHT_CPU` core-seconds of command CPU (default and maximum 120).
It is admitted up to 2.5x the host's cores rather than 1.5x. It has its own
host slots (`BEELINK_GATE_LIGHT_SLOTS`, default 2) and its own
`<repo>@light` checkout, so it never waits behind a normal gate. It holds for
at most 10 minutes. A light command that uses more CPU than it declared fails
the gate with "LIGHT GATE OVER BUDGET"; run that check as a normal gate.
Normal gates are admitted exactly as before.

`auto` re-places a waiting gate. If the beelink it chose does not admit it (repo checkout, host slot and load) within `BEELINK_GATE_REPLACE_WAIT` (default 60s), the gate gives that host back before any checkout work. The launcher then probes both hosts again and goes to whichever admits it first, and the receipt's `waited_s` covers every placement. A named beelink keeps waiting where it is.
`--urgent`, for a fix to a red default branch, goes ahead of every waiting gate for the next free checkout of its repo and the next free host slot. It polls faster, and other waiters step aside while its marker is live. It does not raise the load limit.

```bash
beelink-gate --light auto git@github.com:owner/repo.git <full-sha> -- bash -c 'bash -n bin/tool && python3 -m pytest -q tests/test_tool.py'
```

## climb-log

Writes and lints a project's climb ledger (`reports/climb/ledger.jsonl` in Discovery Lab, else `.agent/climb.jsonl`; [climb.md](../../docs/processes/climb.md#every-number-names-its-sample)).
A baseline or result that reports a number needs a `measurement` block naming its metric, unit, selection rule, `selectBy`, `n`, basis and window; a per-release number also names one `codeVersion` and its `deployedAt`, and a baseline row names its instrument and calibration.
`brief-judge`, `skill-scoreboard --climb` and `lead-scorecard --climb` append through it, and process-guard refuses shell writes into a ledger.
`check` also rejects, at any date, what a `merge=union` merge can get wrong: a split or interleaved line and a repeated row; `append` names a ledger that lacks the attribute.

```bash
climb-log schema                                   # the contract, with an example row
climb-log append --file row.json                   # check, then append; prints the id (refuses: nothing written)
climb-log check                                    # lint rows written since 2026-10-11; exit 1 on a failing row
climb-log hills --json                             # each hill's instrument and calibration verdict
```

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

## have

Answers "do we already have X?" before anyone says something is missing.
One grep for one spelling found nothing for a sandbox start-latency harness that existed as a directory of evals, two workflows disabled by hand and a task on the board.
`have` sweeps all of those at once and prints one ranked report.

```bash
have sandbox eval harness            # paths, scripts, workflows with state, content and tasks, best first
have --in widgets eval harness       # only repositories whose name or path contains "widgets"
have --offline otel span             # no fetch, no GitHub API
have --only workflows,boards canary  # run only these sweeps; --skip drops some
```

A term is stemmed and widened with synonyms, so `eval harness` also looks for bench, perf, latency, waterfall, canary, probe, ratchet and baseline.
Terms that name one idea share a concept, and a hit that covers more concepts ranks higher.
The report opens with `WHERE TO LOOK FIRST`, then lists each sweep; every hit carries its exact location:

| Sweep | Reads | Location printed |
|---|---|---|
| paths | `git ls-tree -r` of `origin/<default>` in every repository under the roots, after a `git fetch -q` (reused for 10 minutes) | `repo:dir/` with a file count and sample names |
| scripts | `package.json` scripts, by name or command | `repo:path/package.json   scripts.<name> = <command>` |
| workflows | workflow files on the default branch, then the GitHub API for state and the latest run | `repo:.github/workflows/<file>   disabled_manually; last run failure 2026-09-08` |
| content | `git grep -c --all-match -i` on the default branch: files with a word of every concept | `repo:path   N matching lines` |
| boards | the task and note sources named in the config | `tasks:<label> #<id>`, `notes:<label>:<file>:<line>` |

It never reads a working tree, so a stale or sparse checkout cannot hide a file.
A checkout with no `origin` is read at its local default branch and the report says so.
Clones of one repository count once.
A `NO HITS` report holds only for what its `searched:` lines list.
Exit status is 0 with hits, 1 with none, 2 on a usage error.

GitHub reads use `$GH` (else the config's `gh`, else `gh`) and cost one call per 100 workflows of each repository that holds a shown workflow, plus one per shown workflow for its latest run.
Answers are cached for 15 minutes under `~/.cache/have/` (`--refresh` rereads); `HAVE_GH_BUDGET` (default 60) caps the calls in one run, and a rate-limit or quota refusal stops them with the sweep marked unread.

### Config

`have` reads `~/.config/have/config` (or `--config FILE`, or `$HAVE_CONFIG`); with no config it searches the repository it is run in.
The file is local and untracked: it names the machine's roots and task sources, so it never belongs in this repository.
One `key = value` per line; a line that starts with `#` is a comment.

```text
root = ~/code                    scan this directory and the repositories up to `depth` levels below it
repo = ~/src/one-repo            one checkout
github = owner/name              a repository with no checkout here: tree and workflows by API
gh = gh                          the GitHub CLI command
depth = 2                        levels below a root (default 2)
exclude = */archive/*            skip checkouts whose path matches this glob
synonyms = soak, burn-in         words that stand for one another (repeatable)
tasks board = my-tasks --json    run with sh -c; prints JSON (a list of objects with id, title, state) or text in which each task starts at a line that begins with an id such as #12 or ABC-12
notes memory = ~/notes           search the .md and .txt files below this directory
```

`tasks` commands run as the user, so list only commands you would run by hand.
Directories whose names start with `.` or `_` are not scanned for repositories.

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
