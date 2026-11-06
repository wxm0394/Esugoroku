// 江戸浮世絵・絵双六 ── 四巻の大判摺物画帖（拡張24〜27格・攻防拉鋸版）と三十六枚の錦絵札。
//
// This module is deliberately free of DOM imports so the same data can be
// consumed by the browser renderer and by Node's deterministic rules tests.

export const BOARD_W = 800;
export const BOARD_H = 640;
export const BOARD_RECT = { x: 190, y: 68, w: 800, h: 660 };

const PAD = 6;
const GAP = 5;
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

// 16 outer perimeter squares + 8 inner ring squares = 24 spiral squares + [2,2] center goal = 25 squares
const SPIRAL_24_FROM_TOP_LEFT = [
  // Outer ring (0..15)
  [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],
  [4, 1], [4, 2], [4, 3], [4, 4],
  [3, 4], [2, 4], [1, 4], [0, 4],
  [0, 3], [0, 2], [0, 1],
  // Inner ring (16..23)
  [1, 1], [2, 1], [3, 1],
  [3, 2], [3, 3],
  [2, 3], [1, 3], [1, 2],
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
/* 巻ノ壱 東海道五十三次・御府内名物道中双六（全25格・二重渦巻回廊）   */
/* ------------------------------------------------------------------ */

const TOKAIDO_NODES = [
  // Outer Ring (#0..#15)
  ['日本橋', 'にほんばし', 'nihonbashi', 'start', 0, 0, '旅の起点・日本橋'],
  ['品川宿', 'しながわ', 'shinagawa', 'normal', 0, 0, '江戸湾の帆掛け舟'],
  ['泥鰌鍋', 'どじょうなべ', 'dojo', 'jump', 2, 0, '名物・泥鰌鍋／飛 +2'],
  ['川崎宿', 'かわさき', 'kawasaki', 'normal', 0, 0, '六郷の渡し舟'],
  ['鶴見泊', 'つるみ', 'tsurumi', 'stay', 0, 1, '泊 ─ 茶屋で一休み'],
  ['神奈川宿', 'かながわ', 'kanagawa', 'normal', 0, 0, '台町の海越し富士'],
  ['程ヶ谷宿', 'ほどがや', 'hodogaya', 'normal', 0, 0, '帷子川の橋'],
  ['稲荷寿司', 'いなりずし', 'inari', 'jump', 2, 0, '名物・稲荷寿司／飛 +2'],
  ['戸塚宿', 'とつか', 'totsuka', 'normal', 0, 0, '吉田橋の立場'],
  ['藤沢泊', 'ふじさわ', 'fujisawa', 'stay', 0, 1, '泊 ─ 遊行寺門前で一休み'],
  ['平塚宿', 'ひらつか', 'hiratsuka', 'normal', 0, 0, '高麗山の縄手道'],
  ['大磯宿', 'おおいそ', 'oiso', 'normal', 0, 0, '虎ヶ雨の浜辺'],
  ['宇治茶', 'うじちゃ', 'tea', 'jump', 3, 0, '名物・宇治茶／飛 +3'],
  ['小田原宿', 'おだわら', 'odawara', 'normal', 0, 0, '酒匂川の渡し'],
  ['箱根関所', 'はこねせきしょ', 'hakone', 'jump', -2, 0, '関所改め ─ 手形確認で 2格戻る'],
  ['三島宿', 'みしま', 'mishima', 'normal', 0, 0, '三島明神の朝霧'],
  // Inner Ring (#16..#23) — High-stakes tug-of-war stretch
  ['駿河丸子宿', 'まりこ', 'nihonbashi', 'jump', 2, 0, '名物・とろろ汁／飛 +2'],
  ['大井川川止', 'おおいがわ', 'totsuka', 'stay', 0, 1, '泊 ─ 川止めで一休み'],
  ['浜松宿', 'はままつ', 'hodogaya', 'normal', 0, 0, '颯々の松風'],
  ['新居関所', 'あらいせきしょ', 'tsurumi', 'jump', -2, 0, '今切関所改め ─ 2格押し戻し'],
  ['宮の渡し', 'みやのわたし', 'shinagawa', 'jump', 2, 0, '七里の渡し舟／飛 +2'],
  ['桑名宿', 'くわな', 'kanagawa', 'normal', 0, 0, '焼き蛤の湊'],
  ['鈴鹿峠悪風', 'すずかとうげ', 'hakone', 'jump', -3, 0, '峠の向かい風 ─ 3格吹き戻し'],
  ['大津宿', 'おおつ', 'fujisawa', 'normal', 0, 0, '京目前の最終宿場'],
];

const tokaidoNodes = TOKAIDO_NODES.map((row, i) => {
  const [title, reading, art, kind, jumpDelta, stayTurns, rule] = row;
  const node = ringNode(i, SPIRAL_24_FROM_TOP_LEFT, {
    id: i,
    title,
    reading,
    art,
    kind,
    jumpDelta,
    seal: kind === 'start' ? '出' : kind === 'stay' ? '泊' : kind === 'jump' ? (jumpDelta > 0 ? '飛' : '関') : String(i).padStart(2, '0'),
    stayTurns,
    jumpTable: kind === 'jump' ? [jumpDelta, jumpDelta, jumpDelta, jumpDelta, jumpDelta, jumpDelta] : [0, 0, 0, 0, 0, 0],
    tokens: 0,
    rule: rule || '宿場を進む',
    komae: i % 3,
    palette: i % 3,
  });
  return node;
});

const tokaidoGoal = {
  id: 24,
  title: '京都・八百善大上り',
  reading: 'きょうと やおぜん おおあがり',
  art: 'kyoto',
  kind: 'goal',
  seal: '上',
  stayTurns: 0,
  jumpTable: [0, 0, 0, 0, 0, 0],
  tokens: 0,
  rule: '点数ぴったりで入上り／超過は折り返し・同格追突で相手を2格弾く',
  ...cellRect(2, 2, CELL_W, CELL_H),
  palette: 0,
};

const tokaido = {
  id: 'tokaido',
  volume: '巻ノ壱',
  volumeKanji: '壱',
  style: 'mawari',
  styleLabel: '二重廻り双六',
  title: '東海道・御府内名物道中双六',
  shortTitle: '東海道名物道中',
  artists: '歌川広重・芳艶・渓斎英泉 風',
  paper: '#f0dfb9',
  ink: '#24180f',
  accent: '#b23a2b',
  accent2: '#1f5c61',
  start: 0,
  goal: 24,
  clashPush: 2,
  bounceBack: true,
  requiredTokens: 0,
  maxTurns: 120,
  nodes: chainNext([...tokaidoNodes, tokaidoGoal], 24),
  cardIds: ['tokaido_01', 'tokaido_02', 'tokaido_03', 'tokaido_04', 'tokaido_05', 'tokaido_06', 'tokaido_07', 'tokaido_08', 'tokaido_09'],
  blurb: '外周十六宿から内周八宿へ渦巻く全二十五格。名物跳び・関所押し戻し・追突合戦を制して京・八百善へ。',
  ruleSummary: '時計回りに外周→内周へ進み、泊は一休み、関所は押し戻し。同じ格に止まると追突で相手を2格弾き飛ばす！',
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
/* 巻ノ弐 百種怪談・妖物飛び双六（全25格・百物語大迷宮組絵）           */
/* ------------------------------------------------------------------ */

const YOKAI = [
  ['河童', 'かっぱ', 'kappa', [3, 3, 3, 1, 1, -3], '【一〜三】+3飛 【四・五】+1進 【六】-3戻'],
  ['雪女郎', 'ゆきじょろう', 'yukionna', [2, 2, 2, 0, 0, -2], '【一〜三】+2飛 【四・五】止 【六】-2戻'],
  ['猫俣', 'ねこまた', 'nekomata', [2, 2, 2, 2, 0, -2], '【一〜四】+2飛 【五】止 【六】-2戻'],
  ['文福茶釜', 'ぶんぶくちゃがま', 'chagama', [1, 1, 1, 0, 0, 0], '【一〜三】+1飛 【四〜六】止'],
  ['三目大僧', 'みつめだいそう', 'sanme', [-1, -1, 2, 2, 4, 4], '【一・二】-1戻 【三・四】+2飛 【五・六】+4飛'],
  ['船幽霊', 'ふなゆうれい', 'funayurei', [-2, 0, 0, 2, 2, 2], '【一】-2戻 【二・三】止 【四〜六】+2飛'],
  ['挑灯お岩', 'ちょうちんおいわ', 'oiwa', [-3, -3, 0, 0, 2, 2], '【一・二】-3戻 【三・四】止 【五・六】+2飛'],
  ['ろくろ首', 'ろくろくび', 'rokuro', [4, 4, 2, 2, 0, -2], '【一・二】+4飛 【三・四】+2飛 【五】止 【六】-2戻'],
  ['九尾狐', 'きゅうびのきつね', 'kyubi', [1, 2, 3, 2, 1, -3], '【一〜五】+1〜+3進 【六】妖狐の祟り-3戻'],
  ['手の目', 'てのめ', 'tenome', [0, 0, -1, -1, -3, -3], '【一・二】止 【三・四】-1戻 【五・六】-3戻'],
  ['一反木綿', 'いったんもめん', 'ittan', [2, 2, 0, 0, -2, -2], '【一・二】+2飛 【三・四】止 【五・六】-2戻'],
  ['朱の盤', 'しゅのばん', 'shuban', [3, 0, 0, 1, 1, -3], '【一】+3飛 【二・三】止 【四・五】+1進 【六】-3戻'],
  ['大天狗', 'おおてんぐ', 'tengu', [4, 3, 2, 1, 0, -2], '【一】+4飛 【二】+3 【三】+2 【四】+1 【六】-2戻'],
  ['見越入道', 'みこしにゅうどう', 'mikoshi', [2, 2, 2, -2, -2, -2], '【一〜三】+2飛 【四〜六】-2戻'],
  ['濡女', 'ぬれおんな', 'nureonna', [-3, -2, -1, 0, 1, 2], '【一〜三】-3〜-1戻 【四】止 【五・六】+1〜+2進'],
  ['鉄鼠', 'てっそ', 'tesshi', [1, 1, 0, 0, -1, -2], '【一・二】+1進 【三・四】止 【五・六】-1〜-2戻'],
  // Inner 8 High-Stakes Apparition Squares (#16..#23)
  ['皿屋敷お菊', 'おきく', 'oiwa', [2, 2, -2, -2, -4, 3], '【一・二】+2飛 【三・四】-2戻 【五】-4奈落 【六】+3飛'],
  ['がしゃどくろ', 'がしゃどくろ', 'sanme', [-3, -3, 2, 2, 3, 0], '【一・二】-3戻 【三・四】+2飛 【五】+3飛 【六】止'],
  ['ぬらりひょん', 'ぬらりひょん', 'mikoshi', [0, 0, 2, 2, -2, -3], '【一・二】座敷居座り止 【三・四】+2飛 【五・六】-2〜-3戻'],
  ['絡新婦', 'じょろうぐも', 'yukionna', [-2, -2, -3, 2, 2, 3], '【一〜三】蜘蛛の巣-2〜-3戻 【四〜六】+2〜+3飛'],
  ['天邪鬼', 'あまのじゃく', 'tengu', [-3, -2, -1, 1, 2, 3], '【一〜三】逆風-3〜-1戻 【四〜六】順風+1〜+3飛'],
  ['百目鬼', 'どうめき', 'tenome', [2, 2, 0, -2, -3, -4], '【一・二】+2飛 【三】止 【四〜六】凝視-2〜-4戻'],
  ['陰摩羅鬼', 'おんもらき', 'funayurei', [2, 1, 0, -1, -2, -3], '【一・二】+2〜+1進 【三】止 【四〜六】怪鳥-1〜-3戻'],
  ['逢魔が時', 'おうまがとき', 'kyubi', [1, 0, 0, -2, -3, -4], '【一】大団円へ+1進 【二・三】止 【四〜六】逢魔が時-2〜-4戻'],
];

// 24 interlocking large and small prints arranged around the 5x5 spiral so every print is large and legible
const YOKAI_COLLAGE = SPIRAL_24_FROM_TOP_LEFT.map(([col, row], i) => {
  const isBig = i % 3 === 0;
  const base = cellRect(col, row);
  return {
    x: base.x + (isBig ? -4 : 6),
    y: base.y + (isBig ? -4 : 6),
    w: isBig ? base.w + 8 : base.w - 20,
    h: isBig ? base.h + 8 : base.h - 20,
    big: isBig,
  };
});

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
  id: 24,
  title: '百物語大団円・上り',
  reading: 'ひゃくものがたり だいだんえん',
  art: 'hyakumonogatari',
  kind: 'goal',
  seal: '上',
  stayTurns: 0,
  jumpTable: [0, 0, 0, 0, 0, 0],
  jumpText: '二十四の怪異をすべて乗り越え、大団円へ。',
  tokens: 0,
  rule: '百物語の灯を消さず、大団円へ上がる',
  ...cellRect(2, 2, CELL_W + 6, CELL_H + 6, -3, -3),
  palette: 3,
};

const yokai = {
  id: 'yokai',
  volume: '巻ノ弐',
  volumeKanji: '弐',
  style: 'tobi',
  styleLabel: '大迷宮・飛び双六',
  title: '百種怪談・妖物飛び双六',
  shortTitle: '百種怪談妖物',
  artists: '歌川芳員 1858『百種怪談妖物双六』風',
  paper: '#d9cdb0',
  ink: '#1c1b1a',
  accent: '#7d1f31',
  accent2: '#305b60',
  start: 0,
  goal: 24,
  clashPush: 2,
  bounceBack: false,
  requiredTokens: 0,
  maxTurns: 140,
  nodes: chainNext([...yokaiNodes, yokaiGoal], 24),
  cardIds: ['yokai_01', 'yokai_02', 'yokai_03', 'yokai_04', 'yokai_05', 'yokai_06', 'yokai_07', 'yokai_08', 'yokai_09'],
  blurb: '全二十五格の百鬼夜行大迷宮。出目1〜6の飛び先と逆戻り怪異、青行灯全滅の倍跳びで激しい逆転劇が展開する。',
  ruleSummary: '妖怪格に止まったら出目1〜6の短冊に従って前進・後退。青行灯消滅で飛距離2倍、同格追突で相手を2格弾く！',
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
/* 巻ノ参 英勇揃伊呂波・誠忠義士双六（全24格・源平合戦攻防陣）         */
/* ------------------------------------------------------------------ */

const IROHA = [
  'い', 'ろ', 'は', 'に', 'ほ', 'へ', 'と', 'ち',
  'り', 'ぬ', 'る', 'を', 'わ', 'か', 'よ', 'た',
  'れ', 'そ', 'つ', 'ね', 'な', 'ら', 'む', 'う',
];

const KESSHU_TITLES = [
  ['出陣', 'しゅつじん', 'shutsujin', 'start', 0, 0, '源平合戦・本陣より出陣'],
  ['槍隊', 'やりたい', 'yari', 'normal', 0, 0, '長柄槍の先鋒隊'],
  ['弓隊', 'ゆみたい', 'yumi', 'normal', 0, 0, '梓弓の斉射陣'],
  ['兜', 'かぶと', 'kabuto', 'token', 0, 0, '討入備え「兜」を得る'],
  ['軍議', 'ぐんぎ', 'gungi', 'normal', 0, 0, '本陣の軍配団扇'],
  ['大鎧', 'おおよろい', 'oyoroi', 'jump', 2, 0, '赤糸威の突撃／飛 +2'],
  ['一騎討', 'いっきうち', 'ikkit', 'normal', 0, 0, '五条大橋の一騎討'],
  ['太刀', 'たち', 'tachi', 'token', 0, 0, '討入備え「太刀」を得る'],
  ['伏兵奇襲', 'ふくへい', 'shinobi', 'jump', -2, 0, '敵伏兵の奇襲 ─ 2格退却'],
  ['義士盟約', 'ぎしめいやく', 'meiyaku', 'normal', 0, 0, '連判状の血判'],
  ['陣太鼓', 'じんだいこ', 'jindaiko', 'token', 0, 0, '討入備え「陣太鼓」を得る'],
  ['兵糧攻め', 'ひょうろう', 'tekijin', 'stay', 0, 1, '泊 ─ 兵糧補給で一休み'],
  ['早馬伝令', 'はやうま', 'yukimura', 'jump', 2, 0, '早馬の急報／飛 +2'],
  ['敵陣鉄砲', 'てっぽうたい', 'tekijin', 'jump', -3, 0, '鉄砲隊の弾幕 ─ 3格押し戻し'],
  ['忍び間者', 'しのび', 'shinobi', 'normal', 0, 0, '夜陰の城壁潜入'],
  ['予備兜陣', 'よびかぶと', 'kabuto', 'token', 0, 0, '討入備え「兜」を得る（予備陣）'],
  ['予備太刀陣', 'よびたち', 'tachi', 'token', 0, 0, '討入備え「太刀」を得る（予備陣）'],
  ['城門突破', 'じょうもん', 'masashige', 'jump', 2, 0, '大槌で城門突破／飛 +2'],
  ['予備太鼓陣', 'よびたいこ', 'jindaiko', 'token', 0, 0, '討入備え「陣太鼓」を得る（予備陣）'],
  ['本陣守備隊', 'ほんじん', 'benkei', 'stay', 0, 1, '泊 ─ 弁慶の立往生で一休み'],
  ['決死突撃', 'けっし', 'kesshi', 'normal', 0, 0, '白旗の決死行'],
  ['御前関門', 'ごぜんかんもん', 'agarimae', 'jump', -2, 0, '御前親衛隊 ─ 2格押し戻し'],
  ['上り前', 'あがりまえ', 'kachidoki', 'normal', 0, 0, '勝鬨を上げて御前へ'],
  ['上り', 'あがり', 'agari', 'goal', 0, 0, '三備えを揃えて御前大上り'],
];

// 24 cards arranged in a serpentine 4-row battlefield:
// #0 (bottom-right army card 245x165) -> row 3 -> row 2 -> row 1 -> row 0 -> #23 (top-left army card 245x165)
const KESSHU_RECTS = [
  // Row 3 (bottom, right to left): #0 is large start card, then #1..#4
  { x: 548, y: 462, w: 245, h: 172 }, // #0 出陣
  { x: 408, y: 492, w: 132, h: 134 }, // #1
  { x: 274, y: 492, w: 130, h: 134 }, // #2
  { x: 140, y: 492, w: 130, h: 134 }, // #3 兜
  { x: 6,   y: 492, w: 130, h: 134 }, // #4
  // Row 2 (left to right): #5..#10
  { x: 6,   y: 336, w: 128, h: 136 }, // #5
  { x: 138, y: 336, w: 128, h: 136 }, // #6
  { x: 270, y: 336, w: 128, h: 136 }, // #7 太刀
  { x: 402, y: 336, w: 128, h: 136 }, // #8
  { x: 534, y: 336, w: 128, h: 136 }, // #9
  { x: 666, y: 316, w: 128, h: 136 }, // #10 陣太鼓
  // Row 1 (right to left): #11..#17
  { x: 666, y: 170, w: 128, h: 134 }, // #11
  { x: 534, y: 178, w: 128, h: 134 }, // #12
  { x: 402, y: 178, w: 128, h: 134 }, // #13
  { x: 270, y: 178, w: 128, h: 134 }, // #14
  { x: 138, y: 184, w: 128, h: 134 }, // #15
  { x: 6,   y: 184, w: 128, h: 134 }, // #16
  // Row 0 (top row y=12, 6 warrior cards #17..#22 leading into #23 top-left Goal):
  { x: 704, y: 12,  w: 88,  h: 150 }, // #17 城門突破
  { x: 614, y: 12,  w: 86,  h: 150 }, // #18 予備太鼓陣
  { x: 524, y: 12,  w: 86,  h: 150 }, // #19 本陣守備隊
  { x: 434, y: 12,  w: 86,  h: 150 }, // #20 決死突撃
  { x: 344, y: 12,  w: 86,  h: 150 }, // #21 御前関門
  { x: 254, y: 12,  w: 86,  h: 150 }, // #22 上り前
  { x: 6,   y: 6,   w: 244, h: 172 }, // #23 上り (upper-left large card)
];

const KESSHU_TILTS = [
  -6, -4, 2, 6, 8, -3, 4, -6, 2, 7, -4, 5,
  -5, 8, -2, 3, -7, 6, -3, 5, -4, 7, 1, -1,
];

const kesshuNodes = KESSHU_TITLES.map((row, i) => {
  const [title, reading, art, kind, jumpDelta, stayTurns, customRule] = row;
  const isHelm = title.includes('兜');
  const isSword = title.includes('太刀');
  const tokenBits = kind === 'token' ? (isHelm ? 1 : isSword ? 2 : 4) : 0;
  const tokenName = isHelm ? '兜' : isSword ? '太刀' : kind === 'token' ? '陣太鼓' : '';
  return {
    id: i,
    title,
    reading,
    art,
    kind,
    seal: kind === 'goal' ? '上' : kind === 'token' ? '備' : kind === 'stay' ? '泊' : kind === 'jump' ? (jumpDelta > 0 ? '突' : '奇') : IROHA[i],
    iroha: IROHA[i],
    stayTurns: stayTurns || 0,
    jumpTable: jumpDelta ? [jumpDelta, jumpDelta, jumpDelta, jumpDelta, jumpDelta, jumpDelta] : [0, 0, 0, 0, 0, 0],
    tokens: tokenBits,
    tokenLabel: tokenName,
    rule: customRule,
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
  styleLabel: '合戦・備え集結双六',
  title: '英勇揃伊呂波・誠忠義士双六',
  shortTitle: '英勇揃伊呂波',
  artists: '歌川芳虎『英勇揃伊呂波双六』・『源平ふりわけ双六』風',
  paper: '#e9d6ad',
  ink: '#1d1712',
  accent: '#9a2924',
  accent2: '#3c5d45',
  start: 0,
  goal: 23,
  clashPush: 3,
  stealTokenOnDuel: true,
  bounceBack: false,
  requiredTokens: 3,
  maxTurns: 150,
  nodes: chainNext(kesshuNodes, 23),
  cardIds: ['kesshu_01', 'kesshu_02', 'kesshu_03', 'kesshu_04', 'kesshu_05', 'kesshu_06', 'kesshu_07', 'kesshu_08', 'kesshu_09'],
  blurb: '全二十四格の合戦陣。三備え（兜・太刀・陣太鼓）を集め、一騎討ちで相手を3格弾き飛ばし＆武具奪取を狙う白熱の攻防戦！',
  ruleSummary: '三備えを揃えて上りへ。同じ格で一騎討ちになると相手を3格弾き飛ばし、相手が持つ未所持の武具印を1つ奪取する！',
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
/* 巻ノ肆 善悪道中・源氏絵合出世双六（全27格・善悪二道長編絵巻）       */
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

const GENJI_STRIP_RECTS = [
  { x: 705, y: 506, w: 70, h: 126 },
  { x: 580, y: 506, w: 70, h: 126 },
  { x: 455, y: 506, w: 70, h: 126 },
  { x: 330, y: 506, w: 70, h: 126 },
  { x: 205, y: 506, w: 70, h: 126 },
  { x: 80,  y: 506, w: 70, h: 126 },
  { x: 8,   y: 310, w: 70, h: 126 },
  { x: 8,   y: 170, w: 70, h: 126 },
  { x: 80,  y: 8,   w: 70, h: 126 },
  { x: 205, y: 8,   w: 70, h: 126 },
  { x: 330, y: 8,   w: 70, h: 126 },
  { x: 455, y: 8,   w: 70, h: 126 },
  { x: 580, y: 8,   w: 70, h: 126 },
  { x: 705, y: 8,   w: 70, h: 126 },
  { x: 722, y: 170, w: 70, h: 126 },
  { x: 722, y: 310, w: 70, h: 126 },
];
const GENJI_BERO = ['#5383a6', '#e8b954', '#e09879', '#b8b6a8'];

const genjiOuterNodes = GENJI_OUTER.map((row, i) => {
  const [title, reading, art] = row;
  const isStay = i === 5 || i === 11; // 末摘花 & 須磨謫居
  const isJump = i === 4 || i === 12; // 若紫 (+2) & 明石 (+2)
  const isTrap = i === 8 || i === 14; // 葵車争い (-2) & 蓬生荒廃 (-2)
  return {
    id: i,
    title,
    reading,
    art,
    kind: i === 0 ? 'start' : i === 15 ? 'branch' : isStay ? 'stay' : (isJump || isTrap) ? 'jump' : 'normal',
    seal: i === 15 ? '岐' : isStay ? '泊' : isJump ? '飛' : isTrap ? '祟' : String(i + 1).padStart(2, '0'),
    stayTurns: isStay ? 1 : 0,
    jumpTable: isJump ? [2, 2, 2, 2, 2, 2] : isTrap ? [-2, -2, -2, -2, -2, -2] : [0, 0, 0, 0, 0, 0],
    tokens: 0,
    rule: i === 15
      ? '善悪の分かれ道 ─ 偶数は善道、奇数は悪道へ分岐'
      : isStay
        ? `泊 ─ ${title}の宿で一休み`
        : isJump
          ? `雅の追い風 ─ 2格進む`
          : isTrap
            ? `物怪の障り ─ 2格引き戻される`
            : '源氏物語の短冊を進む',
    ...GENJI_STRIP_RECTS[i],
    color: GENJI_BERO[i % 4],
    palette: i % 4,
    stripColor: GENJI_BERO[i % 4],
    waka: ['桐壺の露', '帚木の風', '空蝉の殻', '夕顔の灯', '若紫の野', '末摘花の袖', '紅葉の賀', '花宴の月', '葵の祭', '賢木の榊', '花散里の宿', '須磨の浦', '明石の月', '澪標の契', '蓬生の庭', '関屋の関'][i],
  };
});

// 5 Golden Good Track squares (#16..#20)
const goodNodes = [
  ['絵合', 'えあわせ', 'eawase', [2, 2, 2, 2, 2, 2], 0, '善玉出世道 ─ 連跳 +2'],
  ['松風', 'まつかぜ', 'matsukaze', [0, 0, 0, 0, 0, 0], 0, '善玉出世道 ─ 琴の追い風'],
  ['薄雲', 'うすぐも', 'usugumo', [0, 0, 0, 0, 0, 0], 0, '善玉出世道 ─ 春の御殿'],
  ['初音', 'はつね', 'hikaru', [1, 1, 1, 0, 0, -2], 0, '善玉試練 ─ 六の目は慢心で2格戻る'],
  ['胡蝶', 'こちょう', 'murasaki', [0, 0, 0, 0, 0, 0], 0, '善玉出世道 ─ 龍頭鷁首の船楽'],
].map((row, i) => {
  const [title, reading, art, jumpTable, stayTurns, rule] = row;
  return {
    id: 16 + i,
    title,
    reading,
    art,
    kind: 'good',
    seal: '善',
    stayTurns,
    jumpTable,
    tokens: 0,
    rule,
    x: [596, 480, 364, 248, 132][i],
    y: 162,
    w: 108,
    h: 98,
    color: '#b48b31',
    palette: 1,
    waka: ['絵合の扇', '松風の音', '薄雲の月', '初音の鶯', '胡蝶の舞'][i],
  };
});

// 5 Purple Evil Track squares (#21..#25)
const evilNodes = [
  ['朝顔', 'あさがお', 'asagao', [0, 0, 0, 0, 0, 0], 1, '悪玉修羅道 ─ 泥舟・一休み'],
  ['少女', 'おとめ', 'otome', [0, 0, 0, 0, 0, 0], 2, '悪玉修羅道 ─ 心学戒律・二休み'],
  ['玉鬘', 'たまかずら', 'tamakazura', [-2, -2, -2, -2, -2, -2], 0, '悪玉修羅道 ─ 祟り・二格戻る'],
  ['常夏', 'とこなつ', 'rokujo', [2, 2, 0, 0, -1, -2], 0, '悪玉修羅道 ─ 一・二は改心+2、五・六は怨念戻る'],
  ['野分', 'のわき', 'fujitsubo', [-3, -2, 0, 0, 1, 1], 0, '悪玉修羅道 ─ 野分の嵐で押し戻される'],
].map((row, i) => {
  const [title, reading, art, jumpTable, stayTurns, rule] = row;
  return {
    id: 21 + i,
    title,
    reading,
    art,
    kind: 'evil',
    seal: '悪',
    stayTurns,
    jumpTable,
    tokens: 0,
    rule,
    x: [596, 480, 364, 248, 132][i],
    y: 386,
    w: 108,
    h: 98,
    color: '#3b2342',
    palette: 2,
    waka: ['朝顔の露', '少女の袖', '玉鬘の髪', '常夏の撫子', '野分の風'][i],
  };
});

const genjiGoal = {
  id: 26,
  title: '源氏絵合・上り',
  reading: 'げんじ えあわせ あがり',
  art: 'genji',
  kind: 'goal',
  seal: '上',
  stayTurns: 0,
  jumpTable: [0, 0, 0, 0, 0, 0],
  tokens: 0,
  rule: '金地御帘の前で絵合を結ぶ（同格追突は相手を2格弾く）',
  x: 290, y: 284, w: 230, h: 86,
  color: '#aa8a3a',
  palette: 0,
};

const genjiNodes = [...genjiOuterNodes, ...goodNodes, ...evilNodes, genjiGoal].map(n => ({ ...n }));
for (let i = 0; i < 15; i++) {
  genjiNodes[i].next = [i + 1];
  genjiNodes[i].prev = i > 0 ? i - 1 : -1;
}
genjiNodes[15].prev = 14;
genjiNodes[15].next = [16, 21]; // Even -> #16 (Good), Odd -> #21 (Evil)

// Good track #16..#20 -> #26
for (let i = 16; i <= 20; i++) {
  genjiNodes[i].prev = i === 16 ? 15 : i - 1;
  genjiNodes[i].next = [i === 20 ? 26 : i + 1];
}
// Evil track #21..#25 -> #26
for (let i = 21; i <= 25; i++) {
  genjiNodes[i].prev = i === 21 ? 15 : i - 1;
  genjiNodes[i].next = [i === 25 ? 26 : i + 1];
}
genjiNodes[26].prev = 20;
genjiNodes[26].next = [];

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
  goal: 26,
  clashPush: 2,
  bounceBack: false,
  requiredTokens: 0,
  maxTurns: 150,
  nodes: genjiNodes,
  cardIds: ['genji_01', 'genji_02', 'genji_03', 'genji_04', 'genji_05', 'genji_06', 'genji_07', 'genji_08', 'genji_09'],
  blurb: '外周十六帖と善悪五帖ずつ計二十七格の王朝長編双六。物怪の引き戻しや慢心の試練、追突合戦を経て源氏絵合の上りを目指す。',
  ruleSummary: '関屋（#15）で偶なら善道五帖、奇なら悪道五帖へ分岐。道中の物怪や野分の嵐、同格追突（2格弾き）で激しい攻防が続く！',
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

// Decorate all board nodes with composable features[], progressValue, gourmetBit, and lanternBit
const TOKAIDO_GOURMET_BITS = { 2: 1, 7: 2, 12: 4 };
for (const n of tokaido.nodes) {
  const feats = [];
  if (n.kind === 'start') feats.push('start');
  if (n.kind === 'goal') feats.push('goal');
  if ((n.stayTurns | 0) > 0) feats.push('stay');
  if ((n.jumpDelta | 0) !== 0) feats.push(n.jumpDelta < 0 ? 'checkpoint' : 'jump');
  if (TOKAIDO_GOURMET_BITS[n.id]) {
    n.gourmetBit = TOKAIDO_GOURMET_BITS[n.id];
    feats.push('gourmet');
  }
  n.features = feats;
  n.progressValue = n.id;
}

const YOKAI_LANTERN_BITS = { 4: 1, 10: 2, 16: 4, 22: 8 };
for (const n of yokai.nodes) {
  const feats = [];
  if (n.kind === 'start') feats.push('start');
  else if (n.kind === 'goal') feats.push('goal');
  else feats.push('jump');
  if (YOKAI_LANTERN_BITS[n.id]) {
    n.lanternBit = YOKAI_LANTERN_BITS[n.id];
    feats.push('lantern');
  }
  n.features = feats;
  n.progressValue = n.id;
}

for (const n of kesshu.nodes) {
  const feats = [];
  if (n.kind === 'start') feats.push('start');
  if (n.kind === 'goal') feats.push('goal');
  if ((n.tokens | 0) !== 0) feats.push('token');
  if ((n.stayTurns | 0) > 0) feats.push('stay');
  if (Array.isArray(n.jumpTable) && n.jumpTable.some(v => v !== 0)) feats.push('jump');
  n.features = feats;
  n.progressValue = n.id;
}

for (const n of genji.nodes) {
  const feats = [];
  if (n.kind === 'start') feats.push('start');
  if (n.kind === 'goal') feats.push('goal');
  if (n.kind === 'branch') {
    feats.push('branch');
    n.choice = { type: 'genji_branch', options: ['good', 'evil'] };
  }
  if (n.kind === 'good') feats.push('good');
  if (n.kind === 'evil') {
    feats.push('evil');
    n.grudgeBit = 1 << (n.id - 21);
  }
  if ((n.stayTurns | 0) > 0) feats.push('stay');
  if (Array.isArray(n.jumpTable) && n.jumpTable.some(v => v !== 0)) feats.push('jump');
  n.features = feats;
  // Normalize progressValue so both 5-node branch tracks (#16..#20 and #21..#25) have equal route progress 16..20 -> goal 21
  if (n.id <= 15) n.progressValue = n.id;
  else if (n.id >= 16 && n.id <= 20) n.progressValue = n.id;
  else if (n.id >= 21 && n.id <= 25) n.progressValue = n.id - 5;
  else n.progressValue = 21;
}

/* ------------------------------------------------------------------ */
/* 懐中守り札（V1.2 全十二種・開幕三種選択）                            */
/* ------------------------------------------------------------------ */

export const MAX_EQUIPPED_CHARMS = 3;
export const DEFAULT_CHARM_IDS = Object.freeze(['stay', 'guard', 'dash']);

export const CHARMS = [
  {
    id: 'stay',
    name: '宿場守り',
    kanji: '宿',
    yomi: 'しゅくばまもり',
    category: 'defense',
    timing: 'on_landing',
    cooldownTurns: 4,
    oncePerMatch: false,
    boardId: null,
    mask: 1,
    art: 'charm_stay',
    color: '#9c3a2a',
    shortDesc: '「泊」休みを無効化',
    text: '「泊」の一休みを無効にし、自身の4手番ごとに再充填される。',
  },
  {
    id: 'guard',
    name: '妖怪封じ',
    kanji: '封',
    yomi: 'ようかいふうじ',
    category: 'defense',
    timing: 'on_landing',
    cooldownTurns: 4,
    oncePerMatch: false,
    boardId: null,
    mask: 2,
    art: 'charm_guard',
    color: '#315e68',
    shortDesc: '後ろ戻り跳びを無効化',
    text: '関所や妖怪の「戻る」負向跳びを封じ、自身の4手番ごとに再充填される。',
  },
  {
    id: 'dash',
    name: '東海道早駕籠',
    kanji: '駆',
    yomi: 'とうかいどう はやかご',
    category: 'move',
    timing: 'pre_move',
    cooldownTurns: 4,
    oncePerMatch: false,
    boardId: null,
    mask: 4,
    art: 'charm_dash',
    color: '#8a6a28',
    shortDesc: '出目を＋1歩加速',
    text: '移動時に出目へ +1 歩を加え、自身の4手番ごとに再充填される（風行符と同手番重複不可）。',
  },
  {
    id: 'reroll',
    name: '重骰符',
    kanji: '重',
    yomi: 'ちょうとうふ',
    category: 'rng',
    timing: 'post_roll',
    cooldownTurns: 0,
    oncePerMatch: true,
    boardId: null,
    mask: 8,
    art: 'charm_reroll',
    color: '#7a3b69',
    shortDesc: '賽を1回振り直す（1局1回）',
    text: '賽を振った直後・移動前に1度だけ振り直せる（新しい出目を必ず採用・1局1回限り）。',
  },
  {
    id: 'decoy',
    name: '替身符',
    kanji: '替',
    yomi: 'みがわりふ',
    category: 'defense',
    timing: 'on_defend',
    cooldownTurns: 4,
    oncePerMatch: false,
    boardId: null,
    mask: 16,
    art: 'charm_decoy',
    color: '#3d5a45',
    shortDesc: '同格弾き・武具奪取・奇襲を無効化',
    text: '同格衝突の撃退および武具奪取、または相手の辻風奇襲を1回無効化する（4手番冷却）。',
  },
  {
    id: 'counter',
    name: '反撃符',
    kanji: '反',
    yomi: 'はんげきふ',
    category: 'counter',
    timing: 'on_defend',
    cooldownTurns: 4,
    oncePerMatch: false,
    boardId: null,
    mask: 32,
    art: 'charm_counter',
    color: '#a33327',
    shortDesc: '被追突時に相手を1格押し返す',
    text: '同格追突を受けた際、攻撃してきた相手を1格後ろへ押し返す（充能ごとに1回発動）。',
  },
  {
    id: 'wind',
    name: '風行符',
    kanji: '風',
    yomi: 'ふうこうふ',
    category: 'move',
    timing: 'pre_roll',
    cooldownTurns: 5,
    oncePerMatch: false,
    boardId: null,
    mask: 64,
    art: 'charm_wind',
    color: '#266478',
    shortDesc: '宣言で今回移動＋2歩（早駕籠重複不可）',
    text: '賽を振る前に宣言して使用すると今回の移動が +2 歩になる（早駕籠と同手番には重ならない）。',
  },
  {
    id: 'purify',
    name: '浄心符',
    kanji: '浄',
    yomi: 'じょうしんふ',
    category: 'defense',
    timing: 'on_landing',
    cooldownTurns: 4,
    oncePerMatch: false,
    boardId: null,
    mask: 128,
    art: 'charm_purify',
    color: '#5a4b82',
    shortDesc: '泊休みまたは負向跳びのどちらか1回解消',
    text: '着地時の「泊休み」または「負向跳び」のいずれか発生した方を1回打ち消す万能厄除け符。',
  },
  {
    id: 'tokaido_pass',
    name: '東海道旅券',
    kanji: '旅',
    yomi: 'とうかいどう りょけん',
    category: 'volume',
    timing: 'passive_start',
    cooldownTurns: 0,
    oncePerMatch: true,
    boardId: 'tokaido',
    mask: 256,
    art: 'charm_tokaido_pass',
    color: '#b86928',
    shortDesc: '【東海道専用】開幕旅銭2枚獲得',
    text: '東海道画帖専用。対局開始時に「旅銭」を2枚得て出発し、泊休み免除や関所戻りの帳消しに使える。',
  },
  {
    id: 'andon_ward',
    name: '青行灯守',
    kanji: '灯',
    yomi: 'あおあんどんまもり',
    category: 'volume',
    timing: 'on_frenzy',
    cooldownTurns: 0,
    oncePerMatch: true,
    boardId: 'yokai',
    mask: 512,
    art: 'charm_andon_ward',
    color: '#256c65',
    shortDesc: '【百物語専用】百鬼夜行が3倍跳びに強化',
    text: '百種怪談専用。四つの青行灯を灯した後の次回正向怪異ジャンプ倍率を2倍→3倍へ引き上げる（1局1回）。',
  },
  {
    id: 'gunbai_seal',
    name: '旗本軍配',
    kanji: '軍',
    yomi: 'はたもとぐんばい',
    category: 'volume',
    timing: 'on_defend',
    cooldownTurns: 0,
    oncePerMatch: true,
    boardId: 'kesshu',
    mask: 1024,
    art: 'charm_gunbai_seal',
    color: '#8c2323',
    shortDesc: '【英勇揃専用】最初の武具奪取を完全防御',
    text: '英勇揃専用。一騎討ちで最初に武具を奪われそうになった際、武具奪取を完全に防いで消費される。',
  },
  {
    id: 'waka_slip',
    name: '和歌短冊',
    kanji: '歌',
    yomi: 'わかたんざく',
    category: 'volume',
    timing: 'on_branch',
    cooldownTurns: 0,
    oncePerMatch: false,
    boardId: 'genji',
    mask: 2048,
    art: 'charm_waka_slip',
    color: '#7a5228',
    shortDesc: '【源氏専用】善悪分岐の先読みと自由選択',
    text: '源氏絵合専用。関屋（#15）の善悪分岐にて両道の危険・恩恵摘要を先読みし、任意の道を自在に選べる。',
  },
];

for (const c of CHARMS) {
  c.bit = c.mask;
  c.icon = c.kanji;
  c.effect = c.shortDesc;
  c.cooldown = c.cooldownTurns;
  c.trigger = (c.timing === 'pre_roll' || c.timing === 'post_roll' || c.timing === 'on_branch') ? 'active' : 'passive';
}

export const CHARM_BY_ID = Object.fromEntries(CHARMS.map(c => [c.id, c]));

/* ------------------------------------------------------------------ */
/* 三十六枚 錦絵大図鑑 ＆ 自定义手札（初期Buff）大系                     */
/* ------------------------------------------------------------------ */

export const HAND_CARD_BUFF_ARCHETYPES = {
  headstart: {
    kind: 'headstart',
    seal: '先',
    name: '先駆出立の加護',
    shortDesc: '開幕+2格前進・初手出目+1歩',
    detail: '対局開始時に振出から2格先（#2）より出立し、最初の賽振りでも+1歩加速する先手必勝の初期Buff。',
    color: '#bf3426',
    startPosBonus: 2,
    firstRollBonus: 1,
    jumpBonus: 0,
    duelPushBonus: 0,
    duelAdvance: 0,
    initialTokens: 0,
    strikePullBonus: 0,
    strikeCooldown: 4,
    rechargePeriod: 8,
  },
  first_dash: {
    kind: 'first_dash',
    seal: '駿',
    name: '駿足飛脚の加護',
    shortDesc: '初手+2歩加速・前進跳び+1格',
    detail: '最初の賽振りで一挙に+2歩加速し、道中のあらゆる前進「跳」マスの飛距離を常時+1格強化する初期Buff。',
    color: '#2b6e52',
    startPosBonus: 0,
    firstRollBonus: 2,
    jumpBonus: 1,
    duelPushBonus: 0,
    duelAdvance: 0,
    initialTokens: 0,
    strikePullBonus: 0,
    strikeCooldown: 4,
    rechargePeriod: 8,
  },
  duel_master: {
    kind: 'duel_master',
    seal: '武',
    name: '荒武者追突の加護',
    shortDesc: '追突弾き+2格・合戦勝利で+1前進',
    detail: '同じマスでの追突・一騎討ち時に相手をさらに+2格深く弾き飛ばし、自駒は勢いに乗って+1格前進する初期Buff。',
    color: '#9b291d',
    startPosBonus: 0,
    firstRollBonus: 1,
    jumpBonus: 0,
    duelPushBonus: 2,
    duelAdvance: 1,
    initialTokens: 0,
    strikePullBonus: 0,
    strikeCooldown: 4,
    rechargePeriod: 8,
  },
  regalia_boon: {
    kind: 'regalia_boon',
    seal: '宝',
    name: '秘蔵名物・武具の加護',
    shortDesc: '開幕時に備え印1つ所持・初手+1歩',
    detail: '対局開始時から武具印（兜）または宿場名物を1つ携行した状態で始まり、初手も+1歩加速する戦略初期Buff。',
    color: '#b07f24',
    startPosBonus: 0,
    firstRollBonus: 1,
    jumpBonus: 0,
    duelPushBonus: 0,
    duelAdvance: 0,
    initialTokens: 1,
    strikePullBonus: 0,
    strikeCooldown: 4,
    rechargePeriod: 8,
  },
  gale_tactician: {
    kind: 'gale_tactician',
    seal: '風',
    name: '神通辻風の加護',
    shortDesc: '辻風奇襲3格戻し＆CD2手・開幕+1格',
    detail: '開幕+1格前進に加え、「辻風奇襲」の引き戻し距離を3格へ強化し、再充填ターンも4手→2手へ短縮する初期Buff。',
    color: '#2d5c78',
    startPosBonus: 1,
    firstRollBonus: 0,
    jumpBonus: 0,
    duelPushBonus: 0,
    duelAdvance: 0,
    initialTokens: 0,
    strikePullBonus: 1,
    strikeCooldown: 2,
    rechargePeriod: 8,
  },
  eternal_talisman: {
    kind: 'eternal_talisman',
    seal: '雅',
    name: '瑞兆護符の加護',
    shortDesc: '護符再充填2倍速(2手)・開幕+1格＆初手+1歩',
    detail: '開幕+1格・初手+1歩に加え、消費した懐中守札の再充填周期を半減させる持久戦初期Buff。',
    color: '#6e3a7a',
    startPosBonus: 1,
    firstRollBonus: 1,
    jumpBonus: 0,
    duelPushBonus: 0,
    duelAdvance: 0,
    initialTokens: 0,
    strikePullBonus: 0,
    strikeCooldown: 4,
    rechargePeriod: 4,
  },
};

const CARD_BUFF_ASSIGNMENTS = {
  tokaido_01: 'headstart',
  tokaido_02: 'first_dash',
  tokaido_03: 'duel_master',
  tokaido_04: 'headstart',
  tokaido_05: 'first_dash',
  tokaido_06: 'first_dash',
  tokaido_07: 'regalia_boon',
  tokaido_08: 'headstart',
  tokaido_09: 'regalia_boon',

  yokai_01: 'gale_tactician',
  yokai_02: 'gale_tactician',
  yokai_03: 'first_dash',
  yokai_04: 'eternal_talisman',
  yokai_05: 'duel_master',
  yokai_06: 'gale_tactician',
  yokai_07: 'gale_tactician',
  yokai_08: 'gale_tactician',
  yokai_09: 'gale_tactician',

  kesshu_01: 'duel_master',
  kesshu_02: 'duel_master',
  kesshu_03: 'duel_master',
  kesshu_04: 'duel_master',
  kesshu_05: 'first_dash',
  kesshu_06: 'regalia_boon',
  kesshu_07: 'regalia_boon',
  kesshu_08: 'regalia_boon',
  kesshu_09: 'regalia_boon',

  genji_01: 'headstart',
  genji_02: 'eternal_talisman',
  genji_03: 'eternal_talisman',
  genji_04: 'headstart',
  genji_05: 'gale_tactician',
  genji_06: 'eternal_talisman',
  genji_07: 'headstart',
  genji_08: 'first_dash',
  genji_09: 'eternal_talisman',
};

const UNLOCK_TIERS = {
  1: { type: 'starter', label: '初期開帳（新手引導）' },
  2: { type: 'starter', label: '初期開帳（新手引導）' },
  3: { type: 'starter', label: '初期開帳（新手引導）' },
  4: { type: 'complete_board', label: 'この画帖を初めて完走する' },
  5: { type: 'beat_normal_ai', label: 'この画帖で普通以上の相手に勝利する' },
  6: { type: 'volume_mechanic', label: 'この画帖の固有戦術目標を達成する' },
  7: { type: 'veteran_goal', label: 'この画帖で累計2勝または追突合戦2回を達成' },
  8: { type: 'beat_hard_ai', label: '困難AIに勝利、または護符なしで勝利する' },
  9: { type: 'master_challenge', label: '大師AIに勝利、または36手以内に大上りする' },
};

function card(id, board, number, title, reading, artist, series, art, rarity, poem, description) {
  const buffKey = CARD_BUFF_ASSIGNMENTS[id] || 'headstart';
  const archetype = HAND_CARD_BUFF_ARCHETYPES[buffKey] || HAND_CARD_BUFF_ARCHETYPES.headstart;
  const unlock = UNLOCK_TIERS[number] || UNLOCK_TIERS[1];
  return {
    id,
    board,
    number,
    title,
    reading,
    artist,
    series,
    art,
    rarity,
    poem,
    description,
    unlockCondition: {
      type: unlock.type,
      boardIndex: board,
      number,
      label: unlock.label,
    },
    buff: {
      ...archetype,
      cardId: id,
      cardTitle: title,
    },
  };
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

export const ACHIEVEMENTS = [
  ...BOARDS.flatMap((b, idx) => [
    { id: `${b.id}_first_clear`, boardIndex: idx, title: `${b.shortTitle}・初踏破`, desc: `${b.title}を最後まで完走する` },
    { id: `${b.id}_first_win`, boardIndex: idx, title: `${b.shortTitle}・初勝利`, desc: `${b.title}で相手に勝利する` },
    { id: `${b.id}_core_mechanic`, boardIndex: idx, title: `${b.shortTitle}・秘伝極意`, desc: `${b.title}の固有戦術（旅銭・四灯・戦術姿勢・善悪選択）を達成する` },
    { id: `${b.id}_no_charm_win`, boardIndex: idx, title: `${b.shortTitle}・無頼の旅`, desc: `${b.title}で懐中護符を装備せずに勝利する` },
    { id: `${b.id}_hard_win`, boardIndex: idx, title: `${b.shortTitle}・強敵撃破`, desc: `${b.title}で困難以上の相手に勝利する` },
    { id: `${b.id}_master_win`, boardIndex: idx, title: `${b.shortTitle}・名人位`, desc: `${b.title}で大師AIに勝利、または36手以内で勝利する` },
  ]),
];

export function getCardById(cardOrId) {
  if (!cardOrId) return null;
  if (typeof cardOrId === 'object' && cardOrId.id) return CARD_BY_ID[cardOrId.id] || cardOrId;
  return CARD_BY_ID[String(cardOrId)] || null;
}

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

export function sanitizeCharmLoadout(charmIds, boardId = null) {
  if (!Array.isArray(charmIds)) return [...DEFAULT_CHARM_IDS];
  const unique = [];
  for (const id of charmIds) {
    const def = CHARM_BY_ID[id];
    if (!def) continue;
    if (boardId && def.boardId && def.boardId !== boardId) continue;
    if (!unique.includes(id)) unique.push(id);
    if (unique.length >= MAX_EQUIPPED_CHARMS) break;
  }
  return unique;
}

export function createMatch(boardIndex, options = {}) {
  const board = getBoard(boardIndex);
  const humanSide = options.humanSide === 1 ? 1 : 0;
  const aiSide = 1 - humanSide;
  const mode = options.mode === 'local2p' ? 'local2p' : 'ai';
  const aiDifficulty = ['easy', 'normal', 'hard', 'master'].includes(options.aiDifficulty)
    ? options.aiDifficulty
    : 'normal';

  const humanCharms = Array.isArray(options.charms)
    ? sanitizeCharmLoadout(options.charms, board.id)
    : [...DEFAULT_CHARM_IDS];
  const rawOppCharms = options.opponentCharms ?? options.charmsP1;
  const opponentCharms = Array.isArray(rawOppCharms)
    ? sanitizeCharmLoadout(rawOppCharms, board.id)
    : [];

  const charmLoadout = humanSide === 0
    ? [humanCharms, opponentCharms]
    : [opponentCharms, humanCharms];

  const charmMaskFor = side => charmLoadout[side].reduce((mask, id) => {
    const charm = CHARM_BY_ID[id];
    return mask | (charm ? charm.mask : 0);
  }, 0);

  const chosenCard = getCardById(options.customCard);
  const customBuff = chosenCard && chosenCard.buff
    ? {
        ...chosenCard.buff,
        cardId: chosenCard.id,
        cardTitle: chosenCard.title,
        firstRollPending: (chosenCard.buff.firstRollBonus | 0) > 0,
      }
    : null;

  const opponentCardObj = getCardById(options.opponentCard);
  const opponentBuff = opponentCardObj && opponentCardObj.buff
    ? {
        ...opponentCardObj.buff,
        cardId: opponentCardObj.id,
        cardTitle: opponentCardObj.title,
        firstRollPending: (opponentCardObj.buff.firstRollBonus | 0) > 0,
      }
    : null;

  const pos = [board.start, board.start];
  const tokens = [0, 0];
  if (customBuff) {
    const bonusPos = Math.max(0, Math.min(2, customBuff.startPosBonus | 0));
    pos[humanSide] = Math.min(board.goal - 1, board.start + bonusPos);
    tokens[humanSide] = customBuff.initialTokens | 0;
  }
  if (opponentBuff) {
    const bonusPos = Math.max(0, Math.min(2, opponentBuff.startPosBonus | 0));
    pos[aiSide] = Math.min(board.goal - 1, board.start + bonusPos);
    tokens[aiSide] = opponentBuff.initialTokens | 0;
  }

  const initialCoins = [
    charmLoadout[0].includes('tokaido_pass') && board.id === 'tokaido' ? 2 : 0,
    charmLoadout[1].includes('tokaido_pass') && board.id === 'tokaido' ? 2 : 0,
  ];
  const initialGourmetMask = [
    board.id === 'tokaido' && (tokens[0] & 1) ? 1 : 0,
    board.id === 'tokaido' && (tokens[1] & 1) ? 1 : 0,
  ];
  if (initialGourmetMask[0]) initialCoins[0] = Math.min(3, initialCoins[0] + 1);
  if (initialGourmetMask[1]) initialCoins[1] = Math.min(3, initialCoins[1] + 1);

  const seed = Number.isInteger(options.seed) ? (options.seed >>> 0) : ((Date.now() ^ 0x9e3779b9) >>> 0);

  return {
    boardIndex,
    boardId: board.id,
    mode,
    aiDifficulty,
    players: [
      { type: humanSide === 0 ? 'human' : (mode === 'local2p' ? 'human' : 'ai'), difficulty: humanSide === 0 ? null : aiDifficulty },
      { type: humanSide === 1 ? 'human' : (mode === 'local2p' ? 'human' : 'ai'), difficulty: humanSide === 1 ? null : aiDifficulty },
    ],
    pos,
    tokens,
    skip: [0, 0],
    charms: [charmMaskFor(0), charmMaskFor(1)],
    charmUsed: [0, 0],
    charmLoadout,
    charmCooldown: [{}, {}],
    windActive: [false, false],
    customCard: chosenCard ? chosenCard.id : null,
    customBuff,
    equippedCard: [
      humanSide === 0 ? (chosenCard?.id || null) : (opponentCardObj?.id || null),
      humanSide === 1 ? (chosenCard?.id || null) : (opponentCardObj?.id || null),
    ],
    playerBuffs: [
      humanSide === 0 ? customBuff : opponentBuff,
      humanSide === 1 ? customBuff : opponentBuff,
    ],
    strikeCooldown: [0, 0],
    duelCount: 0,
    stealCount: [0, 0],
    turn: humanSide === 0 ? 0 : 1,
    humanSide,
    winner: -1,
    resultReason: null,
    turnCount: 0,
    ply: 0,
    maxPly: Number.isInteger(options.maxPly) ? options.maxPly : (board.maxTurns || 120),
    playerTurnCount: [0, 0],
    pendingChoice: null,
    boardState: {
      tokaido: {
        gourmetMask: initialGourmetMask,
        coins: initialCoins,
        coinsSpent: [0, 0],
      },
      yokai: {
        lanternMask: [0, 0],
        frenzyPending: [false, false],
        frenzyEarned: [false, false],
        frenzyTriggered: [false, false],
      },
      kesshu: {
        tempShield: [false, false],
        lastStance: [null, null],
        stanceCount: [0, 0],
      },
      genji: {
        routeChoice: [null, null],
        balance: [0, 0],
        grudgeMarks: [0, 0],
      },
    },
    rngSeed: seed,
    rngState: seed,
    events: [],
    lastRoll: 0,
    history: [],
  };
}

