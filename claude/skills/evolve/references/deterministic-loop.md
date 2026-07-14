---
name: evolve
description: "Reference (not an invokable skill): the deterministic loop harness that makes /evolve safe to run unattended for hours — a fudge-proof measure.sh, decide.sh auto-keep/auto-revert, the 2x-noise-floor keep guard, checks.sh backpressure, and a resumable playbook.md."
---

# Deterministic Loop Harness (evolve reference)

A reference register for `/evolve`, not a skill you invoke.

It imports pi-autoresearch's enforcement rigor — a measurement the agent cannot fudge, and a keep/revert decision made by a script instead of by eye — into our richer loop (structured-hypothesis mode, the bootstrap-CI promotion gate, cross-project `experiments.jsonl`).

This is the mechanism that makes long unattended runs safe: stopping is free because a fresh agent resumes the exact run from one file, and the measure cannot be gamed because `decide.sh`, not your eyes, chooses keep vs revert.
That is the same property `/breakout` cites in "endurance is a state property, not willpower" — this harness is what makes the claim literally true.

Shared conventions in `_common.md` (append-only `.evolve/`, no AI attribution, real measurement only).

## When to use

| Situation | Reach for |
|---|---|
| One-off "did this fix move the number", read by hand | `/evolve`'s `compare()` (`../stats.md`), no harness |
| Unattended run of dozens–hundreds of candidates, one at a time, in place | **this harness** — `measure.sh` + `decide.sh` |
| Parallel isolated proposers, then select-and-merge the winners | `/meta-harness` — different shape; can reuse this `measure.sh`/`checks.sh` contract per variant |
| "Is this single kept run real, or noise?" | **the 2x-noise-floor guard** (below) — cheap, per-run |
| "Should this winner ship into the baseline/default?" | bootstrap-CI promotion gate (`STATS.md`, sibling) — heavier, per-winner |
| Rank one experiment's effect size | Cohen's d verdict (`../stats.md`) |

Two axes separate this from its neighbors.
Against `/meta-harness`: this is **serial and single-agent** — one candidate edited in place, decided, kept or reverted, before the next — where meta-harness runs many isolated proposers in parallel and merges the survivors; a meta-harness variant can call this `measure.sh`/`checks.sh` as its own per-variant judge.
Against the bootstrap gate in `STATS.md`: the noise-floor guard here judges **keeping a single run** in a loop (near-instant, runs on every candidate), where the gate judges **promoting a proven winner into a baseline** (10000 resamples, runs once when a bet graduates from "did it move" to "should it ship").

## The harness

Lives in `.evolve/<session>/`: `measure.sh`, `decide.sh`, `playbook.md`, `ideas.md`, an append-only `loop.jsonl` (one row per candidate), and a `state.env` (current baseline + revert streak).
`checks.sh` is optional.
Every KEPT candidate also appends a row to the top-level `.evolve/experiments.jsonl` per `../schema.md`.

### 1. `measure.sh` — the single source of truth

Bash, `set -euo pipefail`, emits `METRIC name=value` lines on stdout, exits non-zero if it could not measure.
The loop reads **only** these lines; the agent never eyeballs a number to decide keep vs revert.
For any `METRIC x=v` it also emits `METRIC x_noise=n` — the run-to-run noise floor of `x`, the population stddev across its own reps — so the guard in part 3 works from candidate one with no warm-up.

Keep it fast: its wall-time multiplies by every candidate — at 300 candidates, one extra second is +5 minutes of the unattended run.
For a noisy sub-5s benchmark, run it `K=5` times inside `measure.sh` and emit the median plus that stddev; the median is a stable signal when per-rep CV is under ~15%, and you should raise `K` above ~20% CV because a 5-sample stddev is itself a shaky estimate.
For a stable >30s benchmark, `K=1` is fine — don't pay 5x for variance you don't have.

### 2. `decide.sh` — auto-keep on improve, auto-revert on worse-or-equal

