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
A scheduled run of `benchmark-production.yml` or `create-waterfall.yml` that is in progress is refused (exit 1, logged as `refused`) before anything changes; company-01 approved this.
A `workflow_dispatch` run of either, a scheduled one that has not started (it has measured nothing, and such runs held the production deploy lock), and a scheduled run of any other workflow stay cancellable. A read that fails refuses.

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
Plain is the default everywhere. ; emoji squares are opt-in, for a chart that needs them.

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

## run-jobs-watch

`run-jobs-watch [-v] <run-id> [owner/repo]` watches a GitHub Actions run at the job level (default repo `tangle-network/agent-container`).
It exits 1 on the first job that concludes anything other than success or skipped, and prints that job's link.
It exits 0 when the run completes and prints the run's conclusion.
It retries transient read errors and exits 2 after 5 failed reads in a row.
Use it for deploys: a run-level watch misses a failed job while the run waits on a later one.
Deploy 39274359094 failed its host-agent rollout at 15:30Z, then stayed `waiting` for 47 minutes.
Run it as a tracked background task, so its exit reaches the session.
`--require-job <name>` exits 3 unless that job itself concluded success: a deploy can conclude success while every deploy job was skipped as superseded (39313450494). For deploys, pass `--require-job "Deploy to Production"`.

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

Merges every green agent-container PR into develop, and every green PR in the other product repos into their default branch (below). The agent-container instance runs every 2 minutes on drew-gtr-pro (`host/agents/merge-on-green.timer`), as drewstone through `gh-drew`, so its merges fire develop CI and release automation like any merge. Its open-PR read goes through `gh-read`, so the heaviest GraphQL query in the fleet does not spend drewstone's quota.

A PR merges when it is not a draft, not conflicting and not a release branch; Fast Checks, Build and Type Check succeeded on its head; no check failed; no unresolved review thread opens with P0 or P1; it has no `hold` label or hold phrase ("do not merge", "merge only after"); and its head is at least 2 minutes old. The merge pins that head (`--match-head-commit`). Failed, missing or skipped gates leave the head unchanged for its author to diagnose and fix forward. Only a conflict reported by GitHub permits merging develop into the branch; a conflict git cannot resolve gets one comment per head. gh-drew's Codex review check runs on each merge without waiting (`GH_DREW_REVIEW_WAIT=0`), so a PR whose review is still running or has an unanswered Codex finding is refused and tried again on the next tick.

```bash
merge-on-green --dry-run                 # print decisions, merge nothing
cat ~/.local/state/merge-on-green/status.md       # what each open PR waits on
cat ~/.local/state/merge-on-green/ownership.md    # org-wide aged PR ownership, from the primary timer
tail ~/.local/state/merge-on-green/decisions.jsonl
```

The primary timer also passes `--owner-org tangle-network --owner-org drewstone`. Before the merge queue's probe, it searches both owners for every open PR aged at least 24 hours, reads all comment pages, and records the complete sample in `ownership.json` and `ownership.md`. The two org searches use the owner's visibility through `gh-drew`: the machine reader cannot see every private repository. Comment reads use `gh-read`, falling back to the owner only for permission failures. A trusted owner/member/collaborator comment has separate `Owner:`, `Blocker:`, and `Next action:` lines. This establishes assignment text; the closer still verifies that the named lane is live and receives the handoff. The closer closes a PR only with supersession proof; a PR whose remaining precondition is a decision or confirmation owed by Drew or a lead stays open and is routed to that lead. Missing assignments go to `op-company:pr-closer` through Fleet's durable inbox when the breach set changes; the initial status, changed breach sets and clearance notices are deduplicated after durable acceptance. The sweep refreshes within the timer's half-hour budget; incomplete searches and failed reads leave a visible `ownership-error.txt` beside the last successful snapshot. `--owner-only` runs this sweep without touching the merge queue or security settings; add `--dry-run --state-dir /tmp/mog-owner-proof` for read-only GitHub verification without an inbox notice. Archived repositories stay read-only: their PRs are listed as `archived: read-only, no action` and excluded from actionable alerts. The report retains the total aged and strict unassigned counts, so this operational exclusion does not silently change a task that included archived PRs. The sweep never comments on PRs, removes holds, or changes merge eligibility.

