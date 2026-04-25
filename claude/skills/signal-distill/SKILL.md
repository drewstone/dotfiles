---
name: signal-distill
description: "Collect signals from configured sources (communities, feeds, APIs, DBs), score relevance, extract quotable moments, map to your products/experience, generate interview questions. Outputs a content brief. Triggers: 'signal-distill', 'what's resonating', 'find me content'."
---

# Signal Distill — Intelligence-to-Content Pipeline

Collect signals from configured sources, score relevance to the user's work, extract actionable moments, and output a content brief. Never fabricate — interview the user when depth is unknown.

## 1. Discover Sources

Before scraping, discover what signal sources are available in this workspace:

**Check for tools in the workspace:**
```bash
# Look for signal-gathering tools in common locations
find . -maxdepth 3 -name "cli.py" -o -name "cli.ts" 2>/dev/null | head -10
ls tools/ 2>/dev/null | grep -iE "intel|scraper|community|social|pulse"
```

**Check for databases:**
- SQLite DBs in tool directories (often contain scraped data)
- Signal files in `signals/` directory

**Check for configs:**
- Subreddit lists, keyword configs, RSS feeds in tool directories
- API credentials that indicate connected services (`.env` files)

**Check for cron outputs:**
- Recent log files from scheduled scrapes
- Cached data directories

If NO signal sources exist, help the user set them up:
1. Ask what communities/platforms their audience uses
2. Ask what keywords/topics matter to their products
3. Propose tools to build or configure

## 2. Collect + Score

Run each available source. Examples (adapt to what exists):

```bash
# Run whatever signal tools exist in the workspace. Examples:
# HN intel:        cd tools/hn-intel && python3 cli.py scrape && python3 cli.py distill --json
# Reddit intel:    cd tools/reddit-intel && python3 cli.py scrape && python3 cli.py distill --json
# Community pulse: cd tools/community-pulse && python3 cli.py scan --json

# If no signal tools exist, fall back to web search
# Search for the user's configured topics across HN, Reddit, Twitter
```

If tools have `distill` commands, use them. If not, fetch raw data and classify manually into:
- **hot_take** — contrarian/strong opinions worth riffing on
- **pain_point** — real frustrations and failures
- **data_point** — specific numbers, benchmarks, measurements
- **market_gap** — unmet needs, missing solutions
- **insight** — technical observations, architectural decisions

## 3. Map to User's Work

Understand what the user is actually building:

**Read workspace context:**
- Product hub pages (`products/` directory)
- Recent commits (`git log --oneline -20`)
- Journal entries (recent dates)
- Nerd-snipe board or idea backlog
- Active experiments
- CLAUDE.md for project description

**For each signal, classify:**

**Draft-ready** — User has confirmed deep experience. Evidence: they built it, they wrote about it, it's in their product hub, recent commits touch it, they've tweeted about it.

**Interview-needed** — Signal is hot and COULD connect to their work, but depth is unknown. Generate 2-3 targeted questions:
- "Have you hit [specific problem] in [specific product]?"
- "What broke when you tried [specific thing]?"
- "Does [product] handle [specific capability]?"
- "What's your take on [specific approach]?"

Questions must be specific enough that a one-line answer is useful. Not "Tell me about X" but "Does the sidecar handle Y?"

**Skip** — No real connection to the user's work. List briefly for awareness.

## 4. Output Brief

```markdown
# Signal Brief — {date}

Sources: {list of sources used}
Signals collected: {N total}, {N relevant}

## Draft-Ready (confirmed depth)
For each:
- Signal summary + engagement data (points, comments, upvotes)
- Source attribution (who said it, where)
- Connection to user's specific work
- Raw material for content

## Interview Needed (hot but unconfirmed)
For each:
- Signal summary + why it's resonating
- How it might connect to user's work
- 2-3 specific interview questions

## Skipped
Brief list for awareness

## Patterns
Cross-signal observations: what themes keep recurring, what's trending up/down

## Timing
Best posting times from pattern data (if available from pattern analysis tools)
```

## 5. Save

- Brief: `signals/YYYY-MM-DD/distill-brief.md`
- Raw JSON: `signals/YYYY-MM-DD/distill-brief.json`
- Create a gist if gist workflow is configured

## Rules

- **Never fabricate experiences.** If you don't know whether the user hit a problem, ask.
- **Never launder others' words into first person.** Attribute sources or use as interview prompts.
- **Interview questions must be specific.** Answerable in 1-2 sentences.
- **Read the user's voice profile** before any drafting. If none exists, suggest running `/voice-profile` first.
- **Map to actual products/repos.** Generic industry commentary is not content.
- **Source everything.** Every signal needs: where it came from, who said it, engagement metrics.

## When Interview Questions Get Answered

1. Save answers to `signals/YYYY-MM-DD/interview-{topic}.md`
2. Draft content from REAL answers, run through voice profile
3. A one-liner answer might BE the content — don't over-process

## Cadence

Can run daily. If run via `/loop` or cron:
1. Only scrape if last scrape was >6h ago
2. Deduplicate against previous distill outputs
3. Prioritize new signals over previously surfaced ones

## Bootstrapping a New Workspace

If this is a fresh workspace with no signal sources:
1. Ask the user: "What communities does your audience hang out in?"
2. Ask: "What 5-10 keywords describe your space?"
3. Ask: "What products/competitors should we monitor?"
4. Propose tool setup based on answers
5. Run first scrape + distill after setup
