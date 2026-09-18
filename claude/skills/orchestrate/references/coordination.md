# Coordination cases

## Dependencies

| Input needed by the next task | Action |
|---|---|
| One item's result | Check it and start that item's next task |
| Every item for ranking or integration | Collect and check the complete set |
| The first result satisfying a stated condition | Check it, then cancel remaining work if supported and authorized |

Choose each dependency from the actual data consumed.
A workflow can combine these cases.

## Failure and cancellation

Read the execution tool's failure behavior before assuming sibling tasks continue.
Inspect their final states and preserve completed artifacts before retrying.
Cancellation ends execution; it does not establish whether a remote write committed.
For consequential remote actions, reconcile authoritative state before a retry.

## Resume

Inspect live workers and saved artifacts before spawning replacements.
Reconcile task identities, completed checks, unfinished dependencies, and spent resources with existing project state.
A quiet worker is not necessarily failed; inspect its progress before replacing or interrupting it.

For search tasks, record examined and unavailable sources.
Empty rounds do not establish exhaustive coverage.
For comparisons, define the selection criterion before seeing outputs and use a measurement capable of rejecting a bad result.
