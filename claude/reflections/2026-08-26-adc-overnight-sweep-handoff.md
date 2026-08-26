# Handoff — agent-dev-container overnight sweep — 2026-08-26, written 20:23Z

**Open loops table below has 14 rows.**

## Objective and status

Drive the ADC board to green after the 2026-08-25 billing session. Escalated mid-session into a
full-surface sweep when the first findings showed the board was far worse than the reflection said.

**Status: the work I could do without Drew is done. Everything left needs his hands.**

One PR merged, two more being built by a live workflow at write time. Production is serving. Two
customer-impacting problems remain open and one of them is growing.

## The numbers that matter, re-read at write time (not from earlier notes)

| Metric | 12:33Z | 20:23Z | Δ over ~8h |
|---|---:|---:|---:|
| Charge intents queued | 20,194 | **21,615** | +1,421 |
| Already-unsettleable | 11,681 | **13,091** | +1,410 |
| Oldest intent | 6.69 d | **7.18 d** | +0.49 d |
| Distinct unresolvable payer keys | 438 | 438 | 0 |

Read from `curl -s https://sandbox.tangle.tools/health` → `checks.chargeIntents`.
**The backlog is still growing.** This is compute that ran, that customers received, and that cannot
be billed. It is uncollected revenue, not a monitoring gap.

## Live lanes — re-verify before trusting

| Lane | State at write time | Ground-truth check | Resume |
|---|---|---|---|
| Workflow `wf_d65ec68d-51d` (P0 + billing PRs) | RUNNING, 4 agents, journal 5 lines | `ls ~/.claude/projects/-Users-drew-webb/1003f469-76d0-484f-8e2c-f372c6706353/subagents/workflows/wf_d65ec68d-51d/*.jsonl \| wc -l` | `Workflow({scriptPath: '.../adc-p0-and-billing-wf_d65ec68d-51d.js', resumeFromRunId: 'wf_d65ec68d-51d'})` |
| `adc-push` on P0 branch (pid 68100) | RUNNING, in pre-push gate | `pgrep -fl adc-push` | `adc-push ~/webb/agent-dev-container/.worktrees/fix-6283-secrets-injection 4` |
| CI monitor | **STOPPED** by me (was waking every few min on two known-benign reds) | `TaskList` | `Monitor` with the filtered command in this session's history |
| Dynamic `/loop` | **STOPPED** by me | — | `/loop <the ADC drive prompt>` |

`adc-push` exiting 0 does NOT prove a push landed. Only `git ls-remote --heads origin <branch>` does.
One push this session died silently with the gate passing and git exiting 0.

## What shipped

| Artifact | State | Proof |
|---|---|---|
| PR **#6286** → `develop` | **MERGED** `4bbfad645` 12:30Z | 25 checks green pinned to sha; 4 review cycles; suite 102 files / 1556 tests |
| `~/dotfiles` `2b56483`, `37164ab`, `7ab89ec` | **PUSHED** to main, tree clean | `git rev-list --count HEAD --not --remotes` = 0 |
| Release-gate audit on PR **#6265** | comments `5422484304`, `5423026486` | box 2 ticked on proof; boxes 1 and 3 left unticked with evidence |
| P0 **#6283** claimed | comment `5422718733` | prevents duplicate work; issue still OPEN |
| Overnight report | https://claude.ai/code/artifact/0b3b9709-0e3e-433d-8b5b-69e8747ba80f | 63 confirmed findings |
| This brief | `claude/reflections/2026-08-26-adc-overnight-sweep-handoff.md` | — |

**#6286 is in `develop`, NOT `main`. Production still carries the SDK timeout defect.**
Promotion is a human decision per the repo's own release rules.

## Open loops — exhaustive, 14 rows

