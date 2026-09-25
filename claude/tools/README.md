# Claude Tools

Custom CLI tools for managing Claude Code. Installed via `install.sh` which symlinks tools to `~/bin/`.

## agent-doc-lengths

Measure Markdown and skill size across the dotfiles repo:

```bash
agent-doc-lengths --top 25
agent-doc-lengths --all --format markdown
agent-doc-lengths --format json
```

Reports lines, words, chars, approximate tokens, skill-description size, category totals, largest files, and threshold findings.
Skill descriptions default to a 96-character limit because every description competes for the discovery context before a skill is selected.

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
