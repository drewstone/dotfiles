---
name: nano-banana
description: "Generate and edit images using Nano Banana (Gemini CLI). Use for blog images, thumbnails, icons, diagrams, and any visual content. Trigger on: generate image, create graphic, make thumbnail, draw diagram, edit photo, visualize."
allowed-tools: Bash(gemini:*)
---

# Nano Banana

Image generation via Gemini CLI's nanobanana extension.

## Commands

```bash
# Generate
gemini --yolo "/generate 'prompt' --preview"

# Edit existing
gemini --yolo "/edit file.png 'instruction'"

# Specialized
gemini --yolo "/icon 'description'"
gemini --yolo "/diagram 'description'"
gemini --yolo "/pattern 'description'"
gemini --yolo "/restore old_photo.jpg 'fix scratches'"
```

`--yolo` is always required. Output lands in `./nanobanana-output/`.

## Options

| Flag | Effect |
|------|--------|
| `--count=N` | N variations (1-8) |
| `--styles="style1,style2"` | Artistic styles |
| `--aspect=16:9` | Aspect ratio |

## Model

Default: `gemini-2.5-flash-image` (~$0.04/image)
Higher quality: `export NANOBANANA_MODEL=gemini-3-pro-image-preview`

## Common Sizes

| Use Case | Dimensions |
|----------|------------|
| Blog / social preview | 1200x630 |
| YouTube thumbnail | 1280x720 |
| Square social | 1080x1080 |
| Twitter header | 1500x500 |

## Prompt Tips

- Always add `no text` unless you want text in the image
- Name style explicitly: "flat illustration", "editorial photo", "3D render", "dark crypto aesthetic"
- For abstract/tech: describe mood and color, not specific structure

## After Generation

1. List `./nanobanana-output/` for the file
2. Show to user, offer variations if needed
3. For changes: re-run with adjusted prompt or use `/edit`

## Local Python Alternative (this project)

For content-engine pipelines, use `render_nanobanana` from `~/tools/content-engine/content_engine/math_image.py` — calls `gemini-3-pro-image-preview` directly and stamps the Tangle logo.
