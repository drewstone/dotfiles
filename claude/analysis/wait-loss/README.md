# Wait-loss harness

Measures how agent sessions wait, and whether a capped Bash call keeps its answer.

Run in order from this directory:

```bash
python3 scan_waits.py > corpus.jsonl   # per-session wait + cap counts
python3 loss.py > loss.out             # per-cap information loss, writes loss_rows.json
python3 echo_test.py                   # silent vs printing loop bodies, needs loss_rows.json
python3 test_guard.py                  # scores hooks/poll-guard.sh on the real corpus
```

`loss.py` must run before `echo_test.py` and `test_guard.py`; both read `loss_rows.json`.

Baseline recorded 2026-08-26 over 1,711 transcripts is in `../current.json`.
Re-run after any working session to see whether the print rule moved the loss rate.
