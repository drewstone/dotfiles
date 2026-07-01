# Reference Systems

This file records external systems and reference-site lessons used to shape the anti-pattern doctrine.

The standard is not "famous company did it." The standard is: source-of-truth documentation, maintained practice, concrete rules, and visible output quality.

## Tier 1: Doctrine Sources

These are reliable enough to influence rules.

GOV.UK / GDS:

- Why it matters: GOV.UK has some of the clearest public writing doctrine on the web. It treats clarity as a service requirement, not taste.
- Anti-pattern derived: do not hide unclear thinking behind jargon, labels, or inflated claims.
- Use it for: plain language, UI writing, public-service clarity, content hierarchy.
- References:
  - https://www.gov.uk/service-manual/design/writing-for-user-interfaces
  - https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/
  - https://gds.blog.gov.uk/2012/07/02/gov-uk-editorial-style-guide/

U.S. Web Design System:

- Why it matters: USWDS connects design principles, accessibility, implementation, patterns, and research.
- Anti-pattern derived: a design system is not a moodboard; it is an evaluative lens and implementation contract.
- Use it for: accessibility, design principles, inclusive patterns, government-grade clarity.
- References:
  - https://designsystem.digital.gov/
  - https://designsystem.digital.gov/design-principles/
  - https://designsystem.digital.gov/about/research/
  - https://www.section508.gov/develop/accessible-design-using-uswds/

Nielsen Norman Group:

- Why it matters: NN/g is strongest for UX research discipline and for pushing back on magical AI thinking.
- Anti-pattern derived: AI does not create value by being present; it must improve a real task. Agents must be watched for hallucinations and bad advice.
- Use it for: UX research rigor, AI-product skepticism, content standards inside design systems.
- References:
  - https://www.nngroup.com/articles/designing-ai-study-guide/
  - https://www.nngroup.com/articles/ai-ux-getting-started/
  - https://www.nngroup.com/articles/content-design-systems/

Microsoft HAX:

- Why it matters: HAX names recurring human-AI interaction failures and turns them into guidelines and patterns.
- Anti-pattern derived: do not present AI as infallible, self-explanatory, or magic. Design for uncertainty, failure, recovery, and user control.
- Use it for: human-AI interaction rules, failure modes, AI affordances.
- References:
  - https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/
  - https://www.microsoft.com/en-us/haxtoolkit/design-patterns/
  - https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/

Google People + AI Guidebook:

- Why it matters: PAIR focuses on user expectations, feedback, mental models, and AI behavior over time.
- Anti-pattern derived: do not hide model uncertainty, provenance, feedback paths, or system limits.
- Use it for: AI product behavior, onboarding AI capabilities, trust boundaries.
- References:
  - https://pair.withgoogle.com/guidebook/
  - https://pair.withgoogle.com/guidebook/patterns

IBM Carbon and IBM Design for AI:

- Why it matters: Carbon puts content, components, accessibility, and AI guidance in one system.
- Anti-pattern derived: impressive-sounding language is a liability in product UI and technical marketing. AI systems need transparency and explainability.
- Use it for: content rules, AI guidance, enterprise design-system discipline.
- References:
  - https://carbondesignsystem.com/guidelines/content/overview/
  - https://v10.carbondesignsystem.com/guidelines/content/writing-style/
  - https://carbondesignsystem.com/guidelines/carbon-for-ai/
  - https://www.ibm.com/design/ai/
  - https://www.ibm.com/design/ai/ethics/explainability/

Atlassian Design System:

- Why it matters: Atlassian treats content, foundations, and components as one operating system.
- Anti-pattern derived: visual systems need reusable constraints, not page-by-page invention.
- Use it for: product content, component governance, enterprise UX consistency.
- References:
  - https://atlassian.design/content
  - https://atlassian.design/get-started/content-design
  - https://atlassian.design/design-system

Shopify Polaris:

- Why it matters: Polaris has strong content guidance around usefulness, economy, and component-level writing.
- Anti-pattern derived: each word adds noise. Component slots do not justify subcopy, labels, or badges.
- Use it for: UI writing, action labels, admin/product surfaces, practical component rules.
- References:
  - https://polaris.shopify.com/
  - https://polaris.shopify.com/content
  - https://polaris-react.shopify.com/content/fundamentals

Adobe Spectrum:

- Why it matters: Spectrum includes detailed content mechanics, inclusive writing, international design, and mature component doctrine.
- Anti-pattern derived: content quality is part of the design system, not post-design cleanup.
- Use it for: grammar, inclusive UX writing, internationalization, component/system maturity.
- References:
  - https://spectrum.adobe.com/
  - https://spectrum.adobe.com/page/grammar-and-mechanics/
  - https://spectrum.adobe.com/page/inclusive-ux-writing/
  - https://spectrum.adobe.com/page/international-design/

