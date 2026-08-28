# Handoff: ADC agent-hang outage + release-train repair — 2026-08-17

**Objective.** Land the prior session's open loops, then keep fixing at the source.
**Status.** Production outage found, fixed, and **proven fixed on the deployed path**: every managed agent run emitted nothing for 180s; now 8.4s. Nine PRs merged. Five distinct root causes, each verified on the real path.

## Ground truth at close (re-verified at write time, not remembered)

| Thing | Value |
|---|---|
| develop tip | `8b0bc9080` (#5819, another agent's) |
| main tip / prod serving | `532b327cb` — confirmed via orchestrator `GIT_SHA` |
| develop ahead of main | 5 commits |
| prod `/health` | `ok`, chargeIntents depth **0**, topError **null** |
| open PRs | #5816 (release→main), #5820, #5814 |
| my sandboxes | **0** — all deleted; `sandbox-1bd97871a9f6 cad-proof` is NOT mine |

## The outage, and its proof

`agent.single-prompt-file-create` 30.6s → 203s timeout, red across two releases.

Root cause: `XDG_CACHE_HOME=/opt/cache/.cache`, and `/opt/cache` is **read-only** — only tool dirs the image provisions get rw bind mounts. opencode and amp are **Bun** binaries that `mkdir` their cache dir at startup, so they died before running. Node-based CLIs (codex/claude/droid) were unaffected — that contrast is the diagnosis.

Chain, every link measured on the real path:

| link | evidence |
|---|---|
| prod env | `XDG_CACHE_HOME=/opt/cache/.cache` |
| unwritable **even as root** | `fs.accessSync` → `EROFS`, uid=0 |
| after fix | `/home/agent/.cache` |
| opencode | EROFS crash → **1.18.12** |
| **prompt** | **180,000ms timeout → 8,403ms success** |
| file | missing → `EXISTS` / "sandbox eval pass" |

## Merged (all on develop; all but the last two in production)

`71813e24b` #5788 sandbox-web parse boundaries · `9c6e516cc` #5793 names the 65 unexaminable quota slots · **`28fd050aa` #5802 the agent-hang fix** · `fa42e056d` #5803 version packages · `bcb35d896` #5804 egress deadline per call · #5805 `changeset:version` refreshes the lockfile · `0a6cdc95b` #5807 cache volumes + mise deleted + release flake · `532b327cb` #5809 release→main · `166f90597` #5817 retention reachability gauge.
Closed: #5699 (refuted settlement fix), #5806 (superseded release).

## Live lanes

**None running.** All monitors fired and ended; no background pushes or watches remain. Nothing to resume.

## Open loops — 9 rows

| Item | State | Pointer | Next command |
|---|---|---|---|
| Browser `session:chat` silent | **answered, fix in flight** | PR **#5814** | `gh pr view 5814` — merge it, then re-run the browser audit |
| Retention residue cut-off | gauge shipped, decision gated | `ghcr-cutoff-reachability.sh` | read gauge after 2 cycles (~12h); if `reachable`=0, drop 30d |
| Backfill `orchestrator_owner_*` | not started | #5793 prints the 65 ids | read the sweep's warning, then backfill from an authoritative source |
| Silent terminal turn = defect | not started | `surface-audit.ts` chat surface | assert a terminal run with 0 output renders a reason |
| Release #5816 → main | open, unmerged | `release/20260817` | needs explicit human go per the guardrail |
| `GIT_REFERENCE_DIR` read-only | exempted deliberately | `check-cache-env-covers-volumes.mjs` | none — git alternates are read by design |
| `NODE_COMPILE_CACHE` unwritable | known, benign | `/sidecar/.compile-cache` | Node degrades silently; revisit only if boot slows |
| adc-wt claim orphans admin dir | not fixed | `~/bin/adc-wt` `cmd_claim` | rename the admin dir with the tree |
| 4 orphaned commits | **resolved — deleted** | shas `0699ae56f`, `7e3a267e8` | none; both superseded, recoverable by sha |

## Standing decisions + KILL CONDITIONS

1. **Never supply a git identity.** Kill: none — global config is authoritative. Held all session; zero trailers on nine merges.
2. **Guardrails + Fast Checks are the merge bar.** Kill: **the org is on GitHub Free — `/branches/main/protection` and `/rulesets` return 403, so NO check can block ANY merge.** This bar is convention held by hand. If the org upgrades, make them required and delete this note.
3. **Do not lower the GHCR residue cut-off yet.** Kill: two cycles of pin-list evidence showing no pinned digest selected. #5815 landed 01:02Z 08-17; two cycles ≈ 12h. The gauge now prints the number.
4. **mise is deleted, not repaired.** Kill: if the egress proxy is ever opened to `nodejs.org` et al, reconsider — but Nix already ships node/python/go/cargo/deno/bun/ruby/java, so the case stays weak.
5. **Never delete a branch with unmerged commits without reading them.** Kill: none. I twice called `sandbox-current-cohort-20260802` "pure noise"; it held 4 commits and 55 files.

## Operator corrections paid this session — do not pay twice

- **"Reconcile before you create."** #5815 fixed the `sha-*` retention rule an hour before I started building the same thing. Checking `develop`'s tip first saved a duplicate PR.
- **Read the *right* view.** `git log --merges` lists merges reachable from main, including ones that happened on develop. Only `--first-parent` shows what advanced a branch. I nearly reported "feature PRs are landing directly on main" — they weren't.
- **Never `head -5` a diagnostic.** A truncated `/proc/mounts` hid 7 of 10 cache volumes and sent me down a wrong path.
- **Classify by any-tag, not `tags[0]`.** A version carries several tags; my first family breakdown invented a phantom "166 unruled versions".

## Uncertain at close — read this before trusting anything above

- **I did not prove #5814 is the browser-chat cause.** I proved direct `anthropic/*` routes return `503 provider_pricing_unavailable`, and that my SDK run worked because the sidecar named `deepseek/deepseek-v4-flash` explicitly. #5814 states the default-model problem independently. The link is strongly supported, **not** measured by me end-to-end. The decisive test: merge #5814, re-run the browser audit, confirm `session:chat` goes OK.
- **The cache fix is proven for `XDG_CACHE_HOME` and vite/deno; not for every tool.** The post-deploy sweep showed only by-design read-only paths remaining, but the sweep only covers env vars matching `*_CACHE|_DIR|_HOME|_PATH|_ROOT`.
- **Run the cache sweep on a CLAIMED sandbox, never a warm-pool one.** A warm container carries different env and ownership and shows none of this — my first sweep came back clean and was wrong.
- **`keep-n-most-recent` is a floor, not a ceiling.** It protects a minimum; it cannot bound growth while the cut-off never fires. Anyone reasoning about GHCR quota needs this.

## Method note worth keeping

Mutation testing again caught what the first green run missed — including two mutants that **survived** and forced better tests: the `/root` rule was indistinguishable from a writability check on a non-root runner, and a not-yet-created cache override was untested. A surviving mutant is the useful outcome, not the failure.

The other repeated lesson: **the push gate is a real reviewer.** It caught my own regression (narrowing Dockerode's overloaded `getImage().inspect` to `Promise<void>` broke `host-agent`), and the error surfaced in a *consumer* package while still reporting the old signature until I rebuilt `@repo/shared`'s `dist/`.
