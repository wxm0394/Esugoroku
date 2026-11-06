// 江戸—明治 浮世絵・絵双六（Edo–Meiji E-Sugoroku）── 四巻の大判摺物画帖・特別盤『しん工夫けん双六』・三十六枚の錦絵札・十二種の守札図鑑。
//
// Historical Redesign Architecture:
//   * Three explicit historical movement modes (`movementMode: 'mawari' | 'tobi' | 'tobi-mawari'`)
//   * Authentic single-step landing instructions (`landingInstruction: rest | moveTo | returnTo | restart | branch`)
//   * Museum-verified vs. digital-adaptation provenance tags (`sourceNote: 'museum-verified' | 'historical-adaptation'`)
//   * Multi-pawn peaceful coexistence (`allowSharedSquare: true`, 2–4 players, cosmetic koma: 旅人・白狐・武者・姫)
//   * Special historical variant: Ansei 4 (1857) Utagawa Kunisato 『しん工夫けん双六』（狐拳名所双六）
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

// 8x7 spiral grid for the complete 55-node Tokaido 53-Station edition (#0 Nihonbashi + #1..#53 Stations + #54 Kyoto Goal)
function buildSpiral55Rects() {
  const cols = 8;
  const rows = 7;
  const gap = 3;
  const pad = 6;
  const cw = (BOARD_W - pad * 2 - gap * (cols - 1)) / cols;
  const ch = (BOARD_H - pad * 2 - gap * (rows - 1)) / rows;
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  // Reserve center 2x1 cells [3,3] and [4,3] for the #54 Kyoto Gosho goal
  visited[3][3] = true;
  visited[3][4] = true;

  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let d = 0;
  let c = 0;
  let r = 0;
  const coords = [];
  for (let i = 0; i < 54; i++) {
    coords.push([c, r]);
    visited[r][c] = true;
    const nc = c + dirs[d][0];
    const nr = r + dirs[d][1];
    if (nc < 0 || nc >= cols || nr < 0 || nr >= rows || visited[nr][nc]) {
      d = (d + 1) % 4;
    }
    c += dirs[d][0];
    r += dirs[d][1];
  }
  const rects = coords.map(([col, row]) => ({
    x: Math.round(pad + col * (cw + gap)),
    y: Math.round(pad + row * (ch + gap)),
    w: Math.round(cw),
    h: Math.round(ch),
  }));
  // #54 Goal in center 2x1 slot
  rects.push({
    x: Math.round(pad + 3 * (cw + gap)),
    y: Math.round(pad + 3 * (ch + gap)),
    w: Math.round(cw * 2 + gap),
    h: Math.round(ch),
  });
  return rects;
}

const SPIRAL_55_RECTS = buildSpiral55Rects();

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
/* 4 Cosmetic Koma (木駒・張子駒) & Kitsune-ken (狐拳) Definitions       */
/* ------------------------------------------------------------------ */

export const HISTORICAL_KOMA = Object.freeze([
  {
    id: 'traveler',
    index: 0,
    name: '旅人駒（菅笠）',
    shortName: '旅人',
    reading: 'たびびとごま',
    seal: '旅',
    color: '#c83223',
    accentColor: '#f5d276',
    desc: '菅笠と道中合羽をまとった江戸旅人。純粋な外観駒（能力差なし）。',
  },
  {
    id: 'fox',
    index: 1,
    name: '白狐駒（稲荷）',
    shortName: '白狐',
    reading: 'びゃっこごま',
    seal: '狐',
    color: '#1d5478',
    accentColor: '#f2e8d5',
    desc: '稲荷社の白狐を象った縁起張子駒。純粋な外観駒（能力差なし）。',
  },
  {
    id: 'warrior',
    index: 2,
    name: '武者駒（鍬形）',
    shortName: '武者',
    reading: 'むしゃごま',
    seal: '武',
    color: '#2e6f40',
    accentColor: '#e5be62',
    desc: '金鍬形を頂く若武者こけし駒。純粋な外観駒（能力差なし）。',
  },
  {
    id: 'princess',
    index: 3,
    name: '姫君駒（檜扇）',
    shortName: '姫君',
    reading: 'ひめぎみごま',
    seal: '姫',
    color: '#8a3ab9',
    accentColor: '#f7c6d9',
    desc: '十二単と檜扇を携えた王朝姫駒。純粋な外観駒（能力差なし）。',
  },
]);

export const KITSUNE_KEN_HANDS = Object.freeze({
  fox: {
    id: 'fox',
    name: '狐（きつね）',
    kanji: '狐',
    beats: 'shoya',
    losesTo: 'hunter',
    gesture: '両手を耳の上に立てて狐の姿を模す',
    ruleText: '狐は庄屋を化かす（狐 ＞ 庄屋）',
  },
  shoya: {
    id: 'shoya',
    name: '庄屋（しょうや）',
    kanji: '庄',
    beats: 'hunter',
    losesTo: 'fox',
    gesture: '両手を膝に置いて威厳ある庄屋の座礼をとる',
    ruleText: '庄屋は猟師に命じる（庄屋 ＞ 猟師）',
  },
  hunter: {
    id: 'hunter',
    name: '猟師（りょうし）',
    kanji: '猟',
    beats: 'fox',
    losesTo: 'shoya',
    gesture: '鉄砲を構えて狙い撃つ所作をとる',
    ruleText: '猟師は鉄砲で狐を撃つ（猟師 ＞ 狐）',
  },
});

export const KITSUNE_KEN_META = Object.freeze({
  title: 'しん工夫けん双六（狐拳名所双六）',
  year: '安政4年（1857）',
  artist: '歌川国郷 画',
  source: '国立国会図書館デジタルコレクション蔵',
  sourceNote: 'museum-verified',
  summary: '順回り・逆回りの双方向から名所を巡り、同じ格で行き逢えば「狐・庄屋・猟師」の狐拳で勝負！負けた側が菓子（点棒）を1つ渡すが、駒は弾き飛ばされず、先に上りへ着いた者が勝利する。',
});

export function resolveNodeRef(board, targetRef) {
  if (targetRef === null || targetRef === undefined) return null;
  if (Number.isInteger(targetRef)) {
    return (targetRef >= 0 && targetRef < board.nodes.length) ? targetRef : null;
  }
  const slug = String(targetRef);
  const found = board.nodes.find(n => n.slugId === slug || n.title === slug || n.iroha === slug);
  return found ? found.id : null;
}

/* ------------------------------------------------------------------ */
/* 巻ノ壱：東海道五十三次道中双六（廻り双六 / movementMode: 'mawari'）   */
/* Reference: 三重県総合博物館蔵《東海道五十三駅道中記細見雙六》          */
/* ------------------------------------------------------------------ */

