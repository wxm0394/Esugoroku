// Global state G, screen geometry and shared canvas helpers.
import { BOARDS, CHARMS, createMatch, getBoard } from './boards.js';

export const canvas = document.getElementById('stage');
export const ctx = canvas.getContext('2d');

export const FONT_BRUSH = '"Yuji Syuku", "Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif';
export const FONT_MINCHO = '"Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif';
export const FONT_SERIF = '"Shippori Mincho B1", "Noto Serif JP", "Yu Mincho", serif';

export const W = 1280;
export const H = 800;
export let scale = 1;
export let offsetX = 0;
export let offsetY = 0;

export const LEFT_PANEL = { x: 14, y: 68, w: 166, h: 664 };
export const BOARD_RECT = { x: 190, y: 68, w: 800, h: 660 };
export const RIGHT_PANEL = { x: 1000, y: 68, w: 266, h: 664 };
export const BOARD_SURFACE = { x: 190, y: 78, w: 800, h: 640 };
// Scale factor mapping the 800x640 local node space to the print surface.
export const BOARD_SCALE_X = BOARD_SURFACE.w / 800;
export const BOARD_SCALE_Y = BOARD_SURFACE.h / 640;

export const PLAY_BUTTONS = {
  gallery: { x: 24, y: 592, w: 146, h: 34 },
  charms: { x: 24, y: 632, w: 146, h: 34 },
  menu: { x: 24, y: 672, w: 146, h: 34 },
};

export const DICE_TRAY = { x: 1014, y: 432, w: 240, h: 250 };
export const TUBE_RECT = { x: 1038, y: 542, w: 98, h: 108 };
export const TUBE_CENTER = { x: 1086, y: 590 };

export const SELECT_CARD_W = 588;
export const SELECT_CARD_H = 326;
export const SELECT_CARD_GAP_X = 22;
export const SELECT_CARD_GAP_Y = 20;
export const SELECT_CARD_START_X = (W - SELECT_CARD_W * 2 - SELECT_CARD_GAP_X) / 2;
export const SELECT_CARD_START_Y = 104;

export const GALLERY_CARD_W = 188;
export const GALLERY_CARD_H = 104;
export const GALLERY_GAP_X = 10;
export const GALLERY_GAP_Y = 8;
export const GALLERY_START_X = (W - GALLERY_CARD_W * 6 - GALLERY_GAP_X * 5) / 2;
export const GALLERY_START_Y = 104;

export const SIDE_MODAL = { x: 150, y: 80, w: 980, h: 640 };
export const SIDE_CARDS = [
  { x: 200, y: 238, w: 250, h: 142, side: 0 },
  { x: 520, y: 238, w: 250, h: 142, side: 1 },
];
export const CHARM_SLOTS = CHARMS.map((charm, i) => ({
  x: 268 + i * 248,
  y: 452,
  w: 214,
  h: 116,
  id: charm.id,
}));
export const START_BTN = { x: 494, y: 636, w: 292, h: 50 };
export const SIDE_GALLERY_BTN = { x: 196, y: 636, w: 220, h: 50 };
export const SIDE_BACK_BTN = { x: 850, y: 636, w: 190, h: 50 };

export const SETTLEMENT_PANEL = { x: 238, y: 94, w: 804, h: 620 };
export const SETTLEMENT_BTNS = {
  again: { x: 408, y: 650, w: 210, h: 44 },
  menu: { x: 646, y: 650, w: 210, h: 44 },
};
export const GALLERY_CLOSE = { x: 1150, y: 64, w: 92, h: 34 };

export function resize() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  scale = Math.min(canvas.width / W, canvas.height / H);
  offsetX = (canvas.width - W * scale) / 2;
  offsetY = (canvas.height - H * scale) / 2;
}

window.addEventListener('resize', resize);
resize();

const DEFAULT_COLLECTION = [
  'tokaido_01', 'tokaido_02', 'tokaido_03', 'tokaido_04',
  'yokai_01', 'yokai_02', 'yokai_03',
  'kesshu_01', 'kesshu_02', 'kesshu_03',
  'genji_01', 'genji_02', 'genji_03',
];

