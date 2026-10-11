---
name: motion
description: Build, review, or audit UI animation and gesture motion: whether to animate, easing, duration, springs, interruption, performance, and reduced motion.
---

# Motion

Derived from emilkowalski/skills animate, review-animations, improve-animations, emil-design-eng, and apple-design (MIT).

Motion earns its place by helping the user; most UI needs less of it, faster.
Use the project's existing easing and duration tokens; add the curves below as tokens only where none exist.

## Decide in order

1. **Should it animate?** By how often a user sees it:

   | Frequency | Decision |
   |---|---|
   | Keyboard shortcuts, command palette, 100+ times a day | No animation |
   | Tens of times a day (hover, list navigation) | Barely perceptible or none |
   | Occasional (modal, drawer, toast) | Standard |
   | Rare (onboarding, success) | Room for delight |

2. **Purpose**: spatial consistency, state change, feedback, explanation, or avoiding a jarring jump. "Looks cool" on a frequent element is not a purpose.
3. **Tool**: CSS transition for state you toggle; `@starting-style` for entry; CSS animation for predetermined motion that must stay smooth while the page loads; WAAPI (`element.animate`) for programmatic control; Motion for springs, layout, exit, and gesture-driven values.
4. **Properties**: `transform` and `opacity`, plus `clip-path` for reveals. Height only for accordions.
   Enter from `scale(0.9–0.97)` with `opacity: 0`, never `scale(0)`.
   Popovers, menus, and tooltips scale from their trigger (`transform-origin: var(--transform-origin)`); modals stay centered.
   `translateY(100%)` moves an element by its own height.
5. **Easing and duration**:
   - Enter or exit: ease-out `cubic-bezier(0.23, 1, 0.32, 1)`. Movement on screen: ease-in-out `cubic-bezier(0.77, 0, 0.175, 1)`. Drawers: `cubic-bezier(0.32, 0.72, 0, 1)`. Hover or color: `ease`. Constant motion: `linear`.
   - Never `ease-in` on UI: it delays the moment the user is watching.
   - Press 100–160ms; tooltip 125–200ms; dropdown 150–250ms; modal or drawer 200–500ms. UI motion stays under 300ms unless there is a reason.
   - Stagger groups by 30–80ms and never block input while they play.
6. **Interruption and exit**: transitions or springs for anything a user can trigger twice in a second; keyframes restart from zero.
   Exit along the entry path. Make the deliberate phase slow and the response fast (hold-to-confirm 2s linear, release 200ms ease-out).
7. **Reduced motion and hover**: ship with the animation. Under `prefers-reduced-motion`, keep short opacity and color changes and drop movement. Wrap hover motion in `@media (hover: hover) and (pointer: fine)`.

## Gestures and springs

- Respond on pointer-down; track the pointer 1:1 during a drag; never lock input during a transition.
- On interrupt, start the new animation from the current on-screen value, and hand the release velocity to the spring.
- Springs: critically damped by default (`{ type: "spring", bounce: 0, duration: 0.4 }`); bounce 0.1–0.3 only after a flick or throw.
- Dismiss on a fast flick (velocity above about 0.11 px/ms) as well as on distance.
- Project the resting point from release velocity, then snap to the nearest target: `project(v) = (v / 1000) * d / (1 - d)` with `d ≈ 0.998`.
- Past an edge, resist progressively: `rubberband(x, size, c = 0.55) = (x * size * c) / (size + c * |x|)`.
- Capture the pointer once a drag starts, ignore extra touches, and require about 10px of movement before committing to a direction.

Read [recipes](references/recipes.md) when building a specific component: button, dropdown, tooltip, modal, drawer, toast, accordion, hold-to-confirm, tab indicator, scroll reveal, or drag-to-dismiss.

## Performance

- Motion's `x`/`y`/`scale` shorthands run on the main thread; pass a full `transform` string when the page is busy.
- Set `transform` on the moving element; a CSS variable changed on a parent restyles every child.
- Keep blur under 20px; a 2px blur during a crossfade hides two overlapping states.
- Check feel in slow motion and on a real phone before calling it done.

## Review or audit

For a diff, report every finding in one table and end with a verdict:

| Before | After | Why |
|---|---|---|
| `transition: all 300ms` | `transition: transform 200ms var(--ease-out)` | Name the properties |

Prefer fixes in this order: delete the animation, reduce it, fix easing, fix origin, make it interruptible, move it to the GPU, make timing asymmetric, then polish and accessibility.
Block on: animation on a keyboard or 100+/day action, `scale(0)` or `ease-in` on UI, unexplained UI motion over 300ms, layout-property animation with an easy GPU fix, or missing reduced-motion handling on movement.
Otherwise approve, citing `file:line` for each remaining finding.

For a codebase audit, find the motion library, tokens, and the most-used interactive components first; rank findings by user impact and frequency; and write each fix as a self-contained plan with file, current value, target value, and check.

## Log the run

```bash
skill-run-log /motion --target "<component or diff>" --verdict <PASS|FAIL> --detail <APPROVE|BLOCK|BUILT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The motion is part of a wider UI change that needs browser proof | `/product-design` | the components, states, and viewports |
