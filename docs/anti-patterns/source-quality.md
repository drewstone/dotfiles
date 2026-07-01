# Source Quality

This file prevents reference theater.

## The Source Ladder

Tier 1: Doctrine

- official design systems
- official content guides
- official accessibility guidance
- research-backed UX guidance
- source-of-truth product docs
- open-source repos with maintained docs and real adoption

Tier 2: Evidence

- screenshots from live products
- computed styles from live DOM
- product walkthroughs
- public changelogs
- code examples
- benchmark reports

Tier 3: Inspiration

- beautiful websites
- brand pages
- launch pages
- portfolios
- social posts
- case studies

Tier 4: Noise

- generic listicles
- AI-generated best-practice pages
- unattributed "UX tips"
- design trend posts
- screenshots without context
- "inspired by Apple" without a named pattern

## How To Use Sources

Good:

- "GOV.UK says interface writing should be direct and task-oriented; therefore our docs page should not use promotional prose."
- "Braintrust uses real product views above the fold; therefore Tangle product pages need screenshots/traces before they ship."
- "HAX says human-AI systems should handle uncertainty and failures; therefore our agent UI must show stop reason, confidence/provenance, and recovery actions."

Bad:

- "Apple does clean design."
- "Vercel is minimal."
- "Raindrop has color."
- "Braintrust looks premium."
- "Stripe has nice gradients."

If the source summary does not name a concrete transferable pattern, it is not useful yet.

## Source Extraction Template

For every reference used in design or writing work, capture:

- Source:
- Type: doctrine / evidence / inspiration / noise
- Audience:
- Concrete pattern:
- What it forbids:
- What we should copy:
- What we should not copy:
- Tangle-specific implication:
- Verification method:

## Minimum Bar For Site References

For a site reference, collect:

- screenshot at desktop and mobile
- first viewport composition
- typography scale
- spacing and container width
- color system
- media use
- motion behavior
- product artifact treatment
- CTA hierarchy
- what the page omits

Do not proceed from a reference-site audit to implementation until these are written down.

## Minimum Bar For Writing References

For writing/content references, collect:

- headline style
- sentence length
- jargon tolerance
- evidence standard
- link density
- claim style
- what gets omitted
- how uncertainty is handled

## Minimum Bar For AI UX References

For AI product guidance, collect:

- how uncertainty is exposed
- how feedback works
- how user control is preserved
- how failure is explained
- how provenance is shown
- how model/system boundaries are named

If these are absent, the source may be visually useful but not AI-product doctrine.

