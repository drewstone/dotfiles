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

## gh-read

Run a read-only `gh` call as the `tangletools` machine account (`TANGLETOOLS_GH_TOKEN`), which has its own 5,000-call core quota.
Automated fleet reads use it so they never spend drewstone's quota, which merges, PR writes and deploy dispatches need.

- It accepts `gh api` GETs, GraphQL queries without a mutation, `search`, and `list`, `view`, `status`, `checks` and `diff` of `pr`, `issue`, `run`, `release`, `workflow`, `repo`, `label`, `cache` and `ruleset`.
  Everything else exits 3 before `gh` runs; use `gh-drew` for it.
- It runs through `gh-drew`, so the identity check and log format are the same.
  Calls are logged to `~/.local/state/gh-read/` (`GH_READ_LOG_DIR`), apart from Drew's.
- Reads stop under 500 core calls left (`GH_READ_MIN_CORE`), so the auto-approver keeps its share of the same quota.

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