The deterministic engine the agent calls after applying one candidate edit.
It runs `measure.sh`, applies the noise-floor guard, runs `checks.sh`, then either commits (**KEEP**) or restores the in-scope code (**REVERT**) — and never touches `.evolve/`.
The revert reads its pathspecs from `state`-generated `scope` (part 5), so the append-only logs, the playbook, and the recorded dead-ends survive every revert: reverted knowledge is never lost, only reverted code.
Full script under "Concrete `decide.sh`" below — it is the one authoritative copy.

### 3. The noise-floor keep guard (before any keep)

Before believing any keep: **is the delta ≥ 2x the run-to-run noise floor?**
If not, re-run `measure.sh` once and recompute before trusting it — a delta inside the noise is a coin flip, and an unattended loop that banks coin flips walks uphill on luck and downhill on the truth.
`measure.sh` hands you the floor every run (the `_noise` companion), so this costs one comparison, not a bootstrap.

Why 2x and not 3x: 2x the stddev is roughly a 2-sigma move, believable-but-cheap for a single approximately-normal metric, with the re-run as the backstop against a false positive; 3-sigma rigor is the job of the heavier bootstrap gate in `STATS.md` when a winner ships, not of a per-candidate loop that must stay near-instant.
Small-K caveat: when per-rep CV exceeds ~20% the K=5 stddev is unreliable, so either raise `K`, or require the win to survive **two** consecutive re-runs rather than trusting one stddev.

### 4. `checks.sh` — optional correctness backpressure

A separate script that runs **after** a candidate has already cleared the metric and the noise guard.
Failing checks **block the keep** and force a revert even when the metric improved — a faster wrong answer is a regression the metric can't see.
Its runtime does **not** count toward the metric: correctness is a blocker on keep, not a term in the score, so it lives outside `measure.sh` and never taxes the hundreds of measured runs.

### 5. `playbook.md` — the resume file (with a generated `scope`)

The self-contained file a fresh agent reads to resume the *exact* optimization with zero context loss.
If resuming needed anything not in this file, the file is missing a field — fix the playbook, not the agent.

