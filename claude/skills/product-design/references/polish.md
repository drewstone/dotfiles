# Interface polish

Derived from emilkowalski/skills emil-design-eng, apple-design, and mobile-native (MIT).

Read this when implementing or reviewing interface detail: press feedback, materials, typography, foundations, or phone behavior. Motion itself belongs to `/motion`.

Report review findings as one table: `| Before | After | Why |`, one row per issue.

## Feel

- Show press feedback on pointer-down (`:active`, `pointerdown`), not on release.
- Remove nonessential latency on the input path: artificial timers, transition waits, and debounces that delay feedback.
- Defaults matter more than options; handle edge cases silently (pause timers on hidden tabs, keep hover across gaps between stacked items, capture the pointer during drag).
- Match the personality: a dashboard stays crisp, a consumer surface can be warmer.

## Materials and depth

- Translucent layers (`backdrop-filter: blur()` over a semi-transparent background) carry navigation and sheets over scrolling content; heavier materials separate structure, lighter ones mark interactive elements.
- Larger surfaces read thicker: more blur and a deeper shadow than small chips.
- Dim the background for a blocking task; keep it visible and offset for a parallel panel.
- Over translucent surfaces, raise text contrast and weight slightly.
- Prefer a fade mask where content meets floating chrome to a hard 1px divider.
- Honor `prefers-reduced-transparency` (more opaque, less blur) and `prefers-contrast: more` (near-solid backgrounds with a defined border).

## Typography

- Tracking depends on size: negative for large display text, slightly positive for small text.
- Leading shrinks as size grows; loosen it for scripts with tall marks and tighten it for dense data.
- Build hierarchy from weight, size, and leading together; use `tabular-nums` for numbers that update or align.
- Size spacing in `rem` or `em` so a larger user font does not break layout; start from the system font unless the brand needs another.

## Foundations

- Feedback has four kinds: status, completion, warning, error. Validate inline rather than on submit.
- Every screen answers where am I, where can I go, what is here, and how do I leave.
- Place a control next to what it changes; a control that needs a label to explain its effect is mapped badly.
- Name navigation after its contents ("Library", "Progress"), not an umbrella ("Home").

## Phones

| Symptom | Fix |
|---|---|
| Hover stays stuck after a tap | Put hover rules in `@media (hover: hover) and (pointer: fine)` |
| Gray or blue flash on tap | `-webkit-tap-highlight-color: transparent` |
| Layout height wrong | `100dvh` for app shells and bottom-pinned UI, `100svh` for a hero |
| Page zooms into an input | Input font size at least 16px; never `user-scalable=no` or `maximum-scale=1` |
| Tap feels slow | Pointer-down feedback plus `touch-action: manipulation` |
| Pull-to-refresh hijacks scrolling | `overscroll-behavior: none` on `html, body` |
| Content stops at the notch | `viewport-fit=cover` with `env(safe-area-inset-*)` |
| Long press selects button text | `user-select: none` on controls only |
| Horizontal carousel scrolls the page | `touch-action: pan-y` on the gesture surface |
| Status bar color wrong | One `theme-color` meta per `prefers-color-scheme` |

Start a phone-facing app with `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">`.
Detect touch with `(hover)` and `(pointer)` media queries rather than user-agent strings.
Device emulation does not prove phone behavior; confirm gestures, keyboards, and safe areas on real hardware and say which fixes still need it.