const TOKAIDO_COMPACT_RAW = [
  // [slugId, title, reading, art, kind, jumpDelta, stayTurns, stationNo, distanceRi, meibutsu, ferryFee, caption, landingInstruction, sourceNote]
  ['nihonbashi', '日本橋', 'にほんばし', 'nihonbashi', 'start', 0, 0, 0, '起点', '魚河岸初鰹', null, 'お江戸日本橋・七つ立ちの振り出し。五十三次の道中がここから始まる。', null, 'museum-verified'],
  ['shinagawa', '品川宿', 'しながわ', 'shinagawa', 'normal', 0, 0, 1, '二里', '海苔・汐干狩', null, '品川宿（日本橋より二里）。江戸湾の白帆を望む最初の宿場。', null, 'museum-verified'],
  ['kawasaki', '泥鰌鍋', 'どじょうなべ', 'dojo', 'jump', 2, 0, 2, '二里半', '泥鰌鍋・奈良茶飯', '六郷渡舟', '川崎・浅草名物の泥鰌鍋で精をつけ、六郷の渡しを越えて二格進む。', { type: 'moveTo', target: 4, badge: '鶴見へ飛進', text: '名物泥鰌鍋で脚が軽くなり、二格先の鶴見泊（#4）へ進む' }, 'historical-adaptation'],
  ['kanagawa', '川崎宿', 'かわさき', 'kawasaki', 'normal', 0, 0, 2, '二里半', '万年屋奈良茶飯', '六郷の渡し', '川崎宿（品川より二里半）。六郷川の渡し舟で賑わう宿場。', null, 'museum-verified'],
  ['tsurumi', '鶴見泊', 'つるみ', 'tsurumi', 'stay', 0, 1, 3, '一里半', '鶴見橋・米饅頭', null, '鶴見立場。茶屋にて名物米饅頭を喫し、草鞋を脱いで一休み。', { type: 'rest', turns: 1, badge: '茶屋一休み', text: '鶴見の茶屋にて旅の疲れを癒やし一休み（一回休み）' }, 'historical-adaptation'],
  ['kanagawa_daimachi', '神奈川宿', 'かながわ', 'kanagawa', 'normal', 0, 0, 3, '二里半', '台町の茶屋', null, '神奈川宿（川崎より二里半）。台町の茶屋より袖ヶ浦の海越し富士を望む。', null, 'museum-verified'],
  ['hodogaya', '程ヶ谷宿', 'ほどがや', 'hodogaya', 'normal', 0, 0, 4, '一里九丁', '帷子川・新町橋', null, '程ヶ谷宿（神奈川より一里九丁）。帷子川の橋を渡る宿場町。', null, 'museum-verified'],
  ['inari', '稲荷寿司', 'いなりずし', 'inari', 'jump', 2, 0, 5, '二里九丁', '追分稲荷寿司', null, '立場名物・稲荷寿司で腹ごしらえし、二格先の藤沢泊へ飛び進む。', { type: 'moveTo', target: 9, badge: '藤沢へ飛進', text: '名物稲荷寿司で精気を得て二格先の藤沢（#9）へ飛び進む' }, 'historical-adaptation'],
  ['totsuka', '戸塚宿', 'とつか', 'totsuka', 'normal', 0, 0, 5, '二里九丁', '吉田橋・鎌倉道追分', null, '戸塚宿（程ヶ谷より二里九丁）。鎌倉街道との追分にて旅人が行き交う。', null, 'museum-verified'],
  ['fujisawa', '藤沢泊', 'ふじさわ', 'fujisawa', 'stay', 0, 1, 6, '一里三十丁', '遊行寺・江ノ島道', null, '藤沢宿（戸塚より一里三十丁）。遊行寺門前の旅籠にて一休み。', { type: 'rest', turns: 1, badge: '門前一休み', text: '藤沢宿・遊行寺門前の旅籠にて一休み（一回休み）' }, 'museum-verified'],
  ['hiratsuka', '平塚宿', 'ひらつか', 'hiratsuka', 'normal', 0, 0, 7, '三里半', '高麗山・馬入川渡', '馬入渡舟', '平塚宿（藤沢より三里半）。高麗山を望む縄手道を進む。', null, 'museum-verified'],
  ['oiso', '大磯宿', 'おおいそ', 'oiso', 'normal', 0, 0, 8, '二十七丁', '虎ヶ雨・鴫立沢', null, '大磯宿（平塚より二十七丁）。西行法師ゆかりの鴫立沢の名所。', null, 'museum-verified'],
  ['tea', '宇治茶', 'うじちゃ', 'tea', 'jump', 3, 0, 9, '四里', '宇治新茶・茶壺道中', null, '街道の茶屋にて芳醇な宇治茶を喫し、三格先の三島宿（#15）へ飛び進む。', { type: 'moveTo', target: 15, badge: '三島へ三格進', text: '銘茶・宇治茶の香気で脚が軽くなり三格先の三島宿（#15）へ飛び進む' }, 'historical-adaptation'],
  ['odawara', '小田原宿', 'おだわら', 'odawara', 'normal', 0, 0, 9, '四里', '外郎（ういろう）・蒲鉾', '酒匂川越四十八文', '小田原宿（大磯より四里）。酒匂川の渡しを越えた城下町。箱根越えの拠点。', null, 'museum-verified'],
  ['hakone', '箱根関所', 'はこねせきしょ', 'hakone', 'jump', -2, 0, 10, '四里八丁', '箱根関・芦ノ湖', '通行手形改め', '箱根関所（小田原より四里八丁・天下の険）。通行手形を忘れ小田原方面へ引き返す！', { type: 'returnTo', target: 'odawara', badge: '手形忘れ小田原戻', text: '三重県総合博物館蔵原図に倣い、箱根にて手形を忘れ小田原宿（#13）へ戻る' }, 'museum-verified'],
  ['mishima', '三島宿', 'みしま', 'mishima', 'normal', 0, 0, 11, '三里二十八丁', '三嶋大社・門前餅', null, '三島宿（箱根より三里二十八丁）。三嶋明神の朝霧の中を出立する。', null, 'museum-verified'],
  // Inner Ring (#16..#23)
  ['mariko', '駿河丸子宿', 'まりこ', 'nihonbashi', 'jump', 2, 0, 20, '一里十六丁', '名物とろろ汁', '安倍川渡り', '駿河丸子宿（二十番目）。芭蕉も詠んだ名物「とろろ汁」で二格先の浜松宿へ進む。', { type: 'moveTo', target: 18, badge: '浜松へ飛進', text: '丸子宿の名物とろろ汁で二格先の浜松宿（#18）へ飛び進む' }, 'museum-verified'],
  ['oigawa', '大井川川止', 'おおいがわ', 'totsuka', 'stay', 0, 1, 23, '二里八丁', '島田宿・大井川蓮台越', '川越賃九十四文', '島田宿・大井川（「箱根八里は馬でも越すが、越すに越されぬ大井川」）。川止めにつき一日逗留！', { type: 'rest', turns: 1, badge: '川止め一休み', text: '大井川満水・川止めにつき島田宿にて一日逗留（一回休み）' }, 'museum-verified'],
  ['hamamatsu', '浜松宿', 'はままつ', 'hodogaya', 'normal', 0, 0, 29, '四里七丁', '浜松城・颯々の松風', null, '遠州浜松宿（二十九番目）。城下の松風に吹かれながら西へ進む。', null, 'museum-verified'],
  ['arai', '新居関所', 'あらいせきしょ', 'tsurumi', 'jump', -2, 0, 31, '海上一里', '今切渡船・関所改め', '渡船賃二十八文', '新居宿・今切関所。風波と手形改めにより二格手前の大井川（#17）へ戻る。', { type: 'returnTo', target: 17, badge: '関所改め二格戻', text: '今切関所の改めにより二格後ろの大井川（#17）へ引き返す' }, 'museum-verified'],
  ['yokkaichi', '四日市・宮の渡し', 'よっかいち・みや', 'shinagawa', 'jump', 2, 0, 43, '海上七里', '七里の渡し・なが餅', '乗合船四十五文', '宮の七里の渡しより四日市宿へ。三重県総合博物館蔵原図に倣い、四日市より関宿（#22）へ飛び進む！', { type: 'moveTo', target: 'seki', badge: '関宿へ飛進', text: '三重県総合博物館蔵《東海道五十三駅道中記細見雙六》に倣い、四日市より関宿（#22）へ飛び進む' }, 'museum-verified'],
  ['kuwana', '桑名宿', 'くわな', 'kanagawa', 'normal', 0, 0, 42, '海上七里', '焼き蛤・時雨蛤', '七里渡船四十五文', '伊勢国・桑名宿（四十二番目）。名物「その手は桑名の焼き蛤」で名高い湊宿。', null, 'museum-verified'],
  ['seki', '関宿・鈴鹿峠', 'せき・すずかとうげ', 'hakone', 'jump', -3, 0, 47, '一里半', '関の地蔵・鈴鹿馬子唄', null, '関宿・鈴鹿峠（四十七番目）。峠の悪風により三格手前の新居関所へ吹き戻される。', { type: 'returnTo', target: 19, badge: '鈴鹿悪風三格戻', text: '鈴鹿峠の向かい風により三格後ろ（#19）へ引き返す' }, 'historical-adaptation'],
  ['otsu', '大津宿', 'おおつ', 'fujisawa', 'normal', 0, 0, 53, '三里二十四丁', '大津絵・走り井餅', null, '五十三次の最終宿場・大津宿（京へ三里）。名物大津絵を購い、次はいよいよ京都三条大橋・御所の上り！', null, 'museum-verified'],
];

const tokaidoNodes = TOKAIDO_COMPACT_RAW.map((row, i) => {
  const [
    slugId, title, reading, art, kind, jumpDelta, stayTurns,
    stationNo, distanceRi, meibutsu, ferryFee, caption, landingInstruction, sourceNote,
  ] = row;
  return ringNode(i, SPIRAL_24_FROM_TOP_LEFT, {
    id: i,
    slugId,
    title,
    reading,
    art,
    illustration: art,
    kind,
    movementMode: 'mawari',
    jumpDelta,
    seal: kind === 'start' ? '出' : kind === 'stay' ? '泊' : kind === 'jump' ? (jumpDelta > 0 ? '飛' : '関') : String(i).padStart(2, '0'),
    stayTurns,
    jumpTable: kind === 'jump' ? [jumpDelta, jumpDelta, jumpDelta, jumpDelta, jumpDelta, jumpDelta] : [0, 0, 0, 0, 0, 0],
    dieDestinations: null,
    landingInstruction,
    stationNo,
    distanceRi,
    meibutsu,
    ferryFee,
    caption,
    sourceNote: sourceNote || 'museum-verified',
    tokens: 0,
    rule: landingInstruction ? landingInstruction.text : caption,
    komae: i % 3,
    palette: i % 3,
  });
});

const tokaidoGoal = {
  id: 24,
  slugId: 'kyoto_sanjo_gosho',
  title: '京都三条大橋・御所上り',
  reading: 'きょうと さんじょうおおはし ごしょあがり',
  art: 'kyoto',
  illustration: 'kyoto',
  kind: 'goal',
  movementMode: 'mawari',
  seal: '上',
  stayTurns: 0,
  jumpTable: [0, 0, 0, 0, 0, 0],
  dieDestinations: null,
  landingInstruction: null,
  stationNo: 54,
  distanceRi: '江戸より百二十六里半',
  meibutsu: '京八百善・内裏御所',
  ferryFee: null,
  caption: '東海道五十三次の終着・京都三条大橋と御所（大上り）。丁度の出目で入上り、余り目は折り返す。',
  sourceNote: 'museum-verified',
  tokens: 0,
  rule: '丁度の出目で上り到着（超過した分は折り返す）',
  ...cellRect(2, 2, CELL_W, CELL_H),
  palette: 0,
};

const TOKAIDO_53_STATIONS_LIST = [
  ['nihonbashi', '日本橋', 'にほんばし', 'nihonbashi', '起点', '魚河岸初鰹', null],
  ['shinagawa', '品川', 'しながわ', 'shinagawa', '二里', '浅草海苔', null],
  ['kawasaki', '川崎', 'かわさき', 'kawasaki', '二里半', '奈良茶飯', '六郷渡舟'],
  ['kanagawa', '神奈川', 'かながわ', 'kanagawa', '二里半', '亀の子煎餅', null],
  ['hodogaya', '保土ヶ谷', 'ほどがや', 'hodogaya', '一里九丁', '蕎麦', null],
  ['totsuka', '戸塚', 'とつか', 'totsuka', '二里九丁', '胡麻餅', null],
  ['fujisawa', '藤沢', 'ふじさわ', 'fujisawa', '一里三十丁', '遊行寺参詣', null],
  ['hiratsuka', '平塚', 'ひらつか', 'hiratsuka', '三里半', '馬入川渡', '馬入渡舟'],
  ['oiso', '大磯', 'おおいそ', 'oiso', '二十七丁', '虎子石', null],
  ['odawara', '小田原', 'おだわら', 'odawara', '四里', '外郎・蒲鉾', '酒匂川越'],
  ['hakone', '箱根', 'はこね', 'hakone', '四里八丁', '箱根関所・寄木', '手形改め'],
  ['mishima', '三島', 'みしま', 'mishima', '三里二十八丁', '三嶋暦・おこし餅', null],
  ['numazu', '沼津', 'ぬまづ', 'shinagawa', '一里半', '干物・千本松原', null],
  ['hara', '原', 'はら', 'kanagawa', '一里半', '白隠禅師ゆかり・富士見', null],
  ['yoshiwara', '吉原', 'よしわら', 'fujisawa', '三里六丁', '左富士', null],
  ['kanbara', '蒲原', 'かんばら', 'totsuka', '二里三十丁', '富士川渡舟', '富士川渡'],
  ['yui', '由比', 'ゆい', 'tsurumi', '一里', '薩埵峠・桜海老', null],
  ['okitsu', '興津', 'おきつ', 'mishima', '二里十二丁', '清見寺・鯛', null],
  ['ejiri', '江尻', 'えじり', 'shinagawa', '一里二丁', '三保の松原', null],
  ['fuchu', '府中（駿府）', 'ふちゅう', 'nihonbashi', '二里二十七丁', '安倍川餅・竹細工', '安倍川渡'],
  ['mariko', '丸子', 'まりこ', 'tea', '一里十六丁', 'とろろ汁', null],
  ['okabe', '岡部', 'おかべ', 'hakone', '二里', '宇津ノ谷峠・十団子', null],
  ['fujieda', '藤枝', 'ふじえだ', 'hodogaya', '一里二十六丁', '染飯（そめいい）', null],
  ['shimada', '島田', 'しまだ', 'totsuka', '二里八丁', '大井川蓮台越し', '大井川越九十四文'],
  ['kanaya', '金谷', 'かなや', 'kanagawa', '一里', '牧之原茶', null],
  ['nissaka', '日坂', 'にっさか', 'oiso', '一里二十四丁', '小夜の中山・飴餅', null],
  ['kakegawa', '掛川', 'かけがわ', 'fujisawa', '一里二十九丁', '葛布（くずふ）', null],
  ['fukuroi', '袋井', 'ふくろい', 'hiratsuka', '二里十六丁', '東海道どまん中茶屋', null],
  ['mitsuke', '見附', 'みつけ', 'kawasaki', '一里半', '天竜川渡船', '天竜川渡'],
  ['hamamatsu', '浜松', 'はままつ', 'hodogaya', '四里七丁', '浜松城・松風', null],
  ['maisaka', '舞阪', 'まいさか', 'shinagawa', '二里三十丁', '今切渡船・牡蠣', '今切渡船二十八文'],
  ['arai', '新居', 'あらい', 'tsurumi', '海上一里', '今切関所・うなぎ', '関所改め'],
  ['shirasuka', '白須賀', 'しらすか', 'kanagawa', '一里二十四丁', '潮見坂', null],
  ['futagawa', '二川', 'ふたがわ', 'totsuka', '一里十七丁', '強飯（こわめし）', null],
  ['yoshida', '吉田', 'よしだ', 'odawara', '一里半', '豊川橋・吉田城', null],
  ['goyu', '御油', 'ごゆ', 'mishima', '二里二十二丁', '御油の松並木', null],
  ['akasaka', '赤坂', 'あかさか', 'inari', '十六丁', '大橋屋旅籠', null],
  ['fujikawa', '藤川', 'ふじかわ', 'hiratsuka', '二里九丁', 'むらさき麦', null],
  ['okazaki', '岡崎', 'おかざき', 'nihonbashi', '一里半', '矢作橋・八丁味噌', null],
  ['chiryu', '池鯉鮒（知立）', 'ちりゅう', 'hodogaya', '三里三十丁', '馬市・あんまき', null],
  ['narumi', '鳴海', 'なるみ', 'oiso', '二里三十丁', '有松・鳴海絞', null],
  ['miya', '宮（熱田）', 'みや', 'shinagawa', '一里半', '熱田神宮・きしめん', '七里の渡し'],
  ['kuwana', '桑名', 'くわな', 'kanagawa', '海上七里', '焼き蛤・時雨蛤', '七里渡船四十五文'],
  ['yokkaichi', '四日市', 'よっかいち', 'fujisawa', '三里八丁', 'なが餅・日永追分', null],
  ['ishiyakushi', '石薬師', 'いしやくし', 'totsuka', '二里二十七丁', '石薬師寺', null],
  ['shono', '庄野', 'しょうの', 'totsuka', '二十五丁', '焼米（やきごめ）', null],
  ['kameyama', '亀山', 'かめやま', 'odawara', '二里', '亀山城・ろうそく', null],
  ['seki', '関', 'せき', 'hakone', '一里半', '関の地蔵・志ら玉', null],
  ['sakanoshita', '坂下', 'さかのした', 'hakone', '一里半', '鈴鹿峠・筆捨山', null],
  ['tsuchiyama', '土山', 'つちやま', 'tea', '二里半', '鈴鹿馬子唄・茶', null],
  ['minakuchi', '水口', 'みなくち', 'kawasaki', '二里三十二丁', '干瓢・葛細工', null],
  ['ishibe', '石部', 'いしべ', 'mishima', '三里十二丁', '石部豆腐', null],
  ['kusatsu', '草津', 'くさつ', 'inari', '二里十六丁', '姥ヶ餅・中山道追分', null],
  ['otsu', '大津', 'おおつ', 'fujisawa', '三里二十四丁', '大津絵・走り井餅', null],
];

