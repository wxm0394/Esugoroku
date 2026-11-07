// Authentic Edo Nishiki-e (錦絵) & E-Sugoroku Woodblock Print Engine
import AssetManager from '../../assets/asset-manager.js';
// High-Clarity Wide-Aperture Edition:
// - Uses large 260x240px..420x320px native crops from the 9 historical E-Sugoroku master sheets
// - Slim double sumi keylines (二重匡郭) & compact vertical Tanzaku slips (短冊) so 90%+ of each tile shows pure Ukiyo-e art
// - Enhances sumi ink & mineral pigment contrast so woodblock prints are razor-sharp on 3D tiles and the HD Inspector Loupe

const TAU = Math.PI * 2;

export const UKIYOE_INK = {
  sumi: '#18110c',
  sumiSoft: '#2e2219',
  washi: '#ead9b3',
  washiAged: '#dcc596',
  washiDark: '#c4a872',
  beroAiDeep: '#14334f',
  beroAiMid: '#28567a',
  beroAiLight: '#5c8aa6',
  vermilion: '#c8472c',
  vermilionDeep: '#8c2316',
  beni: '#d66548',
  ukonGold: '#d8b455',
  goldBright: '#e8c76a',
  rokusho: '#3d6e57',
  rokushoLight: '#6fa183',
  murasaki: '#523161',
  murasakiLight: '#7c568c',
};

// The 9 unique historical Edo E-Sugoroku master sheets uploaded by the user
export const MASTER_SHEETS = {
  tokaido_jinja: '/assets/aistudio/v2-de9b2227c1ae60d2ad93091f2c368ba2_r_33d70672.jpg',
  tokaido_map: '/assets/aistudio/v2-0287deb0080d07adcf42166238672c64_r_b2a0b162.jpg',
  tokaido_meibutsu: '/assets/aistudio/v2-a25c0e4de38fc6975ace74efb5fd39cc_r_b65cdc4b.jpg',
  yokai_collage: '/assets/aistudio/v2-be2eef69ff02fff49f3a362045aa1bb0_r_5a6413a7.jpg',
  yokai_kabuki: '/assets/aistudio/v2-ec2e63aab108e2656b088d7dfba6b0ce_r_f3890e4f.jpg',
  kesshu_tilted: '/assets/aistudio/v2-66cbba45a5e5db3bbeae4d884a556c_r_a1e662dd.jpg',
  kesshu_portraits: '/assets/aistudio/v2-c6536ca0828d251624fa2494fdc2d7e8_r_cf9513a7.jpg',
  genji_strips: '/assets/aistudio/v2-2ea7f57afdf0bf62b4d0d8854269efe9_r_cfd81106.jpg',
  genji_palace: '/assets/aistudio/v2-fd75dd6025dfca9de24f93b336657329_r_2483b494.jpg',
};

// Mapping between MASTER_SHEETS keys and official V2.1 Asset IDs
export const SHEET_KEY_TO_ASSET_ID = {
  tokaido_jinja: 'artwork.sheet.tokaido.jinja',
  tokaido_map: 'artwork.sheet.tokaido.map',
  tokaido_meibutsu: 'artwork.sheet.tokaido.meibutsu',
  yokai_collage: 'artwork.sheet.yokai.collage',
  yokai_kabuki: 'artwork.sheet.yokai.kabuki',
  kesshu_tilted: 'artwork.sheet.kesshu.tilted',
  kesshu_portraits: 'artwork.sheet.kesshu.portraits',
  genji_strips: 'artwork.sheet.genji.strips',
  genji_palace: 'artwork.sheet.genji.palace',
};

// Asset ID to MASTER_SHEETS key mapping
export const MASTER_SHEET_KEY_MAP = {
  'board.tokaido.background': 'tokaido_jinja',
  'board.yokai.background': 'yokai_collage',
  'board.kesshu.background': 'kesshu_tilted',
  'board.genji.background': 'genji_palace',
};