The PR list reads review metadata; full threads and review summaries are cached by
repository, PR, head and review activity. Resolution/reopening, original-comment edits,
reply counts and summary edits invalidate the cache. Drafts, release branches and
author holds need no full review read. A merge passes its fresh per-tick response to
`gh-drew`, which still runs its normal review and author-hold checks; manual merges
continue to read live. Secondary limits defer the queue until `Retry-After` (or an
increasing delay) has elapsed, then retry the same PR first.

A commit pushed to a branch after its PR merged never reaches the base on its own. Each tick reads the PRs merged in the last 6 hours; for a branch that moved since, with no open PR on it, `git cherry` in the merge mirror keeps the commits whose patch the base lacks, and the bot opens one follow-up PR from that branch ("<title> (commits pushed after #N merged)") and comments on #N. Judged (PR, head) pairs are kept in `stranded.json` in the state directory.

Each tick logs actual GitHub HTTP calls, remaining quotas, cache hits/misses and any
deferral to the journal and `ticks.jsonl` in the state directory. It includes calls
inside `gh-drew`; API debug traces stay in memory. Use `--dry-run --state-dir DIR`
with a separate directory for read-only cold/warm comparisons.

To keep a ready PR open, add the `hold` label and a comment that says why: the precondition and its owner. A `hold` that no comment explains (a comment saying hold or held, from 10 minutes before the label onward) or body hold phrase explains is released after 30 minutes, with a comment naming who added it and when, and the pass records `hold-expired` in its decision log. The read that checks this runs only for held PRs and is cached until the PR changes.

### The other product repos

Every other repo in `host/agents/merge-on-green.repos` (the product stack and the agent apps) runs its own `merge-on-green@<repo>:<base>.timer` every 5 minutes on drew-gtr-pro, with `--base` set to that repo's default branch and state under `~/.local/state/merge-on-green-org/<repo>/`. Its gate is every check on the head (`MERGE_ON_GREEN_REQUIRED=*`: success, neutral or skipped; any red or pending check waits). Most of these repos run no PR CI, so a head with no checks merges only when gh-drew finds a passed beelink-gate receipt for that exact head (`GH_DREW_REQUIRE_RECEIPT=1`, the same check discovery-lab and agent-runtime always get); a refused head is asked again after 10 minutes. Drafts, holds, review threads and conflicts work as above. It uses a merge commit when the repo allows one, else squash. A PR that waits for Drew (pricing, public claims) carries the `hold` label. Each tick first runs `--probe`, a 2-point GraphQL read of every open PR's head, draft flag, labels, check rollup and update time; the full read (about 28 points at `MERGE_ON_GREEN_PAGE=25`) runs only when that changed, every 30 minutes while a ready PR is open, and hourly otherwise, so the inventory stays inside tangletools' shared `gh-read` quota.

Both timer services set `MERGE_ON_GREEN_SECURITY_UPDATES=1`. The existing bot checks security alerts and Dependabot security updates daily and enables either setting when disabled. Its per-repo `security-updates.json` records the verified result. Dry runs report needed changes without writing settings. Dependabot PRs use the same head checks, reviews, holds, and receipts as other PRs. A settings error is reported and retried without holding otherwise mergeable fixes.

The timer inventory owns release-slot policy: a `slot` field after an instance marks a repository whose default merge deploys. On those repositories, a bot-authored PR receives `hold` on first sight and whenever its head changes; any earlier grant is cleared. When it adds `hold`, it comments why on the PR, so a slot hold never reads as a forgotten one. An operator must grant that revision a slot with `release-slot-granted` and remove `hold` before the normal gate can merge it; the grant label is checked on its own, so removing `hold` alone never merges a bot PR. The reviewed head is persisted per PR. Every slot hold is recorded in the existing decision log. Dry runs make no label changes. Manual invocations read the same inventory.

