// Global state G, screen geometry, profile v1->v2 migration, and deterministic progression helpers.
import {
  BOARDS, CHARMS, CHARM_BY_ID, UKIYOE_CARDS, ACHIEVEMENTS,
  DEFAULT_CHARM_IDS, MAX_EQUIPPED_CHARMS,
  createMatch, getBoard, getCardById, sanitizeCharmLoadout,
} from './boards.js';

export const canvas = typeof document !== 'undefined' ? document.getElementById('stage') : null;
export const ctx = canvas ? canvas.getContext('2d') : null;

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
export const CHARM_SLOTS = CHARMS.slice(0, 3).map((charm, i) => ({
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
  if (!canvas || typeof window === 'undefined') return;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  scale = Math.min(canvas.width / W, canvas.height / H);
  offsetX = (canvas.width - W * scale) / 2;
  offsetY = (canvas.height - H * scale) / 2;
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', resize);
  resize();
}

export const PROFILE_SCHEMA_VERSION = 2;
export const PROFILE_KEY_V1 = 'esugoroku.profile.v1';
export const PROFILE_KEY_V2 = 'esugoroku.profile.v2';

export const DEFAULT_COLLECTION = [
  'tokaido_01', 'tokaido_02', 'tokaido_03', 'tokaido_04',
  'yokai_01', 'yokai_02', 'yokai_03',
  'kesshu_01', 'kesshu_02', 'kesshu_03',
  'genji_01', 'genji_02', 'genji_03',
];

export function createDefaultRecords() {
  return {
    totalMatches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    bestPly: null,
    maxResources: 0,
    duels: 0,
    steals: 0,
    byBoard: {
      tokaido: { played: 0, wins: 0, bestPly: null },
      yokai: { played: 0, wins: 0, bestPly: null },
      kesshu: { played: 0, wins: 0, bestPly: null },
      genji: { played: 0, wins: 0, bestPly: null },
    },
  };
}

/**
 * Pure idempotent profile migration from v1/v2 raw objects into v2 schema.
 * Never drops existing unlocked cards; validates equipped charms & hand card.
 */
export function migrateProfileData(v1Raw = null, v2Raw = null) {
  const parseIfNeeded = val => {
    if (!val) return null;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return null; }
    }
    return typeof val === 'object' ? val : null;
  };
  const v1 = parseIfNeeded(v1Raw);
  const v2 = parseIfNeeded(v2Raw);
  const src = v2 || v1 || {};
  const validCardIds = new Set(UKIYOE_CARDS.map(c => c.id));
  const mergedCollection = new Set(DEFAULT_COLLECTION);

  for (const list of [v1?.collection, v2?.collection]) {
    if (Array.isArray(list)) {
      for (const id of list) {
        if (validCardIds.has(id)) mergedCollection.add(id);
      }
    }
  }

  const charms = sanitizeCharmLoadout(
    Array.isArray(src.charms) && src.charms.length > 0 ? src.charms : DEFAULT_CHARM_IDS,
  );
  const customHandCard = (src.customHandCard && validCardIds.has(src.customHandCard) && mergedCollection.has(src.customHandCard))
    ? src.customHandCard
    : 'tokaido_01';

  const aiDifficulty = ['easy', 'normal', 'hard', 'master'].includes(src.aiDifficulty)
    ? src.aiDifficulty
    : 'normal';
  const mode = src.mode === 'local2p' ? 'local2p' : 'ai';

  const defaultRec = createDefaultRecords();
  const rawRec = (src.records && typeof src.records === 'object')
    ? src.records
    : (src.stats && typeof src.stats === 'object' ? src.stats : {});
  const records = {
    ...defaultRec,
    ...rawRec,
    totalMatches: rawRec.totalMatches ?? rawRec.matches ?? defaultRec.totalMatches,
    wins: rawRec.wins ?? defaultRec.wins,
    duels: rawRec.duels ?? defaultRec.duels,
    byBoard: {
      tokaido: { ...defaultRec.byBoard.tokaido, ...(rawRec.byBoard?.tokaido || {}) },
      yokai: { ...defaultRec.byBoard.yokai, ...(rawRec.byBoard?.yokai || {}) },
      kesshu: { ...defaultRec.byBoard.kesshu, ...(rawRec.byBoard?.kesshu || {}) },
      genji: { ...defaultRec.byBoard.genji, ...(rawRec.byBoard?.genji || {}) },
    },
  };

  const validAchIds = new Set(ACHIEVEMENTS.map(a => a.id));
  const achievements = Array.isArray(src.achievements)
    ? [...new Set(src.achievements.filter(id => validAchIds.has(id)))]
    : [];

  return {
    version: PROFILE_SCHEMA_VERSION,
    collection: [...mergedCollection],
    charms,
    customHandCard,
    aiDifficulty,
    mode,
    audioEnabled: src.audioEnabled !== undefined ? Boolean(src.audioEnabled) : true,
    bgmEnabled: src.bgmEnabled !== undefined ? Boolean(src.bgmEnabled) : true,
    achievements,
    records,
    stats: records,
  };
}