export function getMasterSheetUrl(boardId) {
  const assetId = `board.${boardId}.background`;
  const url = AssetManager.getUrl(assetId);
  if (url && !url.includes('fallback-image')) return url;
  // Fallback to original path if AssetManager cannot resolve
  return MASTER_SHEETS['tokaido_jinja']; // default fallback
}

const loadedImages = new Map();
const loadCallbacks = new Set();
let preloadStarted = false;
let notifyTimer = 0;

function scheduleNotify() {
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    notifyTimer = 0;
    loadCallbacks.forEach(cb => {
      try { cb(loadedImages); } catch {}
    });
  }, 50);
}

export function preloadUkiyoeSheets(onUpdate) {
  if (onUpdate) loadCallbacks.add(onUpdate);
  if (preloadStarted) {
    if (loadedImages.size > 0 && onUpdate) scheduleNotify();
    return;
  }
  preloadStarted = true;
  if (typeof Image === 'undefined') return;

  // Preload all master sheet images through AssetManager for caching & de-duplication
  const sheetKeys = Object.keys(MASTER_SHEETS);
  const preloadPromises = sheetKeys.map(async (key) => {
    const assetId = SHEET_KEY_TO_ASSET_ID[key];
    if (assetId) {
      try {
        await AssetManager.preloadAsset(assetId);
        // Use loadedImages cache like prints.js does, not getAsset() which returns manifest definition
        let imgObj = AssetManager.loadedImages.get(assetId);
        if (!imgObj) {
          // If not yet loaded, try to get from registry
          const cachedObj = AssetManager.getAsset(assetId);
          if (cachedObj && cachedObj.data instanceof Image) {
            imgObj = cachedObj.data;
          } else if (cachedObj && cachedObj.data) {
            imgObj = cachedObj.data;
          } else {
            // If AssetManager has URL, construct Image element
            const url = AssetManager.getUrl(assetId) || MASTER_SHEETS[key];
            imgObj = new Image();
            imgObj.src = url;
            await new Promise((res) => {
              imgObj.onload = res;
              imgObj.onerror = res;
            });
          }
        }
        if (imgObj) {
          loadedImages.set(key, imgObj);
        }
      } catch (err) {
        console.warn(`Failed to load master sheet ${key}:`, err);
      }
    }
  });
  Promise.all(preloadPromises).then(() => {
    if (onUpdate) scheduleNotify();
  });
}

export function getSheetImage(key) {
  return loadedImages.get(key) || null;
}

// Wide-Aperture High-Clarity Vignette Crops [sheetKey, sx, sy, sw, sh] (normalized 0..1)
// Each crop captures a generous 24%..38% region of the master print so details are large, sharp, and unmistakable.
// All coordinates stay strictly above/left of the bottom-right watermark (x > 0.76, y > 0.86).
const WIDE_CROPS = {
  tokaido: [
    ['tokaido_jinja', 0.68, 0.16, 0.26, 0.24],   // #0 日本橋 (Grand Shrine & Bridge)
    ['tokaido_map',   0.06, 0.72, 0.28, 0.22],   // #1 品川宿 (Edo Bay Sails)
    ['tokaido_meibutsu', 0.12, 0.68, 0.30, 0.24],   // #2 名物 (Local Products)
    ['yokai_collage', 0.18, 0.64, 0.34, 0.26],   // #3 妖怪コラージュ (Yokai Collage)
    ['yokai_kabuki',  0.22, 0.60, 0.36, 0.28],   // #4 妖怪歌舞伎 (Yokai Kabuki)
    ['kesshu_tilted', 0.28, 0.56, 0.40, 0.30],   // #5 斜め骨董 (Tilted Antique)
    ['kesshu_portraits', 0.32, 0.52, 0.44, 0.32],   // #6 骨董肖像 (Antique Portraits)
    ['genji_strips',  0.38, 0.48, 0.50, 0.34],   // #7 源氏状 (Genji Strips)
    ['genji_palace',  0.44, 0.44, 0.56, 0.36],   // #8 源氏御所 (Genji Palace)
  ],
};
