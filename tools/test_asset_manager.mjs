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

import * as THREE from 'three';

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
  assert.ok(registry.isProgrammatic('model.dice.bone'), 'model.dice.bone should be identified as programmatic');
  assert.ok(registry.isProgrammatic('audio.sfx.dice-roll'), 'audio.sfx.dice-roll should be identified as programmatic');
  assert.ok(registry.isProgrammatic('audio.sfx.wood-clack'), 'audio.sfx.wood-clack should be identified as programmatic');
  assert.ok(registry.isProgrammatic('audio.bgm.tokaido'), 'audio.bgm.tokaido should be identified as programmatic');
  assert.ok(registry.isProgrammatic('audio.bgm.yokai'), 'audio.bgm.yokai should be identified as programmatic');
  assert.ok(registry.isProgrammatic('audio.bgm.kesshu'), 'audio.bgm.kesshu should be identified as programmatic');
  assert.ok(registry.isProgrammatic('audio.bgm.genji'), 'audio.bgm.genji should be identified as programmatic');

  // Test 3D Bone Dice real factory resolution
  const diceAsset = await manager.preloadAsset('model.dice.bone');
  assert.ok(diceAsset, 'Preloading model.dice.bone should return generated programmatic asset object');
  assert.ok(diceAsset.factoryInfo && typeof diceAsset.factoryInfo.create === 'function', 'Bone dice should expose create factory method');
  const diceInst = diceAsset.factoryInfo.create({ enableShadow: true });
  assert.equal(diceInst.kind, 'bone-dice', 'Created dice should match kind bone-dice');
  assert.equal(diceInst.faces, 6, 'Created dice should have 6 faces');
  assert.equal(diceInst.isThreeJSGroup, true, 'Created dice should flag isThreeJSGroup');
  assert.ok(diceInst.group instanceof THREE.Group, 'Created dice group should be instance of THREE.Group');
  assert.ok(diceInst.pickableMesh instanceof THREE.Mesh, 'Created dice pickableMesh should be instance of THREE.Mesh');
  assert.equal(diceInst.group.children.length, 22, 'Created dice group should have 22 children (1 cube mesh + 21 spherical pips)');
  assert.equal(diceInst.pickableMesh.userData.isDiceBowl, true, 'Pickable mesh userData should tag isDiceBowl');

  // Detailed Bone Dice Geometry & Structure Test
  const firstChild = diceInst.group.children[0];
  assert.ok(firstChild instanceof THREE.Mesh, 'First child of dice group must be THREE.Mesh');
  assert.ok(firstChild.geometry instanceof THREE.BoxGeometry, 'First child geometry must be THREE.BoxGeometry');
  assert.strictEqual(firstChild, diceInst.pickableMesh, 'First child of group must be pickableMesh');
  assert.ok(Array.isArray(firstChild.material), 'Cube mesh must have array of materials');
  assert.equal(firstChild.material.length, 6, 'Cube mesh must have 6 face materials');

  // Verify material face order metadata matches [2, 5, 1, 6, 3, 4]
  const faceValues = firstChild.material.map(m => m.userData.faceValue);
  assert.deepEqual(faceValues, [2, 5, 1, 6, 3, 4], 'Materials faceValue order must be [2, 5, 1, 6, 3, 4]');

  // Verify remaining 21 children are all THREE.Mesh with SphereGeometry
  for (let i = 1; i < diceInst.group.children.length; i++) {
    const pipMesh = diceInst.group.children[i];
    assert.ok(pipMesh instanceof THREE.Mesh, `Child #${i} must be THREE.Mesh`);
    assert.ok(pipMesh.geometry instanceof THREE.SphereGeometry, `Child #${i} geometry must be THREE.SphereGeometry`);
  }

  // Verify textures and color spaces on face materials
  for (const mat of firstChild.material) {
    assert.ok(mat.map instanceof THREE.CanvasTexture, 'Material map must be THREE.CanvasTexture');
    if (THREE.SRGBColorSpace) {
      assert.equal(mat.map.colorSpace, THREE.SRGBColorSpace, 'Texture colorSpace must be SRGBColorSpace');
    }
  }

  // Test Bone Dice Instance Independence
  const diceInst1 = diceAsset.factoryInfo.create({ enableShadow: true });
  const diceInst2 = diceAsset.factoryInfo.create({ enableShadow: false });

  assert.notStrictEqual(diceInst1.group, diceInst2.group, 'Two dice groups must be distinct object references');
  assert.notStrictEqual(diceInst1.pickableMesh, diceInst2.pickableMesh, 'Two pickableMeshes must be distinct object references');
  assert.notStrictEqual(diceInst1.pickableMesh.geometry, diceInst2.pickableMesh.geometry, 'Two cube geometries must be distinct object references');
  assert.notStrictEqual(diceInst1.pickableMesh.material, diceInst2.pickableMesh.material, 'Two material arrays must be distinct object references');
  for (let m = 0; m < 6; m++) {
    assert.notStrictEqual(diceInst1.pickableMesh.material[m], diceInst2.pickableMesh.material[m], `Face material #${m} must be distinct object reference`);
  }

  // Check all 21 pip objects across two dice instances (Phase 4)
  assert.equal(diceInst1.group.children.length, 22, 'Group must have 22 children (1 cube + 21 pips)');
  assert.equal(diceInst2.group.children.length, 22, 'Group must have 22 children (1 cube + 21 pips)');
  for (let p = 1; p < 22; p++) {
    const pip1 = diceInst1.group.children[p];
    const pip2 = diceInst2.group.children[p];
    assert.notStrictEqual(pip1, pip2, `Pip child #${p} mesh must be distinct object reference`);
    assert.notStrictEqual(pip1.geometry, pip2.geometry, `Pip child #${p} SphereGeometry must not be shared across dice instances`);
    assert.notStrictEqual(pip1.material, pip2.material, `Pip child #${p} Material must not be shared across dice instances`);
  }

  // Test shadow behavior (Phase 3)
  assert.strictEqual(diceInst1.pickableMesh.castShadow, true, 'enableShadow: true should set castShadow to true');
  assert.strictEqual(diceInst1.pickableMesh.receiveShadow, true, 'enableShadow: true should set receiveShadow to true');
  assert.strictEqual(diceInst2.pickableMesh.castShadow, false, 'enableShadow: false should set castShadow to false');
  assert.strictEqual(diceInst2.pickableMesh.receiveShadow, true, 'enableShadow: false should keep receiveShadow as true');

  // Test position / rotation mutation independence
  diceInst1.group.position.set(10, 20, 30);
  diceInst1.group.rotation.set(1, 2, 3);
  assert.notEqual(diceInst2.group.position.x, 10, 'Modifying position of die #1 must not affect die #2');
  assert.notEqual(diceInst2.group.rotation.x, 1, 'Modifying rotation of die #1 must not affect die #2');

  // Test explicit PROGRAMMATIC_ASSET_NOT_IMPLEMENTED error throwing & state isolation
  const unimplementedAssetIds = [
    'piece.kokeshi',
    'audio.sfx.dice-roll',
    'audio.sfx.wood-clack',
    'audio.bgm.tokaido',
    'audio.bgm.yokai',
    'audio.bgm.kesshu',
    'audio.bgm.genji',
  ];

  for (const assetId of unimplementedAssetIds) {
    await assert.rejects(
      async () => manager.preloadAsset(assetId),
      (err) => {
        assert.ok(
          err.message.includes('PROGRAMMATIC_ASSET_NOT_IMPLEMENTED'),
          `Error for ${assetId} should contain PROGRAMMATIC_ASSET_NOT_IMPLEMENTED, got: ${err.message}`
        );
        return true;
      },
      `Preloading ${assetId} should reject with PROGRAMMATIC_ASSET_NOT_IMPLEMENTED error`
    );

    // Verify failed asset is NOT stored in assetCache
    assert.ok(!manager.assetCache.has(assetId), `Failed asset ${assetId} must NOT be written to assetCache`);
    // Verify failed asset is NOT left in pendingLoads
    assert.ok(!manager.pendingLoads.has(assetId), `Failed asset ${assetId} must NOT be left in pendingLoads`);

    // Retry test: re-requesting after failure should cleanly throw again without hanging or stale state
    await assert.rejects(
      async () => manager.preloadAsset(assetId),
      (err) => err.message.includes('PROGRAMMATIC_ASSET_NOT_IMPLEMENTED'),
      `Re-requesting failed asset ${assetId} should cleanly throw PROGRAMMATIC_ASSET_NOT_IMPLEMENTED again`
    );
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

  assert.ok(manager.assetCache.has('model.dice.bone'), 'Programmatic asset model.dice.bone should be stored in assetCache');
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
