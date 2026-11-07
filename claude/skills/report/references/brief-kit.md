# Brief kit

Use the kit only in the page cases [AGENTS.md](../../../AGENTS.md) names: the owner asked for a page, someone else will read the work, or the evidence cannot fit a terminal answer. A status or analysis the owner reads alone stays in the terminal.
Write a JSON spec, check it, look once, and write the page to `~/reviews/<YYYY-MM-DD>-<slug>.html`; give its absolute path and `open` it. Never publish it as a claude.ai artifact.
A one-fact answer stays a sentence.

Start from [the example spec](../assets/brief-example.json), which uses every block.
The renderer is [brief-kit.html](../assets/brief-kit.html); extend it there instead of hand-writing charts in a page.
It draws each chart at its panel's real width, so labels stay legible on a phone, and takes every color from a theme token, so both themes read.

## Spec

Top level: `title` (a name, two to four words), `eyebrow` (window, owner, freshness), `thesis` and optional `thesisAlert` (the sentence the data supports, and its sharpest consequence), `decision` (the call the brief makes, in one plain sentence), `dek`, `hill` (`metric`, `baseline`, `now`, `target`, `owner`), `stats` (`v`, `l`, `tone` of `bad`/`ok`/`warn`), `learned` (each a mistake, its durable fix with its PR, and its status, as plain text: strings, or `text` with a status `tone`), `sections`, `method`, `caveats`.
A page that lives on a screen (a wall) may also set `theme` (`dark` or `light`), `wide` (the full window width instead of one reading column) and `refresh` (seconds until it reloads itself).

Each section has `key`, `title`, `lede` and `blocks`.
Status tones are `good`, `warn`, `serious`, `crit`, `blind` (no signal) and `accent`; tiles and stats color their numbers with `bad`, `ok` or `warn`.

| Block | Shows | Fields |
|---|---|---|
| `board` | open problems, worst first | `rows[]`: `tone`, `chip`, `when`, `title`, `text`, `owner`, `next` |
| `tiles` | scorecard against tiers | `items[]`: `name`, `value`, `unit`, `tiers[]`, `on` (index), `fine`, `tone` |
| `grouped` | several series per category, against a target | `rows[]`: `label`, optional `note` (such as `n=7`), one cell per series: a number, `null`, or a ratio `"33/36"`; `series[]` (`key`, `label`, at most 3), `unit`, `target`, `targetLabel`, `labels` (`all` or `none`) |
| `hbars` | ranked categories | `rows[]`: `[label, value, inner?, tip?]`, `hot[]`, `unit` or `suffix`, `total` (the whole they are parts of), `target`, `max` |
| `stack` | parts of one whole | `parts[]`: `[label, value, tone]` or `{label, value, group}`, `unit`, `total` |
| `waterfall` | where a span of time went | `rows[]`: `label`, `value`, `group`, `tone`; `unit: "m"`, `start` and `end` (`HH:MM`) |
| `strip` | pass or fail on a time axis | `rows[]`: `t`, `status` (`ok`, `fail`, `warn`, `skip`, `null` for no report), `note` |
| `events` | an incident timeline with the gap between events | `rows[]`: `t`, `status` (`good`, `bad`, `warn`, `info`), `text` (inline HTML); `columns` |
| `timeline` | incidents with detect, owner, cause and fix marks | `start`, `end`, `now`, `ticks[]`, `lanes[]`: `label`, `segments[]` (`from`, `to`, `tone`, `tip`), `marks[]` (`at`, `shape`), `note` |
| `hist` | a count over ordered buckets | `labels[]`, `values[]`, `every`, `highlightMax`, `hot[]`, `unit`, `note` |
| `dots` | events in time, optional height | `start`, `end`, `ticks[]`, `points[]` (`t`, `y`, `tone`, `tip`), `yMax`, `yUnit`, `legend` |
| `heatmap` | state per row over time | `cols`, `colLabels{}`, `rows[]` (`label`, `sub`, `cells[]` of `state`, `tip`), `marker`, `legend` |
| `steps` | a critical path | `items[]`: `state` (`done`/`wait`/`block`/`you`), `title`, `text`, `when` |
| `table` | comparable rows | `head[]`, `rows[][]` (cells may hold inline HTML) |
| `bets` | ranked improvements | `items[]`: `tag`, `title`, `why`, `build`, `premortem`, `target`, `lead` |
| `decisions` | what only the reader can decide | `items[]`: `title`, `text`, `rec` |
| `hills` | one row per hill: trend, position, target, gap, active move, last climb | `rows[]`: `title`, `sub`, `unitTip`, `tone`, `points[]` (`[iso, value, tip]`), `targetValue`, `now`, `unit`, `target`, `gap`, `open` (share of the first gap still open), `move` (`status` of `pending`/`kept`/`failed`/`planned`, `title`, `prediction`, `more`), `since`, `sinceTone` |
| `lines` | values per labelled step, on an axis that includes zero | `labels[]`, `series[]` (`name`, `tone`, `values[]` with `null` gaps, `tips[]`), `yUnit`, `every`, `note` |
| `cols` | side-by-side panels | `cols`, `blocks[]` |
| `text`, `callout` | prose or an emphasized finding | `html` |

## Rules that keep a brief honest

Every number comes from the queried population; name each source, query, window and denominator in `method`.
Give parts their whole: `total` on `hbars` and `stack`, and `start` and `end` on `waterfall`.
Give rates their denominators as ratios, so the page shows `33/36` beside 91.7%.
Give every `timeline`, `dots` and `heatmap` mark a `tip` with its exact value and unit; the model-drawn blocks write their own.
Use `blind` or a `null` status for periods without signal instead of coloring them as failures.
Keep the thesis to what the measurements support, and put projections in bets, labeled as targets, each with a pre-mortem.

## Judge the result

Score the rendered page with the independent judge before it reaches the reader:

The judge reads the complete embedded JSON and static table rows, including content
a page renders with JavaScript. `--dump-input` shows the exact evidence supplied.
If the complete extracted input exceeds the judge's maintained bound, the command
refuses before inference rather than scoring a truncated report. Narrow the report
into independently reviewable artifacts while preserving the complete source.

```bash
~/.claude/skills/report/scripts/brief-judge brief.html --context "<what the reader asked>"   # add --no-ledger for trial runs
```
