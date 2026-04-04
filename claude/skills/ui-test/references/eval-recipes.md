# Deterministic Eval Recipes

JavaScript snippets to use with `bad run` goals. These produce structured, deterministic evidence — stronger than visual/LLM judgment.

The agent executes these via `runScript` actions during its test flow. Include them in your goal descriptions when you need hard evidence.

## Accessibility — axe-core

Goal phrasing:
> "Load the page, then inject axe-core and run an accessibility audit. Report the count of critical and serious violations."

The agent will use `runScript` to:
```javascript
// Inject axe-core
const script = document.createElement('script');
script.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js';
document.head.appendChild(script);
```

Then in a subsequent action:
```javascript
// Run audit
axe.run().then(results => {
  return {
    violations: results.violations.length,
    critical: results.violations.filter(v => v.impact === 'critical').length,
    serious: results.violations.filter(v => v.impact === 'serious').length,
    details: results.violations.map(v => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.length
    }))
  };
});
```

## Console Errors

Goal phrasing:
> "Navigate through the main pages. After each navigation, check the console for JavaScript errors and failed network requests."

The agent monitors console output via `bad`'s built-in observability:
```bash
bad run --goal "..." --url "..." \
  --mode full-evidence  # enables console + network capture in runtime-log.json
```

Check `runtime-log.json` in the sink for:
- `consoleEntries` — logged messages
- `pageErrors` — uncaught exceptions
- `requestFailures` — failed network requests
- `responseErrors` — 4xx/5xx responses

## Broken Images

Goal phrasing:
> "Check all images on the page. Report any that failed to load (broken src, missing alt text)."

```javascript
Array.from(document.querySelectorAll('img')).map(img => ({
  src: img.src,
  alt: img.alt,
  loaded: img.complete && img.naturalWidth > 0,
  hasAlt: img.alt.length > 0
})).filter(img => !img.loaded || !img.hasAlt);
```

## Horizontal Overflow (Responsive)

Goal phrasing:
> "At 375px viewport width, check if the page has horizontal overflow."

```javascript
document.documentElement.scrollWidth > document.documentElement.clientWidth
```

## Touch Target Size (Mobile)

Goal phrasing:
> "At mobile viewport, verify all interactive elements meet the 44x44px minimum touch target."

```javascript
Array.from(document.querySelectorAll('a, button, input, select, textarea, [role="button"]'))
  .map(el => {
    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      text: el.textContent?.slice(0, 30),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      tooSmall: rect.width < 44 || rect.height < 44
    };
  })
  .filter(el => el.tooSmall);
```

## Form Label Coverage

Goal phrasing:
> "Check that every form input has an associated label (via `for` attribute, `aria-label`, or `aria-labelledby`)."

```javascript
Array.from(document.querySelectorAll('input, select, textarea'))
  .filter(el => el.type !== 'hidden')
  .map(el => ({
    type: el.type || el.tagName.toLowerCase(),
    name: el.name,
    hasLabel: !!(
      el.labels?.length ||
      el.getAttribute('aria-label') ||
      el.getAttribute('aria-labelledby') ||
      el.closest('label')
    )
  }))
  .filter(el => !el.hasLabel);
```

## Link Health

Goal phrasing:
> "Collect all links on the page. Report any with empty href, javascript: protocol, or # that go nowhere."

```javascript
Array.from(document.querySelectorAll('a'))
  .map(a => ({ href: a.href, text: a.textContent?.trim().slice(0, 40) }))
  .filter(a =>
    !a.href ||
    a.href === '#' ||
    a.href.startsWith('javascript:') ||
    a.href === window.location.href + '#'
  );
```

## Focus Order

Goal phrasing:
> "Tab through all focusable elements and verify the order follows the visual layout (top-to-bottom, left-to-right)."

The agent uses keyboard Tab actions and observes the accessibility tree `[ref=]` focus progression. No script needed — the snapshot diff shows which element gained focus after each Tab.

## Performance Timing

Goal phrasing:
> "Measure page load performance. Report DOM content loaded time, first contentful paint, and total transfer size."

```javascript
const nav = performance.getEntriesByType('navigation')[0];
const paint = performance.getEntriesByType('paint');
return {
  domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
  firstPaint: Math.round(paint.find(p => p.name === 'first-paint')?.startTime || 0),
  firstContentfulPaint: Math.round(paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0),
  transferSize: Math.round(nav.transferSize / 1024) + 'KB'
};
```
