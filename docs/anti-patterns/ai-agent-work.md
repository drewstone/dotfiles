# AI Agent Work Anti-Patterns

These are failures specific to agents doing writing and design work.

## Acting Before Seeing

Do not design before inspecting:

- current page screenshot
- current code
- reference sites
- product docs
- active user complaint

For visual work, no screenshot means no claim of quality.

## Reference Theater

Bad:

- "I reviewed competitors" but no extracted patterns
- screenshots saved but not used
- naming Apple, Airbnb, OpenAI, Anthropic, Vercel, Linear, or Stripe without saying what concrete pattern applies

Required output from reference work:

- composition
- typography scale
- color system
- media use
- motion behavior
- density
- what they omit
- what not to copy

## Adding Instead Of Removing

Agents tend to add:

- sections
- labels
- cards
- CTAs
- explanatory copy
- fake diagrams

Default move should be deletion until the page has a clear job.

## One-Pass Design

Bad:

- implement
- build passes
- claim done

Good:

- implement smallest coherent change
- screenshot desktop and mobile
- inspect for anti-patterns
- grep labels
- remove worst visible issue
- repeat until the page is not embarrassing

## The "Everything At Once" Trap

When the user names many products, repos, agents, and ideas, do not put them all on one page.

First classify:

- primary products
- supporting developer tools
- example agents
- research themes
- blog topics
- future bets

Then show only the layer that belongs to the current artifact.
