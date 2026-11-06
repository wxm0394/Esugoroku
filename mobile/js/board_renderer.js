// The print-room renderer: four distinct board geometries, four HUD skins,
// four physical dice vessels, plus dynamic pawns, previews and local effects.
import {
  W, H, G, LEFT_PANEL, RIGHT_PANEL, BOARD_RECT, BOARD_SURFACE, BOARD_SCALE_X, BOARD_SCALE_Y, PLAY_BUTTONS,
  DICE_TRAY, TUBE_RECT, TUBE_CENTER, SETTLEMENT_PANEL, SETTLEMENT_BTNS,
  FONT_BRUSH, FONT_MINCHO, currentBoard, pawnPosition, nodeCenter,
} from './state.js';
import { BOARDS, UKIYOE_CARDS, CARD_BY_ID } from './boards.js';
import { EsugorokuCore } from './core.js';
import {
  PALETTE, washiPaper, bokashi, drawPattern, drawCloud, drawSeal, drawKomae,
  roundRect, goldFleck, bambooGrain, drawCrane, drawLantern, drawTorii,
  drawPine, drawWaveBand, drawNodeArt,
} from './ukiyoe_art.js';
import { getPrint } from './prints.js';

const TAU = Math.PI * 2;
const BOARD_TITLES = [
  ['東海道', '御府内名物道中双六'],
  ['百種怪談', '妖物飛び双六'],
  ['英勇揃', '伊呂波誠忠義士双六'],
  ['善悪道中', '源氏絵合出世双六'],
];

let sceneCache = null;
let sceneCacheBoard = -1;

function font(ctx, size, weight = '500', brush = false) {
  ctx.font = `${weight} ${size}px ${brush ? FONT_BRUSH : FONT_MINCHO}`;
}

function fitText(ctx, text, maxWidth, startSize, weight = '500', brush = false, min = 5) {
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
  ctx.fillStyle = color;
  const s = fitText(ctx, text, maxWidth, size, weight, brush);
  ctx.fillText(text, x, y);
  ctx.restore();
  return s;
}

function verticalText(ctx, text, x, y, size, color, lineGap = 0, weight = '500', brush = true, maxHeight = 999) {
  ctx.save();
  ctx.fillStyle = color;
  font(ctx, size, weight, brush);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let step = size + lineGap;
  if (text.length * step > maxHeight && text.length > 0) {
    step = Math.max(size * 0.62, maxHeight / text.length);
    font(ctx, Math.min(size, step * 0.9), weight, brush);
  }
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], x, y + i * step);
  }
  ctx.restore();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, size, color, maxLines = 99) {
  ctx.save();
  font(ctx, size, '500');
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let line = '';
  let n = 0;
  for (const ch of text) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + n * lineHeight);
      n++;
      line = ch;
      if (n >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && n < maxLines) ctx.fillText(line, x, y + n * lineHeight);
  ctx.restore();
}

function panelPaper(ctx, x, y, w, h, base) {
  washiPaper(ctx, x, y, w, h, base, { edge: true, seed: `${x}-${y}-${base}` });
  ctx.strokeStyle = 'rgba(39,26,14,0.72)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = 'rgba(220,194,142,0.45)';
  ctx.lineWidth = 0.7;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
}

function lacquer(ctx, x, y, w, h, color = '#221a15', edge = '#8c6a31') {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, color);
  g.addColorStop(0.55, '#120f0e');
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = 'rgba(235,205,138,0.22)';
  ctx.lineWidth = 0.7;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
}

