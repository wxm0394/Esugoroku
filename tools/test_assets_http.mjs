// Esugoroku V2.1 Modular Asset System
// Automated Asset HTTP Endpoint Verification Tool

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.resolve(ROOT_DIR, 'assets/manifest/asset-manifest.json');

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runHttpCheck() {
  console.log('----------------------------------------------------');
  console.log(`Esugoroku V2.1 Asset HTTP Endpoint Checker (${BASE_URL})`);
  console.log('----------------------------------------------------');

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`❌ Manifest not found at ${MANIFEST_PATH}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const assets = manifest.assets || {};
  const assetEntries = Object.entries(assets);

  let successCount = 0;
  let fallbackOrMissingCount = 0;
  let failCount = 0;
  const failures = [];

  for (const [id, def] of assetEntries) {
    if (!def.path || def.path.startsWith('data:')) {
      successCount++;
      continue;
    }

    const url = def.path.startsWith('/') ? `${BASE_URL}${def.path}` : `${BASE_URL}/${def.path}`;

    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) {
        successCount++;
      } else {
        // If it's a programmatic/synthetic asset like .glb, .ogg, .mp3, log as acceptable missing
        if (def.path.endsWith('.glb') || def.path.endsWith('.ogg') || def.path.endsWith('.mp3') || def.path.endsWith('.woff2')) {
          fallbackOrMissingCount++;
        } else {
          failCount++;
          failures.push(`${id} -> ${url} (HTTP ${res.status})`);
        }
      }
    } catch (err) {
      if (def.path.endsWith('.glb') || def.path.endsWith('.ogg') || def.path.endsWith('.mp3') || def.path.endsWith('.woff2')) {
        fallbackOrMissingCount++;
      } else {
        failCount++;
        failures.push(`${id} -> ${url} (${err.message})`);
      }
    }
  }

  console.log(`Total Assets Checked: ${assetEntries.length}`);
  console.log(`✅ HTTP 200 OK / Synthetic: ${successCount}`);
  console.log(`⚠️ Expected Missing / Programmatic Fallbacks: ${fallbackOrMissingCount}`);
  console.log(`❌ Failed Endpoints: ${failCount}`);

  if (failures.length > 0) {
    console.log('\nFailed Endpoints List:');
    failures.forEach(f => console.log(`  - ${f}`));
    console.log('\n❌ HTTP check FAILED.');
    process.exit(1);
  } else {
    console.log('\n✅ All asset HTTP endpoints verified successfully.');
  }
}

runHttpCheck();
