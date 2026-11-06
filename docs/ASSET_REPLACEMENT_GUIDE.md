# Esugoroku V2.1 Asset Replacement Guide

## Overview

This guide provides step-by-step instructions for adding, modifying, or replacing assets in the Esugoroku V2.1 Modular Asset System. All assets are managed through the unified `assets/manifest/asset-manifest.json` manifest, and accessed via the `AssetManager` API using stable Asset IDs.

The guide covers:

- Adding new assets to the manifest
- Modifying existing asset entries
- Replacing asset files on disk
- Running validation tools
- Updating documentation references

---

## 1. Asset ID Naming Conventions

All assets use **dot-notation hierarchical IDs** following the pattern:

```
<namespace>.<category>.<specific>
```

### Namespaces and Categories

| Namespace | Category | Example Asset IDs |
|-----------|----------|-------------------|
| `board` | Board backgrounds & master sheets | `board.tokaido.background`, `board.yokai.background` |
| `piece` | Chess pieces / character models | `piece.kokeshi`, `piece.player` |
| `card` | Card / print artwork | `print.tokaido.nihonbashi`, `charm.charm_stay` |
| `ui` | UI icons & interface graphics | `ui.icon.dice`, `ui.button.start` |
| `audio` | Sound effects & background music | `audio.sfx.dice-roll`, `audio.bgm.tokaido` |
| `model` | 3D models & geometries | `model.dice.bone`, `model.kokeshi` |
| `font` | Font resources | `font.shippori-mincho` |
| `effect` | Programmatic effects | - |

### Full Asset ID Example

```json
{
  "id": "board.tokaido.background",
  "type": "image",
  "path": "images/boards/tokaido/background.webp",
  "group": "board.tokaido",
  "platforms": ["web", "mobile", "embedded"],
  "metadata": {
    "description": "Tokaido sugoroku board background",
    "historicalStatus": "historical-adaptation",
    "license": "UNVERIFIED"
  }
}
```

---

## 2. Adding a New Asset

### Step 1: Place the Asset File

Place the asset file in the appropriate directory under `assets/`:

```
assets/
├── images/
│   └── boards/
│       └── tokaido/
│           └── background.webp     ← NEW: Place here
│       ├── yokai/
│       │   └── background.webp
│       ├── kesshu/
│       │   └── background.webp
│       └── genji/
│           └── background.webp
├── audio/
│   ├── bgm/
│   │   ├── tokaido/
│   │   │   └── shamisen-koto.mp3   ← NEW: Place here
│   │   ├── yokai/
│   │   │   └── hyoshigi.mp3
│   │   ├── kesshu/
│   │   │   └── koma-step.mp3
│   │   └── genji/
│   │       └── chamber-music.mp3
│   └── sfx/
│       ├── dice-roll.ogg
│       ├── wood-clack.ogg
│       └── ...
├── models/
│   ├── characters/
│   │   └── kokeshi/
│   │       └── model.glb          ← NEW: Place here
│   ├── props/
│   │   └── dice/
│   │       └── bone.glb           ← NEW: Place here
│   └── boards/
│       └── tokaido/
│           └── board.glb          ← NEW: Place here
├── prints/
│   ├── tokaido/
│   │   ├── nihonbashi.webp        ← NEW: Place here
│   │   ├── shinagawa.webp
│   │   └── ... (all 17 tokaido prints)
│   ├── yokai/
│   │   ├── kappa.webp
│   │   └── ... (all 10 yokai prints)
│   ├── kesshu/
│   │   ├── shootsujin.webp
│   │   └── ... (all 16 kesshu prints)
│   ├── genji/
│   │   ├── kiritsubo.webp
│   │   └── ... (all 23 genji prints)
│   └── charms/
│       ├── stay.webp
│       ├── guard.webp
│       └── dash.webp
├── fonts/
│   └── shipporiminchob1_*.woff2   ← (existing)
└── ui/
    └── icon.svg                    ← (existing)
```

### Step 2: Add Asset Entry to Manifest

Open `assets/manifest/asset-manifest.json` and add a new entry under the `"assets"` object:

```json
"board.tokaido.background": {
  "type": "image",
  "path": "images/boards/tokaido/background.webp",
  "group": "board.tokaido",
  "platforms": ["web", "mobile", "embedded"],
  "variants": [
    { "suffix": "-2k", "platform": "web" },
    { "suffix": "-1k", "platform": "mobile" }
  ],
  "metadata": {
    "description": "New Tokaido board background",
    "historicalStatus": "historical-adaptation",
    "license": "CC-BY-4.0",
    "attribution": "Artwork courtesy of source institution",
    "source": "Tokyo National Museum",
    "sourceUrl": "https://www.tnm.jp/collection/...",
    "catalogId": "TNM-Edo-001"
  }
}
```

