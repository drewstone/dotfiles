---
name: chatgpt-fleet
description: Drive ChatGPT Pro work items through the maintained ChatGPT Fleet CLI, including dispatch, recovery, pull request delivery, and checked closure.
---

# ChatGPT Fleet

Use the installed `chatgpt-fleet` command for work delegated to ChatGPT accounts. Read `~/.local/share/tangle-tools/chatgpt-fleet/README.md` and the installed command's `--help` before operating it; they own accounts, model choice, admission, commands, exit codes, browser setup, and retained state. This skill owns the work item's brief and the delivery verdict.

## Reconcile before dispatch

Read `chatgpt-fleet runs --all --json` and `status`. Match unfinished items to their conversation, actual PR, and remaining user outcome. Resume an existing item in its chat; open a new item only for a distinct PR or research question. A captured answer needs the owner's recorded use or rejection through `ack`, and a closed browser tab does not finish a turn.

Check the account's current repository access and write capability before assigning a build. A session's statement that the connector can or cannot write is a claim. Ask it to attempt the authorized branch, commit, and PR operations; retain the exact function and error if one refuses. Use another supported authorized route only after checking current access and ownership. Historical access or a prior model result does not prove current capability.

## Write a useful brief

Use `send --repo OWNER/NAME --item '<one outcome>' --file prompt.md` for a new item and the recorded reference to continue it. Keep the prompt short: intended result, repository, authority and constraints, existing evidence, and an observable completion check. Point to source instead of pasting another agent's transcript. Ask for refusals and tool results explicitly.

For an authorized code change, require an opened PR with its number and URL as the deliverable. A patch or ZIP is not a substitute for the repo's PR path. For research, require checked sources and the decision they support. When a broad scope needs decomposition, use one scope item, then one build item per independently reviewable PR. Continue each item with its named missing deliverable rather than a generic nudge.

## Check and settle the result

Read the captured answer and artifacts, then verify every claimed PR by number, repository, committed diff, required checks, and consumer behavior. Use `files <item> --require` when downloadable files are the deliverable; a missing file does not invalidate a verified PR. Distinguish model, browser, permission, and delivery failures by the CLI's current exit codes and records; fix the cause before retrying.

Record the PR with `pr <item> <number>`. Use `ack` to record how the answer was used or rejected. Close a PR item with `--merged` only when GitHub confirms the merge; close a research item with `--answered` after its answer is checked, or `--abandoned` with the reason when it stops. Preserve exports and active turns during browser recovery; the README owns sweep and archive behavior.

Report verified delivery, unresolved gaps, each gap's owner, and the next completion check. A finished ChatGPT turn is not proof that the user's outcome occurred.
Keep prompts, replies, and downloaded files in the CLI's durable state directory; scratch files can disappear during a long turn.

## Log the run

```bash
skill-run-log /chatgpt-fleet --target "<work item and chat>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Delivered change needs a review | `/critical-audit` | The PR, diff, and acceptance bar |
| A measurement claim needs proof on the real path | `/ground-truth` | The claim and its artifact |
| Required checks fail on the PR | `/converge` | The failure, revision, and behavior to preserve |
