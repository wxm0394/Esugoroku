// Authentic Edo Nishiki-e (錦絵) Woodblock Engraving Texture Generator
// Produces high-resolution carved woodblock print canvases for 3D board tiles, board center crests, and gallery cards.

const TAU = Math.PI * 2;

export const UKIYOE_INK = {
  sumi: '#18110c',
  sumiSoft: '#2e2219',
  washi: '#f1e3c3',
  washiAged: '#e3cfa3',
  washiDark: '#cbb27d',
  beroAiDeep: '#102e4a',
  beroAiMid: '#235378',
  beroAiLight: '#5a8aa8',
  vermilion: '#bf3426',
  vermilionDeep: '#871f15',
  beni: '#d45745',
  ukonGold: '#c99733',
  goldBright: '#e5be62',
  rokusho: '#336854',
  rokushoLight: '#68997d',
  murasaki: '#4b2a59',
  murasakiLight: '#7b528c',
};

function hashSeed(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seedStr) {
  let s = hashSeed(seedStr) || 123456789;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// Stage 1: Mulberry Washi Paper + Woodblock Baren Grain
export function paintWashiGround(ctx, w, h, baseColor = UKIYOE_INK.washi, seed = 'washi') {
  const rand = makeRng(seed);
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, w, h);

  // Subtle warm edge aging
  const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.15, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
  vg.addColorStop(0, 'rgba(255,249,232,0.18)');
  vg.addColorStop(1, 'rgba(128,92,44,0.22)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // Horizontal woodblock grain & baren rubbing marks
  ctx.save();
  ctx.strokeStyle = 'rgba(72,49,26,0.055)';
  ctx.lineWidth = 1;
  for (let y = 3; y < h; y += 5) {
    ctx.beginPath();
    ctx.moveTo(0, y + (rand() - 0.5) * 2);
    ctx.bezierCurveTo(w * 0.33, y + (rand() - 0.5) * 4, w * 0.66, y + (rand() - 0.5) * 4, w, y + (rand() - 0.5) * 2);
    ctx.stroke();
  }
  // Fine mineral & gold-leaf flecks
  for (let i = 0; i < 42; i++) {
    const fx = rand() * w;
    const fy = rand() * h;
    const r = 0.6 + rand() * 1.6;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(212,168,72,0.25)' : 'rgba(68,46,24,0.08)';
    ctx.fillRect(fx, fy, r, r);
  }
  ctx.restore();
}

// Stage 2: Authentic Bokashi (hand-wiped pigment gradation)
export function paintBokashi(ctx, x, y, w, h, topColor, midColor, bottomColor) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, topColor);
  g.addColorStop(0.48, midColor);
  g.addColorStop(1, bottomColor);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

