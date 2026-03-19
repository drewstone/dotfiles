---
name: tangle-branded-designer
description: "Build Tangle-branded UIs, components, and pages. Use when creating frontend interfaces, designing components for sandbox-ui, or building product pages that must match the Tangle website design system. Triggers on frontend design, UI work, component creation, or page building for any Tangle product."
metadata:
  author: drew
  version: "1.0.0"
---

# Tangle Brand Design System

You are building UI for Tangle Network products. Every surface you create must feel like it belongs on tangle.tools. This document is the single source of truth — extracted directly from the production website CSS.

## Core Principles

- **Dark-first.** Black (`#000`) base. No light themes unless explicitly requested.
- **Restrained luxury.** Purple glow accents, not neon. Subtle gradients, not saturated fills.
- **Information density varies by audience.** Technical products (Sandbox, Blueprint) are denser. Consumer products (Tax Agent) are calmer.
- **Every element earns its pixel.** No decorative fluff. Whitespace is structural.

## Color Palette

### Backgrounds
| Token | Value | Usage |
|-------|-------|-------|
| `--bg-root` | `#000000` | HTML/body background |
| `--bg-dark` | `#1f1d2b` | Panels, sidebars, headers |
| `--bg-card` | `#161425` | Cards, elevated containers |
| `--bg-elevated` | `#1e1c30` | Hover states, raised surfaces |
| `--bg-section` | `#171528` | Section backgrounds |
| `--bg-input` | `#141428` | Input fields, code blocks |
| `--bg-hover` | `#1a1a30` | Interactive hover state |
| Footer | `#00010a` | Footer background |
| Code block | `#0a0a0a` | Terminal / code containers |

### Text
| Token | Value | Usage |
|-------|-------|-------|
| `--text-primary` | `#ffffff` | Headings, primary content |
| `--text-secondary` | `#aab0bc` | Body text, descriptions |
| `--text-muted` | `#6b7094` | Captions, labels, disabled |

### Brand
| Token | Value | Usage |
|-------|-------|-------|
| `--brand-primary` | `#605dba` | Default brand purple |
| `--brand-strong` | `#6941c6` | Emphasis, hover states |
| `--brand-cool` | `#6172f3` | Links, highlights |
| `--brand-glow` | `#9e77ed` | Glow effects |
| `--brand-purple` | `#7f56d9` | Alternative purple |

### Service Accent Colors
| Product | Primary | Secondary |
|---------|---------|-----------|
| Sandbox | `#4ade80` (green) | `#22d3ee` (cyan) |
| Blueprint | `#818cf8` (indigo) | `#ec4899` (pink) |
| Browser Agent | `#8e59ff` (purple) | `#60a5fa` (blue) |
| Tax Agent | `#fbbf24` (amber) | `#f97316` (orange) |

### Borders
| Token | Value |
|-------|-------|
| Subtle | `rgba(255, 255, 255, 0.06)` |
| Default | `rgba(255, 255, 255, 0.08)` |
| Hover | `rgba(255, 255, 255, 0.1)` |
| Accent | `rgba(142, 89, 255, 0.2)` |
| Accent hover | `rgba(142, 89, 255, 0.4)` |
| Section border | `rgb(33, 26, 65)` |

### Buttons
| Variant | Background | Text | Hover | Radius | Padding |
|---------|-----------|------|-------|--------|---------|
| Primary | `#1e116e` | white | `#281ca5` | 48px | 20px 38px |
| Secondary | `#fff` | `#211f54` | border `#4a3aff` | 48px | 20px 38px |
| Primary White | `#fff` | `#211f54` | `#f2f1ff` | 48px | 20px 38px |
| CTA Purple | `#4a3aff` | white | `#5532fa` | 12px | 12px 20px |
| Nav CTA | `#fff` | `#1d1d1d` | `#f0f0f0` | 50px | 12px 24px |

All buttons: `font-family: "Satoshi"; font-weight: 600-700; font-size: 18px (pill) or 0.9rem (CTA); transition: 0.3s`.

## Typography

### Font Stack
```
--font-sans: "Satoshi", "Space Grotesk", ui-sans-serif, system-ui, sans-serif
--font-display: "Satoshi", ui-sans-serif, system-ui, sans-serif
--font-mono: "JetBrains Mono", "Fira Code", monospace
```

Satoshi is the primary font for ALL text. Space Grotesk is fallback only.

