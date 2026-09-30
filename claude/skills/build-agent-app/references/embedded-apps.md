# Embedded app continuity

Reuse maintained workspace-app publication, preview, and data bridge exports from agent-app.
The product adapter owns authenticated storage and access policy.
Bind the bridge to one registered iframe, its exact origin, and its app ID.
Keep product credentials in the authenticated parent.
Use revisions for writes; show a recoverable conflict instead of silently overwriting another save.

Keep the app ID stable when editing its source.
Resume its existing coding session and sandbox.
For model changes, inspect the installed SDK's per-turn override before changing the instance profile version.
A changed profile version can select a new native session even when the sandbox remains unchanged.
Verify the requested model, served model, sandbox ID, and native session ID after a switch.

A resumed dev server can receive another port.
Re-register the actual managed server through the maintained preview validator.
Retain the original authorization and app-owner checks during registration.
Store business data under stable product identities rather than the preview origin.
Browser localStorage alone cannot retain shared business data across preview URL changes.

Prove adding and editing real owner-supplied data, reopening the app, and recovering after a server restart.
Verify another account and the standalone public preview cannot read private app data.
Inspect the deployed app in its real iframe, including delayed mounting and preview replacement.
Use maintained route recovery so a retired lazy-loaded asset shows a reload action instead of a blank page.