### Step 3: Add Asset to Group (if applicable)

If the asset belongs to a logical group, add it to the `"groups"` section:

```json
"groups": {
  "board.tokaido": {
    "description": "Tokaido board assets",
    "assets": [
      "board.tokaido.background",
      "board.tokaido.node-art",
      "board.tokaido.piece",
      "board.tokaido.background"  ← Add new asset ID here
    ],
    "preload": true,
    "platforms": ["web", "mobile"]
  }
}
```

### Step 4: Update Import References in Code

Replace hardcoded asset references with `AssetManager.getUrl()` calls:

**Before (hardcoded path):**
```javascript
const img = document.createElement('img');
img.src = '/assets/images/boards/tokaido/background.webp';
```

**After (AssetManager):**
```javascript
import { AssetManager } from './assets/asset-manager.js';

// Get URL via Asset ID
const url = AssetManager.getUrl('board.tokaido.background');
const img = document.createElement('img');
img.src = url;
```

**For board background in nishikie_woodblock.js:**
```javascript
// Before
const masterSheetUrl = MASTER_SHEETS[boardId];

// After
import { AssetManager } from '../assets/asset-manager.js';
const masterSheetUrl = AssetManager.getUrl('board.' + boardId + '.background');
```

**For print cards in prints.js:**
```javascript
// Before
function getPrintURL(boardId, art) {
  return PRINT_ASSETS[boardId + '.' + art];
}

// After
import { AssetManager } from '../assets/asset-manager.js';
export function getPrintURL(boardId, art) {
  return AssetManager.getUrl(getAssetId(boardId, art));
}
```

### Step 5: Run Validation

Run the automated validation to verify the new asset:

```bash
npm run assets:validate
# or
node tools/validate_assets.mjs
```

To generate a full audit report:

```bash
npm run assets:report
# or
node tools/validate_assets.mjs --report
```

---

## 3. Modifying an Existing Asset

### Step 1: Update the Manifest Entry

Modify the existing asset entry in `asset-manifest.json` to change:
- `path` (if relocating the file)
- `type` (if changing resource type)
- `metadata` (description, license, attribution, etc.)
- `platforms` or `variants`

### Step 2: Relocate/Replace the Asset File

Move or replace the actual file in the `assets/` directory, maintaining the same relative path specified in the manifest. **Do not change the `path` value without updating all code references.**

### Step 3: Run Validation

```bash
npm run assets:validate
```

Verify that:
- The asset still exists on disk at the specified path
- Case sensitivity is correct (Linux/Unix systems)
- Group references are still valid

### Step 4: Update Code if Path Changed

If the `path` field changed, update all code that references the old path to use the new Asset ID:

```javascript
// Old way (if path was changed, may still work via fallback)
image.src = '/old/path/to/asset.webp';

// New way - always use AssetManager
const url = AssetManager.getUrl('asset.id.here');
image.src = url;
```

---

## 4. Replacing an Asset File

### Step 1: Replace the File

Replace the existing asset file with the new version. Maintain the exact same filename and path to avoid breaking references:

```
# Good: Replace background.webp with new_background.webp (same name)
# Good: Replace dice-roll.ogg with new-dice-roll.ogg (same name)
# Bad: Rename file from background.webp to new-background.webp (updates needed)
```

### Step 2: Update Manifest (if changing filename)

If the filename changes, you must:
1. Add a new entry in `asset-manifest.json` with the new `path`
2. Update all code references from the old Asset ID to the new one
3. **Optionally** remove the old Asset ID entry (or keep it with a `fallback` pointing to the new path)

### Step 3: Run Full Validation

```bash
npm run assets:validate
npm run assets:report
```

---

## 5. Removing an Asset

### Step 1: Remove from Manifest

Remove the asset entry from `assets/manifest/asset-manifest.json` `"assets"` object.

### Step 2: Remove from Groups

Remove the Asset ID from any `"groups"` array entries.

### Step 3: Delete the File

Delete the physical asset file from `assets/`.

### Step 4: Check for Code References

Search for any remaining code referencing the removed Asset ID and either:
- Remove the reference
- Replace with a fallback asset
- Add a new asset to replace its functionality

### Step 5: Run Validation

```bash
npm run assets:validate
```

---

## 6. Using AssetManager API

### Core Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `getUrl(id)` | `string` | Returns the resource URL for the given Asset ID. Returns fallback if not found. |
| `getAsset(id)` | `object \| null` | Returns the full asset manifest entry for the given ID. |
| `preloadAsset(id)` | `Promise<void>` | Preloads a single resource (Image, Audio, etc.). |
| `preloadGroup(groupPrefix)` | `Promise<void>` | Preloads all assets in a group (e.g., `preloadGroup("board.tokaido")`). |
| `playSound(id, options?)` | `Promise<void>` | Plays a sound effect or BGM track. |
| `disposeAsset(id)` | `void` | Releases memory references for a single asset. |
| `disposeGroup(groupPrefix)` | `void` | Releases all assets in a group. |
| `getAllAssets()` | `object[]` | Returns all registered assets as an array. |
| `validate()` | `{ valid: boolean, errors: string[] }` | Validates manifest format and path existence. |

