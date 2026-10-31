// 江戸浮世絵・絵双六 ── 四巻の摺物画帖と三十六枚の錦絵札。
//
// This module is deliberately free of DOM imports so the same data can be
// consumed by the browser renderer and by Node's deterministic rules tests.

export const BOARD_W = 800;
export const BOARD_H = 640;
export const BOARD_RECT = { x: 190, y: 68, w: 800, h: 660 };

const PAD = 8;
const GAP = 9;
const COLS = 5;
const ROWS = 5;
const CELL_W = (BOARD_W - PAD * 2 - GAP * (COLS - 1)) / COLS;
const CELL_H = (BOARD_H - PAD * 2 - GAP * (ROWS - 1)) / ROWS;

function cellX(col) {
  return Math.round(PAD + col * (CELL_W + GAP));
}

function cellY(row) {
  return Math.round(PAD + row * (CELL_H + GAP));
}

function cellRect(col, row, w = CELL_W, h = CELL_H, dx = 0, dy = 0) {
  return {
    x: Math.round(cellX(col) + dx),
    y: Math.round(cellY(row) + dy),
    w: Math.round(w),
    h: Math.round(h),
  };
}

// Board 1 / 2: the sixteen squares form a 5x5 ring.
const RING_FROM_TOP_LEFT = [
  [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],
  [4, 1], [4, 2], [4, 3], [4, 4],
  [3, 4], [2, 4], [1, 4], [0, 4],
  [0, 3], [0, 2], [0, 1],
];

// Board 4 starts at the lower-right and ends at the right-middle branch.
const RING_FROM_BOTTOM_RIGHT = [
  [4, 4], [3, 4], [2, 4], [1, 4], [0, 4],
  [0, 3], [0, 2], [0, 1], [0, 0],
  [1, 0], [2, 0], [3, 0], [4, 0],
  [4, 1], [4, 2], [4, 3],
];

const INTERIOR_3X3 = [
  [1, 1], [2, 1], [3, 1],
  [1, 2], [2, 2], [3, 2],
  [1, 3], [2, 3], [3, 3],
];

function ringNode(index, order, data) {
  const [col, row] = order[index];
  return { ...data, ...cellRect(col, row) };
}

function jumpRule(table) {
  const labels = ['一', '二', '三', '四', '五', '六'];
  const grouped = [];
  let start = 0;
  for (let i = 1; i <= 6; i++) {
    if (i === 6 || table[i] !== table[start]) {
      const from = start === 0 ? labels[0] : labels[start];
      const to = labels[i - 1];
      const range = start === i - 1 ? from : `${from}〜${to}`;
      const v = table[start];
      const text = v === 0 ? '止' : v > 0 ? `+${v}` : `${v}`;
      grouped.push(`【${range}】${text}`);
      start = i;
    }
  }
  return grouped.join(' ');
}

function chainNext(nodes, goalIndex) {
  nodes.forEach((node, i) => {
    if (i < goalIndex) node.next = [i + 1];
    else node.next = [];
    node.prev = i > 0 ? i - 1 : -1;
  });
  return nodes;
}

/* ------------------------------------------------------------------ */
/* 巻ノ壱 東海道・御府内名物道中双六                                   */
/* ------------------------------------------------------------------ */

const TOKAIDO_NODES = [
  ['日本橋', 'にほんばし', 'nihonbashi', 'start', '', 0, '旅の起点・日本橋'],
  ['品川宿', 'しながわ', 'shinagawa', 'normal', '', 0, ''],
  ['泥鰌鍋', 'どじょうなべ', 'dojo', 'jump', 0, 0, '名物・飛 +2'],
  ['川崎宿', 'かわさき', 'kawasaki', 'normal', '', 0, ''],
  ['鶴見泊', 'つるみ', 'tsurumi', 'stay', 0, 1, '泊 ─ 一休み'],
  ['神奈川宿', 'かながわ', 'kanagawa', 'normal', '', 0, ''],
  ['程ヶ谷宿', 'ほどがや', 'hodogaya', 'normal', '', 0, ''],
  ['稲荷寿司', 'いなりずし', 'inari', 'jump', 0, 0, '名物・飛 +2'],
  ['戸塚宿', 'とつか', 'totsuka', 'normal', '', 0, ''],
  ['藤沢泊', 'ふじさわ', 'fujisawa', 'stay', 0, 1, '泊 ─ 一休み'],
  ['平塚宿', 'ひらつか', 'hiratsuka', 'normal', '', 0, ''],
  ['大磯宿', 'おおいそ', 'oiso', 'normal', '', 0, ''],
  ['宇治茶', 'うじちゃ', 'tea', 'jump', 0, 0, '名物・飛 +3'],
  ['小田原宿', 'おだわら', 'odawara', 'normal', '', 0, ''],
  ['箱根宿', 'はこね', 'hakone', 'normal', '', 0, ''],
  ['三島宿', 'みしま', 'mishima', 'normal', '', 0, ''],
];