// Suyari-gasumi: Traditional horizontal woodblock cloud bands with sumi keyline
export function drawSuyariMist(ctx, cx, cy, bandW, bandH, fill = 'rgba(244,232,202,0.88)', stroke = UKIYOE_INK.sumiSoft) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1.5, bandH * 0.08);
  const r = bandH * 0.48;
  ctx.beginPath();
  ctx.moveTo(cx - bandW * 0.45, cy - r);
  ctx.lineTo(cx + bandW * 0.45, cy - r);
  ctx.arc(cx + bandW * 0.45, cy, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(cx - bandW * 0.45, cy + r);
  ctx.arc(cx - bandW * 0.45, cy, r, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Sacred Mount Fuji with snow ridges and carved sumi keylines
export function drawWoodcutFuji(ctx, cx, baseY, width, height, redFuji = false) {
  ctx.save();
  const topY = baseY - height;
  const summitW = width * 0.17;

  const g = ctx.createLinearGradient(cx, topY, cx, baseY);
  if (redFuji) {
    g.addColorStop(0, '#f6efe0');
    g.addColorStop(0.24, '#b83d2b');
    g.addColorStop(0.68, '#83291d');
    g.addColorStop(1, '#334854');
  } else {
    g.addColorStop(0, '#f7f2e6');
    g.addColorStop(0.26, '#e7e2d3');
    g.addColorStop(0.32, UKIYOE_INK.beroAiMid);
    g.addColorStop(0.75, UKIYOE_INK.beroAiDeep);
    g.addColorStop(1, '#1c2b38');
  }

  ctx.beginPath();
  ctx.moveTo(cx - width * 0.52, baseY);
  ctx.quadraticCurveTo(cx - width * 0.22, baseY - height * 0.34, cx - summitW * 0.5, topY);
  ctx.lineTo(cx - summitW * 0.16, topY + height * 0.03);
  ctx.lineTo(cx + summitW * 0.14, topY - height * 0.01);
  ctx.lineTo(cx + summitW * 0.5, topY + height * 0.02);
  ctx.quadraticCurveTo(cx + width * 0.22, baseY - height * 0.34, cx + width * 0.52, baseY);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();

  // Snow cap jagged fingers (carved woodcut style)
  ctx.fillStyle = '#faf5e8';
  ctx.beginPath();
  ctx.moveTo(cx - summitW * 0.5, topY);
  ctx.lineTo(cx + summitW * 0.5, topY + height * 0.02);
  ctx.lineTo(cx + width * 0.16, topY + height * 0.32);
  ctx.lineTo(cx + width * 0.08, topY + height * 0.23);
  ctx.lineTo(cx + width * 0.03, topY + height * 0.36);
  ctx.lineTo(cx - width * 0.02, topY + height * 0.24);
  ctx.lineTo(cx - width * 0.08, topY + height * 0.34);
  ctx.lineTo(cx - width * 0.15, topY + height * 0.27);
  ctx.closePath();
  ctx.fill();

  // Sumi keyblock outline & volcanic ridge lines
  ctx.strokeStyle = UKIYOE_INK.sumi;
  ctx.lineWidth = Math.max(2.2, width * 0.012);
  ctx.beginPath();
  ctx.moveTo(cx - width * 0.52, baseY);
  ctx.quadraticCurveTo(cx - width * 0.22, baseY - height * 0.34, cx - summitW * 0.5, topY);
  ctx.lineTo(cx - summitW * 0.16, topY + height * 0.03);
  ctx.lineTo(cx + summitW * 0.14, topY - height * 0.01);
  ctx.lineTo(cx + summitW * 0.5, topY + height * 0.02);
  ctx.quadraticCurveTo(cx + width * 0.22, baseY - height * 0.34, cx + width * 0.52, baseY);
  ctx.stroke();

  // Interior ridge striations
  ctx.lineWidth = Math.max(1.2, width * 0.005);
  ctx.strokeStyle = 'rgba(24,17,12,0.55)';
  for (const offset of [-0.14, -0.05, 0.06, 0.15]) {
    ctx.beginPath();
    ctx.moveTo(cx + width * offset * 0.35, topY + height * 0.26);
    ctx.quadraticCurveTo(cx + width * offset * 0.8, topY + height * 0.58, cx + width * offset * 1.4, baseY - height * 0.08);
    ctx.stroke();
  }
  ctx.restore();
}

// Hokusai / Hiroshige Engraved Wave Crest with Prussian Blue Stripes & Foam Claws
export function drawUkiyoeWaves(ctx, x, y, w, h, rows = 3) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  const bg = ctx.createLinearGradient(x, y, x, y + h);
  bg.addColorStop(0, UKIYOE_INK.beroAiLight);
  bg.addColorStop(0.5, UKIYOE_INK.beroAiMid);
  bg.addColorStop(1, UKIYOE_INK.beroAiDeep);
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);

  const crestSpan = w / 2.4;
  for (let r = 0; r < rows; r++) {
    const ry = y + (r + 0.35) * (h / rows);
    for (let c = -1; c < 4; c++) {
      const cx = x + c * crestSpan + (r % 2) * (crestSpan * 0.48);
      // Swelling wave body
      ctx.fillStyle = r % 2 === 0 ? UKIYOE_INK.beroAiDeep : UKIYOE_INK.beroAiMid;
      ctx.strokeStyle = UKIYOE_INK.sumi;
      ctx.lineWidth = Math.max(1.8, w * 0.006);
      ctx.beginPath();
      ctx.moveTo(cx, ry + h * 0.35);
      ctx.bezierCurveTo(cx + crestSpan * 0.2, ry - h * 0.22, cx + crestSpan * 0.65, ry - h * 0.24, cx + crestSpan, ry + h * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // White woodblock foam crest curls
      ctx.fillStyle = '#f8f1df';
      for (let k = 0; k < 4; k++) {
        const fx = cx + crestSpan * (0.24 + k * 0.15);
        const fy = ry - h * 0.08 + Math.sin(k) * 4;
        ctx.beginPath();
        ctx.arc(fx, fy, Math.max(4, w * 0.022), Math.PI * 0.8, Math.PI * 2.15);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

// Crooked Edo Black Pine (Matsu) with fan-shaped needle clusters
export function drawWoodcutPine(ctx, x, baseY, scale = 1) {
  ctx.save();
  ctx.translate(x, baseY);
  ctx.scale(scale, scale);

  // Gnarled trunk with sumi outline
  ctx.fillStyle = '#4e3524';
  ctx.strokeStyle = UKIYOE_INK.sumi;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.bezierCurveTo(-12, -32, 10, -56, -4, -92);
  ctx.lineTo(8, -92);
  ctx.bezierCurveTo(22, -54, 2, -30, 8, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Needles in layered ukiyo-e fan pads
  const pads = [
    { cx: -24, cy: -68, rx: 28, ry: 13 },
    { cx: 22, cy: -76, rx: 30, ry: 14 },
    { cx: -2, cy: -98, rx: 34, ry: 15 },
  ];
  for (const p of pads) {
    ctx.fillStyle = UKIYOE_INK.rokusho;
    ctx.beginPath();
    ctx.ellipse(p.cx, p.cy, p.rx, p.ry, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Radiating pine needle strokes
    ctx.strokeStyle = '#182c23';
    ctx.lineWidth = 1.2;
    for (let a = -5; a <= 5; a++) {
      const ang = -Math.PI / 2 + a * 0.22;
      ctx.beginPath();
      ctx.moveTo(p.cx, p.cy - 2);
      ctx.lineTo(p.cx + Math.cos(ang) * p.rx * 0.9, p.cy + Math.sin(ang) * p.ry * 0.95);
      ctx.stroke();
    }
    ctx.strokeStyle = UKIYOE_INK.sumi;
    ctx.lineWidth = 2.0;
  }
  ctx.restore();
}

// Traditional Vermilion Torii Gate with Kasagi beam
export function drawWoodcutTorii(ctx, cx, baseY, w, h) {
  ctx.save();
  const topY = baseY - h;
  const colOff = w * 0.32;
  const colW = Math.max(6, w * 0.085);

  ctx.fillStyle = UKIYOE_INK.vermilion;
  ctx.strokeStyle = UKIYOE_INK.sumi;
  ctx.lineWidth = Math.max(2, w * 0.018);

  // Two pillars with black base shoes
  for (const s of [-1, 1]) {
    const px = cx + s * colOff - colW / 2;
    ctx.fillStyle = UKIYOE_INK.vermilion;
    ctx.fillRect(px, topY + h * 0.1, colW, h * 0.9);
    ctx.strokeRect(px, topY + h * 0.1, colW, h * 0.9);
    ctx.fillStyle = UKIYOE_INK.sumi;
    ctx.fillRect(px - 2, baseY - h * 0.14, colW + 4, h * 0.14);
  }

  // Nuki lower tie-beam
  ctx.fillStyle = UKIYOE_INK.vermilion;
  ctx.fillRect(cx - w * 0.44, topY + h * 0.26, w * 0.88, h * 0.08);
  ctx.strokeRect(cx - w * 0.44, topY + h * 0.26, w * 0.88, h * 0.08);

  // Curved Kasagi top lintel with upturned tips
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.54, topY + h * 0.04);
  ctx.quadraticCurveTo(cx, topY + h * 0.14, cx + w * 0.54, topY + h * 0.04);
  ctx.lineTo(cx + w * 0.5, topY + h * 0.16);
  ctx.quadraticCurveTo(cx, topY + h * 0.22, cx - w * 0.5, topY + h * 0.16);
  ctx.closePath();
  ctx.fillStyle = UKIYOE_INK.vermilion;
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = UKIYOE_INK.sumi;
  ctx.fillRect(cx - w * 0.52, topY + h * 0.01, w * 1.04, h * 0.045);
  ctx.restore();
}

// Expressive Edo Figures in Woodcut Style (Traveler, Samurai, Yokai, Court Noble)
export function drawWoodcutFigure(ctx, cx, baseY, scale, role = 'traveler', variant = 0) {
  ctx.save();
  ctx.translate(cx, baseY);
  ctx.scale(scale, scale);
  ctx.strokeStyle = UKIYOE_INK.sumi;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';

  if (role === 'traveler') {
    // Flowing kimono & striped haori cloak
    ctx.fillStyle = variant % 2 === 0 ? UKIYOE_INK.beroAiMid : '#7a3528';
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.lineTo(-16, -54);
    ctx.quadraticCurveTo(0, -64, 16, -54);
    ctx.lineTo(24, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Obi sash
    ctx.fillStyle = UKIYOE_INK.ukonGold;
    ctx.fillRect(-15, -34, 30, 9);
    ctx.strokeRect(-15, -34, 30, 9);

    // Head
    ctx.fillStyle = '#f5dec0';
    ctx.beginPath();
    ctx.arc(0, -66, 11, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // Woven Sugegasa conical sedge hat with bamboo ribs
    ctx.fillStyle = '#e2c583';
    ctx.beginPath();
    ctx.moveTo(-34, -68);
    ctx.quadraticCurveTo(0, -92, 34, -68);
    ctx.quadraticCurveTo(0, -62, -34, -68);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Walking staff
    ctx.strokeStyle = '#3b2516';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(22, -62);
    ctx.lineTo(28, 2);
    ctx.stroke();
  } else if (role === 'warrior') {
    // Ornate Yoroi Samurai Armor + Jinbaori surcoat
    ctx.fillStyle = variant % 2 === 0 ? UKIYOE_INK.vermilion : UKIYOE_INK.beroAiDeep;
    ctx.beginPath();
    ctx.moveTo(-28, 0);
    ctx.lineTo(-22, -56);
    ctx.lineTo(22, -56);
    ctx.lineTo(28, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Gold armor lacing (odoshi)
    ctx.strokeStyle = UKIYOE_INK.goldBright;
    ctx.lineWidth = 2;
    for (let y = -46; y <= -14; y += 10) {
      ctx.beginPath();
      ctx.moveTo(-20, y);
      ctx.lineTo(20, y);
      ctx.stroke();
    }

    // Face & Kabuto helmet with golden crescent Kuwagata horns
    ctx.strokeStyle = UKIYOE_INK.sumi;
    ctx.lineWidth = 2.4;
    ctx.fillStyle = '#f2d8b8';
    ctx.beginPath();
    ctx.arc(0, -68, 11, 0, TAU);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = UKIYOE_INK.sumi;
    ctx.beginPath();
    ctx.arc(0, -72, 14, Math.PI, TAU);
    ctx.fill();
    ctx.stroke();

    // Golden Kuwagata horns
    ctx.fillStyle = UKIYOE_INK.goldBright;
    ctx.beginPath();
    ctx.moveTo(0, -76);
    ctx.quadraticCurveTo(-24, -84, -30, -104);
    ctx.quadraticCurveTo(-14, -86, -4, -80);
    ctx.lineTo(4, -80);
    ctx.quadraticCurveTo(14, -86, 30, -104);
    ctx.quadraticCurveTo(24, -84, 0, -76);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (role === 'yokai') {
    // Kuniyoshi / Toriyama Sekien Spectre (Tengu / Kitsune / Oni silhouette with foxfire)
    ctx.fillStyle = variant % 2 === 0 ? UKIYOE_INK.murasaki : '#1f3d47';
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.bezierCurveTo(-32, -38, -14, -64, 0, -68);
    ctx.bezierCurveTo(14, -64, 32, -38, 26, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Kitsune / Oni mask head
    ctx.fillStyle = '#f7efe0';
    ctx.beginPath();
    ctx.moveTo(0, -92);
    ctx.lineTo(-16, -66);
    ctx.lineTo(0, -54);
    ctx.lineTo(16, -66);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glowing vermilion eyes & kitsune-bi blue flames
    ctx.fillStyle = UKIYOE_INK.vermilion;
    ctx.beginPath();
    ctx.arc(-6, -68, 2.6, 0, TAU);
    ctx.arc(6, -68, 2.6, 0, TAU);
    ctx.fill();

    for (const fx of [-32, 32]) {
      ctx.fillStyle = '#6ad4e8';
      ctx.beginPath();
      ctx.moveTo(fx, -44);
      ctx.quadraticCurveTo(fx - 8, -56, fx, -70);
      ctx.quadraticCurveTo(fx + 8, -56, fx, -44);
      ctx.fill();
      ctx.stroke();
    }
  } else {
    // Heian Court Noble / Princess in Twelve-Layered Juni-hitoe Robes
    ctx.fillStyle = variant % 2 === 0 ? UKIYOE_INK.vermilion : UKIYOE_INK.murasaki;
    ctx.beginPath();
    ctx.moveTo(-34, 0);
    ctx.quadraticCurveTo(-24, -52, 0, -58);
    ctx.quadraticCurveTo(24, -52, 34, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Gold brocade collar layers
    ctx.strokeStyle = UKIYOE_INK.goldBright;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, -56);
    ctx.lineTo(0, -32);
    ctx.lineTo(10, -56);
    ctx.stroke();

    // Flowing black court hair & golden folding fan (Ogi)
    ctx.strokeStyle = UKIYOE_INK.sumi;
    ctx.lineWidth = 2.2;
    ctx.fillStyle = '#f8e6ce';
    ctx.beginPath();
    ctx.arc(0, -68, 10, 0, TAU);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = UKIYOE_INK.sumi;
    ctx.beginPath();
    ctx.arc(0, -70, 12, Math.PI * 0.85, Math.PI * 2.15);
    ctx.fill();

    // Golden folding fan
    ctx.fillStyle = UKIYOE_INK.goldBright;
    ctx.beginPath();
    ctx.moveTo(8, -36);
    ctx.arc(8, -36, 20, -Math.PI * 0.75, -Math.PI * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// Master Scene Renderer used by both 3D Tiles and 2D Gallery Cards
export function renderNishikieScene(ctx, boardId, node, w, h) {
  const art = node?.art || 'nihonbashi';
  const id = node?.id ?? 0;
  const kind = node?.kind || 'normal';

  paintWashiGround(ctx, w, h, UKIYOE_INK.washi, `${boardId}-${art}-${id}`);

  if (boardId === 'tokaido') {
    paintBokashi(ctx, 0, 0, w, h * 0.65, UKIYOE_INK.beroAiDeep, UKIYOE_INK.beroAiLight, UKIYOE_INK.washiAged);
    // Warm horizon glow
    ctx.fillStyle = 'rgba(232,168,96,0.32)';
    ctx.fillRect(0, h * 0.42, w, h * 0.24);

    // Sacred Mt Fuji in background
    drawWoodcutFuji(ctx, w * (0.42 + (id % 3) * 0.08), h * 0.64, w * 0.68, h * 0.42, kind === 'goal' || id === 14);
    drawSuyariMist(ctx, w * 0.32, h * 0.34, w * 0.48, h * 0.07);
    drawSuyariMist(ctx, w * 0.68, h * 0.48, w * 0.42, h * 0.065);

    // Coastal waves or post-road ground
    if (id % 2 === 1 || art === 'nihonbashi') {
      drawUkiyoeWaves(ctx, 0, h * 0.62, w, h * 0.38, 2);
    } else {
      ctx.fillStyle = '#c5ab76';
      ctx.fillRect(0, h * 0.62, w, h * 0.38);
    }

    drawWoodcutPine(ctx, w * 0.18, h * 0.78, Math.min(w, h) / 230);
    if (kind === 'goal' || kind === 'start' || id % 3 === 0) {
      drawWoodcutTorii(ctx, w * 0.64, h * 0.76, w * 0.28, h * 0.36);
    }
    drawWoodcutFigure(ctx, w * 0.44, h * 0.84, Math.min(w, h) / 210, kind === 'goal' ? 'noble' : 'traveler', id);
  } else if (boardId === 'yokai') {
    paintBokashi(ctx, 0, 0, w, h, '#0b1826', '#1c344a', '#2c2233');
    // Full moon / crescent moon
    ctx.fillStyle = '#f6e7b8';
    ctx.beginPath();
    ctx.arc(w * 0.32, h * 0.28, Math.min(w, h) * 0.15, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = UKIYOE_INK.sumi;
    ctx.lineWidth = 2;
    ctx.stroke();

    drawSuyariMist(ctx, w * 0.48, h * 0.32, w * 0.56, h * 0.065, 'rgba(42,32,54,0.82)', '#8b6d9c');
    drawUkiyoeWaves(ctx, 0, h * 0.66, w, h * 0.34, 2);
    drawWoodcutTorii(ctx, w * 0.25, h * 0.78, w * 0.26, h * 0.34);
    drawWoodcutFigure(ctx, w * 0.52, h * 0.84, Math.min(w, h) / 200, 'yokai', id);
  } else if (boardId === 'kesshu') {
    paintBokashi(ctx, 0, 0, w, h * 0.68, '#4a1b18', '#963828', '#e6c994');
    drawWoodcutFuji(ctx, w * 0.38, h * 0.66, w * 0.65, h * 0.40, true);
    drawSuyariMist(ctx, w * 0.52, h * 0.36, w * 0.55, h * 0.068, 'rgba(245,225,182,0.88)');
    ctx.fillStyle = '#bda06c';
    ctx.fillRect(0, h * 0.64, w, h * 0.36);
    drawWoodcutPine(ctx, w * 0.20, h * 0.78, Math.min(w, h) / 220);
    drawWoodcutFigure(ctx, w * 0.48, h * 0.85, Math.min(w, h) / 195, 'warrior', id);
  } else {
    // Genji court split-track
    const isEvil = kind === 'evil';
    paintBokashi(
      ctx, 0, 0, w, h,
      isEvil ? '#261730' : '#6e501e',
      isEvil ? '#4d2e5e' : '#b88c38',
      '#f0dfc0',
    );
    // Golden Byobu cloud bands
    drawSuyariMist(ctx, w * 0.36, h * 0.28, w * 0.54, h * 0.08, 'rgba(236,204,124,0.9)', '#78561c');
    drawSuyariMist(ctx, w * 0.62, h * 0.46, w * 0.50, h * 0.08, 'rgba(236,204,124,0.9)', '#78561c');
    drawUkiyoeWaves(ctx, 0, h * 0.68, w, h * 0.32, 2);
    drawWoodcutFigure(ctx, w * 0.46, h * 0.84, Math.min(w, h) / 200, 'noble', id);
  }
}

function getKindMeta(node) {
  switch (node.kind) {
    case 'start':
      return { badge: '振出', label: '起点・旅立ち', color: '#bf3426' };
    case 'goal':
      return { badge: '上り', label: '大上り・終着', color: '#b8861b' };
    case 'jump': {
      const d = node.jumpTable ? node.jumpTable[0] : 2;
      return { badge: `跳${d >= 0 ? '+' + d : d}`, label: `名物跳び (${d >= 0 ? '+' + d : d}格)`, color: '#bf3426' };
    }
    case 'stay':
      return { badge: '泊', label: '宿場泊・一休み', color: '#9e261b' };
    case 'branch':
      return { badge: '分岐', label: '偶＝善道 / 奇＝悪道', color: '#5c3373' };
    case 'good':
      return { badge: '善', label: '善玉雅道 (偶の目)', color: '#a87b1e' };
    case 'evil':
      return { badge: '悪', label: '悪玉修羅道 (奇の目)', color: '#512863' };
    default:
      if (node.tokens) {
        return { badge: '備', label: `討入備え獲得`, color: '#b53324' };
      }
      return { badge: String(node.id), label: node.rule || '道中を進める', color: '#2b4a63' };
  }
}

// Builds a high-contrast, ultra-legible 3D Tile Top Texture
export function create3DTileCanvas(board, node) {
  const isGoal = node.kind === 'goal';
  const w = isGoal ? 768 : 512;
  const h = isGoal ? 640 : 420;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  renderNishikieScene(ctx, board.id, node, w, h);

  const meta = getKindMeta(node);

  // Double woodblock keyline border around the entire print
  ctx.strokeStyle = UKIYOE_INK.sumi;
  ctx.lineWidth = isGoal ? 10 : 8;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.strokeStyle = meta.color;
  ctx.lineWidth = isGoal ? 4 : 3;
  ctx.strokeRect(16, 16, w - 32, h - 32);

  // Top-Left Large Step Number & Role Seal (Never tiny!)
  const sealR = isGoal ? 48 : 38;
  const sealX = 28 + sealR;
  const sealY = 28 + sealR;
  ctx.save();
  ctx.fillStyle = meta.color;
  ctx.strokeStyle = '#f8eed3';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(sealX, sealY, sealR, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fff9eb';
  ctx.font = `700 ${isGoal ? 34 : 28}px "Shippori Mincho B1", "Hiragino Mincho ProN", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(meta.badge, sealX, sealY + 2);
  ctx.restore();

  // Right-side Large Vertical Tanzaku Cartouche (Title Banner)
  const cartW = isGoal ? 116 : 92;
  const cartH = h - (isGoal ? 124 : 104);
  const cartX = w - cartW - 22;
  const cartY = 22;

  ctx.save();
  ctx.fillStyle = 'rgba(250, 241, 218, 0.95)';
  ctx.strokeStyle = UKIYOE_INK.sumi;
  ctx.lineWidth = 4;
  ctx.fillRect(cartX, cartY, cartW, cartH);
  ctx.strokeRect(cartX, cartY, cartW, cartH);

  ctx.strokeStyle = meta.color;
  ctx.lineWidth = 2;
  ctx.strokeRect(cartX + 6, cartY + 6, cartW - 12, cartH - 12);

  // Draw vertical characters cleanly scaled to fit
  const chars = Array.from(node.title || '');
  const maxFont = isGoal ? 46 : 40;
  const availH = cartH - 28;
  const stepY = Math.min(maxFont + 6, availH / Math.max(1, chars.length));
  const fontSize = Math.max(22, Math.min(maxFont, stepY * 0.88));
  ctx.fillStyle = UKIYOE_INK.sumi;
  ctx.font = `800 ${Math.round(fontSize)}px "Shippori Mincho B1", "Noto Serif SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const startY = cartY + (cartH - (chars.length - 1) * stepY) / 2;
  chars.forEach((ch, idx) => {
    ctx.fillText(ch, cartX + cartW / 2, startY + idx * stepY);
  });
  ctx.restore();

  // Bottom High-Contrast Rule Banner (Large readable text!)
  const barH = isGoal ? 74 : 62;
  const barY = h - barH - 16;
  ctx.save();
  ctx.fillStyle = 'rgba(22, 16, 12, 0.90)';
  ctx.fillRect(18, barY, w - 36, barH);
  ctx.strokeStyle = UKIYOE_INK.goldBright;
  ctx.lineWidth = 2;
  ctx.strokeRect(18, barY, w - 36, barH);

  ctx.fillStyle = '#ffefc7';
  const ruleText = `#${node.id}  ${node.rule || meta.label}`;
  ctx.font = `700 ${isGoal ? 30 : 25}px "Shippori Mincho B1", "Noto Serif SC", serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(ruleText, 34, barY + barH / 2 + 1, w - 68);
  ctx.restore();

  return canvas;
}
