// Layered bezier figures: travellers, beauties, warriors, yokai and Genji nobles.
import {
  PALETTE, roundRect, rng, hashString, drawCloud, drawCrane,
} from './art_core.js';

const TAU = Math.PI * 2;

function limb(ctx, x1, y1, x2, y2, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function face(ctx, cx, cy, r, skin = '#ead2ae', direction = 1) {
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.76, r, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(55,36,23,0.42)';
  ctx.lineWidth = 0.65;
  ctx.stroke();
  // Nose and mouth.
  ctx.strokeStyle = 'rgba(79,48,30,0.65)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx + direction * r * 0.05, cy + r * 0.12);
  ctx.lineTo(cx + direction * r * 0.15, cy + r * 0.32);
  ctx.stroke();
  ctx.fillStyle = 'rgba(150,58,46,0.76)';
  ctx.beginPath();
  ctx.ellipse(cx + direction * r * 0.02, cy + r * 0.58, r * 0.17, r * 0.055, 0, 0, TAU);
  ctx.fill();
}

function eye(ctx, x, y, w = 3.2, h = 1.4, color = PALETTE.ink) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, w, h, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,250,236,0.7)';
  ctx.beginPath();
  ctx.arc(x - w * 0.2, y - h * 0.25, Math.max(0.4, w * 0.16), 0, TAU);
  ctx.fill();
}

export function drawTraveler(ctx, x, footY, h, opts = {}) {
  const blue = opts.blue || PALETTE.indigo;
  const brown = opts.brown || '#7e5a38';
  const skin = '#d9b98f';
  const headY = footY - h * 0.79;
  const shoulderY = footY - h * 0.67;
  const hipY = footY - h * 0.38;
  const bodyW = h * 0.3;

  // Legs and straw sandals.
  limb(ctx, x - bodyW * 0.16, hipY, x - bodyW * 0.28, footY - h * 0.03, h * 0.075, '#3d4650');
  limb(ctx, x + bodyW * 0.15, hipY, x + bodyW * 0.3, footY - h * 0.02, h * 0.075, '#3d4650');
  ctx.fillStyle = '#b69b66';
  ctx.beginPath();
  ctx.ellipse(x - bodyW * 0.32, footY - h * 0.018, h * 0.06, h * 0.018, -0.08, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + bodyW * 0.34, footY - h * 0.014, h * 0.06, h * 0.018, 0.08, 0, TAU);
  ctx.fill();

  // Kimono body with heavy folds.
  const g = ctx.createLinearGradient(x - bodyW, shoulderY, x + bodyW, hipY);
  g.addColorStop(0, blue);
  g.addColorStop(0.55, opts.mid || '#3f6370');
  g.addColorStop(1, '#263c49');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - bodyW * 0.46, shoulderY);
  ctx.bezierCurveTo(x - bodyW * 0.66, shoulderY + h * 0.08, x - bodyW * 0.58, hipY, x - bodyW * 0.43, footY - h * 0.14);
  ctx.quadraticCurveTo(x, footY - h * 0.06, x + bodyW * 0.48, footY - h * 0.14);
  ctx.bezierCurveTo(x + bodyW * 0.62, hipY, x + bodyW * 0.68, shoulderY + h * 0.08, x + bodyW * 0.44, shoulderY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(18,30,38,0.55)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(217,230,225,0.2)';
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * bodyW * 0.18, shoulderY + h * 0.08);
    ctx.quadraticCurveTo(x + i * bodyW * 0.3, hipY, x + i * bodyW * 0.15, footY - h * 0.15);
    ctx.stroke();
  }

  // Hanten vest and obi.
  ctx.fillStyle = opts.vest || '#6d4430';
  ctx.beginPath();
  ctx.moveTo(x - bodyW * 0.47, shoulderY + 1);
  ctx.lineTo(x - bodyW * 0.22, shoulderY + h * 0.02);
  ctx.lineTo(x - bodyW * 0.13, hipY + h * 0.02);
  ctx.lineTo(x - bodyW * 0.55, hipY - h * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + bodyW * 0.47, shoulderY + 1);
  ctx.lineTo(x + bodyW * 0.22, shoulderY + h * 0.02);
  ctx.lineTo(x + bodyW * 0.13, hipY + h * 0.02);
  ctx.lineTo(x + bodyW * 0.55, hipY - h * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#d8c18a';
  ctx.fillRect(x - bodyW * 0.45, hipY - h * 0.04, bodyW * 0.9, h * 0.055);
  ctx.fillStyle = 'rgba(80,52,28,0.6)';
  for (let i = -2; i <= 2; i++) ctx.fillRect(x + i * bodyW * 0.13, hipY - h * 0.04, 1.2, h * 0.055);

  // Arms and hands.
  limb(ctx, x - bodyW * 0.46, shoulderY + h * 0.05, x - bodyW * 0.72, hipY, h * 0.055, blue);
  limb(ctx, x + bodyW * 0.46, shoulderY + h * 0.05, x + bodyW * 0.68, hipY - h * 0.03, h * 0.055, blue);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x - bodyW * 0.73, hipY + h * 0.01, h * 0.027, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + bodyW * 0.69, hipY - h * 0.04, h * 0.027, 0, TAU);
  ctx.fill();

  // Neck, face, ears.
  ctx.fillStyle = skin;
  ctx.fillRect(x - h * 0.032, headY + h * 0.07, h * 0.064, h * 0.09);
  face(ctx, x, headY, h * 0.105, skin, 1);
  ctx.fillStyle = '#2a2019';
  ctx.beginPath();
  ctx.arc(x - h * 0.102, headY + h * 0.005, h * 0.02, 0, TAU);
  ctx.fill();

  // Kasa hat.
  ctx.fillStyle = opts.hat || '#b6995f';
  ctx.beginPath();
  ctx.moveTo(x - h * 0.22, headY - h * 0.035);
  ctx.quadraticCurveTo(x, headY - h * 0.16, x + h * 0.22, headY - h * 0.035);
  ctx.quadraticCurveTo(x, headY + h * 0.025, x - h * 0.22, headY - h * 0.035);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(68,46,25,0.5)';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x, headY - h * 0.14);
    ctx.lineTo(x + i * h * 0.055, headY - h * 0.03);
    ctx.stroke();
  }

  // Staff.
  if (opts.staff !== false) {
    ctx.strokeStyle = '#6e4b2c';
    ctx.lineWidth = Math.max(1.2, h * 0.015);
    ctx.beginPath();
    ctx.moveTo(x + bodyW * 0.85, footY + h * 0.02);
    ctx.lineTo(x + bodyW * 1.02, footY - h * 0.6);
    ctx.stroke();
    ctx.strokeStyle = '#4b3120';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + bodyW * 1.02, footY - h * 0.6);
    ctx.quadraticCurveTo(x + bodyW * 1.12, footY - h * 0.68, x + bodyW * 1.18, footY - h * 0.57);
    ctx.stroke();
  }
  // Travel bundle.
  if (opts.bundle !== false) {
    ctx.fillStyle = '#8e7653';
    ctx.beginPath();
    ctx.ellipse(x - bodyW * 0.6, shoulderY - h * 0.025, h * 0.075, h * 0.055, -0.3, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,28,17,0.45)';
    ctx.stroke();
  }
}