const tokaidoNodes = TOKAIDO_NODES.map((row, i) => {
  const [title, reading, art, kind, jump, stayTurns, rule] = row;
  const node = ringNode(i, RING_FROM_TOP_LEFT, {
    id: i,
    title,
    reading,
    art,
    kind,
    seal: kind === 'start' ? '出' : kind === 'stay' ? '泊' : kind === 'jump' ? '飛' : String(i).padStart(2, '0'),
    stayTurns,
    jumpTable: kind === 'jump' ? [2, 2, 2, 2, 2, i === 12 ? 3 : 2] : [0, 0, 0, 0, 0, 0],
    tokens: 0,
    rule: rule || '宿場を進む',
    komae: i % 3,
    palette: i % 3,
  });
  if (i === 2) {
    node.title = '泥鰌鍋';
    node.jumpTable = [2, 2, 2, 2, 2, 2];
    node.rule = '名物・泥鰌鍋／飛 +2';
  }
  if (i === 7) {
    node.title = '稲荷寿司';
    node.jumpTable = [2, 2, 2, 2, 2, 2];
    node.rule = '名物・稲荷寿司／飛 +2';
  }
  if (i === 12) {
    node.title = '宇治茶';
    node.jumpTable = [3, 3, 3, 3, 3, 3];
    node.rule = '名物・宇治茶／飛 +3';
  }
  return node;
});

const tokaidoGoal = {
  id: 16,
  title: '京都・八百善大上り',
  reading: 'きょうと やおぜん おおあがり',
  art: 'kyoto',
  kind: 'goal',
  seal: '上',
  stayTurns: 0,
  jumpTable: [0, 0, 0, 0, 0, 0],
  tokens: 0,
  rule: '点数ぴったりで入上り／超過は戻る',
  ...cellRect(1, 1, CELL_W * 3 + GAP * 2, CELL_H * 3 + GAP * 2),
  palette: 0,
};

const tokaido = {
  id: 'tokaido',
  volume: '巻ノ壱',
  volumeKanji: '壱',
  style: 'mawari',
  styleLabel: '廻り双六',
  title: '東海道・御府内名物道中双六',
  shortTitle: '東海道名物道中',
  artists: '歌川広重・芳艶・渓斎英泉 風',
  paper: '#f0dfb9',
  ink: '#24180f',
  accent: '#b23a2b',
  accent2: '#1f5c61',
  start: 0,
  goal: 16,
  bounceBack: true,
  requiredTokens: 0,
  maxTurns: 96,
  nodes: chainNext([...tokaidoNodes, tokaidoGoal], 16),
  cardIds: ['tokaido_01', 'tokaido_02', 'tokaido_03', 'tokaido_04', 'tokaido_05', 'tokaido_06', 'tokaido_07', 'tokaido_08', 'tokaido_09'],
  blurb: '五十三次の宿場と名物を巡り、最後は京・八百善へ。',
  ruleSummary: '時計回りに進み、紅丸「泊」は一休み。名物格は飛び、上がりは点点一致。',
  layout: 'spiral-corridor',
  shape: 'arrow-strip',
  ui: {
    skin: 'cedar-passport',
    panelTitle: '道中通行手形',
    panelSub: '杉木焼印・宿場印',
    diceDevice: '染付青花茶碗',
    diceShape: 'porcelain-bowl',
    hud: 'tokaido-gourmet',
    hudLabel: '宿場名物',
  },
};

/* ------------------------------------------------------------------ */
/* 巻ノ弐 百種怪談・妖物飛び双六                                       */
/* ------------------------------------------------------------------ */

const YOKAI = [
  ['河童', 'かっぱ', 'kappa', [3, 3, 3, 1, 1, -3], '【一〜三】三ます先へ飛 【四・五】一ます進む 【六】三ます戻る'],
  ['雪女郎', 'ゆきじょろう', 'yukionna', [2, 2, 2, 0, 0, -2], '【一・二】二ます先へ飛 【三〜五】止 【六】二ます戻る'],
  ['猫俣', 'ねこまた', 'nekomata', [2, 2, 2, 2, 0, 0], '【一〜四】二ます先へ飛 【五・六】止'],
  ['文福茶釜', 'ぶんぶくちゃがま', 'chagama', [1, 1, 1, 0, 0, 0], '【一〜三】一ます先へ飛 【四〜六】止'],
  ['三目大僧', 'みつめだいそう', 'sanme', [-1, -1, 2, 2, 4, 4], '【一・二】一ます戻る 【三・四】二ます先へ飛 【五・六】四ます先へ飛'],
  ['船幽霊', 'ふなゆうれい', 'funayurei', [-2, 0, 0, 2, 2, 2], '【一】二ます戻る 【二・三】止 【四〜六】二ます先へ飛'],
  ['挑灯お岩', 'ちょうちんおいわ', 'oiwa', [-3, -3, 0, 0, 2, 2], '【一・二】三ます戻る 【三・四】止 【五・六】二ます先へ飛'],
  ['ろくろ首', 'ろくろくび', 'rokuro', [4, 4, 2, 2, 0, 0], '【一・二】四ます先へ飛 【三・四】二ます先へ飛 【五・六】止'],
  ['九尾狐', 'きゅうびのきつね', 'kyubi', [1, 2, 3, 2, 1, 0], '【一】一ます 【二】二ます 【三】三ます 【四】二ます 【五】一ます 【六】止'],
  ['手の目', 'てのめ', 'tenome', [0, 0, -1, -1, -3, -3], '【一・二】止 【三・四】一ます戻る 【五・六】三ます戻る'],
  ['一反木綿', 'いったんもめん', 'ittan', [2, 2, 0, 0, -2, -2], '【一・二】二ます先へ飛 【三・四】止 【五・六】二ます戻る'],
  ['朱の盤', 'しゅのばん', 'shuban', [3, 0, 0, 1, 1, 3], '【一】三ます先へ飛 【二・三】止 【四・五】一ます進む 【六】三ます先へ飛'],
  ['大天狗', 'おおてんぐ', 'tengu', [4, 3, 2, 1, 0, -1], '【一】四ます先へ飛 【二】三ます 【三】二ます 【四】一ます 【五】止 【六】一ます戻る'],
  ['見越入道', 'みこしにゅうどう', 'mikoshi', [2, 2, 2, -2, -2, -2], '【一〜三】二ます先へ飛 【四〜六】二ます戻る'],
  ['濡女', 'ぬれおんな', 'nureonna', [-3, -2, -1, 0, 1, 2], '【一】三ます戻る 【二】二ます戻る 【三】一ます戻る 【四】止 【五】一ます 【六】二ます'],
  ['鉄鼠', 'てっそ', 'tesshi', [1, 1, 0, 0, -1, -1], '【一・二】一ます進む 【三・四】止 【五・六】一ます戻る'],
];

