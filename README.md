# Figma Asset Inspector

A Figma plugin to inspect and compress image assets directly inside Figma Slides — no downloading, no re-uploading.

## The problem

Figma Slides stores images at their original uploaded resolution internally, even if they display small on a slide. A single image can weigh 10MB+ inside the file, making presentations slow to open and share. There's no native way in Figma to see which assets are bloated or compress them in place.

## What this plugin does

- Scan a single image, a whole slide, or multiple slides at once — your selection determines the scope
- Shows the current size of every image found (red = over 500KB)
- Per-image quality slider with a live size estimate so you know the outcome before committing
- Full-size side-by-side preview to compare before and after and check how much quality is lost
- Compresses images directly in Figma — no external tools, no downloading, no re-uploading
- Flags videos in the selection so you know they're there, even though they can't be compressed
- Fully undoable with ⌘Z

## How to use it

1. Open a Figma or Figma Slides file
2. Run the plugin via Plugins → Asset Inspector
3. Select an image, a slide, or multiple slides, then click **Scan selected slide**
4. Images appear with their current sizes
5. Move the quality slider on each image to preview the estimated output size
6. Click **Preview** to open a full-size before/after comparison
7. When happy with the result, click **Compress**
8. Changed your mind? Hit ⌘Z to undo

## Limitations

- **Output format is JPEG only** — the Figma API only reliably accepts JPEG bytes when replacing image fills. PNG and WebP are not supported.
- **Videos cannot be compressed** — the Figma API does not expose video data to plugins. Videos are flagged for visibility only.
- Large images (10MB+) may take 30–60 seconds to process — this is normal.
- Compression is lossy. Use ⌘Z or File → Version History to undo if needed.

## How it works

The plugin runs in two contexts that communicate via `postMessage`:

- **`code.js`** runs in Figma's sandbox — it has access to the Figma API and scans nodes, fetches image bytes, and replaces fills after compression
- **`ui.html`** runs in a browser iframe — it handles the UI and uses the Canvas API to compress images (since the Figma sandbox has no browser APIs)

```
code.js scans selection
  → sends each asset to UI ({ type: 'asset' })
  → sends done signal ({ type: 'done' })

User moves slider
  → UI compresses via Canvas and caches the result for preview

User clicks Preview
  → UI requests plugin window resize ({ type: 'resize' })
  → shows full-size before/after comparison

User clicks Compress
  → UI sends compressed bytes to code.js ({ type: 'compress' })
  → code.js replaces fill in Figma
  → confirms back to UI with new size ({ type: 'compressed' })
```

## Development

No build step required — plain HTML and JavaScript.

1. Clone the repo
2. In Figma desktop: Plugins → Development → Import plugin from manifest
3. Select `manifest.json`
4. Run via Plugins → Development → Asset Inspector

## Made by

[Gaia Di Gregorio](https://github.com/GaiaGD) — built at [Grow](https://thisisgrow.com)
