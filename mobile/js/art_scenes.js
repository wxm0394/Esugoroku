// Scene compositions for the four volumes and the 36-print gallery.
import {
  PALETTE, washiPaper, bokashi, drawPattern, drawCloud, drawFuji, drawPine,
  drawWaveBand, drawRoof, drawTorii, drawLantern, drawKomae, drawSeal,
  drawCrane, goldFleck, bambooGrain, roundRect, rng, hashString,
} from './art_core.js';
import {
  drawTraveler, drawBeauty, drawWarrior, drawYokai, drawGenjiLady, drawCranePair,
} from './art_figures.js';

const TAU = Math.PI * 2;

function sky(ctx, x, y, w, h, top, bottom) {
  bokashi(ctx, x, y, w, h * 0.62, top, bottom);
  ctx.fillStyle = 'rgba(255,250,228,0.2)';
  ctx.fillRect(x, y + h * 0.6, w, h * 0.4);
}

function sealCorner(ctx, x, y, text = '摺') {
  drawSeal(ctx, x, y, 7, text, PALETTE.vermilion, 6.5, true);
}

function distantHills(ctx, x, y, w, h, color = '#72877a') {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.bezierCurveTo(x + w * 0.16, y + h * 0.5, x + w * 0.29, y + h * 0.4, x + w * 0.4, y + h * 0.7);
  ctx.bezierCurveTo(x + w * 0.52, y + h * 0.3, x + w * 0.67, y + h * 0.34, x + w * 0.74, y + h * 0.64);
  ctx.bezierCurveTo(x + w * 0.88, y + h * 0.26, x + w * 0.95, y + h * 0.56, x + w, y + h * 0.48);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

function inn(ctx, x, y, w, h, color = '#70523b') {
  ctx.fillStyle = '#d9c49a';
  ctx.fillRect(x + w * 0.12, y + h * 0.42, w * 0.76, h * 0.55);
  drawRoof(ctx, x, y + h * 0.18, w, h * 0.36, color);
  ctx.fillStyle = '#4b3c2e';
  ctx.fillRect(x + w * 0.23, y + h * 0.52, w * 0.18, h * 0.45);
  ctx.fillRect(x + w * 0.6, y + h * 0.52, w * 0.18, h * 0.45);
  ctx.fillStyle = 'rgba(240,224,188,0.75)';
  for (const nx of [0.26, 0.63]) ctx.fillRect(x + w * nx, y + h * 0.56, w * 0.12, h * 0.17);
  drawLantern(ctx, x + w * 0.14, y + h * 0.52, w * 0.09, h * 0.16, true);
}

function bridge(ctx, x, y, w, h) {
  ctx.strokeStyle = '#715035';
  ctx.lineWidth = Math.max(1.5, w * 0.018);
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.25);
  ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.15, x + w, y + h * 0.25);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, w * 0.008);
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const px = x + w * t;
    const py = y + h * 0.25 - Math.sin(t * Math.PI) * h * 0.35;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + h * 0.27);
    ctx.stroke();
  }
  ctx.strokeStyle = '#435d63';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.48);
  ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.08, x + w, y + h * 0.48);
  ctx.stroke();
}