export const TOKAIDO_53_FULL_NODES = chainNext([
  ...TOKAIDO_53_STATIONS_LIST.map(([slugId, title, reading, art, distanceRi, meibutsu, ferryFee], i) => {
    let kind = i === 0 ? 'start' : 'normal';
    let stayTurns = 0;
    let jumpDelta = 0;
    let landingInstruction = null;
    let sourceNote = 'museum-verified';

    if (slugId === 'hakone') {
      kind = 'jump';
      jumpDelta = -1;
      landingInstruction = { type: 'returnTo', target: 'odawara', badge: '手形忘れ小田原戻', text: '箱根関所にて通行手形を忘れ、小田原宿（#9）へ引き返す' };
    } else if (slugId === 'shimada') {
      kind = 'stay';
      stayTurns = 1;
      landingInstruction = { type: 'rest', turns: 1, badge: '大井川川止め', text: '大井川満水・川止めにつき島田宿にて一日逗留（一回休み）' };
    } else if (slugId === 'maisaka') {
      kind = 'stay';
      stayTurns = 1;
      landingInstruction = { type: 'rest', turns: 1, badge: '今切風波休み', text: '今切渡船・風波高きにつき舞阪宿にて一休み（一回休み）' };
    } else if (slugId === 'yokkaichi') {
      kind = 'jump';
      jumpDelta = 4;
      landingInstruction = { type: 'moveTo', target: 'seki', badge: '関宿へ飛進', text: '四日市宿より順風に乗じて関宿（#47）へ飛び進む' };
    } else if (slugId === 'mariko') {
      kind = 'jump';
      jumpDelta = 2;
      landingInstruction = { type: 'moveTo', target: 'fujieda', badge: 'とろろ汁飛進', text: '丸子宿の名物とろろ汁で精をつけ藤枝宿（#22）へ進む' };
      sourceNote = 'historical-adaptation';
    }

    const rect = SPIRAL_55_RECTS[i];
    return {
      id: i,
      slugId,
      title: i === 0 ? '日本橋（振出）' : `${title}宿`,
      reading,
      art,
      illustration: art,
      kind,
      movementMode: 'mawari',
      jumpDelta,
      seal: i === 0 ? '出' : kind === 'stay' ? '泊' : String(i),
      stayTurns,
      jumpTable: [jumpDelta, jumpDelta, jumpDelta, jumpDelta, jumpDelta, jumpDelta],
      dieDestinations: null,
      landingInstruction,
      stationNo: i,
      distanceRi,
      meibutsu,
      ferryFee,
      caption: i === 0
        ? '江戸日本橋（振り出し）。五十三次の長旅がここから始まる。'
        : `東海道五十三次・第${i}宿「${title}」（前宿より${distanceRi}）。名物：${meibutsu}${ferryFee ? `・${ferryFee}` : ''}。`,
      sourceNote,
      tokens: 0,
      rule: landingInstruction ? landingInstruction.text : `前宿より${distanceRi}・名物：${meibutsu}`,
      ...rect,
      komae: i % 3,
      palette: i % 3,
    };
  }),
  {
    ...tokaidoGoal,
    id: 54,
    ...SPIRAL_55_RECTS[54],
  },
], 54);

export const TOKAIDO_COMPACT_NODES = chainNext([...tokaidoNodes, tokaidoGoal], 24);

const tokaido = {
  id: 'tokaido',
  volume: '巻ノ壱',
  volumeKanji: '壱',
  style: 'mawari',
  movementMode: 'mawari',
  styleLabel: '廻り双六（道中双六）',
  title: '東海道五十三次道中双六',
  shortTitle: '東海道五十三次',
  artists: '歌川広重・三重県総合博物館蔵《東海道五十三駅道中記細見雙六》風',
  historicalSource: '三重県総合博物館蔵《東海道五十三駅道中記細見雙六》',
  paper: '#f0dfb9',
  ink: '#24180f',
  accent: '#b23a2b',
  accent2: '#1f5c61',
  start: 0,
  goal: 24,
  startNodeId: 'nihonbashi',
  goalNodeId: 'kyoto_sanjo_gosho',
  goalRule: {
    type: 'exact-bounce',
    description: '上り（京都三条大橋・御所）は丁度の出目で到着し、余り目は折り返す',
  },
  allowSharedSquare: true,
  routeScale: 'compact',
  clashPush: 2,
  bounceBack: true,
  requiredTokens: 0,
  maxTurns: 140,
  nodes: TOKAIDO_COMPACT_NODES,
  cardIds: ['tokaido_01', 'tokaido_02', 'tokaido_03', 'tokaido_04', 'tokaido_05', 'tokaido_06', 'tokaido_07', 'tokaido_08', 'tokaido_09'],
  blurb: '江戸日本橋を振り出しとし、宿場間の里数・名物・川越賃を辿りながら京都三条大橋・御所の上りを目指す正統派の道中廻り双六。',
  ruleSummary: '【廻り双六】賽の目だけ宿場を順に進む。大井川の川止めは一休み、箱根関所の手形忘れは小田原へ戻り、四日市からは関宿へ飛び進む。上りは丁度止まり（余り目は折り返し）。複数駒の同格共存可。',
  ruleBrief: '廻り双六・宿場道中（川止め休・箱根手形戻・四日市飛・丁度上り）',
  layout: 'spiral-corridor',
  shape: 'arrow-strip',
  ui: {
    skin: 'cedar-passport',
    panelTitle: '道中細見記',
    panelSub: '宿場里数・名物・川越',
    diceDevice: '染付青花茶碗',
    diceShape: 'porcelain-bowl',
    hud: 'tokaido-gourmet',
    hudLabel: '道中細見',
  },
};

export function setTokaidoRouteScale(scale = 'compact') {
  if (scale === 'full53') {
    tokaido.routeScale = 'full53';
    tokaido.nodes = TOKAIDO_53_FULL_NODES;
    tokaido.goal = 54;
    tokaido.maxTurns = 220;
  } else {
    tokaido.routeScale = 'compact';
    tokaido.nodes = TOKAIDO_COMPACT_NODES;
    tokaido.goal = 24;
    tokaido.maxTurns = 140;
  }
  return tokaido;
}

/* ------------------------------------------------------------------ */
/* 巻ノ弐：百種怪談妖物双六（飛び双六 / movementMode: 'tobi'）          */
/* Reference: 東京学芸大学教育コンテンツアーカイブ E120200301           */
/* ------------------------------------------------------------------ */

