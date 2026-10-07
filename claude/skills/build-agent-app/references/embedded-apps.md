# Embedded app continuity

Reuse maintained workspace-app publication, preview, and data bridge exports from agent-app.
The product adapter owns authenticated storage and access policy.
Bind the bridge to one registered iframe, its exact origin, and its app ID.
Keep product credentials in the authenticated parent.
Use revisions for writes; show a recoverable conflict instead of silently overwriting another save.

## Compose the workspace

Use `AgentWorkspaceLayout` from `agent-app/workspace-react` with authorized `apps` rows in its shared Apps group, separate from History.
Use `WorkspaceLayout` from `sandbox-ui/workspace` with the app preview in `center` and Copilot in `right`.
When Copilot closes, pass `right={null}` and `centerHeaderVisibility="auto"` to remove its toggle and any empty center header.
Pass pane labels through `WorkspaceLayout` header slots; use `WorkspacePaneHeader` only for headers outside those slots.
Render the preview with `EmbeddedAppView` from `sandbox-ui/workbench/embedded-app`.
Pass message text and ready attachment descriptors through `ChatComposer` from `agent-app/web-react` using `onSendParts`.
Render real live and persisted tool calls and results with `AgentTimeline` from `sandbox-ui/chat`.
Preserve tool call IDs, inputs, statuses, and results through storage and reopening.
Persist each turn's actual saved profile ID and version.
Show its safe label and version beside the requested and independently verified served models.
Keep the full `AgentProfile` server-side.
Label the served model unverified when execution did not attest it.

Keep the app ID stable when editing its source.
Resume its existing coding session and sandbox.
For model changes, inspect the installed SDK's per-turn override before changing the instance profile version.
A changed profile version can select a new native session even when the sandbox remains unchanged.
Verify the requested model, served model, sandbox ID, and native session ID after a switch.
Keep tool call and result IDs and lifecycle states in the stored build conversation.
Render the reopened records with the exported `AgentTimeline`; never turn a coding run into prose-only history.
Show the exact profile saved with the turn and leave the served model unverified when execution did not attest it.

A resumed dev server can receive another port.
Re-register the actual managed server through the maintained preview validator.
Retain the original authorization and app-owner checks during registration.
Store business data under stable product identities rather than the preview origin.
Browser localStorage alone cannot retain shared business data across preview URL changes.

Open the app at desktop and mobile widths with Copilot both open and closed.
Record app, native session, and sandbox IDs before and after a live edit; confirm the preview changes.
Reopen the app and compare those IDs and the edited preview.
Add and edit real owner-supplied data.
After a server restart, reopen again and confirm data and tool history persist.
Verify another account and the standalone public preview cannot read private app data.
Inspect the deployed app in its real iframe, including delayed mounting and preview replacement.
Use maintained route recovery so a retired lazy-loaded asset shows a reload action instead of a blank page.
