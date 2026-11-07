// Esugoroku V2.1 Modular Asset System
// Unit Test Suite for AssetManager & AssetRegistry

import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Mock Image for Node.js environment before importing AssetManager
global.Image = global.Image || class {
  constructor(src) {
    this._src = src || '';
    this.width = 100;
    this.height = 100;
  }
  set src(val) {
    this._src = val;
    setTimeout(() => { if (this.onload) this.onload(); }, 0);
  }
  get src() { return this._src; }
  addEventListener() {}
  removeEventListener() {}
};

import { AssetRegistryImpl } from '../assets/manifest/asset-registry.js';
import { AssetManager } from '../assets/asset-manager.js';
import { BrowserAssetAdapter } from '../assets/adapters/browser-asset-adapter.js';

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

  // 4. Test Programmatic Asset Registry & Creation
  console.log('Test 4: Programmatic Asset Registry & Preloading (3D Models, SFX & BGM Themes)');
  assert.ok(registry.isProgrammatic('piece.kokeshi'), 'piece.kokeshi should be identified as programmatic');
  assert.ok(registry.isProgrammatic('audio.sfx.dice-roll'), 'audio.sfx.dice-roll should be identified as programmatic');
  assert.ok(registry.isProgrammatic('audio.bgm.tokaido'), 'audio.bgm.tokaido should be identified as programmatic');
  assert.ok(registry.isProgrammatic('audio.bgm.genji'), 'audio.bgm.genji should be identified as programmatic');

  // Test 3D Kokeshi pawn factory resolution
  const kokeshiAsset = await manager.preloadAsset('piece.kokeshi');
  assert.ok(kokeshiAsset, 'Preloading piece.kokeshi should return generated programmatic asset object');
  assert.equal(kokeshiAsset.id, 'piece.kokeshi', 'Programmatic asset ID should match');
  assert.equal(kokeshiAsset.implementationKey, 'piece.kokeshi', 'Implementation key should match');
  assert.ok(kokeshiAsset.factoryInfo && typeof kokeshiAsset.factoryInfo.create === 'function', 'Kokeshi pawn should expose create factory method');
  const pawnInst = kokeshiAsset.factoryInfo.create(0, '#bf3426', '#f5dc98', '一');
  assert.equal(pawnInst.kind, 'kokeshi-pawn', 'Created pawn should match kind kokeshi-pawn');
  assert.equal(pawnInst.side, 0, 'Created pawn side should match');

  // Test 3D Bone Dice factory resolution
  const diceAsset = await manager.preloadAsset('model.dice.bone');
  assert.ok(diceAsset, 'Preloading model.dice.bone should return generated programmatic asset object');
  assert.ok(diceAsset.factoryInfo && typeof diceAsset.factoryInfo.create === 'function', 'Bone dice should expose create factory method');
  const diceInst = diceAsset.factoryInfo.create();
  assert.equal(diceInst.kind, 'bone-dice', 'Created dice should match kind bone-dice');
  assert.equal(diceInst.faces, 6, 'Created dice should have 6 faces');

  // Test BGM theme resolution for all 4 themes
  for (const boardId of ['tokaido', 'yokai', 'kesshu', 'genji']) {
    const bgmAsset = await manager.preloadAsset(`audio.bgm.${boardId}`);
    assert.ok(bgmAsset, `Preloading audio.bgm.${boardId} should succeed`);
    assert.equal(bgmAsset.kind, 'webaudio-bgm', `BGM asset type should be webaudio-bgm`);
    assert.ok(bgmAsset.factoryInfo, `BGM asset should have factoryInfo`);
  }

  // Test Programmatic Concurrency De-duplication (call preload 5 times concurrently, ensure resolver count = 1)
  let executionCount = 0;
  registry.registerProgrammaticAsset('test.concurrent.asset', async () => {
    executionCount++;
    await new Promise(r => setTimeout(r, 20));
    return { id: 'test.concurrent.asset', count: executionCount };
  });
  // Temporarily add mock asset definition to manifest map for test
  registry.assetsMap.set('test.concurrent.asset', { id: 'test.concurrent.asset', type: 'programmatic', sourceType: 'factory' });

  const concurrentResults = await Promise.all([
    manager.preloadAsset('test.concurrent.asset'),
    manager.preloadAsset('test.concurrent.asset'),
    manager.preloadAsset('test.concurrent.asset'),
    manager.preloadAsset('test.concurrent.asset'),
    manager.preloadAsset('test.concurrent.asset')
  ]);
  assert.equal(executionCount, 1, 'Programmatic asset factory execution count must be 1 for concurrent requests');
  assert.equal(concurrentResults.length, 5, 'All 5 concurrent promises should resolve');
  assert.equal(concurrentResults[0], concurrentResults[4], 'All concurrent promises should resolve to identical instance');

  assert.ok(manager.assetCache.has('piece.kokeshi'), 'Programmatic asset should be stored in assetCache');
  console.log('  ✅ Programmatic asset registry, 3D/Audio factories & concurrency de-duplication tests passed.');

  // 5. Test BrowserAssetAdapter URL joining logic
  console.log('Test 5: BrowserAssetAdapter URL joining & protocol preservation');
  const adapterWithBase = new BrowserAssetAdapter({ baseUrl: 'http://localhost:8080' });
  const joinedUrl = adapterWithBase.toLoadUrl('assets/prints/tokaido_nihonbashi.webp');
  assert.equal(joinedUrl, 'http://localhost:8080/assets/prints/tokaido_nihonbashi.webp', 'URL join should maintain http:// scheme');

  const dataUrl = adapterWithBase.toLoadUrl('data:image/svg+xml;utf8,<svg></svg>');
  assert.equal(dataUrl, 'data:image/svg+xml;utf8,<svg></svg>', 'data URI should be returned as-is');

  console.log('  ✅ BrowserAssetAdapter URL joining tests passed.');

  console.log('\n✅ All AssetManager & AssetRegistry unit tests PASSED successfully.');
}

runUnitTests().catch((err) => {
  console.error('\n❌ Unit tests failed:', err);
  process.exit(1);
});
