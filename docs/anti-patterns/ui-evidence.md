# UI delivery evidence

Use this for product UI, websites, documentation widgets, charts, visual assets, and visible CLI interactions.
Use the post-deploy [production recording](#production-proof-is-a-video) for a production claim. Share it with the authorized audience.

## User-supplied journeys

When the user supplies a real file, job or workflow to prove, use it through the product entry point the user would use. Start recording before selecting or uploading the source. Perform the requested action on screen, reopen the saved item through the product, and verify the result against the request.

For a multi-turn handoff, record continuously from intake through the change in instructions and the next operator's fresh session. Check the reopened job against the source and identify who saved, approved or sent each item. Keep the original recording silent unless narration was requested.

Keep the source and recording private by default. If access or privacy prevents a required step, report which step is blocked and mark the journey unproven. Label runs with synthetic fixtures or mocks as evaluations. Keep narrated slides and internal API setup outside the customer proof.

## Before implementation

Capture the existing surface and affected interaction before editing.
Use an authorized workspace. Exclude credentials and unrelated personal data.
Record the source revision, URL or execution target, viewport, theme, and starting state.
When the prior surface no longer exists, name that gap and link the retained artifact.

## Captures, when available

Attach before and after screenshots at matching viewports and states.
Include desktop and phone images when the surface supports both.
Check supported themes, focus, text fit, scrolling, and relevant loading, empty, error, and success states.
Show the changed area at a readable scale.

For changed interactions, attach a video that completes the affected user flow.
Show inputs, actions, visible results, and persistence or reopening when relevant.
Retain the uncut original.
Provide a faster playback copy when the original is long, and label its speed and process boundaries.
Static assets and copy-only changes require screenshots; they do not require an invented interaction video.

Open every screenshot and play every attached video as the intended reviewer.
Use stable links or repository attachments that the reviewer can access.
Keep generated evidence outside application bundles unless the repository intentionally publishes it.
Name the source revision, execution target, missing coverage, and observed failures beside the media.

## Review and delivery

Link the preview URL or an artifact the user can open.
Use a private delivery link for restricted media. Attach media to a PR only when its audience is authorized.
A test count, build log, or deployment acknowledgement does not replace product evidence.
After deployment, record the served flow as below; a defect the recording shows becomes a fix-forward PR.

## Production proof is a video

A claim that a user flow works in production ships with an uncut screen recording of that flow on production, run as a real user: a signed-in browser, visible controls only, real data in a QA workspace.
Captions name each step, its result and its measured time; sign-in and credentials stay out of the frame.
Record every party the flow needs (owner, staff, guest) and every outcome the flow claims (the task exists, the message arrived, the export downloaded).
A failed step stays in the video; the recording is evidence, not a highlight reel.
Watch it before reporting, and link it where the reader will see it.

Use [screenshots](https://playwright.dev/docs/screenshots) and [videos](https://playwright.dev/docs/videos) through maintained browser tools.
On macOS, launch the browser through Playwright, whose headless runs use its own `chrome-headless-shell`, and stop it before you finish.
Never start `/Applications/Google Chrome.app` with `--headless`: macOS hands `open <page>` to the oldest running Chrome.
The tool does not determine whether the evidence is useful; inspect the result.
