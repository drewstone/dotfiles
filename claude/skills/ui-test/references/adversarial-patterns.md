# Adversarial Test Patterns

Copy-paste patterns for common UI attack surfaces. Each pattern describes what to test and the `bad` goal phrasing that produces reliable results.

## Forms

### Empty Submit
```json
{
  "id": "form-empty-submit",
  "goal": "Find a form on the page. Without filling any fields, click the submit button. Verify that validation errors appear for required fields and the form does NOT submit (no navigation, no network POST).",
  "maxTurns": 10
}
```

### XSS in Text Fields
```json
{
  "id": "form-xss-input",
  "goal": "Find every text input on the page. Enter '<script>alert(1)</script>' into each one and submit. Verify the input is displayed as escaped text, not executed as HTML. Check the DOM for any <script> tags that weren't there before.",
  "maxTurns": 15
}
```

### Oversized Input
```json
{
  "id": "form-oversized-input",
  "goal": "Find a text input. Paste a 2000-character string into it. Verify: (1) the input accepts or truncates gracefully, (2) the layout does not break (no horizontal overflow), (3) submitting does not cause a server error.",
  "maxTurns": 15
}
```

### Rapid Double Submit
```json
{
  "id": "form-double-submit",
  "goal": "Fill out the form with valid data. Click the submit button twice in rapid succession (within 200ms). Verify only ONE submission occurs — no duplicate entries, no double-charge, no error from concurrent requests.",
  "maxTurns": 15
}
```

## Modals & Dialogs

### Escape Key Dismissal
```json
{
  "id": "modal-escape",
  "goal": "Open a modal/dialog on the page. Press Escape. Verify: (1) the modal closes, (2) focus returns to the trigger element, (3) no content is lost, (4) body scroll is restored.",
  "maxTurns": 10
}
```

### Click Outside Dismissal
```json
{
  "id": "modal-click-outside",
  "goal": "Open a modal. Click the backdrop/overlay area outside the modal content. Verify the modal closes cleanly without errors.",
  "maxTurns": 10
}
```

### Focus Trap
```json
{
  "id": "modal-focus-trap",
  "goal": "Open a modal. Tab through all focusable elements inside it. Verify: (1) focus stays within the modal (doesn't escape to background), (2) Tab wraps from last to first element, (3) Shift+Tab wraps from first to last.",
  "maxTurns": 15
}
```

## Navigation

### Back Button State
```json
{
  "id": "nav-back-button",
  "goal": "Navigate to a page, perform an action (fill a form, apply a filter, scroll down). Click browser back button. Then click forward. Verify state is preserved — form data, scroll position, filter selections should survive navigation.",
  "maxTurns": 20
}
```

### Deep Link / Direct URL
```json
{
  "id": "nav-deep-link",
  "goal": "Navigate directly to an interior URL (not the homepage). Verify: (1) page loads without errors, (2) navigation/sidebar shows correct active state, (3) no flash of wrong content or loading screen that persists.",
  "maxTurns": 10
}
```

### 404 Handling
```json
{
  "id": "nav-404",
  "goal": "Navigate to a URL that doesn't exist (e.g., /this-page-does-not-exist). Verify: (1) a user-friendly 404 page appears, (2) navigation still works, (3) no unhandled JS errors in console.",
  "maxTurns": 10
}
```

## Authentication

### Protected Route Without Auth
```json
{
  "id": "auth-protected-route",
  "goal": "Without being logged in, navigate directly to a URL that requires authentication (e.g., /settings, /dashboard, /admin). Verify: (1) user is redirected to login or shown a sign-in prompt, (2) no crash, no 500 error, no blank page.",
  "maxTurns": 10
}
```

### Sign Out Cleanup
```json
{
  "id": "auth-signout-cleanup",
  "goal": "Sign in, then sign out. Verify: (1) all authenticated UI is gone (no user menu, no sidebar with user data), (2) navigating to protected routes redirects to login, (3) refreshing the page doesn't restore the session, (4) no stale data visible.",
  "maxTurns": 20
}
```

### Session Expiry Simulation
```json
{
  "id": "auth-session-expired",
  "goal": "While logged in, clear the session cookie via browser devtools or navigate to a logout endpoint. Then interact with the page (click a button, submit a form). Verify the app handles the expired session gracefully — redirect to login, show a message, don't show a raw error.",
  "maxTurns": 20
}
```

## Responsive & Viewport

### Mobile Overflow
```json
{
  "id": "responsive-mobile-overflow",
  "goal": "Resize the viewport to 375x812 (iPhone SE). Navigate through the main pages. For each page, check: (1) no horizontal scrollbar, (2) text is readable (not truncated or overlapping), (3) buttons are tappable (at least 44x44px), (4) images scale properly.",
  "maxTurns": 25
}
```

## Console & Performance

### JS Error Detection
```json
{
  "id": "console-errors",
  "goal": "Navigate through the 3 most important pages of the app. On each page, check the browser console for: (1) JavaScript errors (red), (2) failed network requests (4xx/5xx), (3) React/framework warnings. Report any findings with the error text and the page URL.",
  "maxTurns": 20
}
```

## Accessibility

### axe-core Audit
```json
{
  "id": "a11y-axe-audit",
  "goal": "Navigate to the main page. Run an accessibility audit. Check for: (1) missing alt text on images, (2) form inputs without labels, (3) insufficient color contrast, (4) missing heading hierarchy, (5) interactive elements without accessible names. Report violations by severity.",
  "maxTurns": 15
}
```

### Keyboard Navigation
```json
{
  "id": "a11y-keyboard-nav",
  "goal": "Starting from the top of the page, use only Tab, Enter, Escape, and arrow keys to complete the primary user flow (e.g., sign in, navigate to a feature, perform an action). Verify: (1) all interactive elements are reachable, (2) focus indicators are visible, (3) the flow is completable without a mouse.",
  "maxTurns": 25
}
```
