# Check examples

Choose evidence that can expose a failure of the applicable criterion.
These examples help select checks; they do not require every artifact to support the same behavior.

| Criterion | Code or product evidence | Documentation or skill evidence |
|---|---|---|
| Correctness | Exercise the specified behavior and relevant boundary inputs. | Check factual claims against current sources; follow the instructions on a representative task. |
| Design | Trace callers and ownership; determine whether an abstraction removes a shared requirement or merely moves code. | Check whether each required decision is stated once and whether references are reached when needed. |
| Robustness | Interrupt or fail a relevant dependency and inspect error, retry, cleanup, and durable state behavior. | Follow the branch for missing inputs or unavailable tools and check that uncertainty remains explicit. |
| Tests | Run a regression that detects the original defect; use an isolated mutation when sensitivity is unclear. | Validate structure and links, then check behavior on a realistic request if instructions changed substantially. |
| Public interface | Complete a supported use case from public documentation and installed exports. | Determine whether the intended reader can act without hidden context or conflicting instructions. |

Search results, assertion counts, and file sizes can locate candidates but do not establish a defect by themselves.
A single caller can justify an interface, and an unreferenced local export may still serve external consumers.
Record the observed consequence and supporting evidence before recommending a change.