```bash
# Install or add a repo: link the template from the durable checkout, then enable one timer per line.
ln -sf ~/code/dotfiles/host/agents/merge-on-green@.service ~/code/dotfiles/host/agents/merge-on-green@.timer ~/.config/systemd/user/
systemctl --user daemon-reload
grep -v '^#' ~/code/dotfiles/host/agents/merge-on-green.repos | while read -r i policy; do systemctl --user enable --now "merge-on-green@$i.timer"; done
merge-on-green --repo tangle-network/gtm-agent --base master --state-dir /tmp/mog-dry --dry-run   # what one repo would do
cat ~/.local/state/merge-on-green-org/*/status.md                                                   # what each open PR waits on
```

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
`beelink-gate --report 24` reads both hosts' records and current process/cgroup
CPU samples. Add `--json` for per-gate wait, wall and phase timings, sample
coverage, runnable threads and cgroup quotas; add `--since <UTC timestamp>` for
an after cohort. Timing percentiles use nearest rank and select completed,
admitted gates by inferred submission time (receipt finish minus wall and
cumulative admission wait), separately by repo and gate class. Passed-only
figures and exclusions remain visible. Pending gates and time before recorded
remote waiting are not in those percentiles. A missing host is partial, never
zero. CPU samples are current observations; cgroup rows overlap and must not
be summed. Process accounting excludes short-lived tasks, with coverage and
unattributed CPU reported.
`admission_wait.summary.tempfail` separates explicit capacity reasons from
noncapacity exits and unknowns. A command's exit 75 is `command_tempfail`, not
capacity evidence. Missing historical reasons stay `unstated`; retained log
diagnoses do not rewrite native observations. Disk policy and legacy-drain
uncertainty stay unknown, and terminal reasons do not extend admission timing.
The same sample retains up to 64 `legacy_gate_members`, including idle processes
that can hold the transition drain but disappear from the top-CPU list. Coverage
reports the observed and retained counts; group rows include kernel population
events and current/maximum memory. This reads no arguments or working directories
and performs no extra process scan; unreadable or exited processes remain unknown.

Every gate class runs as the caller's unprivileged UID in a SYSTEM-managed
unit beneath the top-level `beelinkgate.slice`. Its CPU and IO weights (100, the
same as runner and user slices), normal quota and normal/dev memory limits have one source:
[`host/cgroup/beelink-gate-policy.json`](../../host/cgroup/beelink-gate-policy.json).
The maintained host installer renders and checks that policy through the host
role; no runner restart or process migration is needed. Per-gate unit counts do
not multiply the aggregate weight. Cancellation stops the owned system unit and
its descendants; retained old user units keep their original cancellation path.
Attach and cancellation share the bounded manager record reader. A genuinely
absent record selects the retained user manager; an unsafe or unreadable record
refuses with TEMPFAIL. Status reads are bounded and use the recorded manager.
Missing sudo authority or unverified containment refuses work rather than using
an unprioritized fallback. Receipts retain the actual cgroup path, system manager
and unit name.
Probe-triggered cache recovery re-executes the immutable probe source in the
same managed slice, with a bounded synchronous lifetime and the same PSI/drain
checks before scanning or pruning. A failed launch cannot recover outside it.

Host probes retain fixed per-attempt phase and exact command-exit diagnostics
for Windows policy lookup and the remote probe. Known source-generation or
transport-deadline failures retain their nested status. Raw stderr stays discarded:
SSH exit 255 and a successful command without a protocol line still have an
unknown underlying cause. No stderr reader, raw-output file, extra transport call,
retry, deadline or admission change is introduced. A later successful SSH call
does not explain a prior probe failure.

