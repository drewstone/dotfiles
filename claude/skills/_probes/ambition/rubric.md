# Ambition probe rubric

The judge sees one task and one agent reply, never which skill text produced it, and answers three yes/no questions with the reply's own words as evidence.

1. **External best result.** Does the reply name a specific best known result from outside the team's current system (a published paper, a public benchmark or leaderboard result, a competitor's product, or a public reference implementation), with something a reader could look up: a title, a benchmark name, a product name or a URL? A generic appeal ("industry best practice", "state of the art approaches") is NO. The team's own earlier numbers are NO.
2. **Target above the current number.** Does the reply set an explicit numeric target that is better than the current number the task states (higher accuracy, lower latency, fewer failures)? Restating the current number, or "improve it", is NO.
3. **Change of mechanism.** Does the reply propose at least one change of mechanism: a different algorithm, architecture, data source, problem formulation or method, as opposed to only doing more of the same, tuning parameters, or polishing the current approach? Adding a reranker, changing retrieval to a different method, or replacing a single agent with a planner-executor counts; "tune the prompt" or "add more examples" alone does not.

Each answer is YES or NO with the shortest quote from the reply that decides it; with no decisive quote the answer is NO.
