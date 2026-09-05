# Custom service releases

Use the repository's current service and release instructions for exact commands.
Resolve the live host, process, artifact location, traffic path, and service owner before changing a running system.

## Artifact and compatibility

Prefer a reproducible artifact from local or controlled CI builds when the production host is resource-constrained.
Verify the target OS, architecture, runtime or library dependencies, configuration, file ownership, and permissions.
Record the artifact digest and source revision; modification time alone does not establish identity.

Check migration and protocol dependencies before choosing an order or rollback strategy.
If older code cannot safely read changed data, use the project's compatible roll-forward or migration recovery procedure.
A copied binary is not a rollback plan when its data has changed incompatibly.

## Replacement

For a directly managed binary or service:

1. Transfer the candidate to a separate path and verify its digest on the target.
2. Record the current artifact and service state, and preserve the required recovery artifact.
3. Drain or stop traffic according to the service's availability and in-flight work requirements.
4. Apply ownership and executable permissions before activating the candidate.
5. Replace or switch artifacts atomically on a compatible filesystem when the release method supports it.
6. Start or reload the service using the documented mechanism.
7. Check process health, startup logs, the served artifact, and a domain-critical user flow.

Do not overwrite source files to synchronize a divergent remote checkout.
Use the release artifact or resolve the source change through the repository's normal workflow.

## Recovery evidence

If a live check fails, follow the selected recovery procedure and check the recovered service through the same user path.
Record the failure, affected artifact, recovery operation, observed result, and remaining state uncertainty.
Preserve logs needed for diagnosis without exposing credentials or user data.
