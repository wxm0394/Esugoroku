// Shared printmaker primitives: washi, bokashi, patterns, landscape furniture.
const TAU = Math.PI * 2;

export const PALETTE = {
  paper: '#efe0bd',
  paperDeep: '#dfc899',
  ink: '#23180f',
  inkSoft: '#5a4530',
  vermilion: '#b23a2b',
  beni: '#c94f3d',
  indigo: '#224f63',
  ai: '#315e78',
  blue: '#5383a6',
  gold: '#b68a2e',
  goldLight: '#e2c46a',
  purple: '#4b2c4d',
  purpleDeep: '#2d1832',
  moss: '#4f6645',
  coral: '#e09879',
  yellow: '#e8b954',
  silver: '#b8b6a8',
  white: '#f7f0df',
};

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function washiPaper(ctx, x, y, w, h, base = PALETTE.paper, options = {}) {
  const rand = rng(hashString(`${options.seed || 1}:${Math.round(w)}:${Math.round(h)}`));
  const grad = ctx.createLinearGradient(x, y, x + w * 0.7, y + h);
  grad.addColorStop(0, options.light || '#f7ebcd');
  grad.addColorStop(0.42, base);
  grad.addColorStop(1, options.deep || '#d8bd8a');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // Long kozo fibres.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let i = 0; i < Math.max(28, (w * h) / 900); i++) {
    const px = x + rand() * w;
    const py = y + rand() * h;
    const len = 3 + rand() * 18;
    const angle = (rand() - 0.5) * 0.35;
    ctx.strokeStyle = rand() > 0.35 ? 'rgba(110,78,42,0.09)' : 'rgba(255,252,236,0.22)';
    ctx.lineWidth = 0.45 + rand() * 0.55;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(
      px + Math.cos(angle) * len * 0.55,
      py + Math.sin(angle) * len * 0.55 + (rand() - 0.5) * 2,
      px + Math.cos(angle) * len,
      py + Math.sin(angle) * len,
    );
    ctx.stroke();
  }
  // Mica dust and old foxing.
  for (let i = 0; i < Math.max(10, (w * h) / 3200); i++) {
    ctx.fillStyle = rand() > 0.7 ? 'rgba(255,250,225,0.6)' : 'rgba(117,78,35,0.12)';
    const r = 0.35 + rand() * 1.1;
    ctx.beginPath();
    ctx.arc(x + rand() * w, y + rand() * h, r, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 5; i++) {
    const sx = x + rand() * w;
    const sy = y + rand() * h;
    const sr = 8 + rand() * 28;
    const stain = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    stain.addColorStop(0, 'rgba(133,91,44,0.045)');
    stain.addColorStop(1, 'rgba(133,91,44,0)');
    ctx.fillStyle = stain;
    ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  }
  ctx.restore();

  if (options.edge !== false) {
    const vg = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.26, x + w / 2, y + h / 2, Math.max(w, h) * 0.73);
    vg.addColorStop(0, 'rgba(70,43,18,0)');
    vg.addColorStop(1, 'rgba(70,43,18,0.16)');
    ctx.fillStyle = vg;
    ctx.fillRect(x, y, w, h);
  }
}

