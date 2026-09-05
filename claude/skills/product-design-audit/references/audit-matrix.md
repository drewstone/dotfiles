# Product design audit matrix

For a broad audit, track the routes and states needed to cover the requested workflows and user complaints.
Use the existing project record rather than creating separate inventories for every component.

## Coverage

| Surface | Questions to resolve | Useful evidence |
|---|---|---|
| Navigation | Can users reach, leave, and return to the primary task? Does each navigation layer serve a distinct purpose? | Direct links, back/forward behavior, active state, task walkthrough. |
| Hierarchy and density | Is the next decision visible with the data it needs? What can be removed without losing information or control? | Screenshots with realistic data volume and long text. |
| Controls and accessibility | Do controls match the task and expose their state? Can a keyboard user complete it? | Focus order, accessible names, selected and disabled states. |
| Data and trust | Do values match their source, units, recency, permissions, and record identity? | Source reconciliation, missing data, permission changes, stale responses. |
| Failure and recovery | Can users understand and recover from loading, empty, failed, locked, or expired states? | Triggered failures and the resulting recovery flow. |
| Responsive layout and themes | Do relevant widths and supported themes preserve legibility and access to actions? | Inspected screenshots, overflow, contrast, dialog and menu placement. |
| Tables and charts | Can readers compare and inspect values without misleading scales or hidden detail? | Source values, axis labels, truncation, responsive behavior. |

Choose sizes, themes, and states from product support and the changed layout.
A horizontal scroll region or dense table can be intentional; judge whether the user can accomplish the task.

## Complaint tracking

For each distinct complaint, retain its source, route or component, observed failure, expected result, correction, and verification evidence.
Use precise failures such as “button text disappears on hover in the light theme,” rather than a broad quality label.
Keep unresolved complaints explicit; a better screenshot of another state does not resolve them.

## Design tradeoffs

Compare alternatives when they change workflow, information hierarchy, component ownership, or data behavior.
Judge them against the user's job, accessible interaction, system consistency, and required failure handling.
Record why the chosen approach resolves the observed problem.
Prefer removing unnecessary structure when it preserves the task.

Use the browser to check changed interactions and inspect the screenshot pixels.
For an authorized deployment, repeat the relevant flow against the served artifact.
