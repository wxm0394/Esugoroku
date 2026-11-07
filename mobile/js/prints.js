// V2 print loader: real public-domain ukiyo-e textures for every card/node.
import { PRINT_ASSETS, PRINT_ROOT } from './prints_assets.js';
import AssetManager from '../../assets/asset-manager.js';

const cache = new Map();
const pending = new Map();

function makeImage(src) {
  const img = new Image();
  img.decoding = 'async';
  img.loading = 'eager';
  img.src = src;
  return img;
}

function load(src) {
  if (!src) return null;
  if (cache.has(src)) return cache.get(src);
  if (pending.has(src)) return pending.get(src);
  const img = makeImage(src);
  const promise = new Promise((resolve) => {
    img.onload = () => { cache.set(src, img); pending.delete(src); resolve(img); };
    img.onerror = () => { cache.set(src, null); pending.delete(src); resolve(null); };
  });
  pending.set(src, promise);
  return promise;
}

// Resolve Asset ID for board id + art key
export function getAssetId(boardId, art) {
  if (boardId === 'charms') {
    return `charm.${art}`;
  }
  return `print.${boardId}.${art}`;
}

// Resolve by board id + art key. Returns an HTMLImageElement | null.
export function getPrint(boardId, art) {
  const id = getAssetId(boardId, art);
  const loaded = AssetManager.loadedImages.get(id);
  if (loaded) return loaded;

  const src = getPrintURL(boardId, art);
  if (!src) return null;
  const entry = cache.get(src);
  if (entry) return entry;
  return null;
}

export function getPrintURL(boardId, art) {
  const id = getAssetId(boardId, art);
  const url = AssetManager.getUrl(id);
  if (url && !url.includes('fallback-image')) return url;
  const table = PRINT_ASSETS[boardId];
  if (!table || !table[art]) return null;
  return table[art];
}

export function getCharmPrint(charmId) {
  const id = `charm.${charmId}`;
  const loaded = AssetManager.loadedImages.get(id);
  if (loaded) return loaded;

  const src = getPrintURL('charms', charmId);
  return src ? cache.get(src) || null : null;
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
  const charmTable = PRINT_ASSETS.charms;
  if (charmTable) {
    for (const charmKey of Object.keys(charmTable)) {
      assetIds.push(getAssetId('charms', charmKey));
    }
  }

  // Preload via AssetManager for all registered prints, with direct URL fallback loader as backup
  return Promise.all(assetIds.map(async (id) => {
    await AssetManager.preloadAsset(id);
    const loaded = AssetManager.loadedImages.get(id);
    if (loaded) return loaded;
    const url = AssetManager.getUrl(id);
    if (url) return load(url);
    return null;
  }));
}

export function isPrintLoaded(boardId, art) {
  const id = getAssetId(boardId, art);
  if (AssetManager.loadedImages.has(id)) return true;
  const url = getPrintURL(boardId, art);
  return url ? cache.has(url) : false;
}
