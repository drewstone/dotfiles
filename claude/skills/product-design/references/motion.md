# Interface motion

Read this when the UI work includes animation or gestures. Use the project's easing and duration tokens; add tokens only where none exist. Motion earns its place by helping the user.

## Decide in order

1. Frequency: keyboard shortcuts and other 100+ times/day actions need no animation; frequent hover and list navigation need barely perceptible motion or none; occasional modals and toasts can use standard motion; rare onboarding and success can allow delight.
2. Purpose: spatial consistency, state change, feedback, explanation, or avoiding a jarring jump.
3. Tool: CSS transition for toggled state; `@starting-style` for entry; CSS animation for predetermined motion during load; WAAPI for programmatic control; Motion for springs, layout, exit, and gesture-driven values.
4. Properties: prefer `transform` and `opacity`; use `clip-path` for reveals and height only for accordions. Enter from `scale(0.9–0.97)` with `opacity: 0`. Scale popovers, menus, and tooltips from their trigger; keep modals centered.
5. Timing: enter and exit use ease-out, on-screen movement ease-in-out, hover and color `ease`, constant motion `linear`. Press 100–160 ms; tooltip 125–200 ms; dropdown 150–250 ms; modal or drawer 200–500 ms. Keep UI motion under 300 ms unless a longer duration has a reason. Stagger groups 30–80 ms without blocking input.
6. Interruption: use transitions or springs when an action can repeat quickly; exit along the entry path. Begin a new animation from the current on-screen value.
7. Access: under `prefers-reduced-motion`, keep short opacity and color changes and drop movement. Run hover motion only for fine hovering pointers.

## Gestures and performance

Respond on pointer-down, track 1:1 during drag, hand release velocity to the spring, and never lock input during a transition. Use a critically damped spring by default; add bounce only for a flick or throw. Capture one pointer and require roughly 10 px before committing to a drag direction.

Prefer transforms on the moving element over a parent CSS variable that restyles descendants. Motion's `x`/`y`/`scale` shorthands can run on the main thread; pass a full transform string when the page is busy. Check feel in slow motion and on a real phone.

Read [component recipes](motion-recipes.md) for buttons, dropdowns, tooltips, modals, drawers, toasts, accordions, hold-to-confirm, tabs, scroll reveal, and drag-to-dismiss.

For an audit, rank findings by user impact and interaction frequency. Prefer deleting motion, then reducing it, fixing easing or origin, making it interruptible, improving rendering performance, and finally polishing it. Report file, current value, target value, and a browser check; require reduced-motion handling for movement.
Block approval for motion on a keyboard or 100+ times/day action, entry from `scale(0)`, `ease-in` on UI, unexplained motion over 300 ms, avoidable layout-property animation, or missing reduced-motion handling. Keep blur under 20 px.