### Examples

**Getting a board background URL:**
```javascript
import { AssetManager } from './assets/asset-manager.js';

const backgroundUrl = AssetManager.getUrl('board.tokaido.background');
console.log(backgroundUrl);
// Output: "/assets/images/boards/tokaido/background.webp" (or fallback)
```

**Preloading a group of prints:**
```javascript
AssetManager.preloadGroup('print.tokaido').then(() => {
  console.log('All Tokaido prints preloaded successfully');
});
```

**Playing a sound effect:**
```javascript
AssetManager.playSound('audio.sfx.dice-roll', { volume: 0.5 });
```

**Getting asset metadata:**
```javascript
const asset = AssetManager.getAsset('print.tokaido.nihonbashi');
if (asset) {
  console.log(asset.metadata.description);
  console.log(asset.metadata.historicalStatus);
}
```

---

## 7. Platform-Specific Considerations

### Web (Browser)

- Asset paths use forward slashes `/` and are relative to the server root
- `AssetManager.getUrl()` returns absolute paths starting with `/assets/`
- CORS handling is automatic via `BrowserAssetAdapter`
- All asset types (images, audio, models) are supported

### Mobile

- Same Asset ID system, but `AssetManager` selects appropriate variants
- If variants are defined (e.g., `-1k` suffix for mobile), the correct size is auto-selected
- Fallback to base path if no platform-specific variant exists

### Embedded (AAA Games)

- Esugoroku can be integrated as a module within larger games
- Use `EmbeddedGameAdapter` (future implementation) for custom loading
- Resource paths are relative to the embedded module's directory
- Version tracking via `version` field in manifest entries

---

## 8. Validation Tool Usage

### Command-Line Options

```bash
# Basic validation (checks manifest, file existence, case sensitivity)
npm run assets:validate
# or
node tools/validate_assets.mjs

# Generate full audit report
npm run assets:report
# or
node tools/validate_assets.mjs --report
```

### Expected Output

**Successful validation:**
```
----------------------------------------------------
Esugoroku V2.1 Asset Validation Suite
----------------------------------------------------
🔍 Total Registered Assets: 150
🔍 Total Asset Groups: 15
✅ Loaded manifest (schema version 1)
Status: 135 verified, 0 missing, 0 errors, 9 warnings.

✅ Asset validation PASSED.
📄 Asset audit report generated at: docs/ASSET_AUDIT_REPORT.md
```

**With warnings (expected for procedural assets):**
```
⚠️ Warnings:
  - Asset "audio.sfx.dice-roll": Specified path "data:" does not exist on disk.
  - Asset "audio.bgm.tokaido": Specified path "data:" does not exist on disk.
  - Asset "model.dice.bone": Specified path "data:" does not exist on disk.
```

**With errors (requires fix):**
```
❌ Errors:
  - Asset "board.tokaido.background": Path "images/boards/tokaido/background.jpg" has case sensitivity mismatch on disk.
  - Group "board.tokaido" references non-existent Asset ID "board.tokaido.nonexistent".
```

### Warning Categories

| Warning Type | Meaning | Action |
|--------------|---------|--------|
| Path does not exist on disk | Asset registered but file missing | Place file or remove from manifest |
| Case sensitivity mismatch | Filename case differs on Linux | Rename file to match manifest |
| Non-existent group reference | Group points to missing Asset ID | Fix group's `assets` array |
| Missing required field | Asset entry missing `type` or `path` | Add required fields |

### Expected Error-Free Results

After full migration, expect:
- **0 errors** for all physical assets
- **9 warnings** for procedural/synthetic assets (WebAudio, procedural 3D models)
- **150+ assets** verified as existing on disk

---

## 9. Updating Documentation

### ASSET_AUDIT_REPORT.md

The validation tool automatically generates `docs/ASSET_AUDIT_REPORT.md` when running with `--report` flag. This report includes:

- Summary metrics (total assets, verified count, errors, warnings)
- Breakdown by asset type
- Group compliance status
- Detailed asset listing

### README.md

Update `README.md` if:
- New asset categories are added
- Default port or server configuration changes
- Major architectural changes affect setup

Example README update for new asset type:
```markdown
- **新增资源类型**: `font.custom-font` - 自定义字体资产（`fonts/custom.woff2`）
```

### ARCHITECTURE.md

