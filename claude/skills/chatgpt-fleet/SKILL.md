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

## Chat rules

The tool enforces these rules.
Know them so you work with them, not around them.

- Every chat lives in the account's one `Tangle Agent Managed` project.
  Never use or change any other project.
  Slot d also holds Drew's personal projects, including `Tangle AI`.
  Read them only; never send into them.
- One chat per work item.
  An item is one PR or one research question.
  Continue its chat until the item merges or is abandoned.
- Open an item with `send --repo OWNER/NAME --item '<one line>' --file prompt.md`.
  The tool writes the ledger entry first.
  It picks the account with the most room that can read the repository, and names the chat `repo · item`.
- Continue it with `send --ref <item>`, `continue <item>`, or `wait <item>`.
  Never start a second chat for the same item.
- `send --second-opinion` is the only way onto a second account, and the chat is labeled.
  Use it for a decision that needs an independent read.
- When the session opens its PR, run `pr <item> <number>`.
  The chat becomes `repo · item · #N`.
- Finish with `close <item> --merged` or `close <item> --abandoned '<reason>'`.
  A merge needs GitHub to show it; only the owning session abandons.
  The tool exports the chat into `~/traces/chatgpt/` and archives it.
  Nothing deletes a chat.
- A sweep timer closes items whose PR merged, restores titles, and exports every managed chat.

## Repository access

A slot's GitHub connector reaches only the repositories connected in that account.
On 2026-09-22 slot a answered 404 for a private repository, and the session said so instead of inventing findings.
Record each slot's reachable repositories in `fleet.json` as `"repos": ["owner/*"]`.
An item then goes only to a slot that can read its repository.
A slot without `repos` takes any repository, so check access before its first build item.

## The loop

Use three rounds.
Do not collapse them into one prompt.

**Round 1 — scope.** Open a research item for the scope, for example `--item 'scope: <area>'`.
Point the session at the system and ask it for the largest set of simple, high-leverage pursuits it can find.
Let the session decompose the work.
A plan the session wrote is a plan it will finish; a plan you wrote is a specification it will argue with.
Forbid questions and require it to decide.

**Round 2 — build and open the PRs.** Open one item per planned PR.
Put that plan entry, a few lines from the scope reply, in the item's prompt, and name the PR as the deliverable.
The session builds it to completion: a branch off the default branch, the commits, and an opened PR.
Require the PR number and URL in the reply, so the claim is checkable, then run `pr <item> <number>`.
Close the scope item once every build item is open.

Never accept a zip.
A zip is a delivery you have to unpack, diff and re-author before it is reviewable.
A pull request is already reviewable, already has CI, and already has a number you can verify.

**Round 3 and later — close named gaps.** Continue the build item's own chat.
Name what is missing and what finished means.
Never send encouragement.
A continue that names no deliverable spends an hour and returns prose.
The `continue` default text asks for every planned item as a PR; pass `--message` with the named gap instead.

## Lessons from Drew's own prompting

Read-only study of the 92 chats in slot d's `Tangle AI` project on 2026-09-22: 515 user messages, median 45 words.

Keep what works:

- Name the finished state: "non-draft PR, mergeable", "one PR per repo", "finish in one PR".
- Push for reuse and simplicity: "evaluate if this already exists", "improve it at the source", "never duplicate".
- Ask for the critique behind each decision: "why is this here, what does it contribute to".
- After a merge, ask what remains and what would prove it works.

Fix what does not:

- Bare encouragement.
  "Continue!", "Finish it!", and "You can do it!" made up 53 of 139 GPT-6 Pro turns.
  33 of those 53 ended with under 400 characters of answer, against 34 of 76 for messages that named work.
  Name the next deliverable and its check instead.
- One chat carrying several items.
  Chats ran to 27 user messages and drifted across topics and repos.
  Open a new item for new work, so the ledger and title say what each chat is for.
- Dictated run-on prompts with several asks in one breath.
  Split them into one outcome, its constraints, and its check.
- Pasting another agent's transcript as the prompt (735, 945 and 4,354 words).
  Summarize the claim to check in a few lines, and point at the repository for the rest.
- Mixing an open product question into a build turn.
  Ask the question as its own item, or put it in the build's acceptance check.

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

Run `files <item> --require` after a build round.
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

On the GTR the fleet runs headless with `CHATGPT_FLEET_CHROME=~/.local/bin/chrome-wayland`.
Measured 2026-09-22: a headless `send` on slot a opened, renamed and answered a GPT-6 Pro item, and `wait` exported it.
Sign a profile in once with a window, or with `login` over ssh.
Headless mode reuses its cookies.
Check `status` for the account, plan, room and managed project per slot before dispatching.

Default slots are `a` to `d` on ports 9301 to 9304.
Every send asks for `gpt-6-pro` and checks the reply against it.

Keep prompts, replies and downloaded files under `~/.local/state/chatgpt-fleet/`.
A scratch directory does not survive a long run.
Five hours of evidence was lost that way, including the probes that would have settled a later question.
The full conversations are in `~/traces/chatgpt/<account>/<conversation>/` after every finished turn.

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The delivered patch needs a quality review | `/polish` | the applied diff and the acceptance bars |
| The delivery claims a measurement | `/ground-truth` | the claim and the artifact it rests on |
| Required checks fail after applying | `/converge` | the failing checks and behavior to preserve |