// Deliberately irregular collage: four large yokai prints interlock with
// twelve smaller prints.  The centre is reserved for the hundred-tale goal.
const YOKAI_COLLAGE = [
  { x: 4, y: 4, w: 190, h: 146, big: true },
  { x: 202, y: 25, w: 136, h: 96, big: false },
  { x: 346, y: 4, w: 190, h: 146, big: true },
  { x: 544, y: 25, w: 130, h: 96, big: false },
  { x: 680, y: 25, w: 116, h: 96, big: false },
  { x: 4, y: 158, w: 136, h: 100, big: false },
  { x: 4, y: 266, w: 136, h: 100, big: false },
  { x: 4, y: 374, w: 190, h: 122, big: true },
  { x: 660, y: 158, w: 136, h: 100, big: false },
  { x: 660, y: 266, w: 136, h: 100, big: false },
  { x: 606, y: 374, w: 190, h: 122, big: true },
  { x: 4, y: 506, w: 190, h: 130, big: true },
  { x: 202, y: 538, w: 136, h: 96, big: false },
  { x: 346, y: 506, w: 190, h: 130, big: true },
  { x: 544, y: 538, w: 130, h: 96, big: false },
  { x: 680, y: 538, w: 116, h: 96, big: false },
];

const yokaiNodes = YOKAI.map((row, i) => {
  const [title, reading, art, jumpTable, jumpText] = row;
  const rect = YOKAI_COLLAGE[i];
  return {
    id: i,
    title,
    reading,
    art,
    kind: i === 0 ? 'start' : 'jump',
    seal: String(i + 1).padStart(2, '0'),
    stayTurns: 0,
    jumpTable,
    jumpText,
    tokens: 0,
    rule: jumpText,
    ...rect,
    tilt: ((i % 7) - 3) * 0.008,
    komae: i % 4,
    palette: i % 4,
  };
});

const yokaiGoal = {
  id: 16,
  title: '百物語大団円・上り',
  reading: 'ひゃくものがたり だいだんえん',
  art: 'hyakumonogatari',
  kind: 'goal',
  seal: '上',
  stayTurns: 0,
  jumpTable: [0, 0, 0, 0, 0, 0],
  jumpText: '妖怪札をすべて乗り越え、大団円へ。',
  tokens: 0,
  rule: '百物語の灯を消さず、大団円へ上がる',
  x: 236, y: 236, w: 328, h: 210,
  palette: 3,
};

const yokai = {
  id: 'yokai',
  volume: '巻ノ弐',
  volumeKanji: '弐',
  style: 'tobi',
  styleLabel: '飛び双六',
  title: '百種怪談・妖物飛び双六',
  shortTitle: '百種怪談妖物',
  artists: '歌川芳員 1858『百種怪談妖物双六』風',
  paper: '#d9cdb0',
  ink: '#1c1b1a',
  accent: '#7d1f31',
  accent2: '#305b60',
  start: 0,
  goal: 16,
  bounceBack: false,
  requiredTokens: 0,
  maxTurns: 120,
  nodes: chainNext([...yokaiNodes, yokaiGoal], 16),
  cardIds: ['yokai_01', 'yokai_02', 'yokai_03', 'yokai_04', 'yokai_05', 'yokai_06', 'yokai_07', 'yokai_08', 'yokai_09'],
  blurb: '夜行灯の百物語。妖怪札の短冊に記された一〜六の行き先に従う。',
  ruleSummary: '妖怪格に止まったら、出目1〜6の短冊を読み、そのまま飛ぶ。',
  layout: 'irregular-collage',
  shape: 'collage',
  ui: {
    skin: 'dark-temple',
    panelTitle: '百物語経巻',
    panelSub: '黒漆・青行灯四灯',
    diceDevice: '朱符黒竹筒',
    diceShape: 'talisman-bamboo',
    hud: 'hyakumonogatari-lanterns',
    hudLabel: '青行灯',
  },
};

/* ------------------------------------------------------------------ */
/* 巻ノ参 英勇揃伊呂波・誠忠義士双六                                   */
/* ------------------------------------------------------------------ */

