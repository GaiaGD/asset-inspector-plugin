# Figma Asset Inspector

A Figma plugin to inspect and compress image assets directly inside Figma Slides — no downloading, no re-uploading.

## The problem

Figma Slides stores images at their original uploaded resolution internally, even if they display small on a slide. A single image can weigh 10MB+ inside the file, making presentations slow to open and share. There's no native way in Figma to see which assets are bloated or compress them in place.

## What this plugin does

- Scans all pages in a Figma file and lists every image with its file size
- Flags videos (which can't be compressed via the Figma API) for visibility
- Lets you compress images individually, directly inside Figma
- Per-image quality slider with live size estimate before you commit
- Shows the size before and after compression
- No external tools, no downloading, no re-uploading

## How to use it

1. Open a Figma or Figma Slides file
2. Run the plugin via Plugins → Asset Inspector
3. Wait for the scan to complete — images appear with their sizes (red = over 500KB)
4. Choose your output format (JPEG or WebP) at the top
5. Move the quality slider on each image to preview the estimated output size
6. When happy with the estimate, click **Compress**

## Format guide

| Format | Use case |
|---|---|
| JPEG | Good default — widely supported, significant size reduction |
| WebP | Smaller than JPEG at same quality — best for modern workflows |

## Limitations

- **Videos cannot be compressed** — the Figma API does not expose video data to plugins. Videos are listed for visibility only.
- Large images (10MB+) may take 30–60 seconds to process — this is normal.
- Compression is lossy. Use ⌘Z or File → Version History to undo if needed.

## How it works

The plugin runs in two contexts that communicate via `postMessage`:

- **`code.js`** runs in Figma's sandbox — it has access to the Figma API and scans nodes, fetches image bytes, and replaces fills after compression
- **`ui.html`** runs in a browser iframe — it handles the UI and uses the Canvas API to compress images (since the Figma sandbox has no browser APIs)

```
code.js scans file
  → sends each asset to UI ({ type: 'asset' })
  → sends done signal ({ type: 'done' })

User clicks Compress
  → UI compresses bytes via Canvas
  → sends compressed bytes to code.js ({ type: 'compress' })

code.js replaces fill in Figma
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
