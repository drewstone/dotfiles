# Hillclimb

Every deliverable moves a measured outcome or shows why it could not.
Read this before analysis, operating reports and lead ticks, reflections, evaluations, and improvement work.
[report](../../claude/skills/report/SKILL.md) owns evidence rules and [evolve](../../claude/skills/evolve/SKILL.md) owns experiments; this file owns the loop that connects them and the bar for what reaches Drew.

## The loop

1. **Name the hill.**
   A hill is a metric tied to the user outcome, with unit, direction, baseline, target and owner.
   Use the registry entry when one exists.
   Done when the work record carries `hill: <metric> <baseline> → <target> (<owner>)`.
2. **Measure the population.**
   Query the complete set for the window: every run, PR, canary record or invocation, not a sample someone described.
   Lane STATUS, agent messages and your own earlier statements are leads to check, not measurements.
   Done when every number you will show has its query, window and denominator.
3. **Try to break each headline claim.**
   Run the narrowest query that would come out differently if the claim were false: product vs harness, merged vs served, cancelled vs failed, start of the outage vs start of the log.
   Done when each headline claim survived one such check, or is corrected and labeled as a correction.
4. **Think bigger, then stress-test.**
   Ask what would make the outcome 10× better, which mechanism removes the problem class rather than this instance, and what a world-class operator would have built so it never recurs.
   Write at most three bets, each with evidence, mechanism, a numeric target and a first step.
   Pre-mortem each bet: its most likely failure and the observation that would show it.
   Done when every surviving bet has a target number and a failure test.
5. **Show it.**
   The first screen states the thesis the data supports, the benchmark it is judged against (an external standard or our own history), and the decisions only the reader can make.
   Show distributions and time, not only totals.
   Build anything with more than one dimension with the [brief kit](../../claude/skills/report/references/brief-kit.md) and publish it as an artifact; a one-fact answer stays a sentence.
   Done when a reader of the first screen knows what is true, how we know, what it compares to, and what they must decide.
6. **Score it independently.**
   Run the brief judge against the rubric below and append its score and reasons to the quality ledger.
   A self-assigned PASS is a claim, not a score.
   Done when the ledger row exists.
7. **Retain the climb.**
   Append each hill's new value to its series, open or update the owner of any hill that regressed, and record corrections to anything said earlier.
   Done when the next run can read today's value as its baseline.

## Hills

A hill entry is `{id, metric, query, unit, direction, baseline, target, owner, cadence}`, kept in the project's hill registry with a collector that measures it and a series that records each value.
Register a hill for every recurring outcome being improved, including the quality of judges, runs, discovery systems and our own reports.
Typical hills: first red alarm to a named owner, time to restore a customer path, deploy runs failed or cancelled, release cuts abandoned, alarms red for an hour without an owner, statements later corrected, brief judge score, and judge agreement with the human's ratings.
A hill without a measured baseline is a wish; measure it before claiming progress.

## Rubric

The judge scores each dimension 0–3; the total is out of 30.

1. **Thesis**: one sentence, stated first, supported by what follows.
2. **Population**: complete sets with query and denominator for every number.
3. **Falsification**: headline claims checked by a query that could have refuted them; corrections stated.
4. **Benchmark**: compared to an external standard or our own history.
5. **Shape**: distributions and time series, not only totals.
6. **Cause**: mechanism named; correlation not presented as cause.
7. **Ownership**: every open problem has an owner and next action; time to owner shown.
8. **Ambition**: bets that remove problem classes, each with a numeric target and a pre-mortem.
9. **Decisions**: what the reader must decide, with a recommendation and its tradeoff.
10. **Craft**: charts drawn to scale, readable in both themes, first screen complete, no decoration.

Calibrate against Drew's ratings.
Keep anchors in the project's registry: at least one deliverable he rejected and one he praised, with his words.
Add an anchor whenever he rates a deliverable, and report the judge's agreement with his ratings as the judge's own hill.

## Failures this loop prevents

Relaying a failing check without separating the harness from the product reports an outage that is really blindness.
Reading duration from a status note instead of the full record understates outages.
An alarm without an owner stays red for hours, while diagnosis after ownership takes minutes.
Self-logged verdicts without an independent score leave nothing to climb.
Rigor that depends on remembering to invoke a skill is skipped on routine status work; the loop applies to lead ticks too.