function foodStillLife(ctx, x, y, w, h, kind) {
  const cx = x + w * 0.5;
  const baseY = y + h * 0.72;
  ctx.fillStyle = 'rgba(101,64,33,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY + h * 0.04, w * 0.32, h * 0.04, 0, 0, TAU);
  ctx.fill();
  if (kind === 'dojo') {
    ctx.fillStyle = '#5b3e2d';
    ctx.beginPath();
    ctx.ellipse(cx, baseY, w * 0.26, h * 0.1, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#8d5c36';
    ctx.beginPath();
    ctx.ellipse(cx, baseY - h * 0.05, w * 0.26, h * 0.09, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#3f2a1d';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#725035';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(cx + i * w * 0.07, baseY - h * 0.07, w * 0.035, h * 0.013, -0.1, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,20,14,0.6)';
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(245,238,219,0.55)';
    for (let i = 0; i < 4; i++) {
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx + (i - 1.5) * 11, baseY - h * 0.16);
      ctx.bezierCurveTo(cx + (i - 1.5) * 14 - 7, baseY - h * 0.3, cx + (i - 1.5) * 14 + 8, baseY - h * 0.38, cx + (i - 1.5) * 10, baseY - h * 0.5);
      ctx.stroke();
    }
  } else if (kind === 'inari') {
    ctx.fillStyle = '#f2e7c9';
    ctx.beginPath();
    ctx.ellipse(cx, baseY, w * 0.29, h * 0.07, 0, 0, TAU);
    ctx.fill();
    for (let i = -2; i <= 2; i++) {
      ctx.fillStyle = '#c17636';
      ctx.beginPath();
      ctx.ellipse(cx + i * w * 0.08, baseY - h * 0.06, w * 0.04, h * 0.022, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#f0e5c6';
      ctx.beginPath();
      ctx.ellipse(cx + i * w * 0.08, baseY - h * 0.085, w * 0.039, h * 0.018, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#5d4227';
      ctx.beginPath();
      ctx.moveTo(cx + i * w * 0.08 - 5, baseY - h * 0.098);
      ctx.lineTo(cx + i * w * 0.08 + 4, baseY - h * 0.1);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#d7c69e';
    ctx.beginPath();
    ctx.ellipse(cx, baseY, w * 0.22, h * 0.075, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#3d5f58';
    ctx.beginPath();
    ctx.ellipse(cx, baseY - h * 0.06, w * 0.15, h * 0.06, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(225,239,222,0.55)';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(240,235,217,0.65)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 6, baseY - h * 0.14 - i * 3);
      ctx.bezierCurveTo(cx - 20, baseY - h * 0.26 - i * 2, cx + 18, baseY - h * 0.34, cx + 4, baseY - h * 0.45);
      ctx.stroke();
    }
  }
}

export function drawTokaidoScene(ctx, art, x, y, w, h, variant = 0) {
  washiPaper(ctx, x, y, w, h, '#ead7a7', { seed: `tokaido-${art}` });
  if (art === 'dojo' || art === 'inari' || art === 'tea') {
    bokashi(ctx, x, y, w, h, '#c4b68c', '#ede0bd');
    drawPattern(ctx, 'seigaiha', x, y + h * 0.62, w, h * 0.38, PALETTE.indigo, 0.15, 15);
    foodStillLife(ctx, x, y, w, h, art);
    drawSeal(ctx, x + w * 0.84, y + h * 0.18, Math.min(w, h) * 0.055, art === 'tea' ? '茶' : '味', PALETTE.vermilion, Math.min(w, h) * 0.045);
    return;
  }
  sky(ctx, x, y, w, h, '#7d9aa8', '#decda4');
  if (art === 'kyoto') {
    drawPattern(ctx, 'sayagata', x, y, w, h, PALETTE.gold, 0.14, 22);
    distantHills(ctx, x, y + h * 0.34, w, h * 0.26, '#8e8261');
    // Three-tier pagoda, drawn with real eaves and wall bays.
    const px = x + w * 0.26;
    const baseY = y + h * 0.72;
    ctx.fillStyle = '#7c2b25';
    for (let tier = 0; tier < 3; tier++) {
      const tw = w * (0.28 - tier * 0.055);
      const th = h * (0.17 - tier * 0.025);
      const ty = baseY - th * (tier + 1) - tier * h * 0.015;
      ctx.fillStyle = '#d5bf8d';
      ctx.fillRect(px - tw * 0.36, ty + h * 0.045, tw * 0.72, th * 0.95);
      ctx.fillStyle = '#7d2d27';
      for (let bay = -1; bay <= 1; bay++) {
        ctx.fillRect(px + bay * tw * 0.24 - w * 0.008, ty + h * 0.075, w * 0.016, th * 0.58);
      }
      drawRoof(ctx, px - tw * 0.5, ty - h * 0.01, tw, h * 0.12, '#3f3330');
      ctx.fillStyle = '#b68a2e';
      ctx.fillRect(px - 1, ty - h * 0.04, 2, h * 0.035);
    }
    // Golden pavilion wall and bridge.
    ctx.fillStyle = 'rgba(214,183,109,0.9)';
    ctx.fillRect(x + w * 0.52, y + h * 0.5, w * 0.34, h * 0.17);
    drawRoof(ctx, x + w * 0.49, y + h * 0.4, w * 0.4, h * 0.15, '#4a3330');
    ctx.fillStyle = 'rgba(80,120,137,0.58)';
    ctx.fillRect(x, y + h * 0.73, w, h * 0.27);
    drawPattern(ctx, 'seigaiha', x, y + h * 0.73, w, h * 0.27, '#f0e6ca', 0.25, 13);
    drawTorii(ctx, x + w * 0.82, y + h * 0.74, w * 0.22, h * 0.34, '#9e3329');
    bridge(ctx, x + w * 0.04, y + h * 0.64, w * 0.33, h * 0.22);
    drawBeauty(ctx, x + w * 0.46, y + h * 0.96, h * 0.57, { robe: '#9c3a3a', light: '#ce7760', obi: '#d2aa4d', fan: true });
    // Cherry branch over the roof.
    ctx.strokeStyle = '#58402b';
    ctx.lineWidth = Math.max(1, w * 0.006);
    ctx.beginPath();
    ctx.moveTo(x - 2, y + h * 0.08);
    ctx.bezierCurveTo(x + w * 0.2, y + h * 0.01, x + w * 0.34, y + h * 0.16, x + w * 0.47, y + h * 0.1);
    ctx.stroke();
    for (let i = 0; i < 13; i++) {
      ctx.fillStyle = i % 3 ? 'rgba(238,177,185,0.9)' : 'rgba(248,225,220,0.9)';
      ctx.beginPath();
      ctx.ellipse(x + w * (0.03 + (i * 0.037) % 0.42), y + h * (0.03 + (i % 4) * 0.036), 2.3, 1.4, i, 0, TAU);
      ctx.fill();
    }
    drawSeal(ctx, x + w * 0.89, y + h * 0.18, 8, '京', PALETTE.vermilion, 7);
    return;
  }
  if (art === 'nihonbashi') {
    distantHills(ctx, x, y + h * 0.34, w, h * 0.22, '#9a9480');
    drawFuji(ctx, x + w * 0.68, y + h * 0.52, w * 0.27, h * 0.3);
    bridge(ctx, x - w * 0.05, y + h * 0.55, w * 1.1, h * 0.35);
    ctx.fillStyle = 'rgba(66,87,94,0.45)';
    ctx.fillRect(x, y + h * 0.74, w, h * 0.26);
    drawPattern(ctx, 'seigaiha', x, y + h * 0.74, w, h * 0.26, '#f3ead2', 0.35, 13);
    inn(ctx, x + w * 0.03, y + h * 0.36, w * 0.27, h * 0.28, '#4d4740');
    drawTraveler(ctx, x + w * 0.24, y + h * 0.83, h * 0.34, { blue: '#3e5663', bundle: false });
    drawTraveler(ctx, x + w * 0.35, y + h * 0.86, h * 0.3, { blue: '#786b47', staff: false });
    drawSeal(ctx, x + w * 0.88, y + h * 0.16, 8, '一', PALETTE.vermilion, 7);
    return;
  }
  if (art === 'shinagawa') {
    ctx.fillStyle = '#537a92';
    ctx.fillRect(x, y + h * 0.42, w, h * 0.58);
    drawWaveBand(ctx, x, y + h * 0.42, w, h * 0.3, '#315e78');
    drawFuji(ctx, x + w * 0.76, y + h * 0.42, w * 0.22, h * 0.26);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#e8dfc7';
      ctx.beginPath();
      ctx.moveTo(x + w * (0.18 + i * 0.22), y + h * 0.51);
      ctx.lineTo(x + w * (0.21 + i * 0.22), y + h * 0.41);
      ctx.lineTo(x + w * (0.28 + i * 0.22), y + h * 0.51);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,50,38,0.6)';
      ctx.stroke();
    }
    inn(ctx, x + w * 0.05, y + h * 0.28, w * 0.32, h * 0.3, '#373f43');
    drawLantern(ctx, x + w * 0.17, y + h * 0.41, 12, 20, true);
    drawSeal(ctx, x + w * 0.88, y + h * 0.16, 8, '月', PALETTE.vermilion, 7);
    return;
  }
  if (art === 'tsurumi') {
    ctx.fillStyle = '#7496a6';
    ctx.fillRect(x, y + h * 0.45, w, h * 0.55);
    drawPattern(ctx, 'seigaiha', x, y + h * 0.45, w, h * 0.55, '#f3ead2', 0.3, 12);
    drawTorii(ctx, x + w * 0.68, y + h * 0.65, w * 0.25, h * 0.42);
    drawPine(ctx, x + w * 0.17, y + h * 0.88, h * 0.62, w * 0.2);
    drawPine(ctx, x + w * 0.88, y + h * 0.92, h * 0.5, -w * 0.12);
    drawSeal(ctx, x + w * 0.86, y + h * 0.17, 8, '弁', PALETTE.vermilion, 7);
    return;
  }
  if (art === 'kanagawa') {
    ctx.fillStyle = '#668a9b';
    ctx.fillRect(x, y + h * 0.44, w, h * 0.56);
    drawWaveBand(ctx, x, y + h * 0.46, w, h * 0.24, '#315e78');
    drawFuji(ctx, x + w * 0.6, y + h * 0.47, w * 0.3, h * 0.36);
    inn(ctx, x + w * 0.02, y + h * 0.38, w * 0.28, h * 0.27, '#3f4744');
    drawTraveler(ctx, x + w * 0.34, y + h * 0.91, h * 0.4, { blue: '#4d5e5c', bundle: false });
    drawSeal(ctx, x + w * 0.86, y + h * 0.16, 8, '景', PALETTE.vermilion, 7);
    return;
  }
  if (art === 'hodogaya') {
    distantHills(ctx, x, y + h * 0.32, w, h * 0.25, '#7d8570');
    for (let i = 0; i < 4; i++) {
      drawPine(ctx, x + w * (0.1 + i * 0.26), y + h * 0.9, h * (0.5 + (i % 2) * 0.12), w * 0.06);
    }
    ctx.fillStyle = '#d6c49c';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.08, y + h);
    ctx.quadraticCurveTo(x + w * 0.4, y + h * 0.6, x + w * 0.72, y + h * 0.98);
    ctx.lineTo(x + w * 0.72, y + h);
    ctx.closePath();
    ctx.fill();
    inn(ctx, x + w * 0.62, y + h * 0.43, w * 0.34, h * 0.3, '#504131');
    drawTraveler(ctx, x + w * 0.39, y + h * 0.94, h * 0.32, { blue: '#445b64', bundle: false });
    drawSeal(ctx, x + w * 0.88, y + h * 0.16, 8, '梅', PALETTE.vermilion, 7);
    return;
  }
  if (art === 'totsuka') {
    distantHills(ctx, x, y + h * 0.36, w, h * 0.25, '#76816e');
    ctx.strokeStyle = 'rgba(180,208,220,0.7)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 30; i++) {
      const rx = x + ((i * 37) % w);
      const ry = y + ((i * 53) % (h * 0.7));
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 4, ry + 10);
      ctx.stroke();
    }
    inn(ctx, x + w * 0.08, y + h * 0.42, w * 0.36, h * 0.3, '#3e4240');
    drawTraveler(ctx, x + w * 0.58, y + h * 0.93, h * 0.42, { blue: '#4a5d63', hat: '#8b7651', bundle: false });
    drawSeal(ctx, x + w * 0.87, y + h * 0.17, 8, '雨', PALETTE.vermilion, 7);
    return;
  }
  if (art === 'fujisawa') {
    distantHills(ctx, x, y + h * 0.34, w, h * 0.25, '#7b896f');
    innerTemple(ctx, x + w * 0.2, y + h * 0.25, w * 0.6, h * 0.55);
    drawPine(ctx, x + w * 0.07, y + h * 0.96, h * 0.68, w * 0.16);
    drawPine(ctx, x + w * 0.93, y + h * 0.94, h * 0.6, -w * 0.18);
    drawTraveler(ctx, x + w * 0.47, y + h * 0.9, h * 0.27, { blue: '#56604d', staff: false });
    drawSeal(ctx, x + w * 0.87, y + h * 0.16, 8, '鐘', PALETTE.vermilion, 7);
    return;
  }
  if (art === 'hakone') {
    drawFuji(ctx, x + w * 0.64, y + h * 0.5, w * 0.35, h * 0.34);
    ctx.fillStyle = '#507584';
    ctx.fillRect(x, y + h * 0.55, w, h * 0.45);
    drawPattern(ctx, 'seigaiha', x, y + h * 0.55, w, h * 0.45, '#eef0df', 0.26, 13);
    distantHills(ctx, x, y + h * 0.36, w, h * 0.22, '#66756b');
    drawTorii(ctx, x + w * 0.22, y + h * 0.58, w * 0.17, h * 0.3);
    drawPine(ctx, x + w * 0.06, y + h * 0.96, h * 0.68, w * 0.12);
    drawSeal(ctx, x + w * 0.87, y + h * 0.16, 8, '箱', PALETTE.vermilion, 7);
    return;
  }
  // Mishima and generic Tokaido scenery.
  distantHills(ctx, x, y + h * 0.34, w, h * 0.27, '#788779');
  drawTorii(ctx, x + w * 0.63, y + h * 0.7, w * 0.28, h * 0.48);
  drawPine(ctx, x + w * 0.12, y + h * 0.92, h * 0.66, w * 0.1);
  ctx.fillStyle = '#d8c8a2';
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.7, x + w, y + h * 0.92);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
  drawTraveler(ctx, x + w * 0.46, y + h * 0.92, h * 0.33, { blue: '#455967', bundle: false });
  drawSeal(ctx, x + w * 0.87, y + h * 0.16, 8, '宿', PALETTE.vermilion, 7);
}

