// ─────────────────────────────────────────────────────────────
// PLUGIN MESSAGE FLOW
// ─────────────────────────────────────────────────────────────
//
// 1. User clicks Scan in the UI
//    UI → code.js: { type: 'scan' }
//
// 2. code.js scans EVERY slide in the whole file and sends each image's
//    METADATA only (no bytes — keeps a big deck from blowing up memory)
//    code.js → UI: { type: 'asset', data: { assetKey, nodeId, fillIndex, nodeName, slideName, sizeKB } }
//
// 3. code.js finishes scanning
//    code.js → UI: { type: 'done', total }
//
// 4. User interacts with a row (slider / preview / compress). The UI asks for
//    the raw bytes of just that one image, on demand.
//    UI → code.js: { type: 'getBytes', assetKey, nodeId, fillIndex }
//    code.js → UI: { type: 'bytes', assetKey, bytes }
//
// 5. User clicks a row's image — jump to the slide that contains it
//    UI → code.js: { type: 'navigate', nodeId }
//
// 6. User clicks Compress — UI compresses bytes via Canvas and sends back
//    UI → code.js: { type: 'compress', assetKey, nodeId, fillIndex, bytes }
//    code.js → UI: { type: 'compressed', assetKey, newSizeKB }
//
// ─────────────────────────────────────────────────────────────
// code.js sends  → UI      : figma.ui.postMessage({ ... })
// UI sends       → code.js : parent.postMessage({ pluginMessage: { ... } }, '*')
// UI receives    : window.onmessage
// code.js receives : figma.ui.onmessage
// ─────────────────────────────────────────────────────────────

figma.showUI(__html__, { width: 400, height: 600 });

// A stable key for one image fill on one node (a node can have several fills).
function assetKeyFor(nodeId, fillIndex) {
  return nodeId + ':' + fillIndex;
}

// Detect the image format from its magic-number byte signature.
// Used to badge PNGs in the UI (PNG transparency turns black when re-encoded to JPEG).
function detectFormat(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'PNG';
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'JPEG';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'WEBP';
  if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'GIF';
  return 'IMG';
}

// Walk up the parent chain to find the Slide this node lives on.
// Falls back to the containing page's name for non-Slides files.
function findSlideName(node, page) {
  let current = node;
  while (current) {
    if (current.type === 'SLIDE') return current.name;
    current = current.parent;
  }
  return page ? page.name : '(unknown)';
}

// Look up a node by id, loading pages if needed. Works across the whole file.
async function getNode(nodeId) {
  if (figma.getNodeByIdAsync) return figma.getNodeByIdAsync(nodeId);
  return figma.getNodeById(nodeId);
}

// Find the page a node belongs to by walking up to the PAGE ancestor.
function pageOf(node) {
  let current = node;
  while (current && current.type !== 'PAGE') current = current.parent;
  return current;
}

// ─────────────────────────────────────────────────────────────
// SCAN — every image on every slide, metadata only
// ─────────────────────────────────────────────────────────────
async function scanAllAssets() {
  // Ensure every page is loaded before traversing (dynamic-page safe).
  if (figma.loadAllPagesAsync) {
    try { await figma.loadAllPagesAsync(); } catch (e) { /* older API: pages already loaded */ }
  }

  let total = 0;

  for (const page of figma.root.children) {

    // Dynamic pages can add/remove nodes while we scan, so findAll(() => true) to get a live list of all nodes on the page as we go.
    // Safer than a recursive walk that could throw if the tree changes underfoot.
    const nodes = [page, ...page.findAll(() => true)];

    for (const node of nodes) {
      // Skip nodes with no fills array. `fills` can be figma.mixed (a Symbol)
      // on e.g. text nodes with mixed fills — iterating that throws, so guard.
      if (!('fills' in node)) continue;
      // Read fills ONCE — every `node.fills` access builds a fresh copy inside Figma.
      const fills = node.fills;
      if (!Array.isArray(fills)) continue;

      const slideName = findSlideName(node, page);

      // Iterate the fills array, as a node can have multiple fills — we want to capture each one.
      for (let fillIndex = 0; fillIndex < fills.length; fillIndex++) {
        const fill = fills[fillIndex];

        if (fill.type === 'IMAGE') {
          try {
            // Get the image bytes now to calculate the size in KB, but we'll fetch them again lazily later when the user clicks "Compress"
            // This avoids keeping big images in memory during the scan.
            const key = assetKeyFor(node.id, fillIndex);
            const image = figma.getImageByHash(fill.imageHash);
            if (!image) continue;
            let bytes = await image.getBytesAsync();

            // Copy everything into plain strings/numbers, then drop the big byte buffer
            // BEFORE posting — so the message holds no Figma objects and memory is freed.
            const sizeKB = Math.round(bytes.length / 1024);
            const format = detectFormat(bytes);
            bytes = null;

            // Send metadata about this image fill to the UI, which will create a row for it.
            // No bytes yet — those are fetched lazily when the user interacts with the row.
            figma.ui.postMessage({
              type: 'asset',
              data: {
                type: 'image',
                assetKey: key,
                nodeId: String(node.id),
                fillIndex: fillIndex,
                nodeName: String(node.name),
                slideName: String(slideName),
                sizeKB: sizeKB,
                format: format
              }
            });
            total++;
          } catch (e) {
            console.error('Failed to read image on node:', node.name, String(e && e.message || e));
          }
        } else if (fill.type === 'VIDEO') {
          figma.ui.postMessage({
            type: 'asset',
            data: {
              type: 'video',
              assetKey: assetKeyFor(node.id, fillIndex),
              nodeId: node.id,
              fillIndex,
              nodeName: node.name,
              slideName
            }
          });
        }
      }
    }
  }

  figma.ui.postMessage({ type: 'done', total });
}

