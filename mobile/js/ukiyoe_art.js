// Public printmaker facade used by the board renderer and UI.
import {
  PALETTE, washiPaper, bokashi, drawPattern, drawCloud, drawSeal, drawKomae,
  roundRect, goldFleck, bambooGrain, drawCrane, drawLantern, drawTorii,
  drawPine, drawWaveBand,
} from './art_core.js';
import {
  drawTraveler, drawBeauty, drawWarrior, drawYokai, drawGenjiLady,
} from './art_figures.js';
import {
  drawTokaidoScene, drawYokaiScene, drawWarriorScene, drawGenjiScene,
  drawGoalScene, drawCharmScene,
} from './art_scenes.js';
import { getPrint, getPrintURL } from './prints.js';
import { BOARDS } from './boards.js';

export {
  PALETTE, washiPaper, bokashi, drawPattern, drawSeal, drawKomae, drawCloud,
  roundRect, goldFleck, bambooGrain, drawCrane, drawLantern, drawTorii,
  drawPine, drawWaveBand,
};

export function drawNodeArt(ctx, boardIndex, node, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (node.kind === 'goal') {
    drawGoalScene(ctx, node.art, x, y, w, h);
  } else if (boardIndex === 0) {
    drawTokaidoScene(ctx, node.art, x, y, w, h, node.palette || 0);
  } else if (boardIndex === 1) {
    drawYokaiScene(ctx, node.art, x, y, w, h, node.palette || 0);
  } else if (boardIndex === 2) {
    drawWarriorScene(ctx, node.art, x, y, w, h, node.palette || 0);
  } else {
    drawGenjiScene(ctx, node.art, x, y, w, h, node.palette || 0);
  }
  ctx.restore();
}

// Exposed for the debug print-room / V2 asset audit.
export function nodePrintURL(boardIndex, node) {
  const board = BOARDS[boardIndex];
  return getPrintURL(board ? board.id : 'tokaido', node.art);
}

export function drawUkiyoeCard(ctx, card, x, y, w, h, options = {}) {
  const hover = !!options.hover;
  const collected = options.collected !== false;
  ctx.save();
  if (hover) {
    ctx.shadowColor = 'rgba(28,17,8,0.5)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 5;
  }
  ctx.fillStyle = collected ? '#e8d6ad' : '#c7b897';
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = collected ? 'rgba(58,38,20,0.7)' : 'rgba(58,38,20,0.34)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const ax = x + 6;
  const ay = y + 6;
  const aw = w * 0.64;
  const ah = h - 12;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ax, ay, aw, ah);
  ctx.clip();
  ctx.globalAlpha = collected ? 1 : 0.35;
  drawCardArt(ctx, card.art, card.board, ax, ay, aw, ah);
  ctx.restore();

  // Red number cartouche.
  ctx.fillStyle = 'rgba(178,58,43,0.92)';
  ctx.fillRect(ax + 3, ay + 3, 21, 11);
  ctx.fillStyle = '#f7e9c6';
  ctx.font = '700 7px "Shippori Mincho B1",serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(card.number).padStart(2, '0'), ax + 13.5, ay + 8.7);

  // Right title slip.
  const tx = x + aw + 10;
  const tw = w - aw - 16;
  ctx.fillStyle = 'rgba(242,230,200,0.72)';
  ctx.fillRect(tx, y + 6, tw, h - 12);
  ctx.strokeStyle = 'rgba(79,55,28,0.42)';
  ctx.strokeRect(tx, y + 6, tw, h - 12);
  ctx.save();
  ctx.translate(tx + tw * 0.66, y + 10);
  ctx.fillStyle = '#251a11';
  ctx.font = '700 9px "Yuji Syuku","Shippori Mincho B1",serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let ty = 0;
  for (const ch of card.title.slice(0, 7)) {
    ctx.fillText(ch, 0, ty);
    ty += 10;
  }
  ctx.fillStyle = 'rgba(72,50,29,0.78)';
  ctx.font = '500 5.5px "Shippori Mincho B1",serif';
  ctx.fillText(card.reading.slice(0, 8), 0, ty + 2);
  ctx.restore();
  ctx.save();
  ctx.translate(tx + tw * 0.25, y + h - 10);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = 'rgba(76,53,31,0.65)';
  ctx.font = '500 5px "Shippori Mincho B1",serif';
  ctx.textAlign = 'left';
  ctx.fillText(card.artist, 0, 0);
  ctx.restore();
  if (card.rarity === '特大判' || card.rarity === '大判') {
    drawSeal(ctx, tx + tw - 9, y + h - 12, 6, card.rarity === '特大判' ? '特' : '大', PALETTE.vermilion, 5, true);
  }
  ctx.restore();
}

