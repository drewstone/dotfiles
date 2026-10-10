# Incident postmortem

Read this when writing the postmortem for an incident run under [incident command](../SKILL.md#run-an-incident).
Every time comes from a system record: a journal, a CI or release log, an alert, a commit.

## Sections, in order

1. **Summary:** the symptom, the window from the first failing signal to the first passing real-path check, who was affected with a denominator, and the times to detect and recover against the operator SLOs (10 and 30 minutes).
2. **Where the time went:** contiguous segments from the first failing signal to recovery, each named for what was happening and grouped into detect, fix and ship. `viz waterfall --start --end` refuses segments that do not add up to the span, and its rollup gives each group's share.
3. **Signal:** the real-path check across the window, with `viz strip`.
4. **Timeline:** events with their times and the gap since the previous one, with `viz timeline`.
5. **Causes behind the cause:** why it shipped, why detection took as long as it did, and why recovery took as long as it did.
6. **Corrective actions:** one row per gap, with the fix, its owner and its status; a fix that can be a check names the check and the past failure it catches.

For a page, put the same data in a brief with the `strip`, `waterfall` and `events` blocks of the [brief kit](../../report/references/brief-kit.md).

## Example: the Oct 10 chat outage

The segments are in [outage.tsv](../../../../tests/fixtures/viz/outage.tsv), one row per segment with `label`, `value` in minutes, `group` and `tone`.

```text
$ viz waterfall outage.tsv --unit m --start 00:45 --end 07:31 --title "Where the 406 minutes went, Oct 10 UTC" \
    --source "release logs and the gtm-synthetic-turn journal on gtr" --width 96
Where the 406 minutes went, Oct 10 UTC
detect                            ███                                    50m  12.3%  00:45–01:35
fix                                  ██                                  17m   4.2%  01:35–01:52
open the PR                            █                                 14m   3.4%  01:52–02:06
develop red, agents rate-limited        ████████                116m (1h56m)  28.6%  02:06–04:02
merge develop, re-prove                         █                        11m   2.7%  04:02–04:13
flaky timing tests                              ███                      44m  10.8%  04:13–04:57
version-PR coupling                                ████████     108m (1h48m)  26.6%  04:57–06:45
cut, promote, deploy                                       ███           46m  11.3%  06:45–07:31
total 406m (6h46m) · 8 parts · 00:45→07:31
by group: detect 50m 12.3% · fix 17m 4.2% · ship 339m (5h39m) 83.5%
source: release logs and the gtm-synthetic-turn journal on gtr
```

The rollup decided the headline: writing the fix took 17 minutes (4.2%), and shipping it took 5 h 39 m (83.5%).
The hand-written review had said 5 h 55 m, which is the span from the root cause at 01:35 to recovery and so includes the fix itself.