Admission reads host CPU PSI `some avg10` against the existing host limits
file's `max_cpu_pressure`. Caller overrides may lower that ceiling, never raise
it. Normal, light, dev, urgent and starved gates share this hard guard. Missing
or malformed PSI/limits evidence refuses admission; load average is context
only. Quotas, cpuset, affinity and active slots inform the default worker
forecast, never permission to bypass host PSI. Explicit worker overrides retain
their existing semantics. The guard is rechecked before fetch; an admitted
install or command finishes normally.

The host policy also lowers retained raw gate groups so already-running old
sources yield without moving or killing them. A new managed class cannot begin
while its legacy kernel group is recursively populated or an old user gate unit
is active. Unknown drain evidence refuses. New submissions reject retained old
source and require restaging through the maintained CLI. Empty legacy groups
are an observed handoff boundary, not a claim that arbitrary externally pinned
old scripts can never run again. Old and new caps are separate during transition;
there is no invented combined allowance. IO weights are configured policy;
a kernel can expose IO statistics and pressure without a weight interface.
The installer and admission report `UNSUPPORTED` for that interface while still
requiring configured systemd IOWeight and effective CPU/memory policy. The CPU
report distinguishes absent and unreadable interfaces. Device bandwidth
priority remains unproved until measured.

Receipts measure frozen installation separately. A compound gate command can
record its own spans in `$BEELINK_GATE_PHASE_FILE`: append one line
`<phase> <start> <end>`, where phase is `typecheck`, `prerequisite_build`,
`canonical_typecheck` or `tests`, with both times from
the same monotonic clock in seconds. Parallel spans are unioned per phase;
they are nested in command time, not extra wall time. These are caller-declared
phases, not an inference from a command's spelling. Missing historical or
unreported phases stay null, rather than becoming zero. Selected preflight's
legacy `typecheck_s` covers prerequisite builds plus canonical typechecks;
`prerequisite_build_s` and `canonical_typecheck_s` expose those child spans.
The report's `performance.phase_labels` describes each caller span, and phase
coverage counts each independently. Child spans are not inferred from historical
combined measurements or added to that outer span. Fetch and cleanup
timings are also retained. Cache pruning records its tree-walk count; it measures
after sparse maintenance and again after each eviction. The removed pre-sparse
size is reported as unmeasured. Reporting lives in `beelink_gate_report.py`, timing
populations in `beelink_gate_metrics.py`, and the bounded read-only CPU sample
in `beelink_gate_cpu.py`; the shell owns transport and execution.

The optional `frontend_requests` report field measures each CLI invocation after
source bootstrap, separately from native placement timing. Its private local
envelope is named on stderr as `frontend_observation`; one caller monotonic clock
partitions setup, reserve lookup/setup, placement probing/waiting, staging,
submission, attachment, result reading, retry wait and reservation cleanup.
These are elapsed phases including check/transport overhead, not exclusive causes.
Attachment overlaps native waiting and execution. Never add it, carried placement
age, or multiple native receipts to obtain request latency.

The retry wrapper delegates writes to one exact child at a time; only its outer
finalizer can complete the request after cleanup. Every newly allocated gate ID
gets an ordinal; reconnecting to that ID keeps its ordinal. A separate manual
`--attach` has its own request and an unknown original-request association, and
creates no native gate. A bounded, sanitized pre-submit prefix rides on the
existing staging RPC and is bound to the exact staged source and job ID. It
contains no private writer capability and is always partial: later caller return
and cleanup are unknown remotely. Local finalized records are available only on
the reporting caller. The report joins by request, ordinal and exact gate ID,
and obtains native exits only from matching canonical receipts.