function loadProfileFromStorage() {
  if (typeof localStorage === 'undefined') {
    return migrateProfileData(null, null);
  }
  let v1 = null;
  let v2 = null;
  try {
    const raw1 = localStorage.getItem(PROFILE_KEY_V1);
    if (raw1) v1 = JSON.parse(raw1);
  } catch {
    v1 = null;
  }
  try {
    const raw2 = localStorage.getItem(PROFILE_KEY_V2);
    if (raw2) v2 = JSON.parse(raw2);
  } catch {
    v2 = null;
  }
  const migrated = migrateProfileData(v1, v2);
  try {
    localStorage.setItem(PROFILE_KEY_V2, JSON.stringify(migrated));
  } catch {
    // Storage disabled/full: keep running in memory without overwriting v1.
  }
  return migrated;
}

const saved = loadProfileFromStorage();

export const G = {
  screen: 'SELECT_BOARD', // 'SELECT_BOARD' | 'SELECT_SIDE' | 'PLAYING'
  phase: 'ROLL',          // 'ROLL' | 'ANIM' | 'MOVE' | 'PENDING_CHOICE' | 'SETTLEMENT'
  boardIdx: 0,
  hoverBoard: -1,
  hoverSide: -1,
  hoverCharm: -1,
  hoverPlayBtn: -1,
  hoverSettleBtn: -1,
  humanSide: 0,
  mode: saved.mode,
  aiDifficulty: saved.aiDifficulty,
  customHandCard: saved.customHandCard,
  showHandPicker: false,
  showCharmPicker: false,
  handPickerFilter: 'all',
  charms: [...saved.charms],
  collection: new Set(saved.collection),
  achievements: new Set(saved.achievements),
  records: saved.records,
  match: createMatch(0, {
    humanSide: 0,
    mode: saved.mode,
    aiDifficulty: saved.aiDifficulty,
    charms: saved.charms,
    customCard: saved.customHandCard,
  }),
  newCards: [],
  newAchievements: [],
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
    { x: 1120, y: 625, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0.25, rz: 0, wx: 0, wy: 0, wz: 0, value: 1, settled: true, active: true },
  ],
  pieceAnim: null,
  pendingRoll: 0,
  humanRollDone: false,
  aiTimer: 0,
  turnTransition: {
    count: 0,
    fromSide: 0,
    toSide: 0,
    direction: 'to-human',
    active: false,
    timestamp: 0,
  },
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
  // Derived readouts mirrored strictly from G.match.boardState for HUD/E2E compatibility
  yokaiLanterns: 4,
  yokaiFrenzy: false,
  yokaiFrenzyUsed: false,
  kesshuPieces: 0,
  genjiBalance: 0,
  tokaidoGourmet: [],
  tokaidoCoins: 0,
  camera: { zoom: 1, focus: { x: 600, y: 400 } },
  cutIn: null,
  hop: { seg: -1, path: null },
  stats: { turns: 0, jumps: 0, duels: 0, cards: 0 },
  lastResult: null,
  banner: '江戸浮世絵・絵双六',
  audioEnabled: saved.audioEnabled,
  bgmEnabled: saved.bgmEnabled,
};

