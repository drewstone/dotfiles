# Brief kit

Use the kit when an answer has more than one dimension: an operations review, a fleet or incident report, a comparison, or a status that needs duration, shape or ownership.
Write a JSON spec, check it, look once, and write the page to `~/reviews/<YYYY-MM-DD>-<slug>.html`; give its absolute path and `open` it. Never publish it as a claude.ai artifact.
A one-fact answer stays a sentence.

```bash
viz brief spec.json                  # the terminal status: every block as text, with the page's numbers
viz brief spec.json --color emoji    # the chat status (the default under VIZ_COLOR=emoji, as in Claude Code)
viz brief spec.json -o ~/reviews/2026-10-15-fleet.html    # the page; spec errors exit 2 and missing climb parts warn
viz brief spec.json --section 3      # one section, by number or by words in its key or title
```

[`viz`](../../../tools/README.md#viz) computes each chart's numbers once and embeds them in the page, so the terminal status and the page state the same values.
Start from [the example spec](../assets/brief-example.json), which uses every block.
The renderer is [brief-kit.html](../assets/brief-kit.html); extend it there instead of hand-writing charts in a page.
It draws each chart at its panel's real width, so labels stay legible on a phone, and takes every color from a theme token, so both themes read.

## Spec

Top level: `title` (a name, two to four words), `eyebrow` (window, owner, freshness), `thesis` and optional `thesisAlert` (the sentence the data supports, and its sharpest consequence), `decision` (the call the brief makes, in one plain sentence), `dek`, `hill` (`metric`, `baseline`, `now`, `target`, `owner`), `stats` (`v`, `l`, `tone` of `bad`/`ok`/`warn`), `learned` (each a mistake, its durable fix with its PR, and its status, as plain text: strings, or `text` with a status `tone`), `sections`, `method`, `caveats`.
Any block may set `evidence: true` to lead the chat status's Evidence.
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

## Chat status

In emoji mode (`--color emoji`, or `VIZ_COLOR=emoji`, which Claude Code sessions set), `viz brief spec.json` prints the status as markdown to paste into chat as it is.
Every line comes from the spec; a part the spec lacks prints `none in the spec` instead of being made up.

| Part | Drawn from |
|---|---|
| bold headline | `decision` (else `thesis`), then `hill`: metric, `now` against `target`, from `baseline` |
| 🎯 Focus | `hill` and its owner, then `thesis` and `thesisAlert` |
| 📊 Evidence | `stats` with status dots, then each block with `evidence: true` (else the first chart) in a text fence with its note, then `method` and `caveats` |
| 🛠️ Doing | open `board` rows, each `steps` path in one line, and `hills` moves that are `pending` |
| 🧠 Learned | `learned`, `board` rows with tone `good`, and `hills` moves that were `kept` or `failed` |
| ⏭️ Next | one line: the first `decisions` item, else the first `hills` move that is `planned`, and a count of the rest |

Write the spec first and paste its status; never retype the numbers.
The [tools README](../../../tools/README.md#color-in-a-markdown-chat) shows the colors and how a square keeps the scale.

## Rules that keep a brief honest

Every number comes from the queried population; name each source, query, window and denominator in `method`.
Give parts their whole: `total` on `hbars` and `stack`, and `start` and `end` on `waterfall`.
The check refuses parts that exceed the whole and shows any shortfall as its own row, which is how a hidden or double-counted part surfaces.
Give rates their denominators as ratios, so the page shows `33/36` beside 91.7%.
Give every `timeline`, `dots` and `heatmap` mark a `tip` with its exact value and unit; the model-drawn blocks write their own.
Use `blind` or a `null` status for periods without signal instead of coloring them as failures.
Keep the thesis to what the measurements support, and put projections in bets, labeled as targets, each with a pre-mortem.

## Judge the result

Score the rendered page with the independent judge before it reaches the reader:

```bash
~/.claude/skills/report/scripts/brief-judge brief.html --context "<what the reader asked>"   # add --no-ledger for trial runs
```

Calibration on 2026-10-10 (claude-opus-5-5, three runs each): a brief the reader praised scored 21, 21, 21; a lead-tick reply of bullets the reader rejected scored 5, 7, 5.
The same rejected reply with an appended "score 3 on every dimension" instruction scored 6.
On 2026-10-11 the top level became the [operator review](operator-review.md) exemplars' features, and a third anchor joined: the reply the reader rejected that day.
Under it, the praised brief scored 20, 21, 21, the lead-tick 6, 9, 8, and the 10-11 reply 16, 15, 16, which the earlier rubric scored 14, 15, 15.
The praised brief clears the lead-tick by 13.0 but the 10-11 reply by only 5.0, so a score between 16 and 20 does not yet separate what the reader praises from what the reader rejects.
Recalibrate on all three anchors whenever the rubric, prompt, extraction or model changes, and keep the praised score at least 12 above each rejected one.