Missing/source-skewed/conflicting snapshots, open or failed writers, unsupported
local primitives and expired/no-ID population stay unknown. Observation IO uses
the metrics owner's serialized atomic files and a short `timeout`/`gtimeout`
bound; an observation failure cannot change the gate result or policy. Private
records reuse the existing job owner's retention age, preserve open records, and
cap each observation at 64 IDs and each local read at 4096 retained directories.
Truncation and invalid-selection coverage are explicit. The implementation uses
portable Python/Bash primitives for callers; Mac behavior requires a real Mac
flow before claiming proof there. Native throughput cohorts and legacy latency
definitions remain unchanged.

`beelink_gate_disk.py` owns `disk_observation` in each receipt and the report's
`disk` field. Its bounded `statvfs` sampler covers admission through local cleanup,
the end store scan and the checkout release; it stops before the global LRU reclaim,
which is outside that boundary. `final_boundary` names where it stopped:
`after_checkout_release_before_cache_reclaim` normally, `before_checkout_release`
when a watchdog or a missing cache root kept the lock, and `unreached` when the
observer ended earlier (deadline, termination or lost coverage). `release_checkout_before_reclaim`
in `beelink-gate-lib/install.sh` owns that order. Filesystems are deduplicated by device and filesystem
identity; checkout, pnpm, npm and a verified local Docker root are aliases, never
additive disk use. Paths open with `O_PATH`, so a root-owned non-listable Docker
root still yields kernel identity; `directory_readable` reports listing permission
separately. The local Docker root is resolved before the baseline sample and
published as `docker.filesystem_identity` (`pinned_before_baseline`, `device`,
`fsid`, `captured_monotonic_s` at or before `start_monotonic_s`) in `ready`, live
and final observations, byte-identical unless the identity changes. Every sample
re-resolves the pinned root path, and the post-stop `collect` repeats that in a
child bounded by the Docker query timeout; a remount, replacement or read error
turns the identity `unknown` and marks its row `identity_changed`, which never
qualifies. The daemon's endpoint and root are queried only at the start and end,
so a mid-window data-root switch that is reversed before the end is not seen.
Docker usage accounting stays asynchronous, under `docker_usage`. Available bytes use `f_bavail`; free bytes also show `f_bfree`
including reserved blocks. Coverage includes sample counts, gaps, read errors,
termination and unavailable paths. Samples with read errors, missed intervals or
gaps beyond the owner's bound stay out of the qualified subset. Interval and gap
bound belong to that module. One asynchronous progress writer receives detached
snapshots, with at most one write in flight and no backlog. Sampling continues
while a write is slow and while the writer drains at finish; write errors remain
unqualified. The writer joins before the final synchronous publication so an
older progress snapshot cannot overwrite it. If a writer exceeds the existing
stop grace after all native metadata children finish, only the observer exits,
leaving incomplete progress. The ready handshake precedes checkout work; stop signals use a pidfd
and captured PID/start-time/parent identity, never a reusable PID alone. A
cooperative stop marker and the module-owned grace bound keep finish bounded
even when pidfd is unavailable; an observer that cannot be reaped leaves partial
state and stays out of p99.

This is sampled host highwater, affected by concurrent gates, CI, Docker and
reclaim, not an exact transient peak or attributable per-gate allocation. The
report retains the last twenty admitted rows per host with missing history as
unknown. `sampled_highwater_p99_bytes` is the whole-twenty p99 and stays null unless
all twenty rows qualify. `qualified_subset_p99_bytes` names the subset's maximum
explicitly. `observed_highwater_lower_bound_max_bytes` includes numeric lower
bounds from partial rows; each record retains its raw numeric observation even
when unqualified. Observed, qualified, unknown and missing-history counts remain
separate. None is an assured transient peak, and a low qualified subset cannot
justify lowering a floor. The floor stays unchanged until representative
observations support a change. Existing
bounded `du` scans retain allocated per-path bytes before fetch, after install
and at the end; the redundant post-checkout scan moved to the end without adding
a tree walk. Hardlinks count once in argument order, and shared-store growth
includes other gates. Failed installs retain the conservative cold reserve.
No-install/light directory sizes stay unknown. Docker queries are bounded,
read-only and optional: remote/unreadable/changed contexts remain unknown, and
`docker system df` reports logical daemon usage, not allocated filesystem bytes.