function loadProfile() {
  try {
    const raw = localStorage.getItem('esugoroku.profile.v1');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const saved = loadProfile();

export const G = {
  screen: 'SELECT_BOARD', // 'SELECT_BOARD' | 'SELECT_SIDE' | 'PLAYING'
  phase: 'ROLL',          // 'ROLL' | 'ANIM' | 'SETTLEMENT'
  boardIdx: 0,
  hoverBoard: -1,
  hoverSide: -1,
  hoverCharm: -1,
  hoverPlayBtn: -1,
  hoverSettleBtn: -1,
  humanSide: 0,
  match: createMatch(0, { humanSide: 0, charms: ['stay', 'guard', 'dash'] }),
  charms: ['stay', 'guard', 'dash'],
  collection: new Set(saved?.collection?.length ? saved.collection : DEFAULT_COLLECTION),
  newCards: [],
  dice: [1, 0],
  diceValue: 1,
  rollPending: false,
  tube: {
    x: TUBE_CENTER.x,
    y: TUBE_CENTER.y,
    shake: 0,
    tipped: false,
    hover: false,
    hold: false,
  },
  physDice: [
    { x: 1110, y: 620, z: 0, vx: 0, vy: 0, vz: 0, rx: -Math.PI / 2, ry: 0.4, rz: 0, wx: 0, wy: 0, wz: 0, value: 1, settled: true, active: true },
  ],
  pieceAnim: null,
  pendingRoll: 0,
  humanRollDone: false,
  aiTimer: 0,
  statusText: '竹筒を押さえて振り、指を離して賽を投げよ',
  statusSub: '出目に従い、絵双六の道を進む',
  toast: null,
  stamp: null,
  effects: [],
  pulseTick: 0,
  hoverNode: -1,
  showGallery: false,
  galleryTab: 'cards',
  galleryScroll: 0,
  galleryHover: -1,
  showRules: false,
  yokaiLanterns: 4,
  yokaiFrenzy: false,
  yokaiFrenzyUsed: false,
  kesshuPieces: 0,
  genjiBalance: 0,
  tokaidoGourmet: [],
  // V2 camera: smooth zoom & follow tracked over the board during movement.
  camera: { zoom: 1, focus: { x: 600, y: 400 } },
  cutIn: null,
  hop: { seg: -1, path: null },
  stats: { turns: 0, jumps: 0, duels: 0, cards: 0 },
  lastResult: null,
  banner: '江戸浮世絵・絵双六',
  audioEnabled: true,
};

export function currentBoard() {
  return getBoard(G.boardIdx);
}

export function saveProfile() {
  try {
    localStorage.setItem('esugoroku.profile.v1', JSON.stringify({
      collection: [...G.collection],
      charms: G.charms,
    }));
  } catch {
    // Private browsing / storage disabled: the game remains playable.
  }
}

export function resetMatchState() {
  const board = currentBoard();
  G.match = createMatch(G.boardIdx, { humanSide: G.humanSide, charms: G.charms });
  G.phase = 'ROLL';
  G.dice = [1, 0];
  G.diceValue = 1;
  G.rollPending = false;
  G.humanRollDone = false;
  G.pieceAnim = null;
  G.effects = [];
  G.yokaiLanterns = 4;
  G.yokaiFrenzy = false;
  G.yokaiFrenzyUsed = false;
  G.kesshuPieces = 0;
  G.genjiBalance = 0;
  G.tokaidoGourmet = [];
  G.camera = { zoom: 1, focus: { x: BOARD_RECT.x + BOARD_RECT.w / 2, y: BOARD_RECT.y + BOARD_RECT.h / 2 } };
  G.cutIn = null;
  G.hop = { seg: -1, path: null };
  G.stats = { turns: 0, jumps: 0, duels: 0, cards: 0 };
  G.newCards = [];
  G.lastResult = null;
  G.statusText = G.match.turn === G.humanSide
    ? '竹筒を押さえて振り、指を離して賽を投げよ'
    : '相手の番 ─ 賽の行方を見守る';
  G.statusSub = board.ruleSummary;
  G.tube.shake = 0;
  G.tube.tipped = false;
  G.tube.hold = false;
  G.physDice.forEach((d, i) => {
    d.settled = true;
    d.active = i === 0;
    d.x = 1110;
    d.y = 620;
    d.z = 0;
    d.vx = d.vy = d.vz = 0;
    d.wx = d.wy = d.wz = 0;
  });
}

export function showToast(text, sub = '') {
  G.toast = { text, sub, life: 2.6, total: 2.6 };
}

export function showStamp(text, sub = '') {
  G.stamp = { text, sub, life: 2.2, total: 2.2 };
}

export function spawnLandingEffect(tx, ty, kind = 'gold', label = '') {
  const particles = [];
  const count = kind === 'sakura' ? 16 : 20;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 26 + Math.random() * 82;
    particles.push({
      x: tx + (Math.random() - 0.5) * 10,
      y: ty + (Math.random() - 0.5) * 8,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30,
      size: 2 + Math.random() * 4,
      kind: i % 3 === 0 ? 'sakura' : 'gold',
      life: 0.55 + Math.random() * 0.45,
      t: 0,
    });
  }
  G.effects.push({
    x: tx,
    y: ty,
    t: 0,
    life: 0.9,
    kind,
    label,
    particles,
  });
  if (G.effects.length > 26) G.effects.splice(0, G.effects.length - 26);
}

export function nodeCenter(node) {
  return {
    x: BOARD_SURFACE.x + node.x * BOARD_SCALE_X + node.w * BOARD_SCALE_X / 2,
    y: BOARD_SURFACE.y + node.y * BOARD_SCALE_Y + node.h * BOARD_SCALE_Y / 2,
  };
}

export function pawnPosition(side) {
  const board = currentBoard();
  const pos = G.match?.pos?.[side] ?? board.start;
  const node = board.nodes[pos] || board.nodes[board.goal];
  const base = nodeCenter(node);
  const sideOffset = side === 0 ? -14 : 14;
  const stack = side === 0 ? 3 : -3;
  return { x: base.x + sideOffset, y: base.y + node.h * BOARD_SCALE_Y * 0.24 + stack };
}

export function getSelectBoardRect(index) {
  const col = index % 2;
  const row = Math.floor(index / 2);
  return {
    x: SELECT_CARD_START_X + col * (SELECT_CARD_W + SELECT_CARD_GAP_X),
    y: SELECT_CARD_START_Y + row * (SELECT_CARD_H + SELECT_CARD_GAP_Y),
    w: SELECT_CARD_W,
    h: SELECT_CARD_H,
  };
}

export function getGalleryCardRect(index) {
  const col = index % 6;
  const row = Math.floor(index / 6);
  return {
    x: GALLERY_START_X + col * (GALLERY_CARD_W + GALLERY_GAP_X),
    y: GALLERY_START_Y + row * (GALLERY_CARD_H + GALLERY_GAP_Y),
    w: GALLERY_CARD_W,
    h: GALLERY_CARD_H,
  };
}

export function toStageXY(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const cx = (clientX - r.left) * (canvas.width / r.width);
  const cy = (clientY - r.top) * (canvas.height / r.height);
  return { x: (cx - offsetX) / scale, y: (cy - offsetY) / scale };
}

export function toClientXY(stageX, stageY) {
  const r = canvas.getBoundingClientRect();
  const cx = offsetX + stageX * scale;
  const cy = offsetY + stageY * scale;
  return {
    x: r.left + (cx * r.width) / canvas.width,
    y: r.top + (cy * r.height) / canvas.height,
  };
}

export function isInside(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function currentCharmMasks() {
  return G.charms.reduce((mask, id) => {
    const c = CHARMS.find(item => item.id === id);
    return mask | (c ? c.mask : 0);
  }, 0);
}

export function toggleCharm(id) {
  const idx = G.charms.indexOf(id);
  if (idx >= 0) {
    G.charms.splice(idx, 1);
  } else if (G.charms.length < 3) {
    G.charms.push(id);
  } else {
    G.charms.shift();
    G.charms.push(id);
  }
  saveProfile();
}

export function equipAllCharms() {
  G.charms = CHARMS.map(c => c.id);
  saveProfile();
}

export function unlockBoardCards(boardIndex) {
  const board = getBoard(boardIndex);
  const fresh = [];
  for (const id of board.cardIds) {
    if (!G.collection.has(id)) {
      G.collection.add(id);
      fresh.push(id);
    }
  }
  G.newCards = fresh;
  saveProfile();
  return fresh;
}

export function boardAccent() {
  return currentBoard().accent;
}
