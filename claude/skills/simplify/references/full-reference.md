# Simplify Full Reference

Use this reference when a simplification pass is more than a one-file cleanup.
The process is designed for repeated use on any repo, especially active PRs where the user asks whether there is anything else to abstract, modularize, or clean up.

## Mission

Ship capability-preserving simplification.
The output is a real diff with checks, or a clear "stop here" report with measurements.
Do not stop at advice if the next cleanup is safe and scoped.
Do not widen the current branch just because a larger cleanup exists.

## Phase 0: Orient

Run the repo's own orientation commands first.
When no repo instructions exist, use:

```bash
git status --short --branch
git log --oneline -10
git reflog | head -20
gh pr list --state open 2>/dev/null || true
```

Find the active PR and base branch when possible.
If there is a PR, read its current state before and after changes:

```bash
gh pr view <number> --comments
gh api repos/<owner>/<repo>/pulls/<number>/reviews --jq '.[] | {state, user:.user.login, submitted_at, body}'
gh api repos/<owner>/<repo>/pulls/<number>/comments --jq '.[] | {user:.user.login, path, line, body}'
```

For Tangle repos, use `gh-drew` where repo instructions require it.

## Phase 1: Measure Shape

Collect numbers before deciding.
Use local equivalents when commands differ.

```bash
git diff --stat origin/<base>...HEAD
git diff --numstat origin/<base>...HEAD
find <target-dirs> -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.py' -o -name '*.rs' \) -print0 | xargs -0 wc -l | sort -nr | head -30
rg -n "TODO|FIXME|HACK|XXX|legacy|deprecated|stub|placeholder|not implemented|as any|: any|@ts-(ignore|expect-error)" <target-dirs>
rg -n "<capability-name>|<provider-name>|<flag-name>|<type-name>" <target-dirs>
```

If available and not too expensive:

```bash
npx madge --circular <target-dirs>
npx jscpd --min-lines 6 --reporters json <target-dirs>
npx knip --reporter json
```

If a tool is unavailable, say the command failed and continue with the next best measurement.
Do not install new dependencies only to run a cleanup scan unless the repo already expects that tool.

## Phase 2: Build Candidate List

Write a short candidate table before editing:

| Candidate | Proof | Capability Risk | Review Cost | Decision |
|---|---:|---:|---:|---|
| Extract repeated provider parsing | 2 files duplicate same provider list | Low | Low | Do |
| Split 6k-line route by subresources | 1 giant file | Medium | High | Follow-up |

Score candidates by these questions:

1. Does it remove a second implementation of the same concept?
2. Does it make a god file smaller without changing routes, public types, or storage?
3. Does it improve an error path or local validation?
4. Can targeted tests catch behavior drift?
5. Can it be reviewed as one obvious change?

Do the highest-value low/medium-risk candidate first.
Do not batch unrelated cleanups unless they share the same root cause and tests.

## Phase 3: Plan Before Edits

Use this exact plan shape for non-trivial edits:

```text
Problem — one sentence.
Change — one sentence.
Why Long-Term Right — one sentence explaining why this removes a root cause.
Cost — files touched, risk, rollback path.
```

Then implement unless there is a genuine product fork only the user can choose.

## Phase 4: Safe Simplification Patterns

Good moves:

- Move a focused behavior from a large route/command/class into a small module.
- Replace repeated switch/provider/flag lists with one registry or typed constant.
- Replace two ad hoc parsers with one parser used by both call sites.
- Delete obsolete code together with its tests and exports.
- Move schemas near the behavior they validate when the large file only consumes them.
- Add a regression test for behavior that the cleanup now centralizes.

Bad moves:

- Create a `Manager` or `Service` that just hides the same complexity.
- Split files by arbitrary size while making readers jump across modules.
- Reformat untouched files.
- Change public API names as part of cleanup.
- Add compatibility layers in internal greenfield code without an external consumer.
- Extract coincidental shape with different intent.
- Hide provider or billing logic behind stringly typed maps without tests.

## Phase 5: Verify

Run smallest meaningful checks first.
For TypeScript repos, typical order:

```bash
pnpm exec biome check --write <changed-files>
pnpm --filter <package> test <targeted-test-files>
pnpm --filter <package> check-types || pnpm --filter <package> typecheck
git diff --check
pnpm preflight
```

Use the repo's required local check even when targeted tests pass.
If a check fails, fix the root cause before reporting.
Do not claim "done" from a build-only signal when behavior was changed.

## Phase 6: Commit, Push, PR Read

When the repo expects commits:

```bash
git status --short
git diff --stat
git add <changed-files>
git commit -m "refactor(<scope>): <plain result>"
git fetch origin <base>
git merge-tree --write-tree origin/<base> HEAD
git push origin HEAD
```

After push, read PR state directly:

```bash
gh api repos/<owner>/<repo>/pulls/<number> --jq '{url:.html_url,state,isDraft:.draft,base:.base.ref,head:.head.ref,mergeable,mergeable_state:.mergeable_state,head_sha:.head.sha}'
gh api repos/<owner>/<repo>/issues/<number>/comments --jq '.[] | {user:.user.login, created_at, body}'
gh api repos/<owner>/<repo>/pulls/<number>/reviews --jq '.[] | {state, user:.user.login, submitted_at, body}'
gh api repos/<owner>/<repo>/pulls/<number>/comments --jq '.[] | {user:.user.login, path, line, body}'
```

If remote checks are still queued, report queued/success/failed counts and the local proof.
Do not wait on remote CI when repo instructions say local proof is the merge signal.

## Stop Boundaries

Stop and report rather than editing when:

- The next cleanup is a separate architecture PR.
- The current PR is already large and further cleanup would obscure the feature.
- The only remaining simplification changes public API or data shape.
- The target file is a god object, but extracting safely requires a broad route/client split.
- Tests do not cover the behavior and adding coverage would exceed the requested cleanup scope.

Phrase the stop as a decision, not a hedge:

```text
I would stop simplifying inside this PR.
Measured reason: the next candidate is <file>, <N> lines, but splitting it touches <M> public routes and needs a separate review.
```

## Report Template

Keep the final answer short:

```text
Yes. I found and shipped one more simplification: <commit>.
Changed: <files/modules>.
Proof: <targeted tests>, <typecheck>, <repo check>, <PR state>.
Remaining: <1-3 follow-ups> and whether they belong in this PR.
```

If no change should be made:

```text
No more changes in this PR.
Measured reason: <numbers>.
Best follow-up: <separate cleanup>.
Proof: <commands/read state>.
```
