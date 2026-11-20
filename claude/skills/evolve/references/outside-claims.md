# Outside claims

Read this when a paper, post, repository or technique may change what the hill tries next.

1. Read the method or code behind the claim; a summary or abstract rarely establishes the part being considered.
2. Record the claim, its evidence, mechanism, assumptions and limits, separating causal evidence from a plausible mechanism and an observed correlation.
3. Search our system for the same behavior under any name, across knowledge records, exports, implementations and callers, and record the surfaces searched. Do not adopt an idea because its terminology sounds new, or reject it because our implementation has a different name.
4. Compare it with what our system does under the relevant scale, data, resources and required behavior, and run the cheapest check that could refute the claimed benefit.

| Verdict | Meaning |
|---|---|
| `ADOPT` | Supported for the intended use; state the evidence and where it applies |
| `ADAPT` | The mechanism transfers with specific changes; state what differs and how it was checked |
| `REJECT` | Evidence or required behavior rules it out, or our system already does better |
| `DEFER` | A material uncertainty remains; name the deciding test and when to run it |

Where the project's knowledge base keeps `prior` pages, record the claim `external-unverified` until a local reproduction promotes it to `measured`, keeping the outside source and the local result separately attributable.