const YOKAI_RAW = [
  // [slugId, title, reading, art, dieDestinations, jumpTable, caption, landingInstruction, sourceNote]
  [
    'hyakumonogatari_start', '百物語・河童（振出）', 'ひゃくものがたり かっぱ', 'kappa',
    { 1: 3, 2: null, 3: 4, 4: 1, 5: null, 6: 2 },
    [3, 3, 3, 1, 1, -3],
    '振り出し。行灯を囲んで子供たちが百物語を語り始める。出目【二・五】は送り先なくその場に留まり、他の目で怪異の格へ飛ぶ。',
    null,
    'museum-verified',
  ],
  [
    'yukionna', '雪女郎', 'ゆきじょろう', 'yukionna',
    { 1: 3, 2: 5, 3: 6, 4: null, 5: null, 6: 0 },
    [2, 2, 2, 0, 0, -2],
    '吹雪の夜に現れる白装束の雪女郎。【四・五】は凍えて動けず、【六】は振り出しへ吹き戻される。',
    null,
    'museum-verified',
  ],
  [
    'nekomata', '猫俣', 'ねこまた', 'nekomata',
    { 1: 4, 2: 6, 3: 7, 4: 8, 5: null, 6: 1 },
    [2, 2, 2, 2, 0, -2],
    '古寺の軒下で二股の尾を揺らす猫俣。出目によって手踊りしながら次の怪異へ跳ぶ。',
    null,
    'museum-verified',
  ],
  [
    'chagama', '文福茶釜', 'ぶんぶくちゃがま', 'chagama',
    { 1: 4, 2: 6, 3: 8, 4: null, 5: null, 6: 9 },
    [1, 1, 1, 0, 0, 0],
    '毛呂山茂林寺の文福茶釜。手足を出して綱渡りを見せる。【四・五】は茶釜に隠れて動けない。',
    null,
    'museum-verified',
  ],
  [
    'sanme', '三目大僧', 'みつめだいそう', 'sanme',
    { 1: 3, 2: 2, 3: 6, 4: 8, 5: 10, 6: 12 },
    [-1, -1, 2, 2, 4, 4],
    '辻堂で三つの眼を光らせる三目大僧。【五・六】の大目が出れば怪力で遠くの格へ飛び進む。',
    null,
    'museum-verified',
  ],
  [
    'funayurei', '船幽霊', 'ふなゆうれい', 'funayurei',
    { 1: 3, 2: null, 3: null, 4: 7, 5: 9, 6: 11 },
    [-2, 0, 0, 2, 2, 2],
    '夜の海原で底の抜けた柄杓を差し出す船幽霊。【二・三】は潮待ちでその場に留まる。',
    null,
    'museum-verified',
  ],
  [
    'oiwa', '挑灯お岩', 'ちょうちんおいわ', 'oiwa',
    { 1: 3, 2: 4, 3: null, 4: 8, 5: 10, 6: 12 },
    [-3, -3, 0, 0, 2, 2],
    '破れ提灯の青白い炎から浮かび上がるお岩の怨顔。着地すると祟りにより一回休み。',
    { type: 'rest', turns: 1, badge: '祟り一休み', text: '提灯の火が揺らぎ、お岩の怨念に足がすくんで一休み' },
    'historical-adaptation',
  ],
  [
    'rokuro', 'ろくろ首', 'ろくろくび', 'rokuro',
    { 1: 11, 2: 12, 3: 9, 4: 10, 5: null, 6: 5 },
    [4, 4, 2, 2, 0, -2],
    '行灯の油を舐めながら欄干を越えて首を伸ばすろくろ首。【一・二】で長く伸びて先へ飛ぶ。',
    null,
    'museum-verified',
  ],
  [
    'kyubi', '九尾狐（玉藻前）', 'きゅうびのきつね', 'kyubi',
    { 1: 9, 2: 10, 3: 11, 4: 13, 5: 14, 6: 5 },
    [1, 2, 3, 2, 1, -3],
    '那須野の殺生石に潜む九尾の白狐。【六】は妖狐の幻術にかかり船幽霊へ戻される。',
    null,
    'museum-verified',
  ],
  [
    'tenome', '手の目', 'てのめ', 'tenome',
    { 1: null, 2: 11, 3: 12, 4: 14, 5: 6, 6: 15 },
    [0, 0, -1, -1, -3, -3],
    '盲目の座頭の両掌にぎょろりと目が開く「手の目」。【一】は闇を手探りしてその場に留まる。',
    null,
    'museum-verified',
  ],
  [
    'ittan', '一反木綿', 'いったんもめん', 'ittan',
    { 1: 12, 2: 14, 3: null, 4: 15, 5: 8, 6: 16 },
    [2, 2, 0, 0, -2, -2],
    '夕暮れの空を白布が舞い飛ぶ一反木綿。【三】は布に絡め取られてその場に留まる。',
    null,
    'museum-verified',
  ],
  [
    'shuban', '朱の盤', 'しゅのばん', 'shuban',
    { 1: 14, 2: null, 3: 15, 4: 16, 5: 17, 6: 8 },
    [3, 0, 0, 1, 1, -3],
    '朱塗りの大盆のような真っ赤な顔で旅人を驚かす朱の盤。',
    null,
    'museum-verified',
  ],
  [
    'tengu', '大天狗', 'おおてんぐ', 'tengu',
    { 1: 16, 2: 15, 3: 14, 4: 17, 5: null, 6: 10 },
    [4, 3, 2, 1, 0, -2],
    '羽団扇を一振りして疾風を起こす鞍馬の大天狗。【一】が出れば神通力で皿屋敷まで飛ぶ。',
    null,
    'museum-verified',
  ],
  [
    'mikoshi', '見越入道', 'みこしにゅうどう', 'mikoshi',
    { 1: 15, 2: 16, 3: 17, 4: 11, 5: 10, 6: 18 },
    [2, 2, 2, -2, -2, -2],
    '夜道の竹藪から見上げるほど巨大化する見越入道。「見越したぞ」と唱えぬ者はろくろ首へ引き戻される。',
    { type: 'returnTo', target: 'rokuro', badge: 'ろくろ首へ戻る', text: '見越入道に見下ろされ、ろくろ首（#7）へ引き戻される' },
    'historical-adaptation',
  ],
  [
    'nureonna', '濡女', 'ぬれおんな', 'nureonna',
    { 1: 11, 2: 12, 3: 16, 4: null, 5: 17, 6: 19 },
    [-3, -2, -1, 0, 1, 2],
    '濡れそぼった黒髪を引きずり水辺から這い出る濡女。【四】は水辺に足を取られて止まる。',
    null,
    'museum-verified',
  ],
  [
    'tesso', '鉄鼠', 'てっそ', 'tesshi',
    { 1: 16, 2: 17, 3: 18, 4: null, 5: 19, 6: 14 },
    [1, 1, 0, 0, -1, -2],
    '三井寺の経巻を食い破る鉄の牙の怪鼠。',
    null,
    'museum-verified',
  ],
  [
    'okiku', '皿屋敷お菊', 'おきく', 'oiwa',
    { 1: 18, 2: 19, 3: 20, 4: 14, 5: null, 6: 21 },
    [2, 2, -2, -2, -4, 3],
    '「一枚、二枚…九枚…」古井戸の底から皿を数えるお菊の亡霊。悲嘆の声に聞き入り一休み。',
    { type: 'rest', turns: 1, badge: '古井戸一休み', text: '皿を数えるお菊の声に引き留められ一休み（一回休み）' },
    'historical-adaptation',
  ],
  [
    'gashadokuro', 'がしゃどくろ', 'がしゃどくろ', 'sanme',
    { 1: 14, 2: 19, 3: 20, 4: 21, 5: 22, 6: null },
    [-3, -3, 2, 2, 3, 0],
    '荒れ果てた古内裏の御簾を破り現れる大髑髏。【六】は妖気に圧されてその場に留まる。',
    null,
    'museum-verified',
  ],
  [
    'nurarihyon', 'ぬらりひょん', 'ぬらりひょん', 'mikoshi',
    { 1: null, 2: null, 3: 20, 4: 21, 5: 22, 6: 15 },
    [0, 0, 2, 2, -2, -3],
    '夕暮れの屋敷に勝手に入り込み主のように煙管をくゆらす妖怪の総大将。【一・二】は座敷に居座る。',
    null,
    'museum-verified',
  ],
  [
    'jorogumo', '絡新婦', 'じょろうぐも', 'yukionna',
    { 1: 17, 2: 21, 3: null, 4: 22, 5: 23, 6: 24 },
    [-2, -2, -3, 2, 2, 3],
    '琵琶を奏でる美女に化けて白糸を吐く絡新婦。【六】が出れば一気に「古御所の妖猫（上り）」へ飛ぶ！',
    null,
    'museum-verified',
  ],
  [
    'amanojaku', '天邪鬼', 'あまのじゃく', 'tengu',
    { 1: 18, 2: 22, 3: 23, 4: 21, 5: 24, 6: null },
    [-3, -2, -1, 1, 2, 3],
    '人の心を読みあべこべを言う天邪鬼。【五】が出れば上り「古御所の妖猫」へ直行する。',
    null,
    'museum-verified',
  ],
  [
    'domeki', '百目鬼', 'どうめき', 'tenome',
    { 1: 23, 2: 24, 3: null, 4: 22, 5: 19, 6: 18 },
    [2, 2, 0, -2, -3, -4],
    '全身に百の眼を持つ百目鬼。【二】が出れば「古御所の妖猫（上り）」へ飛び込む。',
    null,
    'museum-verified',
  ],
  [
    'onmoraki', '陰摩羅鬼', 'おんもらき', 'funayurei',
    { 1: 24, 2: 23, 3: null, 4: 24, 5: 20, 6: 19 },
    [2, 1, 0, -1, -2, -3],
    '供養の足りぬ経文の陰から現れる人面怪鳥。【一・四】で上り「古御所の妖猫」へ飛ぶ。',
    null,
    'museum-verified',
  ],
  [
    'oumagatoki', '逢魔が時', 'おうまがとき', 'kyubi',
    { 1: 24, 2: 24, 3: null, 4: 24, 5: 21, 6: 24 },
    [1, 0, 0, -2, -3, -4],
    '百物語の最後の青行灯が吹き消される瞬間。出目【一・二・四・六】で「古御所の妖猫（上り）」が現れる！',
    null,
    'museum-verified',
  ],
];

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

function formatTobiDestinationsText(dieDestinations, nodesPreview) {
  if (!dieDestinations) return '';
  const labels = ['一', '二', '三', '四', '五', '六'];
  return [1, 2, 3, 4, 5, 6].map(face => {
    const t = dieDestinations[face];
    if (t === null || t === undefined) return `【${labels[face - 1]}】留`;
    const name = nodesPreview?.[t]?.title || `#${t}`;
    return `【${labels[face - 1]}】→#${t}(${name.slice(0, 4)})`;
  }).join(' ');
}

const yokaiNodes = YOKAI_RAW.map((row, i) => {
  const [slugId, title, reading, art, dieDestinations, jumpTable, caption, landingInstruction, sourceNote] = row;
  const rect = YOKAI_COLLAGE[i];
  return {
    id: i,
    slugId,
    title,
    reading,
    art,
    illustration: art,
    kind: i === 0 ? 'start' : 'jump',
    movementMode: 'tobi',
    seal: String(i + 1).padStart(2, '0'),
    stayTurns: 0,
    jumpTable,
    dieDestinations,
    landingInstruction,
    caption,
    sourceNote: sourceNote || 'museum-verified',
    tokens: 0,
    ...rect,
    tilt: ((i % 7) - 3) * 0.008,
    komae: i % 4,
    palette: i % 4,
  };
});

const yokaiGoal = {
  id: 24,
  slugId: 'bakeneko_gosho',
  title: '古御所の妖猫・百物語上り',
  reading: 'こごしょのばけねこ ひゃくものがたりあがり',
  art: 'hyakumonogatari',
  illustration: 'hyakumonogatari',
  kind: 'goal',
  movementMode: 'tobi',
  seal: '上',
  stayTurns: 0,
  jumpTable: [0, 0, 0, 0, 0, 0],
  dieDestinations: { 1: 24, 2: 24, 3: 24, 4: 24, 5: 24, 6: 24 },
  landingInstruction: null,
  caption: '東京学芸大学蔵《百種怪談妖物双六》の上り「古御所の妖猫」。百物語の果てに古御所の奥座敷へ辿り着けば勝利！',
  sourceNote: 'museum-verified',
  jumpText: '二十四の怪異をすべて乗り越え、古御所の妖猫（上り）へ。',
  tokens: 0,
  rule: '飛び双六の終着「古御所の妖猫（上り）」',
  ...cellRect(2, 2, CELL_W + 6, CELL_H + 6, -3, -3),
  palette: 3,
};

