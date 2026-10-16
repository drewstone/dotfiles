# Beelink gate capacity terms

- **Capacity claim:** The gate's shared `.capacity.lock` while it selects and locks a checkout. It ends once the repo lock is held.
- **Writer intent:** A pruner's `.capacity.writer.intent` marker, backed by its exclusive `.capacity.writer.lock`, only while detaching an idle checkout. The writer lock remains authoritative before marker creation and after unlink. Both exclusive locks are nonblocking. Scans and recursive removal never hold intent. A marker without the writer lock is abandoned.
- **Repo lock:** The checkout's flock, held while a gate runs. It protects active work when the capacity claim has ended.

The [host disk rule](docs/processes/agent-work.md#host-disk-rule) defines lock order and cleanup requirements.
