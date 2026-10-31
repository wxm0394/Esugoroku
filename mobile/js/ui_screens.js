// Volume selection, side/charm selection, print gallery and result screen.
import {
  W, H, G, SELECT_CARD_W, SELECT_CARD_H, SIDE_MODAL, SIDE_CARDS, CHARM_SLOTS,
  START_BTN, SIDE_GALLERY_BTN, SIDE_BACK_BTN, SETTLEMENT_PANEL, SETTLEMENT_BTNS,
  GALLERY_CARD_W, GALLERY_CARD_H, GALLERY_CLOSE, FONT_BRUSH, FONT_MINCHO,
  getSelectBoardRect, getGalleryCardRect, currentBoard,
} from './state.js';
import {
  BOARDS, UKIYOE_CARDS, CARD_BY_ID, CHARMS, getBoard,
} from './boards.js';
import {
  PALETTE, washiPaper, bokashi, drawPattern, drawCloud, drawSeal, roundRect,
  goldFleck, drawLantern, drawTorii, drawPine, drawCrane,
} from './ukiyoe_art.js';
import {
  drawUkiyoeCard, drawCharmCard, drawCardBack, drawMiniCardArt, drawSprig,
} from './ukiyoe_art.js';
import { drawMiniBoardPreview } from './board_renderer.js';

const TAU = Math.PI * 2;
export const TABS = {
  cards: { x: 748, y: 61, w: 142, h: 34 },
  charms: { x: 898, y: 61, w: 142, h: 34 },
};
export const SELECT_GALLERY = { x: 1112, y: 13, w: 140, h: 38 };

function font(ctx, size, weight = '500', brush = false) {
  ctx.font = `${weight} ${size}px ${brush ? FONT_BRUSH : FONT_MINCHO}`;
}

function fitText(ctx, text, maxWidth, startSize, weight = '500', brush = false, min = 6) {
  let size = startSize;
  while (size > min) {
    font(ctx, size, weight, brush);
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 0.5;
  }
  return size;
}

function clippedText(ctx, text, x, y, maxWidth, size, color, weight = '500', brush = false) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y - size * 1.2, maxWidth, size * 2.5);
  ctx.clip();
  fitText(ctx, text, maxWidth, size, weight, brush);
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function backdrop(ctx) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#2b1f17');
  g.addColorStop(0.4, '#15110f');
  g.addColorStop(1, '#0c0a0a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  goldFleck(ctx, 0, 0, W, H, 'select-bg', 190);
  drawPattern(ctx, 'asanoha', 0, 0, W, H, '#be9a55', 0.045, 45);
  const vg = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * 0.75);
  vg.addColorStop(0, 'rgba(249,228,178,0.08)');
  vg.addColorStop(1, 'rgba(0,0,0,0.52)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function titleHeader(ctx, title, sub) {
  ctx.save();
  ctx.fillStyle = 'rgba(20,15,12,0.85)';
  ctx.fillRect(10, 8, W - 20, 44);
  ctx.strokeStyle = 'rgba(180,146,79,0.65)';
  ctx.lineWidth = 1;
  ctx.strokeRect(10.5, 8.5, W - 21, 43);
  ctx.fillStyle = '#f1e2bc';
  font(ctx, 25, '700', true);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 28, 30);
  ctx.fillStyle = 'rgba(205,178,121,0.66)';
  font(ctx, 8, '500');
  ctx.fillText(sub, 30, 44);
  ctx.restore();
}

