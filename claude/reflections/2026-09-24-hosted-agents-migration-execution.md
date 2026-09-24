# 2026-09-24 — Hosted agents: why the platform migration took so long

Scope: session webb-57 (Mac), 2026-09-23 to 2026-09-24 about 18:45Z, roughly 30 hours.
Objective: Instinct-style hosted agents on platform primitives (lines, instances, billing), simple, with fast replies.
Sources: the session transcript, the workflow journals (about 15 workflows), GitHub PR and run data, production D1 counts, chat.db timings and deploy logs.
Not inspected: the transcripts of the GTR operator lanes or of other Mac sessions.
Trigger: Drew said "this work is taking forever frankly to finish, and I can't tell if you're thinking about it simply".

## Outcomes against the objective

Live in production:
- Billing is decided on the platform, and Builder's own counting is deleted (#457, net -76 lines).
- In-place key rotation works; a live probe passed at 14:33Z, so the sponsor-key deadline of 09-29 is safe.
- No-slot relocation.
- The hosted warm OpenCode server.
- Voice: 16/16 correct answers, 3.3 s median reply wait.
- Intelligence runs on its own server.
- Sandbox SDK 0.51 ships lines and instances.
- The kit is switched; Braid runs on it.

Not live:
- Lines are on develop only.
- Builder's hosted code is not deleted. It grew by 6,104 lines in 30 hours. #457 removed 76. #474 removed 611, was reverted after it broke production, and the revert was still pending at the time of writing.
- Warm reply time is about 20 s, against a 3 s target. The realistic Friday target is 10 s.

## Findings, ranked by consequence

1. **The migration was engineered for users who barely exist.**
   Production has 5 enrollments, 5 users and 4 boxes (D1, 2026-09-24).
   We still built dual paths, flags, adoption of legacy boxes, policy digests and handling for blocked rows, all to preserve those 4 boxes in place.
   Every one of the 14 review findings on #474 comes from that compatibility layer.
   The simple move was a hard cutover: create platform instances, copy each workspace's files, switch, then delete Builder's copy in one PR.
   Cause: I never counted the users before choosing the migration shape.
2. **Most of the work went into the layer being deleted.**
   49 of 66 Builder PRs (+6,104 lines) landed in hosted/, launch/ and voice/, mostly before the platform-layer decision at about 01:00Z.
   The migration then ran as one lane of seven until the 06:20Z freeze.
3. **Production went 13 hours without a deploy (01:26Z to 14:25Z) while code piled up.**
   Seven release cuts were closed because develop kept moving (re-cut churn).
   ci-linux runners were saturated, the react-doctor ratchet sat at 84 against a floor of 85, and the deploy's own fleet proof tripped the provisioning cap of 8.
   The fix took minutes once someone read the deploy log at 14:20Z.
   The first failed deploy was at 09:43Z; nobody read it during a 4.5-hour outage.
4. **About 8 hours of lane time were lost to usage and session limits:** 03:55Z, 06:22Z, 09:45Z to 14:14Z, and 15:20Z to 17:35Z.
   The lanes do not resume themselves, and each restart waited for Drew to say "resume".
5. **I added coordination overhead myself.**
   - A SendMessage to a workflow agent created twin copies on 6 lanes; the lines lane lost 1 to 2 hours.
   - A parallel() barrier held the delete stage behind billing for about 3 hours.
   - I told the latency lane to merge #446, a change that had already been measured and reverted.
   - Seven concurrent ADC preflights pushed the Mac to a load average of 455 on 10 cores.
6. **Merging fast without review broke production.**
   #474 deleted a live lifecycle and deployed without review.
   Product tool calls returned 401 and platform-created boxes were refused for about 45 minutes, until the revert.
   The fast-merge directive was right for additive, flagged changes and wrong for deletions.

## Practices to keep

- Diagnose from the log, not from a guess. The deploy proof's provisioning cap, the react-doctor ratchet and the peer floor were each found in one read.
- Prove with live receipts: the billing $0 subscription, the rotation probe, recorded voice calls.
- Independent code reviews caught 3 real production risks: #7961 (per-member read fence), #8054 (run-as key re-check) and #474.
- Coordinate through lock files and PR comments, not through messages to lanes.

## Changes made

- AGENTS.md: a deletion-merge rule (an independent review and one live proof before a path deletion reaches everyone), and "count the users a migration protects before choosing its shape".
- Memory, already written during the session: the SendMessage twins, the barrier, the Mac load, the Builder freeze, the merge cost, and the deploy-proof cap.
- Direction change: the instances switch is re-landed as a hard cutover of the 4 boxes (copy the workspaces, then delete), not as adoption of legacy boxes.

## Open

- #474 revert and the hub-sdk and agent-app peer fix: hotfix lane builder-hotfix-474.
- Lines in production: waits on the GTR ADC lane's next cut.
- Lanes still die on usage limits and need a manual restart.