### Type Scale
| Element | Size | Weight | Line Height | Letter Spacing |
|---------|------|--------|-------------|----------------|
| H1 (hero) | 4.5rem | 800 | 120% | ~0 |
| H3 (section) | 4rem | 700 | 120% | — |
| H4 (card) | 2.5rem | 700-800 | 120% | — |
| Body-01 (hero sub) | 1.4rem | 700 | 150% | — |
| Body-02 | 1.25rem | 600 | 150% | — |
| Body-03 | 1rem | 600 | — | — |
| Nav link | 1.15rem | 500 | 1 | -0.02em |
| Small / label | 0.875rem | 500-600 | — | — |
| Code | 13px | 400 | 1.55 | — |

Hero body text: `opacity: 0.8`. Section body: `opacity: 0.7`.

### Responsive Type
| Breakpoint | H1 | H3 | Hero height |
|------------|----|----|-------------|
| Desktop (991px+) | 4.5rem | 4rem | 95vh |
| Tablet (768-990px) | 3rem | 2.25rem | 80vh |
| Mobile (<479px) | 2.5rem | — | 90vh |

## Gradients

### Background Gradients
```css
/* Hero glow */
radial-gradient(ellipse at 70% 50%, rgba(130, 99, 255, 0.15) 0%, transparent 60%)

/* Section wrapper */
radial-gradient(circle, rgba(0, 0, 0, 0), rgba(130, 99, 255, 0.1) 0%, rgba(130, 99, 255, 0.2) 90%)

/* Grid pattern overlay */
linear-gradient(rgba(142, 89, 255, 0.03) 1px, transparent 1px),
linear-gradient(90deg, rgba(142, 89, 255, 0.03) 1px, transparent 1px)
/* background-size: 64px 64px */
```

### Text Gradients
```css
/* Brand purple-blue */
linear-gradient(45deg, #5f5bee, #465cd2)
/* Apply with: background-clip: text; -webkit-background-clip: text; color: transparent; */

/* Pill badge text */
linear-gradient(rgba(255, 255, 255, 0.4), rgb(255, 255, 255))
```

### Service Gradients
```css
/* Sandbox */ linear-gradient(135deg, #4ade80, #22d3ee)
/* Blueprint */ linear-gradient(135deg, #818cf8, #ec4899)
/* Browser Agent */ linear-gradient(135deg, #8e59ff, #60a5fa)
/* Tax Agent */ linear-gradient(135deg, #fbbf24, #f97316)
```

## Shadows & Effects

### Shadows
```css
/* Card default */
0 4px 10px rgba(20, 20, 43, 0.04)

/* Feature card hover */
0 4px 24px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(142, 89, 255, 0.1)

/* Dropdown */
0 20px 60px rgba(0, 0, 0, 0.5)
```

### Glassmorphism
```css
/* Navigation pill */
backdrop-filter: blur(3px);
background-color: rgba(0, 0, 0, 0.4);

/* Dropdown */
backdrop-filter: blur(20px);
background: #1a1830;
border: 1px solid rgba(255, 255, 255, 0.1);
```

## Border Radius Scale

| Usage | Value |
|-------|-------|
| Pill buttons | 48px |
| Badge pills | 62.5rem |
| Nav CTA | 50px |
| Sections, dropdowns | 16px |
| Cards (large) | 1.5rem (24px) |
| Cards (medium) | 1.25rem (20px) |
| CTA buttons | 12px |
| Dropdown items | 10px |
| Icon containers | 8px |
| Small elements | 6px |

## Component Patterns

### Card
```css
background: #141428; /* or rgba(15, 13, 30, 0.9) */
border: 1px solid rgba(255, 255, 255, 0.06);
border-radius: 1.5rem;
padding: 2rem;
transition: transform 0.3s;
```
Hover: `transform: scale(0.98)` — cards shrink slightly, not grow.

### Card (Feature)
```css
background: #141428;
border: 1px solid rgba(255, 255, 255, 0.08);
border-radius: 1.25rem;
padding: 2rem;
```
Hover: `background: #1a1a30; border-color: rgba(142, 89, 255, 0.25); box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(142, 89, 255, 0.1);`

### Section Wrapper
```css
border: 1px solid rgb(33, 26, 65);
border-radius: 16px;
margin-top: 2rem;
padding: 5vw 3% 10vw;
background-image: radial-gradient(circle, rgba(0, 0, 0, 0), rgba(130, 99, 255, 0.1) 0%, rgba(130, 99, 255, 0.2) 90%);
overflow: hidden;
```

### Navigation
```css
/* Pill nav menu */
backdrop-filter: blur(3px);
background-color: rgba(0, 0, 0, 0.4);
border-radius: 200px;
padding: 6px 6px 6px 28px;
gap: 28px;

/* Container */
max-width: 80rem;
padding: 5% horizontal;
position: absolute; z-index: 100;
```