function boardSkinCard(ctx, board, x, y, w, h, hover) {
  ctx.save();
  if (hover) {
    ctx.shadowColor = 'rgba(230,190,105,0.36)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 6;
  }
  if (board.id === 'tokaido') {
    washiPaper(ctx, x, y, w, h, '#d9be85', { seed: 'select-tokaido' });
    drawPattern(ctx, 'seigaiha', x, y, w, h * 0.4, '#315e78', 0.12, 24);
    ctx.strokeStyle = 'rgba(74,45,21,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  } else if (board.id === 'yokai') {
    ctx.fillStyle = '#171d1e';
    ctx.fillRect(x, y, w, h);
    drawPattern(ctx, 'sayagata', x, y, w, h, '#c0a974', 0.07, 23);
    goldFleck(ctx, x, y, w, h, 'select-yokai', 35);
    ctx.strokeStyle = 'rgba(198,168,104,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  } else if (board.id === 'kesshu') {
    ctx.fillStyle = '#1b1714';
    ctx.fillRect(x, y, w, h);
    drawPattern(ctx, 'kikko', x + 4, y + 4, w - 8, h - 8, '#c9a14a', 0.11, 26);
    goldFleck(ctx, x, y, w, h, 'select-kesshu', 45);
    ctx.strokeStyle = 'rgba(195,155,72,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  } else {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#9f7c36');
    g.addColorStop(0.48, '#dcc178');
    g.addColorStop(1, '#8a662a');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    goldFleck(ctx, x, y, w, h, 'select-genji', 70);
    ctx.strokeStyle = 'rgba(65,43,16,0.72)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  }
  ctx.shadowColor = 'transparent';
  // Inner border.
  ctx.strokeStyle = board.id === 'tokaido' ? 'rgba(99,62,28,0.4)' : 'rgba(228,203,154,0.25)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
  ctx.restore();
}

let selectScreenCache = null;
let selectScreenCacheCount = -1;

