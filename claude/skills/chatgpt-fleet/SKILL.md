---
name: chatgpt-fleet
description: Drive ChatGPT Pro sessions as a work fleet through persistent Chrome profiles, with short prompts, large scope, and sessions that open their own PRs.
---

# ChatGPT Fleet

Run large engineering and research work through parallel ChatGPT Pro sessions.
Each session is a reasoning model with a turn that costs about an hour, so a wasted turn is expensive.
The `chatgpt-fleet` command drives signed-in Chrome profiles over CDP; resolve the installed binary before use.

A session can write to GitHub. Make it do so.

Treat a session's capability claim as a hypothesis, not a tool result.
For an authorized build, discover its GitHub tools and attempt the task's branch, commit, and pull request operations.
Ask it to invoke available write functions even when it initially describes the connector as read-only.
Require the attempted function, target repository, and exact returned error before accepting a write blocker.
Historical write access is evidence to probe current access, not proof that every account can write today.
When a tool is missing or refuses, check connector selection and repository access, then use another supported authorized route.
Continue useful implementation while resolving access; retain the work and give the failed delivery a named recovery owner.
Report observed permissions honestly and preserve enforced protections.

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
- Finish a PR item with `close <item> --merged`; GitHub must show the merge.
  Finish a research item with `close <item> --answered '<summary>'`.
  Stop an item with `close <item> --abandoned '<reason>'`.
  Only the owning session answers or abandons an item.
  The tool exports the chat into `~/traces/chatgpt/` and archives it.
  Nothing deletes a chat.
- A sweep timer closes items whose PR merged, restores titles, and exports every managed chat.

## Revisit work and recover windows

Read `runs --all --json` before dispatching more work.
Set `--limit` high enough to cover the ledger; the default view can omit older items.
Review pending answers and failure states, then give each unfinished item an owner and an exact next deliverable.
Read the captured answer before its owner records `ack <item>`.
Continue the same item by reference; a closed browser tab does not finish or abandon its work.

Reconcile each unfinished item with its captured conversation, actual PRs, and remaining consumer or live acceptance.
An acknowledged answer or merged prerequisite does not complete the original outcome.
Give every remaining gap an owner, a concrete next deliverable, and its completion check.
Resume named gaps in the existing chat; retire duplicate or superseded items with retained evidence.
Report the audited window and unresolved count instead of claiming the whole fleet is finished.

Use the maintained sweep to capture results and retire eligible tool-owned tabs.
Keep active turns, unsent drafts, unreadable tabs, and unmanaged conversations intact.
Revisit pending items through their recorded conversation links instead of keeping every chat open.
Check current cleanup behavior in the installed command's README before applying it to a recovered browser.

After a browser or machine restart, restore profiles individually and verify the signed-in account and actual tab count.
Resume tracked work from the ledger instead of restoring every previous tab.
Check the owner process separately; a restored window does not prove that its worker resumed.

## Repository access

A slot's GitHub connector reaches only the repositories connected in that account.
On 2026-09-22 slot a answered 404 for a private repository, and the session said so instead of inventing findings.
Record each slot's reachable repositories in `fleet.json` as `"repos": ["owner/*"]`.
An item then goes only to a slot that can read its repository.
A slot without `repos` takes any repository, so check access before its first build item.
Write access can disappear per account: on 2026-10-04 slot a listed 48 read-only GitHub functions and could not open a PR, after writing PRs on 09-30.
Abandon such an item with the session's function list as proof, and resend it with `--permitted-slot` naming an account that wrote recently.

## The loop

Use three rounds.
Use the scope round when the work needs decomposition.
When a current accepted plan already defines the outcome, start or resume its build item directly.

**Round 1 — scope.** Open a research item for the scope, for example `--item 'scope: <area>'`.
Point the session at the system and ask it for the largest set of simple, high-leverage pursuits it can find.
Let the session decompose the work.
A plan the session wrote is a plan it will finish; a plan you wrote is a specification it will argue with.
Forbid questions and require it to decide.
For broad improvement work, compare the best 5–10 substantial pursuits and alternative approaches.
Weigh user value, correctness, simplification, reuse, performance evidence, dependencies, and risk.
Identify existing implementations and current library features before proposing new abstractions.
Choose coherent batches that close multiple related gaps, with explicit ownership and observable acceptance.

**Round 2 — build and open the PRs.** Open one item per planned PR.
Copy that plan entry from the scope reply into the item's prompt.
Name the opened PR as the deliverable.
Require the PR number and URL in the reply.
Require an actual write-tool attempt when the session claims it can only provide prose or patches.
Record the number with `pr <item> <number>`.
Close the scope item with `--answered` once every build item is open.

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
Treat this as a prompting guideline, not a scope limit.
Point to source and retained evidence so the session spends its budget doing the work.

Ambition belongs in the scope you name, never in the word count.
"Find the ten largest simplifications in this subsystem and build them all" is a short prompt and a large job.

## Check delivery, not completion

A finished turn is not a delivered turn, and the dispatcher's own report is not the check.
In the same run the dispatcher recorded eight finished turns as delivering no files.
Reading the conversations instead showed three of those eight had in fact linked a patch and a design note.
Two had genuinely delivered nothing while exiting zero, and three were real failures the tool had already flagged.
Derive delivery from the conversation, never from a field that says it happened.

For a repository build, verify the actual PR and its committed diff first.
Use `files <item> --require` when downloadable artifacts are part of the requested delivery.
It exits 9 when the conversation links no file; that alone does not invalidate a verified PR delivery.
Use plain `files` to inspect optional retained artifacts.

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

## See what the fleet does

`chatgpt-fleet live` prints each slot's tab, conversation, state and current item, plus last-24-hour counts.
A minute timer on the GTR publishes the same contract to `~/.local/state/fleet/chatgpt.json` for the wall.
Read it before dispatching and send work to idle slots: over 2026-09-27 to 10-04 the fleet ran about 5% of its turn capacity.
Every export also writes `otlp/spans.jsonl`, so `traces analyze|facts|validate --otlp ~/traces/chatgpt` read Pro work like any agent run.

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

## Log the run

```bash
skill-run-log /chatgpt-fleet --target "<work item and chat>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The delivered patch needs a quality review | `/critical-audit` | the applied diff and the acceptance bars |
| The delivery claims a measurement | `/ground-truth` | the claim and the artifact it rests on |
| Required checks fail after applying | `/converge` | the failing checks and behavior to preserve |
