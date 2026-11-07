# Motion implementation techniques

For Tangle work, read the [design bible](https://github.com/tangle-network/brand/blob/main/docs/design-bible.md) for principles, visual grammar, motion, interaction and acceptance. Brand owns shared policy and executable token values; this file owns procedure.

Read the existing component story before implementing a recipe. The following are techniques to evaluate against that owner, not approved Tangle behavior or default timing values.

| Component | Technique to evaluate |
|---|---|
| Button | Apply local press feedback through the shared control; compare label/icon rendering while pressed. |
| Popover, menu, select | Derive transform origin from the trigger and verify placement after viewport changes. |
| Tooltip | Keep first-open delay and neighboring-tooltip behavior in the shared tooltip owner. |
| Dialog, drawer, sheet | Measure trigger and destination bounds; test interrupted dismissal, focus return and scrolling. |
| Toast | Use transitions when arrivals can overlap; pause expiration while the tab is hidden. |
| Accordion | Measure content bounds and trace layout cost before selecting height animation. |
| Hold to confirm | Model progress separately from the action; test early release, pointer cancellation and keyboard equivalence. |
| Tab indicator | Measure the active tab and animate the shared indicator; verify text and focus remain in one accessible tab list. |
| Drag to dismiss | Capture one pointer, ignore extra touches, project release velocity and choose a resting target. |
| Programmatic motion | Retain the animation handle so a new intent can retarget or cancel it; semantic completion belongs in application state. |

Use the project's motion-role duration and easing in CSS and JavaScript. Proven Tangle recipes belong in Brand's shared UI component and consumer stories after the bible's required proof. Keep a local experiment clearly labelled until then.