export function drawBeauty(ctx, x, footY, h, opts = {}) {
  const robe = opts.robe || PALETTE.beni;
  const robe2 = opts.robe2 || '#8e3445';
  const skin = '#f0d5b8';
  const headY = footY - h * 0.81;
  const shoulderY = footY - h * 0.68;
  const hipY = footY - h * 0.4;
  const bodyW = h * 0.28;

  // Trailing kimono hem.
  ctx.fillStyle = robe2;
  ctx.beginPath();
  ctx.moveTo(x - bodyW * 0.38, hipY);
  ctx.bezierCurveTo(x - bodyW * 0.95, footY - h * 0.18, x - bodyW * 0.8, footY, x - bodyW * 0.56, footY);
  ctx.lineTo(x + bodyW * 0.62, footY);
  ctx.bezierCurveTo(x + bodyW * 0.88, footY - h * 0.12, x + bodyW * 0.58, hipY + h * 0.06, x + bodyW * 0.42, hipY);
  ctx.closePath();
  ctx.fill();

  const g = ctx.createLinearGradient(x - bodyW, shoulderY, x + bodyW, footY);
  g.addColorStop(0, opts.light || '#d96a55');
  g.addColorStop(0.5, robe);
  g.addColorStop(1, robe2);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - bodyW * 0.44, shoulderY);
  ctx.bezierCurveTo(x - bodyW * 0.62, shoulderY + h * 0.13, x - bodyW * 0.64, hipY, x - bodyW * 0.52, footY - h * 0.02);
  ctx.lineTo(x + bodyW * 0.54, footY - h * 0.02);
  ctx.bezierCurveTo(x + bodyW * 0.66, hipY, x + bodyW * 0.62, shoulderY + h * 0.13, x + bodyW * 0.44, shoulderY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(71,31,36,0.45)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Kimono collar and obi.
  ctx.fillStyle = '#f2e4c8';
  ctx.beginPath();
  ctx.moveTo(x - bodyW * 0.25, shoulderY);
  ctx.lineTo(x, hipY - h * 0.14);
  ctx.lineTo(x + bodyW * 0.25, shoulderY);
  ctx.lineTo(x + bodyW * 0.17, shoulderY - h * 0.01);
  ctx.lineTo(x, hipY - h * 0.195);
  ctx.lineTo(x - bodyW * 0.17, shoulderY - h * 0.01);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = opts.obi || '#c7a14a';
  ctx.fillRect(x - bodyW * 0.53, hipY - h * 0.11, bodyW * 1.06, h * 0.1);
  ctx.fillStyle = 'rgba(255,245,210,0.38)';
  for (let i = -3; i <= 3; i++) ctx.fillRect(x + i * bodyW * 0.12, hipY - h * 0.1, 1, h * 0.08);

  // Sleeves, arms, hands.
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(x - bodyW * 0.46, shoulderY + h * 0.02);
  ctx.bezierCurveTo(x - bodyW * 0.95, shoulderY + h * 0.1, x - bodyW * 0.9, hipY - h * 0.06, x - bodyW * 0.54, hipY - h * 0.03);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + bodyW * 0.46, shoulderY + h * 0.02);
  ctx.bezierCurveTo(x + bodyW * 0.9, shoulderY + h * 0.08, x + bodyW * 0.86, hipY, x + bodyW * 0.51, hipY - h * 0.04);
  ctx.closePath();
  ctx.fill();
  limb(ctx, x + bodyW * 0.62, hipY - h * 0.05, x + bodyW * 0.25, hipY - h * 0.15, h * 0.044, skin);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x + bodyW * 0.22, hipY - h * 0.16, h * 0.027, 0, TAU);
  ctx.fill();

  // Neck and face.
  ctx.fillStyle = skin;
  ctx.fillRect(x - h * 0.033, headY + h * 0.06, h * 0.066, h * 0.1);
  face(ctx, x, headY, h * 0.11, skin, 1);
  eye(ctx, x - h * 0.042, headY + h * 0.005, h * 0.014, h * 0.006);
  eye(ctx, x + h * 0.042, headY + h * 0.005, h * 0.014, h * 0.006);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x - h * 0.065, headY - h * 0.035);
  ctx.quadraticCurveTo(x - h * 0.042, headY - h * 0.05, x - h * 0.018, headY - h * 0.034);
  ctx.moveTo(x + h * 0.018, headY - h * 0.034);
  ctx.quadraticCurveTo(x + h * 0.042, headY - h * 0.05, x + h * 0.065, headY - h * 0.035);
  ctx.stroke();

  // Long black hair and kanzashi.
  ctx.fillStyle = '#211913';
  ctx.beginPath();
  ctx.moveTo(x - h * 0.115, headY - h * 0.02);
  ctx.bezierCurveTo(x - h * 0.17, headY + h * 0.15, x - h * 0.14, hipY, x - h * 0.18, hipY + h * 0.08);
  ctx.bezierCurveTo(x - h * 0.05, hipY + h * 0.02, x - h * 0.02, shoulderY, x, shoulderY - h * 0.02);
  ctx.bezierCurveTo(x + h * 0.02, shoulderY, x + h * 0.04, hipY + h * 0.02, x + h * 0.16, hipY + h * 0.08);
  ctx.bezierCurveTo(x + h * 0.14, hipY, x + h * 0.17, headY + h * 0.14, x + h * 0.115, headY - h * 0.02);
  ctx.bezierCurveTo(x + h * 0.08, headY - h * 0.14, x - h * 0.07, headY - h * 0.14, x - h * 0.115, headY - h * 0.02);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,244,213,0.22)';
  ctx.lineWidth = 0.6;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * h * 0.018, headY - h * 0.09);
    ctx.quadraticCurveTo(x + i * h * 0.025, headY + h * 0.05, x + i * h * 0.03, hipY + h * 0.06);
    ctx.stroke();
  }
  ctx.fillStyle = '#d9b04f';
  ctx.beginPath();
  ctx.arc(x + h * 0.09, headY - h * 0.06, h * 0.014, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#d9b04f';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + h * 0.09, headY - h * 0.06);
  ctx.lineTo(x + h * 0.17, headY - h * 0.12);
  ctx.stroke();

  if (opts.fan) {
    ctx.fillStyle = '#f4ead1';
    ctx.strokeStyle = '#8e6a38';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + bodyW * 0.3, hipY - h * 0.2);
    ctx.arc(x + bodyW * 0.3, hipY - h * 0.2, h * 0.11, -0.4, 1.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const a = -0.3 + i * 0.32;
      ctx.beginPath();
      ctx.moveTo(x + bodyW * 0.3, hipY - h * 0.2);
      ctx.lineTo(x + bodyW * 0.3 + Math.cos(a) * h * 0.1, hipY - h * 0.2 + Math.sin(a) * h * 0.1);
      ctx.stroke();
    }
  }
}

