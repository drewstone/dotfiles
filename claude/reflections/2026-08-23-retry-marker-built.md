# Reflection: reflect-on-reflection — 2026-08-23

**Systemic finding:** the 08-22 reflection session (`a90260cb`) ranked "build the retry-with-state marker in traces" as action #1, owner claude, at its 4th raise — then spent its 18 tool calls on rules and record-keeping and left the marker as a "next traces PR" owner line.
That is the "Next list repeats an instruction you already have" dodge, applied by a reflection to its own top finding.
The instrument stayed unbuilt for 16 days (first raise 08-07) because every session that met it wrote it down instead of writing it.

**Fix shipped this session:**
- traces PR #87 — `classifyFailureFollowUps`: splits each failed call's same-tool follow-up into blind (identical args) vs adapted (changed args) with follow-up outcome; sha256-first compare, expected-blocking polls excluded. Proven on the 08-22 session artifact: its 2/2 follow-ups were adapted and succeeded, i.e. not waste.
- traces PR #88 — found under the same stone: macOS symlinked cwds (`/var` vs `/private/var`) made worktree session-location drop sessions; 2 permanently-failing repo tests on macOS → 0, suite 658/658.
- reflect-last skill now says: when the fix is reachable code, build it in the reflection session; a "next PR" owner line is the re-raised deferral.

**Repeat check:** failed→same-tool-retry instrument — raised 08-07, escalated 08-08 ("instrument before raising again"), 4th raise 08-22, **built 08-23 (PR #87)**. Next traced session should read the blind/adapted split instead of re-raising.
