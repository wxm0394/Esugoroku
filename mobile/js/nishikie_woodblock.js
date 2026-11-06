// Authentic Edo Nishiki-e (錦絵) & E-Sugoroku Woodblock Print Engine
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
  kesshu_tilted: '/assets/aistudio/v2-66c8cbba45a5e5db3bbeae4d884a556c_r_a1e662dd.jpg',
  kesshu_portraits: '/assets/aistudio/v2-c6536ca0828d251624fa2494fdc2d7e8_r_cf951d0e.jpg',
  genji_strips: '/assets/aistudio/v2-2ea7f57afdf0bf62b4d0d8854269efe9_r_cfd81106.jpg',
  genji_palace: '/assets/aistudio/v2-fd75dd6025dfca9de24f93b336657329_r_2483b494.jpg',
};

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

  for (const [key, url] of Object.entries(MASTER_SHEETS)) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      loadedImages.set(key, img);
      scheduleNotify();
    };
    img.src = url;
  }
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
    ['tokaido_meibutsu', 0.30, 0.36, 0.40, 0.28],// #2 泥鰌鍋 (Festive Edo Meibutsu Banner)
    ['tokaido_jinja', 0.44, 0.16, 0.26, 0.24],   // #3 川崎宿
    ['tokaido_jinja', 0.38, 0.64, 0.24, 0.22],   // #4 鶴見泊 (Mt. Fuji & Red Tomari Seal)
    ['tokaido_jinja', 0.54, 0.64, 0.24, 0.22],   // #5 神奈川宿 (Fuji across the Bay)
    ['tokaido_map',   0.32, 0.38, 0.34, 0.26],   // #6 程ヶ谷宿 (Central Lake & Mountain Panorama)
    ['tokaido_meibutsu', 0.05, 0.06, 0.28, 0.26],// #7 稲荷寿司
    ['tokaido_jinja', 0.14, 0.16, 0.26, 0.24],   // #8 戸塚宿
    ['tokaido_jinja', 0.14, 0.66, 0.26, 0.24],   // #9 藤沢泊
    ['tokaido_map',   0.64, 0.10, 0.28, 0.26],   // #10 平塚宿
    ['tokaido_jinja', 0.26, 0.30, 0.26, 0.22],   // #11 大磯宿
    ['tokaido_meibutsu', 0.64, 0.06, 0.28, 0.26],// #12 宇治茶
    ['tokaido_jinja', 0.50, 0.30, 0.26, 0.22],   // #13 小田原宿
    ['tokaido_map',   0.06, 0.10, 0.28, 0.26],   // #14 箱根関所
    ['tokaido_jinja', 0.14, 0.42, 0.22, 0.24],   // #15 三島宿
    ['tokaido_meibutsu', 0.06, 0.38, 0.24, 0.26],// #16 駿河丸子宿
    ['tokaido_map',   0.34, 0.10, 0.30, 0.24],   // #17 大井川川止
    ['tokaido_jinja', 0.72, 0.32, 0.22, 0.26],   // #18 浜松宿
    ['tokaido_map',   0.64, 0.40, 0.28, 0.26],   // #19 新居関所
    ['tokaido_jinja', 0.28, 0.74, 0.26, 0.20],   // #20 宮の渡し
    ['tokaido_meibutsu', 0.68, 0.38, 0.24, 0.26],// #21 桑名宿
    ['tokaido_map',   0.06, 0.42, 0.26, 0.26],   // #22 鈴鹿峠悪風
    ['tokaido_jinja', 0.52, 0.74, 0.24, 0.20],   // #23 大津宿
    ['tokaido_jinja', 0.35, 0.45, 0.40, 0.22],   // #24 京都・八百善大上り (Grand Goal Panel)
  ],
  yokai: [
    ['yokai_collage', 0.04, 0.58, 0.28, 0.28],   // #0 河童
    ['yokai_kabuki',  0.04, 0.40, 0.24, 0.26],   // #1 雪女郎
    ['yokai_collage', 0.22, 0.72, 0.28, 0.24],   // #2 猫俣
    ['yokai_collage', 0.04, 0.22, 0.26, 0.24],   // #3 文福茶釜
    ['yokai_kabuki',  0.42, 0.40, 0.24, 0.26],   // #4 三目大僧
    ['yokai_collage', 0.14, 0.58, 0.30, 0.22],   // #5 船幽霊
    ['yokai_collage', 0.68, 0.22, 0.26, 0.24],   // #6 挑灯お岩
    ['yokai_collage', 0.18, 0.22, 0.22, 0.34],   // #7 ろくろ首
    ['yokai_collage', 0.68, 0.05, 0.26, 0.22],   // #8 九尾狐
    ['yokai_kabuki',  0.22, 0.20, 0.24, 0.26],   // #9 手の目
    ['yokai_collage', 0.66, 0.40, 0.28, 0.22],   // #10 一反木綿
    ['yokai_kabuki',  0.34, 0.04, 0.30, 0.22],   // #11 朱の盤
    ['yokai_kabuki',  0.66, 0.20, 0.26, 0.26],   // #12 大天狗
    ['yokai_collage', 0.48, 0.66, 0.28, 0.24],   // #13 見越入道
    ['yokai_kabuki',  0.04, 0.60, 0.24, 0.26],   // #14 濡女
    ['yokai_collage', 0.04, 0.40, 0.24, 0.22],   // #15 鉄鼠
    ['yokai_kabuki',  0.26, 0.60, 0.24, 0.26],   // #16 皿屋敷お菊
    ['yokai_kabuki',  0.50, 0.60, 0.24, 0.26],   // #17 がしゃどくろ
    ['yokai_collage', 0.34, 0.42, 0.32, 0.22],   // #18 ぬらりひょん
    ['yokai_kabuki',  0.68, 0.40, 0.24, 0.26],   // #19 絡新婦
    ['yokai_collage', 0.04, 0.06, 0.28, 0.22],   // #20 天邪鬼
    ['yokai_kabuki',  0.04, 0.04, 0.28, 0.24],   // #21 百目鬼
    ['yokai_kabuki',  0.68, 0.04, 0.26, 0.24],   // #22 陰摩羅鬼
    ['yokai_kabuki',  0.44, 0.22, 0.24, 0.24],   // #23 逢魔が時
    ['yokai_collage', 0.34, 0.04, 0.33, 0.38],   // #24 百物語大団円・上り
  ],
  kesshu: [
    ['kesshu_tilted',    0.62, 0.62, 0.28, 0.24], // #0 出陣
    ['kesshu_portraits', 0.04, 0.08, 0.28, 0.26], // #1 槍隊
    ['kesshu_portraits', 0.04, 0.30, 0.28, 0.26], // #2 弓隊
    ['kesshu_portraits', 0.34, 0.30, 0.30, 0.26], // #3 兜
    ['kesshu_portraits', 0.66, 0.08, 0.28, 0.26], // #4 軍議
    ['kesshu_portraits', 0.04, 0.52, 0.28, 0.26], // #5 大鎧
    ['kesshu_portraits', 0.66, 0.30, 0.28, 0.26], // #6 一騎討
    ['kesshu_portraits', 0.34, 0.52, 0.30, 0.26], // #7 太刀
    ['kesshu_tilted',    0.36, 0.06, 0.28, 0.28], // #8 伏兵奇襲
    ['kesshu_portraits', 0.66, 0.52, 0.28, 0.26], // #9 義士盟約
    ['kesshu_portraits', 0.04, 0.70, 0.28, 0.24], // #10 陣太鼓
    ['kesshu_tilted',    0.64, 0.06, 0.26, 0.28], // #11 兵糧攻め
    ['kesshu_tilted',    0.06, 0.34, 0.28, 0.28], // #12 早馬伝令
    ['kesshu_tilted',    0.34, 0.34, 0.28, 0.28], // #13 敵陣鉄砲
    ['kesshu_tilted',    0.62, 0.34, 0.28, 0.28], // #14 忍び間者
    ['kesshu_tilted',    0.06, 0.62, 0.28, 0.28], // #15 予備兜陣
    ['kesshu_tilted',    0.34, 0.62, 0.28, 0.28], // #16 予備太刀陣
    ['kesshu_portraits', 0.34, 0.72, 0.30, 0.22], // #17 城門突破
    ['kesshu_portraits', 0.18, 0.08, 0.26, 0.26], // #18 予備太鼓陣
    ['kesshu_portraits', 0.48, 0.30, 0.26, 0.26], // #19 本陣守備隊
    ['kesshu_portraits', 0.18, 0.52, 0.26, 0.26], // #20 決死突撃
    ['kesshu_portraits', 0.48, 0.52, 0.26, 0.26], // #21 御前関門
    ['kesshu_portraits', 0.34, 0.06, 0.32, 0.24], // #22 上り前
    ['kesshu_tilted',    0.05, 0.05, 0.32, 0.29], // #23 上り (Grand Shogun Audience Goal)
  ],
  genji: [
    ['genji_palace', 0.06, 0.06, 0.24, 0.26], // #0 桐壺
    ['genji_palace', 0.70, 0.06, 0.24, 0.26], // #1 帚木
    ['genji_palace', 0.06, 0.30, 0.24, 0.26], // #2 空蝉
    ['genji_palace', 0.28, 0.30, 0.24, 0.26], // #3 夕顔
    ['genji_palace', 0.50, 0.30, 0.24, 0.26], // #4 若紫
    ['genji_palace', 0.70, 0.30, 0.24, 0.26], // #5 末摘花
    ['genji_palace', 0.06, 0.52, 0.24, 0.26], // #6 紅葉賀
    ['genji_palace', 0.28, 0.52, 0.24, 0.26], // #7 花宴
    ['genji_palace', 0.50, 0.52, 0.24, 0.26], // #8 葵
    ['genji_palace', 0.70, 0.52, 0.24, 0.26], // #9 賢木
    ['genji_palace', 0.06, 0.68, 0.24, 0.24], // #10 花散里
    ['genji_palace', 0.28, 0.68, 0.24, 0.24], // #11 須磨
    ['genji_palace', 0.50, 0.68, 0.24, 0.24], // #12 明石
    ['genji_strips', 0.24, 0.08, 0.28, 0.26], // #13 澪標
    ['genji_strips', 0.52, 0.08, 0.28, 0.26], // #14 蓬生
    ['genji_strips', 0.04, 0.34, 0.24, 0.32], // #15 関屋 (Branch)
    // Good Path (#16..#20)
    ['genji_palace', 0.28, 0.06, 0.42, 0.24], // #16 絵合
    ['genji_strips', 0.24, 0.68, 0.28, 0.24], // #17 松風
    ['genji_strips', 0.50, 0.68, 0.26, 0.24], // #18 薄雲
    ['genji_palace', 0.16, 0.30, 0.28, 0.24], // #19 初音
    ['genji_palace', 0.54, 0.30, 0.28, 0.24], // #20 胡蝶
    // Evil Path (#21..#25)
    ['genji_strips', 0.72, 0.34, 0.22, 0.32], // #21 朝顔
    ['genji_palace', 0.16, 0.54, 0.28, 0.24], // #22 少女
    ['genji_palace', 0.54, 0.54, 0.28, 0.24], // #23 玉鬘
    ['genji_strips', 0.04, 0.68, 0.24, 0.24], // #24 常夏
    ['genji_strips', 0.04, 0.08, 0.24, 0.26], // #25 野分
    // Goal (#26)
    ['genji_strips', 0.22, 0.33, 0.48, 0.34], // #26 源氏絵合・上り
  ],
};