export function drawWarrior(ctx, x, footY, h, opts = {}) {
  const dark = opts.dark || '#272a2b';
  const red = opts.red || '#8e2f25';
  const gold = opts.gold || '#c59a3b';
  const skin = '#d7b587';
  const headY = footY - h * 0.84;
  const shoulderY = footY - h * 0.7;
  const hipY = footY - h * 0.4;
  const bw = h * 0.31;

  // Wide hakama and armored legs.
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(x - bw * 0.34, hipY);
  ctx.lineTo(x - bw * 0.56, footY);
  ctx.lineTo(x + bw * 0.56, footY);
  ctx.lineTo(x + bw * 0.34, hipY);
  ctx.closePath();
  ctx.fill();
  for (const side of [-1, 1]) {
    ctx.fillStyle = red;
    for (let i = 0; i < 3; i++) {
      roundRect(ctx, x + side * bw * 0.32 - bw * 0.15, footY - h * (0.25 - i * 0.06), bw * 0.3, h * 0.055, 2);
      ctx.fill();
      ctx.strokeStyle = gold;
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    ctx.fillStyle = '#1c1d1d';
    ctx.beginPath();
    ctx.ellipse(x + side * bw * 0.34, footY - h * 0.015, bw * 0.17, h * 0.022, 0, 0, TAU);
    ctx.fill();
  }

  // Do cuirass.
  const g = ctx.createLinearGradient(x - bw, shoulderY, x + bw, hipY);
  g.addColorStop(0, opts.light || '#7f2b22');
  g.addColorStop(0.55, red);
  g.addColorStop(1, '#4f1715');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - bw * 0.55, shoulderY);
  ctx.bezierCurveTo(x - bw * 0.7, shoulderY + h * 0.11, x - bw * 0.62, hipY, x - bw * 0.35, hipY + h * 0.02);
  ctx.lineTo(x + bw * 0.35, hipY + h * 0.02);
  ctx.bezierCurveTo(x + bw * 0.62, hipY, x + bw * 0.7, shoulderY + h * 0.11, x + bw * 0.55, shoulderY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = gold;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = 'rgba(230,199,118,0.52)';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(x - bw * 0.48, shoulderY + h * 0.04 + i * h * 0.055);
    ctx.quadraticCurveTo(x, shoulderY + h * 0.075 + i * h * 0.055, x + bw * 0.48, shoulderY + h * 0.04 + i * h * 0.055);
    ctx.stroke();
  }

  // Sode shoulder plates.
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(x + side * bw * 0.64, shoulderY + h * 0.045);
    ctx.rotate(side * 0.08);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? red : '#5d1c18';
      roundRect(ctx, -bw * 0.18, i * h * 0.045, bw * 0.36, h * 0.05, 2);
      ctx.fill();
      ctx.strokeStyle = gold;
      ctx.lineWidth = 0.65;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Arms, hands, gauntlets.
  limb(ctx, x - bw * 0.55, shoulderY + h * 0.1, x - bw * 0.72, hipY + h * 0.02, h * 0.06, dark);
  limb(ctx, x + bw * 0.55, shoulderY + h * 0.1, x + bw * 0.7, hipY - h * 0.02, h * 0.06, dark);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x - bw * 0.73, hipY + h * 0.03, h * 0.028, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + bw * 0.71, hipY - h * 0.02, h * 0.028, 0, TAU);
  ctx.fill();

  // Neck and face.
  ctx.fillStyle = skin;
  ctx.fillRect(x - h * 0.035, headY + h * 0.06, h * 0.07, h * 0.1);
  face(ctx, x, headY, h * 0.105, skin, 1);
  eye(ctx, x - h * 0.041, headY, h * 0.013, h * 0.0055, '#1b1713');
  eye(ctx, x + h * 0.041, headY, h * 0.013, h * 0.0055, '#1b1713');
  ctx.strokeStyle = '#211915';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x - h * 0.075, headY - h * 0.035);
  ctx.quadraticCurveTo(x - h * 0.04, headY - h * 0.055, x - h * 0.012, headY - h * 0.035);
  ctx.moveTo(x + h * 0.012, headY - h * 0.035);
  ctx.quadraticCurveTo(x + h * 0.04, headY - h * 0.055, x + h * 0.075, headY - h * 0.035);
  ctx.stroke();

  // Kabuto bowl and shikoro.
  ctx.fillStyle = '#242829';
  ctx.beginPath();
  ctx.ellipse(x, headY - h * 0.06, h * 0.14, h * 0.11, 0, Math.PI, TAU);
  ctx.fill();
  ctx.strokeStyle = gold;
  ctx.lineWidth = 1;
  ctx.stroke();
  for (let i = -3; i <= 3; i++) {
    ctx.strokeStyle = 'rgba(197,154,59,0.5)';
    ctx.beginPath();
    ctx.moveTo(x, headY - h * 0.16);
    ctx.lineTo(x + i * h * 0.035, headY - h * 0.06);
    ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i % 2 ? '#5d1c18' : '#2b2d2c';
    roundRect(ctx, x - h * 0.14 - i * 2, headY - h * 0.03 + i * h * 0.025, h * 0.28 + i * 4, h * 0.028, 2);
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.stroke();
  }
  // Crescent maedate.
  ctx.strokeStyle = gold;
  ctx.lineWidth = Math.max(1.2, h * 0.014);
  ctx.beginPath();
  ctx.arc(x, headY - h * 0.18, h * 0.11, Math.PI * 0.12, Math.PI * 0.88, true);
  ctx.stroke();

  // Weapon: spear, bow or sword.
  if (opts.weapon === 'bow') {
    ctx.strokeStyle = '#4b3020';
    ctx.lineWidth = h * 0.013;
    ctx.beginPath();
    ctx.moveTo(x + bw * 0.85, footY);
    ctx.quadraticCurveTo(x + bw * 1.2, footY - h * 0.46, x + bw * 0.7, footY - h * 0.78);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(240,232,207,0.8)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + bw * 0.85, footY);
    ctx.lineTo(x + bw * 0.7, footY - h * 0.78);
    ctx.stroke();
  } else if (opts.weapon === 'naginata') {
    ctx.strokeStyle = '#5b3d25';
    ctx.lineWidth = h * 0.018;
    ctx.beginPath();
    ctx.moveTo(x + bw * 0.9, footY + h * 0.02);
    ctx.lineTo(x + bw * 1.18, footY - h * 0.72);
    ctx.stroke();
    ctx.fillStyle = '#c9d0cf';
    ctx.beginPath();
    ctx.moveTo(x + bw * 1.18, footY - h * 0.72);
    ctx.quadraticCurveTo(x + bw * 1.5, footY - h * 0.82, x + bw * 1.38, footY - h * 0.98);
    ctx.quadraticCurveTo(x + bw * 1.3, footY - h * 0.84, x + bw * 1.1, footY - h * 0.77);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.strokeStyle = '#d6dcda';
    ctx.lineWidth = h * 0.018;
    ctx.beginPath();
    ctx.moveTo(x - bw * 0.82, footY - h * 0.02);
    ctx.quadraticCurveTo(x - bw * 0.92, footY - h * 0.38, x - bw * 0.7, footY - h * 0.7);
    ctx.stroke();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x - bw * 0.7, footY - h * 0.7, h * 0.026, 0, TAU);
    ctx.stroke();
  }

  // Sashimono / war banner behind.
  if (opts.banner) {
    ctx.strokeStyle = '#583d26';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + bw * 0.96, footY);
    ctx.lineTo(x + bw * 1.1, footY - h * 0.88);
    ctx.stroke();
    ctx.fillStyle = opts.bannerColor || '#e8e2cf';
    ctx.fillRect(x + bw * 0.7, footY - h * 0.88, bw * 0.52, h * 0.3);
    ctx.strokeStyle = PALETTE.ink;
    ctx.strokeRect(x + bw * 0.7, footY - h * 0.88, bw * 0.52, h * 0.3);
    ctx.fillStyle = red;
    ctx.beginPath();
    ctx.arc(x + bw * 0.96, footY - h * 0.73, h * 0.055, 0, TAU);
    ctx.fill();
  }
}