// ─────────────────────────────────────────────────────────────
// Fetch the raw bytes for a single image fill, on demand.
// ─────────────────────────────────────────────────────────────
async function sendBytes(assetKey, nodeId, fillIndex) {
  try {
    const node = await getNode(nodeId);
    if (!node || !('fills' in node) || !Array.isArray(node.fills)) {
      figma.ui.postMessage({ type: 'bytesError', assetKey, message: 'Node no longer exists.' });
      return;
    }
    const fill = node.fills[fillIndex];
    if (!fill || fill.type !== 'IMAGE') {
      figma.ui.postMessage({ type: 'bytesError', assetKey, message: 'Image fill no longer exists.' });
      return;
    }
    const image = figma.getImageByHash(fill.imageHash);
    const bytes = await image.getBytesAsync();
    figma.ui.postMessage({ type: 'bytes', assetKey, bytes: bytes });  // send the Uint8Array as-is — Array.from on a multi-MB image blows the plugin's memory
  } catch (e) {
    console.error('getBytes failed:', String(e && e.message || e));
    figma.ui.postMessage({ type: 'bytesError', assetKey, message: 'Could not load image bytes.' });
  }
}

// ─────────────────────────────────────────────────────────────
// Navigate — jump the canvas to the slide holding this image
// ─────────────────────────────────────────────────────────────
async function navigateTo(nodeId) {
  try {
    const node = await getNode(nodeId);
    if (!node) {
      figma.ui.postMessage({ type: 'error', message: 'That image no longer exists.' });
      return;
    }
    const page = pageOf(node);
    if (page && figma.currentPage !== page) {
      if (figma.setCurrentPageAsync) await figma.setCurrentPageAsync(page);
      else figma.currentPage = page;
    }
    figma.currentPage.selection = [node];
    figma.viewport.scrollAndZoomIntoView([node]);
  } catch (e) {
    console.error('navigate failed:', String(e && e.message || e));
    figma.ui.postMessage({ type: 'error', message: 'Could not jump to that image.' });
  }
}

// ─────────────────────────────────────────────────────────────
// Compress — replace only the targeted image fill with new bytes
// ─────────────────────────────────────────────────────────────
async function compress(assetKey, nodeId, fillIndex, bytes) {
  try {
    const node = await getNode(nodeId);
    if (!node || !('fills' in node) || !Array.isArray(node.fills)) {
      figma.ui.postMessage({ type: 'compressError', assetKey, message: 'Node no longer exists.' });
      return;
    }

    const newImage = figma.createImage(new Uint8Array(bytes));

    // Replace ONLY the fill at fillIndex — a node can hold several image fills.
    // Object.assign (not spread) — the Figma sandbox doesn't support spread on fills.
    // Deep-clone to plain JSON first — Figma's fill objects are sandbox proxies, and
    // handing nested proxies (filters, imageTransform) back to the setter aborts the runtime.
    const nextFills = JSON.parse(JSON.stringify(node.fills));
    const target = nextFills[fillIndex];
    if (!target || target.type !== 'IMAGE') {
      figma.ui.postMessage({ type: 'compressError', assetKey, message: 'Image fill no longer exists.' });
      return;
    }
    target.imageHash = newImage.hash;
    node.fills = nextFills;

    const newSizeKB = Math.round(bytes.length / 1024);
    figma.ui.postMessage({ type: 'compressed', assetKey, newSizeKB });
  } catch (e) {
    console.error('compress failed:', String(e && e.message || e));
    figma.ui.postMessage({ type: 'compressError', assetKey, message: 'Compression failed to apply.' });
  }
}

// ─────────────────────────────────────────────────────────────
// Message router
// ─────────────────────────────────────────────────────────────
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'close') figma.closePlugin();
  else if (msg.type === 'scan') scanAllAssets();
  else if (msg.type === 'getBytes') sendBytes(msg.assetKey, msg.nodeId, msg.fillIndex);
  else if (msg.type === 'navigate') navigateTo(msg.nodeId);
  else if (msg.type === 'compress') compress(msg.assetKey, msg.nodeId, msg.fillIndex, msg.bytes);
  else if (msg.type === 'resize') figma.ui.resize(msg.width, msg.height);
};