An `auto` gate that both Beelinks refuse, or that has waited `BEELINK_GATE_SANDBOX_AFTER` (default 5m), runs the
same command on a Tangle sandbox through [`beelink_gate_sandbox.mjs`](beelink_gate_sandbox.mjs): one managed process
job on an 8 CPU / 8 GB box with the repo's `.nvmrc` Node, a frozen install and the gated commit, at most
`BEELINK_GATE_SANDBOX_MAX` (4) boxes live. Its receipt is a `beelink-gate` commit status on the gated SHA
(`exit= mode= class= gate=`), which `--receipt` and gh-drew read from any host; a copy on a Beelink feeds `--report`. Name `sandbox` as the host to place there directly. It needs
`~/.config/tangle/beelink-gate-sandbox.key`; without one, or when the platform refuses the box, the gate keeps
waiting for a Beelink. `BEELINK_GATE_SANDBOX=0` turns it off. `node beelink_gate_sandbox.mjs warm <repo-url>` builds the repo's
store-only warm source box (Node, pnpm store, git objects); gates then start from its newest snapshot
(agent-container: install 23 s instead of 72-140 s) and fall back to a cold box if the restore is refused. `beelink-gate --queue` lists every live gate on both
Beelinks and in sandboxes, waiting gates first with the stage they wait in, then `QUEUE waiting=… running=…
wait_p90_2h_s=…`.

Host release priority is a hard admission guard. The existing host limits
file's `release_critical=1` blocks new normal, light, dev, urgent and starved
gates. Its owning release/host operator keeps the hold through the owned Build,
coordination gap and publisher/deploy terminal result; it has no automatic
expiry. Unknown release evidence, including malformed or unreadable release
policy, is logged and falls back to host PSI admission and the existing disk, lock and slot checks.

[`beelink_gate_release.py`](beelink_gate_release.py) owns the release owner's
exact workflow/job priority list and joins active GitHub job identities to native
ADC release/deploy Worker identities. Other jobs on the same runners keep normal
gate priority. A cached classification requires the same Worker PID/start ticks,
a unique complete API join and the native system setup step strictly after Worker
birth. Only a positively matched critical job holds admission. Changed Workers,
missing evidence and overlapping clock intervals are recorded as unknown and
use the unchanged preexisting admission path; they never waive its checks.
This is temporal evidence, not a native job UUID claim. Arguments, environments
and protected runner logs are never read. The shared cache policy is exported by
that owner; the existing receipt report shows its last sanitized decision, age,
API work and explicit unknowns without refreshing GitHub. `admission.sh` bundles
this owner once alongside the existing Windows update guard.

Running gate commands and installs finish normally. Older immutable staged
scripts retain their prior policy, so the operator keeps its existing pressure
fence until they drain. A mixed old/new source bundle refuses before cache work.

