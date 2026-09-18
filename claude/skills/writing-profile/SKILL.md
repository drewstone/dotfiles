---
name: writing-profile
description: Build or update a writing profile from representative samples and test it against held-back writing.
---

# Writing Profile

Capture the choices that distinguish a person's writing, using their actual work and stated preferences.
Find and update an existing profile before creating another.

## Establish the source

Collect representative originals through available sources or user-provided text.
Record authorship, date, format, and audience; remove quoted third-party material and site boilerplate from the analysis.
Separate formats when the writer changes voice across email, social posts, articles, or technical documents.
Use enough varied samples to support the intended format and state coverage gaps.
A single polished page cannot establish a person's general voice.

## Derive useful guidance

Examine structure, sentence rhythm, vocabulary, specificity, claims, humor, transitions, and recurring openings or endings.
Distinguish observed tendencies, explicit preferences, and uncertain inferences.
Absence from a small sample is not a universal ban.
Personal taste about AI writing does not establish what this writer avoids.

Keep rules that alter a drafting decision and support them with examples.
Include positive patterns and demonstrated constraints without forcing one section to be larger.
For multiple audiences or formats, keep shared guidance together and disclose substantial format-specific guidance only when it applies.

## Test and update

Reserve representative samples from profile construction when enough material is available.
Compare the profile against those samples for contradictory or overbroad rules.
Draft a short passage on supported subject matter and assess the specific choices the profile predicts.
A self-score alone does not establish that the writer accepts the result; record actual user feedback when available.

When refreshing a profile, correct or remove unsupported old rules as well as adding new evidence.
Keep representative excerpts attributable and distinguish generated examples from the person's original writing.
Save in the workspace's existing style-guide location.

Report source coverage, distinctive supported patterns, test results, and limits on generalizing to other formats.

## Log the run

```bash
skill-run-log /writing-profile --target "<target>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

- `signal-distill` when a draft needs current factual source material.
- `docs-slop-audit` when the profile is applied to technical documentation whose claims need source review.