`Files in scope` is the single source of truth for what a revert may touch.
At session start (and whenever the playbook's list changes) the machine form is regenerated from it into `.evolve/<session>/scope` — one literal pathspec per line, directories or files, **no globs** — and `decide.sh` reverts against that file only.
One list, two renderings; they cannot drift because one is generated from the other.
Every pathspec must exist at session start (a missing path makes `git restore`/`clean`/`add` fatal), so list the enclosing **directory** when a candidate will create new files under it — `git clean` then sweeps whatever the candidate added there.

The living **What's been tried** section is what makes hours of unattended work compound: `decide.sh` appends every verdict's reason here, rendered from the same `loop.jsonl` row it just wrote, so the human-readable log and the machine record cannot diverge and a dead end costs its compute once, never twice.

### 6. The loop — the only agentic step is the edit

`decide.sh` is deterministic; proposing the next candidate is not.
The loop is the agent reading the playbook and the tried-list, popping the top-ranked idea from `ideas.md`, editing in-scope code, then handing the decision to the script:

```bash
# outer loop — apply_edit is the AGENT (reads playbook + tried-list, writes code); everything else is the script
export SESSION=.evolve/<session>
while :; do
  idea="$(sed -n '1p' "$SESSION/ideas.md")"                       # ranked queue, top first
  [ -z "$idea" ] && { echo "STOP starved: ideas.md empty"; break; }  # stop condition: field exhausted
  tail -n +2 "$SESSION/ideas.md" > "$SESSION/ideas.md.tmp" && mv "$SESSION/ideas.md.tmp" "$SESSION/ideas.md"
  apply_edit "$idea"                                              # AGENTIC — the model makes the change
  out="$("$SESSION/decide.sh")"; echo "$out"                     # deterministic keep/revert + record
  case "$out" in *"SIGNAL STOP"*) break ;; esac                  # stop conditions: target-hit / stuck
done
git add "$SESSION" && git commit -q -m "evolve: flush session logs"  # commit the trailing KEEP row + state
```

The three real stop conditions live where the information does: `ideas.md` empty is seen by the loop, target-hit and the consecutive-revert ceiling are computed by `decide.sh` from `state.env` and emitted on its `SIGNAL` line.
Nothing runs forever on willpower; it runs until the target is met, the field of ideas is empty, or the field is stuck.

## Concrete `measure.sh`

```bash
#!/usr/bin/env bash
# .evolve/<session>/measure.sh — single source of truth for keep vs revert.
# Emits `METRIC name=value` on stdout; decide.sh reads ONLY these lines.
# Keep it fast: this runs once per candidate, hundreds of times per unattended run.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

K=5   # reps for a noisy sub-5s benchmark; set K=1 for a stable >30s one, raise it above ~20% CV.

samples=()
for _ in $(seq "$K"); do
  # The real, deployed measurement. No mocks, no cached numbers.
  samples+=("$(node bench/hot-path.mjs --json | jq '.p50_ms')")
done

# median (the metric) + population stddev (the run-to-run noise floor), portable BWK awk.
# `sort -n` feeds awk in order, so a[NR] is the sorted sample => correct median.
read -r median sd < <(printf '%s\n' "${samples[@]}" | sort -n | awk '
  { a[NR]=$1; s+=$1; ss+=$1*$1 }
  END {
    n=NR
    med=(n%2)? a[(n+1)/2] : (a[n/2]+a[n/2+1])/2
    mean=s/n; var=ss/n-mean*mean; if (var<0) var=0
    printf "%.3f %.3f", med, sqrt(var)
  }')

echo "METRIC p50_ms=$median"        # primary metric — direction lives in playbook.md and decide.sh
echo "METRIC p50_ms_noise=$sd"      # run-to-run noise floor for the 2x guard
```

## Concrete `decide.sh`

```bash
#!/usr/bin/env bash
# .evolve/<session>/decide.sh — the deterministic keep/revert engine.
# The agent calls this AFTER applying one candidate edit to in-scope code.
# measure -> worse-or-equal? -> within-noise re-run -> checks -> KEEP or REVERT,
# then records the row, advances the baseline, and prints SIGNAL CONTINUE|STOP <reason>.
# The agent reads ONLY the SIGNAL line to decide whether to loop again.
set -euo pipefail
SESSION="${SESSION:?set SESSION=.evolve/<session>}"
cd "$(git rev-parse --show-toplevel)"

. "$SESSION/state.env"                 # BASE, BASE_NOISE, CONSEC_REVERTS
METRIC_KEY="p50_ms"                    # matches measure.sh; one metric per session
LOWER_IS_BETTER=1                      # 1 = lower better (latency); 0 = higher better (accuracy)
TARGET="${TARGET:-}"                   # e.g. 25.0 ; empty = no target stop
REVERT_LIMIT="${REVERT_LIMIT:-8}"      # consecutive reverts before declaring the field stuck

# in-scope pathspecs, generated from playbook 'Files in scope' — literal, no globs (bash 3.2 safe)
SCOPE=()
while IFS= read -r line; do [ -n "$line" ] && SCOPE+=("$line"); done < "$SESSION/scope"

revert_code() {                        # restore in-scope code to last kept commit; .evolve untouched
  git restore --source=HEAD --staged --worktree -- "${SCOPE[@]}"   # tracked edits AND deletions
  git clean -fdq -- "${SCOPE[@]}"                                  # untracked files the candidate created
}
save_state() { printf 'BASE=%s\nBASE_NOISE=%s\nCONSEC_REVERTS=%s\n' "$BASE" "$BASE_NOISE" "$CONSEC_REVERTS" > "$SESSION/state.env"; }
bump_revert() { CONSEC_REVERTS=$((CONSEC_REVERTS+1)); save_state; }

measure() {                            # sets NEW, NOISE, FLOOR, DELTA
  local out; out="$("$SESSION/measure.sh")" || return 1
  NEW="$(awk   -F= -v k="^METRIC ${METRIC_KEY}="       '$0 ~ k {print $2}' <<<"$out")"
  NOISE="$(awk -F= -v k="^METRIC ${METRIC_KEY}_noise=" '$0 ~ k {print $2}' <<<"$out")"
  FLOOR="$(awk -v a="$NOISE" -v b="$BASE_NOISE" 'BEGIN{print (a>b?a:b)}')"           # conservative floor
  DELTA="$(awk -v n="$NEW" -v b="$BASE" -v L="$LOWER_IS_BETTER" 'BEGIN{print (L? b-n : n-b)}')"  # >0 = better
}

record() {                             # ONE machine row + ONE human line, from the SAME values — cannot drift
  local verdict="$1" reason="$2" commit="${3:-}"
  printf '{"ts":"%s","metric":"%s","new":%s,"base":%s,"noise":%s,"floor":%s,"delta":%s,"verdict":"%s","reason":"%s","commit":"%s"}\n' \
    "$(date -u +%FT%TZ)" "$METRIC_KEY" "${NEW:-null}" "$BASE" "${NOISE:-null}" "${FLOOR:-null}" "${DELTA:-null}" "$verdict" "$reason" "$commit" \
    >> "$SESSION/loop.jsonl"
  # 'What's been tried' is the LAST section of playbook.md; appending to end keeps it one file, rendered from the row above
  printf -- '- [%s] %s %s: %s -> %s (delta %s vs 2x floor %s). %s\n' \
    "$verdict" "$(date -u +%F)" "$reason" "$BASE" "${NEW:-n/a}" "${DELTA:-n/a}" \
    "$(awk -v f="${FLOOR:-0}" 'BEGIN{print 2*f}')" "$commit" \
    >> "$SESSION/playbook.md"
}

signal() {                             # the stop-condition line the outer loop reads
  if [ -n "$TARGET" ] && awk -v n="$BASE" -v t="$TARGET" -v L="$LOWER_IS_BETTER" 'BEGIN{exit !(L? n<=t : n>=t)}'; then
    echo "SIGNAL STOP target-hit ${METRIC_KEY}=${BASE} target=${TARGET}"; return
  fi
  if [ "$CONSEC_REVERTS" -ge "$REVERT_LIMIT" ]; then
    echo "SIGNAL STOP stuck ${CONSEC_REVERTS}-consecutive-reverts"; return
  fi
  echo "SIGNAL CONTINUE ${METRIC_KEY}=${BASE} consec_reverts=${CONSEC_REVERTS}"
}

# --- the decision, in order ---
measure || { revert_code; bump_revert; record REVERT measure-failed; signal; exit 0; }

# clear worse-or-equal: revert with no wasted re-run
if awk -v d="$DELTA" 'BEGIN{exit !(d <= 0)}'; then
  revert_code; bump_revert; record REVERT worse-or-equal; signal; exit 0
fi
# within the noise floor: ONE re-run, recompute everything, before we believe it
if awk -v d="$DELTA" -v f="$FLOOR" 'BEGIN{exit !(d < 2*f)}'; then
  measure || { revert_code; bump_revert; record REVERT measure-failed; signal; exit 0; }
fi
# keep requires a real improvement AND clearing 2x the floor, AFTER the re-run
if awk -v d="$DELTA" -v f="$FLOOR" 'BEGIN{exit !(d <= 0 || d < 2*f)}'; then
  revert_code; bump_revert; record REVERT within-noise-or-worse; signal; exit 0
fi
# correctness backpressure: its runtime is excluded from the metric; failure blocks the keep
if [ -x "$SESSION/checks.sh" ] && ! "$SESSION/checks.sh"; then
  revert_code; bump_revert; record REVERT checks-failed; signal; exit 0
fi

# KEEP: commit in-scope code + prior .evolve state (no AI trailer, per _common.md), advance baseline.
# add and commit on SEPARATE lines: a `git add ... && git commit ...` compound hides an add
# failure from set -e, which would silently record a fake KEEP. Separate => a git error fails closed.
git add -- "${SCOPE[@]}" "$SESSION"
git commit -q -m "evolve: keep ${METRIC_KEY} ${BASE}->${NEW}"    # BASE still old here => correct old->new msg
COMMIT="$(git rev-parse --short HEAD)"
record KEEP improve "$COMMIT"          # BEFORE the BASE mutation, so the row logs old->new (not new->new)
BASE="$NEW"; BASE_NOISE="$NOISE"; CONSEC_REVERTS=0; save_state
signal                                 # reads the advanced BASE for the target-hit check
```

## Concrete `playbook.md` skeleton

```markdown
# Evolve session: <slug>   (started <date>)

## Objective
<one sentence — the user-visible outcome, not the metric>
e.g. "Cold-start API responses feel instant; the p50 hot path drops below the 25ms jank threshold users see in session replay."

## Metric + direction
- Primary: `p50_ms` — LOWER is better. Target: <= 25.0. Emitted by measure.sh, enforced by decide.sh (LOWER_IS_BETTER=1, TARGET=25.0).
- Noise floor: `p50_ms_noise` (population stddev of K=5 reps). Keep guard = 2x this.

## How to run
- Measure:  `.evolve/<session>/measure.sh`      (emits the METRIC lines)
- Decide:   `SESSION=.evolve/<session> .evolve/<session>/decide.sh`   (keep/revert after one edit)
- Checks:   `.evolve/<session>/checks.sh`        (optional; must exit 0 to allow a keep)

## Files in scope   (the ONLY revert target; regenerated into `scope`, one literal pathspec per line, no globs)
- src/hot-path
- bench/hot-path.mjs

## Off-limits   (never edit)
- src/api/contract.ts   (wire format is frozen)
- .evolve                (state survives every revert)

## Constraints / invariants   (must hold for any keep; checks.sh asserts them)
- Public API stays wire-compatible.
- No new network calls on the hot path.

## Ideas queue
- Ranked candidates live in `.evolve/<session>/ideas.md`, top first; the loop pops from it and stops when it empties.
- Refill from `/hypothesize` when the field runs dry.

## Current baseline   (also machine-readable in state.env)
- p50_ms = <last kept median>   noise = <last kept stddev>   commit = <sha>

## What's been tried   (LIVING — decide.sh appends one line per verdict, newest last)
- [KEEP] <date> memoize schema parse: 41.2 -> 33.8 (delta 7.4 vs 2x floor 2.2). commit <sha>.
- [REVERT] <date> within-noise-or-worse swap JSON lib: 33.8 -> 33.4 (delta 0.4 vs 2x floor 2.2). Do not retry — inside the noise; lib alloc dominates.
- [REVERT] <date> worse-or-equal parallelize validators: 33.8 -> 34.9 (delta -1.1). Reverted; scheduler overhead exceeds the win.
```

## Why this is the endurance property

Two facts, together, are what let `/evolve` run unattended for hours: stopping is **free** — a fresh agent reads only `playbook.md` and resumes the exact run — and the measure is **unfudgeable** — `decide.sh`, not a tired eye, keeps or reverts against `measure.sh`.
When both hold, round-counting stops mattering and the only real stop conditions are *target hit*, *ideas empty*, or *the field is stuck* (the revert ceiling).
That is exactly the state `/breakout` names in "endurance is a state property, not a willpower property": you can only refuse to stop when stopping costs nothing and the number can't be gamed.
If either fact breaks — a field the agent must read to decide, a playbook a fresh agent can't resume from — the harness is under-built; fix the harness, not the agent.

## Then consider

- `evolve` — this harness is the loop's engine; return to `../SKILL.md` for the diagnose → hypothesize → execute cycle that feeds it candidates, and stand up `measure.sh` + `playbook.md` before the first one.
- `hypothesize` — when `ideas.md` is empty or all dead ends, research a fresh ranked field before the loop starves.
- `breakout` — when even a fully-resumable, fudge-proof loop plateaus for 3+ rounds under 2% each: the ceiling is the target, not the code.
