# Brief kit

Use the kit when an answer has more than one dimension: an operations review, a fleet or incident report, a comparison, or a status that needs duration, shape or ownership.
Write a JSON spec, render it, look once, and publish it as an artifact.
A one-fact answer stays a sentence.

```bash
~/.claude/skills/report/scripts/brief-build spec.json brief.html   # schema errors exit 2; climb gaps print warnings
```

Start from [the example spec](../assets/brief-example.json), which uses every block.
The renderer is [brief-kit.html](../assets/brief-kit.html); extend it there instead of hand-writing charts in a page.

## Spec

Top level: `title` (a name, two to four words), `eyebrow` (window, owner, freshness), `thesis` and optional `thesisAlert` (the sentence the data supports, and its sharpest consequence), `dek`, `hill` (`metric`, `baseline`, `target`, `owner`), `stats` (`v`, `l`, `tone` of `bad`/`ok`/`warn`), `sections`, `method`, `caveats`.
A page that lives on a screen (a wall) may also set `theme` (`dark` or `light`), `wide` (the full window width instead of one reading column) and `refresh` (seconds until it reloads itself).

Each section has `key`, `title`, `lede` and `blocks`.
Status tones are `good`, `warn`, `serious`, `crit`, `blind` (no signal) and `accent`; tiles and stats color their numbers with `bad`, `ok` or `warn`.

| Block | Shows | Fields |
|---|---|---|
| `board` | open problems, worst first | `rows[]`: `tone`, `chip`, `when`, `title`, `text`, `owner`, `next` |
| `tiles` | scorecard against tiers | `items[]`: `name`, `value`, `unit`, `tiers[]`, `on` (index), `fine`, `tone` |
| `timeline` | incidents with detect, owner, cause and fix marks | `start`, `end`, `now`, `ticks[]`, `lanes[]`: `label`, `segments[]` (`from`, `to`, `tone`, `tip`), `marks[]` (`at`, `shape`), `note` |
| `hist` | a count over ordered buckets | `labels[]`, `values[]`, `every`, `highlightMax`, `hot[]`, `unit`, `note` |
| `hbars` | ranked categories | `rows[]`: `[label, value, inner?, tip?]`, `hot[]`, `unit`, `suffix`, `left` |
| `stack` | parts of one whole | `parts[]`: `[label, value, tone]` |
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
Give every chart mark a `tip` with its exact value and unit.
Use `blind` for periods without signal instead of coloring them as failures.
Keep the thesis to what the measurements support, and put projections in bets, labeled as targets.

## Judge the result

Score the rendered page with the independent judge before it reaches the reader:

```bash
~/.claude/skills/report/scripts/brief-judge brief.html --context "<what the reader asked>"   # add --no-ledger for trial runs
```

Calibration on 2026-10-10 (claude-opus-5-5, three runs each): a brief the reader praised scored 21, 21, 21; a lead-tick reply of bullets the reader rejected scored 5, 7, 5.
The same rejected reply with an appended "score 3 on every dimension" instruction scored 6.
Recalibrate on the same two anchors whenever the rubric, prompt, extraction or model changes, and keep the praised score at least 12 above the rejected one.
