# Adversarial UI patterns

Adapt cases to the requested workflow, supported behavior, and authorized test data.
Use the real browser and inspect resulting state, not only whether an action completed without an error.

| Surface | Case | Evidence to inspect |
|---|---|---|
| Forms | Submit missing required values, malformed input, and values around documented limits. | Correct validation, preserved input, no unintended mutation, and readable layout. |
| Rendered text | Submit controlled markup through a test account where user text is later displayed. | Text remains inert; inspect the actual rendering sink rather than assuming a literal script tag tests every XSS path. |
| Duplicate actions | Retry or double-submit a state-changing action. | Final durable state and idempotency behavior; multiple network requests may still be safe. |
| Dialogs | Open, navigate with keyboard, cancel, and submit. | Focus containment and return, supported dismissal behavior, unsaved-change handling, and scroll restoration. |
| Navigation | Open an interior URL, navigate back and forward, and use an invalid route. | Correct active state, access enforcement, and the state restoration promised by the product. |
| Authentication | Open a protected route without auth, sign out, and exercise an expired test session. | Protected data is not exposed; recovery and redirect behavior remain usable without stale user data. |
| Responsive layout | Use supported narrow and wide viewports with long text and realistic data volume. | Legibility, reachable controls, intentional scrolling, and usable dialogs or menus. |
| Loading and errors | Delay or fail a relevant request through the test environment. | Honest loading, useful errors, retained user input, and safe retry behavior. |
| Accessibility | Complete the flow with keyboard and run the repository's accessibility checks when available. | Accessible names, visible focus, labels, contrast, and a complete user task. |

Capture console and network errors in the context of the action that caused them.
Distinguish expected validation or authorization responses from product failures.
A dialog need not dismiss on backdrop click, and navigation need not preserve every draft unless that behavior is required.