export function currentBoard() {
  return getBoard(G.boardIdx);
}

export function currentHandCard() {
  return getCardById(G.customHandCard);
}

export function isPreGameMatch() {
  if (!G.match) return true;
  return (G.match.ply || G.match.turnCount || 0) === 0 && !G.rollPending && G.phase === 'ROLL' && (G.match.winner ?? -1) < 0;
}

/**
 * Purely derives legacy HUD fields from the authoritative `G.match` state.
 */
export function syncDerivedHudFromMatch(match = G.match) {
  if (!match) return;
  const human = match.humanSide ?? 0;
  const bs = match.boardState;
  const tokens = match.tokens?.[human] || 0;
  G.kesshuPieces = [1, 2, 4].filter(m => tokens & m).length;

  if (bs?.tokaido) {
    const gMask = bs.tokaido.gourmetMask?.[human] || 0;
    const gArr = [];
    if (gMask & 1) gArr.push(0);
    if (gMask & 2) gArr.push(1);
    if (gMask & 4) gArr.push(2);
    G.tokaidoGourmet = gArr;
    G.tokaidoCoins = bs.tokaido.coins?.[human] || 0;
  }

  if (bs?.yokai) {
    const lMask = bs.yokai.lanternMask?.[human] || 0;
    const litCount = ((lMask & 1) ? 1 : 0) + ((lMask & 2) ? 1 : 0) + ((lMask & 4) ? 1 : 0) + ((lMask & 8) ? 1 : 0);
    G.yokaiLanterns = Math.max(0, 4 - litCount);
    G.yokaiFrenzy = Boolean(bs.yokai.frenzyPending?.[human]);
    G.yokaiFrenzyUsed = Boolean(bs.yokai.frenzyTriggered?.[human]);
  }

  if (bs?.genji) {
    G.genjiBalance = bs.genji.balance?.[human] || 0;
  }
}

export function saveProfile() {
  if (typeof localStorage === 'undefined') return;
  const payload = {
    version: PROFILE_SCHEMA_VERSION,
    collection: [...G.collection],
    charms: [...G.charms],
    customHandCard: G.customHandCard,
    aiDifficulty: G.aiDifficulty,
    mode: G.mode,
    audioEnabled: G.audioEnabled,
    bgmEnabled: G.bgmEnabled,
    achievements: [...G.achievements],
    records: G.records,
  };
  try {
    localStorage.setItem(PROFILE_KEY_V2, JSON.stringify(payload));
  } catch {
    // Private browsing / storage disabled: game stays playable.
  }
}

export function setCustomHandCard(cardId) {
  if (!cardId) {
    G.customHandCard = null;
    saveProfile();
    return null;
  }
  const card = getCardById(cardId);
  if (!card) return null;
  G.customHandCard = card.id;
  saveProfile();
  return card;
}

