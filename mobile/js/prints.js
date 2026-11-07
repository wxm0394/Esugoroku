// V2 print loader: unified with AssetManager for caching & runtime integration.
// All print assets are loaded through AssetManager; this module provides
// convenience accessors that delegate to the shared AssetManager cache.

import AssetManager from '../../assets/asset-manager.js';
import { PRINT_ASSETS, PRINT_ROOT } from './prints_assets.js';

// No duplicate local cache - all assets go through AssetManager

// Resolve Asset ID for board id + art key
export function getAssetId(boardId, art) {
  if (boardId === 'charms') {
    return `charm.${art}`;
  }
  return `print.${boardId}.${art}`;
}

// Resolve by board id + art key. Returns an HTMLImageElement | null.
// Delegates to AssetManager.loadedImages for cached assets.
export function getPrint(boardId, art) {
  const id = getAssetId(boardId, art);
  return AssetManager.loadedImages.get(id) || null;
}

// Resolve URL for print asset
export function getPrintURL(boardId, art) {
  const id = getAssetId(boardId, art);
  return AssetManager.getUrl(id);
}

// Kick off loading immediately through AssetManager so textures are preloaded and cached.
export function loadAllPrints() {
  const assetIds = [];
  for (const boardId of ['tokaido', 'yokai', 'kesshu', 'genji']) {
    const table = PRINT_ASSETS[boardId];
    if (table) {
      for (const artKey of Object.keys(table)) {
        assetIds.push(getAssetId(boardId, artKey));
      }
    }
  }

  // Preload via AssetManager for all registered prints
  return Promise.all(assetIds.map(async (id) => {
    await AssetManager.preloadAsset(id);
    return AssetManager.loadedImages.get(id) || null;
  }));
}

// Check if a print is loaded
export function isPrintLoaded(boardId, art) {
  const id = getAssetId(boardId, art);
  return AssetManager.loadedImages.has(id);
}