Update `ARCHITECTURE.md` if:
- New namespaces or Asset ID patterns are introduced
- AssetManager API methods are added/removed
- Platform adaptation boundaries change

Example ARCHITECTURE.md update:
```markdown
## 2.5 新增资源类型

现支持 `effect` 命名空间的资源，用于程序化特效与滤镜资源。资产遵循 `effect.<name>` 命名规范，详见 `docs/ASSET_SYSTEM_DESIGN.md` 第3节。
```

---

## 10. Troubleshooting

### Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `AssetManager.getUrl("board.tokaido.background")` returns fallback URL | Asset path incorrect or file missing | Verify `asset-manifest.json` `path` field matches actual file location |
| `404 Not Found` on `/assets/...` routes | Server not serving `/assets/` correctly | Check `server.js` static route configuration |
| `Cross-Origin Resource Blocked` in browser | CORS not configured for asset files | Ensure `server.js` sets proper CORS headers, or place assets in `mobile/assets/` |
| Validation reports "case sensitivity mismatch" | Filename case differs on Linux | Rename disk file to match manifest exactly (case-sensitive) |
| `Group "xxx" references non-existent Asset ID` | Asset ID in group array doesn't exist in `assets` | Remove or add the referenced Asset ID |
| `Failed to parse asset-manifest.json` | Invalid JSON format | Run `npm run assets:validate` to identify parsing errors |
| New asset not appearing in game | Asset not preloaded or referenced correctly | Call `AssetManager.preloadGroup("new-group")` or use `AssetManager.getUrl("new-id")` in code |

### Debug Mode

For detailed error logging, run validation with verbose output:

```bash
node tools/validate_assets.mjs 2>&1 | head -100
```

Or check the generated `docs/ASSET_AUDIT_REPORT.md` for comprehensive details.

---

## 11. Migration Checklist

### Phase 4 Migration (Completed)

- [x] `server.js` - Added `/assets/` static route from root directory
- [x] `assets/asset-manager.js` - Fixed import path, removed duplicate export
- [x] `assets/manifest/asset-registry.js` - Updated JSON import syntax
- [x] `package.json` - Added `"type": "module"`
- [x] `mobile/js/prints.js` - Updated to use `AssetManager.getUrl()`
- [x] `mobile/js/nishikie_woodblock.js` - Updated to use `AssetManager.getUrl()`
- [x] `mobile/js/audio.js` - Imported `AssetManager`

### Phase 5 Validation (Completed)

- [x] `tools/validate_assets.mjs` - Created with full validation suite
- [x] `package.json` - Added `"assets:validate"` and `"assets:report"` scripts
- [x] `npm run assets:validate` - Passed with 0 errors, 9 expected warnings
- [x] `npm run assets:report` - Generated `docs/ASSET_AUDIT_REPORT.md`

### Phase 6: Documentation (In Progress)

- [ ] `docs/ASSET_REPLACEMENT_GUIDE.md` - Created (this file)
- [ ] `docs/ARCHITECTURE.md` - Review/update if needed
- [ ] `README.md` - Review/update if needed

### Post-Migration Checklist

- [ ] Run `npm run assets:validate` - Should pass with 0 errors
- [ ] Run `npm run assets:report` - Should generate report successfully
- [ ] Run `make test` - All 92 C11 checks and 66 JS tests pass
- [ ] Run `node tools/test_js_rules.mjs` - 66 unit tests pass
- [ ] Manual test: Load game in browser, verify all assets render correctly
- [ ] Check console for any "Asset load failed" messages
- [ ] Verify AssetManager can resolve all 150+ Asset IDs

---

## 12. Version History

| Version | Date | Changes |
|---------|------|---------|
| `1.0` | 2024-01-01 | Initial guide creation |
| `1.1` | 2024-06-15 | Added platform-specific variant selection section |
| `1.2` | 2025-01-10 | Updated validation tool output format |
| `1.3` | 2025-06-20 | Added embedded game adapter section |
| `1.4` | 2026-01-15 | Complete rewrite for V2.1 Modular Asset System |
| `1.5` | 2026-11-06 | Added Phase 6 documentation & troubleshooting |

---

## 13. Need Help?

If you encounter issues not covered in this guide:

1. Run `npm run assets:validate` to identify the problem
2. Check `docs/ASSET_AUDIT_REPORT.md` for detailed error information
3. Review the existing asset entries in `assets/manifest/asset-manifest.json` for correct patterns
4. Consult `docs/ASSET_SYSTEM_DESIGN.md` for architectural details
5. Open an issue in the project repository with:
   - The Asset ID you're trying to use
   - The error message you're seeing
   - Steps to reproduce
   - Your environment (OS, Node.js version, etc.)

---

*This guide is part of the Esugoroku V2.1 Modular Asset System. For the latest updates, refer to the project repository and associated documentation files.*