// Esugoroku V2.1 Modular Asset System
// Automated Asset Validation & Audit Tool

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const MANIFEST_PATH = path.resolve(ROOT_DIR, 'assets/manifest/asset-manifest.json');
const SCHEMA_PATH = path.resolve(ROOT_DIR, 'assets/manifest/asset-schema.json');

const isReportMode = process.argv.includes('--report');

console.log('----------------------------------------------------');
console.log('Esugoroku V2.1 Asset Validation Suite');
console.log('----------------------------------------------------');

function runValidation() {
  const errors = [];
  const warnings = [];

  // 1. Check file existence of manifest & schema
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`❌ ERROR: Asset manifest file not found at ${MANIFEST_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(SCHEMA_PATH)) {
    warnings.push(`Schema file not found at ${SCHEMA_PATH}. Skipping schema comparison.`);
  }

  // 2. Read and parse manifest
  let manifest;
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    manifest = JSON.parse(raw);
    console.log(`✅ Loaded manifest (schema version ${manifest.schemaVersion || 'N/A'})`);
  } catch (err) {
    console.error(`❌ ERROR: Failed to parse asset-manifest.json: ${err.message}`);
    process.exit(1);
  }

  const assets = manifest.assets || {};
  const groups = manifest.groups || {};
  const assetKeys = Object.keys(assets);

  console.log(`🔍 Total Registered Assets: ${assetKeys.length}`);
  console.log(`🔍 Total Asset Groups: ${Object.keys(groups).length}`);

  // 3. Validate entries and physical file existence
  let existCount = 0;
  let missingCount = 0;

  for (const [id, def] of Object.entries(assets)) {
    if (!def.type) {
      errors.push(`Asset "${id}" is missing required field "type".`);
    }
    if (!def.path) {
      errors.push(`Asset "${id}" is missing required field "path".`);
      continue;
    }

    // Resolve path relative to ROOT_DIR or mobile/ or assets/
    let targetPath = path.resolve(ROOT_DIR, def.path);
    let found = fs.existsSync(targetPath);

    if (!found) {
      // Try resolving relative to assets/ directory
      targetPath = path.resolve(ROOT_DIR, 'assets', def.path);
      found = fs.existsSync(targetPath);
    }

    if (!found) {
      // Try resolving relative to mobile/ directory
      targetPath = path.resolve(ROOT_DIR, 'mobile', def.path);
      found = fs.existsSync(targetPath);
    }

    if (found) {
      existCount++;

      // Case Sensitivity Check on Unix/Linux
      const dir = path.dirname(targetPath);
      const filename = path.basename(targetPath);
      try {
        const filesInDir = fs.readdirSync(dir);
        if (!filesInDir.includes(filename)) {
          errors.push(`Asset "${id}": Path "${def.path}" has case sensitivity mismatch on disk.`);
        }
      } catch {
        // Ignore read errors
      }
    } else {
      missingCount++;
      // Check if it's dynamic/synthetic asset
      if (def.path.startsWith('data:')) {
        existCount++;
        missingCount--;
      } else {
        warnings.push(`Asset "${id}": Specified path "${def.path}" does not exist on disk.`);
      }
    }
  }

  // 4. Validate groups reference valid Asset IDs
  for (const [groupName, groupDef] of Object.entries(groups)) {
    if (Array.isArray(groupDef.assets)) {
      for (const assetId of groupDef.assets) {
        if (!assets[assetId]) {
          errors.push(`Group "${groupName}" references non-existent Asset ID "${assetId}".`);
        }
      }
    }
  }

  // Summary output
  console.log('----------------------------------------------------');
  console.log(`Status: ${existCount} verified, ${missingCount} missing, ${errors.length} errors, ${warnings.length} warnings.`);
  
  if (warnings.length > 0) {
    console.log('\n⚠️ Warnings:');
    warnings.forEach(w => console.log(`  - ${w}`));
  }

  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(e => console.log(`  - ${e}`));
    console.log('\n❌ Asset validation FAILED.');
    if (!isReportMode) process.exit(1);
  } else {
    console.log('\n✅ Asset validation PASSED.');
  }

  // Generate audit report if requested
  if (isReportMode) {
    const reportMarkdown = `# Esugoroku V2.1 Asset Audit Report

Generated on: ${new Date().toISOString()}

## Summary Metrics
- **Total Registered Assets**: ${assetKeys.length}
- **Total Asset Groups**: ${Object.keys(groups).length}
- **Verified Physical Assets**: ${existCount}
- **Missing Asset References**: ${missingCount}
- **Validation Errors**: ${errors.length}
- **Validation Warnings**: ${warnings.length}

## Asset Breakdown by Type
${getBreakdownByType(assets)}

## Asset Groups
${Object.entries(groups).map(([name, g]) => `- **${name}**: ${g.assets ? g.assets.length : 0} assets`).join('\n')}

## Compliance Status
${errors.length === 0 ? '✅ All registered assets conform to V2.1 Modular Asset System specifications.' : '❌ Validation errors detected.'}
`;

    const reportPath = path.resolve(ROOT_DIR, 'docs/ASSET_AUDIT_REPORT.md');
    fs.writeFileSync(reportPath, reportMarkdown, 'utf8');
    console.log(`\n📄 Asset audit report generated at: docs/ASSET_AUDIT_REPORT.md`);
  }
}

function getBreakdownByType(assets) {
  const counts = {};
  for (const asset of Object.values(assets)) {
    const type = asset.type || 'unknown';
    counts[type] = (counts[type] || 0) + 1;
  }
  return Object.entries(counts).map(([type, count]) => `- **${type}**: ${count}`).join('\n');
}

runValidation();