function innerTemple(ctx, x, y, w, h) {
  ctx.fillStyle = '#d5c293';
  ctx.fillRect(x, y + h * 0.3, w, h * 0.58);
  drawRoof(ctx, x - w * 0.05, y, w * 1.1, h * 0.5, '#3f3c36');
  ctx.fillStyle = '#5d4431';
  ctx.fillRect(x + w * 0.12, y + h * 0.38, w * 0.09, h * 0.5);
  ctx.fillRect(x + w * 0.79, y + h * 0.38, w * 0.09, h * 0.5);
  ctx.fillStyle = '#bc8b3d';
  ctx.beginPath();
  ctx.arc(x + w * 0.5, y + h * 0.55, w * 0.09, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#5c4a31';
  ctx.beginPath();
  ctx.arc(x + w * 0.5, y + h * 0.55, w * 0.07, 0, TAU);
  ctx.fill();
}

export function drawYokaiScene(ctx, art, x, y, w, h, variant = 0) {
  washiPaper(ctx, x, y, w, h, '#d8c7a1', { seed: `yokai-${art}` });
  bokashi(ctx, x, y, w, h, '#283c43', '#b3a180');
  // Moon and bone-white clouds.
  ctx.fillStyle = 'rgba(238,226,192,0.72)';
  ctx.beginPath();
  ctx.arc(x + w * 0.72, y + h * 0.24, Math.min(w, h) * 0.13, 0, TAU);
  ctx.fill();
  drawCloud(ctx, x - w * 0.05, y + h * 0.12, w * 0.5, h * 0.17, 'rgba(35,52,57,0.5)', 0.55);
  drawCloud(ctx, x + w * 0.42, y + h * 0.34, w * 0.62, h * 0.15, 'rgba(249,240,218,0.28)', 0.5);
  drawPattern(ctx, 'sayagata', x, y + h * 0.62, w, h * 0.38, '#f0e2bd', 0.09, 18);
  const kind = art === 'yokai' ? 'kappa' : art;
  drawYokai(ctx, kind, x + w * 0.45, y + h * 0.97, h * 0.82, {});
  // Floating ghost fire and grass.
  for (let i = 0; i < 4; i++) {
    const gx = x + w * (0.13 + i * 0.25);
    const gy = y + h * (0.38 + (i % 2) * 0.12);
    const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, 8 + (i % 2) * 5);
    glow.addColorStop(0, 'rgba(112,190,177,0.7)');
    glow.addColorStop(1, 'rgba(112,190,177,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(gx - 20, gy - 20, 40, 40);
    ctx.fillStyle = 'rgba(182,226,207,0.85)';
    ctx.beginPath();
    ctx.arc(gx, gy, 2 + (i % 2), 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(50,64,43,0.7)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const gx = x + (i / 9) * w + (i % 3);
    ctx.beginPath();
    ctx.moveTo(gx, y + h);
    ctx.quadraticCurveTo(gx + 5, y + h * 0.9, gx + 13, y + h * 0.84);
    ctx.stroke();
  }
  drawSeal(ctx, x + w * 0.88, y + h * 0.16, Math.min(w, h) * 0.05, '怪', PALETTE.vermilion, Math.min(w, h) * 0.04);
}

function warriorPalette(art) {
  const map = {
    masashige: { red: '#6b2d22', gold: '#c9a14a', banner: '#e5dcc4', bannerColor: '#e5dcc4', weapon: 'naginata' },
    yukimura: { red: '#a3352b', gold: '#d5b15c', banner: '#9c2a23', bannerColor: '#9c2a23', weapon: 'naginata' },
    benkei: { red: '#4d3b2c', gold: '#b78d48', banner: '#6d5d44', weapon: 'naginata' },
    tomoe: { red: '#77435d', gold: '#d1ab53', light: '#a86a7f', banner: '#e6d9be', weapon: 'bow' },
    yoshitsune: { red: '#3d5b74', gold: '#d1ab53', banner: '#e9e4d2', weapon: 'bow' },
  };
  return map[art] || map.masashige;
}

function warSun(ctx, x, y, w, h) {
  const g = ctx.createRadialGradient(x + w * 0.5, y + h * 0.38, 2, x + w * 0.5, y + h * 0.38, w * 0.45);
  g.addColorStop(0, 'rgba(207,139,69,0.35)');
  g.addColorStop(1, 'rgba(207,139,69,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(182,138,46,0.23)';
  ctx.beginPath();
  ctx.arc(x + w * 0.5, y + h * 0.37, Math.min(w, h) * 0.2, 0, TAU);
  ctx.fill();
  drawPattern(ctx, 'kikko', x, y, w, h, '#33251a', 0.08, 23);
}

function armorStillLife(ctx, art, x, y, w, h) {
  if (art === 'oyoroi') {
    const cx = x + w * 0.5;
    ctx.fillStyle = '#5b1e19';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.23, y + h * 0.72);
    ctx.lineTo(cx - w * 0.18, y + h * 0.3);
    ctx.lineTo(cx + w * 0.18, y + h * 0.3);
    ctx.lineTo(cx + w * 0.23, y + h * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#c9a14a';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = i % 2 ? '#c9a14a' : 'rgba(233,211,165,0.5)';
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.2, y + h * (0.36 + i * 0.07));
      ctx.quadraticCurveTo(cx, y + h * (0.4 + i * 0.07), cx + w * 0.2, y + h * (0.36 + i * 0.07));
      ctx.stroke();
    }
    ctx.fillStyle = '#25292b';
    ctx.beginPath();
    ctx.ellipse(cx, y + h * 0.26, w * 0.12, h * 0.1, 0, Math.PI, TAU);
    ctx.fill();
    ctx.strokeStyle = '#c9a14a';
    ctx.stroke();
    ctx.strokeStyle = '#c9a14a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, y + h * 0.17, w * 0.07, Math.PI * 0.08, Math.PI * 0.92, true);
    ctx.stroke();
    return;
  }
  if (art === 'tachi') {
    ctx.save();
    ctx.translate(x + w * 0.5, y + h * 0.47);
    ctx.rotate(-0.48);
    ctx.fillStyle = '#cfd6d2';
    ctx.fillRect(-w * 0.43, -3, w * 0.8, 6);
    ctx.fillStyle = '#8f9c9b';
    ctx.fillRect(-w * 0.43, 1, w * 0.8, 2);
    ctx.fillStyle = '#b68a2e';
    ctx.fillRect(-w * 0.48, -5, w * 0.07, 10);
    ctx.fillStyle = '#27343a';
    ctx.fillRect(w * 0.35, -4, w * 0.15, 8);
    ctx.strokeStyle = 'rgba(247,240,223,0.65)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.38 + i * w * 0.09, -1);
      ctx.lineTo(-w * 0.34 + i * w * 0.09, 1);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (art === 'yumi') {
    ctx.strokeStyle = '#3b2a1d';
    ctx.lineWidth = Math.max(2, w * 0.018);
    ctx.beginPath();
    ctx.arc(x + w * 0.5, y + h * 0.53, w * 0.33, -1.2, 1.2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(243,236,214,0.8)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5 + Math.cos(-1.2) * w * 0.33, y + h * 0.53 + Math.sin(-1.2) * w * 0.33);
    ctx.lineTo(x + w * 0.5 + Math.cos(1.2) * w * 0.33, y + h * 0.53 + Math.sin(1.2) * w * 0.33);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = '#4c3b2a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + w * (0.26 + i * 0.06), y + h * 0.52);
      ctx.lineTo(x + w * (0.2 + i * 0.06), y + h * 0.12);
      ctx.stroke();
    }
    return;
  }
  // Gunbai fan.
  const cx = x + w * 0.5;
  ctx.fillStyle = '#3b2a25';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.22, y + h * 0.55);
  ctx.quadraticCurveTo(cx, y + h * 0.12, cx + w * 0.22, y + h * 0.55);
  ctx.lineTo(cx + w * 0.09, y + h * 0.68);
  ctx.lineTo(cx - w * 0.09, y + h * 0.68);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#c9a14a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#c9a14a';
  ctx.beginPath();
  ctx.arc(cx, y + h * 0.42, w * 0.045, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#b23a2b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, y + h * 0.68);
  ctx.lineTo(cx, y + h * 0.92);
  ctx.stroke();
}

export function drawWarriorScene(ctx, art, x, y, w, h, variant = 0) {
  washiPaper(ctx, x, y, w, h, '#e1cca2', { seed: `warrior-${art}` });
  if (['oyoroi', 'tachi', 'yumi', 'gunbai'].includes(art)) {
    bokashi(ctx, x, y, w, h, '#b9a172', '#ead9b2');
    goldFleck(ctx, x, y, w, h, art, 34);
    armorStillLife(ctx, art, x, y + h * 0.02, w, h * 0.9);
    drawSeal(ctx, x + w * 0.86, y + h * 0.17, Math.min(w, h) * 0.055, '武', PALETTE.vermilion, Math.min(w, h) * 0.045);
    return;
  }
  warSun(ctx, x, y, w, h);
  drawCloud(ctx, x - w * 0.08, y + h * 0.12, w * 0.5, h * 0.16, 'rgba(244,234,210,0.5)', 0.6);
  drawCloud(ctx, x + w * 0.5, y + h * 0.3, w * 0.6, h * 0.15, 'rgba(55,46,38,0.2)', 0.5);
  const p = warriorPalette(art);
  drawWarrior(ctx, x + w * 0.47, y + h * 0.97, h * 0.8, p);
  if (art === 'yukimura') {
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = 'rgba(188,55,40,0.55)';
      ctx.beginPath();
      ctx.arc(x + w * (0.08 + i * 0.11), y + h * (0.18 + (i % 2) * 0.1), 2.2, 0, TAU);
      ctx.fill();
    }
  }
  if (art === 'tomoe') {
    drawPine(ctx, x + w * 0.88, y + h * 0.9, h * 0.62, -w * 0.12);
  }
  drawSeal(ctx, x + w * 0.86, y + h * 0.16, Math.min(w, h) * 0.055, art === 'tomoe' ? '巴' : '勇', PALETTE.vermilion, Math.min(w, h) * 0.045);
}

