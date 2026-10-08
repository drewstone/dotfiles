# Worst-case data

Derived from emilkowalski/skills break-ui (MIT).

Read this when stress-testing a component or screen with realistic extreme content.

1. List each rendered field with its source, type, documented limit, and whether it is optional.
2. Build a worst-case fixture for each field from the table below, plus empty, one, and huge collections, and keep the realistic fixture beside it.
3. Switch between them without touching production behavior: a development-only `?data=worst` parameter, a prototype route, or a standalone HTML file.
4. Render at supported widths and themes and record every break with its cause and fix.

Use `example.com`, `example.org`, or `.test` for emails and URLs.

| Field | Values that break layouts |
|---|---|
| Names | `Aleksandra Wiśniewska-Kowalczyk`, `Christopher Alexander Montgomery III`, `Jo`, `J`, `Đặng Thị Ngọc Hân`, `王秀英`, `نور الهدى عبد الرحمن`, `María José de la Cruz y Fernández`, `🦊 Fox`, `👩🏽‍💻 Priya`, `  Sam   Lee `, missing name |
| Unbreakable strings | `bartholomew.fitzgerald@northwind-industries-holdings.example.com`, `a@b.co`, a 100-character URL, a UUID, `Q3 Board Deck — FINAL (revised) v12 [approved by legal].pdf` |
| Labels from data | a 55-character job title, `Benachrichtigungseinstellungen`, translated copy about 30% longer, twelve tags, one very long tag, empty or whitespace title, `<script>alert(1)</script>`, a newline in a single-line field, 2,000 pasted characters |
| Numbers and money | `0`, `1`, `1284`, `1000000`, `12345678.90` as currency, `-42.5`, `0.1 + 0.2`, `142%`, `null`, `NaN`, locale separators, a value changing live |
| Collections | 0, 1, exactly a page, a page plus one, 1,000+ unpaginated, one item ten times larger, duplicate names |
| Time | now, 12 days, 11 months, 3 years, a future date, `1970-01-01`, a timestamp near midnight in another time zone, `1,284 hours` |
| Media | avatar URL that 404s, no avatar, a 4000×200 image |

| Break | Fix |
|---|---|
| Avatar or icon squashed | `flex-shrink: 0` on fixed-size items |
| Text overflows instead of wrapping | `min-width: 0` on the text column (`minmax(0, 1fr)` in grid) |
| Email or URL runs off the edge | `overflow-wrap: anywhere` |
| Trailing action pushed off-screen | `min-width: 0` on the middle, `flex-shrink: 0` on the action |
| Badge wraps or squeezes the name | `white-space: nowrap; flex-shrink: 0` on the badge, and choose what yields |
| Wrong initials or a broken glyph | Grapheme-aware initials (`Intl.Segmenter`), first and last word |
| "1 members" | `Intl.PluralRules` |
| Raw or jittering numbers | `Intl.NumberFormat`, `tabular-nums`, null guards |
| Hand-built relative dates | `Intl.RelativeTimeFormat` and `Intl.DateTimeFormat`, absolute after about a week |
| Diacritics clipped | Looser line-height, no clipping on text boxes |
| Broken image | Initials fallback; `object-fit: cover` |
| Ellipsis hides the value | A tooltip or the full value in a detail view |
| Empty optional field leaves a dash or gap | Omit the line or reserve its height on purpose |

Report each break with the field, value, viewport, cause, and fix, and recheck it after the fix.