const IROHA = ['い', 'ろ', 'は', 'に', 'ほ', 'へ', 'と', 'ち', 'り', 'ぬ', 'る', 'を', 'わ', 'か', 'よ', 'た'];
const KESSHU_TITLES = [
  ['出陣', 'しゅつじん', 'shutsujin', 'start'],
  ['槍隊', 'やりたい', 'yari', 'normal'],
  ['弓隊', 'ゆみたい', 'yumi', 'normal'],
  ['兜', 'かぶと', 'kabuto', 'token'],
  ['軍議', 'ぐんぎ', 'gungi', 'normal'],
  ['大鎧', 'おおよろい', 'oyoroi', 'normal'],
  ['一騎討', 'いっきうち', 'ikkit', 'normal'],
  ['太刀', 'たち', 'tachi', 'token'],
  ['義士盟約', 'ぎしめいやく', 'meiyaku', 'normal'],
  ['忍び', 'しのび', 'shinobi', 'normal'],
  ['敵陣', 'てきじん', 'tekijin', 'normal'],
  ['陣太鼓', 'じんだいこ', 'jindaiko', 'token'],
  ['決死', 'けっし', 'kesshi', 'normal'],
  ['勝鬨', 'かちどき', 'kachidoki', 'normal'],
  ['上り前', 'あがりまえ', 'agarimae', 'normal'],
  ['上り', 'あがり', 'agari', 'goal'],
];

// A deliberately asymmetric 1:1 print-board composition.  The lower-right
// "出陣" and upper-left "上り" are large army cards; the other fourteen
// warrior cards are tilted like a scattered hand of karuta.
const KESSHU_RECTS = [
  { x: 550, y: 460, w: 245, h: 175 },
  { x: 355, y: 515, w: 170, h: 120 },
  { x: 180, y: 515, w: 170, h: 120 },
  { x: 5, y: 515, w: 170, h: 120 },
  { x: 5, y: 335, w: 170, h: 120 },
  { x: 5, y: 200, w: 170, h: 120 },
  { x: 200, y: 300, w: 170, h: 120 },
  { x: 380, y: 300, w: 170, h: 120 },
  { x: 614, y: 265, w: 170, h: 120 },
  { x: 614, y: 135, w: 170, h: 120 },
  { x: 436, y: 135, w: 170, h: 120 },
  { x: 258, y: 135, w: 170, h: 120 },
  { x: 614, y: 5, w: 170, h: 120 },
  { x: 436, y: 5, w: 170, h: 120 },
  { x: 258, y: 5, w: 170, h: 120 },
  { x: 5, y: 5, w: 245, h: 175 },
];
const KESSHU_TILTS = [-7, -4, 2, 6, 9, -2, 4, -6, 1, 7, -3, 5, -5, 8, 0, -1];

const kesshuNodes = KESSHU_TITLES.map((row, i) => {
  const [title, reading, art, kind] = row;
  const tokenBits = kind === 'token'
    ? (title === '兜' ? 1 : title === '太刀' ? 2 : 4)
    : 0;
  return {
    id: i,
    title,
    reading,
    art,
    kind,
    seal: kind === 'goal' ? '上' : kind === 'token' ? '備' : IROHA[i],
    iroha: IROHA[i],
    stayTurns: 0,
    jumpTable: [0, 0, 0, 0, 0, 0],
    tokens: tokenBits,
    tokenLabel: kind === 'token' ? title : '',
    rule: kind === 'goal'
      ? '兜・太刀・陣太鼓の三備えを揃えて上る'
      : kind === 'token'
        ? `討入備え「${title}」を得る`
        : '武者牌を進む',
    ...KESSHU_RECTS[i],
    tilt: (KESSHU_TILTS[i] * Math.PI) / 180,
    palette: i % 4,
  };
});

const kesshu = {
  id: 'kesshu',
  volume: '巻ノ参',
  volumeKanji: '参',
  style: 'kesshu',
  styleLabel: '備え・集結双六',
  title: '英勇揃伊呂波・誠忠義士双六',
  shortTitle: '英勇揃伊呂波',
  artists: '歌川芳虎『英勇揃伊呂波双六』・『源平ふりわけ双六』風',
  paper: '#e9d6ad',
  ink: '#1d1712',
  accent: '#9a2924',
  accent2: '#3c5d45',
  start: 0,
  goal: 15,
  bounceBack: false,
  requiredTokens: 3,
  maxTurns: 120,
  nodes: chainNext(kesshuNodes, 15),
  cardIds: ['kesshu_01', 'kesshu_02', 'kesshu_03', 'kesshu_04', 'kesshu_05', 'kesshu_06', 'kesshu_07', 'kesshu_08', 'kesshu_09'],
  blurb: '伊呂波の武者牌を集め、兜・太刀・陣太鼓の三備えを揃えて上る。',
  ruleSummary: '討入備え三枚を集めよ。未集結で上りへ入ると御前に弾き返される。',
  layout: 'tilted-warrior-cards',
  shape: 'warrior-card',
  ui: {
    skin: 'black-lacquer-armor',
    panelTitle: '甲胄威毛戦牌',
    panelSub: '黒漆金箔・討入備え',
    diceDevice: '六角金蒔絵陣中筒',
    diceShape: 'hex-makie',
    hud: 'kesshu-regalia',
    hudLabel: '討入備え',
  },
};

