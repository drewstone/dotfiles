# Interface motion

Read this when changing animation or gestures. For Tangle work, read the [design bible](https://github.com/tangle-network/brand/blob/main/docs/design-bible.md) for principles, visual grammar, motion, interaction and acceptance. Brand owns shared policy and executable token values; this file owns procedure.

## Inspect and implement

1. Inventory active CSS and JavaScript animations in the affected flow. Record trigger, moving object, origin, frequency, interruption and reduced-motion path.
2. Locate the project's motion tokens and shared component recipe. For Tangle, follow the bible's motion-owner links; change the existing owner when the recipe needs correction.
3. Choose an implementation for the behavior: CSS transitions for toggled state, `@starting-style` for entry, WAAPI for programmatic control, or the project's maintained motion library for layout and gestures.
4. Establish destination layout before animating between measured bounds. Keep the semantic state transition independent of animation callbacks.
5. Check rapid reversal, repeated input, close/Back, hidden tabs and reduced motion. Inspect both CSS and JavaScript branches.
6. Capture matched normal, interrupted and reduced-motion sequences. Compare the moving object's continuity and the reader's anchor using the bible's acceptance protocol.

## Gestures and performance

Use pointer capture for a single active pointer and inspect cancellation and extra touches. Measure drag direction and release velocity from the same coordinate system. Project the release toward a resting target; tune resistance against real-device evidence and the shared recipe.

Prefer transforms on the moving element over a parent CSS variable that restyles descendants. Check whether the library's transform shorthands run on the main thread; inspect a performance trace before changing the implementation. Review slow playback and a real phone separately.

Read [component techniques](motion-recipes.md) when choosing the implementation. Generic techniques do not override Tangle's tokens or approved behavior.

For an audit, rank observed failures by user impact and interaction frequency. Record file, current behavior, shared-owner correction and browser proof. Reuse the bible's verdict criteria instead of maintaining a second timing or easing table.