function renderSelectScreenStatic(ctx) {
  backdrop(ctx);
  titleHeader(ctx, '四巻の絵双六を選ぶ', 'A CHOICE OF FOUR UKIYO-E PRINT WORLDS');
  // Header gallery button.
  const gb = SELECT_GALLERY;
  ctx.save();
  ctx.fillStyle = 'rgba(38,29,22,0.9)';
  roundRect(ctx, gb.x, gb.y, gb.w, gb.h, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(211,180,108,0.55)';
  ctx.stroke();
  ctx.fillStyle = '#ead6a7';
  font(ctx, 8, '700', true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`錦絵図鑑  ${G.collection.size} / 36`, gb.x + gb.w / 2, gb.y + gb.h / 2);
  ctx.restore();

  for (let i = 0; i < 4; i++) {
    const board = BOARDS[i];
    const r = getSelectBoardRect(i);
    ctx.save();
    boardSkinCard(ctx, board, r.x, r.y, r.w, r.h, false);
    ctx.restore();
    const artW = r.w * 0.6;
    const artH = r.h - 34;
    ctx.save();
    roundRect(ctx, r.x + 14, r.y + 18, artW, artH, 2);
    ctx.clip();
    drawMiniBoardPreview(ctx, i, r.x + 14, r.y + 18, artW, artH);
    ctx.restore();
    ctx.strokeStyle = 'rgba(51,32,18,0.5)';
    ctx.strokeRect(r.x + 14, r.y + 18, artW, artH);

    const tx = r.x + artW + 26;
    const tw = r.w - artW - 44;
    const dark = board.id === 'yokai' || board.id === 'kesshu';
    const ink = dark ? '#efe0b9' : '#2b1d10';
    ctx.save();
    ctx.fillStyle = dark ? 'rgba(226,201,150,0.12)' : 'rgba(51,34,17,0.08)';
    roundRect(ctx, tx - 8, r.y + 16, tw + 12, r.h - 32, 2);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    drawSeal(ctx, tx + 16, r.y + 41, 17, board.volumeKanji, board.accent, 15, true);
    ctx.fillStyle = ink;
    font(ctx, 9, '500', true);
    ctx.fillText(board.volume, tx + 40, r.y + 27);
    font(ctx, 21, '700', true);
    clippedText(ctx, board.shortTitle, tx + 40, r.y + 50, tw - 34, 21, ink, '700', true);
    ctx.fillStyle = dark ? 'rgba(225,205,161,0.75)' : 'rgba(67,44,21,0.72)';
    font(ctx, 7.5, '500');
    ctx.fillText(board.styleLabel, tx, r.y + 82);
    ctx.strokeStyle = dark ? 'rgba(226,204,159,0.28)' : 'rgba(78,51,25,0.30)';
    ctx.beginPath();
    ctx.moveTo(tx, r.y + 94);
    ctx.lineTo(tx + tw, r.y + 94);
    ctx.stroke();
    ctx.fillStyle = dark ? 'rgba(238,220,180,0.82)' : 'rgba(48,32,17,0.82)';
    font(ctx, 7.4, '500');
    const text = board.blurb;
    let line = '';
    let ly = r.y + 108;
    for (const ch of text) {
      if (line.length >= 19) {
        ctx.fillText(line, tx, ly);
        line = '';
        ly += 12;
      }
      line += ch;
    }
    if (line) ctx.fillText(line, tx, ly);
    ctx.fillStyle = dark ? 'rgba(214,191,144,0.6)' : 'rgba(70,48,24,0.6)';
    font(ctx, 6.5, '500');
    ctx.fillText(board.artists, tx, r.y + 168);
    ctx.fillStyle = dark ? 'rgba(30,27,22,0.55)' : 'rgba(247,235,205,0.55)';
    roundRect(ctx, tx, r.y + 193, tw, 78, 2);
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(203,174,113,0.25)' : 'rgba(83,55,26,0.25)';
    ctx.stroke();
    ctx.fillStyle = dark ? '#e4cf9f' : '#3b2916';
    font(ctx, 7, '700', true);
    ctx.fillText('遊 び 方', tx + 9, r.y + 201);
    ctx.fillStyle = dark ? 'rgba(228,209,170,0.8)' : 'rgba(56,38,19,0.82)';
    font(ctx, 6.4, '500');
    let rule = '';
    let ry = r.y + 217;
    for (const ch of board.ruleSummary) {
      if (rule.length >= 23) {
        ctx.fillText(rule, tx + 9, ry);
        rule = '';
        ry += 10;
      }
      rule += ch;
    }
    if (rule) ctx.fillText(rule, tx + 9, ry);
    ctx.fillStyle = dark ? 'rgba(198,166,101,0.55)' : 'rgba(111,76,34,0.55)';
    font(ctx, 6, '500');
    ctx.fillText(`${board.ui.diceDevice} ・ ${board.ui.hudLabel}`, tx + 9, r.y + 259);
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(221,198,151,0.45)';
  font(ctx, 7, '500');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('クリックで巻を選び、次に手番と懐中守り札を決めます。', W / 2, H - 20);
}

export function drawSelectScreen(ctx, time) {
  if (!selectScreenCache || selectScreenCacheCount !== G.collection.size) {
    selectScreenCache = document.createElement('canvas');
    selectScreenCache.width = W;
    selectScreenCache.height = H;
    renderSelectScreenStatic(selectScreenCache.getContext('2d'));
    selectScreenCacheCount = G.collection.size;
  }
  ctx.drawImage(selectScreenCache, 0, 0);
  if (G.hoverBoard >= 0 && G.hoverBoard < 4) {
    const board = BOARDS[G.hoverBoard];
    const r = getSelectBoardRect(G.hoverBoard);
    ctx.save();
    ctx.strokeStyle = 'rgba(230,190,105,0.85)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    ctx.fillStyle = board.accent;
    roundRect(ctx, r.x + r.w - 108, r.y + r.h - 34, 92, 22, 2);
    ctx.fill();
    ctx.fillStyle = '#f7e8c4';
    font(ctx, 7, '700', true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('この巻を開く', r.x + r.w - 62, r.y + r.h - 23);
    ctx.restore();
  }
}

export function drawSideScreen(ctx, time) {
  // Keep the selected volume visible and darken it.
  drawSelectScreen(ctx, time);
  ctx.save();
  ctx.fillStyle = 'rgba(9,7,6,0.72)';
  ctx.fillRect(0, 0, W, H);
  const board = getBoard(G.boardIdx);
  const { x, y, w, h } = SIDE_MODAL;
  // Board-specific frame.
  if (board.id === 'tokaido') {
    washiPaper(ctx, x, y, w, h, '#ddc28b', { seed: 'side-tokaido' });
    drawPattern(ctx, 'seigaiha', x, y, w, 90, '#315e78', 0.13, 22);
    ctx.strokeStyle = 'rgba(74,45,21,0.85)';
    ctx.lineWidth = 2.4;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  } else if (board.id === 'yokai') {
    ctx.fillStyle = '#141a1b';
    ctx.fillRect(x, y, w, h);
    drawPattern(ctx, 'sayagata', x, y, w, h, '#b19a68', 0.055, 26);
    ctx.strokeStyle = 'rgba(190,157,94,0.65)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    for (let i = 0; i < 4; i++) drawLantern(ctx, x + w - 198 + i * 34, y + 32, 11, 22, true);
  } else if (board.id === 'kesshu') {
    ctx.fillStyle = '#1a1613';
    ctx.fillRect(x, y, w, h);
    drawPattern(ctx, 'kikko', x, y, w, h, '#c7a052', 0.08, 28);
    goldFleck(ctx, x, y, w, h, 'side-kesshu', 90);
    ctx.strokeStyle = 'rgba(207,171,93,0.7)';
    ctx.lineWidth = 2.2;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  } else {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#a9853e');
    g.addColorStop(0.4, '#d8bb6d');
    g.addColorStop(1, '#8b672c');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    goldFleck(ctx, x, y, w, h, 'side-genji', 130);
    ctx.strokeStyle = 'rgba(67,44,16,0.72)';
    ctx.lineWidth = 2.2;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  }
  const dark = board.id === 'yokai' || board.id === 'kesshu';
  const ink = dark ? '#f0dfb4' : '#2b1d10';
  drawSeal(ctx, x + 54, y + 45, 19, board.volumeKanji, board.accent, 17, true);
  ctx.fillStyle = ink;
  font(ctx, 23, '700', true);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(board.title, x + 84, y + 27);
  ctx.fillStyle = dark ? 'rgba(227,206,163,0.65)' : 'rgba(70,47,23,0.65)';
  font(ctx, 8, '500');
  ctx.fillText('手番と懐中守り札を選ぶ', x + 86, y + 55);
  ctx.strokeStyle = dark ? 'rgba(222,191,128,0.3)' : 'rgba(77,51,25,0.35)';
  ctx.beginPath();
  ctx.moveTo(x + 34, y + 86);
  ctx.lineTo(x + w - 34, y + 86);
  ctx.stroke();

  ctx.fillStyle = ink;
  font(ctx, 10, '700', true);
  ctx.fillText('① 手番を選ぶ', x + 42, y + 105);
  for (const sideCard of SIDE_CARDS) {
    const hover = G.hoverSide === sideCard.side;
    const selected = G.humanSide === sideCard.side;
    ctx.save();
    if (hover) {
      ctx.shadowColor = 'rgba(231,192,105,0.4)';
      ctx.shadowBlur = 14;
    }
    ctx.fillStyle = selected ? (dark ? 'rgba(178,58,43,0.34)' : 'rgba(178,58,43,0.16)') : (dark ? 'rgba(228,204,156,0.07)' : 'rgba(247,235,207,0.35)');
    roundRect(ctx, sideCard.x, sideCard.y, sideCard.w, sideCard.h, 3);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = selected ? '#b23a2b' : (dark ? 'rgba(218,189,130,0.32)' : 'rgba(82,54,25,0.32)');
    ctx.lineWidth = selected ? 2 : 1;
    ctx.stroke();
    const names = board.id === 'kesshu' ? ['味方', '敵将'] : board.id === 'tokaido' ? ['旅人', '同行者'] : board.id === 'yokai' ? ['語り手', '怪談師'] : ['光源氏', '頭中将'];
    ctx.fillStyle = selected ? '#b23a2b' : ink;
    font(ctx, 15, '700', true);
    ctx.textAlign = 'left';
    ctx.fillText(names[sideCard.side], sideCard.x + 18, sideCard.y + 19);
    ctx.fillStyle = dark ? 'rgba(227,207,167,0.68)' : 'rgba(59,40,20,0.68)';
    font(ctx, 7, '500');
    ctx.fillText(sideCard.side === 0 ? `先手・${board.volume}の旅装` : '後手・対局相手', sideCard.x + 18, sideCard.y + 42);
    drawMiniBoardPreview(ctx, G.boardIdx, sideCard.x + 16, sideCard.y + 55, 106, 74);
    ctx.strokeStyle = dark ? 'rgba(230,205,156,0.2)' : 'rgba(81,53,25,0.25)';
    ctx.strokeRect(sideCard.x + 16, sideCard.y + 55, 106, 74);
    // Avatar silhouette.
    const ax = sideCard.x + sideCard.w - 52;
    drawAvatar(ctx, sideCard.side, ax, sideCard.y + 102, 62, board);
    ctx.fillStyle = selected ? '#b23a2b' : (dark ? 'rgba(221,198,150,0.6)' : 'rgba(80,55,27,0.55)');
    font(ctx, 7, '700', true);
    ctx.textAlign = 'right';
    ctx.fillText(selected ? '選択中' : 'この手番で遊ぶ', sideCard.x + sideCard.w - 14, sideCard.y + sideCard.h - 16);
    ctx.restore();
  }

  ctx.fillStyle = ink;
  font(ctx, 10, '700', true);
  ctx.textAlign = 'left';
  ctx.fillText('② 懐中守り札を選ぶ（三枚まで）', x + 42, y + 404);
  for (const slot of CHARM_SLOTS) {
    const charm = CHARMS.find(c => c.id === slot.id);
    const selected = G.charms.includes(slot.id);
    const hover = G.hoverCharm === slot.id;
    drawCharmCard(ctx, charm, slot.x, slot.y, slot.w, slot.h, { selected, hover });
  }

  // Start button.
  const hoverStart = G.hoverPlayBtn === 9;
  ctx.save();
  ctx.shadowColor = 'rgba(211,170,82,0.45)';
  ctx.shadowBlur = hoverStart ? 18 : 7;
  const g = ctx.createLinearGradient(START_BTN.x, START_BTN.y, START_BTN.x, START_BTN.y + START_BTN.h);
  g.addColorStop(0, '#b23a2b');
  g.addColorStop(1, '#77201a');
  ctx.fillStyle = g;
  roundRect(ctx, START_BTN.x, START_BTN.y, START_BTN.w, START_BTN.h, 3);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(246,220,164,0.7)';
  ctx.stroke();
  ctx.fillStyle = '#f8e9c4';
  font(ctx, 17, '700', true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('この巻で双六を始める', START_BTN.x + START_BTN.w / 2, START_BTN.y + START_BTN.h / 2);
  ctx.restore();

  // Secondary buttons.
  for (const [r, label] of [[SIDE_GALLERY_BTN, '錦絵図鑑'], [SIDE_BACK_BTN, '巻を選び直す']]) {
    ctx.fillStyle = dark ? 'rgba(228,204,156,0.07)' : 'rgba(247,235,207,0.35)';
    roundRect(ctx, r.x, r.y, r.w, r.h, 3);
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(218,189,130,0.32)' : 'rgba(82,54,25,0.32)';
    ctx.stroke();
    ctx.fillStyle = ink;
    font(ctx, 8, '700', true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
  }
  ctx.restore();
}

function drawAvatar(ctx, side, x, y, h, board) {
  const skin = side === 0 ? '#b23a2b' : '#315e68';
  ctx.save();
  ctx.fillStyle = 'rgba(33,22,14,0.15)';
  ctx.beginPath();
  ctx.ellipse(x, y + 23, 23, 6, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(x - 20, y + 18);
  ctx.bezierCurveTo(x - 24, y - 12, x - 10, y - 38, x, y - 40);
  ctx.bezierCurveTo(x + 10, y - 38, x + 24, y - 12, x + 20, y + 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8c69f';
  ctx.beginPath();
  ctx.arc(x, y - 46, 12, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#241811';
  ctx.beginPath();
  ctx.arc(x, y - 50, 13, Math.PI, TAU);
  ctx.fill();
  ctx.fillStyle = '#f6e5ba';
  font(ctx, 11, '700', true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(side === 0 ? '私' : '敵', x, y - 5);
  ctx.restore();
}

export function drawGallery(ctx, time) {
  ctx.save();
  ctx.fillStyle = 'rgba(9,7,6,0.82)';
  ctx.fillRect(0, 0, W, H);
  const x = 18;
  const y = 14;
  const w = W - 36;
  const h = H - 28;
  washiPaper(ctx, x, y, w, h, '#d8c294', { seed: 'gallery' });
  goldFleck(ctx, x, y, w, h, 'gallery', 60);
  ctx.strokeStyle = 'rgba(67,44,21,0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = 'rgba(45,29,15,0.9)';
  ctx.fillRect(x + 10, y + 10, w - 20, 44);
  ctx.fillStyle = '#f0dfb8';
  font(ctx, 19, '700', true);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('三十六枚 錦絵大図鑑', x + 28, y + 31);
  ctx.fillStyle = 'rgba(205,178,122,0.64)';
  font(ctx, 7, '500');
  ctx.fillText(`蒐集 ${G.collection.size} / 36 ・ 四巻の浮世絵札`, x + 258, y + 34);

  for (const [key, rect, label] of [[TABS.cards, TABS.cards, '錦絵 36'], [TABS.charms, TABS.charms, '守り札 3']]) {
    const active = G.galleryTab === key;
    ctx.fillStyle = active ? 'rgba(178,58,43,0.9)' : 'rgba(235,218,178,0.18)';
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 2);
    ctx.fill();
    ctx.strokeStyle = active ? 'rgba(246,223,171,0.7)' : 'rgba(219,194,146,0.25)';
    ctx.stroke();
    ctx.fillStyle = active ? '#f7e9c6' : 'rgba(238,219,178,0.72)';
    font(ctx, 8, '700', true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
  }

  if (G.galleryTab === 'cards') {
    for (let i = 0; i < UKIYOE_CARDS.length; i++) {
      const card = UKIYOE_CARDS[i];
      const r = getGalleryCardRect(i);
      drawUkiyoeCard(ctx, card, r.x, r.y, r.w, r.h, {
        hover: G.galleryHover === i,
        collected: G.collection.has(card.id),
      });
    }
    if (G.galleryHover >= 0) {
      const card = UKIYOE_CARDS[G.galleryHover];
      drawGalleryDetail(ctx, card, x + 24, y + h - 120, 740, 92);
    } else {
      ctx.fillStyle = 'rgba(55,38,20,0.62)';
      font(ctx, 7, '500');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('未蒐集の札は摺り上がりを待っています。巻を遊ぶと新しい札が開帳されます。', W / 2, y + h - 16);
    }
  } else {
    for (let i = 0; i < CHARMS.length; i++) {
      const charm = CHARMS[i];
      const cw = 280;
      const ch = 330;
      const cx = x + 60 + i * (cw + 35);
      const cy = y + 150;
      drawCharmCard(ctx, charm, cx, cy, cw, ch, {
        selected: G.charms.includes(charm.id),
        hover: G.galleryHover === i,
      });
      ctx.fillStyle = 'rgba(49,33,18,0.82)';
      font(ctx, 10, '700', true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(charm.name, cx + cw / 2, cy + ch + 14);
      ctx.fillStyle = 'rgba(58,39,20,0.7)';
      font(ctx, 7, '500');
      const words = charm.text;
      let line = '';
      let ly = cy + ch + 34;
      for (const chr of words) {
        if (line.length >= 22) {
          ctx.fillText(line, cx + cw / 2, ly);
          line = '';
          ly += 12;
        }
        line += chr;
      }
      if (line) ctx.fillText(line, cx + cw / 2, ly);
    }
  }

  // Close.
  const c = GALLERY_CLOSE;
  ctx.fillStyle = 'rgba(54,37,22,0.9)';
  roundRect(ctx, c.x, c.y, c.w, c.h, 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(212,178,105,0.6)';
  ctx.stroke();
  ctx.fillStyle = '#f1dfb6';
  font(ctx, 8, '700', true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('閉じる', c.x + c.w / 2, c.y + c.h / 2);
  ctx.restore();
}

function drawGalleryDetail(ctx, card, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(245,232,201,0.84)';
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(89,58,28,0.4)';
  ctx.stroke();
  drawMiniCardArt(ctx, card, x + 6, y + 6, 118, h - 12);
  ctx.fillStyle = '#2b1c10';
  font(ctx, 13, '700', true);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(card.title, x + 138, y + 10);
  ctx.fillStyle = 'rgba(79,54,28,0.72)';
  font(ctx, 7, '500');
  ctx.fillText(`${card.reading} ・ ${card.artist}『${card.series}』 ・ ${card.rarity}`, x + 138, y + 30);
  ctx.fillStyle = 'rgba(57,39,20,0.82)';
  font(ctx, 7.4, '500');
  let line = '';
  let ly = y + 46;
  for (const ch of card.description) {
    if (line.length >= 46) {
      ctx.fillText(line, x + 138, ly);
      line = '';
      ly += 11;
    }
    line += ch;
  }
  if (line) ctx.fillText(line, x + 138, ly);
  ctx.fillStyle = 'rgba(127,42,33,0.78)';
  font(ctx, 8, '700', true);
  ctx.fillText(card.poem, x + 138, y + h - 20);
  ctx.restore();
}

export function drawSettlementScreen(ctx, time) {
  const board = currentBoard();
  ctx.save();
  ctx.fillStyle = 'rgba(8,6,5,0.6)';
  ctx.fillRect(0, 0, W, H);
  const { x, y, w, h } = SETTLEMENT_PANEL;
  if (board.id === 'tokaido') {
    washiPaper(ctx, x, y, w, h, '#dfc58f', { seed: 'settle-tokaido' });
    drawPattern(ctx, 'seigaiha', x, y, w, h, '#315e78', 0.1, 26);
  } else if (board.id === 'yokai') {
    ctx.fillStyle = '#161c1d';
    ctx.fillRect(x, y, w, h);
    drawPattern(ctx, 'sayagata', x, y, w, h, '#b39c6b', 0.06, 24);
    for (let i = 0; i < 5; i++) drawLantern(ctx, x + 100 + i * 150, y + 90, 22, 42, true);
  } else if (board.id === 'kesshu') {
    ctx.fillStyle = '#1a1613';
    ctx.fillRect(x, y, w, h);
    drawPattern(ctx, 'kikko', x, y, w, h, '#c7a052', 0.09, 27);
    goldFleck(ctx, x, y, w, h, 'settle-kesshu', 100);
  } else {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#b28d44');
    g.addColorStop(0.4, '#dfc47a');
    g.addColorStop(1, '#936f31');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    goldFleck(ctx, x, y, w, h, 'settle-genji', 140);
  }
  ctx.strokeStyle = 'rgba(69,44,19,0.8)';
  ctx.lineWidth = 2.2;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  const dark = board.id === 'yokai' || board.id === 'kesshu';
  const ink = dark ? '#f0dfb4' : '#2b1d10';
  const human = G.match?.humanSide ?? 0;
  const won = G.match?.winner === human;
  drawSeal(ctx, x + w / 2, y + 80, 31, won ? '勝' : '終', won ? '#b23a2b' : '#315e68', 28, true);
  ctx.fillStyle = ink;
  font(ctx, 26, '700', true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(won ? '大上り・見事' : '道半ば・残念', x + w / 2, y + 116);
  ctx.fillStyle = dark ? 'rgba(228,207,166,0.72)' : 'rgba(61,41,21,0.72)';
  font(ctx, 8, '500');
  ctx.fillText(`${board.volume}『${board.title}』`, x + w / 2, y + 152);
  ctx.strokeStyle = dark ? 'rgba(225,195,134,0.3)' : 'rgba(80,53,26,0.3)';
  ctx.beginPath();
  ctx.moveTo(x + 70, y + 176);
  ctx.lineTo(x + w - 70, y + 176);
  ctx.stroke();

  const stats = [
    ['手数', G.match?.turnCount || 0],
    ['移動', `${G.match?.pos?.[human] ?? 0} / ${board.goal}`],
    ['跳び', G.stats?.jumps || 0],
    ['一騎討', G.stats?.duels || 0],
  ];
  for (let i = 0; i < stats.length; i++) {
    const sx = x + 80 + i * 168;
    ctx.fillStyle = dark ? 'rgba(232,209,166,0.08)' : 'rgba(247,235,205,0.35)';
    roundRect(ctx, sx, y + 194, 144, 66, 2);
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(218,189,130,0.22)' : 'rgba(81,54,26,0.22)';
    ctx.stroke();
    ctx.fillStyle = dark ? 'rgba(225,203,158,0.65)' : 'rgba(66,45,23,0.62)';
    font(ctx, 7, '500');
    ctx.textAlign = 'center';
    ctx.fillText(stats[i][0], sx + 72, y + 202);
    ctx.fillStyle = ink;
    font(ctx, 20, '700', true);
    ctx.fillText(String(stats[i][1]), sx + 72, y + 220);
  }

  ctx.fillStyle = ink;
  font(ctx, 10, '700', true);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('新たに開帳した錦絵', x + 80, y + 284);
  const fresh = G.newCards.slice(0, 4).map(id => CARD_BY_ID[id]).filter(Boolean);
  if (fresh.length === 0) {
    ctx.fillStyle = dark ? 'rgba(226,205,162,0.55)' : 'rgba(67,45,23,0.55)';
    font(ctx, 8, '500');
    ctx.fillText('すべて蒐集済み。図鑑で三十六枚を眺められます。', x + 80, y + 306);
  } else {
    for (let i = 0; i < fresh.length; i++) {
      drawUkiyoeCard(ctx, fresh[i], x + 80 + i * 168, y + 302, 150, 78, { collected: true, hover: false });
    }
  }

  // Buttons.
  for (const [key, r, label] of [['again', SETTLEMENT_BTNS.again, '同じ巻で再戦'], ['menu', SETTLEMENT_BTNS.menu, '巻を選ぶ']]) {
    ctx.fillStyle = key === 'again' ? '#9a2924' : (dark ? 'rgba(228,204,156,0.1)' : 'rgba(247,235,207,0.4)');
    roundRect(ctx, r.x, r.y, r.w, r.h, 3);
    ctx.fill();
    ctx.strokeStyle = key === 'again' ? 'rgba(246,220,164,0.7)' : (dark ? 'rgba(218,189,130,0.3)' : 'rgba(82,54,25,0.3)');
    ctx.stroke();
    ctx.fillStyle = key === 'again' ? '#f8e9c4' : ink;
    font(ctx, 9, '700', true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
  }
  ctx.restore();
}

export function drawUI(ctx, time) {
  if (G.screen === 'SELECT_BOARD') drawSelectScreen(ctx, time);
  else if (G.screen === 'SELECT_SIDE') drawSideScreen(ctx, time);
}