/* ------------------------------------------------------------------ */
/* 巻ノ肆 善悪道中・源氏絵合出世双六                                   */
/* ------------------------------------------------------------------ */

const GENJI_OUTER = [
  ['桐壺', 'きりつぼ', 'kiritsubo'],
  ['帚木', 'ははきぎ', 'hahakigi'],
  ['空蝉', 'うつせみ', 'utsusemi'],
  ['夕顔', 'ゆうがお', 'yugao'],
  ['若紫', 'わかむらさき', 'wakamurasaki'],
  ['末摘花', 'すえつむはな', 'suetsumuhana'],
  ['紅葉賀', 'もみじのが', 'momijinoga'],
  ['花宴', 'はなのえん', 'hananoen'],
  ['葵', 'あおい', 'aoi'],
  ['賢木', 'さかき', 'sakaki'],
  ['花散里', 'はなちるさと', 'hanachirusato'],
  ['須磨', 'すま', 'suma'],
  ['明石', 'あかし', 'akashi'],
  ['澪標', 'みおつくし', 'miotsukushi'],
  ['蓬生', 'よもぎう', 'yomogiu'],
  ['関屋', 'せきや', 'sekiya'],
];

// 16 narrow vertical strips hug the four edges.  The bottom-right is the
// start; the right-middle strip is the good/evil fork.
const GENJI_STRIP_RECTS = [
  { x: 705, y: 506, w: 70, h: 126 },
  { x: 580, y: 506, w: 70, h: 126 },
  { x: 455, y: 506, w: 70, h: 126 },
  { x: 330, y: 506, w: 70, h: 126 },
  { x: 205, y: 506, w: 70, h: 126 },
  { x: 80, y: 506, w: 70, h: 126 },
  { x: 8, y: 310, w: 70, h: 126 },
  { x: 8, y: 170, w: 70, h: 126 },
  { x: 80, y: 8, w: 70, h: 126 },
  { x: 205, y: 8, w: 70, h: 126 },
  { x: 330, y: 8, w: 70, h: 126 },
  { x: 455, y: 8, w: 70, h: 126 },
  { x: 580, y: 8, w: 70, h: 126 },
  { x: 705, y: 8, w: 70, h: 126 },
  { x: 722, y: 170, w: 70, h: 126 },
  { x: 722, y: 310, w: 70, h: 126 },
];
const GENJI_BERO = ['#5383a6', '#e8b954', '#e09879', '#b8b6a8'];

const genjiOuterNodes = GENJI_OUTER.map((row, i) => {
  const [title, reading, art] = row;
  return {
    id: i,
    title,
    reading,
    art,
    kind: i === 0 ? 'start' : i === 15 ? 'branch' : 'normal',
    seal: String(i + 1).padStart(2, '0'),
    stayTurns: 0,
    jumpTable: [0, 0, 0, 0, 0, 0],
    tokens: 0,
    rule: i === 15 ? '善悪の分かれ道 ─ 偶は善道、奇は悪道' : '源氏物語の短冊を進む',
    ...GENJI_STRIP_RECTS[i],
    color: GENJI_BERO[i % 4],
    palette: i % 4,
    stripColor: GENJI_BERO[i % 4],
    waka: ['桐壺の露', '帚木の風', '空蝉の殻', '夕顔の灯', '若紫の野', '末摘花の袖', '紅葉の賀', '花宴の月', '葵の祭', '賢木の榊', '花散里の宿', '須磨の浦', '明石の月', '澪標の契', '蓬生の庭', '関屋の関'][i],
  };
});

const goodNodes = [
  ['絵合', 'えあわせ', 'eawase'],
  ['松風', 'まつかぜ', 'matsukaze'],
  ['薄雲', 'うすぐも', 'usugumo'],
].map((row, i) => {
  const [title, reading, art] = row;
  return {
    id: 16 + i,
    title,
    reading,
    art,
    kind: 'good',
    seal: '善',
    stayTurns: 0,
    jumpTable: i === 0 ? [2, 2, 2, 2, 2, 2] : [0, 0, 0, 0, 0, 0],
    tokens: 0,
    rule: i === 0 ? '善玉出世道 ─ 連跳 +2' : '善玉出世道 ─ 追い風',
    x: [520, 375, 230][i], y: 170, w: 130, h: 92,
    color: '#b48b31',
    palette: 1,
    waka: ['絵合の扇', '松風の音', '薄雲の月'][i],
  };
});

const evilNodes = [
  ['朝顔', 'あさがお', 'asagao'],
  ['少女', 'おとめ', 'otome'],
  ['玉鬘', 'たまかずら', 'tamakazura'],
].map((row, i) => {
  const [title, reading, art] = row;
  return {
    id: 19 + i,
    title,
    reading,
    art,
    kind: 'evil',
    seal: '悪',
    stayTurns: i === 0 ? 1 : i === 1 ? 2 : 0,
    jumpTable: i === 2 ? [-2, -2, -2, -2, -2, -2] : [0, 0, 0, 0, 0, 0],
    tokens: 0,
    rule: i === 0 ? '悪玉修羅道 ─ 泥舟・一休み' : i === 1 ? '悪玉修羅道 ─ 心学戒律・二休み' : '悪玉修羅道 ─ 祟り・二戻る',
    x: [520, 375, 230][i], y: 410, w: 130, h: 92,
    color: '#3b2342',
    palette: 2,
    waka: ['朝顔の露', '少女の袖', '玉鬘の髪'][i],
  };
});

