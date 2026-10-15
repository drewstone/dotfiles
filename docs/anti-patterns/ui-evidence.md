# UI delivery evidence

For Tangle work, read the [design bible](https://github.com/tangle-network/brand/blob/main/docs/design-bible.md) for principles, visual grammar, motion, interaction and acceptance. Brand owns shared policy and executable token values; this file owns procedure.

Use this for product UI, websites, documentation widgets, charts, visual assets, and visible CLI interactions.
The PR must let a reviewer see the changed user experience.

## Before implementation

Capture the existing surface and affected interaction before editing.
Use a safe account or fixture, and exclude credentials and unrelated personal data.
Record the source revision, URL or execution target, viewport, theme, and starting state.
When the prior surface no longer exists, name that gap and link the retained artifact.

## Before opening the PR

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
Attach the media to the PR and final delivery; local file paths alone are insufficient for remote reviewers.
A test count, build log, or deployment acknowledgement does not replace product evidence.
Resolve defects visible in the captures before merging.
For a production claim, check the served artifact and affected user flow after deployment.

## Production proof is a video

A claim that a user flow works in production ships with an uncut screen recording of that flow on production, run as a real user: a signed-in browser, visible controls only, real data in a QA workspace.
Captions name each step, its result and its measured time; sign-in and credentials stay out of the frame.
Record every party the flow needs (owner, staff, guest) and every outcome the flow claims (the task exists, the message arrived, the export downloaded).
A failed step stays in the video; the recording is evidence, not a highlight reel.
Watch it before reporting, and link it where the reader will see it.

Use [screenshots](https://playwright.dev/docs/screenshots) and [videos](https://playwright.dev/docs/videos) through maintained browser tools.
The tool does not determine whether the evidence is useful; inspect the result.
