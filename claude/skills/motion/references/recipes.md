# Motion recipes

Read the recipe for the component you are building. Values use the tokens from the skill: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`.

| Component | Recipe |
|---|---|
| Button press | `transition: transform 160ms var(--ease-out)`; `:active { transform: scale(0.97) }` (0.95–0.98). Scale also scales the label and icon. |
| Dropdown, popover, menu, select | Opacity and transform 200ms `--ease-out`; enter from `scale(0.95)`; origin at the trigger. |
| Tooltip | Delay the first one; 125ms `--ease-out` from `scale(0.97)`. Once one is open, open neighbors instantly with `transition-duration: 0ms`. |
| Modal | Opacity and transform 250ms `--ease-out` from `scale(0.96)`, centered; backdrop fades 250ms. |
| Drawer or sheet | `translateY(100%)` to `0` over 500ms `--ease-drawer`; drag with velocity dismissal and rubber-banding past the top. |
| Toast | Opacity and `translateY(100%)` over 400ms `ease` with `@starting-style`; transitions, not keyframes, because toasts arrive quickly; exit the way it entered; pause timers when the tab is hidden. |
| Accordion | Height and opacity 200ms `--ease-out`; the one place height may animate. |
| Group entrance | `translateY(8px)` plus opacity over 300ms `--ease-out`, each item 50ms after the last (30–80ms). |
| Hold to confirm | Colored overlay with `clip-path: inset(0 100% 0 0)`; on `:active` go to `inset(0 0 0 0)` over 2s linear; on release snap back in 200ms `--ease-out`; add press scale. |
| Tab indicator with color change | Duplicate the tab list styled as active, clip it to the active tab, and animate the clip 250ms `--ease-in-out`. |
| Scroll reveal | From `clip-path: inset(0 0 100% 0)` to `inset(0)` once in view (`IntersectionObserver`, once). |
| Drag to dismiss | Pointer capture, ignore extra touches, damping past bounds, dismiss on distance or a fast flick, spring the rest with the release velocity. |
| Crossfade that will not settle | Blur the content 2px and dim to 0.7 opacity for 200ms during the swap. |
| Programmatic, no library | `el.animate([...], { duration, easing: 'cubic-bezier(0.77, 0, 0.175, 1)', fill: 'forwards' })`. |
| Spring config | Apple-style `{ type: "spring", duration: 0.5, bounce: 0.2 }`, or `{ mass: 1, stiffness: 100, damping: 10 }` for more control. Apple ships damping 1.0 / response 0.4 for repositioning and 0.8 / 0.3 for sheets. |