BBC GEL:

- Why it matters: GEL is a long-running, high-scale design system with practical technical guidance and accessibility emphasis.
- Anti-pattern derived: design systems must scale through documented patterns and implementation guidance, not taste.
- Use it for: high-scale content/product surfaces, accessibility, pattern documentation.
- References:
  - https://bbc.github.io/gel/
  - https://github.com/bbc/gel

AGENTS.md:

- Why it matters: agent behavior needs repository-level instructions, not hidden preferences in chat history.
- Anti-pattern derived: design doctrine must be explicit, grep-able, and linked from shared defaults.
- Use it for: instruction hierarchy, agent onboarding, repo-local standards.
- References:
  - https://agents.md/
  - https://github.com/agentsmd/agents.md
  - https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/

## Tier 2: Open-Source UI Systems To Learn From

These systems are not automatically appropriate for a brand. Use them to study constraints, accessibility defaults, component ownership, and documentation quality.

shadcn/ui:

- What to learn: distribution as source code, strong defaults, editable components, low ceremony.
- Anti-pattern: copying shadcn components and calling it a brand. shadcn is a foundation, not a visual identity.
- References:
  - https://ui.shadcn.com/
  - https://github.com/shadcn-ui/ui

Radix Primitives:

- What to learn: accessible unstyled primitives are often better than styled components when the brand needs its own surface.
- Anti-pattern: using Radix primitives without designing the actual system above them.
- References:
  - https://www.radix-ui.com/primitives
  - https://github.com/radix-ui/primitives

Material UI / MUI:

- What to learn: large component ecosystems need strong defaults, theming, and production-hardening.
- Anti-pattern: importing a mature library's visual language accidentally, then wondering why the product looks generic.
- References:
  - https://mui.com/material-ui/
  - https://github.com/mui/material-ui

Ant Design:

- What to learn: enterprise UI can be consistent, dense, and operational without inventing every component from scratch.
- Anti-pattern: adopting enterprise density for a marketing page or research page.
- References:
  - https://ant.design/
  - https://github.com/ant-design/ant-design

Carbon:

- What to learn: content, accessibility, AI guidance, and component rules live together.
- Anti-pattern: treating design-system work as only colors and components.
- References:
  - https://carbondesignsystem.com/
  - https://github.com/carbon-design-system/carbon

Spectrum implementations:

- What to learn: design language plus implementation libraries can coexist without collapsing into one-off CSS.
- Anti-pattern: importing component look without adopting the constraints that make the system coherent.
- References:
  - https://github.com/adobe/react-spectrum
  - https://opensource.adobe.com/spectrum-css/

## Tier 3: Site Inspiration, Not Doctrine

These sites are useful as visual references but are not rules by themselves.

Captured locally under:

- `/tmp/tangle-reference-audit/`
- `/tmp/tangle-reference-contact-sheet.jpg`

Sites:

- https://www.raindrop.ai/
- https://www.braintrust.dev/
- https://www.daytona.io/
- https://e2b.dev/
- https://vercel.com/
- https://fish.audio/

Lessons:

- Raindrop: strong color and motion, but the lesson is not "add blobs"; the lesson is that movement and product-state visuals carry explanation.
- Braintrust: real product views make quality and evals feel concrete. It does not rely on a feature card grid to prove the point.
- Daytona: dense technical black UI can work when the graphics are crafted and varied. It fails if copied as text-heavy darkness.
- E2B: technical infrastructure can be clean and graphic with sparse copy. It uses visual identity, not paragraph density.
- Vercel: hierarchy and omission are the product. The page does not try to show every feature.
- Fish: video, color, and product media make the page feel alive. It does not depend on small labels to create rhythm.

What this means for Tangle:

- The homepage should not be a company map.
- Blog and research should stay, but research should be light, calm, and argument-led.
- Product pages should only return when they have real artifacts: screenshots, traces, demos, model routing views, eval outputs, or diagrams grounded in the actual system.
- If a graphic cannot be tied to a real product state, it should not ship.

## Source Quality Rules

Do not treat a source as doctrine if it is only:

- a screenshot
- a popular homepage
- a viral design thread
- a Dribbble-style mockup
- an agency case study without implementation details
- an AI-generated "best practices" article

Source can influence doctrine only if it gives at least one of:

- explicit rules
- component guidance
- content guidance
- accessibility guidance
- research evidence
- implementation details
- repeatable review criteria

