// Esugoroku V2.1 Modular Asset System
// Unit Test Suite for AssetManager & AssetRegistry

import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Mock Image for Node.js environment before importing AssetManager
global.Image = global.Image || class {
  constructor(src) { this.src = src; this.onload = null; this.onerror = null; this.width = 100; this.height = 100; }
  addEventListener() {}
  removeEventListener() {}
};

import { AssetRegistryImpl } from '../assets/manifest/asset-registry.js';
import { AssetManager } from '../assets/asset-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.resolve(ROOT_DIR, 'assets/manifest/asset-manifest.json');

async function runUnitTests() {
  console.log('----------------------------------------------------');
  console.log('Esugoroku V2.1 AssetManager & Registry Unit Tests');
  console.log('----------------------------------------------------');

  const rawManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  // 1. Test AssetRegistry initialization & group queries
  const registry = new AssetRegistryImpl();
  registry.init(rawManifest);

  console.log('Test 1: AssetRegistry.getAssetsByGroup');
  const tokaidoGroup = registry.getAssetsByGroup('board.tokaido');
  assert.ok(Array.isArray(tokaidoGroup), 'Group query should return an array');
  assert.ok(tokaidoGroup.includes('board.tokaido.background'), 'Group should include board.tokaido.background');
  assert.ok(tokaidoGroup.includes('artwork.sheet.tokaido.jinja'), 'Group should include jinja sheet');

  const printTokaidoGroup = registry.getAssetsByGroup('print.tokaido');
  assert.ok(printTokaidoGroup.includes('print.tokaido.nihonbashi'), 'Prefix matching should include print.tokaido.nihonbashi');
  console.log('  ✅ AssetRegistry group query tests passed.');

  // 2. Test AssetManager URL resolution
  console.log('Test 2: AssetManager.getUrl resolution & null fallback');
  const manager = new AssetManager(registry);

  const bgUrl = manager.getUrl('board.tokaido.background');
  assert.equal(bgUrl, '/assets/images/boards/tokaido/background.jpg', 'Registered asset should return correct path');

  const missingUrl = manager.getUrl('non.existent.asset.id');
  assert.equal(missingUrl, null, 'Unregistered asset should return null');

  const fallbackUrl = manager.getFallbackUrl('non.existent.asset.id', 'image');
  assert.ok(fallbackUrl.startsWith('data:image/svg+xml'), 'Fallback image should return SVG data URI');
  console.log('  ✅ AssetManager getUrl & fallback tests passed.');

  // 3. Test Request De-duplication: pendingLoads Map initialization & clearing
  console.log('Test 3: Request De-duplication tracking (pendingLoads)');
  assert.ok(manager.pendingLoads instanceof Map, 'pendingLoads should be a Map instance');
  assert.ok(manager.pendingLoads.size === 0, 'pendingLoads should start empty');

  // Verify pendingLoads is cleared after preload completes (even if image load fails in Node.js)
  await manager.preloadAsset('board.tokaido.background');
  assert.ok(manager.pendingLoads.size === 0, 'pendingLoads should be cleared after preload completes');

  console.log('  ✅ Request de-duplication tests passed.');

  console.log('\n✅ All AssetManager & AssetRegistry unit tests PASSED successfully.');
}

runUnitTests().catch((err) => {
  console.error('\n❌ Unit tests failed:', err);
  process.exit(1);
});