| # | Item | State | Pointer | Next command |
|---:|---|---|---|---|
| 1 | P0 #6283 secret injection fix | building, live workflow | issue #6283 | check `wf_d65ec68d-51d` journal for the PR number |
| 2 | Charge-intent forward path fix | building, live workflow | `billing-provenance.ts:469-495` | same |
| 3 | 13,091 stranded charge rows | **needs Drew** — write off or recover | alarm issue #6151 | money decision, no command |
| 4 | GitHub Actions billing | **needs Drew** — org on Free, `prevent_further_usage=true` | — | raise spend limit or leave Free plan |
| 5 | `secrets`-absent default | **needs Drew** — one-line constant in the P0 PR | — | flip the constant |
| 6 | develop→main promotion of #6286 | **needs Drew** — explicit human direction | PR #6286 | release process |
| 7 | Latched release-train breaker | **needs Actions-write** | `Complete Production Release` job | re-run the deploy workflow |
| 8 | `golden-snapshot.yml` red since 08-16 | **needs Drew** — platform API key scoped to wrong product | — | re-scope/reissue the secret |
| 9 | Vault SSH credential rejected by both staging boxes | **needs Drew** | 138.201.133.55, 138.201.22x | add the key's public half to authorized_keys |
| 10 | `E2E_SLACK_WEBHOOK_URL` never created | **needs Drew** | tangle-router | 60 days of red prod smoke went silent |
| 11 | Deploy drain policy | **needs Drew** — product call | issue #5854 | block live sessions, or fast retryable reject |
| 12 | `release-verification` revive-or-retire | **needs Drew** — costs real paid sandboxes per run | — | decide |
| 13 | Boxes 1 and 3 reference no durable artifact | open, root cause of both red boxes | PR #6265 | rewrite to cite machine-checkable evidence |
| 14 | `infra-flake-auto-retry.yml:130` raw log line in inline bash | latent, NOT causing red | that file | pass via `env:` like lines 137-138 already do |

## Standing decisions, each with its kill condition

| Decision | Why | KILL IT WHEN |
|---|---|---|
| P0 defaults `secrets`-absent to CURRENT behaviour (all), behind one named constant | Defaulting to none silently breaks auto-applied startup scripts whose names the caller never lists, on a security fix nobody has reviewed | Drew answers, or a caller is shown to depend on the exposure |
| Billing fix touches the forward path ONLY — no migration, no backfill | The 13,091 stranded rows are $-denominated history; an agent must not resolve that at 5am | Drew decides write-off vs recover |
| Boxes 1 and 3 on #6265 stay unticked | Box 3's gate has never passed; box 1 could not be made green on this machine | Someone produces the evidence each box actually asserts |
| Merge to `develop` without asking; never to `main` | Repo rule: feature PRs target develop; develop→main is a production promotion needing explicit human direction | Drew says otherwise |
| CI watches must PIN the commit sha | Counting "is anything pending" reads the previous run's verdict — nearly merged an untested commit | Never |

## Operator corrections paid this session — do not pay twice

1. **"whats between us and DONE"** — I closed three turns running with a fresh Next list, turning a
   finished task into an open-ended one. Draw the finish line and stop.
2. **"i still dont even know wtf we're doing, who is the audience"** — I never stated scope and
   audience up front. One line at the start: who this is for, what it changes.
3. **"drop these log triggers if they're useless"** — I built 3 hook triggers where the evidence
   supported 1. Ship what the measurement supports, not what the idea suggests.
4. **"i dont get why you always do work and not pr it"** — I described a PLAN as a shipped RESULT
   four times. The P0 build agent had died on a spend limit and I never read its return value.
   **Check the agent's actual output before reporting its work as done.**
5. **"what about staging?"** — my first sweep had no staging surface at all.
6. **"seriously simplify without losing what is truly needed"** — bias to cutting.

## What I was uncertain about at close

- **Whether the merged SDK fix actually clears the release train.** I nearly claimed it did: a
  Release PR went green seconds after the merge, but it ran the cut-the-PR job and SKIPPED
  `Complete Production Release`, the job that was failing. Unproven until a real deploy runs.
- **Whether the two in-flight PRs got built at all.** The workflow was mid-build at write time and
  an identical earlier workflow lost every fix agent to a spend limit. Read the journal, do not
  assume.
- **Three sweep findings did not survive re-checking** (#6250 blamed wrongly, "production healthy"
  measured against an endpoint that 200s on any path, `Infra Flake Auto-Retry` not actually
  failing). Treat any un-rechecked finding in the artifact as provisional.
- **Whether the shipped product agents share the wait-loss defect.** Never measured; only local
  Claude Code transcripts were. Do not read the report as clearing the product.

## Next actions, ranked

1. Read `wf_d65ec68d-51d`'s journal for the two PR numbers, drive them to CI-green, merge to `develop`.
2. Unblock GitHub billing — gates four findings from being diagnosable at all.
3. Answer the `secrets`-absent default; the constant is one line.
4. Decide the 13,091 stranded rows before the number grows again.
