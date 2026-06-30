// ─────────────────────────────────────────────────────────────
// PLUGIN MESSAGE FLOW
// ─────────────────────────────────────────────────────────────
//
// 1. code.js scans all pages and sends each asset to the UI
//    code.js → UI: { type: 'asset', data: { nodeId, nodeName, page, sizeKB, bytes } }
//
// 2. code.js finishes scanning
//    code.js → UI: { type: 'done' }
//
// 3. User clicks Compress — UI compresses bytes via Canvas and sends back
//    UI → code.js: { type: 'compress', nodeId, bytes }
//
// 4. code.js replaces the fill in Figma and confirms with new size
//    code.js → UI: { type: 'compressed', nodeId, newSizeKB }
//
// ─────────────────────────────────────────────────────────────
// code.js sends  → UI   :  figma.ui.postMessage({ ... })
// UI sends       → code.js :  parent.postMessage({ pluginMessage: { ... } }, '*')
// UI receives      :  window.onmessage
// code.js receives :  figma.ui.onmessage
// ─────────────────────────────────────────────────────────────


// Show the plugin UI at a fixed size
figma.showUI(__html__, { width: 400, height: 600 });

async function scanAssets() {
  // Loop through every page in the file
  for (const page of figma.root.children) {
    // Get every node on this page (frames, images, shapes, etc.)
    const nodes = page.findAll();

    for (const node of nodes) {
      // Skip nodes that can't have fills (e.g. groups, connectors)
      if (!('fills' in node)) continue;

      for (const fill of node.fills) {

        if (fill.type === 'IMAGE') {
          try {
            // Get the image object stored in Figma using its hash (unique ID)
            const image = figma.getImageByHash(fill.imageHash);
            // Fetch the raw bytes of the image as stored internally by Figma
            const bytes = await image.getBytesAsync();

            // Send this asset to the UI one at a time (avoids out-of-memory crash)
            figma.ui.postMessage({
              type: 'asset',
              data: {
                type: 'image',
                nodeId: node.id,
                nodeName: node.name,
                page: page.name,
                hash: fill.imageHash,
                sizeKB: Math.round(bytes.length / 1024),
                bytes: Array.from(bytes) // Convert Uint8Array to plain array for postMessage
              }
            });
          } catch (e) {
            console.error('Failed on node:', node.name, e);
          }
        }

        if (fill.type === 'VIDEO') {
          // Videos can't be compressed via the Figma API — flag them for visibility
          figma.ui.postMessage({
            type: 'asset',
            data: {
              type: 'video',
              nodeId: node.id,
              nodeName: node.name,
              page: page.name
            }
          });
        }
      }
    }
  }

  // Tell the UI the scan is complete
  figma.ui.postMessage({ type: 'done' });
}

scanAssets();

// figma.ui.onmessage is the listener in code.js
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'close') figma.closePlugin();

  if (msg.type === 'compress') {
    const { nodeId, bytes } = msg;

    // Search all pages for the node with the matching ID
    let targetNode = null;
    for (const page of figma.root.children) {
      targetNode = page.findOne(n => n.id === nodeId);
      if (targetNode) break;
    }

    if (!targetNode || !('fills' in targetNode)) return;

    // Create a new image in Figma from the compressed bytes sent by the UI
    const newImage = figma.createImage(new Uint8Array(bytes));

    // Replace the old image fill hash with the new compressed image hash
    // Object.assign used instead of spread (...) — Figma sandbox doesn't support spread
    targetNode.fills = targetNode.fills.map(fill => {
      if (fill.type === 'IMAGE') {
        return Object.assign({}, fill, { imageHash: newImage.hash });
      }
      return fill;
    });

    // Calculate new size and send back to UI for display
    const newSizeKB = Math.round(bytes.length / 1024);
    figma.ui.postMessage({ type: 'compressed', nodeId, newSizeKB });
  }
};