function genjiScreen(ctx, x, y, w, h, evil = false) {
  bokashi(ctx, x, y, w, h, evil ? '#2b1b2c' : '#d6b65a', evil ? '#5a3445' : '#e9d7a2');
  goldFleck(ctx, x, y, w, h, evil ? 9 : 4, 55);
  drawPattern(ctx, evil ? 'sayagata' : 'kikko', x, y, w, h, evil ? '#120e16' : '#8c682b', evil ? 0.2 : 0.12, 22);
  // Golden clouds / folding screen panels.
  drawCloud(ctx, x - w * 0.1, y + h * 0.1, w * 0.45, h * 0.22, evil ? 'rgba(100,56,73,0.7)' : 'rgba(244,226,167,0.65)', 0.65);
  drawCloud(ctx, x + w * 0.58, y + h * 0.26, w * 0.5, h * 0.2, evil ? 'rgba(76,42,58,0.65)' : 'rgba(250,236,181,0.5)', 0.55);
  ctx.strokeStyle = evil ? 'rgba(197,154,76,0.36)' : 'rgba(95,63,25,0.32)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(x + (w / 4) * i, y);
    ctx.lineTo(x + (w / 4) * i, y + h * 0.7);
    ctx.stroke();
  }
}

function tatami(ctx, x, y, w, h) {
  ctx.fillStyle = '#a99f6d';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(54,59,36,0.4)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(x, y + (h / 5) * i);
    ctx.lineTo(x + w, y + (h / 5) * i);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(225,214,161,0.35)';
  for (let i = 0; i < 20; i++) {
    ctx.beginPath();
    ctx.moveTo(x + (i * 13) % w, y);
    ctx.lineTo(x + (i * 13) % w, y + h);
    ctx.stroke();
  }
}

