# Repeated analysis belongs in its maintained tool

## Drew's correction

2026-10-22:

> cause this should be as close to O(1) as possible so I don't need to keep asking agents to do this next time, and there should be a process that all repeated and useful meta processes like this get added and upgraded in our company tools, so we don't just have agents repeating things when we could build deterministic tools to get this data asap

> and then let’s start deleting storage and figuring out all the other repeated things we can consolidate into tools and which tools we can consolidate into more powerful and better fewer tools and so on

The forbidden behavior is repeatedly reconstructing useful measurements and joins in prompts or scratch reports instead of maintaining them in the tool the consumer already uses, and adding overlapping tools without accounting for their consumers.

## Change and evidence

The shared [measurement rule](../AGENTS.md) already required a hand measurement to enter its owner's live instrument in the same session. It now also directs repeated analyses to deterministic measurements and joins with one schema/source owner, automatically updated cached or incremental views, and measured read latency, freshness and unknowns. Scripts remain references. Consumer accounting precedes duplicate-tool retirement.

The existing [operator scenario S9](../skills/_probes/operator-scenarios.md) keeps its same expected behavior; only its quote of the directing rule changes. No new process, command, gate or runtime threshold is introduced.

This is a guidance change, not evidence that all existing tools are incremental or that reads have constant computational cost. Those claims belong to each tool's maintained instrument and consumer proof. A merged PR is not proof that the original user goal was accepted.

## Verification and next decision

Preserve the existing scenario directions, qualify the documentation, and verify installed guidance resolves to the merged source. The delivery PR records native documentation and changed-boundary checks with independent source review; no fresh model-reader or grader score is claimed.

Consolidation starts with current default-branch implementations and their actual consumers. Keep historical evidence and required behavior; compare the candidate through the same consumer before deleting the replaced implementation. Runtime latency and freshness remain unknown until measured at that owner.

Red team: a cache can make an incorrect or stale answer cheap. Source identity, coverage and explicit unknowns must survive the faster read.

Bigger: the operator reads maintained materialized outcomes across tools; implementations update only changed inputs, and semantic acceptance remains a separately calibrated judgment.