const genjiGoal = {
  id: 22,
  title: '源氏絵合・上り',
  reading: 'げんじ えあわせ あがり',
  art: 'genji',
  kind: 'goal',
  seal: '上',
  stayTurns: 0,
  jumpTable: [0, 0, 0, 0, 0, 0],
  tokens: 0,
  rule: '金地御帘の前で絵合を結ぶ',
  x: 300, y: 306, w: 210, h: 64,
  color: '#aa8a3a',
  palette: 0,
};

const genjiNodes = [...genjiOuterNodes, ...goodNodes, ...evilNodes, genjiGoal].map(n => ({ ...n }));
genjiNodes[15].next = [16, 19];
for (let i = 0; i < 15; i++) genjiNodes[i].next = [i + 1];
genjiNodes[16].next = [17];
genjiNodes[17].next = [18];
genjiNodes[18].next = [22];
genjiNodes[19].next = [20];
genjiNodes[20].next = [21];
genjiNodes[21].next = [22];
genjiNodes[22].next = [];

const genji = {
  id: 'genji',
  volume: '巻ノ肆',
  volumeKanji: '肆',
  style: 'wakare',
  styleLabel: '振り分け・出世双六',
  title: '善悪道中・源氏絵合出世双六',
  shortTitle: '善悪道中源氏絵合',
  artists: '歌川国芳『善悪道中出世寿古六』・『源氏繪合』風',
  paper: '#eadbb8',
  ink: '#1d1710',
  accent: '#8a2e37',
  accent2: '#304f58',
  start: 0,
  goal: 22,
  bounceBack: false,
  requiredTokens: 0,
  maxTurns: 140,
  nodes: genjiNodes,
  cardIds: ['genji_01', 'genji_02', 'genji_03', 'genji_04', 'genji_05', 'genji_06', 'genji_07', 'genji_08', 'genji_09'],
  blurb: '偶の目は善玉出世道、奇の目は悪玉修羅道。源氏絵合の上りを目指す。',
  ruleSummary: '分かれ道で偶なら善道の連跳、奇なら悪道の泥舟・戒律に捕まる。',
  layout: 'four-color-split-tracks',
  shape: 'vertical-strip',
  ui: {
    skin: 'gold-nashiji-casket',
    panelTitle: '梨地金蒔絵手文庫',
    panelSub: '善悪心学天平',
    diceDevice: '朱漆金鶴蒔絵振筒',
    diceShape: 'vermilion-crane',
    hud: 'genji-balance',
    hudLabel: '善悪天平',
  },
};

export const BOARDS = [tokaido, yokai, kesshu, genji];

/* ------------------------------------------------------------------ */
/* 懐中守り札                                                          */
/* ------------------------------------------------------------------ */

export const CHARMS = [
  {
    id: 'stay',
    name: '宿場守り',
    yomi: 'しゅくばまもり',
    mask: 1,
    art: 'charm_stay',
    color: '#9c3a2a',
    text: '一度だけ「泊」の一休みを無効にする。',
  },
  {
    id: 'guard',
    name: '妖怪封じ',
    yomi: 'ようかいふうじ',
    mask: 2,
    art: 'charm_guard',
    color: '#315e68',
    text: '一度だけ妖怪の「戻る」跳びを封じる。',
  },
  {
    id: 'dash',
    name: '東海道早駕籠',
    yomi: 'とうかいどう はやかご',
    mask: 4,
    art: 'charm_dash',
    color: '#8a6a28',
    text: '最初の一度だけ、出目に +1 歩を加える。',
  },
];

/* ------------------------------------------------------------------ */
/* 三十六枚 錦絵大図鑑                                                 */
/* ------------------------------------------------------------------ */

function card(id, board, number, title, reading, artist, series, art, rarity, poem, description) {
  return { id, board, number, title, reading, artist, series, art, rarity, poem, description };
}