export function resetMatchState(options = {}) {
  const board = currentBoard();
  const validCharms = sanitizeCharmLoadout(G.charms, board.id);
  // Default AI opponent also receives a fair, legal 3-charm loadout and starter card on normal/hard/master
  const aiCharms = G.aiDifficulty === 'easy'
    ? ['stay']
    : ['stay', 'guard', 'dash'];
  const aiCard = G.aiDifficulty === 'master'
    ? `${board.id}_03`
    : (G.aiDifficulty === 'hard' ? `${board.id}_02` : `${board.id}_01`);

  G.match = createMatch(G.boardIdx, {
    humanSide: G.humanSide,
    mode: G.mode,
    aiDifficulty: G.aiDifficulty,
    charms: validCharms,
    opponentCharms: aiCharms,
    customCard: G.customHandCard,
    opponentCard: aiCard,
    seed: options.seed,
  });
  G.phase = 'ROLL';
  G.dice = [1, 0];
  G.diceValue = 1;
  G.rollPending = false;
  G.humanRollDone = false;
  G.pieceAnim = null;
  G.effects = [];
  syncDerivedHudFromMatch(G.match);
  G.camera = { zoom: 1, focus: { x: BOARD_RECT.x + BOARD_RECT.w / 2, y: BOARD_RECT.y + BOARD_RECT.h / 2 } };
  G.cutIn = null;
  G.hop = { seg: -1, path: null };
  G.stats = { turns: 0, jumps: 0, duels: 0, cards: 0 };
  G.newCards = [];
  G.newAchievements = [];
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

/**
 * Deterministic post-match progression evaluator (V1.3 Section 5.3 & 5.4).
 * Unlocks cards 04..09 and achievements based on actual match results & volume mechanics.
 */
export function evaluateMatchProgression(boardIndex, matchState, arg3 = G.collection, achievementsSet = G.achievements, recordsObj = G.records) {
  const isOptionsObj = arg3 && !(arg3 instanceof Set);
  const collectionSet = isOptionsObj ? (arg3.collection || G.collection) : (arg3 || G.collection);
  const persist = isOptionsObj ? (arg3.persist !== false) : true;
  const board = getBoard(boardIndex);
  const human = matchState?.humanSide ?? 0;
  const winner = matchState?.winner ?? -1;
  const humanWon = winner === human;
  const isDraw = winner === 2;
  const ply = matchState?.ply || matchState?.turnCount || 0;
  const difficulty = matchState?.aiDifficulty || 'normal';
  const bs = matchState?.boardState;

  // Update career records
  recordsObj.totalMatches = (recordsObj.totalMatches || 0) + 1;
  if (humanWon) {
    recordsObj.wins = (recordsObj.wins || 0) + 1;
    if (!recordsObj.bestPly || (ply > 0 && ply < recordsObj.bestPly)) {
      recordsObj.bestPly = ply;
    }
  } else if (isDraw) {
    recordsObj.draws = (recordsObj.draws || 0) + 1;
  } else if (winner >= 0) {
    recordsObj.losses = (recordsObj.losses || 0) + 1;
  }

  recordsObj.duels = (recordsObj.duels || 0) + (matchState?.duelCount || 0);
  recordsObj.steals = (recordsObj.steals || 0) + (matchState?.stealCount?.[human] || 0);

  const bRec = recordsObj.byBoard?.[board.id] || { played: 0, wins: 0, bestPly: null };
  bRec.played += 1;
  if (humanWon) {
    bRec.wins += 1;
    if (!bRec.bestPly || (ply > 0 && ply < bRec.bestPly)) {
      bRec.bestPly = ply;
    }
  }
  if (recordsObj.byBoard) recordsObj.byBoard[board.id] = bRec;

  // Volume mechanic checks
  let mechanicDone = false;
  if (board.id === 'tokaido') {
    const gMask = bs?.tokaido?.gourmetMask?.[human] || 0;
    const gCount = ((gMask & 1) ? 1 : 0) + ((gMask & 2) ? 1 : 0) + ((gMask & 4) ? 1 : 0);
    const spent = bs?.tokaido?.coinsSpent?.[human] || 0;
    mechanicDone = gCount >= 2 || spent >= 1;
    recordsObj.maxResources = Math.max(recordsObj.maxResources || 0, gCount);
  } else if (board.id === 'yokai') {
    const lMask = bs?.yokai?.lanternMask?.[human] || 0;
    const lCount = ((lMask & 1) ? 1 : 0) + ((lMask & 2) ? 1 : 0) + ((lMask & 4) ? 1 : 0) + ((lMask & 8) ? 1 : 0);
    mechanicDone = lCount >= 4 || Boolean(bs?.yokai?.frenzyTriggered?.[human]);
    recordsObj.maxResources = Math.max(recordsObj.maxResources || 0, lCount);
  } else if (board.id === 'kesshu') {
    const tokCount = [1, 2, 4].filter(m => (matchState?.tokens?.[human] || 0) & m).length;
    const stances = bs?.kesshu?.stanceCount?.[human] || 0;
    mechanicDone = (humanWon && tokCount >= 3) || stances >= 1;
    recordsObj.maxResources = Math.max(recordsObj.maxResources || 0, tokCount);
  } else if (board.id === 'genji') {
    const route = bs?.genji?.routeChoice?.[human];
    const bal = Math.abs(bs?.genji?.balance?.[human] || 0);
    mechanicDone = Boolean(route) || bal >= 2;
    recordsObj.maxResources = Math.max(recordsObj.maxResources || 0, bal);
  }

  const noCharmsUsed = (matchState?.charms?.[human] || 0) === 0;
  const unlockedCards = [];
  const unlockedAchievements = [];

  const grantCard = num => {
    const cid = `${board.id}_0${num}`;
    if (!collectionSet.has(cid)) {
      collectionSet.add(cid);
      unlockedCards.push(cid);
    }
  };
  const grantAch = suffix => {
    const aid = `${board.id}_${suffix}`;
    if (!achievementsSet.has(aid)) {
      achievementsSet.add(aid);
      unlockedAchievements.push(aid);
    }
  };

  // 04: First match completion on this board
  grantCard(4);
  grantAch('first_clear');

  // 05: First win on this board
  if (humanWon) {
    grantCard(5);
    grantAch('first_win');
  }

  // 06: Volume core mechanic goal
  if (mechanicDone) {
    grantCard(6);
    grantAch('core_mechanic');
    grantCard(7);
  }

  // 07: Veteran goal (2+ wins on board OR 2+ duels in match)
  if (bRec.wins >= 2 || (matchState?.duelCount || 0) >= 2) {
    grantCard(7);
  }

  // 08: Hard AI win or no-charm win
  if (humanWon && (difficulty === 'hard' || difficulty === 'master' || noCharmsUsed)) {
    grantCard(8);
    if (noCharmsUsed) grantAch('no_charm_win');
    if (difficulty === 'hard' || difficulty === 'master') grantAch('hard_win');
  }

  // 09: Master AI win or fast victory (<= 36 ply)
  if (humanWon && (difficulty === 'master' || (ply > 0 && ply <= 36))) {
    grantCard(9);
    grantAch('master_win');
  }

  G.newCards = unlockedCards;
  G.newAchievements = unlockedAchievements;
  if (persist) saveProfile();

  return {
    unlockedCards,
    unlockedAchievements,
    newlyUnlockedCards: unlockedCards,
    newlyUnlockedAchievements: unlockedAchievements,
    records: recordsObj,
  };
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
  if (!canvas) return { x: clientX, y: clientY };
  const r = canvas.getBoundingClientRect();
  const cx = (clientX - r.left) * (canvas.width / r.width);
  const cy = (clientY - r.top) * (canvas.height / r.height);
  return { x: (cx - offsetX) / scale, y: (cy - offsetY) / scale };
}

export function toClientXY(stageX, stageY) {
  if (!canvas) return { x: stageX, y: stageY };
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
    const c = CHARM_BY_ID[id];
    return mask | (c ? c.mask : 0);
  }, 0);
}

export function toggleCharm(id) {
  const charmDef = CHARM_BY_ID[id];
  if (!charmDef) return false;
  const board = currentBoard();
  if (charmDef.boardId && charmDef.boardId !== board.id) {
    return false;
  }
  const idx = G.charms.indexOf(id);
  if (idx >= 0) {
    G.charms.splice(idx, 1);
  } else if (G.charms.length < MAX_EQUIPPED_CHARMS) {
    G.charms.push(id);
  } else {
    G.charms.shift();
    G.charms.push(id);
  }
  saveProfile();
  return true;
}

export function equipAllCharms() {
  G.charms = [...DEFAULT_CHARM_IDS];
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