function drawCardArt(ctx, art, board, x, y, w, h) {
  if (typeof board === 'number' && board === 0) drawTokaidoScene(ctx, art, x, y, w, h);
  else if (typeof board === 'number' && board === 1) drawYokaiScene(ctx, art, x, y, w, h);
  else if (typeof board === 'number' && board === 2) drawWarriorScene(ctx, art, x, y, w, h);
  else drawGenjiScene(ctx, art, x, y, w, h);
}

export function drawCardBack(ctx, x, y, w, h) {
  washiPaper(ctx, x, y, w, h, '#d8c196', { seed: 'card-back' });
  ctx.fillStyle = '#283f4b';
  ctx.fillRect(x + 7, y + 7, w - 14, h - 14);
  drawPattern(ctx, 'seigaiha', x + 7, y + 7, w - 14, h - 14, '#d9c58f', 0.5, 14);
  drawSeal(ctx, x + w / 2, y + h / 2, Math.min(w, h) * 0.16, '絵', '#b23a2b', Math.min(w, h) * 0.14);
}

export function drawCharmCard(ctx, charm, x, y, w, h, options = {}) {
  ctx.save();
  if (options.hover) {
    ctx.shadowColor = 'rgba(30,20,10,0.5)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 4;
  }
  ctx.fillStyle = options.selected ? '#f2e2ba' : '#d8c59e';
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = options.selected ? charm.color : 'rgba(65,44,23,0.55)';
  ctx.lineWidth = options.selected ? 2 : 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(x + 6, y + 6, w * 0.38, h - 12);
  ctx.clip();
  drawCharmScene(ctx, charm.art, x + 6, y + 6, w * 0.38, h - 12);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = charm.color;
  ctx.font = '700 13px "Yuji Syuku",serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(charm.name, x + w * 0.42, y + 12);
  ctx.fillStyle = 'rgba(45,31,18,0.72)';
  ctx.font = '500 7px "Shippori Mincho B1",serif';
  ctx.fillText(charm.yomi, x + w * 0.42, y + 29);
  ctx.fillStyle = 'rgba(55,39,22,0.82)';
  ctx.font = '500 7.5px "Shippori Mincho B1",serif';
  const words = charm.text;
  let line = '';
  let ly = y + 44;
  for (const ch of words) {
    if (line.length >= 15) {
      ctx.fillText(line, x + w * 0.42, ly);
      line = '';
      ly += 10;
    }
    line += ch;
  }
  if (line) ctx.fillText(line, x + w * 0.42, ly);
  ctx.fillStyle = options.selected ? charm.color : 'rgba(80,56,30,0.5)';
  ctx.font = '700 7px "Shippori Mincho B1",serif';
  ctx.textAlign = 'right';
  ctx.fillText(options.selected ? '携帯中' : '外す', x + w - 10, y + h - 12);
  ctx.restore();
}

export function drawKomaeWindow(ctx, cx, cy, r, variant) {
  drawKomae(ctx, cx, cy, r, variant);
}

export function drawPortrait(ctx, kind, x, y, w, h, options = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (kind === 'traveler') drawTraveler(ctx, x + w / 2, y + h, h, options);
  else if (kind === 'beauty') drawBeauty(ctx, x + w / 2, y + h, h, options);
  else if (kind === 'warrior') drawWarrior(ctx, x + w / 2, y + h, h, options);
  else if (kind === 'genji') drawGenjiLady(ctx, x + w / 2, y + h, h, options.variant || 0);
  else drawYokai(ctx, kind, x + w / 2, y + h, h, options);
  ctx.restore();
}

export function drawMiniKomae(ctx, x, y, w, h, index) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  drawKomae(ctx, x + w / 2, y + h / 2, Math.min(w, h) / 2, index);
  ctx.restore();
}

export function drawGoldSeal(ctx, x, y, r, text) {
  drawSeal(ctx, x, y, r, text, PALETTE.gold, r * 0.8, true);
}

export function drawMiniCardArt(ctx, card, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  drawCardArt(ctx, card.art, card.board, x, y, w, h);
  ctx.restore();
}

export function drawSprig(ctx, x, y, s = 1, color = '#b23a2b') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = '#4d3a24';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(10, -12, 22, -14, 35, -24);
  ctx.stroke();
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(7 + i * 6, -6 - i * 4, 4, 2, -0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawTextSeal(ctx, x, y, text, color = PALETTE.vermilion, size = 12) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px "Yuji Syuku",serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}
