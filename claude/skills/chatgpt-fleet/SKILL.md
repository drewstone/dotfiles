---
name: chatgpt-fleet
description: Drive ChatGPT Pro reasoning sessions as a work fleet through headless Chrome, using a short-prompt, large-scope, multi-round loop that ends in applied patches and merged PRs.
---

# ChatGPT Fleet

Run large engineering and research work through parallel ChatGPT Pro sessions.
Each session is a reasoning model with a turn that costs about an hour, so a wasted turn is expensive.
The `chatgpt-fleet` command drives signed-in Chrome profiles over CDP; resolve the installed binary before use.

A session cannot write to GitHub.
It reads repositories with its GitHub tools and returns code as sandbox files.
You apply the patch, verify it, and open the pull request.

## The loop

Use three rounds. Do not collapse them into one prompt.

**Round 1 — scope.** Point the session at the system and ask it for the largest set of simple, high-leverage pursuits it can find.
Let the session decompose the work.
A plan the session wrote is a plan it will finish; a plan you wrote is a specification it will argue with.
Forbid questions and require it to decide.

**Round 2 — build.** Tell it to build every item in the plan it just wrote, to completion, in this turn.
Name the artifact exactly: one unified diff plus the commands that verify it.
This is the `continue` default.

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

Apply the patch against the real base commit and run the tests before opening a pull request.
Check that the tests it added actually execute in the repository's own test command.
A packet that ships a suite no runner collects has delivered nothing, and that defect shipped in this run until it was caught by hand.

State in the pull request that the work came from a fleet delivery and what you verified.

## Ask for refusals

Tell the session that "my tools returned nothing" is the most useful answer it can give.
Require it to mark each claim as a tool result or an absence.
This works: a probe given that instruction volunteered that its installation data did not prove unrestricted access, rather than asserting it did.

## Run it headless

`chatgpt-fleet up --headless` needs a profile that is already signed in on that machine.
Sign in once with a window, then run headless from then on.
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