export function drawYokai(ctx, kind, x, footY, h, opts = {}) {
  const rand = rng(hashString(kind));
  const bw = h * 0.26;
  const headY = footY - h * 0.76;

  if (kind === 'kappa') {
    ctx.fillStyle = '#4f7a52';
    ctx.beginPath();
    ctx.ellipse(x, footY - h * 0.34, bw * 0.82, h * 0.27, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#2d4b33';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Shell.
    ctx.fillStyle = '#385d3b';
    ctx.beginPath();
    ctx.ellipse(x + bw * 0.45, footY - h * 0.39, bw * 0.5, h * 0.2, -0.2, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = 'rgba(186,210,158,0.35)';
      ctx.beginPath();
      ctx.arc(x + bw * 0.45, footY - h * 0.39, 4 + i * 4, 0, Math.PI);
      ctx.stroke();
    }
    // Head with dish.
    ctx.fillStyle = '#5f8a5d';
    ctx.beginPath();
    ctx.ellipse(x, headY, h * 0.11, h * 0.1, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#d6c078';
    ctx.beginPath();
    ctx.ellipse(x, headY - h * 0.09, h * 0.075, h * 0.018, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#7d6531';
    ctx.stroke();
    ctx.fillStyle = '#d8e2b5';
    ctx.beginPath();
    ctx.ellipse(x + h * 0.028, headY - h * 0.005, h * 0.022, h * 0.014, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1e261d';
    ctx.beginPath();
    ctx.arc(x + h * 0.026, headY - h * 0.005, h * 0.007, 0, TAU);
    ctx.arc(x - h * 0.028, headY - h * 0.005, h * 0.007, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#2f432d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - h * 0.04, headY + h * 0.035);
    ctx.quadraticCurveTo(x, headY + h * 0.07, x + h * 0.04, headY + h * 0.035);
    ctx.stroke();
    limb(ctx, x - bw * 0.3, footY - h * 0.28, x - bw * 0.66, footY - h * 0.12, h * 0.04, '#4f7a52');
    limb(ctx, x + bw * 0.3, footY - h * 0.28, x + bw * 0.64, footY - h * 0.15, h * 0.04, '#4f7a52');
    // Water ripples.
    ctx.strokeStyle = 'rgba(49,94,120,0.7)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(x, footY + i * 4, bw * (0.8 + i * 0.4), 4 + i * 2, 0, 0, TAU);
      ctx.stroke();
    }
    return;
  }

  if (kind === 'yukionna') {
    ctx.fillStyle = 'rgba(236,242,239,0.9)';
    ctx.beginPath();
    ctx.moveTo(x - bw * 0.5, footY);
    ctx.bezierCurveTo(x - bw * 0.9, footY - h * 0.24, x - bw * 0.55, headY + h * 0.06, x - bw * 0.3, headY + h * 0.03);
    ctx.lineTo(x + bw * 0.3, headY + h * 0.03);
    ctx.bezierCurveTo(x + bw * 0.55, headY + h * 0.06, x + bw * 0.9, footY - h * 0.24, x + bw * 0.5, footY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(87,123,137,0.45)';
    ctx.stroke();
    ctx.fillStyle = '#f4e6ce';
    ctx.beginPath();
    ctx.ellipse(x, headY, h * 0.105, h * 0.115, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1e1a1b';
    ctx.beginPath();
    ctx.moveTo(x - h * 0.11, headY - h * 0.02);
    ctx.bezierCurveTo(x - h * 0.18, headY + h * 0.2, x - h * 0.1, footY - h * 0.24, x - h * 0.2, footY - h * 0.1);
    ctx.lineTo(x - h * 0.03, footY - h * 0.2);
    ctx.bezierCurveTo(x - h * 0.03, headY + h * 0.13, x + h * 0.01, headY + h * 0.2, x + h * 0.12, footY - h * 0.1);
    ctx.bezierCurveTo(x + h * 0.1, headY + h * 0.2, x + h * 0.18, headY + h * 0.02, x + h * 0.11, headY - h * 0.02);
    ctx.bezierCurveTo(x + h * 0.07, headY - h * 0.16, x - h * 0.07, headY - h * 0.16, x - h * 0.11, headY - h * 0.02);
    ctx.fill();
    eye(ctx, x - h * 0.035, headY + h * 0.005, h * 0.012, h * 0.005, '#315e78');
    eye(ctx, x + h * 0.035, headY + h * 0.005, h * 0.012, h * 0.005, '#315e78');
    // Snow.
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(248,250,244,${0.35 + rand() * 0.5})`;
      ctx.beginPath();
      ctx.arc(x + (rand() - 0.5) * h * 0.9, footY - rand() * h, 0.7 + rand() * 2.1, 0, TAU);
      ctx.fill();
    }
    return;
  }

  if (kind === 'nekomata') {
    ctx.fillStyle = '#3c3a3a';
    ctx.beginPath();
    ctx.ellipse(x, footY - h * 0.34, bw * 0.95, h * 0.28, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, headY, h * 0.13, h * 0.11, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - h * 0.1, headY - h * 0.07);
    ctx.lineTo(x - h * 0.16, headY - h * 0.2);
    ctx.lineTo(x - h * 0.02, headY - h * 0.12);
    ctx.closePath();
    ctx.moveTo(x + h * 0.1, headY - h * 0.07);
    ctx.lineTo(x + h * 0.16, headY - h * 0.2);
    ctx.lineTo(x + h * 0.02, headY - h * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d6b85e';
    eye(ctx, x - h * 0.052, headY, h * 0.018, h * 0.01, '#d6b85e');
    eye(ctx, x + h * 0.052, headY, h * 0.018, h * 0.01, '#d6b85e');
    ctx.fillStyle = '#9c3a2a';
    ctx.beginPath();
    ctx.moveTo(x - h * 0.018, headY + h * 0.045);
    ctx.lineTo(x + h * 0.018, headY + h * 0.045);
    ctx.lineTo(x, headY + h * 0.065);
    ctx.fill();
    for (const side of [-1, 1]) {
      ctx.strokeStyle = '#3c3a3a';
      ctx.lineWidth = h * 0.018;
      ctx.beginPath();
      ctx.moveTo(x + side * bw * 0.55, footY - h * 0.32);
      ctx.bezierCurveTo(x + side * bw * 1.1, footY - h * 0.45, x + side * bw * 1.0, footY - h * 0.1, x + side * bw * 1.3, footY - h * 0.22);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(240,231,206,0.85)';
    ctx.beginPath();
    ctx.arc(x + h * 0.05, footY - h * 0.92, h * 0.09, 0, TAU);
    ctx.fill();
    return;
  }

  if (kind === 'chagama') {
    ctx.fillStyle = '#6d5a3e';
    ctx.beginPath();
    ctx.ellipse(x, footY - h * 0.26, bw * 0.85, h * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#2b241a';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Badger face.
    ctx.fillStyle = '#8d7a58';
    ctx.beginPath();
    ctx.ellipse(x + h * 0.04, headY + h * 0.08, h * 0.11, h * 0.1, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ede4ce';
    ctx.beginPath();
    ctx.ellipse(x + h * 0.04, headY + h * 0.11, h * 0.08, h * 0.06, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2a2119';
    ctx.beginPath();
    ctx.arc(x - h * 0.02, headY + h * 0.09, h * 0.012, 0, TAU);
    ctx.arc(x + h * 0.1, headY + h * 0.09, h * 0.012, 0, TAU);
    ctx.arc(x + h * 0.04, headY + h * 0.13, h * 0.016, 0, TAU);
    ctx.fill();
    // Tail and steam.
    ctx.strokeStyle = '#7b6849';
    ctx.lineWidth = h * 0.02;
    ctx.beginPath();
    ctx.moveTo(x + bw * 0.7, footY - h * 0.26);
    ctx.bezierCurveTo(x + bw * 1.05, footY - h * 0.36, x + bw * 0.95, footY - h * 0.08, x + bw * 1.25, footY - h * 0.2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(240,233,214,0.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x + (i - 1.5) * 10, footY - h * 0.48);
      ctx.bezierCurveTo(x + (i - 1.5) * 12 - 6, footY - h * 0.62, x + (i - 1.5) * 12 + 8, footY - h * 0.72, x + (i - 1.5) * 10, footY - h * 0.86);
      ctx.stroke();
    }
    return;
  }

  if (kind === 'sanme') {
    ctx.fillStyle = '#4a4039';
    ctx.beginPath();
    ctx.moveTo(x - bw * 0.7, footY);
    ctx.lineTo(x - bw * 0.4, footY - h * 0.5);
    ctx.lineTo(x + bw * 0.4, footY - h * 0.5);
    ctx.lineTo(x + bw * 0.7, footY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#b89468';
    ctx.beginPath();
    ctx.ellipse(x, headY, h * 0.13, h * 0.12, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#e6dcc3';
    ctx.beginPath();
    ctx.arc(x, headY - h * 0.06, h * 0.03, 0, TAU);
    ctx.fill();
    for (let i = -1; i <= 1; i++) {
      eye(ctx, x + i * h * 0.05, headY + h * 0.008, h * 0.012, h * 0.007, '#6b1c1c');
    }
    ctx.strokeStyle = '#3a2a1e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - h * 0.05, headY + h * 0.06);
    ctx.quadraticCurveTo(x, headY + h * 0.08, x + h * 0.05, headY + h * 0.06);
    ctx.stroke();
    return;
  }

  if (kind === 'funayurei') {
    ctx.fillStyle = 'rgba(205,222,220,0.78)';
    ctx.beginPath();
    ctx.moveTo(x - bw * 0.5, footY);
    ctx.bezierCurveTo(x - bw * 0.85, footY - h * 0.26, x - bw * 0.52, headY + h * 0.06, x - bw * 0.22, headY + h * 0.05);
    ctx.lineTo(x + bw * 0.22, headY + h * 0.05);
    ctx.bezierCurveTo(x + bw * 0.52, headY + h * 0.06, x + bw * 0.85, footY - h * 0.26, x + bw * 0.5, footY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d9e2d9';
    ctx.beginPath();
    ctx.ellipse(x, headY, h * 0.1, h * 0.11, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#252120';
    ctx.beginPath();
    ctx.arc(x - h * 0.035, headY, h * 0.018, 0, TAU);
    ctx.arc(x + h * 0.035, headY, h * 0.018, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(40,34,30,0.6)';
    ctx.beginPath();
    ctx.ellipse(x, headY + h * 0.06, h * 0.02, h * 0.03, 0, 0, TAU);
    ctx.fill();
    // Ladle.
    ctx.strokeStyle = '#8d785a';
    ctx.lineWidth = h * 0.012;
    ctx.beginPath();
    ctx.moveTo(x + bw * 0.5, footY - h * 0.35);
    ctx.lineTo(x + bw * 0.8, footY - h * 0.2);
    ctx.stroke();
    ctx.fillStyle = '#8d785a';
    ctx.beginPath();
    ctx.arc(x + bw * 0.84, footY - h * 0.19, h * 0.035, 0, TAU);
    ctx.fill();
    return;
  }

  if (kind === 'oiwa') {
    // Lantern cage.
    ctx.fillStyle = '#d8c58e';
    ctx.beginPath();
    ctx.ellipse(x, footY - h * 0.35, bw * 0.72, h * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#3a2b1d';
    ctx.lineWidth = 1;
    ctx.stroke();
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(x, footY - h * 0.35, Math.abs(i) * bw * 0.18 + 1, h * 0.29, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = '#e9d9ae';
    ctx.beginPath();
    ctx.ellipse(x, headY + h * 0.08, h * 0.105, h * 0.12, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1e1a18';
    ctx.beginPath();
    ctx.moveTo(x - h * 0.11, headY + h * 0.02);
    ctx.bezierCurveTo(x - h * 0.16, headY + h * 0.22, x - h * 0.09, footY - h * 0.3, x - h * 0.18, footY - h * 0.12);
    ctx.lineTo(x - h * 0.03, footY - h * 0.19);
    ctx.bezierCurveTo(x - h * 0.03, headY + h * 0.2, x + h * 0.02, headY + h * 0.2, x + h * 0.14, footY - h * 0.12);
    ctx.bezierCurveTo(x + h * 0.1, headY + h * 0.2, x + h * 0.16, headY + h * 0.03, x + h * 0.11, headY + h * 0.02);
    ctx.fill();
    eye(ctx, x - h * 0.03, headY + h * 0.06, h * 0.018, h * 0.009, '#211816');
    ctx.fillStyle = '#f0e4c9';
    ctx.beginPath();
    ctx.ellipse(x + h * 0.04, headY + h * 0.06, h * 0.02, h * 0.012, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#211816';
    ctx.beginPath();
    ctx.arc(x + h * 0.04, headY + h * 0.06, h * 0.008, 0, TAU);
    ctx.fill();
    // Flame.
    ctx.fillStyle = 'rgba(203,116,44,0.75)';
    ctx.beginPath();
    ctx.moveTo(x, footY - h * 0.82);
    ctx.bezierCurveTo(x - 8, footY - h * 0.68, x + 8, footY - h * 0.62, x, footY - h * 0.5);
    ctx.bezierCurveTo(x + 12, footY - h * 0.66, x + 5, footY - h * 0.74, x, footY - h * 0.82);
    ctx.fill();
    return;
  }

  if (kind === 'rokuro') {
    // Body behind a veranda rail.
    ctx.fillStyle = '#7e3e50';
    ctx.beginPath();
    ctx.ellipse(x, footY - h * 0.2, bw * 0.7, h * 0.2, 0, 0, TAU);
    ctx.fill();
    // Long neck.
    ctx.fillStyle = '#e6c8a8';
    ctx.beginPath();
    ctx.moveTo(x - h * 0.03, footY - h * 0.32);
    ctx.bezierCurveTo(x - h * 0.06, footY - h * 0.5, x + h * 0.08, footY - h * 0.52, x + h * 0.02, headY + h * 0.1);
    ctx.lineTo(x + h * 0.07, headY + h * 0.1);
    ctx.bezierCurveTo(x + h * 0.12, footY - h * 0.5, x - h * 0.01, footY - h * 0.5, x + h * 0.03, footY - h * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e6c8a8';
    ctx.beginPath();
    ctx.ellipse(x + h * 0.045, headY, h * 0.1, h * 0.1, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#211913';
    ctx.beginPath();
    ctx.arc(x + h * 0.045, headY - h * 0.04, h * 0.115, Math.PI, TAU);
    ctx.fill();
    ctx.fillRect(x - h * 0.04, headY - h * 0.04, h * 0.04, h * 0.18);
    eye(ctx, x + h * 0.005, headY + h * 0.015, h * 0.012, h * 0.005);
    eye(ctx, x + h * 0.09, headY + h * 0.015, h * 0.012, h * 0.005);
    ctx.strokeStyle = '#3d2b22';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + h * 0.03, headY + h * 0.06);
    ctx.quadraticCurveTo(x + h * 0.06, headY + h * 0.075, x + h * 0.09, headY + h * 0.06);
    ctx.stroke();
    return;
  }

  if (kind === 'kyubi') {
    ctx.fillStyle = '#f0e8d3';
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.92 + (i / 8) * Math.PI * 0.84;
      ctx.beginPath();
      ctx.moveTo(x, footY - h * 0.32);
      ctx.quadraticCurveTo(x + Math.cos(a) * h * 0.55, footY - h * 0.6 + Math.sin(a) * h * 0.28,
        x + Math.cos(a) * h * 0.72, footY - h * 0.62 + Math.sin(a) * h * 0.42);
      ctx.quadraticCurveTo(x + Math.cos(a) * h * 0.52, footY - h * 0.42, x, footY - h * 0.22);
      ctx.fill();
      ctx.strokeStyle = 'rgba(104,86,57,0.35)';
      ctx.stroke();
    }
    ctx.fillStyle = '#f1e6ca';
    ctx.beginPath();
    ctx.ellipse(x, footY - h * 0.33, bw * 0.72, h * 0.25, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, headY, h * 0.12, h * 0.11, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - h * 0.1, headY - h * 0.06);
    ctx.lineTo(x - h * 0.16, headY - h * 0.2);
    ctx.lineTo(x - h * 0.02, headY - h * 0.12);
    ctx.closePath();
    ctx.moveTo(x + h * 0.1, headY - h * 0.06);
    ctx.lineTo(x + h * 0.16, headY - h * 0.2);
    ctx.lineTo(x + h * 0.02, headY - h * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#b23a2b';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x - h * 0.06, headY - h * 0.04);
    ctx.lineTo(x - h * 0.02, headY - h * 0.02);
    ctx.moveTo(x + h * 0.06, headY - h * 0.04);
    ctx.lineTo(x + h * 0.02, headY - h * 0.02);
    ctx.stroke();
    eye(ctx, x - h * 0.045, headY + h * 0.005, h * 0.013, h * 0.006, '#c79a3c');
    eye(ctx, x + h * 0.045, headY + h * 0.005, h * 0.013, h * 0.006, '#c79a3c');
    return;
  }

  if (kind === 'tengu') {
    ctx.fillStyle = '#3f4d3b';
    ctx.beginPath();
    ctx.moveTo(x - bw * 0.6, footY);
    ctx.lineTo(x - bw * 0.38, footY - h * 0.5);
    ctx.lineTo(x + bw * 0.38, footY - h * 0.5);
    ctx.lineTo(x + bw * 0.6, footY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#b1453b';
    ctx.beginPath();
    ctx.ellipse(x, headY, h * 0.115, h * 0.105, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#b1453b';
    ctx.beginPath();
    ctx.moveTo(x, headY + h * 0.005);
    ctx.quadraticCurveTo(x + h * 0.15, headY + h * 0.06, x + h * 0.29, headY + h * 0.03);
    ctx.quadraticCurveTo(x + h * 0.16, headY + h * 0.12, x, headY + h * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e4dac4';
    ctx.beginPath();
    ctx.arc(x - h * 0.045, headY - h * 0.01, h * 0.022, 0, TAU);
    ctx.arc(x + h * 0.045, headY - h * 0.01, h * 0.022, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#201a16';
    ctx.beginPath();
    ctx.arc(x - h * 0.045, headY - h * 0.01, h * 0.009, 0, TAU);
    ctx.arc(x + h * 0.045, headY - h * 0.01, h * 0.009, 0, TAU);
    ctx.fill();
    // Wings/feathers.
    ctx.fillStyle = '#2f3d2b';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + side * bw * 0.25, footY - h * 0.58);
      ctx.quadraticCurveTo(x + side * bw * 1.3, footY - h * 0.92, x + side * bw * 1.45, footY - h * 0.42);
      ctx.quadraticCurveTo(x + side * bw * 0.95, footY - h * 0.45, x + side * bw * 0.25, footY - h * 0.35);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }

  if (kind === 'ittan') {
    ctx.fillStyle = 'rgba(242,233,210,0.9)';
    ctx.beginPath();
    ctx.moveTo(x - bw * 1.2, footY - h * 0.5);
    ctx.bezierCurveTo(x - bw * 0.7, footY - h * 0.86, x + bw * 0.5, footY - h * 0.78, x + bw * 1.1, footY - h * 0.55);
    ctx.bezierCurveTo(x + bw * 0.6, footY - h * 0.42, x - bw * 0.3, footY - h * 0.3, x - bw * 1.2, footY - h * 0.5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(72,55,36,0.4)';
    ctx.stroke();
    eye(ctx, x - bw * 0.3, footY - h * 0.55, h * 0.015, h * 0.009);
    eye(ctx, x + bw * 0.3, footY - h * 0.56, h * 0.015, h * 0.009);
    return;
  }

  // Default: a shadowy spirit with a mask-like face.
  ctx.fillStyle = 'rgba(55,45,48,0.88)';
  ctx.beginPath();
  ctx.moveTo(x - bw * 0.5, footY);
  ctx.bezierCurveTo(x - bw * 0.8, footY - h * 0.3, x - bw * 0.5, headY + h * 0.06, x, headY + h * 0.05);
  ctx.bezierCurveTo(x + bw * 0.5, headY + h * 0.06, x + bw * 0.8, footY - h * 0.3, x + bw * 0.5, footY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e9dcc4';
  ctx.beginPath();
  ctx.ellipse(x, headY, h * 0.105, h * 0.11, 0, 0, TAU);
  ctx.fill();
  eye(ctx, x - h * 0.038, headY, h * 0.012, h * 0.006);
  eye(ctx, x + h * 0.038, headY, h * 0.012, h * 0.006);
  ctx.strokeStyle = '#6a2a26';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - h * 0.035, headY + h * 0.06);
  ctx.quadraticCurveTo(x, headY + h * 0.075, x + h * 0.035, headY + h * 0.06);
  ctx.stroke();
}

export function drawGenjiLady(ctx, x, footY, h, variant = 0) {
  const palettes = [
    { robe: '#7b4f75', light: '#b68aa9', obi: '#c9a249' },
    { robe: '#3b5b76', light: '#7f9cb0', obi: '#b68a2e' },
    { robe: '#7c3e4f', light: '#c87c86', obi: '#d4b35f' },
    { robe: '#4d624e', light: '#91a183', obi: '#c9a249' },
  ];
  const p = palettes[variant % palettes.length];
  drawBeauty(ctx, x, footY, h, {
    robe: p.robe, light: p.light, robe2: '#3a2638', obi: p.obi, fan: variant % 2 === 0,
  });
  // Junihitoe layers at the hem.
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = ['#c9a249', '#8a4d62', '#4b6a68'][i];
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x - h * 0.16, footY - h * (0.045 + i * 0.02));
    ctx.bezierCurveTo(x - h * 0.32, footY - h * 0.02, x - h * 0.42, footY, x - h * 0.02, footY);
    ctx.stroke();
  }
  if (variant % 3 === 0) {
    ctx.strokeStyle = 'rgba(201,162,73,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x - h * 0.18, footY - h * 0.71, h * 0.045, 0, TAU);
    ctx.stroke();
  }
}

export function drawCranePair(ctx, x, y, s = 1) {
  drawCrane(ctx, x, y, s, '#f7f0df');
  drawCrane(ctx, x + 42 * s, y + 16 * s, s * 0.8, '#e8e2d0');
}