const allYokaiNodes = chainNext([...yokaiNodes, yokaiGoal], 24);
for (const n of allYokaiNodes) {
  if (n.dieDestinations && n.kind !== 'goal') {
    n.jumpText = formatTobiDestinationsText(n.dieDestinations, allYokaiNodes);
    n.rule = `${n.caption} （${n.jumpText}）`;
  }
}

const yokai = {
  id: 'yokai',
  volume: '巻ノ弐',
  volumeKanji: '弐',
  style: 'tobi',
  movementMode: 'tobi',
  styleLabel: '飛び双六（出目対応表）',
  title: '百種怪談妖物双六',
  shortTitle: '百種怪談妖物',
  artists: '歌川芳員・東京学芸大学蔵《百種怪談妖物双六》（E120200301）',
  historicalSource: '東京学芸大学教育コンテンツアーカイブ E120200301《百種怪談妖物双六》',
  paper: '#d9cdb0',
  ink: '#1c1b1a',
  accent: '#7d1f31',
  accent2: '#305b60',
  start: 0,
  goal: 24,
  startNodeId: 'hyakumonogatari_start',
  goalNodeId: 'bakeneko_gosho',
  goalRule: {
    type: 'reach',
    description: '各格の「出目と飛び先の対応表」に従って跳び、「古御所の妖猫（上り）」へ到達した者が勝利',
  },
  allowSharedSquare: true,
  clashPush: 2,
  bounceBack: false,
  requiredTokens: 0,
  maxTurns: 140,
  nodes: allYokaiNodes,
  cardIds: ['yokai_01', 'yokai_02', 'yokai_03', 'yokai_04', 'yokai_05', 'yokai_06', 'yokai_07', 'yokai_08', 'yokai_09'],
  blurb: '子供たちが集う「百物語」を振り出しとし、各格に記された「出目1〜6の飛び先表」に従って怪異の間を跳び巡り、「古御所の妖猫（上り）」を目指す伝統的な飛び双六。',
  ruleSummary: '【飛び双六】歩数で順番に進むのではなく、現在格に記された「出目1〜6と目的地の対応表」で直接指定格へ跳ぶ。対応する飛び先が無い出目（留）を振った場合はその場に留まる。',
  ruleBrief: '飛び双六・出目対応表で指定格へ直接跳ぶ（対応なしは留まり）',
  layout: 'irregular-collage',
  shape: 'collage',
  ui: {
    skin: 'dark-temple',
    panelTitle: '百物語出目帳',
    panelSub: '東京学芸大学蔵・飛び双六復原',
    diceDevice: '朱符黒竹筒',
    diceShape: 'talisman-bamboo',
    hud: 'hyakumonogatari-lanterns',
    hudLabel: '怪異出目表',
  },
};

/* ------------------------------------------------------------------ */
/* 巻ノ参：英勇揃伊呂波双六（飛び廻り双六 / movementMode: 'tobi-mawari'）*/
/* Reference: 江戸—明治期 武者絵・いろは双六                           */
/* ------------------------------------------------------------------ */

const IROHA = [
  'い', 'ろ', 'は', 'に', 'ほ', 'へ', 'と', 'ち',
  'り', 'ぬ', 'る', 'を', 'わ', 'か', 'よ', 'た',
  'れ', 'そ', 'つ', 'ね', 'な', 'ら', 'む', 'う',
];

const KESSHU_RECTS = [
  { x: 548, y: 462, w: 245, h: 172 }, // #0 出陣
  { x: 408, y: 492, w: 132, h: 134 }, // #1
  { x: 274, y: 492, w: 130, h: 134 }, // #2
  { x: 140, y: 492, w: 130, h: 134 }, // #3
  { x: 6,   y: 492, w: 130, h: 134 }, // #4
  { x: 6,   y: 336, w: 128, h: 136 }, // #5
  { x: 138, y: 336, w: 128, h: 136 }, // #6
  { x: 270, y: 336, w: 128, h: 136 }, // #7
  { x: 402, y: 336, w: 128, h: 136 }, // #8
  { x: 534, y: 336, w: 128, h: 136 }, // #9
  { x: 666, y: 316, w: 128, h: 136 }, // #10
  { x: 666, y: 170, w: 128, h: 134 }, // #11
  { x: 534, y: 178, w: 128, h: 134 }, // #12
  { x: 402, y: 178, w: 128, h: 134 }, // #13
  { x: 270, y: 178, w: 128, h: 134 }, // #14
  { x: 138, y: 184, w: 128, h: 134 }, // #15
  { x: 6,   y: 184, w: 128, h: 134 }, // #16
  { x: 704, y: 12,  w: 88,  h: 150 }, // #17
  { x: 614, y: 12,  w: 86,  h: 150 }, // #17+1
  { x: 524, y: 12,  w: 86,  h: 150 }, // #19
  { x: 434, y: 12,  w: 86,  h: 150 }, // #20
  { x: 344, y: 12,  w: 86,  h: 150 }, // #21
  { x: 254, y: 12,  w: 86,  h: 150 }, // #22
  { x: 6,   y: 6,   w: 244, h: 172 }, // #23 上り
];

const KESSHU_TILTS = [
  -6, -4, 2, 6, 8, -3, 4, -6, 2, 7, -4, 5,
  -5, 8, -2, 3, -7, 6, -3, 5, -4, 7, 1, -1,
];

const KESSHU_RAW = [
  // [slugId, title, reading, art, kind, jumpDelta, stayTurns, tokens, tokenLabel, caption, landingInstruction, sourceNote]
  ['iroha_shutsujin', '出陣（い：源義経）', 'しゅつじん みなもとのよしつね', 'shutsujin', 'start', 0, 0, 0, '', '【い】いさみ立つ源九郎義経の出陣本陣（振り出し）。いろは仮名見出しに沿って英勇伝を巡り上りを目指す。', null, 'museum-verified'],
  ['ro_yari', 'ろ：六波羅槍隊（平重盛）', 'ろくはらやりたい', 'yari', 'normal', 0, 0, 0, '', '【ろ】六波羅の小松内大臣・平重盛率いる長柄槍の先鋒隊。', null, 'museum-verified'],
  ['ha_yumi', 'は：畠山重忠・弓隊', 'はたけやましげただ', 'yumi', 'normal', 0, 0, 0, '', '【は】鵯越の逆落としにて愛馬を背負い降りた坂東武者の鑑・畠山重忠。', null, 'museum-verified'],
  ['ni_kabuto', 'に：仁田四郎・星兜', 'にったしろう かぶと', 'kabuto', 'token', 0, 0, 1, '兜', '【に】富士の人穴を探検せし豪傑・仁田四郎忠常と鍬形星兜。', null, 'museum-verified'],
  ['ho_gungi', 'ほ：北条時宗・本陣軍議', 'ほうじょうときむね ぐんぎ', 'gungi', 'normal', 0, 0, 0, '', '【ほ】本陣にて軍配団扇を執り、軍議を定める北条時宗。', null, 'museum-verified'],
  ['he_oyoroi', 'へ：平教経・赤糸威大鎧', 'たいらののりつね おおよろい', 'oyoroi', 'jump', 2, 0, 0, '', '【へ】赤糸威の大鎧をまとった猛将・能登守教経。突撃の勢いで「ち（#7）」の格へ二格飛び進む！', { type: 'moveTo', target: 7, kana: 'ち', badge: '「ち」の格へ飛進', text: '赤糸威の突撃により「ち（#7 鎮西八郎・太刀）」の格へ二格飛び進む' }, 'historical-adaptation'],
  ['to_ikki', 'と：巴御前・一騎討', 'ともえごぜん いっきうち', 'ikkit', 'normal', 0, 0, 0, '', '【と】「強弓精兵、一人当千の兵者」と讃えられた女武者・巴御前の一騎討ち。', null, 'museum-verified'],
  ['chi_tachi', 'ち：鎮西八郎・名刀太刀', 'ちんぜいはちろう たち', 'tachi', 'token', 0, 0, 2, '太刀', '【ち】鎮西八郎為朝の武勇と備前長船の名刀太刀。', null, 'museum-verified'],
  ['ri_fukuhei', 'り：熊谷直実・伏兵奇襲', 'くまがいなおざね ふくへい', 'shinobi', 'jump', -2, 0, 0, '', '【り】一ノ谷の伏兵奇襲に遭い、「と（#6 巴御前）」の格へ二格退く。', { type: 'returnTo', target: 6, kana: 'と', badge: '「と」の格へ退く', text: '伏兵の奇襲に遭い、「と（#6 巴御前）」の格へ二格退却する' }, 'historical-adaptation'],
  ['nu_meiyaku', 'ぬ：額田部・義士盟約', 'ぎしめいやく', 'meiyaku', 'normal', 0, 0, 0, '', '【ぬ】主君への忠義を誓い連判状に血判を捺す義士の盟約。', null, 'museum-verified'],
  ['ru_jindaiko', 'る：楠木正行・陣太鼓', 'くすのきまさつら じんだいこ', 'jindaiko', 'token', 0, 0, 4, '陣太鼓', '【る】進軍を告げる陣太鼓の響き。', null, 'museum-verified'],
  ['wo_hyoro', 'を：小栗判官・兵糧休み', 'おぐりはんがん ひょうろう', 'tekijin', 'stay', 0, 1, 0, '', '【を】長陣の兵糧補給と馬の息継ぎのため陣中にて一休み。', { type: 'rest', turns: 1, badge: '兵糧一休み', text: '兵糧補給のため陣中にて一休み（一回休み）' }, 'historical-adaptation'],
  ['wa_hayauma', 'わ：和田義盛・早馬伝令', 'わだよしもり はやうま', 'yukimura', 'jump', 2, 0, 0, '', '【わ】早馬の急報により「よ（#14 義経八艘飛び）」の格へ二格飛び進む！', { type: 'moveTo', target: 14, kana: 'よ', badge: '早馬にて「よ」へ', text: '早馬伝令の急報に乗り「よ（#14）」の格へ二格飛び進む' }, 'historical-adaptation'],
  ['ka_teppo', 'か：梶原景季・鉄砲弾幕', 'かじわらかげすえ てっぽう', 'tekijin', 'jump', -3, 0, 0, '', '【か】敵陣の激しい弾幕に阻まれ、「る（#10 陣太鼓）」の格へ三格退く。', { type: 'returnTo', target: 10, kana: 'る', badge: '「る」の格へ退く', text: '敵陣の弾幕により「る（#10）」の格へ三格押し戻される' }, 'historical-adaptation'],
  ['yo_shinobi', 'よ：義経八艘飛び・忍び', 'よしつね しのび', 'shinobi', 'normal', 0, 0, 0, '', '【よ】夜陰に乗じて敵陣を探る忍び間者と八艘飛びの奇策。', null, 'museum-verified'],
  ['ta_kabuto2', 'た：平忠度・予備兜陣', 'たいらのただのり かぶと', 'kabuto', 'token', 0, 0, 1, '兜', '【た】文武両道の薩摩守・平忠度と予備兜陣。', null, 'museum-verified'],
  ['re_tachi2', 'れ：上杉謙信・予備太刀陣', 'うえすぎけんしん たち', 'tachi', 'token', 0, 0, 2, '太刀', '【れ】越後の龍・上杉謙信の太刀陣。', null, 'museum-verified'],
  ['so_jomon', 'そ：曽我五郎・城門突破', 'そがごろう じょうもん', 'masashige', 'jump', 2, 0, 0, '', '【そ】曽我五郎時致の剛力で城門を突破し、「ね（#19 本陣守備隊）」へ二格進む！', { type: 'moveTo', target: 19, kana: 'ね', badge: '城門突破「ね」へ', text: '大槌で城門を突破し、「ね（#19）」の格へ二格飛び進む' }, 'historical-adaptation'],
  ['tsu_taiko2', 'つ：塚原卜伝・予備太鼓陣', 'つかはらぼくでん たいこ', 'jindaiko', 'token', 0, 0, 4, '陣太鼓', '【つ】剣聖・塚原卜伝と本陣の陣太鼓。', null, 'museum-verified'],
  ['ne_honjin', 'ね：武蔵坊弁慶・本陣守備', 'むさしぼうべんけい ほんじん', 'benkei', 'stay', 0, 1, 0, '', '【ね】衣川の館にて仁王立ちする武蔵坊弁慶。守備固めのため一休み。', { type: 'rest', turns: 1, badge: '弁慶立往生休', text: '弁慶の立往生・本陣守備固めにつき一休み（一回休み）' }, 'historical-adaptation'],
  ['na_kesshi', 'な：那須与一・決死突撃', 'なすのよいち けっし', 'kesshi', 'normal', 0, 0, 0, '', '【な】屋島の浦にて扇の的を射抜いた那須与一の決死行。', null, 'museum-verified'],
  ['ra_gozen', 'ら：源頼光・御前関門', 'みなもとのらいこう ごぜん', 'agarimae', 'jump', -2, 0, 0, '', '【ら】御前親衛隊の関門に阻まれ、「ね（#19）」の格へ二格退く。', { type: 'returnTo', target: 19, kana: 'ね', badge: '御前関門二格戻', text: '御前親衛隊の関門により「ね（#19）」へ二格押し戻される' }, 'historical-adaptation'],
  ['mu_agarimae', 'む：無双凱旋・上り前', 'むそうがいせん あがりまえ', 'kachidoki', 'normal', 0, 0, 0, '', '【む】勝鬨の声を上げて主君の待つ御前へ！次の一歩で上り！', null, 'museum-verified'],
  ['shukun_hosho_agari', '主君褒賞・大上り', 'しゅくんほうしょう おおあがり', 'agari', 'goal', 0, 0, 0, '', '【う・上り】いろは武者双六の終着・主君褒賞の大上り！ここに先着した者が勝利。', null, 'museum-verified'],
];