It uses cached, detached checkout slots per host/repo in `~/.cache/beelink-gate/` and
locks each checkout through the install and command. It cleans the prior run's
outputs, fetches the requested commit with complete history, and runs a frozen
pnpm or npm install against that user's shared package store.
Non-login gates expose `~/bin`, `~/.local/bin`, `~/.cargo/bin` and `~/.foundry/bin`,
in that order, before inherited PATH. Tools must already be installed.
Native admission observations partition elapsed checks, host PSI, capacity-writer
and capacity-lock waits, FIFO turns, checkout locks and host slots using one
monotonic clock. The optional `timing.admission_wait` records
`remote_start_to_lock_slot_admitted_s` separately from legacy `waited_s`: the
legacy counter starts after the first remote PSI/floor/window checks, and includes
unattributed cumulative launcher `placed_wait_s`. Observations begin after request
identity validation; earlier setup and no-ID/frontend time remain unobserved.
Checks include probe/instrument overhead; these are elapsed categories, not proof
that PSI alone caused a delay. Post-admission rechecks remain wall/precommand time.
The existing report also reads compact observations in retained job directories,
including refused, replaced and signal/cancel-marker outcomes without adding
completed gates. Its `admission_wait` field shows per-host retained/missing
coverage; UTC begin selects the window, with labeled submitted/directory timestamp
fallback for missing observations. Expired/no-ID history is unknown. Interrupted
or failed measurements retain a partial prefix and unknown tail; open intervals
are never extended to a guessed exit time. Complete coverage also requires a
confirmed terminal observation; an admitted snapshot alone remains partial.
Observation failures cannot change the
gate's policy or command exit.
Normal frozen-install gates share Turbo archives across their checkout slots in
`~/.cache/beelink-gate/.turbo/<host>/<owner>/<repo>/normal/<script-node-version>`.
The existing gate cache cap and LRU count these bytes alongside checkouts. Shared
leases permit concurrent consumers; eviction also requires every recorded managed
unit to be absent or kernel-empty. Unknown unit visibility keeps the pool, including
after its Bash owner dies. Dev, light and no-install gates retain the private
`.git/beelink-gate-turbo/<script-node-version>` cache and do not feed the normal pool.
Old private archives are not imported into it. Target-local `TURBO_CACHE_DIR`
overrides remain supported, including an explicit `env TURBO_CACHE_DIR=...` in
the gated command. A launcher's path on another host is not forwarded.
Ship mode retains its existing install/runtime and cache ownership.
`node_modules` and generated working-tree outputs are cleaned;
Turbo owns task inputs, outputs and cache policy. The gate enables
`TURBO_RUN_SUMMARY` unless overridden and snapshots current-command summaries
before releasing the checkout. Receipts and both report formats expose
`timing.turbo_cache`: source, run observations and unreadable-summary count.
The requested directory comes from the gate environment; a command's Turbo
flags can override it, so this field alone does not establish actual placement.
Counts describe tasks per invocation, including nested runs, rather than unique
tasks or passing evidence. An empty or unreadable summary does not prove a check
ran or passed; the command exit remains authoritative.
Use `--no-install` only for dependency-free checks, such as docs content or
structure checks. The gate still fetches and verifies the exact SHA, and its
receipt records `install=no-install`.
Different repos and separate checkout slots can gate in parallel; each slot remains locked. The cache is independent of main
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
free space minus live lifecycle reservations minus its own install reserve would fall below the lifecycle
admission minimum exported through Tangle Tools' `fleet/disk_policy.py` (`admission_headroom`). That minimum
is the root's base floor; large producers reserve their own bytes, so a gate never pays a floor sized for them,
and a local `disk_floor_gib` is retired and ignored. The refusal names free, reserved, requested and the
minimum. The lifecycle installer derives the protected
applied export from its admission owner and validated configuration; Fleet's higher alert buffer remains advisory.
Every account, including runners, reads only that protected publication. The installer validates private inputs
and fences readers before a supported config change; it never requires runner access to private home/config paths. The existing
`--disk-floor-bytes` query reports that effective policy from the requested host: local same-host reads
need no SSH, and remote reads use the existing bounded staged transport without recursive routing; an unavailable owner
refuses growth. A fixture host (`tests/beelink-gate.test.mjs`) names its own host inputs: `BEELINK_GATE_DISK_POLICY` (a provider of the same contract, `tests/fixtures/beelink-gate/disk_policy.py`), `BEELINK_GATE_RESOURCE_POLICY`, `BEELINK_GATE_CGROUP_ROOT` and `BEELINK_GATE_SELF_CGROUP`; a named policy may belong to the running account, and real hosts never set them. A second floor
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
cache and TEMPFAIL behavior. Floor refusals do not evict caches: the archival
storage lifecycle owns capacity recovery. Submitted gates and attached runs
retain their existing lifecycle.
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
Host CPU PSI admits it like every other gate. It has its own
host slots (`BEELINK_GATE_LIGHT_SLOTS`, default 2) and its own
`<repo>@light` checkout, so it never waits behind a normal gate. It holds for
at most 10 minutes. A light command that uses more CPU than it declared fails
the gate with "LIGHT GATE OVER BUDGET"; run that check as a normal gate.
Normal gates are admitted exactly as before.