function makeRng(seedStr) {
  let h = 2166136261 >>> 0;
  const str = String(seedStr || 'edo');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let s = h || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// Aged Echizen Washi Paper + Woodblock Baren Grain
export function paintWashiGround(ctx, w, h, baseColor = UKIYOE_INK.washi, seed = 'washi') {
  const rand = makeRng(seed);
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, w, h);

  const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.18, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(255,248,230,0.12)');
  vg.addColorStop(1, 'rgba(124,88,42,0.22)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.strokeStyle = 'rgba(68,46,24,0.05)';
  ctx.lineWidth = 1;
  for (let y = 4; y < h; y += 6) {
    ctx.beginPath();
    ctx.moveTo(0, y + (rand() - 0.5) * 2);
    ctx.lineTo(w, y + (rand() - 0.5) * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// Traditional Distressed Vermilion Hanko Seal (e.g., 改印, 上り, 振出, 泊, 飛)
export function drawAuthenticSeal(ctx, cx, cy, r, text, bgColor = UKIYOE_INK.vermilion, isSquare = false) {
  ctx.save();
  ctx.fillStyle = bgColor;
  ctx.strokeStyle = '#f7ebd2';
  ctx.lineWidth = Math.max(2, r * 0.11);
  if (isSquare) {
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.strokeRect(cx - r + 2, cy - r + 2, r * 2 - 4, r * 2 - 4);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = UKIYOE_INK.sumi;
    ctx.lineWidth = Math.max(1.5, r * 0.06);
    ctx.beginPath();
    ctx.arc(cx, cy, r + 1.5, 0, TAU);
    ctx.stroke();
  }

  ctx.fillStyle = '#fff9ec';
  const fontSize = text.length > 1 ? r * 0.84 : r * 1.12;
  ctx.font = `800 ${Math.round(fontSize)}px "Shippori Mincho B1", "Noto Serif SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (text.length === 2) {
    ctx.fillText(text[0], cx, cy - r * 0.36);
    ctx.fillText(text[1], cx, cy + r * 0.38);
  } else {
    ctx.fillText(text, cx, cy + 1);
  }
  ctx.restore();
}

function getCropForNode(boardId, node) {
  const list = WIDE_CROPS[boardId] || WIDE_CROPS.tokaido;
  const id = node?.id ?? 0;
  if (node?.kind === 'goal') return list[list.length - 1];
  return list[id % list.length];
}

// High-detail procedural woodblock fallback while image sheets are decoding
function renderProceduralWoodcutFallback(ctx, boardId, node, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  if (boardId === 'yokai') {
    g.addColorStop(0, '#182c3d');
    g.addColorStop(0.55, '#3b5d73');
    g.addColorStop(1, '#d8c396');
  } else if (boardId === 'kesshu') {
    g.addColorStop(0, '#6e281d');
    g.addColorStop(0.5, '#b85c38');
    g.addColorStop(1, '#e6d2a4');
  } else if (boardId === 'genji') {
    g.addColorStop(0, '#a68232');
    g.addColorStop(0.5, '#dfc173');
    g.addColorStop(1, '#efe0be');
  } else {
    g.addColorStop(0, '#1b4466');
    g.addColorStop(0.48, '#6a96b0');
    g.addColorStop(1, '#e8d7b0');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#244761';
  ctx.strokeStyle = UKIYOE_INK.sumi;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.08, h * 0.76);
  ctx.quadraticCurveTo(w * 0.34, h * 0.42, w * 0.44, h * 0.24);
  ctx.lineTo(w * 0.56, h * 0.24);
  ctx.quadraticCurveTo(w * 0.66, h * 0.42, w * 0.92, h * 0.76);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#faf3e3';
  ctx.beginPath();
  ctx.moveTo(w * 0.44, h * 0.24);
  ctx.lineTo(w * 0.56, h * 0.24);
  ctx.lineTo(w * 0.62, h * 0.38);
  ctx.lineTo(w * 0.53, h * 0.33);
  ctx.lineTo(w * 0.48, h * 0.39);
  ctx.lineTo(w * 0.39, h * 0.37);
  ctx.closePath();
  ctx.fill();
}

// Master Scene Renderer: draws the wide-aperture historical E-Sugoroku woodblock print crop with crisp contrast
export function renderNishikieScene(ctx, boardId, node, w, h) {
  paintWashiGround(ctx, w, h, UKIYOE_INK.washi, `${boardId}-${node?.id ?? 0}`);

  const [sheetKey, sx, sy, sw, sh] = getCropForNode(boardId, node);
  const img = getSheetImage(sheetKey);

  if (img && img.complete && img.naturalWidth > 0) {
    const cropX = Math.floor(sx * img.naturalWidth);
    const cropY = Math.floor(sy * img.naturalHeight);
    const cropW = Math.max(64, Math.floor(sw * img.naturalWidth));
    const cropH = Math.max(64, Math.floor(sh * img.naturalHeight));

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if ('filter' in ctx) {
      ctx.filter = 'contrast(1.10) saturate(1.12)';
    }
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, w, h);
    if ('filter' in ctx) {
      ctx.filter = 'none';
    }
    ctx.restore();
  } else {
    renderProceduralWoodcutFallback(ctx, boardId, node, w, h);
  }
}

// Creates the Full-Board Antique Woodblock Broadsheet Texture for the 3D Board Surface Plate
export function createBoardBroadsheetCanvas(board) {
  const w = 896;
  const h = 716;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  paintWashiGround(ctx, w, h, '#e5d3ab', `broadsheet-${board.id}`);

  const boardSheetMap = {
    tokaido: 'tokaido_map',
    yokai: 'yokai_collage',
    kesshu: 'kesshu_tilted',
    genji: 'genji_strips',
  };
  const img = getSheetImage(boardSheetMap[board.id] || 'tokaido_map');
  if (img && img.complete && img.naturalWidth > 0) {
    const srcW = Math.floor(img.naturalWidth * 0.90);
    const srcH = Math.floor(img.naturalHeight * 0.86);
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, Math.floor(img.naturalWidth * 0.04), Math.floor(img.naturalHeight * 0.04), srcW, srcH, 18, 18, w - 36, h - 36);
    ctx.restore();
  }

  // Traditional Double Sumi-Ink Broadsheet Margin Frame (外匡・内匡)
  ctx.strokeStyle = UKIYOE_INK.sumi;
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, w - 40, h - 40);

  // Red Publisher Censorship Stamp (改印・版元印) in top-right margin
  drawAuthenticSeal(ctx, w - 44, 44, 18, '改印', '#c83e2b', true);

  return c;
}

function getKindMeta(board, node) {
  switch (node.kind) {
    case 'start':
      return { seal: '振出', badge: '起点', slipBg: '#c8472c', slipText: '#fff8ea', border: '#9e261b' };
    case 'goal':
      return { seal: '上り', badge: '大上り', slipBg: '#dfc068', slipText: '#18110c', border: '#b8861b' };
    case 'jump': {
      const d = node.jumpTable ? node.jumpTable[0] : 2;
      const sign = d >= 0 ? `+${d}` : `${d}`;
      return {
        seal: d >= 0 ? `飛${sign}` : `戻${sign}`,
        badge: d >= 0 ? `飛${sign}格` : `関${sign}格`,
        slipBg: d >= 0 ? '#c8472c' : '#59253a',
        slipText: '#fff8ea',
        border: d >= 0 ? '#bf3426' : '#59253a',
      };
    }
    case 'stay':
      return { seal: '泊', badge: '一休み', slipBg: '#9e261b', slipText: '#fff8ea', border: '#8c2016' };
    case 'branch':
      return { seal: '岐', badge: '偶善/奇悪', slipBg: '#5c3373', slipText: '#fff8ea', border: '#5c3373' };
    case 'good':
      return { seal: '善', badge: '善玉道', slipBg: '#dfc068', slipText: '#18110c', border: '#b8861b' };
    case 'evil':
      return { seal: '悪', badge: '悪玉道', slipBg: '#4f2b5e', slipText: '#fff8ea', border: '#4f2b5e' };
    default: {
      if (node.tokens) {
        return { seal: '備', badge: `武具:${node.tokenLabel}`, slipBg: '#c8472c', slipText: '#fff8ea', border: '#b53324' };
      }
      const isEven = (node.id % 2) === 0;
      return {
        seal: String(node.id),
        badge: `#${node.id}`,
        slipBg: isEven ? '#dfc068' : '#c95236',
        slipText: isEven ? '#18110c' : '#fff8ea',
        border: '#2b1e14',
      };
    }
  }
}

// High-Clarity 3D Tile Texture:
// Full-bleed woodblock artwork (92% of tile area!) with a slim right-edge Tanzaku title slip
// and a compact top-left circular Hanko seal so the Ukiyo-e illustration is large and unobstructed.
export function create3DTileCanvas(board, node) {
  const isGoal = node.kind === 'goal' || (board.id === 'kesshu' && node.kind === 'start');
  const w = isGoal ? 768 : 512;
  const h = isGoal ? 576 : 384;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // 1. Slim Washi Margin + Full-Bleed Woodblock Artwork
  const pad = 6;
  ctx.fillStyle = '#e8d7b2';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.beginPath();
  ctx.rect(pad, pad, w - pad * 2, h - pad * 2);
  ctx.clip();
  ctx.translate(pad, pad);
  renderNishikieScene(ctx, board.id, node, w - pad * 2, h - pad * 2);
  ctx.restore();

  const meta = getKindMeta(board, node);

  // 2. Crisp Double Sumi-Ink Keyblock Frame (二重匡郭)
  ctx.strokeStyle = UKIYOE_INK.sumi;
  ctx.lineWidth = isGoal ? 7 : 5;
  ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
  ctx.strokeStyle = meta.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(pad + 5, pad + 5, w - (pad + 5) * 2, h - (pad + 5) * 2);

  // 3. Slim Right-Edge Edo Tanzaku (短冊) Vertical Title Slip (only 12% of width so art stays huge!)
  const cartW = isGoal ? 84 : 62;
  const cartH = Math.round(h * 0.72);
  const cartX = w - cartW - (pad + 6);
  const cartY = pad + 6;

  ctx.save();
  ctx.fillStyle = meta.slipBg;
  ctx.fillRect(cartX, cartY, cartW, cartH);
  ctx.strokeStyle = UKIYOE_INK.sumi;
  ctx.lineWidth = 3.5;
  ctx.strokeRect(cartX, cartY, cartW, cartH);

  // 3-dot die ornament at top of Tanzaku
  const dotY = cartY + 13;
  for (let d = -1; d <= 1; d++) {
    ctx.fillStyle = meta.slipText === '#18110c' ? '#bf3426' : '#f3d37a';
    ctx.beginPath();
    ctx.arc(cartX + cartW / 2 + d * 13, dotY, 4, 0, TAU);
    ctx.fill();
  }

  // Vertical Calligraphy Title inside Tanzaku
  const chars = Array.from(node.title || '').slice(0, 6);
  const maxFont = isGoal ? 38 : 31;
  const availH = cartH - 28;
  const stepY = Math.min(maxFont + 2, availH / Math.max(1, chars.length));
  const fontSize = Math.max(18, Math.min(maxFont, stepY * 0.9));
  ctx.fillStyle = meta.slipText;
  ctx.font = `800 ${Math.round(fontSize)}px "Shippori Mincho B1", "Noto Serif SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const startY = cartY + 24 + (availH - (chars.length - 1) * stepY) / 2;
  chars.forEach((ch, idx) => {
    ctx.fillText(ch, cartX + cartW / 2, startY + idx * stepY);
  });
  ctx.restore();

  // 4. Compact Top-Left Circular Hanko Seal (振出 / 上り / 泊 / 飛 / Step #)
  const sealR = isGoal ? 36 : 27;
  const sealX = pad + 10 + sealR;
  const sealY = pad + 10 + sealR;
  drawAuthenticSeal(
    ctx,
    sealX,
    sealY,
    sealR,
    meta.seal,
    node.kind === 'goal' || node.kind === 'start' || node.kind === 'jump' || node.kind === 'stay' || node.tokens
      ? '#bf3426'
      : '#241911',
    false,
  );

  // 5. Compact Bottom-Left Pill Tag (only for special effect tiles, leaving bottom art visible!)
  if (node.kind !== 'normal' || node.tokens) {
    const tagText = meta.badge;
    ctx.save();
    ctx.font = `800 ${isGoal ? 24 : 20}px "Shippori Mincho B1", "Noto Serif SC", serif`;
    const tw = Math.min(w * 0.62, ctx.measureText(tagText).width + 24);
    const th = isGoal ? 38 : 32;
    const tx = pad + 8;
    const ty = h - th - pad - 6;
    ctx.fillStyle = 'rgba(24, 16, 11, 0.86)';
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = '#e5be62';
    ctx.lineWidth = 2;
    ctx.strokeRect(tx, ty, tw, th);
    ctx.fillStyle = '#fff6df';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(tagText, tx + 12, ty + th / 2 + 1);
    ctx.restore();
  }

  return canvas;
}
