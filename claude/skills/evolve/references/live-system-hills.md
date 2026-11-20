# Live-system hills

Read this when the hill is a production system's speed or infrastructure: the loop runs in production.

- Ship each kept change through the deploy path as soon as it builds, without waiting on CI. The deploy's own preflight, smoke and rollback are the gate, and the time from merge to served counts toward the hill.
- After every served deploy, run the full measurement matrix on the served revision: every cell, not a sample. Read each value against its number to beat.
- A measurement run that produces no records counts as a failure, never a success. Fix its cause before the next change.
- Every report carries the full matrix since the previous report: one column per run, its served revision, and every metric. A day without a served measurement is a defect to fix.
