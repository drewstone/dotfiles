---
name: signal-distill
description: Turn current, attributable source signals into content briefs tied to the user’s actual work.
---

# Signal Distill

Produce useful content angles from real community, feed, API, or database evidence.
Keep observed conversations separate from inferred positioning and the user's own experience.

## Collect relevant evidence

Read the workspace's current audience, product, and content instructions.
Discover available source tools and recent collected records before fetching again.
Use their current help and connection state; inspect no credential values merely to discover a source.
If configured sources are absent, use available search within the task instead of creating a collection system.

Choose a source sample and time window suited to the topic.
Retain source, author, URL, timestamp, raw passage, and available engagement data.
Mark missing fields and unavailable sources rather than inventing completeness.
Deduplicate repeated stories and distinguish firsthand reports from reposts.

## Turn signals into a brief

Assess relevance, novelty, credibility, urgency, and fit to the intended audience.
Use explicit scores only when a shared rubric or ranking decision needs them; explain the evidence behind the ranking.
Cluster signals by the claim or need they reveal.
For each proposed angle, name the user's relevant product, work, or experience and verify that connection.

- Ready to draft: the user's experience and supporting facts are established.
- Needs an answer: identify the specific missing experience or opinion without inventing it.
- Exclude: the source is unsupported or has no useful connection to the audience and work.

Quote accurately and attribute other people's words.
A selected sample cannot establish overall community sentiment or a trend without comparable observations over time.

Deliver source links, the proposed angle and format, evidence of relevance, and material limits.
Save the brief in the workspace's existing content workflow when persistence is useful.
This skill prepares the brief; publication requires authorization for that action.

## Log the run

```bash
skill-run-log /signal-distill --target "<target>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

- `writing-profile` when drafting requires a voice that has no adequate existing profile.
- `product-design` when the selected brief requires an original visual treatment.
- `product-innovation-audit` when supported signals reveal a product opportunity the user wants evaluated.