const kesshuNodes = KESSHU_RAW.map((row, i) => {
  const [slugId, title, reading, art, kind, jumpDelta, stayTurns, tokens, tokenLabel, caption, landingInstruction, sourceNote] = row;
  return {
    id: i,
    iroha: IROHA[i],
    slugId,
    title,
    reading,
    art,
    illustration: art,
    kind,
    movementMode: 'tobi-mawari',
    seal: kind === 'goal' ? '上' : kind === 'token' ? '備' : kind === 'stay' ? '泊' : kind === 'jump' ? (jumpDelta > 0 ? '突' : '奇') : IROHA[i],
    stayTurns: stayTurns || 0,
    jumpTable: jumpDelta ? [jumpDelta, jumpDelta, jumpDelta, jumpDelta, jumpDelta, jumpDelta] : [0, 0, 0, 0, 0, 0],
    dieDestinations: null,
    landingInstruction,
    caption,
    sourceNote: sourceNote || 'museum-verified',
    tokens,
    tokenLabel,
    rule: landingInstruction ? `${caption} （${landingInstruction.text}）` : caption,
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
  movementMode: 'tobi-mawari',
  styleLabel: '飛び廻り双六（いろは武者双六）',
  title: '英勇揃伊呂波双六',
  shortTitle: '英勇揃伊呂波',
  artists: '歌川芳虎『英勇揃伊呂波双六』・『源平ふりわけ双六』風',
  historicalSource: '江戸—明治期『英勇揃伊呂波双六』・いろは武者双六',
  paper: '#e9d6ad',
  ink: '#1d1712',
  accent: '#9a2924',
  accent2: '#3c5d45',
  start: 0,
  goal: 23,
  startNodeId: 'iroha_shutsujin',
  goalNodeId: 'shukun_hosho_agari',
  goalRule: {
    type: 'reach',
    description: 'いろは順に駒を進め、格の送り指示（「ち」へ進む、「と」へ退く等）に従って「主君褒賞・大上り」へ先着した者が勝利',
  },
  allowSharedSquare: true,
  clashPush: 3,
  stealTokenOnDuel: true,
  bounceBack: false,
  requiredTokens: 3, // Used in legacy mode; historical mode ignores requiredTokens and allows direct goal entry
  historicalRequiredTokens: 0,
  maxTurns: 150,
  nodes: chainNext(kesshuNodes, 23),
  cardIds: ['kesshu_01', 'kesshu_02', 'kesshu_03', 'kesshu_04', 'kesshu_05', 'kesshu_06', 'kesshu_07', 'kesshu_08', 'kesshu_09'],
  blurb: '「い・ろ・は・に・ほ・へ・と…」の仮名見出しに沿って古今の名将・豪傑の逸話を巡り、送り指示を経て主君褒賞の上りを目指す飛び廻り双六。',
  ruleSummary: '【飛び廻り双六】賽の目だけ連続移動し、止まった武将格に記された伊呂波（いろは）送り指示や兵糧休みを1回実行する。歴史絵双六モードでは武具ロックや戦闘姿勢はなく、純粋に上り一番乗りを競う。',
  ruleBrief: '飛び廻り双六・いろは仮名見出しと武将逸話（歴史モードは武具ロックなし）',
  layout: 'tilted-warrior-cards',
  shape: 'warrior-card',
  ui: {
    skin: 'black-lacquer-armor',
    panelTitle: '伊呂波武者鑑',
    panelSub: 'いろは順・武将逸話',
    diceDevice: '六角金蒔絵陣中筒',
    diceShape: 'hex-makie',
    hud: 'kesshu-regalia',
    hudLabel: '伊呂波進度',
  },
};

/* ------------------------------------------------------------------ */
/* 巻ノ肆：源氏物語物語双六（飛び廻り双六 / movementMode: 'tobi-mawari'）*/
/* Reference: 国文学研究資料館・源氏物語五十四帖絵双六                   */
/* ------------------------------------------------------------------ */

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

const GENJI_OUTER_RAW = [
  ['kiritsubo_start', '桐壺', 'きりつぼ', 'kiritsubo', '桐壺更衣・光源氏', 'いづれの御時にか、女御・更衣あまたさぶらひ給ひける', '第一帖「桐壺」（振り出し）。光る君の誕生と宮中の物語がここから始まる。', null],
  ['hahakigi', '帚木', 'ははきぎ', 'hahakigi', '光源氏・頭中将', '帚木の 心を知らで 園原の 道にあやなく 惑ひぬるかな', '第二帖「帚木」。五月雨の夜、若公達が語り合う「雨夜の品定め」。', null],
  ['utsusemi', '空蝉', 'うつせみ', 'utsusemi', '空蝉・軒端荻', '空蝉の 身をかへてける 木のもとになほ人がらの なつかしきかな', '第三帖「空蝉」。薄衣一枚を残して忍び去った空蝉を偲ぶ帖。', null],
  ['yugao', '夕顔', 'ゆうがお', 'yugao', '夕顔の君', '心あてに それかとぞ見る 白露の 光そへたる 夕顔の花', '第四帖「夕顔」。五条の白き夕顔の宿りと儚き恋。', null],
  ['wakamurasaki', '若紫', 'わかむらさき', 'wakamurasaki', '若紫（紫の上）', '手に摘みて いつしかも見む 紫の ねに通ひける 野辺の若草', '第五帖「若紫」。北山の垣間見より二条院へ迎え入れ、「紅葉賀（#6）」へ二格進む。', { type: 'moveTo', target: 'momijinoga', badge: '紅葉賀へ進む', text: '若紫を二条院へ迎え入れ、「紅葉賀（#6）」へ二格飛び進む' }],
  ['suetsumuhana', '末摘花', 'すえつむはな', 'suetsumuhana', '末摘花', 'なつかしき 色ともなしに 何にこの すえつむ花を 袖に触れけむ', '第六帖「末摘花」。雪の朝、古風な常陸宮の姫君の邸にて一休み。', { type: 'rest', turns: 1, badge: '雪の朝一休み', text: '末摘花の古びた館にて雪見の一休み（一回休み）' }],
  ['momijinoga', '紅葉賀', 'もみじのが', 'momijinoga', '光源氏・藤壺', 'もの思ふに 立ち舞ふべくも あらぬ身の 袖うち振りし 心知りきや', '第七帖「紅葉賀」。朱雀院の行幸にて紅葉の挿頭をつけ「青海波」を舞う。', null],
  ['hananoen', '花宴', 'はなのえん', 'hananoen', '朧月夜の君', '深き夜の あはれを知るも 入る月のおぼろけならぬ 契りとぞ思ふ', '第八帖「花宴」。南殿の桜の宴の夜、朧月夜の君と扇を取り交わす。', null],
  ['aoi', '葵', 'あおい', 'aoi', '葵の上・六条御息所', 'はかりなき 千尋の底の 海松房の 生ひゆく末は 我のみぞ見む', '第九帖「葵」。賀茂祭の車争いと物の怪の障りにより「紅葉賀（#6）」へ二格戻る。', { type: 'returnTo', target: 'momijinoga', badge: '車争い二格戻', text: '葵祭の車争いと物の怪の障りにより「紅葉賀（#6）」へ二格引き返す' }],
  ['sakaki', '賢木', 'さかき', 'sakaki', '六条御息所', '神垣は しるしの杉も なきものを いかにまがへて 折れるさかきぞ', '第十帖「賢木」。嵯峨野の野宮に六条御息所を訪ねる秋草の別れ。', null],
  ['hanachirusato', '花散里', 'はなちるさと', 'hanachirusato', '花散里', '橘の 香をなつかしみ ほととぎす 花散る里を たづねてぞとふ', '第十一帖「花散里」。橘の花香る夏の夜、穏やかな麗人を訪ねる。', null],
  ['suma', '須磨', 'すま', 'suma', '光源氏', 'ふるさとを 峰の霞は 隔つれど ながむる空は 同じ雲居か', '第十二帖「須磨」。都を離れ須磨の浦に退居し、秋風のわび住まいに一休み。', { type: 'rest', turns: 1, badge: '須磨わび住まい', text: '須磨の浦への退居・わび住まいにつき一休み（一回休み）' }],
  ['akashi', '明石', 'あかし', 'akashi', '明石の君', '秋の夜に 宿かる月の 影ながら まさりて見ゆる 琴のねのさや', '第十三帖「明石」。明石の浦にて琴の音を交わし、帰京の宣旨により「蓬生（#14）」へ二格進む。', { type: 'moveTo', target: 'yomogiu', badge: '帰京二格進む', text: '住吉の導きにより明石から都へ帰還し、二格先の「蓬生（#14）」へ進む' }],
  ['miotsukushi', '澪標', 'みおつくし', 'miotsukushi', '光源氏・明石の君', 'みをつくし 恋ふるしるしに ここまでも めぐり逢ひける えには深しな', '第十四帖「澪標」。住吉詣でにて船上の光源氏と明石の君がすれ違う宿縁の帖。', null],
  ['yomogiu', '蓬生', 'よもぎう', 'yomogiu', '末摘花・惟光', '尋ねても われこそ訪はめ 道もなく 深き蓬の もとの心を', '第十五帖「蓬生」。深い蓬に埋もれた荒廃の邸に足を取られ、「明石（#12）」へ二格戻る。', { type: 'returnTo', target: 'akashi', badge: '深き蓬二格戻', text: '荒れ果てた蓬の露に道を阻まれ、「明石（#12）」へ二格引き返す' }],
  [
    'sekiya', '関屋', 'せきや', 'sekiya', '光源氏・空蝉',
    'わくらばに 行きあふ道を 頼みしも なほかひなしや 潮ならぬ海',
    '第十六帖「関屋」。逢坂の関にて「六条院・四季の雅帖（#16〜#20）」と「波乱・哀愁の帖（#21〜#25）」へ物語の道が分かれる。',
    {
      type: 'branch',
      badge: '物語の二道分岐',
      text: '逢坂の関にて「六条院・四季の雅帖」か「波乱・哀愁の帖」を選択（非対話時は偶奇分岐）',
      routes: [
        { id: 'good', label: '六条院・四季の雅帖（絵合〜胡蝶）', target: 16 },
        { id: 'evil', label: '波乱・哀愁の帖（朝顔〜野分）', target: 21 },
      ],
    },
  ],
];

const genjiOuterNodes = GENJI_OUTER_RAW.map((row, i) => {
  const [slugId, title, reading, art, character, waka, caption, landingInstruction] = row;
  const isStay = i === 5 || i === 11;
  const isJump = i === 4 || i === 12;
  const isTrap = i === 8 || i === 14;
  return {
    id: i,
    slugId,
    title,
    reading,
    art,
    illustration: art,
    kind: i === 0 ? 'start' : i === 15 ? 'branch' : isStay ? 'stay' : (isJump || isTrap) ? 'jump' : 'normal',
    movementMode: 'tobi-mawari',
    seal: i === 15 ? '岐' : isStay ? '泊' : isJump ? '飛' : isTrap ? '祟' : String(i + 1).padStart(2, '0'),
    stayTurns: isStay ? 1 : 0,
    jumpTable: isJump ? [2, 2, 2, 2, 2, 2] : isTrap ? [-2, -2, -2, -2, -2, -2] : [0, 0, 0, 0, 0, 0],
    dieDestinations: null,
    landingInstruction,
    character,
    waka,
    caption,
    sourceNote: i === 15 ? 'historical-adaptation' : 'museum-verified',
    tokens: 0,
    rule: landingInstruction ? `${caption} （${landingInstruction.text}）` : caption,
    ...GENJI_STRIP_RECTS[i],
    color: GENJI_BERO[i % 4],
    palette: i % 4,
    stripColor: GENJI_BERO[i % 4],
  };
});

// 5 Golden Good Track squares (#16..#20)
const goodNodes = [
  [
    'eawase', '絵合', 'えあわせ', 'eawase', [2, 2, 2, 2, 2, 2], 0,
    '梅壺女御・冷泉帝', 'みるめこそうらぶれぬらめ 年経にし 伊勢の海人の 名をば沈めじ',
    '第十七帖「絵合」。帝の御前にて物語絵を競い、須磨の絵日記の賞賛により「薄雲（#18）」へ二格進む。',
    { type: 'moveTo', target: 'usugumo', badge: '絵合勝鬨二格進', text: '絵合の勝利により「第十九帖 薄雲（#18）」へ二格飛び進む' },
  ],
  [
    'matsukaze', '松風', 'まつかぜ', 'matsukaze', [0, 0, 0, 0, 0, 0], 0,
    '明石の君', '身を変へて 一人帰れる 山里に 聞きしに似たる 松風ぞ吹く',
    '第十八帖「松風」。大堰川の山荘に明石の君が上京し、琴の音が松風に響く。',
    null,
  ],
  [
    'usugumo', '薄雲', 'うすぐも', 'usugumo', [0, 0, 0, 0, 0, 0], 0,
    '藤壺中宮・明石の姫君', '入日さす 峰にたなびく 薄雲は もの思ふ袖に 色や紛へる',
    '第十九帖「薄雲」。二条院へ迎えられた明石の姫君の愛らしさと春の御殿。',
    null,
  ],
  [
    'hatsune', '初音', 'はつね', 'hikaru', [1, 1, 1, 0, 0, -2], 0,
    '紫の上・明石の姫君', '年月を 松にひかれて 経る人に 今日鴬の 初音聞かせよ',
    '第二十三帖「初音」。六条院の新春の祝宴と鴬の初音。',
    null,
  ],
  [
    'kocho', '胡蝶', 'こちょう', 'murasaki', [0, 0, 0, 0, 0, 0], 0,
    '紫の上・秋好中宮', '花園の 胡蝶をさへや 下草に 秋まつ虫は うとく見るらむ',
    '第二十四帖「胡蝶」。春の御前の池に龍頭鷁首の船を浮かべ、船楽を奏でながら大上りへ！',
    null,
  ],
].map((row, i) => {
  const [slugId, title, reading, art, jumpTable, stayTurns, character, waka, caption, landingInstruction] = row;
  return {
    id: 16 + i,
    slugId,
    title,
    reading,
    art,
    illustration: art,
    kind: 'good',
    movementMode: 'tobi-mawari',
    seal: '善',
    stayTurns,
    jumpTable,
    dieDestinations: null,
    landingInstruction,
    character,
    waka,
    caption,
    sourceNote: 'museum-verified',
    tokens: 0,
    rule: landingInstruction ? `${caption} （${landingInstruction.text}）` : caption,
    x: [596, 480, 364, 248, 132][i],
    y: 162,
    w: 108,
    h: 98,
    color: '#b48b31',
    palette: 1,
  };
});

// 5 Purple Evil / Turbulent Track squares (#21..#25)
const evilNodes = [
  [
    'asagao', '朝顔', 'あさがお', 'asagao', [0, 0, 0, 0, 0, 0], 1,
    '朝顔の姫君', '見しおりの 露わすられぬ 朝顔の 花の盛りは 過ぎやしぬらむ',
    '第二十帖「朝顔」。冬の夜の雪まろばしと朝顔の姫君の物思い。一休み。',
    { type: 'rest', turns: 1, badge: '雪の夜一休み', text: '凍る月夜の物思いに耽り一休み（一回休み）' },
  ],
  [
    'otome', '少女', 'おとめ', 'otome', [0, 0, 0, 0, 0, 0], 2,
    '夕霧・雲居の雁', '日かげにも しるかりけめや 少女子が 天の羽袖に かけし心は',
    '第二十一帖「少女」。五節の舞姫と大学寮の試練。学問修行のため二回休み。',
    { type: 'rest', turns: 2, badge: '大学寮二休み', text: '夕霧の大学寮修行につき二回休み' },
  ],
  [
    'tamakazura', '玉鬘', 'たまかずら', 'tamakazura', [-2, -2, -2, -2, -2, -2], 0,
    '玉鬘・右近', '恋ひわたる 身はそれながら 玉かづら いかなる筋を 尋ね来つらむ',
    '第二十二帖「玉鬘」。筑紫より上京し初瀬観音で巡り逢うまでの長旅。「朝顔（#21）」へ二格戻る。',
    { type: 'returnTo', target: 'asagao', badge: '筑紫舟路二格戻', text: '筑紫よりの舟路の波風により「朝顔（#21）」へ二格戻る' },
  ],
  [
    'tokonatsu', '常夏', 'とこなつ', 'rokujo', [2, 2, 0, 0, -1, -2], 0,
    '光源氏・玉鬘', '撫子の とこなつかしき 色を見ば もとの垣根を 人や尋ねむ',
    '第二十六帖「常夏」。夏の釣殿にて和琴の調べを聴く。',
    null,
  ],
  [
    'nowaki', '野分', 'のわき', 'fujitsubo', [-3, -2, 0, 0, 1, 1], 0,
    '夕霧・紫の上', '風さわぎ 村雲まよふ 夕べにも 忘るる間なく 忘られぬ君',
    '第二十八帖「野分」。秋の野分の嵐が六条院の庭を吹き抜ける。次はいよいよ大上り！',
    null,
  ],
].map((row, i) => {
  const [slugId, title, reading, art, jumpTable, stayTurns, character, waka, caption, landingInstruction] = row;
  return {
    id: 21 + i,
    slugId,
    title,
    reading,
    art,
    illustration: art,
    kind: 'evil',
    movementMode: 'tobi-mawari',
    seal: '悪',
    stayTurns,
    jumpTable,
    dieDestinations: null,
    landingInstruction,
    character,
    waka,
    caption,
    sourceNote: 'museum-verified',
    tokens: 0,
    rule: landingInstruction ? `${caption} （${landingInstruction.text}）` : caption,
    x: [596, 480, 364, 248, 132][i],
    y: 386,
    w: 108,
    h: 98,
    color: '#3b2342',
    palette: 2,
  };
});

const genjiGoal = {
  id: 26,
  slugId: 'rokujoin_agari',
  title: '源氏絵合・六条院上り',
  reading: 'げんじ えあわせ ろくじょういんあがり',
  art: 'genji',
  illustration: 'genji',
  kind: 'goal',
  movementMode: 'tobi-mawari',
  seal: '上',
  stayTurns: 0,
  jumpTable: [0, 0, 0, 0, 0, 0],
  dieDestinations: null,
  landingInstruction: null,
  character: '光源氏・紫の上',
  waka: '法の師と 尋ぬる道を しるべにて 思はぬ山に 踏み惑ふかな',
  caption: '源氏物語絵双六の大団円（上り）。金地御簾の六条院へ辿り着いた者が勝利。',
  sourceNote: 'museum-verified',
  tokens: 0,
  rule: '五十四帖の終着「源氏絵合・六条院上り」',
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
genjiNodes[15].next = [16, 21];

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
  movementMode: 'tobi-mawari',
  styleLabel: '飛び廻り双六（源氏物語双六）',
  title: '源氏物語五十四帖・絵合双六',
  shortTitle: '源氏物語絵合',
  artists: '歌川国芳『源氏繪合』・国文学研究資料館蔵《源氏物語双六》風',
  historicalSource: '国文学研究資料館・源氏物語五十四帖絵双六 / 歌川国芳『源氏繪合』',
  paper: '#eadbb8',
  ink: '#1d1710',
  accent: '#8a2e37',
  accent2: '#304f58',
  start: 0,
  goal: 26,
  startNodeId: 'kiritsubo_start',
  goalNodeId: 'rokujoin_agari',
  goalRule: {
    type: 'reach',
    description: '第一帖「桐壺」より源氏物語の和歌と巻々を辿り、「源氏絵合・六条院上り」へ到達した者が勝利',
  },
  allowSharedSquare: true,
  clashPush: 2,
  bounceBack: false,
  requiredTokens: 0,
  maxTurns: 150,
  nodes: genjiNodes,
  cardIds: ['genji_01', 'genji_02', 'genji_03', 'genji_04', 'genji_05', 'genji_06', 'genji_07', 'genji_08', 'genji_09'],
  blurb: '第一帖「桐壺」から「若紫」「須磨」「明石」、そして関屋（#15）での物語分岐を経て「六条院上り」へ至る王朝物語双六。',
  ruleSummary: '【飛び廻り双六】各帖の和歌と人物を読みながら進み、須磨の退居（一休み）や明石からの帰京（飛び進み）、関屋（#15）での二道分岐を経て大上りを目指す。歴史モードでは善悪数値や怨念デバフは行わない。',
  ruleBrief: '飛び廻り双六・源氏物語の和歌と巻送り（桐壺〜六条院上り）',
  layout: 'four-color-split-tracks',
  shape: 'vertical-strip',
  ui: {
    skin: 'gold-nashiji-casket',
    panelTitle: '源氏五十四帖鑑',
    panelSub: '和歌・巻名・登場人物',
    diceDevice: '朱漆金鶴蒔絵振筒',
    diceShape: 'vermilion-crane',
    hud: 'genji-balance',
    hudLabel: '物語巻進度',
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
for (const n of TOKAIDO_53_FULL_NODES) {
  n.features = [n.kind];
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
  if (n.id <= 15) n.progressValue = n.id;
  else if (n.id >= 16 && n.id <= 20) n.progressValue = n.id;
  else if (n.id >= 21 && n.id <= 25) n.progressValue = n.id - 5;
  else n.progressValue = 21;
}

/* ------------------------------------------------------------------ */
/* 懐中守り札（全十二種・図鑑鑑賞 ＆ 旧版拡張モード互換）                 */
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
/* 三十六枚 錦絵大図鑑（浮世絵蒐集・鑑賞・旧版手札互換）                 */
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
  6: { type: 'volume_mechanic', label: 'この画帖の固有目標を達成する' },
  7: { type: 'veteran_goal', label: 'この画帖で累計2勝を達成' },
  8: { type: 'beat_hard_ai', label: '困難AIに勝利、または歴史絵双六で勝利する' },
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
    { id: `${b.id}_core_mechanic`, boardIndex: idx, title: `${b.shortTitle}・古法極意`, desc: `${b.title}の絵双六の趣向を体験し勝利する` },
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
  const playerCount = Math.max(2, Math.min(4, Number(options.playerCount) || 2));
  const humanSide = Math.max(0, Math.min(playerCount - 1, Number(options.humanSide) || 0));
  const aiSide = humanSide === 0 ? 1 : 0;
  const mode = options.mode === 'local2p' ? 'local2p' : 'ai';
  const aiDifficulty = ['easy', 'normal', 'hard', 'master'].includes(options.aiDifficulty)
    ? options.aiDifficulty
    : 'normal';

  // Rule mode:
  //   - 'historical' (Default for new matches): authentic Edo-Meiji paper E-Sugoroku (mawari / tobi / tobi-mawari, peaceful same-square coexistence, no combat/buffs)
  //   - 'kitsune': Ansei 4 (1857) Utagawa Kunisato 『しん工夫けん双六』（狐拳名所双六）
  //   - 'legacy': V1.1-V1.3 tactical expansion mode ( автоматически selected when legacy test options like customCard/opponentCard/charms are explicitly supplied without ruleMode: 'historical')
  const explicitLegacyOptions = Boolean(
    options.ruleMode === 'legacy' ||
    (!options.ruleMode && (options.customCard || options.opponentCard || Array.isArray(options.charms) || Array.isArray(options.opponentCharms)))
  );
  const ruleMode = options.ruleMode || (explicitLegacyOptions ? 'legacy' : 'historical');

  const humanCharms = Array.isArray(options.charms)
    ? sanitizeCharmLoadout(options.charms, board.id)
    : (ruleMode === 'legacy' ? [...DEFAULT_CHARM_IDS] : []);
  const rawOppCharms = options.opponentCharms ?? options.charmsP1;
  const opponentCharms = Array.isArray(rawOppCharms)
    ? sanitizeCharmLoadout(rawOppCharms, board.id)
    : [];

  const charmLoadout = Array.from({ length: playerCount }, (_, idx) => {
    if (idx === humanSide) return [...humanCharms];
    if (idx === aiSide) return [...opponentCharms];
    return [];
  });

  const charmMaskFor = side => (charmLoadout[side] || []).reduce((mask, id) => {
    const charm = CHARM_BY_ID[id];
    return mask | (charm ? charm.mask : 0);
  }, 0);

  const chosenCard = ruleMode === 'legacy' ? getCardById(options.customCard) : null;
  const customBuff = chosenCard && chosenCard.buff
    ? {
        ...chosenCard.buff,
        cardId: chosenCard.id,
        cardTitle: chosenCard.title,
        firstRollPending: (chosenCard.buff.firstRollBonus | 0) > 0,
      }
    : null;

  const opponentCardObj = ruleMode === 'legacy' ? getCardById(options.opponentCard) : null;
  const opponentBuff = opponentCardObj && opponentCardObj.buff
    ? {
        ...opponentCardObj.buff,
        cardId: opponentCardObj.id,
        cardTitle: opponentCardObj.title,
        firstRollPending: (opponentCardObj.buff.firstRollBonus | 0) > 0,
      }
    : null;

  const pos = Array(playerCount).fill(board.start);
  const tokens = Array(playerCount).fill(0);
  const skip = Array(playerCount).fill(0);
  const koma = Array.from({ length: playerCount }, (_, idx) => HISTORICAL_KOMA[idx % HISTORICAL_KOMA.length].id);
  const kashi = Array(playerCount).fill(5); // 5 sweet tokens (菓子) per player for Kitsune-ken mode
  const direction = Array.from({ length: playerCount }, (_, idx) => (ruleMode === 'kitsune' && idx % 2 === 1 ? -1 : 1));

  if (ruleMode === 'legacy' && customBuff) {
    const bonusPos = Math.max(0, Math.min(2, customBuff.startPosBonus | 0));
    pos[humanSide] = Math.min(board.goal - 1, board.start + bonusPos);
    tokens[humanSide] = customBuff.initialTokens | 0;
  }
  if (ruleMode === 'legacy' && opponentBuff) {
    const bonusPos = Math.max(0, Math.min(2, opponentBuff.startPosBonus | 0));
    pos[aiSide] = Math.min(board.goal - 1, board.start + bonusPos);
    tokens[aiSide] = opponentBuff.initialTokens | 0;
  }

  const initialCoins = Array.from({ length: playerCount }, (_, idx) =>
    ruleMode === 'legacy' && (charmLoadout[idx] || []).includes('tokaido_pass') && board.id === 'tokaido' ? 2 : 0
  );
  const initialGourmetMask = Array.from({ length: playerCount }, (_, idx) =>
    ruleMode === 'legacy' && board.id === 'tokaido' && (tokens[idx] & 1) ? 1 : 0
  );
  for (let i = 0; i < playerCount; i++) {
    if (initialGourmetMask[i]) initialCoins[i] = Math.min(3, initialCoins[i] + 1);
  }

  const seed = Number.isInteger(options.seed) ? (options.seed >>> 0) : ((Date.now() ^ 0x9e3779b9) >>> 0);

  return {
    boardIndex,
    boardId: board.id,
    ruleMode,
    movementMode: board.movementMode || board.style || 'mawari',
    playerCount,
    mode,
    aiDifficulty,
    koma,
    kashi,
    direction,
    kitsuneCount: 0,
    lastKitsuneResult: null,
    players: Array.from({ length: playerCount }, (_, idx) => ({
      index: idx,
      koma: koma[idx],
      komaName: HISTORICAL_KOMA[idx % HISTORICAL_KOMA.length].name,
      type: idx === humanSide ? 'human' : (mode === 'local2p' ? 'human' : 'ai'),
      difficulty: idx === humanSide || mode === 'local2p' ? null : aiDifficulty,
    })),
    pos,
    tokens,
    skip,
    charms: Array.from({ length: playerCount }, (_, idx) => charmMaskFor(idx)),
    charmUsed: Array(playerCount).fill(0),
    charmLoadout,
    charmCooldown: Array.from({ length: playerCount }, () => ({})),
    windActive: Array(playerCount).fill(false),
    customCard: chosenCard ? chosenCard.id : null,
    customBuff,
    equippedCard: Array.from({ length: playerCount }, (_, idx) => {
      if (idx === humanSide) return chosenCard?.id || null;
      if (idx === aiSide) return opponentCardObj?.id || null;
      return null;
    }),
    playerBuffs: Array.from({ length: playerCount }, (_, idx) => {
      if (idx === humanSide) return customBuff;
      if (idx === aiSide) return opponentBuff;
      return null;
    }),
    strikeCooldown: Array(playerCount).fill(0),
    duelCount: 0,
    stealCount: Array(playerCount).fill(0),
    turn: humanSide === 0 ? 0 : 1,
    humanSide,
    winner: -1,
    resultReason: null,
    turnCount: 0,
    ply: 0,
    maxPly: Number.isInteger(options.maxPly) ? options.maxPly : (board.maxTurns || 140),
    playerTurnCount: Array(playerCount).fill(0),
    pendingChoice: null,
    boardState: {
      tokaido: {
        gourmetMask: initialGourmetMask,
        coins: initialCoins,
        coinsSpent: Array(playerCount).fill(0),
      },
      yokai: {
        lanternMask: Array(playerCount).fill(0),
        frenzyPending: Array(playerCount).fill(false),
        frenzyEarned: Array(playerCount).fill(false),
        frenzyTriggered: Array(playerCount).fill(false),
      },
      kesshu: {
        tempShield: Array(playerCount).fill(false),
        lastStance: Array(playerCount).fill(null),
        stanceCount: Array(playerCount).fill(0),
      },
      genji: {
        routeChoice: Array(playerCount).fill(null),
        balance: Array(playerCount).fill(0),
        grudgeMarks: Array(playerCount).fill(0),
      },
    },
    rngSeed: seed,
    rngState: seed,
    events: [],
    lastRoll: 0,
    history: [],
  };
}
