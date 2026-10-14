# Beelink gate capacity terms

- **Capacity claim:** The gate's shared `.capacity.lock` while it selects and locks a checkout. It ends once the repo lock is held.
- **Writer intent:** A live pruner's `.capacity.writer.intent` marker, backed by its exclusive `.capacity.writer.lock`. It lets existing claims drain before the pruner takes `.capacity.lock` exclusively. A marker without the writer lock is abandoned.
- **Repo lock:** The checkout's flock, held while a gate runs. It protects active work when the capacity claim has ended.

The [host disk rule](docs/processes/agent-work.md#host-disk-rule) defines lock order and cleanup requirements.