export function bokashi(ctx, x, y, w, h, top, bottom, horizontal = false) {
  const g = horizontal
    ? ctx.createLinearGradient(x, y, x + w, y)
    : ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

export function drawPattern(ctx, kind, x, y, w, h, color = PALETTE.indigo, alpha = 0.22, scale = 18) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 0.8;
  if (kind === 'seigaiha') {
    const step = scale * 1.45;
    for (let row = -1; row * (step * 0.52) < h + step; row++) {
      const yy = y + row * step * 0.52;
      const off = row % 2 ? step / 2 : 0;
      for (let col = -1; x + col * step + off < x + w + step; col++) {
        const xx = x + col * step + off;
        for (let ring = 0; ring < 4; ring++) {
          ctx.beginPath();
          ctx.arc(xx, yy, step * 0.48 - ring * scale * 0.11, Math.PI, TAU);
          ctx.stroke();
        }
      }
    }
  } else if (kind === 'asanoha') {
    const s = scale;
    const hh = s * Math.sqrt(3) / 2;
    for (let row = -1; row * hh < h + hh; row++) {
      for (let col = -1; col * s < w + s; col++) {
        const cx = x + col * s + (row % 2 ? s / 2 : 0);
        const cy = y + row * hh;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = -Math.PI / 2 + (k * TAU) / 6;
          const px = cx + Math.cos(a) * s * 0.53;
          const py = cy + Math.sin(a) * s * 0.53;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        for (let k = 0; k < 6; k++) {
          const a = -Math.PI / 2 + (k * TAU) / 6;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * s * 0.53, cy + Math.sin(a) * s * 0.53);
          ctx.stroke();
        }
      }
    }
  } else if (kind === 'ichimatsu') {
    const s = scale * 1.25;
    for (let row = -1; row * s < h + s; row++) {
      for (let col = -1; col * s < w + s; col++) {
        if ((row + col) % 2 === 0) ctx.fillRect(x + col * s, y + row * s, s, s);
      }
    }
  } else if (kind === 'kikko') {
    const s = scale;
    const hh = s * 0.866;
    for (let row = -1; row * hh < h + hh; row++) {
      for (let col = -1; col * s * 1.5 < w + s * 1.5; col++) {
        const cx = x + col * s * 1.5;
        const cy = y + row * hh * 2 + (col % 2 ? hh : 0);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * TAU) / 6;
          const px = cx + Math.cos(a) * s * 0.52;
          const py = cy + Math.sin(a) * s * 0.52;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
  } else if (kind === 'sayagata') {
    const s = scale;
    for (let row = -1; row * s < h + s; row++) {
      for (let col = -1; col * s < w + s; col++) {
        const cx = x + col * s;
        const cy = y + row * s;
        ctx.beginPath();
        ctx.moveTo(cx, cy + s * 0.5);
        ctx.lineTo(cx + s * 0.5, cy);
        ctx.lineTo(cx + s, cy + s * 0.5);
        ctx.lineTo(cx + s * 0.5, cy + s);
        ctx.closePath();
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

export function drawCloud(ctx, x, y, w, h, color = '#f7f0df', alpha = 0.75) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.58);
  ctx.bezierCurveTo(x - w * 0.07, y + h * 0.25, x + w * 0.1, y + h * 0.02, x + w * 0.26, y + h * 0.28);
  ctx.bezierCurveTo(x + w * 0.33, y - h * 0.13, x + w * 0.52, y - h * 0.08, x + w * 0.55, y + h * 0.24);
  ctx.bezierCurveTo(x + w * 0.7, y + h * 0.05, x + w * 0.92, y + h * 0.18, x + w * 0.86, y + h * 0.48);
  ctx.bezierCurveTo(x + w * 1.05, y + h * 0.55, x + w * 0.98, y + h * 0.9, x + w * 0.79, y + h * 0.87);
  ctx.bezierCurveTo(x + w * 0.65, y + h * 1.05, x + w * 0.44, y + h * 0.99, x + w * 0.39, y + h * 0.82);
  ctx.bezierCurveTo(x + w * 0.22, y + h * 1.02, x + w * 0.04, y + h * 0.88, x, y + h * 0.58);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(44,31,20,0.22)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.restore();
}

export function drawFuji(ctx, cx, baseY, w, h, snow = true) {
  const top = baseY - h;
  const g = ctx.createLinearGradient(cx - w / 2, top, cx + w / 2, baseY);
  g.addColorStop(0, '#4f718a');
  g.addColorStop(0.55, '#7896a4');
  g.addColorStop(1, '#b8c3bb');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.5, baseY);
  ctx.bezierCurveTo(cx - w * 0.34, baseY - h * 0.2, cx - w * 0.16, top + h * 0.2, cx, top);
  ctx.bezierCurveTo(cx + w * 0.16, top + h * 0.2, cx + w * 0.34, baseY - h * 0.2, cx + w * 0.5, baseY);
  ctx.closePath();
  ctx.fill();
  if (snow) {
    ctx.fillStyle = 'rgba(248,244,226,0.92)';
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.bezierCurveTo(cx - w * 0.055, top + h * 0.09, cx - w * 0.15, top + h * 0.24, cx - w * 0.17, top + h * 0.22);
    ctx.lineTo(cx - w * 0.1, top + h * 0.2);
    ctx.lineTo(cx - w * 0.05, top + h * 0.28);
    ctx.lineTo(cx + w * 0.01, top + h * 0.2);
    ctx.lineTo(cx + w * 0.06, top + h * 0.26);
    ctx.lineTo(cx + w * 0.13, top + h * 0.18);
    ctx.bezierCurveTo(cx + w * 0.1, top + h * 0.16, cx + w * 0.055, top + h * 0.07, cx, top);
    ctx.fill();
  }
}

export function drawPine(ctx, x, y, h, lean = 0, color = '#2f4936') {
  ctx.save();
  ctx.strokeStyle = '#4a3323';
  ctx.lineWidth = Math.max(1.5, h * 0.026);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x + lean * 0.2, y - h * 0.3, x + lean * 0.7, y - h * 0.56, x + lean, y - h * 0.78);
  ctx.stroke();
  const clusters = [
    [0.2, 0.35, 0.28], [0.62, 0.52, 0.34], [0.95, 0.72, 0.3],
    [-0.18, 0.58, 0.25], [0.34, 0.78, 0.25],
  ];
  for (const [dx, dy, s] of clusters) {
    const px = x + lean * dx;
    const py = y - h * dy;
    ctx.fillStyle = color;
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU;
      ctx.beginPath();
      ctx.ellipse(px + Math.cos(a) * h * s * 0.35, py + Math.sin(a) * h * s * 0.16,
        h * s * 0.23, h * s * 0.1, a * 0.2, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(20,38,24,0.45)';
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 13; i++) {
      ctx.beginPath();
      ctx.moveTo(px + (i - 6) * h * 0.025, py + h * 0.04);
      ctx.lineTo(px + (i - 6) * h * 0.04, py - h * 0.13 * (0.4 + Math.abs(Math.sin(i))));
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawWaveBand(ctx, x, y, w, h, deep = '#315e78', light = '#f3ead2') {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, deep);
  g.addColorStop(0.55, '#5d8aa2');
  g.addColorStop(1, light);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = 'rgba(247,240,223,0.72)';
  for (let row = 0; row < 4; row++) {
    const yy = y + 4 + row * h * 0.24;
    ctx.lineWidth = 0.8 + row * 0.2;
    ctx.beginPath();
    for (let px = -20; px <= w + 20; px += 2) {
      const py = yy + Math.sin((px + row * 21) * 0.075) * (2 + row * 1.7);
      if (px === -20) ctx.moveTo(x + px, py); else ctx.lineTo(x + px, py);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 7; i++) {
    const px = x + ((i * 73) % w);
    const py = y + h * (0.25 + (i % 3) * 0.16);
    ctx.fillStyle = 'rgba(247,240,223,0.72)';
    ctx.beginPath();
    ctx.arc(px, py, 2 + (i % 3), Math.PI, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px + 5, py + 1, 1.5 + (i % 2), Math.PI, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export function drawRoof(ctx, x, y, w, h, color = '#38484b') {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.08, y + h * 0.25);
  ctx.quadraticCurveTo(x + w * 0.08, y - h * 0.18, x + w * 0.2, y);
  ctx.lineTo(x + w * 0.8, y);
  ctx.quadraticCurveTo(x + w * 0.92, y - h * 0.18, x + w * 1.08, y + h * 0.25);
  ctx.quadraticCurveTo(x + w * 0.8, y + h * 0.08, x + w * 0.5, y + h * 0.1);
  ctx.quadraticCurveTo(x + w * 0.2, y + h * 0.08, x - w * 0.08, y + h * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(12,18,20,0.55)';
  ctx.lineWidth = 0.8;
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    ctx.beginPath();
    ctx.moveTo(x + w * (0.12 + t * 0.76), y + 2);
    ctx.lineTo(x + w * (0.08 + t * 0.84), y + h * 0.16);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(230,224,205,0.24)';
  ctx.fillRect(x + w * 0.18, y + 2, w * 0.64, 2);
}

export function drawTorii(ctx, cx, baseY, w, h, color = '#b23a2b') {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'butt';
  ctx.lineWidth = Math.max(1.8, w * 0.055);
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.42, baseY);
  ctx.lineTo(cx - w * 0.38, baseY - h);
  ctx.moveTo(cx + w * 0.42, baseY);
  ctx.lineTo(cx + w * 0.38, baseY - h);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.52, baseY - h * 0.83);
  ctx.quadraticCurveTo(cx, baseY - h * 0.92, cx + w * 0.52, baseY - h * 0.83);
  ctx.lineTo(cx + w * 0.47, baseY - h * 0.94);
  ctx.quadraticCurveTo(cx, baseY - h * 1.02, cx - w * 0.47, baseY - h * 0.94);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, w * 0.028);
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.33, baseY - h * 0.63);
  ctx.lineTo(cx + w * 0.33, baseY - h * 0.63);
  ctx.stroke();
}

export function drawLantern(ctx, x, y, w, h, glow = false) {
  if (glow) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, w * 1.8);
    g.addColorStop(0, 'rgba(240,194,95,0.4)');
    g.addColorStop(1, 'rgba(240,194,95,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - w * 2, y - w * 2, w * 4, w * 4);
  }
  ctx.fillStyle = '#e6d8b3';
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.5, h * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(110,74,38,0.5)';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.abs(i) * w * 0.12 + 0.5, h * 0.5, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(x - w * 0.22, y - h * 0.54, w * 0.44, h * 0.08);
  ctx.fillRect(x - w * 0.22, y + h * 0.46, w * 0.44, h * 0.08);
  ctx.strokeStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.moveTo(x, y - h * 0.54);
  ctx.lineTo(x, y - h * 0.85);
  ctx.stroke();
}

export function drawSeal(ctx, cx, cy, r, text, color = PALETTE.vermilion, fontSize = r * 0.82, ring = true) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  if (ring) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,244,216,0.8)';
    ctx.lineWidth = Math.max(0.7, r * 0.09);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, TAU);
    ctx.stroke();
  }
  ctx.fillStyle = '#f7e9c6';
  ctx.font = `700 ${fontSize}px "Yuji Syuku","Shippori Mincho B1",serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, r * 0.03);
  ctx.restore();
}

export function drawKomae(ctx, cx, cy, r, variant = 0, ink = PALETTE.ink) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.clip();
  ctx.fillStyle = '#efe1bd';
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  if (variant % 4 === 0) {
    bokashi(ctx, cx - r, cy - r, r * 2, r * 1.1, '#6a8fa5', '#d8d4b9');
    drawFuji(ctx, cx, cy + r * 0.28, r * 1.5, r * 1.05);
    drawCloud(ctx, cx - r * 0.8, cy - r * 0.55, r * 1.1, r * 0.35);
  } else if (variant % 4 === 1) {
    bokashi(ctx, cx - r, cy - r, r * 2, r * 2, '#9bb6bc', '#e7d7af');
    drawWaveBand(ctx, cx - r, cy + r * 0.12, r * 2, r * 0.9, '#315e78');
    drawTorii(ctx, cx, cy + r * 0.15, r * 1.15, r * 1.25);
  } else if (variant % 4 === 2) {
    bokashi(ctx, cx - r, cy - r, r * 2, r * 2, '#c9b375', '#ede0bb');
    ctx.fillStyle = '#f4e9c8';
    ctx.beginPath();
    ctx.arc(cx + r * 0.3, cy - r * 0.22, r * 0.3, 0, TAU);
    ctx.fill();
    drawPine(ctx, cx - r * 0.45, cy + r * 0.85, r * 1.25, r * 0.35);
    ctx.strokeStyle = 'rgba(35,24,15,0.5)';
    ctx.beginPath();
    ctx.moveTo(cx - r, cy + r * 0.55);
    ctx.lineTo(cx + r, cy + r * 0.55);
    ctx.stroke();
  } else {
    bokashi(ctx, cx - r, cy - r, r * 2, r * 2, '#b6ad84', '#efe1bd');
    ctx.strokeStyle = '#6b4d30';
    ctx.lineWidth = r * 0.18;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.8, cy + r * 0.4);
    ctx.quadraticCurveTo(cx, cy - r * 0.45, cx + r * 0.8, cy + r * 0.4);
    ctx.stroke();
    ctx.strokeStyle = '#8e6b42';
    ctx.lineWidth = r * 0.06;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * r * 0.25, cy + r * 0.08);
      ctx.lineTo(cx + i * r * 0.25, cy + r * 0.9);
      ctx.stroke();
    }
    drawPine(ctx, cx + r * 0.75, cy + r * 0.6, r * 0.85, -r * 0.2);
  }
  // Print-registration ring and old ink edge.
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(0.7, r * 0.07);
  ctx.beginPath();
  ctx.arc(cx, cy, r - 0.5, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(178,58,43,0.55)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 2.4, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

export function goldFleck(ctx, x, y, w, h, seed = 3, count = 42) {
  const rand = rng(hashString(`${seed}:gold`));
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rand() > 0.45 ? 'rgba(226,196,106,0.55)' : 'rgba(255,244,197,0.38)';
    ctx.beginPath();
    ctx.ellipse(x + rand() * w, y + rand() * h, 0.7 + rand() * 2.4, 0.4 + rand() * 1.2, rand() * TAU, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export function bambooGrain(ctx, x, y, w, h, seed = 1) {
  const rand = rng(hashString(`bamboo:${seed}`));
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let i = 0; i < 18; i++) {
    const yy = y + rand() * h;
    ctx.strokeStyle = rand() > 0.5 ? 'rgba(236,214,156,0.12)' : 'rgba(33,22,13,0.2)';
    ctx.lineWidth = 0.8 + rand() * 2;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.bezierCurveTo(x + w * 0.3, yy + (rand() - 0.5) * 16, x + w * 0.7, yy + (rand() - 0.5) * 16, x + w, yy + (rand() - 0.5) * 10);
    ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const px = x + rand() * w;
    const py = y + rand() * h;
    ctx.strokeStyle = 'rgba(30,20,12,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(px, py, 3 + rand() * 5, 1 + rand() * 2, rand() * TAU, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawCrane(ctx, x, y, s = 1, color = '#f7f0df') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(40,28,18,0.35)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-18, -12, -38, -4, -48, 8);
  ctx.bezierCurveTo(-28, 7, -11, 10, 0, 21);
  ctx.bezierCurveTo(6, 10, 17, 4, 30, 4);
  ctx.bezierCurveTo(22, -4, 11, -5, 0, 0);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 8, 14, 7, -0.2, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = PALETTE.vermilion;
  ctx.beginPath();
  ctx.arc(17, 1, 2.2, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#9d3b2c';
  ctx.beginPath();
  ctx.moveTo(14, 3);
  ctx.lineTo(26, 7);
  ctx.stroke();
  ctx.restore();
}

export function drawBamboo(ctx, x, baseY, h, color = '#4f6645') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.lineWidth = 1.6 + i * 0.6;
    const dx = i * 8;
    ctx.beginPath();
    ctx.moveTo(x + dx, baseY);
    ctx.quadraticCurveTo(x + dx - 3, baseY - h * 0.55, x + dx + 5, baseY - h);
    ctx.stroke();
    for (let leaf = 0; leaf < 4; leaf++) {
      const ly = baseY - h * (0.45 + leaf * 0.13);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x + dx + (leaf % 2 ? 12 : -10), ly, 12, 3, leaf % 2 ? -0.55 : 0.55, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}