export const UKIYOE_CARDS = [
  card('tokaido_01', 0, 1, '日本橋朝市', 'にほんばし あさいち', '歌川広重', '東海道五拾三次', 'nihonbashi', '大判', '朝霧に 魚を運ぶ 日本橋', '魚河岸のにぎわいと、白魚のような朝靄。旅の始まりを告げる一枚。'),
  card('tokaido_02', 0, 2, '品川沖', 'しながわおき', '歌川広重', '東海道五拾三次', 'shinagawa', '中判', '月影や 沖の漁火 品川', '江戸湾に浮かぶ帆掛け舟と、宿場の灯りを描く夜景。'),
  card('tokaido_03', 0, 3, '鶴見弁天', 'つるみべんてん', '渓斎英泉', '木曽街道六十九次', 'tsurumi', '中判', '弁天の 社に響く 松風', '入り江の朱鳥居と松並木。英泉らしい妖艶な藍のぼかし。'),
  card('tokaido_04', 0, 4, '神奈川台', 'かながわだい', '歌川芳艶', '東海道名所図会', 'kanagawa', '大判', '夕暮れの 台より望む 富士の影', '茶屋の軒先から海越しの富士を望む、旅情あふれる一枚。'),
  card('tokaido_05', 0, 5, '程ヶ谷立場', 'ほどがやたてば', '歌川広重', '東海道五拾三次', 'hodogaya', '中判', '梅の香に 馬子の歌う 立場茶屋', '梅林の向こうに旅人と駕籠。春の宿場の柔らかな光。'),
  card('tokaido_06', 0, 6, '戸塚宿', 'とつかしゅく', '渓斎英泉', '東海道五拾三次', 'totsuka', '中判', '雨の音 駕籠の簾に 戸塚宿', '驟雨に煙る街道と、急ぎ足の旅人を描いた雨景。'),
  card('tokaido_07', 0, 7, '藤沢遊行寺', 'ふじさわゆぎょうじ', '歌川広重', '東海道五拾三次', 'fujisawa', '大判', '鐘の音 松の木立を 越えゆく', '遊行寺の大鐘と参詣の人々。夕陽の金泥が美しい。'),
  card('tokaido_08', 0, 8, '箱根芦ノ湖', 'はこね あしのこ', '歌川広重', '東海道五拾三次', 'hakone', '大判', '芦ノ湖や 富士を映して 雪の朝', '箱根の山道と芦ノ湖、雪の富士を配した壮麗な風景。'),
  card('tokaido_09', 0, 9, '京八百善', 'きょう やおぜん', '歌川芳艶', '御府内名物尽', 'kyoto', '特大判', '京の味 八百善の膳 春の宵', '上りを飾る京の名店。金屏風と朱塗りの膳がまぶしい。'),

  card('yokai_01', 1, 1, '河童', 'かっぱ', '歌川芳員', '百種怪談妖物双六', 'kappa', '大判', '川瀬に 皿を光らせ 河童待つ', '水草の陰から覗く河童。皿と甲羅の翡翠色が印象的。'),
  card('yokai_02', 1, 2, '雪女郎', 'ゆきじょろう', '歌川芳員', '百種怪談妖物双六', 'yukionna', '大判', '吹雪に 白き袖舞う 雪女郎', '夜の吹雪に溶けるような白い着物と長い黒髪。'),
  card('yokai_03', 1, 3, '猫俣', 'ねこまた', '歌川芳員', '百種怪談妖物双六', 'nekomata', '中判', '尾二つ 月に吠える 猫又', '二股の尾を持つ巨大猫。屋根瓦の上の月夜。'),
  card('yokai_04', 1, 4, '文福茶釜', 'ぶんぶくちゃがま', '歌川芳員', '百種怪談妖物双六', 'chagama', '中判', '茶釜から 狐のしっぽ のぞきけり', '毛呂山の茶釜が化かす。湯気と金の縁取り。'),
  card('yokai_05', 1, 5, '三目大僧', 'みつめだいそう', '歌川芳員', '百種怪談妖物双六', 'sanme', '大判', '三つの目 闇を睨みて 経を読む', '三つ目の巨大僧。墨の濃淡で表した迫力の妖怪画。'),
  card('yokai_06', 1, 6, '船幽霊', 'ふなゆうれい', '歌川芳員', '百種怪談妖物双六', 'funayurei', '中判', '夜の海 柄杓を渡す 船幽霊', '霧の海に浮かぶ幽霊船。柄杓を差し出す青白い手。'),
  card('yokai_07', 1, 7, '挑灯お岩', 'ちょうちんおいわ', '歌川芳員', '百種怪談妖物双六', 'oiwa', '大判', '提灯の 火に浮かび出る お岩の顔', '提灯の灯りに浮かぶ、歪んだお岩の面相。'),
  card('yokai_08', 1, 8, 'ろくろ首', 'ろくろくび', '歌川芳員', '百種怪談妖物双六', 'rokuro', '中判', '欄干を 越えて伸びたる ろくろ首', '二階の欄干から夜の庭へ伸びる長い首。'),
  card('yokai_09', 1, 9, '九尾狐', 'きゅうびのきつね', '歌川芳員', '百種怪談妖物双六', 'kyubi', '特大判', '九つの尾 月を隠して 狐舞う', '九本の尾を扇のように広げた白狐。金泥の月。'),

  card('kesshu_01', 2, 1, '楠木正成', 'くすのきまさしげ', '歌川芳虎', '英勇揃伊呂波双六', 'masashige', '大判', '忠義の 旗を掲げて 桜井', '南朝の忠臣・楠木正成。菊花の旗と大鎧。'),
  card('kesshu_02', 2, 2, '真田幸村', 'さなだゆきむら', '歌川芳虎', '英勇揃伊呂波双六', 'yukimura', '大判', '真田の 赤備え 六文銭', '真田丸の赤備え。六文銭の旗印が風に鳴る。'),
  card('kesshu_03', 2, 3, '武蔵坊弁慶', 'むさしぼうべんけい', '歌川芳虎', '英勇揃伊呂波双六', 'benkei', '大判', '五条の 橋に立ちはだかる 荒法師', '薙刀を構える弁慶。筋骨たくましい武者姿。'),
  card('kesshu_04', 2, 4, '巴御前', 'ともえごぜん', '歌川芳虎', '英勇揃伊呂波双六', 'tomoe', '大判', '弓張りて 敵陣を見据える 巴', '長弓を引く巴御前。凛々しい女性武者の姿。'),
  card('kesshu_05', 2, 5, '源義経', 'みなもとのよしつね', '歌川芳虎', '源平ふりわけ双六', 'yoshitsune', '大判', '白旗の 風に舞う 義経', '白旗を背に、扇を掲げる義経。屋島の合戦。'),
  card('kesshu_06', 2, 6, '赤糸威大鎧', 'あかいとおどし おおよろい', '歌川芳虎', '武具尽', 'oyoroi', '中判', '緋糸の 鎧に映る 篝火', '赤糸威の大鎧。兜と袖の金具が細密に描かれる。'),
  card('kesshu_07', 2, 7, '備前長船太刀', 'びぜんおさふね たち', '歌川芳虎', '武具尽', 'tachi', '中判', '刃文に 月を宿せる 太刀', '備前長船の太刀。反りと刃文の美を強調。'),
  card('kesshu_08', 2, 8, '梓弓', 'あずさゆみ', '歌川芳虎', '武具尽', 'yumi', '中判', '梓弓 弦の響き 夜を裂く', '黒漆の梓弓と矢。弓懸の繊細な紐。'),
  card('kesshu_09', 2, 9, '軍配団扇', 'ぐんばいうちわ', '歌川芳虎', '武具尽', 'gunbai', '中判', '軍配の 金の縁 勝利を呼ぶ', '金蒔絵の軍配。赤と黒の紐が躍動する。'),

  card('genji_01', 3, 1, '光源氏', 'ひかるげんじ', '歌川国芳', '源氏繪合', 'hikaru', '大判', '光る君 花の都を 歩む', '若き光源氏。狩衣と桜の庭、優雅な姿。'),
  card('genji_02', 3, 2, '紫の上', 'むらさきのうえ', '歌川国芳', '源氏繪合', 'murasaki', '大判', '紫の 袖に春風 宿りけり', '紫の上。十二単の襲色目と長い黒髪。'),
  card('genji_03', 3, 3, '夕顔', 'ゆうがお', '歌川国芳', '源氏繪合', 'yugao', '中判', '夕顔の 白き花咲く 廃屋', '夕顔の巻。蔓の白花と、物怪の気配。'),
  card('genji_04', 3, 4, '葵の上', 'あおいのうえ', '歌川国芳', '源氏繪合', 'aoi', '大判', '葵祭 車の簾に 揺れる影', '葵祭の行列。二台の車と鮮やかな葵の葉。'),
  card('genji_05', 3, 5, '六条御息所', 'ろくじょうのみやすどころ', '歌川国芳', '源氏繪合', 'rokujo', '大判', '怨みの 車に乗り移る 生霊', '六条御息所の生霊。荒れ狂う髪と車。'),
  card('genji_06', 3, 6, '末摘花', 'すえつむはな', '歌川国芳', '源氏繪合', 'suetsumuhana', '中判', '末摘花 紅の鼻を 隠して', '末摘花の姫。古びた館と紅花の庭。'),
  card('genji_07', 3, 7, '明石の君', 'あかしのきみ', '歌川国芳', '源氏繪合', 'akashi', '大判', '明石の 月に琴の音 響く', '明石の君。海辺の邸で琴を奏でる。'),
  card('genji_08', 3, 8, '玉鬘', 'たまかずら', '歌川国芳', '源氏繪合', 'tamakazura', '中判', '玉鬘の 髪結う鏡 春の朝', '玉鬘。鏡台の前の華やかな姿。'),
  card('genji_09', 3, 9, '藤壺', 'ふじつぼ', '歌川国芳', '源氏繪合', 'fujitsubo', '特大判', '藤の花 御帘の奥に 香りけり', '藤壺。御帘越しの気品ある姿と藤の花房。'),
];