export function drawGenjiScene(ctx, art, x, y, w, h, variant = 0) {
  washiPaper(ctx, x, y, w, h, '#e3d3ae', { seed: `genji-${art}` });
  const evil = ['asagao', 'otome', 'tamakazura'].includes(art);
  genjiScreen(ctx, x, y, w, h, evil);
  if (art === 'genji') {
    // Central gold curtain and two nobles.
    ctx.fillStyle = 'rgba(247,231,177,0.85)';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.17, y + h * 0.08);
    ctx.lineTo(x + w * 0.83, y + h * 0.08);
    ctx.lineTo(x + w * 0.77, y + h * 0.64);
    ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.72, x + w * 0.23, y + h * 0.64);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#9f7b2f';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    drawPattern(ctx, 'seigaiha', x + w * 0.18, y + h * 0.1, w * 0.64, h * 0.5, '#b08a39', 0.24, 12);
    drawGenjiLady(ctx, x + w * 0.36, y + h * 0.94, h * 0.62, 0);
    drawWarrior(ctx, x + w * 0.65, y + h * 0.94, h * 0.52, { red: '#344c63', gold: '#c9a14a', weapon: 'bow' });
    drawCranePair(ctx, x + w * 0.78, y + h * 0.18, 0.7);
    return;
  }
  tatami(ctx, x, y + h * 0.72, w, h * 0.28);
  if (art === 'matsukaze' || art === 'usugumo') {
    drawPine(ctx, x + w * 0.8, y + h * 0.95, h * 0.7, -w * 0.16);
    ctx.fillStyle = 'rgba(247,236,203,0.5)';
    ctx.beginPath();
    ctx.arc(x + w * 0.2, y + h * 0.22, Math.min(w, h) * 0.12, 0, TAU);
    ctx.fill();
  }
  if (art === 'eawase') {
    // Two fans being compared.
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = i ? 'rgba(244,233,207,0.9)' : 'rgba(231,187,153,0.9)';
      ctx.beginPath();
      ctx.moveTo(x + w * (0.25 + i * 0.42), y + h * 0.58);
      ctx.arc(x + w * (0.25 + i * 0.42), y + h * 0.58, w * 0.12, -1.1, 1.1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#8a6830';
      ctx.stroke();
    }
  }
  if (art === 'asagao') {
    for (let i = 0; i < 4; i++) {
      const fx = x + w * (0.12 + i * 0.11);
      const fy = y + h * (0.26 + (i % 2) * 0.12);
      ctx.fillStyle = 'rgba(76,84,137,0.8)';
      ctx.beginPath();
      ctx.arc(fx, fy, 5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(235,228,207,0.8)';
      ctx.beginPath();
      ctx.arc(fx, fy, 2, 0, TAU);
      ctx.fill();
    }
  }
  if (art === 'tamakazura') {
    ctx.fillStyle = '#b68a2e';
    ctx.beginPath();
    ctx.arc(x + w * 0.2, y + h * 0.45, w * 0.09, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#5c4525';
    ctx.stroke();
  }
  drawGenjiLady(ctx, x + w * 0.48, y + h * 0.96, h * 0.67, variant);
  drawSeal(ctx, x + w * 0.86, y + h * 0.16, Math.min(w, h) * 0.055, evil ? '悪' : '善', evil ? '#3b2342' : PALETTE.vermilion, Math.min(w, h) * 0.045);
}

export function drawGoalScene(ctx, art, x, y, w, h) {
  if (art === 'hyakumonogatari') {
    washiPaper(ctx, x, y, w, h, '#c9b994', { seed: 'hyakumonogatari-goal' });
    bokashi(ctx, x, y, w, h, '#14252b', '#4c4037');
    // Gold-leaf folding screen with faint ghost silhouettes.
    ctx.fillStyle = 'rgba(202,183,137,0.42)';
    ctx.fillRect(x + w * 0.04, y + h * 0.05, w * 0.92, h * 0.52);
    drawPattern(ctx, 'seigaiha', x + w * 0.04, y + h * 0.05, w * 0.92, h * 0.52, '#d9cba1', 0.12, 16);
    drawYokai(ctx, 'yukionna', x + w * 0.19, y + h * 0.56, h * 0.29);
    drawYokai(ctx, 'oiwa', x + w * 0.83, y + h * 0.56, h * 0.28);
    // Hanging scroll for the hundred tales.
    ctx.save();
    ctx.shadowColor = 'rgba(10,8,6,0.5)';
    ctx.shadowBlur = 7;
    ctx.fillStyle = 'rgba(242,231,202,0.9)';
    ctx.fillRect(x + w * 0.37, y + h * 0.07, w * 0.26, h * 0.48);
    ctx.restore();
    ctx.strokeStyle = 'rgba(92,69,38,0.85)';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x + w * 0.37, y + h * 0.07, w * 0.26, h * 0.48);
    ctx.fillStyle = '#201b17';
    ctx.font = `700 ${Math.round(Math.min(w, h) * 0.13)}px "Yuji Syuku",serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('百', x + w * 0.5, y + h * 0.23);
    ctx.fillStyle = '#7d1f31';
    ctx.font = `600 ${Math.round(Math.min(w, h) * 0.058)}px "Yuji Syuku",serif`;
    ctx.fillText('物語', x + w * 0.5, y + h * 0.37);
    drawSeal(ctx, x + w * 0.54, y + h * 0.42, Math.min(w, h) * 0.046, '怪', '#7d1f31', Math.min(w, h) * 0.038);
    // Lacquer altar and many blue flames.
    ctx.fillStyle = '#241a16';
    ctx.fillRect(x + w * 0.14, y + h * 0.73, w * 0.72, h * 0.055);
    ctx.fillRect(x + w * 0.2, y + h * 0.785, w * 0.026, h * 0.17);
    ctx.fillRect(x + w * 0.774, y + h * 0.785, w * 0.026, h * 0.17);
    for (let i = 0; i < 27; i++) {
      const cx = x + w * (0.18 + (i % 9) * 0.08);
      const cy = y + h * (0.69 - Math.floor(i / 9) * 0.055);
      const flicker = 0.75 + 0.25 * Math.sin(i * 2.4);
      const glow = ctx.createRadialGradient(cx, cy - 4, 0, cx, cy - 4, 8);
      glow.addColorStop(0, `rgba(103,205,181,${0.38 * flicker})`);
      glow.addColorStop(1, 'rgba(103,205,181,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - 9, cy - 13, 18, 18);
      ctx.fillStyle = '#e7d9b2';
      ctx.fillRect(cx - 1.3, cy - 4, 2.6, 8);
      ctx.fillStyle = `rgba(134,232,202,${0.78 * flicker})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy - 5.5, 1.7, 3.1, 0, 0, TAU);
      ctx.fill();
    }
    drawBeauty(ctx, x + w * 0.5, y + h * 1.02, h * 0.4, {
      robe: '#26252b', light: '#55515a', obi: '#7d1f31', fan: true,
    });
    // Drifting smoke.
    ctx.strokeStyle = 'rgba(205,225,216,0.24)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const sx = x + w * (0.1 + i * 0.23);
      ctx.beginPath();
      ctx.moveTo(sx, y + h * 0.68);
      ctx.bezierCurveTo(sx + 20, y + h * 0.55, sx - 22, y + h * 0.48, sx + 8, y + h * 0.36);
      ctx.stroke();
    }
    return;
  }
  if (art === 'genji') {
    washiPaper(ctx, x, y, w, h, '#e6d2a7', { seed: 'genji-goal' });
    bokashi(ctx, x, y, w, h, '#d3ad54', '#f0e1b2');
    goldFleck(ctx, x, y, w, h, 'goal', 70);
    // Gold byobu and central curtain.
    ctx.fillStyle = 'rgba(247,235,193,0.78)';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.16, y + h * 0.08);
    ctx.lineTo(x + w * 0.84, y + h * 0.08);
    ctx.lineTo(x + w * 0.78, y + h * 0.82);
    ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.92, x + w * 0.22, y + h * 0.82);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#9b7429';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    drawPattern(ctx, 'kikko', x + w * 0.2, y + h * 0.1, w * 0.6, h * 0.7, '#9b7429', 0.22, 15);
    drawCranePair(ctx, x + w * 0.68, y + h * 0.22, 0.8);
    drawGenjiLady(ctx, x + w * 0.39, y + h * 0.92, h * 0.6, 0);
    ctx.fillStyle = 'rgba(247,238,205,0.88)';
    ctx.font = `600 ${Math.round(h * 0.06)}px "Yuji Syuku",serif`;
    ctx.textAlign = 'center';
    ctx.fillText('源氏繪合・上り', x + w * 0.5, y + h * 0.11);
    return;
  }
  if (art === 'kyoto') {
    drawTokaidoScene(ctx, art, x, y, w, h);
    return;
  }
  washiPaper(ctx, x, y, w, h, '#e3d0a7', { seed: 'goal' });
  bokashi(ctx, x, y, w, h, '#b68a2e', '#f0e0b6');
  goldFleck(ctx, x, y, w, h, 'agari-goal', 55);
  drawPattern(ctx, 'kikko', x, y, w, h, '#7b4a20', 0.1, 20);
  // Gold field curtain.
  ctx.fillStyle = 'rgba(247,235,193,0.82)';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.12, y + h * 0.1);
  ctx.lineTo(x + w * 0.88, y + h * 0.1);
  ctx.lineTo(x + w * 0.81, y + h * 0.72);
  ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.82, x + w * 0.19, y + h * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(136,99,31,0.75)';
  ctx.stroke();
  drawPattern(ctx, 'seigaiha', x + w * 0.14, y + h * 0.12, w * 0.72, h * 0.56, '#9b7429', 0.2, 11);
  drawCrane(ctx, x + w * 0.69, y + h * 0.24, 0.62, 'rgba(195,153,62,0.82)');
  // Three regalia seals.
  for (let i = 0; i < 3; i++) {
    const cx = x + w * (0.38 + i * 0.12);
    const cy = y + h * 0.34;
    ctx.fillStyle = 'rgba(155,47,38,0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(w, h) * 0.055, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f7e8c4';
    ctx.font = `700 ${Math.round(Math.min(w, h) * 0.045)}px "Yuji Syuku",serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(['兜', '太刀', '鼓'][i], cx, cy);
  }
  drawWarrior(ctx, x + w * 0.46, y + h * 0.96, h * 0.56, { red: '#7e231e', gold: '#d3ad57', weapon: 'naginata' });
  drawSeal(ctx, x + w * 0.5, y + h * 0.84, Math.min(w, h) * 0.12, '上', PALETTE.vermilion, Math.min(w, h) * 0.105);
}

export function drawCharmScene(ctx, art, x, y, w, h) {
  washiPaper(ctx, x, y, w, h, '#e8d7b3', { seed: art });
  bokashi(ctx, x, y, w, h, '#c3a867', '#f0e2c0');
  goldFleck(ctx, x, y, w, h, art, 20);
  const cx = x + w * 0.5;
  const cy = y + h * 0.48;
  ctx.fillStyle = 'rgba(247,238,210,0.9)';
  ctx.strokeStyle = 'rgba(91,64,31,0.55)';
  ctx.lineWidth = 1;
  roundRect(ctx, cx - 24, cy - 42, 48, 84, 4);
  ctx.fill();
  ctx.stroke();
  if (art === 'charm_stay') {
    ctx.fillStyle = '#9c3a2a';
    ctx.fillRect(cx - 17, cy - 30, 34, 15);
    ctx.fillStyle = '#f3e8ca';
    ctx.font = '700 12px "Yuji Syuku",serif';
    ctx.textAlign = 'center';
    ctx.fillText('宿', cx, cy - 19);
    ctx.fillStyle = '#5b4226';
    for (let i = 0; i < 4; i++) ctx.fillRect(cx - 13, cy - 6 + i * 10, 26, 1.5);
  } else if (art === 'charm_guard') {
    ctx.strokeStyle = '#315e68';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy - 8, 17, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#315e68';
    ctx.font = '700 10px "Yuji Syuku",serif';
    ctx.textAlign = 'center';
    ctx.fillText('封', cx, cy - 4);
    for (let i = 0; i < 3; i++) ctx.fillRect(cx - 10, cy + 14 + i * 7, 20, 1.2);
  } else {
    ctx.fillStyle = '#8a6a28';
    ctx.beginPath();
    ctx.arc(cx, cy - 8, 16, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f3e8ca';
    ctx.font = '700 9px "Yuji Syuku",serif';
    ctx.textAlign = 'center';
    ctx.fillText('駕', cx, cy - 5);
    ctx.strokeStyle = '#8a6a28';
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 8, cy + 12);
      ctx.lineTo(cx + i * 8, cy + 36);
      ctx.stroke();
    }
  }
  drawCrane(ctx, x + w * 0.78, y + h * 0.16, 0.5, 'rgba(180,140,58,0.75)');
  drawSeal(ctx, x + w * 0.16, y + h * 0.14, Math.min(w, h) * 0.07, art === 'charm_stay' ? '守' : art === 'charm_guard' ? '封' : '走', PALETTE.vermilion, Math.min(w, h) * 0.055);
}
