# Wait-loss harness

Measures how agent sessions wait, and whether a capped Bash call keeps its answer.

Run in order from this directory:

```bash
python3 scan_waits.py > corpus.jsonl   # per-session wait + cap counts
python3 loss.py > loss.out             # per-cap information loss, writes loss_rows.json
python3 echo_test.py                   # silent vs printing loop bodies
python3 test_guard.py                  # scores hooks/poll-guard.sh on the real corpus
```

`loss.py` must run first; the two scorers read the `loss_rows.json` it writes.
Override its location with `WAIT_LOSS_ROWS`.

Baseline recorded 2026-08-26 over 1,830 transcripts is in `../.agent/current.json`.
Unrecoverable dead time was 479 min over 55 days, 58% of it inside subagents.

Re-run after a session recorded later than commit `37164ab` to see whether the
print rule moved the loss rate. Compare only post-commit transcripts; the corpus
mixes both eras.
