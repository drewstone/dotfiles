---
name: writing-profile
description: "Constraints-first writing profile from any source (Twitter/X, blogs, Reddit, LinkedIn, raw text). Captures what the writer does AND doesn't do; catches AI cadence; guides authentic content. Triggers: 'writing-profile', 'learn my voice', 'how does X write'."
---

# Voice Profile — Constraints-First Writing Analysis

Analyze someone's real writing, build a constraints-first writing profile. Constraints (what NOT to do) > prescriptions (what to do). Works with any content source.

## Input

- `/writing-profile` — profile the current user (auto-detect source: check bird config for X, check git log for commit messages, ask if unclear)
- `/writing-profile @handle` — profile an X/Twitter user
- `/writing-profile @handle1 @handle2` — multiple people, separate profiles each
- `/writing-profile --source blog https://example.com` — profile from blog posts
- `/writing-profile --source reddit u/username` — profile from Reddit comment history
- `/writing-profile --source text` — profile from pasted text samples (prompt user to paste)
- `/writing-profile --update <name>` — re-run on existing profile, add constraints without losing existing ones

## Sourcing Content

### Twitter/X
Requires `bird` CLI. Read auth from `~/.config/bird/config.json5`.
```bash
bird user-tweets <handle> -n 50 --plain
```
Filter out pure RTs (note RT patterns for interests). Keep originals, QTs, substantial replies.

### Blog / Website
Use WebFetch to pull recent posts. Extract the author's writing, strip boilerplate/nav/footer. Aim for 10+ posts or 5000+ words.

### Reddit
Fetch user's comment history via Reddit JSON API (`https://www.reddit.com/user/{username}/comments.json?limit=100`). Filter out single-word replies.

### LinkedIn
If accessible, fetch posts. Otherwise ask user to paste samples.

### Raw Text
Ask the user to paste 10+ samples of their writing. Could be emails, Slack messages, docs, anything.

### Mixed Sources
If multiple sources available, use all of them. Note voice differences across platforms (people write differently on Twitter vs blog vs email — document this).

## Analysis

For each person, analyze across these dimensions:

**Structure:**
- Average length per piece (chars, sentences)
- Long-form vs short-form ratio
- Paragraph/line break patterns
- List/bullet usage
- Question frequency (rhetorical vs genuine)
- Opening patterns (how do they start?)
- Closing patterns (how do they end? abruptly? with a CTA? with humor?)

**Vocabulary:**
- Words/phrases used frequently (their verbal fingerprint)
- Words/phrases they NEVER use (check against common AI slop list)
- Intensifiers (or lack thereof)
- Technical specificity level
- Slang, abbreviations, casual grammar
- Profanity usage and comfort level

**Tone:**
- Hedging vs directness
- Humor style (dry, self-deprecating, absurdist, sarcastic, none)
- Emotional range
- How they discuss their own work (announce vs show vs understate)
- How they discuss others' work
- Engagement style

**Content patterns:**
- Topics they gravitate toward
- Personal vs professional vs political mix
- How they reference products/companies (pitch vs factual vs critical)
- Media/link sharing patterns
- What they amplify from others (reveals worldview)

## Build Profile

```markdown
# {Name} Voice Profile

**Source:** {platform(s)}, {N} samples analyzed
**Created:** {date}

## What {name} Does NOT Do
### Structural patterns they never use
### Words and phrases they never use
### AI cadence patterns they never use
### Tone things they avoid
### Formatting they avoid

## What {name} Actually Does
### Voice characteristics
### Content patterns
### Platform differences (if multiple sources)
### Example writing (3-5 representative samples, verbatim)

## Test: Would {name} Write This?
[5-7 specific checks derived from the analysis]

## Real vs AI Examples
[2-3 side-by-side: what AI would write on this topic vs what they actually write]
```

**The "Does NOT Do" section must be larger than the "Actually Does" section.**

## Anti-AI-Cadence Check

Check whether the person ever uses these common AI patterns:
- Setup → elaboration → punchline structure
- "Nobody's talking about X" / "The real problem is X"
- "Good luck [doing X]" / "Let that sink in"
- "Most X are gonna Y" — sweeping predictions
- "Here's the thing" / "Turns out"
- Industry commentary from observer/pundit perspective
- Constructed hypothetical scenarios
- Dramatic one-liner closers
- The Reframe: "It's not about X. It's about Y."

Most real humans don't use these. Add all unused patterns to the ban list.

## Save

Save to `style-guides/{name}-voice.md` (use handle for social profiles, name for others) with frontmatter:
```yaml
---
type: style-guide
name: "{name or handle}"
source: "{platform(s)}"
samples_analyzed: {count}
created: {date}
updated: {date}
status: active
---
```

If updating existing profile:
- Read current profile, scrape fresh content
- Add new constraints, keep existing ones
- Note changes in `## Changelog` at bottom

## Verify

After building, draft ONE test piece in the person's style on a topic from their recent writing. Run it through the profile's own checks. Self-score honestly. Report which checks pass/fail — this validates the profile works.

## Output

Per person profiled:
1. Saved profile path
2. Summary: samples analyzed, constraints generated, top 3 distinguishing characteristics
3. Test draft + self-score

If multiple people, note contrasts between styles.
