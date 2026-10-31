// V2 print loader: real public-domain ukiyo-e textures for every card/node.
import { PRINT_ASSETS, PRINT_ROOT } from './prints_assets.js';

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

// Resolve by board id + art key.  Returns an HTMLImageElement | null.
export function getPrint(boardId, art) {
  const table = PRINT_ASSETS[boardId];
  if (!table || !table[art]) return null;
  const src = table[art];
  const entry = cache.get(src);
  if (entry) return entry;
  return null;
}

export function getPrintURL(boardId, art) {
  const table = PRINT_ASSETS[boardId];
  if (!table || !table[art]) return null;
  return table[art];
}

export function getCharmPrint(charmId) {
  const table = PRINT_ASSETS.charms;
  if (!table || !table[charmId]) return null;
  const src = table[charmId];
  return cache.get(src) || null;
}

// Kick off loading immediately so textures are decoded before first paint.
export function loadAllPrints() {
  const urls = [];
  for (const boardId of ['tokaido', 'yokai', 'kesshu', 'genji']) {
    const table = PRINT_ASSETS[boardId];
    if (table) for (const src of Object.values(table)) urls.push(src);
  }
  const charmTable = PRINT_ASSETS.charms;
  if (charmTable) for (const src of Object.values(charmTable)) urls.push(src);
  return Promise.all(urls.map(load));
}

export function isPrintLoaded(boardId, art) {
  const url = getPrintURL(boardId, art);
  return url ? cache.has(url) : false;
}
