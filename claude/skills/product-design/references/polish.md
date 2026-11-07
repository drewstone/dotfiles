# Interface polish

Derived from emilkowalski/skills emil-design-eng, apple-design, and mobile-native (MIT).

Read this when implementing or reviewing interface detail: press feedback, materials, typography, foundations, or phone behavior. For animation or gestures, read [motion](motion.md).

Report review findings as one table: `| Before | After | Why |`, one row per issue.

For Tangle work, read the [design bible](https://github.com/tangle-network/brand/blob/main/docs/design-bible.md) for principles, visual grammar, motion, interaction and acceptance. Brand owns shared policy and executable token values; this file owns procedure.

## Review detail

1. Compare the rendered control with its shared component story in rest, press, focus, pending and error states that apply.
2. Inspect computed type, spacing, surface and state roles against the owner's tokens. Correct the owner before adding a downstream equivalent.
3. Check translucent layers over the content that actually scrolls behind them. Inspect supported contrast/transparency preferences independently.
4. Compare optical edges and reading measure using matched screenshots. Record independent craft findings separately from functional assertions.
5. Remove artificial input-path waits and inspect timer behavior in hidden tabs. Verify the outcome rather than treating a particular CSS technique as a pass.

## Phones

| Symptom | Fix |
|---|---|
| Hover stays stuck after a tap | Put hover rules in `@media (hover: hover) and (pointer: fine)` |
| Gray or blue flash on tap | Inspect native and custom press feedback together before suppressing the native highlight |
| Layout height wrong | `100dvh` for app shells and bottom-pinned UI, `100svh` for a hero |
| Page zooms into an input | Input font size at least 16px; never `user-scalable=no` or `maximum-scale=1` |
| Tap feels slow | Pointer-down feedback plus `touch-action: manipulation` |
| Pull-to-refresh hijacks scrolling | Inspect overscroll on the intended scroll container and preserve required browser navigation |
| Content stops at the notch | `viewport-fit=cover` with `env(safe-area-inset-*)` |
| Long press selects button text | `user-select: none` on controls only |
| Horizontal carousel scrolls the page | `touch-action: pan-y` on the gesture surface |
| Status bar color wrong | One `theme-color` meta per `prefers-color-scheme` |

Start a phone-facing app with `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">`.
Detect touch with `(hover)` and `(pointer)` media queries rather than user-agent strings.
Device emulation does not prove phone behavior; confirm gestures, keyboards, and safe areas on real hardware and say which fixes still need it.