function drawStageBackground(ctx) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#2a1e17');
  g.addColorStop(0.4, '#17110f');
  g.addColorStop(1, '#0d0b0b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  goldFleck(ctx, 0, 0, W, H, 71, 170);
  drawPattern(ctx, 'asanoha', 0, 0, W, H, '#b89551', 0.045, 42);
  const vg = ctx.createRadialGradient(W * 0.44, H * 0.43, 100, W * 0.5, H * 0.5, W * 0.7);
  vg.addColorStop(0, 'rgba(255,238,196,0.07)');
  vg.addColorStop(1, 'rgba(0,0,0,0.48)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function drawHeader(ctx, board) {
  const x = 14;
  const y = 7;
  const w = W - 28;
  const h = 52;
  lacquer(ctx, x, y, w, h, '#1d1714', '#8d6c37');
  ctx.fillStyle = 'rgba(147,38,31,0.9)';
  ctx.fillRect(x + 5, y + h - 5, w - 10, 2);
  ctx.fillStyle = '#efe1bf';
  font(ctx, 24, '700', true);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('江戸浮世絵・絵双六', x + 24, y + 24);
  ctx.fillStyle = 'rgba(219,194,139,0.82)';
  font(ctx, 11, '500', true);
  ctx.fillText(board.ruleSummary, x + 25, y + 42);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#d9bd7d';
  font(ctx, 11, '500');
  const titleRight = `${board.volume}  ${board.title}`;
  ctx.fillText(titleRight, x + w - 24, y + 22);
  const titleW = ctx.measureText(titleRight).width;
  drawSeal(ctx, x + w - 24 - titleW - 22, y + 24, 13, board.volumeKanji, '#9c2f25', 12, true);
}

/* ------------------------------------------------------------------ */
/* Static board cache                                                  */
/* ------------------------------------------------------------------ */

function drawSpiralCorridor(ctx, board) {
  const cx = 400;
  const cy = 330;
  ctx.save();
  ctx.strokeStyle = 'rgba(178,58,43,0.22)';
  ctx.lineWidth = 2;
  for (let ring = 0; ring < 3; ring++) {
    ctx.beginPath();
    const r = 255 - ring * 52;
    for (let i = 0; i <= 110; i++) {
      const a = -Math.PI * 0.55 + (i / 110) * Math.PI * 1.9 + ring * 0.12;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r * 0.82;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  // Inward arrow into the Kyoto goal.
  ctx.strokeStyle = 'rgba(178,58,43,0.45)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(220, 370);
  ctx.bezierCurveTo(292, 300, 360, 402, 394, 330);
  ctx.stroke();
  ctx.fillStyle = 'rgba(178,58,43,0.55)';
  ctx.beginPath();
  ctx.moveTo(394, 330);
  ctx.lineTo(378, 331);
  ctx.lineTo(386, 343);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawInkThread(ctx, board) {
  ctx.save();
  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = 'rgba(73,52,35,0.32)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = board.nodes[i];
    const b = board.nodes[i + 1] || board.nodes[board.goal];
    if (i === 0) ctx.moveTo(a.x + a.w / 2, a.y + a.h / 2);
    const mx = (a.x + a.w / 2 + b.x + b.w / 2) / 2;
    const my = (a.y + a.h / 2 + b.y + b.h / 2) / 2 - 12;
    ctx.quadraticCurveTo(mx, my, b.x + b.w / 2, b.y + b.h / 2);
  }
  ctx.stroke();
  ctx.restore();
}

function drawGoldThread(ctx, board) {
  ctx.save();
  ctx.strokeStyle = 'rgba(180,139,49,0.34)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 15; i++) {
    const a = board.nodes[i];
    const b = board.nodes[i + 1];
    ctx.beginPath();
    ctx.moveTo(a.x + a.w / 2, a.y + a.h / 2);
    ctx.lineTo(b.x + b.w / 2, b.y + b.h / 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(board.nodes[15].x + 35, board.nodes[15].y + 63);
  ctx.lineTo(board.nodes[16].x + 20, board.nodes[16].y + 46);
  ctx.lineTo(board.nodes[22].x + 105, board.nodes[22].y + 32);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(board.nodes[15].x + 35, board.nodes[15].y + 63);
  ctx.lineTo(board.nodes[19].x + 20, board.nodes[19].y + 46);
  ctx.lineTo(board.nodes[22].x + 105, board.nodes[22].y + 32);
  ctx.strokeStyle = 'rgba(83,46,74,0.42)';
  ctx.stroke();
  ctx.restore();
}

function drawBoardBase(ctx, board) {
  const b = board;
  if (b.id === 'tokaido') {
    washiPaper(ctx, 0, 0, 800, 640, '#e6d1a0', { seed: 'board-tokaido' });
    drawPattern(ctx, 'seigaiha', 0, 0, 800, 640, '#315e78', 0.13, 28);
    drawPattern(ctx, 'asanoha', 0, 0, 800, 640, '#7b4e2a', 0.06, 25);
    ctx.strokeStyle = 'rgba(92,60,29,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, 792, 632);
    drawSpiralCorridor(ctx, b);
  } else if (b.id === 'yokai') {
    washiPaper(ctx, 0, 0, 800, 640, '#a99a7d', { seed: 'board-yokai' });
    bokashi(ctx, 0, 0, 800, 640, '#1e2a30', '#8f7a5d');
    drawPattern(ctx, 'sayagata', 0, 0, 800, 640, '#e5d4ae', 0.07, 30);
    ctx.fillStyle = 'rgba(236,224,194,0.32)';
    ctx.beginPath();
    ctx.arc(690, 88, 58, 0, TAU);
    ctx.fill();
    drawCloud(ctx, 60, 30, 300, 90, 'rgba(214,202,173,0.18)', 0.45);
    drawCloud(ctx, 430, 100, 300, 80, 'rgba(214,202,173,0.13)', 0.4);
    ctx.strokeStyle = 'rgba(236,221,189,0.16)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(6, 6, 788, 628);
    drawInkThread(ctx, b);
  } else if (b.id === 'kesshu') {
    washiPaper(ctx, 0, 0, 800, 640, '#d8bf90', { seed: 'board-kesshu' });
    drawPattern(ctx, 'kikko', 0, 0, 800, 640, '#7a2b22', 0.1, 25);
    goldFleck(ctx, 0, 0, 800, 640, 'board-kesshu', 70);
    const g = ctx.createRadialGradient(400, 320, 40, 400, 320, 420);
    g.addColorStop(0, 'rgba(185,55,41,0.08)');
    g.addColorStop(1, 'rgba(62,30,20,0.24)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 800, 640);
    ctx.strokeStyle = 'rgba(157,57,40,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, 794, 634);
  } else {
    washiPaper(ctx, 0, 0, 800, 640, '#e3cfaa', { seed: 'board-genji' });
    drawPattern(ctx, 'kikko', 0, 0, 800, 640, '#9b7429', 0.08, 28);
    // Golden good track, purple evil track, central byobu.
    ctx.fillStyle = 'rgba(212,176,83,0.23)';
    ctx.beginPath();
    ctx.moveTo(208, 156);
    ctx.lineTo(668, 156);
    ctx.lineTo(668, 278);
    ctx.lineTo(208, 278);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(59,35,66,0.2)';
    ctx.beginPath();
    ctx.moveTo(208, 396);
    ctx.lineTo(668, 396);
    ctx.lineTo(668, 516);
    ctx.lineTo(208, 516);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(182,138,46,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(210, 158, 456, 118);
    ctx.strokeStyle = 'rgba(82,48,92,0.35)';
    ctx.strokeRect(210, 398, 456, 116);
    // Central curtain.
    ctx.fillStyle = 'rgba(246,231,179,0.78)';
    ctx.beginPath();
    ctx.moveTo(284, 286);
    ctx.lineTo(516, 286);
    ctx.lineTo(510, 388);
    ctx.quadraticCurveTo(400, 404, 290, 388);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(153,113,36,0.65)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    drawCloud(ctx, 256, 286, 290, 72, 'rgba(255,248,222,0.55)', 0.6);
    drawGoldThread(ctx, b);
  }
  ctx.strokeStyle = 'rgba(40,24,12,0.7)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.75, 0.75, 798.5, 638.5);
}

function arrowStripPath(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - 13, y);
  ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w - 13, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

function drawConnectors(ctx, board) {
  if (board.id === 'tokaido') {
    for (let i = 0; i < 16; i++) {
      const a = board.nodes[i];
      const b = board.nodes[i + 1] || board.nodes[board.goal];
      const ax = a.x + a.w;
      const ay = a.y + a.h / 2;
      const bx = b.x;
      const by = b.y + b.h / 2;
      ctx.save();
      ctx.strokeStyle = 'rgba(60,39,21,0.46)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(Math.min(bx, ax + 12), by);
      ctx.stroke();
      ctx.fillStyle = 'rgba(178,58,43,0.7)';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - 7, by - 4);
      ctx.lineTo(bx - 7, by + 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  if (board.id === 'kesshu') {
    for (let i = 0; i < 15; i++) {
      const a = board.nodes[i];
      const b = board.nodes[i + 1];
      ctx.save();
      ctx.strokeStyle = 'rgba(128,37,29,0.34)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x + a.w / 2, a.y + a.h / 2);
      ctx.lineTo(b.x + b.w / 2, b.y + b.h / 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawNodeFrame(ctx, board, node, i) {
  const { x, y, w, h } = node;
  const goal = node.kind === 'goal';
  const boardId = board.id;
  if (boardId === 'tokaido') {
    ctx.save();
    ctx.shadowColor = 'rgba(54,34,15,0.32)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;
    arrowStripPath(ctx, x, y, w, h);
    ctx.fillStyle = '#f1e1ba';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.save();
    arrowStripPath(ctx, x, y, w, h);
    ctx.clip();
    ctx.drawImage(board.__nodeCanvas || createNodeArtCanvas(board, node, w, h), x, y);
    ctx.fillStyle = 'rgba(246,232,196,0.2)';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    arrowStripPath(ctx, x, y, w, h);
    ctx.strokeStyle = 'rgba(55,37,20,0.72)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // Right vertical title slip.
    const stripW = 26;
    ctx.fillStyle = 'rgba(243,231,199,0.88)';
    ctx.fillRect(x + w - stripW - 5, y + 4, stripW, h - 8);
    ctx.strokeStyle = 'rgba(87,57,29,0.35)';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(x + w - stripW - 5, y + 4, stripW, h - 8);
    verticalText(ctx, node.title, x + w - stripW / 2 - 5, y + 8, Math.min(11, 13 - node.title.length * 0.35), '#24190f', 0.5, '700', true, h - 20);
    // Bottom rule strip, below art and never over the title strip.
    ctx.fillStyle = 'rgba(52,35,19,0.82)';
    ctx.fillRect(x + 3, y + h - 17, w - 34, 14);
    ctx.fillStyle = '#f1e3bd';
    ctx.font = '500 6.5px "Shippori Mincho B1",serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    clippedText(ctx, node.rule, x + 7, y + h - 10, w - 43, 6.5, '#f1e3bd', '500');
    // komae window and red tomari seal at upper-left.
    drawKomae(ctx, x + 18, y + 17, 12, node.komae || i, '#2b1c10');
    if (node.kind === 'stay') {
      drawSeal(ctx, x + 43, y + 16, 9, '泊', '#b23a2b', 7.5, true);
    } else if (node.kind === 'jump') {
      drawSeal(ctx, x + 43, y + 16, 9, '飛', '#b23a2b', 7.5, true);
    } else if (node.kind === 'start') {
      drawSeal(ctx, x + 43, y + 16, 9, '出', '#b23a2b', 7.5, true);
    }
    if (goal) {
      ctx.fillStyle = 'rgba(170,137,50,0.85)';
      ctx.fillRect(x + 8, y + 6, 38, 15);
      ctx.fillStyle = '#fff2c7';
      font(ctx, 8, '700', true);
      ctx.textAlign = 'center';
      ctx.fillText('上り', x + 27, y + 13.5);
    }
    ctx.restore();
    return;
  }

  if (boardId === 'yokai') {
    ctx.save();
    ctx.shadowColor = 'rgba(15,12,10,0.55)';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 3;
    roundRect(ctx, x, y, w, h, 3);
    ctx.fillStyle = '#d9c8a6';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.save();
    roundRect(ctx, x, y, w, h, 3);
    ctx.clip();
    ctx.globalAlpha = 0.86;
    ctx.drawImage(board.__nodeCanvas || createNodeArtCanvas(board, node, w, h), x, y);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(25,34,36,0.08)';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    roundRect(ctx, x, y, w, h, 3);
    ctx.strokeStyle = 'rgba(32,26,20,0.8)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Red vertical jump-table slip.
    const stripW = Math.max(33, Math.min(46, w * 0.29));
    const sx = x + w - stripW - 4;
    ctx.fillStyle = 'rgba(142,45,35,0.9)';
    ctx.fillRect(sx, y + 4, stripW, h - 8);
    ctx.strokeStyle = 'rgba(244,220,174,0.55)';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(sx + 1.5, y + 5.5, stripW - 3, h - 11);
    ctx.fillStyle = 'rgba(250,232,196,0.9)';
    ctx.font = '700 5.6px "Shippori Mincho B1",serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const rowH = (h - 20) / 6;
    for (let r = 0; r < 6; r++) {
      const jump = node.jumpTable?.[r] || 0;
      const dest = Math.max(0, Math.min(board.goal, node.id + r + 1 + jump));
      const label = jump === 0 ? `${r + 1}→止` : `${r + 1}→${dest}`;
      const cy = y + 11 + r * rowH + rowH / 2;
      if (r % 2 === 0) {
        ctx.fillStyle = 'rgba(247,232,197,0.12)';
        ctx.fillRect(sx + 3, cy - rowH / 2 + 1, stripW - 6, rowH - 2);
      }
      ctx.fillStyle = '#f7e7c3';
      ctx.fillText(label, sx + stripW / 2, cy);
    }
    // Title footer and seal.
    ctx.fillStyle = 'rgba(29,24,21,0.72)';
    ctx.fillRect(x + 4, y + h - 22, w - stripW - 11, 18);
    ctx.fillStyle = '#efe2c0';
    font(ctx, 10, '700', true);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    clippedText(ctx, node.title, x + 8, y + h - 12, w - stripW - 19, 10, '#efe2c0', '700', true);
    drawKomae(ctx, x + 18, y + 18, 10, node.komae || i);
    drawSeal(ctx, x + 38, y + 16, 8, node.kind === 'goal' ? '上' : '怪', '#b23a2b', 6.4, true);
    ctx.restore();
    return;
  }

  if (boardId === 'kesshu') {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(node.tilt || 0);
    ctx.translate(-w / 2, -h / 2);
    ctx.shadowColor = 'rgba(25,14,8,0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    roundRect(ctx, 0, 0, w, h, 2);
    ctx.fillStyle = '#e6d2a9';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.save();
    roundRect(ctx, 0, 0, w, h, 2);
    ctx.clip();
    ctx.drawImage(board.__nodeCanvas || createNodeArtCanvas(board, node, w, h), 0, 0);
    ctx.restore();
    // Crimson frame with gold inner rule.
    ctx.strokeStyle = '#7e231e';
    ctx.lineWidth = 2.2;
    ctx.strokeRect(1.2, 1.2, w - 2.4, h - 2.4);
    ctx.strokeStyle = 'rgba(203,163,74,0.7)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    // Right title slip.
    const stripW = w >= 200 ? 42 : 30;
    ctx.fillStyle = 'rgba(244,232,200,0.9)';
    ctx.fillRect(w - stripW - 4, 4, stripW, h - 8);
    ctx.strokeStyle = 'rgba(94,59,30,0.38)';
    ctx.strokeRect(w - stripW - 4, 4, stripW, h - 8);
    verticalText(ctx, node.title, w - stripW / 2 - 4, 9, w >= 200 ? 18 : 12, '#21170f', 1, '700', true, h - 20);
    // Yellow iroha roundel at upper-left.
    if (node.iroha) {
      ctx.fillStyle = '#e8b954';
      ctx.beginPath();
      ctx.arc(18, 18, 11, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#7c5a20';
      ctx.stroke();
      ctx.fillStyle = '#2b1d10';
      font(ctx, 9, '700', true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.iroha, 18, 18);
    }
    if (node.tokens) {
      ctx.fillStyle = 'rgba(142,45,35,0.9)';
      ctx.beginPath();
      ctx.arc(w - stripW - 14, h - 18, 9, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#f7e8c5';
      font(ctx, 6.6, '700', true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.tokenLabel.slice(0, 1), w - stripW - 14, h - 18);
    }
    // Bottom rule bar.
    ctx.fillStyle = 'rgba(50,31,18,0.8)';
    ctx.fillRect(4, h - 16, w - stripW - 12, 12);
    clippedText(ctx, node.rule, 7, h - 10, w - stripW - 18, 6.2, '#f1e3bd', '500');
    if (node.kind === 'goal') {
      drawSeal(ctx, w - stripW - 28, 22, 11, '上', '#b23a2b', 9, true);
    }
    if (node.kind === 'start') {
      drawSeal(ctx, w - stripW - 28, 22, 11, '出', '#9a2924', 9, true);
    }
    ctx.restore();
    return;
  }

  // Genji: four-colour outer strips and interior good/evil tracks.
  const isOuter = node.id < 16;
  if (isOuter) {
    ctx.save();
    ctx.shadowColor = 'rgba(26,16,10,0.35)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = node.stripColor;
    ctx.fillRect(x, y, w, h);
    ctx.shadowColor = 'transparent';
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.globalAlpha = 0.28;
    ctx.drawImage(board.__nodeCanvas || createNodeArtCanvas(board, node, w, h), x, y);
    ctx.restore();
    ctx.strokeStyle = 'rgba(44,29,18,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeStyle = 'rgba(255,246,218,0.42)';
    ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
    // White vertical title cartouche.
    ctx.fillStyle = 'rgba(249,240,214,0.88)';
    ctx.fillRect(x + 7, y + 17, w - 14, h - 34);
    verticalText(ctx, node.title, x + w / 2, y + 22, 15, '#251a11', 1.5, '700', true, h - 42);
    ctx.fillStyle = 'rgba(30,22,15,0.8)';
    ctx.fillRect(x + 6, y + h - 18, w - 12, 13);
    ctx.fillStyle = '#f4e7c8';
    ctx.font = '500 5.4px "Shippori Mincho B1",serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    clippedText(ctx, node.waka || node.rule, x + 9, y + h - 11, w - 18, 5.4, '#f4e7c8', '500');
    drawSeal(ctx, x + 15, y + 14, 6.5, node.kind === 'start' ? '出' : node.id === 15 ? '分' : String((node.id % 9) + 1), '#b23a2b', 5.2, true);
    if (node.kind === 'branch') {
      ctx.fillStyle = 'rgba(59,35,66,0.9)';
      ctx.fillRect(x + 7, y + 6, w - 14, 8);
      ctx.fillStyle = '#f7e7c3';
      font(ctx, 5, '700');
      ctx.textAlign = 'center';
      ctx.fillText('善悪分岐', x + w / 2, y + 10);
    }
    ctx.restore();
    return;
  }

  // Interior good / evil cards.
  ctx.save();
  const good = node.kind === 'good';
  const gold = good ? '#b48b31' : '#3b2342';
  ctx.shadowColor = 'rgba(34,20,11,0.35)';
  ctx.shadowBlur = 5;
  roundRect(ctx, x, y, w, h, 3);
  ctx.fillStyle = '#f0e1bd';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.save();
  roundRect(ctx, x, y, w, h, 3);
  ctx.clip();
  ctx.drawImage(board.__nodeCanvas || createNodeArtCanvas(board, node, w, h), x, y);
  ctx.fillStyle = good ? 'rgba(205,170,82,0.17)' : 'rgba(44,24,48,0.28)';
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  roundRect(ctx, x, y, w, h, 3);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = good ? 'rgba(244,229,191,0.9)' : 'rgba(226,212,194,0.9)';
  ctx.fillRect(x + w - 29, y + 4, 25, h - 8);
  verticalText(ctx, node.title, x + w - 16, y + 8, 10, good ? '#503a15' : '#2d1830', 0.5, '700', true, h - 18);
  ctx.fillStyle = good ? '#8f6a21' : '#4c2a56';
  ctx.beginPath();
  ctx.arc(x + 13, y + 13, 8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f8ebc8';
  font(ctx, 7, '700', true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(good ? '善' : '悪', x + 13, y + 13);
  ctx.fillStyle = 'rgba(33,22,15,0.75)';
  ctx.fillRect(x + 4, y + h - 15, w - 36, 11);
  clippedText(ctx, node.rule, x + 7, y + h - 9.5, w - 42, 5.6, '#f2e5c6', '500');
  if (node.tokens) {
    drawSeal(ctx, x + 13, y + h - 18, 6, '備', '#b23a2b', 4.8);
  }
  ctx.restore();
}

function createNodeArtCanvas(board, node, w, h) {
  const art = document.createElement('canvas');
  art.width = Math.max(1, Math.ceil(w));
  art.height = Math.max(1, Math.ceil(h));
  const ag = art.getContext('2d');
  ag.translate(-node.x, -node.y);
  drawNodeArtDirect(board, node, ag);
  return art;
}

function drawNodeArtDirect(board, node, g) {
  const bIndex = board.id === 'tokaido' ? 0 : board.id === 'yokai' ? 1 : board.id === 'kesshu' ? 2 : 3;
  // eslint-disable-next-line no-use-before-define
  drawNodeArt(g, bIndex, node, node.x, node.y, node.w, node.h);
}

function drawStaticBoard(ctx, board) {
  drawBoardBase(ctx, board);
  drawConnectors(ctx, board);
  // Compute per-node art caches before drawing frames.
  for (const node of board.nodes) {
    node.__artCanvas = createNodeArtCanvas(board, node, node.w, node.h);
  }
  for (let i = 0; i < board.nodes.length; i++) {
    const node = board.nodes[i];
    board.__nodeCanvas = node.__artCanvas;
    drawNodeFrame(ctx, board, node, i);
  }
  board.__nodeCanvas = null;
}

function buildSceneCache(boardIndex) {
  const board = BOARDS[boardIndex];
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  drawStageBackground(g);
  drawHeader(g, board);
  drawTableTop(g, board);
  drawBoardFrame(g);
  drawLeftPanelSkin(g, board, true);
  g.save();
  g.translate(BOARD_SURFACE.x, BOARD_SURFACE.y);
  g.scale(BOARD_SCALE_X, BOARD_SCALE_Y);
  drawStaticBoard(g, board);
  g.restore();
  return c;
}

function drawTableTop(ctx, board) {
  const bx = BOARD_SURFACE.x;
  const by = BOARD_SURFACE.y - 18;
  const bw = BOARD_SURFACE.w;
  const bh = BOARD_SURFACE.h;
  ctx.save();
  ctx.fillStyle = '#171310';
  ctx.fillRect(bx - 18, by, bw + 36, bh + 24);
  const g = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
  g.addColorStop(0, '#2b2017');
  g.addColorStop(0.5, '#1d1713');
  g.addColorStop(1, '#15110e');
  ctx.fillStyle = g;
  ctx.fillRect(bx - 16, by, bw + 32, bh + 18);
  const vg = ctx.createRadialGradient(bx + bw / 2, by + bh / 2, bw * 0.2, bx + bw / 2, by + bh / 2, bw * 0.58);
  vg.addColorStop(0, 'rgba(255,255,255,0.07)');
  vg.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = vg;
  ctx.fillRect(bx - 16, by, bw + 32, bh + 18);
  ctx.restore();
}

function drawBoardFrame(ctx) {
  const x = BOARD_SURFACE.x - 16;
  const y = BOARD_SURFACE.y - 16;
  const w = BOARD_SURFACE.w + 32;
  const h = BOARD_SURFACE.h + 32;
  ctx.save();
  // 2.5D paper thickness + raised bevel.
  ctx.fillStyle = '#2a1b12';
  ctx.fillRect(x, BOARD_SURFACE.y + BOARD_SURFACE.h, w, 20);
  ctx.fillRect(x, y, 20, h);
  ctx.fillStyle = boardPaperTint();
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#8d6c37';
  ctx.lineWidth = 6;
  ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  ctx.strokeStyle = 'rgba(218,178,103,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 9, y + 9, w - 18, h - 18);
  ctx.restore();
}

function boardPaperTint() {
  const board = currentBoard();
  return board.paper || '#efe0bd';
}

/* ------------------------------------------------------------------ */
/* Left-hand volume skin                                               */
/* ------------------------------------------------------------------ */

function drawLeftPanelSkin(ctx, board, staticOnly = false) {
  const { x, y, w, h } = LEFT_PANEL;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 12;
  if (board.id === 'tokaido') {
    panelPaper(ctx, x, y, w, h, '#d2b077');
    bambooGrain(ctx, x + 4, y + 4, w - 8, h - 8, 1);
    ctx.fillStyle = 'rgba(122,78,37,0.18)';
    ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    // Burned-in passport border.
    ctx.strokeStyle = 'rgba(83,49,21,0.7)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x + 10, y + 10, w - 20, h - 20);
    ctx.strokeStyle = 'rgba(239,218,171,0.34)';
    ctx.strokeRect(x + 14, y + 14, w - 28, h - 28);
  } else if (board.id === 'yokai') {
    lacquer(ctx, x, y, w, h, '#141a1b', '#5b4c33');
    bambooGrain(ctx, x + 4, y + 4, w - 8, h - 8, 4);
    ctx.fillStyle = 'rgba(16,21,22,0.55)';
    ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    drawPattern(ctx, 'sayagata', x + 6, y + 6, w - 12, h - 12, '#a99161', 0.08, 18);
  } else if (board.id === 'kesshu') {
    lacquer(ctx, x, y, w, h, '#1a1715', '#9a7433');
    drawPattern(ctx, 'kikko', x + 7, y + 7, w - 14, h - 14, '#c39b47', 0.12, 20);
    goldFleck(ctx, x + 7, y + 7, w - 14, h - 14, 'left-kesshu', 55);
  } else {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#9c7a36');
    g.addColorStop(0.25, '#d4b565');
    g.addColorStop(0.55, '#8c682c');
    g.addColorStop(1, '#c7a653');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    goldFleck(ctx, x + 5, y + 5, w - 10, h - 10, 'left-genji', 80);
    ctx.strokeStyle = '#4c3514';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
    ctx.strokeStyle = 'rgba(255,246,215,0.35)';
    ctx.strokeRect(x + 10, y + 10, w - 20, h - 20);
  }
  ctx.shadowColor = 'transparent';

  const ink = board.id === 'tokaido' ? '#342317' : board.id === 'genji' ? '#2c1e0e' : '#e4ce9c';
  drawSeal(ctx, x + w / 2, y + 38, 21, board.volumeKanji, board.accent, 20, true);
  ctx.fillStyle = ink;
  font(ctx, 10, '500', true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(board.volume, x + w / 2, y + 66);
  // Vertical short title.
  verticalText(ctx, board.shortTitle, x + w / 2, y + 90, 17, ink, 2, '700', true, 142);
  ctx.strokeStyle = board.id === 'tokaido' ? 'rgba(74,45,21,0.42)' : 'rgba(231,204,143,0.35)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x + 24, y + 236);
  ctx.lineTo(x + w - 24, y + 236);
  ctx.stroke();
  ctx.fillStyle = board.id === 'tokaido' ? 'rgba(70,43,19,0.82)' : 'rgba(236,216,170,0.78)';
  font(ctx, 7.5, '500');
  ctx.textAlign = 'center';
  ctx.fillText(board.styleLabel, x + w / 2, y + 246);
  ctx.fillStyle = board.id === 'tokaido' ? 'rgba(72,45,22,0.72)' : 'rgba(228,207,161,0.65)';
  wrapText(ctx, board.ruleSummary, x + 17, y + 264, w - 34, 11, 7, ctx.fillStyle, 6);

  if (!staticOnly) {
    ctx.fillStyle = board.id === 'tokaido' ? 'rgba(83,51,24,0.11)' : 'rgba(230,208,162,0.08)';
    ctx.fillRect(x + 12, y + 340, w - 24, 194);
    ctx.strokeStyle = board.id === 'tokaido' ? 'rgba(83,51,24,0.32)' : 'rgba(230,208,162,0.25)';
    ctx.strokeRect(x + 12, y + 340, w - 24, 194);
    ctx.fillStyle = ink;
    font(ctx, 8, '700', true);
    ctx.textAlign = 'center';
    ctx.fillText('旅 の 記 録', x + w / 2, y + 349);
    const human = G.match?.humanSide ?? 0;
    const used = G.match?.charmUsed?.[human] || 0;
    const rows = [
      ['手番', `第 ${G.match?.turnCount || 0} 手`],
      ['現在地', `${G.match?.pos?.[human] ?? 0} / ${board.goal}`],
      ['討入備え', board.id === 'kesshu' ? `${G.kesshuPieces} / 3` : '—'],
      ['使った札', `${[1, 2, 4].filter(m => used & m).length} / ${G.charms.length}`],
    ];
    for (let i = 0; i < rows.length; i++) {
      const ry = y + 368 + i * 23;
      ctx.textAlign = 'left';
      ctx.fillStyle = board.id === 'tokaido' ? 'rgba(70,43,20,0.7)' : 'rgba(228,207,161,0.62)';
      font(ctx, 7, '500');
      ctx.fillText(rows[i][0], x + 24, ry);
      ctx.textAlign = 'right';
      ctx.fillStyle = ink;
      font(ctx, 8, '700');
      ctx.fillText(rows[i][1], x + w - 24, ry);
    }
    drawCharmPips(ctx, x + 22, y + 468, w - 44, board, ink);
  }

  // Three action buttons, same hit boxes but four skins.
  const btn = (rect, text, glyph, active) => {
    const g = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
    if (board.id === 'tokaido') {
      g.addColorStop(0, active ? '#c49b5b' : '#a67b47');
      g.addColorStop(1, active ? '#8d622e' : '#75502b');
    } else if (board.id === 'genji') {
      g.addColorStop(0, active ? '#d4b466' : '#a98942');
      g.addColorStop(1, active ? '#8f6a28' : '#6e4f1c');
    } else {
      g.addColorStop(0, active ? '#413a31' : '#2d2924');
      g.addColorStop(1, '#151311');
    }
    ctx.fillStyle = g;
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 2);
    ctx.fill();
    ctx.strokeStyle = board.id === 'tokaido' || board.id === 'genji' ? 'rgba(55,35,15,0.72)' : 'rgba(203,169,97,0.55)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = board.id === 'tokaido' || board.id === 'genji' ? '#24170c' : '#e9d5a5';
    font(ctx, 8, '700');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${glyph}  ${text}`, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5);
  };
  btn(PLAY_BUTTONS.gallery, '錦絵図鑑', '絵', G.hoverPlayBtn === 0);
  btn(PLAY_BUTTONS.charms, '懐中守り', '守', G.hoverPlayBtn === 1);
  btn(PLAY_BUTTONS.menu, '巻を選ぶ', '巻', G.hoverPlayBtn === 2);

  // Corner seal.
  drawSeal(ctx, x + w - 20, y + h - 22, 11, board.id === 'tokaido' ? '旅' : board.id === 'yokai' ? '怪' : board.id === 'kesshu' ? '武' : '雅', board.accent, 9, true);
  ctx.restore();
}

function drawCharmPips(ctx, x, y, w, board, ink) {
  const human = G.match?.humanSide ?? 0;
  const mask = G.match?.charms?.[human] || 0;
  const used = G.match?.charmUsed?.[human] || 0;
  const labels = [['宿', 1], ['封', 2], ['駕', 4]];
  const cw = (w - 8) / 3;
  for (let i = 0; i < 3; i++) {
    const [label, bit] = labels[i];
    const bx = x + i * (cw + 4);
    const active = (mask & bit) && !(used & bit);
    ctx.fillStyle = active ? 'rgba(178,58,43,0.78)' : 'rgba(90,70,45,0.22)';
    roundRect(ctx, bx, y, cw, 24, 2);
    ctx.fill();
    ctx.strokeStyle = active ? 'rgba(247,229,190,0.7)' : 'rgba(100,77,48,0.35)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.fillStyle = active ? '#f8e9c6' : 'rgba(70,50,28,0.48)';
    font(ctx, 8, '700', true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + cw / 2, y + 12);
  }
}

/* ------------------------------------------------------------------ */
/* Right-hand status, board-specific HUD and dice vessel               */
/* ------------------------------------------------------------------ */

let rightPanelCache = null;
let rightPanelCacheBoard = -1;
let rightPanelFullCache = null;
let rightPanelFullKey = '';

function buildRightPanelStatic(board) {
  const { x, y, w, h } = RIGHT_PANEL;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.save();
  if (board.id === 'tokaido') {
    panelPaper(ctx, x, y, w, h, '#d8bd86');
    ctx.fillStyle = 'rgba(118,79,39,0.1)';
    ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
  } else if (board.id === 'yokai') {
    lacquer(ctx, x, y, w, h, '#151b1c', '#5f5037');
    drawPattern(ctx, 'sayagata', x + 5, y + 5, w - 10, h - 10, '#b6a06d', 0.06, 20);
  } else if (board.id === 'kesshu') {
    lacquer(ctx, x, y, w, h, '#1c1815', '#9f7937');
    drawPattern(ctx, 'kikko', x + 6, y + 6, w - 12, h - 12, '#c7a052', 0.1, 19);
  } else {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#9f7c36');
    g.addColorStop(0.45, '#d7bb70');
    g.addColorStop(1, '#8c682c');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    goldFleck(ctx, x + 5, y + 5, w - 10, h - 10, 'right-genji', 100);
    ctx.strokeStyle = '#4c3514';
    ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
  }
  const ink = board.id === 'tokaido' || board.id === 'genji' ? '#2e2012' : '#e7d2a2';
  ctx.fillStyle = ink;
  font(ctx, 9, '700', true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(board.ui.panelTitle, x + w / 2, y + 12);
  ctx.fillStyle = board.id === 'tokaido' || board.id === 'genji' ? 'rgba(57,38,19,0.62)' : 'rgba(225,204,159,0.55)';
  font(ctx, 6.5, '500');
  ctx.fillText(board.ui.panelSub, x + w / 2, y + 25);
  ctx.strokeStyle = board.id === 'tokaido' || board.id === 'genji' ? 'rgba(63,41,19,0.35)' : 'rgba(220,190,128,0.32)';
  ctx.beginPath();
  ctx.moveTo(x + 16, y + 35);
  ctx.lineTo(x + w - 16, y + 35);
  ctx.stroke();
  ctx.restore();
  return c;
}

function drawLeftPanelDynamic(ctx, board) {
  const { x, y, w, h } = LEFT_PANEL;
  const ink = board.id === 'tokaido' ? '#342317' : board.id === 'genji' ? '#2c1e0e' : '#e4ce9c';
  ctx.save();
  ctx.fillStyle = board.id === 'tokaido' ? 'rgba(83,51,24,0.11)' : 'rgba(230,208,162,0.08)';
  ctx.fillRect(x + 12, y + 340, w - 24, 194);
  ctx.strokeStyle = board.id === 'tokaido' ? 'rgba(83,51,24,0.32)' : 'rgba(230,208,162,0.25)';
  ctx.strokeRect(x + 12, y + 340, w - 24, 194);
  ctx.fillStyle = ink;
  font(ctx, 8, '700', true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('旅 の 記 録', x + w / 2, y + 349);
  const human = G.match?.humanSide ?? 0;
  const used = G.match?.charmUsed?.[human] || 0;
  const rows = [
    ['手番', `第 ${G.match?.turnCount || 0} 手`],
    ['現在地', `${G.match?.pos?.[human] ?? 0} / ${board.goal}`],
    ['討入備え', board.id === 'kesshu' ? `${G.kesshuPieces} / 3` : '—'],
    ['使った札', `${[1, 2, 4].filter(m => used & m).length} / ${G.charms.length}`],
  ];
  for (let i = 0; i < rows.length; i++) {
    const ry = y + 368 + i * 23;
    ctx.textAlign = 'left';
    ctx.fillStyle = board.id === 'tokaido' ? 'rgba(70,43,20,0.7)' : 'rgba(228,207,161,0.62)';
    font(ctx, 7, '500');
    ctx.fillText(rows[i][0], x + 24, ry);
    ctx.textAlign = 'right';
    ctx.fillStyle = ink;
    font(ctx, 8, '700');
    ctx.fillText(rows[i][1], x + w - 24, ry);
  }
  drawCharmPips(ctx, x + 22, y + 468, w - 44, board, ink);
  const btn = (rect, text, glyph, active) => {
    const g = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
    if (board.id === 'tokaido') {
      g.addColorStop(0, active ? '#c49b5b' : '#a67b47');
      g.addColorStop(1, active ? '#8d622e' : '#75502b');
    } else if (board.id === 'genji') {
      g.addColorStop(0, active ? '#d4b466' : '#a98942');
      g.addColorStop(1, active ? '#8f6a28' : '#6e4f1c');
    } else {
      g.addColorStop(0, active ? '#413a31' : '#2d2924');
      g.addColorStop(1, '#151311');
    }
    ctx.fillStyle = g;
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 2);
    ctx.fill();
    ctx.strokeStyle = board.id === 'tokaido' || board.id === 'genji' ? 'rgba(55,35,15,0.72)' : 'rgba(203,169,97,0.55)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = board.id === 'tokaido' || board.id === 'genji' ? '#24170c' : '#e9d5a5';
    font(ctx, 8, '700');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${glyph}  ${text}`, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5);
  };
  btn(PLAY_BUTTONS.gallery, '錦絵図鑑', '絵', G.hoverPlayBtn === 0);
  btn(PLAY_BUTTONS.charms, '懐中守り', '守', G.hoverPlayBtn === 1);
  btn(PLAY_BUTTONS.menu, '巻を選ぶ', '巻', G.hoverPlayBtn === 2);
  ctx.restore();
}

function drawRightPanelSkin(ctx, board, staticOnly = false) {
  const { x, y, w, h } = RIGHT_PANEL;
  if (!rightPanelCache || rightPanelCacheBoard !== G.boardIdx) {
    rightPanelCache = buildRightPanelStatic(board);
    rightPanelCacheBoard = G.boardIdx;
  }
  if (staticOnly) {
    ctx.drawImage(rightPanelCache, 0, 0);
    return;
  }
  const die = G.physDice?.[0];
  const animBucket = (!die || die.settled) && !(G.tube.shake > 0.01)
    ? 'settled'
    : `${Math.round((die?.x || 0) * 2)},${Math.round((die?.y || 0) * 2)},${Math.round((die?.rx || 0) * 10)},${Math.round((G.tube.shake || 0) * 20)}`;
  const key = `${G.boardIdx}|${G.match?.turn}|${G.match?.turnCount}|${G.match?.pos?.join(',')}|${G.match?.tokens?.join(',')}|${G.match?.charmUsed?.join(',')}|${G.hoverPlayBtn}|${G.statusText}|${G.tokaidoGourmet?.length}|${G.yokaiLanterns}|${G.yokaiFrenzy}|${(G.genjiBalance || 0).toFixed(2)}|${G.diceValue}|${G.phase}|${G.rollResolved ? 1 : 0}|${animBucket}`;
  if (!rightPanelFullCache || rightPanelFullKey !== key) {
    if (!rightPanelFullCache) {
      rightPanelFullCache = document.createElement('canvas');
      rightPanelFullCache.width = W;
      rightPanelFullCache.height = H;
    }
    const rctx = rightPanelFullCache.getContext('2d');
    rctx.clearRect(0, 0, W, H);
    rctx.drawImage(rightPanelCache, 0, 0);
    drawLeftPanelDynamic(rctx, board);
    const ink = board.id === 'tokaido' || board.id === 'genji' ? '#2e2012' : '#e7d2a2';
    rctx.save();
    drawTurnBlock(rctx, board, x + 12, y + 43, w - 24, ink);
    rctx.save();
    rctx.fillStyle = board.id === 'tokaido' || board.id === 'genji' ? 'rgba(55,36,18,0.75)' : 'rgba(233,213,172,0.72)';
    font(rctx, 6.2, '500');
    rctx.textAlign = 'center';
    rctx.textBaseline = 'top';
    rctx.fillText(G.statusText || '', x + w / 2, y + 123);
    rctx.restore();
    drawSpecialHud(rctx, board, x + 12, y + 140, w - 24, 206, ink);
    drawDiceTray(rctx, board, x, y, w, h);
    rctx.restore();
    rightPanelFullKey = key;
  }
  ctx.drawImage(rightPanelFullCache, 0, 0);
}

function playerNames(board) {
  if (board.id === 'tokaido') return ['旅人', '同行者'];
  if (board.id === 'yokai') return ['語り手', '怪談師'];
  if (board.id === 'kesshu') return ['味方', '敵将'];
  return ['光源氏', '頭中将'];
}

function drawTurnBlock(ctx, board, x, y, w, ink) {
  const human = G.match?.humanSide ?? 0;
  const turn = G.match?.turn ?? human;
  const names = playerNames(board);
  const isHuman = turn === human;
  ctx.save();
  const g = ctx.createLinearGradient(x, y, x + w, y + 70);
  if (isHuman) {
    g.addColorStop(0, 'rgba(178,58,43,0.24)');
    g.addColorStop(1, 'rgba(178,58,43,0.04)');
  } else {
    g.addColorStop(0, 'rgba(55,83,94,0.2)');
    g.addColorStop(1, 'rgba(55,83,94,0.03)');
  }
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, 76, 2);
  ctx.fill();
  ctx.strokeStyle = isHuman ? 'rgba(178,58,43,0.55)' : 'rgba(87,113,122,0.45)';
  ctx.stroke();
  drawSeal(ctx, x + 20, y + 20, 13, isHuman ? '私' : '敵', isHuman ? '#b23a2b' : '#315e68', 11);
  ctx.fillStyle = ink;
  font(ctx, 10, '700', true);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(isHuman ? 'あなたの手番' : '相手の手番', x + 39, y + 10);
  ctx.fillStyle = board.id === 'tokaido' || board.id === 'genji' ? 'rgba(55,36,18,0.65)' : 'rgba(231,210,164,0.62)';
  font(ctx, 6.5, '500');
  ctx.fillText(isHuman ? '竹筒を振り、出目で道を進む' : '賽の行方を見守る', x + 39, y + 24);
  for (let side = 0; side < 2; side++) {
    const py = y + 40 + side * 16;
    const active = turn === side;
    ctx.fillStyle = active ? (side === 0 ? 'rgba(178,58,43,0.2)' : 'rgba(49,94,104,0.2)') : 'transparent';
    ctx.fillRect(x + 6, py - 2, w - 12, 15);
    ctx.fillStyle = side === 0 ? '#a74132' : '#315e68';
    ctx.beginPath();
    ctx.arc(x + 12, py + 5, 3.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = ink;
    font(ctx, 7.5, active ? '700' : '500');
    ctx.textAlign = 'left';
    ctx.fillText(`${names[side]}${side === human ? '（あなた）' : ''}`, x + 20, py);
    ctx.textAlign = 'right';
    const tokens = G.match?.tokens?.[side] || 0;
    const tokenText = board.id === 'kesshu' ? `備 ${[1, 2, 4].filter(m => tokens & m).length}/3` : `位置 ${G.match?.pos?.[side] ?? 0}`;
    ctx.fillText(tokenText, x + w - 8, py);
  }
  ctx.restore();
}

function hudFrame(ctx, x, y, w, h, board, ink) {
  ctx.fillStyle = board.id === 'tokaido' || board.id === 'genji' ? 'rgba(89,58,26,0.08)' : 'rgba(218,193,143,0.055)';
  roundRect(ctx, x, y, w, h, 2);
  ctx.fill();
  ctx.strokeStyle = board.id === 'tokaido' || board.id === 'genji' ? 'rgba(75,48,22,0.34)' : 'rgba(220,190,128,0.28)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = ink;
  font(ctx, 8, '700', true);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(board.ui.hudLabel, x + 10, y + 9);
}

function drawSpecialHud(ctx, board, x, y, w, h, ink) {
  ctx.save();
  hudFrame(ctx, x, y, w, h, board, ink);
  const human = G.match?.humanSide ?? 0;
  if (board.ui.hud === 'tokaido-gourmet') {
    drawPattern(ctx, 'seigaiha', x + 4, y + 26, w - 8, 58, '#315e78', 0.18, 13);
    const foods = ['泥鰌鍋 +2', '稲荷寿司 +2', '宇治茶 +3'];
    for (let i = 0; i < 3; i++) {
      const fy = y + 35 + i * 29;
      const hit = G.tokaidoGourmet.includes(i);
      ctx.fillStyle = hit ? 'rgba(178,58,43,0.18)' : 'rgba(246,235,207,0.32)';
      roundRect(ctx, x + 10, fy - 8, w - 20, 23, 2);
      ctx.fill();
      ctx.strokeStyle = hit ? 'rgba(178,58,43,0.5)' : 'rgba(80,54,28,0.25)';
      ctx.stroke();
      ctx.fillStyle = hit ? '#8e2d23' : ink;
      font(ctx, 7.5, hit ? '700' : '500', true);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(foods[i], x + 18, fy + 3);
      drawSeal(ctx, x + w - 26, fy + 3, 7, hit ? '食' : '宿', hit ? '#b23a2b' : '#8b7653', 5.6);
    }
    ctx.fillStyle = ink;
    font(ctx, 6.5, '500');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('名物に止まると次の跳びが伸びる', x + 10, y + 130);
    const boost = G.tokaidoGourmet.length;
    ctx.fillStyle = 'rgba(178,58,43,0.85)';
    ctx.fillRect(x + 10, y + 146, (w - 20) * (boost / 3), 8);
    ctx.strokeStyle = 'rgba(80,53,26,0.3)';
    ctx.strokeRect(x + 10, y + 146, w - 20, 8);
    ctx.fillStyle = ink;
    font(ctx, 7, '700');
    ctx.textAlign = 'right';
    ctx.fillText(`名物 ${boost} / 3`, x + w - 10, y + 162);
    drawKomae(ctx, x + 47, y + h - 31, 19, 0);
    ctx.fillStyle = ink;
    font(ctx, 6.5, '500');
    ctx.textAlign = 'right';
    ctx.fillText('東海道五十三次', x + w - 12, y + h - 20);
  } else if (board.ui.hud === 'hyakumonogatari-lanterns') {
    // Four lit blue lanterns.
    const lit = Math.max(0, Math.min(4, G.yokaiLanterns));
    const gap = (w - 26) / 4;
    for (let i = 0; i < 4; i++) {
      const cx = x + 13 + gap * (i + 0.5);
      const cy = y + 65;
      const on = i < lit;
      if (on) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 37);
        g.addColorStop(0, 'rgba(92,190,179,0.34)');
        g.addColorStop(1, 'rgba(92,190,179,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - 40, cy - 40, 80, 80);
      }
      drawLantern(ctx, cx, cy, 17, 32, false);
      ctx.fillStyle = on ? 'rgba(93,192,180,0.75)' : 'rgba(50,45,40,0.55)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 7, 13, 0, 0, TAU);
      ctx.fill();
      if (on) {
        ctx.fillStyle = 'rgba(232,245,222,0.8)';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 8 + Math.sin(G.pulseTick * 2 + i) * 1.5);
        ctx.quadraticCurveTo(cx + 5, cy - 1, cx, cy + 7);
        ctx.quadraticCurveTo(cx - 4, cy + 1, cx, cy - 8);
        ctx.fill();
      }
      ctx.fillStyle = on ? '#6bbcb1' : 'rgba(80,70,55,0.6)';
      font(ctx, 6.5, '700');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(on ? '灯' : '消', cx, cy + 20);
    }
    ctx.fillStyle = ink;
    font(ctx, 7, '500');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('怪異に止まると青行灯がひとつ消える', x + 10, y + 118);
    ctx.fillStyle = G.yokaiFrenzy ? '#8e2d23' : ink;
    font(ctx, 8, '700', true);
    ctx.fillText(G.yokaiFrenzy ? '百鬼夜行 ─ 怪異飛距離 二倍' : '四灯全滅で百鬼夜行', x + 10, y + 135);
    ctx.fillStyle = 'rgba(93,192,180,0.7)';
    ctx.fillRect(x + 10, y + 152, (w - 20) * (lit / 4), 8);
    ctx.strokeStyle = 'rgba(80,70,55,0.4)';
    ctx.strokeRect(x + 10, y + 152, w - 20, 8);
    drawCloud(ctx, x + 8, y + 168, w - 16, 30, 'rgba(42,74,79,0.24)', 0.45);
    ctx.fillStyle = ink;
    font(ctx, 6.2, '500');
    ctx.textAlign = 'center';
    ctx.fillText('百物語・青行灯', x + w / 2, y + h - 14);
  } else if (board.ui.hud === 'kesshu-regalia') {
    const tokens = G.match?.tokens?.[human] || 0;
    const items = [['兜', 1], ['太刀', 2], ['陣太鼓', 4]];
    for (let i = 0; i < 3; i++) {
      const [label, bit] = items[i];
      const bx = x + 10 + i * ((w - 20) / 3);
      const by = y + 35;
      const bw = (w - 28) / 3;
      const has = (tokens & bit) !== 0;
      ctx.fillStyle = has ? 'rgba(178,58,43,0.22)' : 'rgba(230,205,154,0.06)';
      roundRect(ctx, bx, by, bw, 66, 2);
      ctx.fill();
      ctx.strokeStyle = has ? 'rgba(218,176,88,0.8)' : 'rgba(210,182,128,0.26)';
      ctx.stroke();
      drawSeal(ctx, bx + bw / 2, by + 23, 13, has ? '備' : '空', has ? '#9a2924' : '#5b5546', 10);
      ctx.fillStyle = has ? '#f0d798' : 'rgba(220,200,160,0.5)';
      font(ctx, 6.8, '700');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, bx + bw / 2, by + 40);
    }
    const count = [1, 2, 4].filter(m => tokens & m).length;
    ctx.fillStyle = ink;
    font(ctx, 7, '500');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('三備えを揃えねば御前に弾き返される', x + 10, y + 112);
    ctx.fillStyle = 'rgba(182,138,46,0.82)';
    ctx.fillRect(x + 10, y + 130, (w - 20) * (count / 3), 10);
    ctx.strokeStyle = 'rgba(215,187,129,0.36)';
    ctx.strokeRect(x + 10, y + 130, w - 20, 10);
    ctx.fillStyle = count >= 3 ? '#f0d798' : ink;
    font(ctx, 8, '700', true);
    ctx.textAlign = 'right';
    ctx.fillText(count >= 3 ? '出陣可' : `集結 ${count} / 3`, x + w - 10, y + 149);
    ctx.strokeStyle = 'rgba(190,157,87,0.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(x + 40, y + 183, 16, 0, TAU);
    ctx.stroke();
    drawCrane(ctx, x + 40, y + 183, 0.45, 'rgba(220,185,104,0.7)');
    ctx.fillStyle = ink;
    font(ctx, 6.2, '500');
    ctx.textAlign = 'right';
    ctx.fillText('黒漆金箔・甲胄威毛', x + w - 10, y + 176);
  } else {
    // Genji good/evil balance.
    const bal = Math.max(-1, Math.min(1, G.genjiBalance || 0));
    const cx = x + w / 2;
    const by = y + 112;
    ctx.strokeStyle = 'rgba(61,41,18,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 54, by);
    ctx.lineTo(cx + 54, by);
    ctx.stroke();
    ctx.save();
    ctx.translate(cx, by);
    ctx.rotate(bal * 0.2);
    ctx.strokeStyle = '#7d5a20';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-62, 0);
    ctx.lineTo(62, 0);
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.strokeStyle = 'rgba(70,48,21,0.7)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(side * 58, 0);
      ctx.lineTo(side * 58, 28);
      ctx.stroke();
      ctx.fillStyle = side < 0 ? 'rgba(212,176,83,0.75)' : 'rgba(59,35,66,0.75)';
      ctx.beginPath();
      ctx.ellipse(side * 58, 30, 19, 5, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,48,21,0.7)';
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#8a651f';
    font(ctx, 8, '700', true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('善', cx - 58, by + 42);
    ctx.fillStyle = '#4b2a55';
    ctx.fillText('悪', cx + 58, by + 42);
    ctx.fillStyle = ink;
    font(ctx, 7, '500');
    ctx.textAlign = 'left';
    ctx.fillText('善玉は連跳、悪玉は泥舟・戒律', x + 10, y + 39);
    ctx.fillStyle = bal > 0.1 ? '#8a651f' : bal < -0.1 ? '#4b2a55' : ink;
    font(ctx, 8, '700', true);
    ctx.fillText(bal > 0.1 ? '善玉に傾く' : bal < -0.1 ? '悪玉に傾く' : '心の天平は凪', x + 10, y + 160);
    ctx.fillStyle = 'rgba(182,138,46,0.35)';
    ctx.fillRect(x + 10, y + 178, w - 20, 8);
    ctx.fillStyle = 'rgba(59,35,66,0.35)';
    ctx.fillRect(x + 10 + (w - 20) * 0.5, y + 178, (w - 20) * 0.5, 8);
    ctx.fillStyle = 'rgba(246,235,203,0.7)';
    ctx.fillRect(x + w / 2 - 1, y + 176, 2, 12);
    drawCrane(ctx, x + w - 38, y + h - 32, 0.55, 'rgba(58,38,15,0.72)');
  }
  ctx.restore();
}

function drawDiceTray(ctx, board, panelX, panelY, panelW, panelH) {
  const { x, y, w, h } = DICE_TRAY;
  ctx.save();
  // Tatami mat tray with dark lacquer rim.
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#2b2017';
  roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 4);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#b7a66f');
  g.addColorStop(0.5, '#948454');
  g.addColorStop(1, '#6f623d');
  ctx.fillStyle = g;
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(58,41,23,0.65)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
  ctx.strokeStyle = 'rgba(230,215,168,0.18)';
  for (let i = 0; i < 22; i++) {
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 10 + i * 10);
    ctx.lineTo(x + w - 8, y + 10 + i * 10);
    ctx.stroke();
  }
  drawPattern(ctx, 'ichimatsu', x + 7, y + 7, w - 14, h - 14, '#5d4c2b', 0.08, 17);
  ctx.fillStyle = board.id === 'tokaido' || board.id === 'genji' ? '#3d2a16' : '#e7d2a2';
  font(ctx, 8, '700', true);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('賽  ─  物理骨骰', x + 12, y + 10);
  ctx.fillStyle = board.id === 'tokaido' || board.id === 'genji' ? 'rgba(61,42,22,0.62)' : 'rgba(226,204,160,0.55)';
  font(ctx, 6, '500');
  ctx.textAlign = 'right';
  ctx.fillText(board.ui.diceDevice, x + w - 12, y + 12);
  // Felt shadow well.
  ctx.fillStyle = 'rgba(34,24,15,0.28)';
  ctx.beginPath();
  ctx.ellipse(x + w * 0.7, y + h * 0.63, 54, 27, 0, 0, TAU);
  ctx.fill();
  drawDiceDevice(ctx, board, x, y, w, h);
  ctx.save();
  ctx.fillStyle = board.id === 'tokaido' || board.id === 'genji' ? 'rgba(55,36,18,0.82)' : 'rgba(236,216,174,0.8)';
  font(ctx, 13, '700', true);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(`出目  ${G.diceValue || '—'}`, x + w - 14, y + 28);
  ctx.restore();
  // V2: a single large ivory bone die (1-6 pips), centred in the vessel.
  const sorted = [...G.physDice].sort(function(a, b){ return a.y - b.y; });
  for (const die of sorted) drawDie3D(ctx, die, 42);
  // Giant ivory-pip result banner the moment the die settles.
  if (G.rollResolved && G.diceValue && (!G.physDice[0] || G.physDice[0].settled)) {
    const kanji = ['一','二','三','四','五','六'];
    ctx.save();
    const bx = x + w / 2;
    const by = y + 48;
    roundRect(ctx, bx - 78, by - 16, 156, 32, 6);
    ctx.fillStyle = 'rgba(178,58,43,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(238,220,170,0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#f8e9c6';
    font(ctx, 15, '700', true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`出目： ${kanji[(G.diceValue || 1) - 1] || G.diceValue}`, bx, by - 4);
    ctx.fillStyle = 'rgba(239,213,132,0.95)';
    font(ctx, 8, '400');
    ctx.fillText('──── 進む！', bx, by + 10);
    ctx.restore();
  }
  // Tiny instruction.
  ctx.fillStyle = board.id === 'tokaido' || board.id === 'genji' ? 'rgba(52,35,18,0.72)' : 'rgba(227,206,163,0.58)';
  font(ctx, 5.7, '500');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const text = G.phase === 'ANIM' ? '骨骰が転がる…' : G.match?.turn === G.match?.humanSide ? '筒を押さえ、離して投げる' : '相手の賽を待つ';
  ctx.fillText(text, x + w / 2, y + h - 8);
  ctx.restore();
}

function drawDiceDevice(ctx, board, trayX, trayY, trayW, trayH) {
  const cx = TUBE_CENTER.x;
  const cy = TUBE_CENTER.y;
  const time = G.pulseTick || 0;
  const shake = G.tube.shake || 0;
  ctx.save();
  ctx.translate(cx + Math.sin(time * 37) * shake * 4, cy + Math.cos(time * 31) * shake * 2);
  ctx.rotate(Math.sin(time * 24) * shake * 0.04);
  ctx.shadowColor = 'rgba(0,0,0,0.42)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  if (board.ui.diceShape === 'porcelain-bowl') {
    // White porcelain bowl with blue-and-white seigaiha.
    ctx.fillStyle = '#ece7d9';
    ctx.beginPath();
    ctx.moveTo(-42, -18);
    ctx.bezierCurveTo(-44, 18, -29, 39, 0, 42);
    ctx.bezierCurveTo(29, 39, 44, 18, 42, -18);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'transparent';
    const rim = ctx.createLinearGradient(-42, -20, 42, 10);
    rim.addColorStop(0, '#fffdf4');
    rim.addColorStop(1, '#c9c8bd');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.ellipse(0, -18, 42, 12, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#4e7b94';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, -18, 34, 8.5, 0, 0, TAU);
    ctx.stroke();
    drawPattern(ctx, 'seigaiha', -34, -18, 68, 13, '#3e6e89', 0.52, 8);
    ctx.strokeStyle = 'rgba(61,107,132,0.6)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 9 + i * 8, 30 - i * 6, 6, 0, 0, Math.PI);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(61,107,132,0.55)';
    ctx.beginPath();
    ctx.arc(-17, 16, 3, 0, TAU);
    ctx.arc(14, 25, 2.4, 0, TAU);
    ctx.fill();
    // Foot ring.
    ctx.strokeStyle = '#8f9088';
    ctx.beginPath();
    ctx.ellipse(0, 40, 20, 5, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,253,243,0.55)';
    ctx.beginPath();
    ctx.ellipse(-13, -21, 13, 3, -0.2, 0, TAU);
    ctx.fill();
  } else if (board.ui.diceShape === 'talisman-bamboo') {
    // Black bamboo cylinder with a vermilion paper talisman.
    const body = ctx.createLinearGradient(-26, 0, 28, 0);
    body.addColorStop(0, '#101314');
    body.addColorStop(0.45, '#313333');
    body.addColorStop(1, '#0b0d0e');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-25, -38);
    ctx.lineTo(25, -38);
    ctx.lineTo(22, 40);
    ctx.quadraticCurveTo(0, 47, -22, 40);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'transparent';
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = 'rgba(189,161,102,0.35)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(0, -29 + i * 18, 24 - i * 0.8, 5, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = '#d6c18e';
    ctx.beginPath();
    ctx.ellipse(0, -38, 25, 7, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#56472e';
    ctx.stroke();
    ctx.fillStyle = '#1a1714';
    ctx.beginPath();
    ctx.ellipse(0, -38, 17, 4.2, 0, 0, TAU);
    ctx.fill();
    // Red paper talisman.
    ctx.fillStyle = '#c74735';
    ctx.fillRect(-13, -22, 26, 44);
    ctx.strokeStyle = 'rgba(250,228,191,0.8)';
    ctx.strokeRect(-12, -21, 24, 42);
    ctx.fillStyle = '#f7e7c0';
    font(ctx, 8, '700', true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('封', 0, -5);
    ctx.fillText('怪', 0, 8);
    ctx.strokeStyle = 'rgba(247,231,192,0.7)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-8, 20 + i * 4);
      ctx.lineTo(8, 20 + i * 4);
      ctx.stroke();
    }
  } else if (board.ui.diceShape === 'hex-makie') {
    // Hexagonal gold maki-e army tube.
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 6;
      const px = Math.cos(a) * 29;
      const py = Math.sin(a) * 29 - 4;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(-28, -30, 28, 32);
    g.addColorStop(0, '#d4b15c');
    g.addColorStop(0.35, '#7e5a20');
    g.addColorStop(0.68, '#c9a348');
    g.addColorStop(1, '#4d3514');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#3e2a10';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,239,183,0.55)';
    ctx.beginPath();
    ctx.ellipse(0, -31, 25, 7, 0, 0, TAU);
    ctx.stroke();
    drawPattern(ctx, 'kikko', -25, -20, 50, 48, '#3c2a12', 0.25, 9);
    ctx.fillStyle = 'rgba(33,24,15,0.8)';
    ctx.beginPath();
    ctx.ellipse(0, -31, 15, 4, 0, 0, TAU);
    ctx.fill();
    drawSeal(ctx, 0, 8, 12, '陣', '#9a2924', 10);
  } else {
    // Vermilion crane maki-e cylinder.
    const g = ctx.createLinearGradient(-27, 0, 27, 0);
    g.addColorStop(0, '#5e1915');
    g.addColorStop(0.35, '#b83c2c');
    g.addColorStop(0.62, '#8a241c');
    g.addColorStop(1, '#4b120f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-27, -40);
    ctx.lineTo(27, -40);
    ctx.lineTo(24, 36);
    ctx.quadraticCurveTo(0, 45, -24, 36);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,222,171,0.4)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(0, -31 + i * 18, 26, 5, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = '#d9b45f';
    ctx.beginPath();
    ctx.ellipse(0, -40, 27, 7, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2a1a10';
    ctx.beginPath();
    ctx.ellipse(0, -40, 18, 4.4, 0, 0, TAU);
    ctx.fill();
    drawCrane(ctx, 0, -6, 0.85, '#e5c36f');
    drawPattern(ctx, 'seigaiha', -23, 13, 46, 22, '#e5c36f', 0.25, 8);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 3D bone die                                                         */
/* ------------------------------------------------------------------ */

const DIE_FACES = [
  { value: 1, n: [0, 0, 1], verts: [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]], u: [1, 0, 0], v: [0, 1, 0] },
  { value: 6, n: [0, 0, -1], verts: [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]], u: [-1, 0, 0], v: [0, 1, 0] },
  { value: 2, n: [1, 0, 0], verts: [[.5, -.5, -.5], [.5, -.5, .5], [.5, .5, .5], [.5, .5, -.5]], u: [0, 0, -1], v: [0, 1, 0] },
  { value: 5, n: [-1, 0, 0], verts: [[-.5, -.5, .5], [-.5, -.5, -.5], [-.5, .5, -.5], [-.5, .5, .5]], u: [0, 0, 1], v: [0, 1, 0] },
  { value: 3, n: [0, 1, 0], verts: [[-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5]], u: [1, 0, 0], v: [0, 0, -1] },
  { value: 4, n: [0, -1, 0], verts: [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5]], u: [1, 0, 0], v: [0, 0, 1] },
];

const PIPS = {
  1: [[0, 0]],
  2: [[-0.55, -0.55], [0.55, 0.55]],
  3: [[-0.55, -0.55], [0, 0], [0.55, 0.55]],
  4: [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]],
  5: [[-0.55, -0.55], [0.55, -0.55], [0, 0], [-0.55, 0.55], [0.55, 0.55]],
  6: [[-0.55, -0.6], [0.55, -0.6], [-0.55, 0], [0.55, 0], [-0.55, 0.6], [0.55, 0.6]],
};

function rotMat(rx, ry, rz) {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Ry * Rz * Rx
  const r00 = cy * cz;
  const r01 = -cy * sz;
  const r02 = sy;
  const r10 = cx * sz + sx * sy * cz;
  const r11 = cx * cz - sx * sy * sz;
  const r12 = -sx * cy;
  const r20 = sx * sz - cx * sy * cz;
  const r21 = sx * cz + cx * sy * sz;
  const r22 = cx * cy;
  return [r00, r01, r02, r10, r11, r12, r20, r21, r22];
}

function applyMat(m, p) {
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2],
    m[3] * p[0] + m[4] * p[1] + m[5] * p[2],
    m[6] * p[0] + m[7] * p[1] + m[8] * p[2],
  ];
}

function viewPoint(p) {
  const yaw = -0.58;
  const pitch = 0.42;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x1 = p[0] * cy + p[2] * sy;
  const z1 = -p[0] * sy + p[2] * cy;
  const y2 = p[1] * cp - z1 * sp;
  const z2 = p[1] * sp + z1 * cp;
  return [x1, y2, z2];
}

function projectDie(p, cx, cy, scale) {
  const v = viewPoint(p);
  const persp = 2.8 / (2.8 + v[2]);
  return { x: cx + v[0] * scale * persp, y: cy - v[1] * scale * persp, z: v[2], s: persp };
}

function drawDie3D(ctx, die, size) {
  const scale = size * 1.8;
  const cx = die.x;
  const cy = die.y - die.z * 0.8;
  const m = rotMat(die.rx || 0, die.ry || 0, die.rz || 0);
  ctx.save();
  // Contact shadow.
  const sh = ctx.createRadialGradient(cx, die.y + size * 0.48, 0, cx, die.y + size * 0.48, size * 0.74);
  sh.addColorStop(0, 'rgba(20,14,9,0.4)');
  sh.addColorStop(1, 'rgba(20,14,9,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(cx, die.y + size * 0.48, size * 0.72, size * 0.22, 0, 0, TAU);
  ctx.fill();

  const faces = DIE_FACES.map(face => {
    const pts = face.verts.map(v => projectDie(applyMat(m, v), cx, cy, scale));
    const n = applyMat(m, face.n);
    const vn = viewPoint(n);
    const center = pts.reduce((acc, p) => [acc[0] + p.x / 4, acc[1] + p.y / 4, acc[2] + p.z / 4], [0, 0, 0]);
    return { face, pts, n, vn, center, depth: center[2] };
  }).sort((a, b) => a.depth - b.depth);

  for (const f of faces) {
    // Backfaces are still painted beneath the front ones to avoid holes.
    const facing = f.vn[2] > -0.02;
    const g = ctx.createLinearGradient(f.pts[0].x, f.pts[0].y, f.pts[2].x, f.pts[2].y);
    if (facing) {
      const light = 0.72 + 0.24 * Math.max(0, f.vn[2]);
      g.addColorStop(0, `rgba(249,241,216,${0.82 * light + 0.1})`);
      g.addColorStop(0.55, `rgba(231,216,180,${0.94 * light + 0.05})`);
      g.addColorStop(1, `rgba(194,171,126,${0.96 * light})`);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = 'rgba(147,124,85,0.72)';
    }
    ctx.beginPath();
    ctx.moveTo(f.pts[0].x, f.pts[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(f.pts[i].x, f.pts[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = facing ? 'rgba(79,57,33,0.65)' : 'rgba(67,49,29,0.3)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    if (!facing) continue;
    // Ivory grain.
    ctx.strokeStyle = 'rgba(132,101,58,0.18)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 3; i++) {
      const t = (i + 1) / 4;
      const ax = f.pts[0].x + (f.pts[1].x - f.pts[0].x) * t;
      const ay = f.pts[0].y + (f.pts[1].y - f.pts[0].y) * t;
      const bx = f.pts[3].x + (f.pts[2].x - f.pts[3].x) * t;
      const by = f.pts[3].y + (f.pts[2].y - f.pts[3].y) * t;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    // Pips, bilinearly mapped into the projected face.
    for (const [u, v] of PIPS[f.face.value]) {
      const p = [
        f.pts[0].x + (f.pts[1].x - f.pts[0].x) * (u + 0.5) + (f.pts[3].x - f.pts[0].x) * (v + 0.5),
        f.pts[0].y + (f.pts[1].y - f.pts[0].y) * (u + 0.5) + (f.pts[3].y - f.pts[0].y) * (v + 0.5),
      ];
      const rr = size * 0.115 * f.pts[0].s;
      const col = f.face.value === 1 ? '#a8392d' : '#241b13';
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(p[0], p[1], rr, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,247,224,0.28)';
      ctx.beginPath();
      ctx.arc(p[0] - rr * 0.25, p[1] - rr * 0.3, rr * 0.28, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Dynamic board content                                               */
/* ------------------------------------------------------------------ */

function animPawn(side, time) {
  const anim = G.pieceAnim;
  if (!anim || anim.side !== side || !anim.path?.length) return pawnPosition(side);
  const p = Math.max(0, Math.min(1, (performance.now() - anim.t0) / anim.duration));
  const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  const seg = Math.min(anim.path.length - 2, Math.floor(eased * (anim.path.length - 1)));
  const local = eased * (anim.path.length - 1) - seg;
  const a = anim.path[seg];
  const b = anim.path[Math.min(seg + 1, anim.path.length - 1)];
  const x = a.x + (b.x - a.x) * local;
  const y = a.y + (b.y - a.y) * local - Math.sin(local * Math.PI) * 18;
  return { x, y };
}

function drawPawn(ctx, side, x, y, time) {
  const board = currentBoard();
  const human = G.match?.humanSide ?? 0;
  const isHuman = side === human;
  const accent = isHuman ? '#b23a2b' : '#315e68';
  const accent2 = isHuman ? '#7f241b' : '#1e4149';
  const bob = Math.sin(time * 2.4 + side * 1.7) * 1.6;
  const H = 60; // standee height
  const W = 36; // standee width
  ctx.save();
  ctx.translate(x, y + bob);

  // Elongated oblique shadow.
  const sh = ctx.createRadialGradient(0, 22, 0, 0, 22, 26);
  sh.addColorStop(0, 'rgba(20,14,9,0.45)');
  sh.addColorStop(1, 'rgba(20,14,9,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(0, 22, 26, 7, 0, 0, TAU);
  ctx.fill();

  // Lacquer komaine base (black with gold edge).
  ctx.fillStyle = accent2;
  ctx.fillRect(-W / 2, 10, W, 14);
  ctx.strokeStyle = '#c49a49';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(-W / 2, 10, W, 14);

  // Erect body standee.
  const g = ctx.createLinearGradient(-W / 2, -H, W / 2, H);
  g.addColorStop(0, isHuman ? '#e57a5f' : '#6bb7c0');
  g.addColorStop(0.5, accent);
  g.addColorStop(1, accent2);
  ctx.fillStyle = g;
  ctx.strokeStyle = 'rgba(240,218,167,0.6)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-W / 2 + 6, 6);
  ctx.bezierCurveTo(-W / 2 + 8, -H + 10, -W / 2 + 18, -H + 4, 0, -H + 2);
  ctx.bezierCurveTo(W / 2 - 18, -H + 4, W / 2 - 8, -H + 10, W / 2 - 6, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Head with a print-badge.
  const headR = 9;
  ctx.fillStyle = isHuman ? '#e7b47e' : '#d9c2a0';
  ctx.beginPath();
  ctx.arc(0, -H + 18, headR, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(79,57,33,0.7)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // Badge: kanji emblem for human / companion pawn.
  ctx.fillStyle = '#f8e8c4';
  font(ctx, 7.5, '700', true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isHuman ? '旅' : '伴', 0, -H + 18);

  // Active-player gold arrow.
  if (isHuman && G.phase !== 'SETTLEMENT' && G.match?.turn === human) {
    ctx.fillStyle = '#e2c46a';
    ctx.strokeStyle = 'rgba(178,58,43,0.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -H - 8);
    ctx.lineTo(-9, -H + 2);
    ctx.lineTo(9, -H + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    font(ctx, 7.5, '700', true);
    ctx.fillStyle = '#f8e8c1';
    ctx.textAlign = 'center';
    ctx.fillText('▼ あなた', 0, -H - 14);
  }
  ctx.restore();
}

function drawPreviewArcs(ctx, board) {
  if (board.id !== 'yokai') return;
  if (G.screen !== 'PLAYING' || G.phase !== 'ROLL') return;
  if (G.match?.turn !== G.match?.humanSide) return;
  if (!G.match || G.match.winner >= 0) return;
  const pawn = animPawn(G.match.humanSide, G.pulseTick);
  const colors = ['#b23a2b', '#315e68', '#b68a2e', '#7c4d78', '#4e7046', '#9b5a31'];
  ctx.save();
  ctx.lineCap = 'round';
  for (let roll = 1; roll <= 6; roll++) {
    const { to } = EsugorokuCore.previewDestinations(board, G.match, roll)[0];
    const node = board.nodes[to];
    const target = nodeCenter(node);
    const mx = (pawn.x + target.x) / 2;
    const my = Math.min(pawn.y, target.y) - 38 - roll * 3;
    ctx.strokeStyle = colors[roll - 1];
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = 2.1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(pawn.x, pawn.y - 5);
    ctx.quadraticCurveTo(mx, my, target.x, target.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = colors[roll - 1];
    ctx.beginPath();
    ctx.arc(target.x, target.y, 7.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f8ebc6';
    font(ctx, 6.4, '700');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(roll), target.x, target.y);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(37,27,20,0.88)';
    const t = 0.72;
    const lx = (1 - t) * (1 - t) * pawn.x + 2 * (1 - t) * t * mx + t * t * target.x;
    const ly = (1 - t) * (1 - t) * (pawn.y - 5) + 2 * (1 - t) * t * my + t * t * target.y;
    const label = `${roll}→${to}`;
    const tw = 26;
    roundRect(ctx, lx - tw / 2, ly - 6, tw, 11, 2);
    ctx.fill();
    ctx.fillStyle = '#f7e8c4';
    ctx.font = '600 5.8px "Shippori Mincho B1",serif';
    ctx.fillText(label, lx, ly);
  }
  ctx.restore();
}

function drawTokenBadges(ctx, board) {
  const human = G.match?.humanSide ?? 0;
  const tokens = G.match?.tokens?.[human] || 0;
  if (!tokens) return;
  ctx.save();
  for (const node of board.nodes) {
    if (!node.tokens || (tokens & node.tokens) === 0) continue;
    const c = nodeCenter(node);
    const x = c.x + node.w * BOARD_SCALE_X - 12;
    const y = c.y - node.h * BOARD_SCALE_Y / 2 + 11;
    ctx.fillStyle = 'rgba(178,58,43,0.95)';
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(250,231,190,0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#f8e9c4';
    font(ctx, 8, '700', true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.tokenLabel?.slice(0, 1) || '備', x, y);
  }
  ctx.restore();
}

function drawHover(ctx, board) {
  if (G.hoverNode < 0) return;
  const node = board.nodes[G.hoverNode];
  if (!node) return;
  ctx.save();
  const _c = nodeCenter(node); ctx.translate(_c.x, _c.y);
  ctx.rotate(node.tilt || 0);
  ctx.strokeStyle = 'rgba(226,187,99,0.9)';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(226,187,99,0.75)';
  ctx.shadowBlur = 12;
  roundRect(ctx, -node.w / 2, -node.h / 2, node.w, node.h, 4);
  ctx.stroke();
  ctx.restore();
}

function drawEffects(ctx) {
  for (const fx of G.effects) {
    const p = Math.max(0, Math.min(1, fx.t / fx.life));
    ctx.save();
    // Gold cloud halo, local to the landing square only.
    const r = 20 + p * 54;
    const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, r);
    g.addColorStop(0, `rgba(233,196,99,${0.34 * (1 - p)})`);
    g.addColorStop(0.55, `rgba(233,196,99,${0.13 * (1 - p)})`);
    g.addColorStop(1, 'rgba(233,196,99,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, r, 0, TAU);
    ctx.fill();
    for (const pt of fx.particles) {
      const px = pt.x + pt.vx * fx.t;
      const py = pt.y + pt.vy * fx.t + 32 * fx.t * fx.t;
      const alpha = Math.max(0, 1 - fx.t / pt.life) * (1 - p * 0.3);
      if (pt.kind === 'sakura') {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(fx.t * 4 + pt.size);
        ctx.fillStyle = `rgba(238,177,185,${alpha * 0.9})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, pt.size * 1.3, pt.size * 0.65, 0.6, 0, TAU);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = `rgba(239,211,132,${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, pt.size * (0.6 + p * 0.4), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function drawStatusToast(ctx) {
  if (G.toast) {
    const p = Math.min(1, G.toast.life / 0.35);
    ctx.save();
    ctx.globalAlpha = p;
    const w = 420;
    const x = (W - w) / 2;
    const y = H - 58;
    ctx.fillStyle = 'rgba(24,18,14,0.9)';
    roundRect(ctx, x, y, w, 38, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(211,178,106,0.55)';
    ctx.stroke();
    ctx.fillStyle = '#f1e0b6';
    font(ctx, 12, '700', true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(G.toast.text, W / 2, y + 15);
    if (G.toast.sub) {
      ctx.fillStyle = 'rgba(225,203,158,0.72)';
      font(ctx, 7, '500');
      ctx.fillText(G.toast.sub, W / 2, y + 29);
    }
    ctx.restore();
  }
  if (G.stamp) {
    const p = Math.min(1, G.stamp.life / 0.4);
    ctx.save();
    ctx.globalAlpha = p;
    ctx.translate(W / 2, 110);
    ctx.rotate(-0.08);
    ctx.fillStyle = 'rgba(146,40,33,0.84)';
    roundRect(ctx, -74, -23, 148, 46, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(246,224,180,0.65)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-69, -18, 138, 36);
    ctx.fillStyle = '#f8e8c1';
    font(ctx, 18, '700', true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(G.stamp.text, 0, G.stamp.sub ? -4 : 0);
    if (G.stamp.sub) {
      font(ctx, 6.5, '500');
      ctx.fillText(G.stamp.sub, 0, 14);
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function invalidateScene() {
  sceneCache = null;
  sceneCacheBoard = -1;
}

let sceneCacheNodeCount = -1;

export function drawPlaying(ctx, time) {
  const board = currentBoard();
  if (sceneCacheBoard !== G.boardIdx || sceneCacheNodeCount !== board.nodes.length || !sceneCache) {
    sceneCache = buildSceneCache(G.boardIdx);
    sceneCacheBoard = G.boardIdx;
    sceneCacheNodeCount = board.nodes.length;
  }
  const cam = G.camera;
  const pCount = Math.max(2, Math.min(4, G.match?.playerCount || G.playerCount || 2));
  const human = G.match?.humanSide ?? 0;
  const order = [];
  for (let s = 0; s < pCount; s++) {
    if (s !== human) order.push(s);
  }
  order.push(human);
  // V2: camera zoom & follow over the board layer only.  The HUD and dice
  // tray are drawn afterwards in screen-fixed coordinates.
  if (cam && (G.phase === 'MOVE' || G.phase === 'ANIM')) {
    ctx.save();
    ctx.translate(cam.focus.x, cam.focus.y);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.focus.x, -cam.focus.y);
    ctx.drawImage(sceneCache, 0, 0);
    drawPreviewArcs(ctx, board);
    drawTokenBadges(ctx, board);
    for (const side of order) {
      const p = animPawn(side, time);
      drawPawn(ctx, side, p.x, p.y, time);
    }
    drawHover(ctx, board);
    drawEffects(ctx);
    ctx.restore();
  } else {
    ctx.drawImage(sceneCache, 0, 0);
    drawRightPanelSkin(ctx, board, false);
    drawPreviewArcs(ctx, board);
    drawTokenBadges(ctx, board);
    for (const side of order) {
      const p = animPawn(side, time);
      drawPawn(ctx, side, p.x, p.y, time);
    }
    drawHover(ctx, board);
    drawEffects(ctx);
  }
  drawStatusToast(ctx);
  if (G.phase === 'ANIM' || (G.tube.shake || 0) > 0.01) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#e4c477';
    ctx.beginPath();
    ctx.arc(TUBE_CENTER.x, TUBE_CENTER.y, 54 + Math.sin(time * 18) * 3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  if (G.match?.winner >= 0) {
    drawSettlement(ctx, board);
  }
}

function drawSettlement(ctx, board) {
  // Board renderer owns the dimmed tableau; UI screens owns the buttons.
  ctx.save();
  ctx.fillStyle = 'rgba(16,12,10,0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

export function getDiceDeviceRect() {
  return { ...TUBE_RECT };
}

export function drawMiniBoardPreview(ctx, boardIndex, x, y, w, h) {
  const board = BOARDS[boardIndex];
  const sx = w / 800;
  const sy = h / 640;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  if (board.id === 'tokaido') {
    washiPaper(ctx, 0, 0, 800, 640, '#e0c996', { seed: 'mini-tokaido' });
    drawPattern(ctx, 'seigaiha', 0, 0, 800, 640, '#315e78', 0.12, 24);
  } else if (board.id === 'yokai') {
    bokashi(ctx, 0, 0, 800, 640, '#1e2a30', '#8f7a5d');
    drawPattern(ctx, 'sayagata', 0, 0, 800, 640, '#e0cfaa', 0.06, 25);
  } else if (board.id === 'kesshu') {
    washiPaper(ctx, 0, 0, 800, 640, '#d8bf90', { seed: 'mini-kesshu' });
    drawPattern(ctx, 'kikko', 0, 0, 800, 640, '#7a2b22', 0.12, 22);
  } else {
    washiPaper(ctx, 0, 0, 800, 640, '#e3cfaa', { seed: 'mini-genji' });
    ctx.fillStyle = 'rgba(212,176,83,0.28)';
    ctx.fillRect(205, 155, 465, 122);
    ctx.fillStyle = 'rgba(59,35,66,0.25)';
    ctx.fillRect(205, 395, 465, 120);
  }
  for (const node of board.nodes) {
    if (board.id === 'tokaido') {
      ctx.fillStyle = node.kind === 'goal' ? '#c9a24a' : node.kind === 'stay' ? '#b23a2b' : '#efe1bd';
      arrowStripPath(ctx, node.x, node.y, node.w, node.h);
      ctx.fill();
      ctx.strokeStyle = 'rgba(56,36,18,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (board.id === 'yokai') {
      ctx.fillStyle = node.kind === 'goal' ? '#9b6b4f' : '#e0cfae';
      roundRect(ctx, node.x, node.y, node.w, node.h, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(37,26,17,0.65)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(142,45,35,0.85)';
      ctx.fillRect(node.x + node.w - 32, node.y + 4, 28, node.h - 8);
    } else if (board.id === 'kesshu') {
      ctx.save();
      ctx.translate(node.x + node.w / 2, node.y + node.h / 2);
      ctx.rotate(node.tilt || 0);
      ctx.fillStyle = node.kind === 'goal' ? '#b23a2b' : node.kind === 'start' ? '#6d2a22' : '#e6d2a9';
      roundRect(ctx, -node.w / 2, -node.h / 2, node.w, node.h, 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(112,40,30,0.7)';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.restore();
    } else if (node.id < 16) {
      ctx.fillStyle = node.stripColor;
      ctx.fillRect(node.x, node.y, node.w, node.h);
      ctx.strokeStyle = 'rgba(48,31,18,0.55)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(node.x, node.y, node.w, node.h);
    } else {
      ctx.fillStyle = node.kind === 'goal' ? '#b48b31' : node.kind === 'good' ? '#d9bb6a' : '#4a2b53';
      roundRect(ctx, node.x, node.y, node.w, node.h, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(48,31,18,0.55)';
      ctx.stroke();
    }
  }
  // Central goal accent.
  if (board.id === 'tokaido') drawSeal(ctx, 400, 330, 38, '京', '#b23a2b', 34);
  if (board.id === 'yokai') drawSeal(ctx, 400, 335, 34, '怪', '#b23a2b', 30);
  if (board.id === 'kesshu') drawSeal(ctx, 126, 92, 34, '上', '#b23a2b', 30);
  if (board.id === 'genji') drawSeal(ctx, 400, 339, 30, '上', '#b23a2b', 26);
  ctx.restore();
}