export const CARD_BY_ID = Object.fromEntries(UKIYOE_CARDS.map(c => [c.id, c]));
export const CARDS_BY_BOARD = BOARDS.map((_, i) => UKIYOE_CARDS.filter(c => c.board === i));

export function getBoard(index) {
  return BOARDS[index] || BOARDS[0];
}

export function getNode(board, index) {
  return board.nodes[index] || board.nodes[board.goal];
}

export function getNextNodes(board, index) {
  const node = getNode(board, index);
  return Array.isArray(node.next) ? node.next : [];
}

export function getJumpText(node) {
  return node.jumpText || jumpRule(node.jumpTable || []);
}

export function createMatch(boardIndex, options = {}) {
  const board = getBoard(boardIndex);
  const humanSide = options.humanSide === 1 ? 1 : 0;
  const charms = Array.isArray(options.charms) ? [...new Set(options.charms)] : ['stay', 'guard', 'dash'];
  const charmMaskFor = side => {
    if (side !== humanSide) return 0;
    return charms.reduce((mask, id) => {
      const charm = CHARMS.find(c => c.id === id);
      return mask | (charm ? charm.mask : 0);
    }, 0);
  };
  return {
    boardIndex,
    pos: [board.start, board.start],
    tokens: [0, 0],
    skip: [0, 0],
    charms: [charmMaskFor(0), charmMaskFor(1)],
    charmUsed: [0, 0],
    turn: humanSide === 0 ? 0 : 1,
    humanSide,
    winner: -1,
    turnCount: 0,
    events: [],
    lastRoll: 0,
    history: [],
  };
}
