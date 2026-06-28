---
name: product-design
description: Use when designing or revising product UI, landing pages, demos, dashboards, app shells, or interactive components. Enforces reference-first design, low-copy interfaces, real mode-specific components, no obvious labels, no procedural step theater, and screenshot-based quality checks.
metadata:
  short-description: Reference-first product UI without label/step slop
---

# Product Design

Use this skill before creating or revising any visible product UI. The goal is an interface that behaves like the product, not a diagram explaining the product.

## Failure Modes To Kill

- Obvious state labels: remove labels like "intent router", "detected agent", "route preview", "workflow", "step 1", "phase", "how it works", or "builder interview" when the control, page title, selected tab, or component state already makes it clear.
- Procedural theater: do not use numbered process cards or checklist panels to explain what the app should simply do. Express process through controls, state changes, results, and navigation.
- Generic input cosplay: a single text box must not pretend to be TTS, STT, cloning, and agent building. Text boxes are for text. Audio workflows need upload/record controls. Clone workflows need sample/consent/voice controls. Agent workflows need a builder chat/intake.
- Dead panels: if a panel is empty, decorative, or only repeats nearby copy, collapse it or replace it with useful controls, media, data, or results.
- Copy density: visible text must earn its place. Prefer one headline, one support line, direct commands, values, and necessary labels. Remove repeated verbs like "type/speak/upload/describe" when controls already communicate the action.
- Default control slop: avoid huge default selections, browser-default dropdowns in hero components, and giant chips for simple choices. Use compact segmented controls, custom dropdowns, icon buttons with tooltips, and real provider logos where identity matters.
- Fake readiness: do not imply a product/agent is ready because a demo talks. Show a real next action or route to the real builder/test surface.

## Reference-First Workflow

Before composing a new visual direction:

1. Inspect 2-3 current products or design systems in the same category. Use `site-clone`, `bad`, Playwright screenshots, computed styles, or live DOM inspection when possible.
2. Extract concrete patterns: density, typography scale, radius, dropdown treatment, media use, spacing, input structure, logos, and motion.
3. Design from those observed patterns and the existing app design system. Do not invent a generic SaaS layout from memory.
4. If a source is being cloned or heavily referenced, verify with screenshot comparison and computed style checks, not vibes.

## Component Rules

- The active mode changes the actual component, not just the copy around a generic component.
- Product switching should keep users oriented without making them pick the whole product before they can act.
- Provider/vendor choice belongs in compact controls near the affected action, not as a big explanatory lane unless provider comparison is the actual task.
- Use images, avatars, real logos, waveform/media previews, or real artifacts when they clarify the product. Do not fill space with icons and labels.
- Keep fixed-format surfaces stable with explicit dimensions, responsive constraints, and no text overflow.
- Cards are for repeated items, modals, or framed tools. Avoid nesting cards inside cards and avoid page sections that are just decorative cards.

## Copy Rules

- UI copy should name the thing, value, or action. It should not narrate obvious mechanics.
- Never add numbered steps to a marketing hero or product demo unless the user explicitly asks for a process diagram.
- Replace explanatory labels with affordances: buttons, tabs, selected states, upload wells, record controls, waveform timelines, dropdown values, and result panes.
- Remove captions that only restate the icon, tab, route, or button beside them.

## Quality Gate

Before finalizing UI work:

- Screenshot desktop and mobile, light and dark when both themes exist.
- Audit the first viewport for obvious labels, numbered steps, repeated action words, dead space, generic text boxes, fake outputs, and missing logos/media.
- Click each mode/control and verify it changes the real component state.
- Check text fit and overlap at mobile widths.
- If the result is below 9/10, fix the worst visible issue before reporting completion.