### Code Block
```css
background: #0a0a0a;
border: 1px solid rgba(142, 89, 255, 0.2);
border-radius: 12px;
font-family: "JetBrains Mono", monospace;
font-size: 13px;
line-height: 1.55;
color: rgba(255, 255, 255, 0.8);
```

Header with traffic light dots:
```css
padding: 10px 16px;
border-bottom: 1px solid rgba(255, 255, 255, 0.06);
background: rgba(255, 255, 255, 0.02);
/* Dots: red rgba(255,95,87,0.8), yellow rgba(254,188,46,0.8), purple rgba(142,89,255,0.8) */
```

### Syntax Colors
```css
--code-keyword: #c084fc;    /* purple */
--code-string: #a78bfa;     /* lighter purple */
--code-function: #60a5fa;   /* blue */
--code-number: #fcd34d;     /* yellow */
--code-success: #4ade80;    /* green */
--code-comment: rgba(255, 255, 255, 0.25);
```

### Pill Badge (Glowing)
```css
border: 1px solid rgba(255, 255, 255, 0.1);
border-radius: 62.5rem;
padding: 0.5rem 1rem;
font-size: 0.88rem;
/* Text gradient: linear-gradient(rgba(255,255,255,0.4), #fff) with background-clip: text */
```

### Install Command Pill
```css
border: 1px solid rgba(142, 89, 255, 0.2);
background: rgba(255, 255, 255, 0.02);
border-radius: 12px;
padding: 12px 20px;
font-family: "JetBrains Mono";
font-size: 0.9rem;
/* Hover: border-color rgba(142, 89, 255, 0.4) */
/* Prompt symbol color: #8e59ff */
```

## Layout

### Container
```css
max-width: 80rem;
margin: 0 auto;
padding: 0 5%;
```

### Hero
```css
height: 95vh; /* 80vh tablet, 90vh mobile */
padding: 10rem 5% 2rem;
background-image: radial-gradient(ellipse at 70% 50%, rgba(130, 99, 255, 0.15) 0%, transparent 60%);
```

### Grid Patterns
- Blueprint cards: 3 columns, `calc(33.333% - 0.75rem)`, 12px gap
- Bento grid: 3 columns, 12px gap, min 260px cells
- Feature grid: 2 columns for details

### Responsive
| Breakpoint | Behavior |
|------------|----------|
| 991px+ | Full desktop layout |
| 768-990px | Single column, reduced type, collapsed nav |
| <479px | Stack everything, full-width buttons, reduced padding |

Mobile buttons: `width: 100%; text-align: center`.

## Transitions

```css
/* Standard interactive */
transition: all 0.2s;

/* Buttons */
transition: background-color 0.3s, color 0.3s;

/* Cards */
transition: transform 0.3s;

/* Quick micro-interactions */
transition: background 0.15s;
```

## Anti-Patterns

- **No light backgrounds.** Never use white/gray backgrounds on workspace surfaces.
- **No saturated fills.** Brand purple is for accents and glows, not large filled areas (except buttons).
- **No hard borders.** Use `rgba(255, 255, 255, 0.06-0.1)` not solid colors.
- **No generic sans-serif.** Always specify Satoshi first.
- **No large border-radius on cards.** Max 1.5rem. Pill radius (48px+) is for buttons and badges only.
- **No box shadows on dark surfaces.** Use border glow (`rgba(142, 89, 255, 0.1-0.25)`) instead.
- **No opacity on primary text.** Only body/description text gets opacity (0.7-0.8).
- **Cards shrink on hover** (`scale(0.98)`), never grow.
- **No gradient backgrounds on large areas.** Use radial-gradient glows that fade to transparent.

## When Building Components for sandbox-ui

1. Use CSS custom properties from `tokens.css`, never hardcoded values
2. Support `data-sandbox-theme` attribute for product theming (operator/builder/consumer)
3. Support `data-density` for compact/comfortable modes
4. All interactive elements need `transition: var(--transition-default)`
5. Border colors use the opacity scale, not solid colors
6. Test with both Tangle brand colors and service accent colors

## When Building Product Pages

1. Start with `#000` body, add radial-gradient glow at ~70% 50% position
2. Section wrappers get the purple radial-gradient border treatment
3. Use the hero pattern: 95vh, bottom-aligned content, 60% width container
4. Navigation is always the glassmorphic pill with blur(3px)
5. CTAs are pill-shaped (48px radius) with the dark purple (`#1e116e`) fill
6. Partner logos: `filter: brightness(0) invert(1)` to make them white
7. Code blocks are always `#0a0a0a` with purple-tinted borders
