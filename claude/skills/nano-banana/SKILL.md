---
name: nano-banana
description: Generate or edit images with the maintained Nano Banana extension for Gemini CLI.
---

# Nano Banana

Use the Gemini CLI Nano Banana extension when the user requests that image workflow and the session permits it.

## Resolve the current extension

Read the [maintained extension guide](https://github.com/gemini-cli-extensions/nanobanana/blob/main/README.md) for commands, authentication, current model defaults, and output handling.
Inspect the installed Gemini CLI help and extension listing before using an example.
Use the current supported default unless the task requires another supported model.
Do not carry model IDs, prices, or CLI flags forward from this skill.

If the extension is missing, identify the missing component and use the session's permitted image capability when it meets the request.
Installing an extension and expanding execution permissions are separate actions from writing an image prompt.
Use existing session authorization and normal tool approval controls; image generation does not require disabling them globally.

## Generate or edit

Describe the subject, composition, style, dimensions, intended use, and required text.
For edits, inspect the source image and identify what must change and what must remain.
Use the installed extension's generate or edit command with the supported options for that task.
Keep outputs in the project or session scratch directory.

Inspect the resulting bitmap for the requested content, dimensions, legibility, and edit preservation.
Correct defects using the same source and explicit changes.
Return the actual image artifact and its path; successful CLI exit alone does not establish image quality.

## Log the run

```bash
skill-run-log /nano-banana --target "<target>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

- `product-design` when the image must be integrated into a visible product flow.
- `signal-distill` when the image needs an evidence-backed editorial brief.