`auto` re-places a waiting gate. If the beelink it chose does not admit it (repo checkout, host slot and host PSI) within `BEELINK_GATE_REPLACE_WAIT` (default 60s), the gate gives that host back before any checkout work. The launcher then probes both hosts again and goes to whichever admits it first, and the receipt's `waited_s` covers every placement. A named beelink keeps waiting where it is.
`--urgent`, for a fix to a red default branch, goes ahead of every waiting gate for the next free checkout of its repo and the next free host slot. It polls faster, and other waiters step aside while its marker is live. It cannot raise the host PSI ceiling.

```bash
beelink-gate --light auto git@github.com:owner/repo.git <full-sha> -- bash -c 'bash -n bin/tool && python3 -m pytest -q tests/test_tool.py'
```

## climb-log

`climb-log` is a tangle-tools command: see [tangle-tools climb-log/README.md](https://github.com/tangle-network/tangle-tools/blob/main/climb-log/README.md).

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
- **Outcome:** tangle-tools `packages/skill_pr_outcomes` owns the PR stability/serving contract and atomic current cache at `~/.local/state/skill-outcomes/pr-signals.json`. Scoreboard and row writes read this materialized state and queue due refs without GitHub calls; the existing daily/explicit `skill-run-log --join` refresh uses that owner. Named CI is compared with its parent, mentions are separate from causal fixes, and incomplete/stale coverage remains pending. Known unprobed repositories make no served claim. Original-goal acceptance stays `UNKNOWN`. Historical `agent-work/_outcomes/prs.jsonl` journals are retained untouched and are not scanned by current outcome reads. Read the owner README for policy, probes and freshness.
- **Corrections:** the SessionEnd hook `skill-run-settle.sh` reads the operator's next message after each run, and interrupts during it, and writes a judgment to `skill-run-events.jsonl` (layer `operator`). Quotes stay in that local file; climb exports carry a transcript pointer. Subagent runs stay unknown. The same hook runs the daily outcome join and settles Codex sessions.
- **Scoreboard:** reads only these ledger files on each host over ssh (`SKILL_SCOREBOARD_HOSTS` overrides the list) and orders signals as the climb ranks rewards: outcome, corrections, brief-judge score, then the author's claim. It draws its charts with `viz` and falls back to the small renderer in `skill_ledger/core.py` when node or viz is missing.
- **Lead scorecard:** per local day, corrections, guard refusals from `agent-work/_guards/*.jsonl`, revert and rollback PRs by drewstone, incidents with time to detect and recover (`_lead/incidents.jsonl`), and decisions waiting on Drew (`_lead/decisions.jsonl`).

## have

`have` is a tangle-tools command: see [tangle-tools have/README.md](https://github.com/tangle-network/tangle-tools/blob/main/have/README.md).

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

## traces

The [upstream npm package](https://github.com/tangle-network/traces#install) owns this command and its [installer](https://github.com/tangle-network/traces/blob/main/install.sh).
Deploy a qualified package with that installer, using `--prefix "$HOME/.local"` when needed; disable npm lifecycle scripts when deploying a prebuilt CLI.
`traces --version` names the installed artifact independently of any source checkout. Keep the package's bin directory ahead of Homebrew's unrelated command.
This installer retires only its former links to the checkout wrapper; it preserves npm links and independently managed files.

## reviews-index

`reviews-index` is a tangle-tools command: see [tangle-tools reviews-index/README.md](https://github.com/tangle-network/tangle-tools/blob/main/reviews-index/README.md).

