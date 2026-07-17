# Figma Asset Inspector

A Figma plugin to find and compress bloated image assets across an entire Figma / Figma Slides file — no downloading, no re-uploading.

## The problem

Figma stores images at their original uploaded resolution internally, even if they display small on a slide. A single image can weigh 10MB+ inside the file, making presentations slow to open and share. There's no native way in Figma to see which assets are bloated or compress them in place.

## What this plugin does

- Scans **every image on every slide/page** in the file in one click — no need to hunt through slides
- Lists images sorted largest-first, so the worst offenders surface immediately
- Adjustable size threshold — set the KB cutoff and the dashboard flags everything above it
- Per-image quality slider with a live size estimate so you know the outcome before committing
- Full-size side-by-side preview to compare original vs. compressed and check how much quality is lost
- Click any thumbnail or slide name to jump straight to that image on the canvas
- Compresses images directly in Figma — no external tools, no downloading, no re-uploading
- Flags videos in the file so you know they're there, even though they can't be compressed
- Fully undoable with ⌘Z

## How to use it

1. Open a Figma or Figma Slides file
2. Run the plugin via Plugins → Asset Inspector
3. Click **Scan all slides** — every image in the file is collected and listed
4. Drag the **threshold slider** to control which images get flagged (defaults to 500 KB)
5. Move the quality slider on any image to preview its estimated output size
6. Click **Preview** to open a full-size before/after comparison
7. When happy with the result, click **Compress**
8. Click a thumbnail or slide name any time to jump to that image on the canvas
9. Changed your mind? Hit ⌘Z to undo

## Limitations

- **Output format is JPEG only** — the Figma API only reliably accepts JPEG bytes when replacing image fills. PNG and WebP are not supported.
- **Videos cannot be compressed** — the Figma API does not expose video data to plugins. Videos are flagged for visibility only.
- Large images (10MB+) may take 30–60 seconds to process — this is normal.
- Compression is lossy. Use ⌘Z or File → Version History to undo if needed.

## How it works

The plugin runs in two contexts that communicate via `postMessage`:

- **`code.js`** runs in Figma's sandbox — it has access to the Figma API. It walks every page and node in the file, collects image/video metadata, fetches raw bytes on demand, replaces fills after compression, and jumps the canvas to a node when asked.
- **`ui.html`** runs in a browser iframe — it handles the UI and uses the Canvas API to compress images (since the Figma sandbox has no browser APIs).

To keep large decks from blowing up memory, scanning sends **metadata only** (size, name, slide). The raw bytes for an image are fetched lazily — only when a row needs a thumbnail, a preview, or a compression.

```
User clicks Scan
  → UI → code.js: { type: 'scan' }
  → code.js walks every page/node, sends metadata per asset:
      code.js → UI: { type: 'asset', data: { assetKey, nodeId, fillIndex, nodeName, slideName, sizeKB } }
  → code.js → UI: { type: 'done', total }

UI needs an image's bytes (thumbnail / slider / preview / compress)
  → UI → code.js: { type: 'getBytes', assetKey, nodeId, fillIndex }
  → code.js → UI: { type: 'bytes', assetKey, bytes }

User clicks a thumbnail or slide name
  → UI → code.js: { type: 'navigate', nodeId }   // jumps the canvas to that slide

User clicks Preview
  → UI → code.js: { type: 'resize', width, height }   // expands the plugin window
  → shows full-size before/after comparison

User clicks Compress
  → UI compresses bytes via Canvas, sends them back:
      UI → code.js: { type: 'compress', assetKey, nodeId, fillIndex, bytes }
  → code.js replaces only that fill, confirms new size:
      code.js → UI: { type: 'compressed', assetKey, newSizeKB }
```

A single node can hold several image fills, so every asset is keyed by `nodeId:fillIndex` and only the targeted fill is replaced on compress.

## Development

No build step required — plain HTML and JavaScript.

1. Clone the repo
2. In Figma desktop: Plugins → Development → Import plugin from manifest
3. Select `manifest.json`
4. Run via Plugins → Development → Asset Inspector

## Made by

[Gaia Di Gregorio](https://github.com/GaiaGD) — built at [Grow](https://thisisgrow.com)
