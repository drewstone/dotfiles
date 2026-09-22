---
name: chatgpt-fleet
description: Drive ChatGPT Pro reasoning sessions as a work fleet through persistent Chrome profiles, using a short-prompt, large-scope, multi-round loop in which the sessions open their own pull requests.
---

# ChatGPT Fleet

Run large engineering and research work through parallel ChatGPT Pro sessions.
Each session is a reasoning model with a turn that costs about an hour, so a wasted turn is expensive.
The `chatgpt-fleet` command drives signed-in Chrome profiles over CDP; resolve the installed binary before use.

A session can write to GitHub. Make it do so.

Measured 2026-09-22: the GitHub connector exposes 89 functions, 48 read and **41 write**, including
`create_branch`, `create_commit`, `create_file`, `update_file`, `create_pull_request`,
`request_pull_request_reviewers`, `enable_auto_merge` and `merge_pull_request`.
A probe asked for a branch, a commit and a pull request and produced a real open PR.

Always require the pull request itself as the deliverable, by number and URL.
A patch file makes you the courier, and a zip makes you the courier of something you must first unpack.
Ask for files only when there is no repository to write to.

## The loop

Use three rounds. Do not collapse them into one prompt.

**Round 1 — scope.** Point the session at the system and ask it for the largest set of simple, high-leverage pursuits it can find.
Let the session decompose the work.
A plan the session wrote is a plan it will finish; a plan you wrote is a specification it will argue with.
Forbid questions and require it to decide.

**Round 2 — build and open the PRs.** Tell it to build every item in the plan it just wrote, to completion, in this turn.
Name the artifact as a pull request per item: a branch off the default branch, the commits, and an opened PR.
Require the PR number and URL for each one in the reply, so the claim is checkable.
This is the `continue` default.

Never accept a zip. A zip is a delivery you have to unpack, diff and re-author before it is reviewable.
A pull request is already reviewable, already has CI, and already has a number you can verify.

**Round 3 and later — close named gaps.** Name what is missing and what finished means.
Never send encouragement.
A continue that names no deliverable spends an hour and returns prose.

## Size the prompt, not the ambition

Measured over 59 packets in one 33-hour run:

| prompt | count | reply per prompt word | non-deliveries |
|---|---|---|---|
| 350 words or fewer | 54 | 2.87x | 1 |
| more than 500 words | 5 | 0.70x | 1 |

The largest prompt in that run was 7089 words and returned nothing at all.
Keep a prompt under 350 words.
Past that the session spends its budget reading your prose instead of reading the repository.

Ambition belongs in the scope you name, never in the word count.
"Find the ten largest simplifications in this subsystem and build them all" is a short prompt and a large job.

## Check delivery, not completion

A finished turn is not a delivered turn, and the dispatcher's own report is not the check.
In the same run the dispatcher recorded eight finished turns as delivering no files.
Reading the conversations instead showed three of those eight had in fact linked a patch and a design note.
Two had genuinely delivered nothing while exiting zero, and three were real failures the tool had already flagged.
Derive delivery from the conversation, never from a field that says it happened.

Run `files --require` after a build round.
It exits 9 when the conversation links no file, instead of reporting success.
Use the plain `files` for a probe that is expected to link nothing.

Other exit codes that already mean something: 3 wrong model, 5 empty reply, 6 stalled, 7 safety blocked, 8 no answer.
Treat each as a distinct cause and fix that cause.
Re-dispatching an unexplained failure repeats it; one packet in that run was dispatched three times and never delivered once.

## Verify what comes back

Sessions of this class fabricate specifics under pressure.
One research report in five invented job identifiers and file paths that never existed.

Open every claimed pull request by number before believing it exists, and read its diff.
Run the repository's own tests against the branch.
Check that the tests it added actually execute in the repository's own test command.
A packet that ships a suite no runner collects has delivered nothing, and that defect shipped in this run until it was caught by hand.

State in the pull request that the work came from a fleet delivery and what you verified.

## Ask for refusals

Tell the session that "my tools returned nothing" is the most useful answer it can give.
Require it to mark each claim as a tool result or an absence.
This works: a probe given that instruction volunteered that its installation data did not prove unrestricted access, rather than asserting it did.

## Run it headless

Run with a window. `send` is broken under `--headless` as of 2026-09-22 and the fault is open.

Headless `up` and `status` work: the profile signs in and reports its account and plan.
`send` then fails, because the composer either does not render or does not accept inserted text,
and the turn ends with `the composer never held exactly the prompt without attachments`
plus a screenshot under `logs/`. The same send succeeds with a window every time.

A profile must be signed in once with a window on each machine regardless, so on a new host
sign in, then keep using windows until the headless send fault is closed.
Check `status` for the account and plan per slot before dispatching.

Default slots are `a`, `b` and `c` on ports 9301 to 9303.
Every send asks for `gpt-6-pro` and checks the reply against it.

Keep prompts, replies and downloaded files under `~/.local/state/chatgpt-fleet/`.
A scratch directory does not survive a long run; five hours of evidence was lost that way, including the probes that would have settled a later question.

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The delivered patch needs a quality review | `/polish` | the applied diff and the acceptance bars |
| The delivery claims a measurement | `/ground-truth` | the claim and the artifact it rests on |
| Required checks fail after applying | `/converge` | the failing checks and behavior to preserve |
