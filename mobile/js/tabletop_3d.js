// Three.js 3D Tabletop Engine for E-Sugoroku (江戸浮世絵・立体絵双六)
// Implements raised 3D woodblock print tiles, composite Kokeshi pawns with step-by-step hopping,
// true 3D bone dice with inset spherical pips inside a porcelain chawan bowl, and preview arcs.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BOARDS } from './boards.js';
import { EsugorokuCore, computeDieTargetEulerYXZ, DIE_LOCAL_NORMALS } from './core.js';
import { G, currentBoard } from './state.js';
import { create3DTileCanvas, createBoardBroadsheetCanvas, preloadUkiyoeSheets, UKIYOE_INK } from './nishikie_woodblock.js';

const SCALE = 0.048; // 800x640 logical board -> 38.4 x 30.72 world units (large grand tabletop)
const BOARD_W = 800 * SCALE;
const BOARD_D = 640 * SCALE;

// Reusable math objects (zero GC in render loop)
const _vec3 = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _faceNorm = new THREE.Vector3();
const _quatTarget = new THREE.Quaternion();
const _quatSpin = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();

export function logicalToWorld(lx, ly) {
  return {
    x: (lx - 400) * SCALE,
    z: (ly - 320) * SCALE,
  };
}

export function nodeWorldCenter(node) {
  const cx = node.x + node.w * 0.5;
  const cy = node.y + node.h * 0.5;
  const w = logicalToWorld(cx, cy);
  const isGoal = node.kind === 'goal';
  const tileH = isGoal ? 0.58 : (node.kind === 'start' || node.kind === 'jump' || node.kind === 'stay' ? 0.42 : 0.32);
  return { x: w.x, y: tileH, z: w.z };
}

// Rotations that place face `value` (1..6) pointing straight UP (+Y) for any yaw angle.
// Face mapping on BoxGeometry:
// +X (right): 2, -X (left): 5, +Y (top): 1, -Y (bottom): 6, +Z (front): 3, -Z (back): 4
export function getDieFaceUpEuler(value, yaw = 0) {
  const t = computeDieTargetEulerYXZ(value, yaw);
  return new THREE.Euler(t.rx, t.ry, t.rz, 'YXZ');
}

function createDieFaceTexture(faceValue) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');

  // Warm carved bone/ivory surface with subtle bevel frame
  const g = ctx.createRadialGradient(size * 0.4, size * 0.38, 12, size * 0.5, size * 0.5, size * 0.72);
  g.addColorStop(0, '#fffdf6');
  g.addColorStop(0.7, '#f5ebd1');
  g.addColorStop(1, '#d8c398');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#8c6f41';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, size - 10, size - 10);

  // Pip layout in normalized [0..1] coordinates
  const layouts = {
    1: [[0.5, 0.5]],
    2: [[0.28, 0.28], [0.72, 0.72]],
    3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
    5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
    6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
  };

  const pips = layouts[faceValue] || layouts[1];
  for (const [px, py] of pips) {
    const cx = px * size;
    const cy = py * size;
    const r = faceValue === 1 ? size * 0.175 : size * 0.095;

    // Recessed shadow rim
    ctx.fillStyle = 'rgba(40,24,12,0.28)';
    ctx.beginPath();
    ctx.arc(cx + 2, cy + 3, r * 1.06, 0, Math.PI * 2);
    ctx.fill();

    // Main pip pigment (Traditional Japanese Sai: 1 is large Vermilion, 2-6 are Sumi ink)
    const pg = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.1, cx, cy, r);
    if (faceValue === 1) {
      pg.addColorStop(0, '#ee4635');
      pg.addColorStop(0.65, '#c42416');
      pg.addColorStop(1, '#7a1108');
    } else {
      pg.addColorStop(0, '#3a2d24');
      pg.addColorStop(0.6, '#18120e');
      pg.addColorStop(1, '#090705');
    }
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTextSprite(text, bgColor = '#bf3426', borderColor = '#f5dc98', scaleW = 2.6, scaleH = 0.85) {
  const c = document.createElement('canvas');
  c.width = 420;
  c.height = 108;
  const ctx = c.getContext('2d');

  ctx.fillStyle = bgColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(8, 8, c.width - 16, c.height - 16, 22);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fff9ec';
  ctx.font = '800 42px "Shippori Mincho B1", "Noto Serif SC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + 2, c.width - 36);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scaleW, scaleH, 1);
  sprite.renderOrder = 25;
  return sprite;
}

function createTatamiTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4e5438';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(220,205,152,0.08)';
  ctx.lineWidth = 2;
  for (let y = 0; y < 512; y += 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  // Brocade Heri border
  ctx.fillStyle = '#261b16';
  ctx.fillRect(0, 0, 512, 24);
  ctx.fillRect(0, 488, 512, 24);
  ctx.strokeStyle = '#b88e3a';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, 508, 20);
  ctx.strokeRect(2, 490, 508, 20);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

function createSoulWispTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');

  // Ethereal Hitodama ("魂") soul flame with bright core and wispy corona
  const g = ctx.createRadialGradient(size * 0.5, size * 0.56, 4, size * 0.5, size * 0.5, size * 0.48);
  g.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  g.addColorStop(0.28, 'rgba(255, 248, 225, 0.92)');
  g.addColorStop(0.62, 'rgba(255, 255, 255, 0.42)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(size * 0.5, size * 0.5, size * 0.48, 0, Math.PI * 2);
  ctx.fill();

  // Upward flame tail
  const tg = ctx.createLinearGradient(size * 0.5, size * 0.65, size * 0.5, size * 0.06);
  tg.addColorStop(0, 'rgba(255,255,255,0.75)');
  tg.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(size * 0.28, size * 0.56);
  ctx.quadraticCurveTo(size * 0.5, size * 0.02, size * 0.72, size * 0.56);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Procedural 4-Variant High-Definition Sumi-e & Woodblock Ink Splatter Textures ("墨点溅射 / 水墨飛沫・木版墨滲み")
// Variant 0: 濃墨飛沫・滲み環 (Concentrated Sumi Splash + Capillary Nijimi Water-Bleed Ring + Radial Shibuki Droplets)
// Variant 1: 破墨暈染・重墨 (Haboku Wet-on-Wet Multi-Layered Ink Bloom with Fibrous Washi Feathering)
// Variant 2: 飛白刷毛飛沫 (Kasure High-Velocity Dry-Brush Directional Slash & Comet Streaks)
// Variant 3: 朱墨印泥飛沫 (Baren Woodblock Seal-Ink Cluster with Stippled Grain & Satellite Blots)
function createSumieSplatterTextures() {
  const size = 256;
  const cx = size * 0.5;
  const cy = size * 0.5;
  const textures = [];

  for (let variant = 0; variant < 4; variant++) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');

    let seed = (0x6d2b79f5 ^ (variant * 0x9e3779b9)) >>> 0;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    // 1. Outer Nijimi (滲み) capillary paper-fiber water-bleed halo
    const haloGrad = ctx.createRadialGradient(cx, cy, size * 0.08, cx, cy, size * 0.46);
    haloGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.92)');
    haloGrad.addColorStop(0.42, 'rgba(245, 240, 232, 0.68)');
    // Characteristic sumi-e nijimi dark-rim ring where pigment collects at the moisture boundary
    haloGrad.addColorStop(0.64, 'rgba(255, 255, 255, 0.54)');
    haloGrad.addColorStop(0.82, 'rgba(235, 228, 218, 0.22)');
    haloGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    const haloPts = 48;
    for (let i = 0; i <= haloPts; i++) {
      const a = (i / haloPts) * Math.PI * 2;
      const wobble =
        1.0 +
        Math.sin(a * (5 + variant * 2) + variant) * 0.14 +
        Math.cos(a * (9 + variant) - variant * 1.7) * 0.09 +
        (rand() - 0.5) * 0.08;
      const r = size * (variant === 2 ? 0.36 : 0.41) * wobble;
      const stretchX = variant === 2 ? 1.22 : 1.0;
      const stretchY = variant === 2 ? 0.78 : 1.0;
      const px = cx + Math.cos(a) * r * stretchX;
      const py = cy + Math.sin(a) * r * stretchY;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // 2. Feathered Mulberry Washi Capillary Whiskers (楮繊維の墨滲み毛細血管)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)';
    ctx.lineCap = 'round';
    const whiskerCount = 44 + variant * 8;
    for (let i = 0; i < whiskerCount; i++) {
      const a = (i / whiskerCount) * Math.PI * 2 + (rand() - 0.5) * 0.16;
      const r0 = size * (0.14 + rand() * 0.14);
      const r1 = r0 + size * (0.06 + rand() * 0.15);
      ctx.lineWidth = 1.2 + rand() * 2.4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      const midA = a + (rand() - 0.5) * 0.24;
      const rMid = (r0 + r1) * 0.5;
      ctx.quadraticCurveTo(
        cx + Math.cos(midA) * rMid,
        cy + Math.sin(midA) * rMid,
        cx + Math.cos(a) * r1,
        cy + Math.sin(a) * r1,
      );
      ctx.stroke();
    }

    // 3. Dense Central Sumi-e Core (濃墨核) with organic brush-impact lobes
    ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
    ctx.beginPath();
    const corePts = 36;
    for (let i = 0; i <= corePts; i++) {
      const a = (i / corePts) * Math.PI * 2;
      const lobe =
        1.0 +
        Math.sin(a * (4 + variant) + 0.6) * 0.18 +
        Math.cos(a * (7 + variant * 2)) * 0.12 +
        (rand() - 0.5) * 0.1;
      const baseR = size * (variant === 1 ? 0.25 : variant === 2 ? 0.21 : 0.23) * lobe;
      const sx = variant === 2 ? 1.32 : 1.0;
      const sy = variant === 2 ? 0.68 : 1.0;
      const px = cx + Math.cos(a) * baseR * sx;
      const py = cy + Math.sin(a) * baseR * sy;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // 4. Radial Shibuki (飛沫) High-Velocity Teardrop Splatter Streaks & Micro-Droplets
    const dropletCount = variant === 2 ? 38 : 30;
    for (let i = 0; i < dropletCount; i++) {
      const a = (i / dropletCount) * Math.PI * 2 + (rand() - 0.5) * 0.28;
      const dist = size * (0.21 + rand() * 0.25);
      const dropR = size * (0.014 + rand() * 0.036);
      const dx = cx + Math.cos(a) * dist;
      const dy = cy + Math.sin(a) * dist;

      // Teardrop tail connecting toward the core
      ctx.fillStyle = `rgba(255, 255, 255, ${(0.65 + rand() * 0.33).toFixed(2)})`;
      ctx.beginPath();
      const tailDist = Math.max(size * 0.12, dist - dropR * (2.4 + rand() * 2.2));
      const tx = cx + Math.cos(a) * tailDist;
      const ty = cy + Math.sin(a) * tailDist;
      const nx = -Math.sin(a) * dropR * 0.85;
      const ny = Math.cos(a) * dropR * 0.85;
      ctx.moveTo(tx, ty);
      ctx.lineTo(dx + nx, dy + ny);
      ctx.arc(dx, dy, dropR, a + Math.PI * 0.5, a - Math.PI * 0.5, false);
      ctx.closePath();
      ctx.fill();

      // Secondary fine mist dot beyond the primary droplet
      if (i % 2 === 0) {
        const mistDist = Math.min(size * 0.48, dist + dropR * (1.8 + rand() * 2.0));
        const mistR = dropR * (0.35 + rand() * 0.35);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a + 0.05) * mistDist, cy + Math.sin(a + 0.05) * mistDist, mistR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 5. Kasure (飛白) & Washi Paper-Grain Stipple Cavities for authentic woodblock texture
    ctx.globalCompositeOperation = 'destination-out';
    const grainHoles = variant === 2 ? 42 : 26;
    for (let i = 0; i < grainHoles; i++) {
      const a = rand() * Math.PI * 2;
      const d = size * (0.08 + rand() * 0.32);
      const gx = cx + Math.cos(a) * d;
      const gy = cy + Math.sin(a) * d;
      ctx.fillStyle = `rgba(0, 0, 0, ${(0.18 + rand() * 0.32).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(
        gx,
        gy,
        1.2 + rand() * (variant === 2 ? 9.5 : 3.8),
        1.0 + rand() * 2.2,
        a + (variant === 2 ? 0 : Math.PI * 0.5),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    textures.push(tex);
  }

  return textures;
}

function createCurvedWallPatchGeometry(width = 1.15, height = 0.92, wallRadius = 2.64, segW = 10, segH = 6) {
  const geo = new THREE.PlaneGeometry(width, height, segW, segH);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // Bend horizontal X along cylindrical arc of radius wallRadius so it hugs the concave inner bowl wall
    const theta = x / wallRadius;
    const curvedX = Math.sin(theta) * wallRadius;
    const curvedZ = (1.0 - Math.cos(theta)) * wallRadius + (y * 0.24);
    pos.setXYZ(i, curvedX, y, curvedZ);
  }
  geo.computeVertexNormals();
  return geo;
}


// Procedural Edo-period Hosho-gami / Washi Mulberry Paper Texture for Post-Processing Overlay
// Channels:
//   R = Criss-crossing Kozo mulberry bark fibers (楮繊維) + micro-grain
//   G = Circular Baren (馬連) bamboo-pad woodblock rubbing spiral tracks
//   B = Horizontal Sujime (簀の目) laid screen lines + warm aged parchment mottling
function createWashiPaperTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');

  const img = ctx.createImageData(size, size);
  const data = img.data;

  // Deterministic PRNG so paper texture is crisp and consistent
  let seed = 0x5f3759df;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Base multi-frequency paper grain, Baren spiral waves (G), and Sujime bamboo screen lines (B)
  for (let y = 0; y < size; y++) {
    const ny = (y / size) * Math.PI * 2;
    // Horizontal laid bamboo screen lines (簀の目) every ~4px + vertical chain line (桁) every 64px
    const sujime = Math.sin((y / size) * Math.PI * 128) * 0.5 + 0.5;
    for (let x = 0; x < size; x++) {
      const nx = (x / size) * Math.PI * 2;
      const idx = (y * size + x) * 4;

      // Fine organic mulberry grain (tileable via sin/cos harmonics + micro noise)
      const grain =
        Math.sin(nx * 7 + Math.cos(ny * 5)) * 0.18 +
        Math.cos(ny * 11 - Math.sin(nx * 9)) * 0.16 +
        (rand() - 0.5) * 0.24;

      // Circular Baren (馬連) rubbing spiral rings across the print sheet
      const bx1 = ((x + 96) % 256) - 128;
      const by1 = ((y + 64) % 256) - 128;
      const r1 = Math.hypot(bx1, by1);
      const ang1 = Math.atan2(by1, bx1);
      const baren1 = Math.sin(r1 * 0.34 + ang1 * 2.0) * Math.exp(-r1 * 0.008);

      const bx2 = ((x + 210) % 256) - 128;
      const by2 = ((y + 190) % 256) - 128;
      const r2 = Math.hypot(bx2, by2);
      const ang2 = Math.atan2(by2, bx2);
      const baren2 = Math.cos(r2 * 0.29 - ang2 * 3.0) * Math.exp(-r2 * 0.008);

      const barenVal = 128 + (baren1 + baren2) * 38 + (rand() - 0.5) * 18;

      // Aged Hosho-gami mottling + Sujime screen lines + vertical Keta chain line
      const keta = Math.pow(Math.max(0, Math.cos((x / size) * Math.PI * 16)), 14) * 18;
      const mottle =
        Math.sin(nx * 2 + 0.7) * Math.cos(ny * 2 + 1.3) * 20 +
        Math.sin(nx * 5 - ny * 3) * 12;
      const sujimeVal = 128 + (sujime - 0.5) * 28 + keta + mottle;

      data[idx] = Math.max(0, Math.min(255, Math.round(128 + grain * 95)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round(barenVal)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.round(sujimeVal)));
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Draw long curved Kozo mulberry fibers (楮の繊維) into R/G channels via additive/subtractive strokes
  ctx.lineCap = 'round';
  for (let i = 0; i < 680; i++) {
    const x0 = rand() * size;
    const y0 = rand() * size;
    const len = 14 + rand() * 38;
    const angle = rand() * Math.PI * 2;
    const bend = (rand() - 0.5) * 18;
    const x1 = x0 + Math.cos(angle) * len;
    const y1 = y0 + Math.sin(angle) * len;
    const cx = (x0 + x1) * 0.5 - Math.sin(angle) * bend;
    const cy = (y0 + y1) * 0.5 + Math.cos(angle) * bend;

    const bright = i % 3 !== 0;
    ctx.strokeStyle = bright
      ? `rgba(245, 220, 195, ${(0.06 + rand() * 0.09).toFixed(3)})`
      : `rgba(48, 32, 18, ${(0.05 + rand() * 0.07).toFixed(3)})`;
    ctx.lineWidth = 0.65 + rand() * 1.35;

    // Wrap across tile boundaries for seamless repeat
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        if (x0 + ox < -50 || x0 + ox > size + 50 || y0 + oy < -50 || y0 + oy > size + 50) continue;
        ctx.beginPath();
        ctx.moveTo(x0 + ox, y0 + oy);
        ctx.quadraticCurveTo(cx + ox, cy + oy, x1 + ox, y1 + oy);
        ctx.stroke();
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Custom Three.js Post-Processing Shader: Ukiyo-e Woodblock Print Filter (浮世絵木版画シェーダー)
// Combines:
//  1. 3x3 Sobel Depth + Luminance/Chromaticity Edge Detection for hand-carved Sumi-ink key-block outlines (墨線輪郭検出)
//  2. Edo Nishiki-e stepped woodblock pigment quantization & Bokashi grading (木版色摺り・ぼかし階層化)
//  3. Multi-channel Hosho-gami mulberry paper fibers + Baren circular rubbing overlay (奉書紙・馬連肌理オーバーレイ)
const UkiyoeWoodblockShader = {
  name: 'UkiyoeWoodblockShader',
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tPaper: { value: null },
    uResolution: { value: new THREE.Vector2(1280, 800) },
    uCameraNear: { value: 0.5 },
    uCameraFar: { value: 180.0 },
    uExposure: { value: 1.12 },
    uEnabled: { value: 1.0 },
    uMode: { value: 0 }, // 0 = 錦絵版画 (Nishiki-e), 1 = 墨摺重墨 (Sumi-zuri-e), 2 = 原画3D (Off)
    uInkStrength: { value: 0.92 },
    uPaperStrength: { value: 0.86 },
    uPosterizeLevels: { value: 11.0 },
    uOutlineScale: { value: 1.12 },
    uPaperScale: { value: new THREE.Vector2(3.4, 2.2) },
    uInkColor: { value: new THREE.Color('#160f0a') },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2D tPaper;
    uniform vec2 uResolution;
    uniform float uCameraNear;
    uniform float uCameraFar;
    uniform float uExposure;
    uniform float uEnabled;
    uniform int uMode;
    uniform float uInkStrength;
    uniform float uPaperStrength;
    uniform float uPosterizeLevels;
    uniform float uOutlineScale;
    uniform vec2 uPaperScale;
    uniform vec3 uInkColor;

    varying vec2 vUv;

    vec3 acesFilmic(vec3 x) {
      x *= uExposure;
      const float a = 2.51;
      const float b = 0.03;
      const float c = 2.43;
      const float d = 0.59;
      const float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    vec3 linearToSrgb(vec3 lin) {
      vec3 c = max(lin, vec3(0.0));
      return mix(
        c * 12.92,
        1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
        step(vec3(0.0031308), c)
      );
    }

    vec3 sampleSceneSrgb(vec2 uv) {
      vec3 raw = texture2D(tDiffuse, uv).rgb;
      return linearToSrgb(acesFilmic(raw));
    }

    float getLuma(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    float readLinearDepth(vec2 uv) {
      float z_b = texture2D(tDepth, uv).r;
      float z_n = 2.0 * z_b - 1.0;
      float viewZ = (2.0 * uCameraNear * uCameraFar) / (uCameraFar + uCameraNear - z_n * (uCameraFar - uCameraNear));
      return clamp((viewZ - uCameraNear) / (uCameraFar - uCameraNear), 0.0, 1.0);
    }

    void main() {
      vec3 baseCol = sampleSceneSrgb(vUv);

      // Raw 3D passthrough mode
      if (uEnabled < 0.5 || uMode == 2) {
        gl_FragColor = vec4(baseCol, 1.0);
        return;
      }

      // Sample procedural Hosho-gami Washi paper texture (tiled at physical screen aspect)
      vec4 paper = texture2D(tPaper, vUv * uPaperScale);
      float kozoFiber = paper.r - 0.5;   // Mulberry bark fiber relief (-0.5..0.5)
      float barenRub  = paper.g - 0.5;   // Circular Baren rubbing tracks (-0.5..0.5)
      float sujimeScreen = paper.b - 0.5; // Laid bamboo screen + aged mottling (-0.5..0.5)

      // 1. 3x3 Sobel Edge Detection on both Hardware Depth (3D silhouettes) and Color/Luminance (interior carving lines)
      vec2 texel = (uOutlineScale / max(uResolution, vec2(1.0)));
      // Subtle woodblock chisel / fiber wobble along UV for hand-carved omohan key-block feel
      vec2 uvJit = vUv + vec2(kozoFiber, barenRub) * texel * 0.28;

      float d00 = readLinearDepth(uvJit + texel * vec2(-1.0, -1.0));
      float d10 = readLinearDepth(uvJit + texel * vec2( 0.0, -1.0));
      float d20 = readLinearDepth(uvJit + texel * vec2( 1.0, -1.0));
      float d01 = readLinearDepth(uvJit + texel * vec2(-1.0,  0.0));
      float d11 = readLinearDepth(uvJit);
      float d21 = readLinearDepth(uvJit + texel * vec2( 1.0,  0.0));
      float d02 = readLinearDepth(uvJit + texel * vec2(-1.0,  1.0));
      float d12 = readLinearDepth(uvJit + texel * vec2( 0.0,  1.0));
      float d22 = readLinearDepth(uvJit + texel * vec2( 1.0,  1.0));

      float depthGx = -d00 - 2.0 * d01 - d02 + d20 + 2.0 * d21 + d22;
      float depthGy = -d00 - 2.0 * d10 - d20 + d02 + 2.0 * d12 + d22;
      // Scale depth gradient & second-order crease Laplacian by distance so 3D tiles, pawns, bowl & die get crisp outlines
      float distNorm = max(0.08, d11 * 0.82);
      float depthGrad = length(vec2(depthGx, depthGy)) / distNorm;
      float depthCrease = abs((d10 + d01 + d21 + d12) - 4.0 * d11) * 6.5 / distNorm;

      vec3 c00 = sampleSceneSrgb(uvJit + texel * vec2(-1.0, -1.0));
      vec3 c10 = sampleSceneSrgb(uvJit + texel * vec2( 0.0, -1.0));
      vec3 c20 = sampleSceneSrgb(uvJit + texel * vec2( 1.0, -1.0));
      vec3 c01 = sampleSceneSrgb(uvJit + texel * vec2(-1.0,  0.0));
      vec3 c21 = sampleSceneSrgb(uvJit + texel * vec2( 1.0,  0.0));
      vec3 c02 = sampleSceneSrgb(uvJit + texel * vec2(-1.0,  1.0));
      vec3 c12 = sampleSceneSrgb(uvJit + texel * vec2( 0.0,  1.0));
      vec3 c22 = sampleSceneSrgb(uvJit + texel * vec2( 1.0,  1.0));

      vec3 colGx = -c00 - 2.0 * c01 - c02 + c20 + 2.0 * c21 + c22;
      vec3 colGy = -c00 - 2.0 * c10 - c20 + c02 + 2.0 * c12 + c22;
      float lumaGx = getLuma(colGx);
      float lumaGy = getLuma(colGy);
      float chromaGrad = (length(colGx) + length(colGy)) * 0.24;
      float colorGrad = length(vec2(lumaGx, lumaGy)) * 0.76 + chromaGrad;

      // Modulate edge threshold with Washi paper grain for authentic brush/carving kasure (かすれ)
      float brushRoughness = kozoFiber * 0.055 + barenRub * 0.035;
      float depthInk = smoothstep(0.018 + brushRoughness, 0.082 + brushRoughness, max(depthGrad, depthCrease));
      float colorInkWeight = (uMode == 1) ? 0.56 : 0.34;
      float colorInk = smoothstep(0.58 + brushRoughness, 1.38 + brushRoughness, colorGrad) * colorInkWeight;

      float modeInkBoost = (uMode == 1) ? 1.22 : 1.0;
      float inkEdge = clamp(max(depthInk, colorInk) * uInkStrength * modeInkBoost, 0.0, 1.0);

      // 2. Woodblock Print Flattening & Stepped Pigment Quantization (木版画の平面摺り階層化)
      // Preserve razor-sharp interior calligraphy while flattening 3D lighting gradients into woodblock layers
      float fineDetailMask = clamp(colorGrad * 0.75, 0.0, 1.0);
      vec3 smoothed = mix(baseCol * 0.54 + (c10 + c01 + c21 + c12) * 0.115, baseCol, fineDetailMask);
      float luma = getLuma(smoothed);
      float levels = (uMode == 1) ? max(5.0, uPosterizeLevels - 3.5) : uPosterizeLevels;
      float qLuma = (floor(luma * levels + 0.5 + kozoFiber * 0.16) / levels);
      vec3 chroma = smoothed / max(luma, 0.001);
      float quantStrength = mix(0.58, 0.16, fineDetailMask);
      vec3 posterized = clamp(chroma * mix(luma, qLuma, quantStrength), 0.0, 1.0);
      vec3 woodblockCol = mix(baseCol, posterized, 0.62);

      if (uMode == 1) {
        // Mode 1: 墨摺絵・紅摺絵 (Sumi-zuri-e / Beni-zuri-e classic Edo woodblock palette)
        float redAccent = clamp((woodblockCol.r - max(woodblockCol.g, woodblockCol.b)) * 2.4, 0.0, 1.0);
        float blueAccent = clamp((woodblockCol.b - woodblockCol.r) * 1.9, 0.0, 1.0);
        vec3 sumiPaperTone = mix(vec3(0.11, 0.08, 0.06), vec3(0.95, 0.89, 0.76), smoothstep(0.04, 0.92, luma));
        vec3 beniTone = vec3(0.82, 0.22, 0.15) * (0.45 + 0.55 * luma);
        vec3 aiTone = vec3(0.14, 0.28, 0.42) * (0.4 + 0.6 * luma);
        woodblockCol = mix(sumiPaperTone, beniTone, redAccent * 0.78);
        woodblockCol = mix(woodblockCol, aiTone, blueAccent * 0.65);
      } else {
        // Mode 0: 錦絵版画 (Full Nishiki-e polychrome woodblock print)
        // Warm Hosho-gami ivory highlight tint & Prussian blue / Vermilion woodblock pigment richness
        vec3 hoshoWarmth = vec3(1.02, 0.975, 0.905);
        woodblockCol = clamp(woodblockCol * hoshoWarmth, 0.0, 1.0);
      }

      // 3. Paper Texture Overlay (奉書紙の楮繊維・簀の目・馬連摺り跡オーバーレイ)
      float pStr = uPaperStrength * ((uMode == 1) ? 1.15 : 1.0);
      // Warm antique Washi paper base absorption
      vec3 paperTint = vec3(0.99, 0.958, 0.895) + vec3(0.045, 0.036, 0.022) * sujimeScreen;
      woodblockCol *= mix(vec3(1.0), paperTint, pStr * 0.65);

      // Mulberry fiber & Baren circular rubbing relief (soft-light + dry-brush kasure in dark pigments)
      float fiberRelief = (kozoFiber * 0.095 + barenRub * 0.075 + sujimeScreen * 0.045) * pStr;
      // Kasure (かすれ): on dark woodblock areas, low-pressure Baren troughs reveal tiny flecks of warm Washi paper
      float kasure = smoothstep(0.16, 0.42, -barenRub - kozoFiber * 0.6) * (1.0 - luma) * 0.14 * pStr;
      woodblockCol = clamp(woodblockCol + vec3(fiberRelief) + vec3(0.94, 0.88, 0.75) * kasure, 0.0, 1.0);

      // Subtle Edo woodblock margin Bokashi (周囲の古紙ぼかし)
      vec2 edgeDist = abs(vUv - 0.5) * 2.0;
      float frameVig = smoothstep(0.76, 1.05, max(edgeDist.x * 0.92, edgeDist.y));
      woodblockCol = mix(woodblockCol, woodblockCol * vec3(0.86, 0.80, 0.68), frameVig * 0.35 * pStr);

      // 4. Composite Hand-Carved Sumi-Ink Key-Block Outlines (主版の墨線摺り重ね)
      // Dry paper fibers slightly modulate deep sumi ink density for organic print realism
      vec3 finalInkColor = uInkColor + vec3(0.08, 0.06, 0.04) * clamp(kozoFiber + 0.2, 0.0, 1.0);
      vec3 finalCol = mix(woodblockCol, finalInkColor, inkEdge);

      gl_FragColor = vec4(finalCol, 1.0);
    }
  `,
};

export class Tabletop3D {
  constructor(mountEl, onTileHover, onTileClick, onBowlClick) {
    this.mountEl = mountEl;
    this.onTileHover = onTileHover;
    this.onTileClick = onTileClick;
    this.onBowlClick = onBowlClick;

    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.mountEl.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#14100d');
    this.scene.fog = new THREE.FogExp2('#14100d', 0.011);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.5, 180);
    this.camera.position.set(3.4, 38.2, 26.2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.minPolarAngle = Math.PI * 0.05;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 68;
    this.controls.target.set(3.4, -0.9, 1.5);
    this.controls.update();

    this.cameraPreset = 'tabletop';
    this.presetTransition = null;
    this.controls.addEventListener('start', () => {
      this.presetTransition = null;
    });

    this.boardGroup = new THREE.Group();
    this.tileMeshes = [];
    this.pickableMeshes = [];
    this.previewGroup = new THREE.Group();
    this.ripples = [];
    this.regaliaMeshes = [];
    this.lanternMeshes = [];
    this.builtBoardIdx = -1;
    this.lastPreviewKey = '';

    this.setupLights();
    this.setupTableEnvironment();
    this.setupPawns();
    this.setupDiceBowlAndDie();
    this.scene.add(this.boardGroup);
    this.scene.add(this.previewGroup);

    this.setupPostProcessing();
    this.setupInteraction();
    window.addEventListener('resize', () => this.onResize());
    preloadUkiyoeSheets(() => {
      if (this.builtBoardIdx >= 0) {
        this.buildBoard(this.builtBoardIdx);
      }
    });
  }

  setupPostProcessing() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = this.renderer.getPixelRatio();
    const rtWidth = Math.max(1, Math.floor(width * pixelRatio));
    const rtHeight = Math.max(1, Math.floor(height * pixelRatio));

    const makeDepthTarget = name => {
      const rt = new THREE.WebGLRenderTarget(rtWidth, rtHeight, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
      });
      rt.texture.name = name;
      rt.depthTexture = new THREE.DepthTexture(rtWidth, rtHeight);
      rt.depthTexture.format = THREE.DepthFormat;
      rt.depthTexture.type = THREE.UnsignedIntType;
      return rt;
    };

    const rt1 = makeDepthTarget('UkiyoeComposer.rt1');
    this.composer = new EffectComposer(this.renderer, rt1);
    // Ensure both ping-pong buffers have their own hardware depthTexture attached
    if (!this.composer.renderTarget2.depthTexture) {
      this.composer.renderTarget2.depthTexture = new THREE.DepthTexture(rtWidth, rtHeight);
      this.composer.renderTarget2.depthTexture.format = THREE.DepthFormat;
      this.composer.renderTarget2.depthTexture.type = THREE.UnsignedIntType;
    }

    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.washiPaperTex = createWashiPaperTexture();
    this.ukiyoePass = new ShaderPass(UkiyoeWoodblockShader);
    this.ukiyoePass.uniforms.tPaper.value = this.washiPaperTex;
    this.ukiyoePass.uniforms.uResolution.value.set(rtWidth, rtHeight);
    this.ukiyoePass.uniforms.uCameraNear.value = this.camera.near;
    this.ukiyoePass.uniforms.uCameraFar.value = this.camera.far;
    this.ukiyoePass.uniforms.uExposure.value = this.renderer.toneMappingExposure;
    this.ukiyoePass.uniforms.uPaperScale.value.set((width / 420) * 1.15, (height / 420) * 1.15);

    // Bind the active readBuffer's depthTexture right before UkiyoePass executes each frame
    const origPassRender = this.ukiyoePass.render.bind(this.ukiyoePass);
    this.ukiyoePass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
      this.ukiyoePass.uniforms.tDepth.value = readBuffer.depthTexture;
      origPassRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    };

    this.composer.addPass(this.ukiyoePass);
    this.ukiyoeFilterMode = 'nishikie'; // 'nishikie' | 'sumizuri' | 'off'
  }

  setUkiyoeFilterMode(mode) {
    const valid = ['nishikie', 'sumizuri', 'off'];
    const next = valid.includes(mode) ? mode : 'nishikie';
    this.ukiyoeFilterMode = next;
    if (this.ukiyoePass) {
      if (next === 'nishikie') {
        this.ukiyoePass.uniforms.uEnabled.value = 1.0;
        this.ukiyoePass.uniforms.uMode.value = 0;
        this.ukiyoePass.uniforms.uInkStrength.value = 0.92;
        this.ukiyoePass.uniforms.uPaperStrength.value = 0.86;
        this.ukiyoePass.uniforms.uPosterizeLevels.value = 11.0;
      } else if (next === 'sumizuri') {
        this.ukiyoePass.uniforms.uEnabled.value = 1.0;
        this.ukiyoePass.uniforms.uMode.value = 1;
        this.ukiyoePass.uniforms.uInkStrength.value = 1.0;
        this.ukiyoePass.uniforms.uPaperStrength.value = 0.96;
        this.ukiyoePass.uniforms.uPosterizeLevels.value = 7.5;
      } else {
        this.ukiyoePass.uniforms.uEnabled.value = 0.0;
        this.ukiyoePass.uniforms.uMode.value = 2;
      }
    }
    return this.getUkiyoeFilterStats();
  }

  cycleUkiyoeFilterMode() {
    const order = ['nishikie', 'sumizuri', 'off'];
    const idx = order.indexOf(this.ukiyoeFilterMode);
    const next = order[(idx + 1) % order.length];
    return this.setUkiyoeFilterMode(next);
  }

  getUkiyoeFilterStats() {
    const u = this.ukiyoePass ? this.ukiyoePass.uniforms : null;
    return {
      enabled: this.ukiyoeFilterMode !== 'off',
      mode: this.ukiyoeFilterMode,
      shaderName: UkiyoeWoodblockShader.name,
      edgeDetection: 'sobel-depth-luminance-3x3',
      paperOverlay: 'hosho-washi-kozo-baren-512',
      inkStrength: u ? Number(u.uInkStrength.value.toFixed(2)) : 0,
      paperStrength: u ? Number(u.uPaperStrength.value.toFixed(2)) : 0,
      posterizeLevels: u ? Number(u.uPosterizeLevels.value.toFixed(1)) : 0,
      hasDepthTexture: Boolean(this.composer?.renderTarget1?.depthTexture && this.composer?.renderTarget2?.depthTexture),
      hasPaperTexture: Boolean(this.washiPaperTex),
    };
  }

  setupLights() {
    const hemi = new THREE.HemisphereLight('#fff2d6', '#2b3a4a', 0.85);
    hemi.position.set(0, 40, 0);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#ffebd0', 1.65);
    keyLight.position.set(16, 36, 22);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -26;
    keyLight.shadow.camera.right = 26;
    keyLight.shadow.camera.top = 22;
    keyLight.shadow.camera.bottom = -22;
    keyLight.shadow.camera.near = 8;
    keyLight.shadow.camera.far = 75;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#8cb8d9', 0.55);
    rimLight.position.set(-22, 20, -18);
    this.scene.add(rimLight);
  }

  setupTableEnvironment() {
    const tableGroup = new THREE.Group();

    // Tatami room floor
    const tatamiMat = new THREE.MeshStandardMaterial({
      map: createTatamiTexture(),
      roughness: 0.82,
      metalness: 0.05,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), tatamiMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.65;
    floor.receiveShadow = true;
    tableGroup.add(floor);

    // Raised Urushi Lacquer Tabletop Platform
    const lacquerMat = new THREE.MeshStandardMaterial({
      color: '#1e1410',
      roughness: 0.24,
      metalness: 0.18,
    });
    const tableBase = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W + 3.2, 0.9, BOARD_D + 3.2), lacquerMat);
    tableBase.position.set(0, -0.45, 0);
    tableBase.receiveShadow = true;
    tableGroup.add(tableBase);

    // Gold-brass rim frame around the board
    const brassMat = new THREE.MeshStandardMaterial({
      color: '#c49a45',
      roughness: 0.28,
      metalness: 0.82,
    });
    const rimThickness = 0.42;
    const rimH = 0.36;
    const nRim = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W + 2.2, rimH, rimThickness), brassMat);
    nRim.position.set(0, 0.08, -(BOARD_D * 0.5 + 0.85));
    const sRim = nRim.clone();
    sRim.position.z = BOARD_D * 0.5 + 0.85;
    const wRim = new THREE.Mesh(new THREE.BoxGeometry(rimThickness, rimH, BOARD_D + 2.2), brassMat);
    wRim.position.set(-(BOARD_W * 0.5 + 0.85), 0.08, 0);
    const eRim = wRim.clone();
    eRim.position.x = BOARD_W * 0.5 + 0.85;
    tableGroup.add(nRim, sRim, wRim, eRim);

    this.scene.add(tableGroup);
  }

  setupPawns() {
    this.pawns = [
      this.createKokeshiPawn(0, '#c83223', '#f5cb5c', '旅人・壱'),
      this.createKokeshiPawn(1, '#1d5478', '#d9e6f2', '白狐・弐'),
      this.createKokeshiPawn(2, '#2e6f40', '#e9f5d8', '武者・参'),
      this.createKokeshiPawn(3, '#8a3ab9', '#f3e1fa', '姫・肆'),
    ];
    this.pawns.forEach((p, idx) => {
      p.visible = idx < 2;
      this.scene.add(p);
    });

    // Active Turn Woodblock Seal Spotlight Halo Ring beneath the active player's 3D Kokeshi pawn
    const haloGroup = new THREE.Group();
    this.activeTurnHaloMat = new THREE.MeshBasicMaterial({
      color: '#f5cb5c',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const outerRing = new THREE.Mesh(new THREE.RingGeometry(0.84, 1.12, 32), this.activeTurnHaloMat);
    outerRing.rotation.x = -Math.PI / 2;
    haloGroup.add(outerRing);

    this.activeTurnInnerMat = new THREE.MeshBasicMaterial({
      color: '#d93829',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
    });
    const innerDisc = new THREE.Mesh(new THREE.CircleGeometry(0.82, 32), this.activeTurnInnerMat);
    innerDisc.rotation.x = -Math.PI / 2;
    innerDisc.position.y = -0.01;
    haloGroup.add(innerDisc);

    this.scene.add(haloGroup);
    this.activeTurnHalo = haloGroup;

    // 3D Page-Turn Wave state ("画帖めくり・手番交代")
    this.turnTransition3D = {
      active: false,
      age: 0,
      duration: 0.68,
      fromSide: 0,
      toSide: 0,
      count: 0,
    };
  }

  // Composite 8-part 3D Traveller Pawn (THREE.Group)
  createKokeshiPawn(side, primaryHex, accentHex, labelText) {
    const group = new THREE.Group();

    // 1. Soft radial contact shadow disc
    const shadowGeo = new THREE.CircleGeometry(0.75, 24);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: '#000000',
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    const bodyGroup = new THREE.Group();
    group.add(bodyGroup);
    group.userData.bodyGroup = bodyGroup;

    // 2. Turned wooden pedestal base
    const woodMat = new THREE.MeshStandardMaterial({ color: '#3b2416', roughness: 0.45, metalness: 0.1 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.66, 0.22, 24), woodMat);
    base.position.y = 0.11;
    base.castShadow = !this.isSoftwareGl;
    bodyGroup.add(base);

    // 3. Gold lacquer collar ring
    const goldMat = new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.25, metalness: 0.78 });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.50, 0.54, 0.10, 24), goldMat);
    ring.position.y = 0.26;
    bodyGroup.add(ring);

    // 4. Tapered kimono torso
    const kimonoMat = new THREE.MeshStandardMaterial({ color: primaryHex, roughness: 0.32, metalness: 0.12 });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.48, 1.05, 24), kimonoMat);
    torso.position.y = 0.82;
    torso.castShadow = !this.isSoftwareGl;
    bodyGroup.add(torso);

    // 5. Obi sash belt
    const obi = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.43, 0.22, 24), goldMat);
    obi.position.y = 0.72;
    bodyGroup.add(obi);

    // 6. Carved ivory/wood head
    const headMat = new THREE.MeshStandardMaterial({ color: '#f6e3c6', roughness: 0.38, metalness: 0.04 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 18), headMat);
    head.position.y = 1.58;
    head.castShadow = !this.isSoftwareGl;
    bodyGroup.add(head);

    // 7. Traditional Conical Sugegasa Traveler Sedge Hat (or Kabuto crest)
    const hatMat = new THREE.MeshStandardMaterial({
      color: side === 0 ? '#e3c078' : '#2a3744',
      roughness: 0.55,
      metalness: 0.15,
    });
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.68, 0.34, 24), hatMat);
    hat.position.y = 1.88;
    hat.castShadow = !this.isSoftwareGl;
    bodyGroup.add(hat);

    // 8. Overhead high-contrast floating name banner
    const label = createTextSprite(labelText, primaryHex, accentHex, 2.35, 0.76);
    label.position.set(0, 2.65, 0);
    group.add(label);

    return group;
  }

  setupDiceBowlAndDie() {
    // Place the 3D Porcelain Dice Bowl (Chawan) cleanly to the right of the board within full camera frame
    this.bowlCenter = new THREE.Vector3(BOARD_W * 0.5 + 3.85, 0.0, 1.8);
    const bowlGroup = new THREE.Group();
    bowlGroup.position.copy(this.bowlCenter);

    // Lathe profile for a thick porcelain chawan bowl
    const pts = [
      new THREE.Vector2(0.0, 0.02),
      new THREE.Vector2(2.6, 0.02),
      new THREE.Vector2(3.1, 0.35),
      new THREE.Vector2(3.45, 1.35),
      new THREE.Vector2(3.15, 1.42),
      new THREE.Vector2(2.82, 0.42),
      new THREE.Vector2(0.0, 0.36),
    ];
    const bowlGeo = new THREE.LatheGeometry(pts, 36);
    const bowlMat = new THREE.MeshStandardMaterial({
      color: '#f2ece1',
      roughness: 0.22,
      metalness: 0.08,
    });
    const bowlMesh = new THREE.Mesh(bowlGeo, bowlMat);
    bowlMesh.receiveShadow = true;
    bowlMesh.castShadow = !this.isSoftwareGl;
    bowlMesh.userData.isDiceBowl = true;
    bowlGroup.add(bowlMesh);
    this.pickableMeshes.push(bowlMesh);
    this.bowlMat = bowlMat;

    // Sometsuke Prussian-blue rim ring & inner felt pad
    this.rimMat = new THREE.MeshStandardMaterial({
      color: '#1b4b72',
      emissive: '#d93829',
      emissiveIntensity: 0.0,
      roughness: 0.25,
      metalness: 0.2,
    });
    const rimRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.28, 0.14, 14, 36),
      this.rimMat,
    );
    rimRing.rotation.x = Math.PI / 2;
    rimRing.position.y = 1.38;
    bowlGroup.add(rimRing);
    this.rimRing = rimRing;

    const padMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(2.75, 2.75, 0.08, 32),
      new THREE.MeshStandardMaterial({ color: '#8a241b', roughness: 0.78, metalness: 0.05 }),
    );
    padMesh.position.y = 0.38;
    padMesh.receiveShadow = true;
    padMesh.userData.isDiceBowl = true;
    bowlGroup.add(padMesh);
    this.pickableMeshes.push(padMesh);
    this.padMesh = padMesh;

    // Porcelain Wall Collision Crescent Arc (flashes at the exact impact angle on the inner bowl wall)
    this.wallImpactArcMat = new THREE.MeshBasicMaterial({
      color: '#ff4b36',
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const wallArcGeo = new THREE.TorusGeometry(2.98, 0.16, 10, 24, Math.PI * 0.42);
    this.wallImpactArc = new THREE.Mesh(wallArcGeo, this.wallImpactArcMat);
    this.wallImpactArc.rotation.x = Math.PI / 2;
    this.wallImpactArc.position.y = 1.12;
    bowlGroup.add(this.wallImpactArc);

    // Overhead label above the 3D dice bowl
    const bowlLabel = createTextSprite('🎲 賽碗・一擲', '#1d364d', '#e5be62', 3.2, 0.86);
    bowlLabel.position.set(0, 3.85, 0);
    bowlGroup.add(bowlLabel);

    this.scene.add(bowlGroup);
    this.bowlGroup = bowlGroup;

    // Physical Bowl Spring-Damper State for Wall Collision Vibration & Recoil
    this.bowlPhysics = {
      offsetX: 0,
      offsetY: 0,
      offsetZ: 0,
      velX: 0,
      velY: 0,
      velZ: 0,
      tiltX: 0,
      tiltZ: 0,
      angVelX: 0,
      angVelZ: 0,
      rimFlash: 0,
      wallArcFlash: 0,
      wallArcAngle: 0,
      vibrationEnergy: 0,
      wallCollisionCount: 0,
      lastImpactNormal: { x: 0, z: 0 },
      lastImpactIntensity: 0,
      cameraShake: 0,
    };
    this.bowlShockRings = [];

    // True 3D Bone Die (Composite Group: 6 textured faces + 3D recessed spherical pips)
    // BoxGeometry material order: [+X (2), -X (5), +Y (1), -Y (6), +Z (3), -Z (4)]
    const faceOrder = [2, 5, 1, 6, 3, 4];
    const materials = faceOrder.map(val => new THREE.MeshStandardMaterial({
      map: createDieFaceTexture(val),
      emissive: '#3d2f1d',
      emissiveIntensity: 0.18,
      roughness: 0.24,
      metalness: 0.05,
    }));

    const dieSize = 1.68;
    const dieGroup = new THREE.Group();
    const cubeMesh = new THREE.Mesh(new THREE.BoxGeometry(dieSize, dieSize, dieSize), materials);
    cubeMesh.castShadow = !this.isSoftwareGl;
    cubeMesh.receiveShadow = true;
    cubeMesh.userData.isDiceBowl = true;
    dieGroup.add(cubeMesh);
    this.pickableMeshes.push(cubeMesh);

    // Add 3D inset spherical pips on all 6 faces so they are true 3D geometry attached to the cube
    const pipLayouts = {
      1: [[0, 0]],
      2: [[-0.22, -0.22], [0.22, 0.22]],
      3: [[-0.24, -0.24], [0, 0], [0.24, 0.24]],
      4: [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]],
      5: [[-0.24, -0.24], [0.24, -0.24], [0, 0], [-0.24, 0.24], [0.24, 0.24]],
      6: [[-0.22, -0.26], [0.22, -0.26], [-0.22, 0], [0.22, 0], [-0.22, 0.26], [0.22, 0.26]],
    };
    const redPipMat = new THREE.MeshStandardMaterial({
      color: '#d92314',
      emissive: '#5a0d06',
      emissiveIntensity: 0.25,
      roughness: 0.22,
    });
    const blackPipMat = new THREE.MeshStandardMaterial({
      color: '#110c09',
      roughness: 0.28,
    });
    const half = dieSize * 0.5;

    const addFacePips = (val, normalAxis, sign) => {
      const coords = pipLayouts[val];
      const r = val === 1 ? dieSize * 0.135 : dieSize * 0.076;
      const geo = new THREE.SphereGeometry(r, 14, 10);
      const mat = val === 1 ? redPipMat : blackPipMat;
      for (const [u, v] of coords) {
        const pip = new THREE.Mesh(geo, mat);
        const offset = (half - r * 0.65) * sign;
        if (normalAxis === 'y') pip.position.set(u * dieSize, offset, v * dieSize);
        else if (normalAxis === 'x') pip.position.set(offset, v * dieSize, u * dieSize);
        else pip.position.set(u * dieSize, v * dieSize, offset);
        dieGroup.add(pip);
      }
    };
    addFacePips(1, 'y', 1);
    addFacePips(6, 'y', -1);
    addFacePips(2, 'x', 1);
    addFacePips(5, 'x', -1);
    addFacePips(3, 'z', 1);
    addFacePips(4, 'z', -1);

    // Settled Die Golden Ring Halo on the Crimson Bowl Pad (surrounding the die without covering it)
    this.dieSettleHaloMat = new THREE.MeshBasicMaterial({
      color: '#f5cb5c',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    this.dieSettleHalo = new THREE.Mesh(new THREE.RingGeometry(1.18, 1.56, 32), this.dieSettleHaloMat);
    this.dieSettleHalo.rotation.x = -Math.PI / 2;
    this.dieSettleHalo.position.set(0, 0.435, 0);
    bowlGroup.add(this.dieSettleHalo);

    // Pre-allocated 3D Outcome Callout Sprites for faces 1..6 positioned at the rear rim so they never occlude the 3D die face
    const kanjiFaces = ['壱', '弐', '参', '肆', '伍', '陸'];
    this.dieOutcomeSprites = {};
    for (let f = 1; f <= 6; f++) {
      const sp = createTextSprite(
        `出目: ${kanjiFaces[f - 1]} (${f}点)`,
        f === 1 ? '#bf3426' : '#1b3b56',
        '#f6de9d',
        2.75,
        0.76,
      );
      sp.position.set(0, 2.85, -2.45);
      sp.visible = f === 1;
      bowlGroup.add(sp);
      this.dieOutcomeSprites[f] = sp;
    }

    dieGroup.rotation.order = 'YXZ';
    dieGroup.position.set(this.bowlCenter.x, 0.42 + half, this.bowlCenter.z);
    dieGroup.quaternion.setFromEuler(getDieFaceUpEuler(1, 0.25));
    this.scene.add(dieGroup);
    this.dieMesh = dieGroup;

    this.setupDiceParticleSystem();
  }

  setupDiceParticleSystem() {
    // Pre-allocated Three.js Particle Pool for:
    //  1. "sumie" (Texture-based Sumie Ink Splatters "墨点溅射 / 水墨飛沫・木版墨滲み" with Nijimi capillary bloom)
    //  2. "soul"  ("魂" Hitodama Soul Wisps)
    //  3. "ink"   ("朱墨" 3D Vermilion / Sumi Ink Droplets)
    this.diceParticleGroup = new THREE.Group();
    this.diceParticleGroup.frustumCulled = false;
    this.scene.add(this.diceParticleGroup);

    this.soulTex = createSoulWispTexture();
    this.sumieTextures = createSumieSplatterTextures();
    this.inkDecalTex = this.sumieTextures[0];
    this.inkDropletGeo = new THREE.IcosahedronGeometry(0.16, 1);
    this.soulCoreGeo = new THREE.SphereGeometry(0.11, 10, 8);
    this.decalGeo = new THREE.PlaneGeometry(0.95, 0.95);
    this.wallStainGeo = createCurvedWallPatchGeometry(1.22, 0.96, 2.64, 10, 6);

    this.diceParticlePool = [];
    const TOTAL_PARTICLES = 216;
    for (let i = 0; i < TOTAL_PARTICLES; i++) {
      const mod = i % 3;
      if (mod === 0) {
        // "sumie" (Texture-based Sumi-e Ink Splatter Sprite with Nijimi Blooming & Brush Rotation)
        const variantIdx = (i / 3) % this.sumieTextures.length | 0;
        const spriteMat = new THREE.SpriteMaterial({
          map: this.sumieTextures[variantIdx],
          color: '#110d0a',
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(0.95, 0.95, 1);
        sprite.renderOrder = 18;
        sprite.visible = false;
        this.diceParticleGroup.add(sprite);
        this.diceParticlePool.push({
          active: false,
          kind: 'sumie',
          mesh: sprite,
          primaryMat: spriteMat,
          secondaryMat: null,
          sprite,
          variantIdx,
          vx: 0, vy: 0, vz: 0,
          age: 0, life: 1,
          baseScale: 1.05,
          nijimiBloom: 1.48,
          rotSpeed: 0,
          swirlPhase: 0,
          swirlSpeed: 0,
          leaveDecal: true,
          colorHex: '#110d0a',
        });
      } else if (mod === 1) {
        // "魂" (Soul Wisp): glowing additive Sprite + inner spirit core sphere
        const group = new THREE.Group();
        const spriteMat = new THREE.SpriteMaterial({
          map: this.soulTex,
          color: '#ff4e38',
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(0.85, 1.15, 1);
        group.add(sprite);

        const coreMat = new THREE.MeshBasicMaterial({
          color: '#fff6d6',
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const core = new THREE.Mesh(this.soulCoreGeo, coreMat);
        group.add(core);

        group.visible = false;
        this.diceParticleGroup.add(group);
        this.diceParticlePool.push({
          active: false,
          kind: 'soul',
          mesh: group,
          primaryMat: spriteMat,
          secondaryMat: coreMat,
          sprite,
          variantIdx: 0,
          vx: 0, vy: 0, vz: 0,
          age: 0, life: 1,
          baseScale: 0.85,
          nijimiBloom: 1.0,
          rotSpeed: 0,
          swirlPhase: i * 0.45,
          swirlSpeed: 4.5,
          leaveDecal: false,
          colorHex: '#ff4e38',
        });
      } else {
        // "朱墨" (Shu-Boku: Vermilion #d93423, Sumi Ink #140f0c, or Gold Leaf #f2c44e 3D Droplet)
        const mat = new THREE.MeshStandardMaterial({
          color: '#d93423',
          emissive: '#7a1208',
          emissiveIntensity: 0.35,
          roughness: 0.28,
          metalness: 0.12,
          transparent: true,
          opacity: 0,
        });
        const mesh = new THREE.Mesh(this.inkDropletGeo, mat);
        mesh.visible = false;
        this.diceParticleGroup.add(mesh);
        this.diceParticlePool.push({
          active: false,
          kind: 'ink',
          mesh,
          primaryMat: mat,
          secondaryMat: null,
          sprite: null,
          variantIdx: 0,
          vx: 0, vy: 0, vz: 0,
          age: 0, life: 1,
          baseScale: 0.9,
          nijimiBloom: 1.0,
          rotSpeed: 0,
          swirlPhase: 0,
          swirlSpeed: 0,
          leaveDecal: true,
          colorHex: '#d93423',
        });
      }
    }

    // Pre-allocated "墨滲み・朱墨" Ink-Bleed Floor Decals inside the Chawan Bowl (attached to bowlGroup so they vibrate with the bowl!)
    this.inkDecalPool = [];
    const TOTAL_DECALS = 28;
    for (let i = 0; i < TOTAL_DECALS; i++) {
      const tex = this.sumieTextures[i % this.sumieTextures.length];
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: '#140f0c',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      const mesh = new THREE.Mesh(this.decalGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.43;
      mesh.visible = false;
      this.bowlGroup.add(mesh);
      this.inkDecalPool.push({
        active: false,
        mesh,
        mat,
        age: 0,
        life: 2.2,
        baseScale: 0.85,
        nijimiMax: 1.38,
      });
    }
    this.decalCursor = 0;

    // Pre-allocated Curved Porcelain Inner-Wall Sumie Ink-Bleed Stains ("碗壁墨迹晕染")
    // Attached to bowlGroup so they cling to the glazed ceramic wall and vibrate with wall recoil!
    this.wallInkStainPool = [];
    const TOTAL_WALL_STAINS = 22;
    for (let i = 0; i < TOTAL_WALL_STAINS; i++) {
      const tex = this.sumieTextures[i % this.sumieTextures.length];
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: '#0e0a08',
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      });
      const mesh = new THREE.Mesh(this.wallStainGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 16;
      this.bowlGroup.add(mesh);
      this.wallInkStainPool.push({
        active: false,
        mesh,
        mat,
        age: 0,
        life: 2.4,
        baseScale: 0.9,
        startY: 0.95,
        nijimiGrowX: 1.45,
        nijimiGrowY: 1.35,
      });
    }
    this.wallStainCursor = 0;
  }

  getBoardParticlePalette() {
    const board = currentBoard();
    if (board.id === 'yokai') {
      // Hyakki Yagyo: Spectral Ao-Andon Ghost Fire ("魂") + Deep Sumi & Vermilion ("水墨・朱墨")
      return {
        souls: ['#5ce6ff', '#a855f7', '#7fffd4', '#ff4d38'],
        inks: ['#d93423', '#140f0c', '#2a133d', '#f5cb5c'],
        sumie: ['#0d0907', '#1a1128', '#c82517', '#16202b', '#2b1912'],
        shock: '#5ce6ff',
      };
    }
    if (board.id === 'genji') {
      // Genji: Heian Court Wisteria Spirit + Pine-Soot Sumi & Vermilion
      return {
        souls: ['#e879f9', '#f5cb5c', '#ff6148', '#a78bfa'],
        inks: ['#d93423', '#18120e', '#f5cb5c', '#8b264d'],
        sumie: ['#120d0a', '#241521', '#c42416', '#2b1d16', '#18120e'],
        shock: '#e879f9',
      };
    }
    if (board.id === 'kesshu') {
      // Kesshu: Samurai Battle Spirit Flame + Iron Sumi & Cinnabar Shu
      return {
        souls: ['#ff4b33', '#f5cb5c', '#ff8533', '#60a5fa'],
        inks: ['#dc2626', '#110d0a', '#f5cb5c', '#7f1d1d'],
        sumie: ['#0b0806', '#1c130f', '#c92216', '#281812', '#140f0c'],
        shock: '#ff4b33',
      };
    }
    // Tokaido default: Traditional Edo Sumi-e ("濃墨・青墨・古墨") + Vermilion Seal Ink ("朱墨") + Kami Spirit ("魂")
    return {
      souls: ['#ff5238', '#f7d060', '#5ce6ff', '#ff8c42'],
      inks: ['#d93423', '#140f0c', '#c82517', '#f0c24b'],
      sumie: ['#0e0a08', '#1c1410', '#c82517', '#18222c', '#2b1d14'],
      shock: '#ee4635',
    };
  }

  emitDiceParticle(opts) {
    // Find an available particle of the requested kind ('sumie', 'soul', or 'ink')
    let slot = null;
    for (let i = 0; i < this.diceParticlePool.length; i++) {
      const p = this.diceParticlePool[i];
      if (!p.active && p.kind === opts.kind) {
        slot = p;
        break;
      }
    }
    if (!slot) {
      // Fallback: steal oldest active particle of that kind
      let oldestAge = -1;
      for (let i = 0; i < this.diceParticlePool.length; i++) {
        const p = this.diceParticlePool[i];
        if (p.kind === opts.kind && p.age > oldestAge) {
          oldestAge = p.age;
          slot = p;
        }
      }
    }
    if (!slot) return;

    slot.active = true;
    slot.age = 0;
    slot.life = opts.life || 0.85;
    slot.baseScale = opts.scale || 0.9;
    slot.vx = opts.vx || 0;
    slot.vy = opts.vy || 0;
    slot.vz = opts.vz || 0;
    slot.swirlSpeed = opts.swirlSpeed ?? 5.2;
    slot.leaveDecal = opts.leaveDecal ?? (slot.kind === 'ink' || slot.kind === 'sumie');
    slot.colorHex = opts.color || '#140f0c';

    slot.mesh.position.set(opts.x, opts.y, opts.z);
    slot.mesh.visible = true;
    slot.primaryMat.color.set(slot.colorHex);
    slot.primaryMat.opacity = 1.0;

    if (slot.kind === 'sumie') {
      if (opts.variantIdx !== undefined && this.sumieTextures[opts.variantIdx]) {
        slot.variantIdx = opts.variantIdx;
        slot.primaryMat.map = this.sumieTextures[opts.variantIdx];
      }
      slot.primaryMat.rotation = opts.rotation ?? (Math.random() * Math.PI * 2);
      slot.rotSpeed = opts.rotSpeed ?? ((Math.random() - 0.5) * 4.2);
      slot.nijimiBloom = opts.nijimiBloom ?? (1.35 + Math.random() * 0.45);
      // Start compact like a fresh brush impact drop, then bloom outward via Nijimi diffusion in update()
      const startScale = slot.baseScale * 0.42;
      slot.mesh.scale.set(startScale, startScale, 1);
    } else if (slot.kind === 'ink') {
      const isSumi = slot.colorHex === '#140f0c' || slot.colorHex === '#18120e' || slot.colorHex === '#110d0a';
      slot.primaryMat.emissive.set(isSumi ? '#050403' : slot.colorHex);
      slot.primaryMat.emissiveIntensity = isSumi ? 0.05 : 0.45;
      slot.mesh.scale.setScalar(slot.baseScale);
    } else if (slot.secondaryMat) {
      slot.secondaryMat.opacity = 0.95;
      slot.mesh.scale.setScalar(slot.baseScale);
    }
  }

  spawnInkDecal(localX, localZ, colorHex = '#140f0c', scale = 0.82, variantIdx = null) {
    const d = this.inkDecalPool[this.decalCursor % this.inkDecalPool.length];
    this.decalCursor++;
    if (variantIdx !== null && this.sumieTextures[variantIdx]) {
      d.mat.map = this.sumieTextures[variantIdx];
    } else {
      d.mat.map = this.sumieTextures[this.decalCursor % this.sumieTextures.length];
    }
    d.active = true;
    d.age = 0;
    d.life = 2.0 + Math.random() * 0.85;
    d.baseScale = scale * (0.78 + Math.random() * 0.45);
    d.nijimiMax = 1.28 + Math.random() * 0.32;
    d.mat.color.set(colorHex);
    d.mat.opacity = 0.92;
    d.mesh.position.set(localX, 0.43 + (this.decalCursor % 7) * 0.002, localZ);
    d.mesh.rotation.z = Math.random() * Math.PI * 2;
    const initS = d.baseScale * 0.48;
    d.mesh.scale.set(initS, initS, 1);
    d.mesh.visible = true;
  }

  spawnWallInkStain(nx, nz, hitHeightY = 0.92, colorHex = '#0e0a08', scale = 0.95, variantIdx = null) {
    if (!this.wallInkStainPool || this.wallInkStainPool.length === 0) return;
    const st = this.wallInkStainPool[this.wallStainCursor % this.wallInkStainPool.length];
    this.wallStainCursor++;
    const texIdx = variantIdx !== null ? (variantIdx % this.sumieTextures.length) : (this.wallStainCursor % this.sumieTextures.length);
    st.mat.map = this.sumieTextures[texIdx];
    st.mat.color.set(colorHex);
    st.mat.opacity = 0.94;
    st.active = true;
    st.age = 0;
    st.life = 2.15 + Math.random() * 0.75;
    st.baseScale = scale * (0.82 + Math.random() * 0.36);
    st.nijimiGrowX = 1.36 + Math.random() * 0.32;
    st.nijimiGrowY = 1.28 + Math.random() * 0.28;

    // Position right against the inner glazed porcelain wall at (nx, nz) and orient inward toward bowl center
    const wallR = 2.66 - (this.wallStainCursor % 5) * 0.004;
    const clampedY = THREE.MathUtils.clamp(hitHeightY, 0.68, 1.32);
    st.startY = clampedY;
    st.mesh.position.set(nx * wallR, clampedY, nz * wallR);
    // Face inward toward (-nx, -nz) with a slight organic brush-angle roll
    const inwardYaw = Math.atan2(-nx, -nz);
    const rollJitter = (Math.random() - 0.5) * 0.55;
    st.mesh.rotation.set(0.18, inwardYaw, rollJitter);
    const initS = st.baseScale * 0.42;
    st.mesh.scale.set(initS, initS, 1);
    st.mesh.visible = true;
  }

  spawnBowlShockRing(colorHex = '#ff4b36', yOffset = 1.15, startRadius = 2.7, maxScale = 1.65, duration = 0.48) {
    const geo = new THREE.RingGeometry(startRadius * 0.88, startRadius, 36);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(this.bowlCenter.x, yOffset, this.bowlCenter.z);
    this.scene.add(mesh);
    this.bowlShockRings.push({
      mesh,
      mat,
      age: 0,
      duration,
      maxScale,
    });
  }

  onDiceThrow(value = 1) {
    const pal = this.getBoardParticlePalette();
    const bp = this.bowlPhysics;
    // Initial throw downward & rotational impulse on the bowl
    bp.velY -= 1.8;
    bp.angVelX += (Math.random() - 0.5) * 4.5;
    bp.angVelZ += (Math.random() - 0.5) * 4.5;
    bp.rimFlash = Math.max(bp.rimFlash, 0.55);

    // Erupt initial "水墨・朱墨・魂" (Sumie Splatter, Shu-Boku & Soul Wisp) throw cloud above the chawan
    const cx = this.bowlCenter.x;
    const cz = this.bowlCenter.z;
    for (let i = 0; i < 28; i++) {
      const a = (Math.PI * 2 * i) / 28 + (Math.random() - 0.5) * 0.25;
      const spd = 2.2 + Math.random() * 4.2;
      const kind = i % 3 === 0 ? 'sumie' : (i % 3 === 1 ? 'soul' : 'ink');
      const color = kind === 'sumie'
        ? pal.sumie[i % pal.sumie.length]
        : (kind === 'soul' ? pal.souls[i % pal.souls.length] : pal.inks[i % pal.inks.length]);
      this.emitDiceParticle({
        kind,
        variantIdx: i % 4,
        x: cx + Math.cos(a) * 0.55,
        y: 2.35 + Math.random() * 0.5,
        z: cz + Math.sin(a) * 0.55,
        vx: Math.cos(a) * spd,
        vy: kind === 'soul' ? (2.8 + Math.random() * 3.4) : (3.2 + Math.random() * 3.8),
        vz: Math.sin(a) * spd,
        scale: kind === 'sumie' ? (0.92 + Math.random() * 0.45) : (0.8 + Math.random() * 0.45),
        life: kind === 'sumie' ? (0.78 + Math.random() * 0.38) : (0.75 + Math.random() * 0.4),
        color,
        swirlSpeed: (i % 2 === 0 ? 1 : -1) * (4.5 + Math.random() * 3.0),
      });
    }
    this.spawnBowlShockRing(pal.shock, 1.42, 2.9, 1.45, 0.42);
  }

  onBowlWallCollision(nx, nz, intensity = 1.0, heightY = 0.4, dieValue = 1) {
    const pal = this.getBoardParticlePalette();
    const bp = this.bowlPhysics;
    const clamped = Math.max(0.25, Math.min(1.6, intensity));

    // 1. Physical Bowl Recoil & Angular Rim Tilt Impulse along impact normal (nx, nz)
    bp.velX += nx * (5.2 * clamped);
    bp.velZ += nz * (5.2 * clamped);
    bp.velY -= 1.5 * clamped;
    // Striking the wall at (nx, nz) tilts the bowl rim outward/downward along that vector
    bp.angVelX += nz * (11.5 * clamped);
    bp.angVelZ -= nx * (11.5 * clamped);
    bp.rimFlash = Math.min(1.5, bp.rimFlash + 0.85 * clamped);
    bp.wallArcFlash = Math.min(1.4, 0.95 * clamped);
    bp.wallArcAngle = Math.atan2(nz, nx) - Math.PI * 0.21;
    bp.wallCollisionCount += 1;
    bp.sumieSplatterBursts = (bp.sumieSplatterBursts || 0) + 1;
    bp.lastImpactNormal = { x: Number(nx.toFixed(3)), z: Number(nz.toFixed(3)) };
    bp.lastImpactIntensity = Number(clamped.toFixed(3));
    bp.vibrationEnergy = Math.min(2.5, bp.vibrationEnergy + clamped * 0.95);
    bp.cameraShake = Math.min(0.45, bp.cameraShake + clamped * 0.24);

    // 2. Contact coordinates on the inner porcelain wall of the chawan
    const wallR = 2.65;
    const hitX = this.bowlCenter.x + nx * wallR;
    const hitY = 0.84 + Math.min(0.72, Math.max(0, heightY));
    const hitZ = this.bowlCenter.z + nz * wallR;

    // 3. Layered Porcelain Inner-Wall & Floor Felt-Pad Sumi-e Ink-Bleed Stains ("木版画墨迹晕染")
    // Outer Haboku/Nijimi wash halo on the curved porcelain wall + concentrated Sumi/Vermilion core splatter
    const primarySumi = bp.wallCollisionCount % 3 === 0 ? '#c82517' : '#0e0a08';
    const secondaryWash = bp.wallCollisionCount % 2 === 0 ? '#241811' : '#182028';
    this.spawnWallInkStain(nx, nz, hitY, secondaryWash, (0.98 + clamped * 0.42), 1);
    this.spawnWallInkStain(
      nx * 0.98 - nz * 0.12,
      nz * 0.98 + nx * 0.12,
      hitY + 0.04,
      primarySumi,
      (0.76 + clamped * 0.34),
      bp.wallCollisionCount % 4,
    );
    // Floor felt-pad ink-bleed stain right beneath the wall impact
    this.spawnInkDecal(nx * 1.92, nz * 1.92, primarySumi, 0.78 + clamped * 0.38, bp.wallCollisionCount % 4);

    // 4. Shockwave Ring around the Porcelain Rim
    this.spawnBowlShockRing(
      bp.wallCollisionCount % 2 === 1 ? '#1c1410' : pal.shock,
      1.36,
      3.25,
      1.38 + clamped * 0.25,
      0.38,
    );

    // 5. Texture-Based "Sumie Ink Splatters" ("墨点溅射") Burst from the Wall Collision Point!
    const tx = -nz;
    const tz = nx;
    const sumieCount = Math.round(16 + clamped * 12);
    for (let i = 0; i < sumieCount; i++) {
      // Fan across the wall tangent + inward reflection + upward rim splash
      const tangSpread = (Math.random() - 0.5) * 2.35;
      const radialReflect = (i % 4 === 0 ? 0.55 : -0.82) + (Math.random() - 0.5) * 0.45;
      const speed = (2.2 + Math.random() * 4.8) * (0.72 + clamped * 0.42);
      const vx = (nx * radialReflect + tx * tangSpread) * speed;
      const vz = (nz * radialReflect + tz * tangSpread) * speed;
      const vy = 2.6 + Math.random() * 4.6 * clamped;

      // Cycle across the 4 procedural sumi-e textures (0: Deep Sumi Splash, 1: Haboku Bloom, 2: Kasure Slash, 3: Seal-Ink Cluster)
      const variantIdx = i % 4;
      const color = pal.sumie[i % pal.sumie.length];
      // Align Kasure directional brush slashes (variant 2) with the wall tangent/impact angle
      const impactAngle = Math.atan2(nz, nx) + (Math.random() - 0.5) * 1.2;

      this.emitDiceParticle({
        kind: 'sumie',
        variantIdx,
        x: hitX + (Math.random() - 0.5) * 0.24,
        y: hitY + (Math.random() - 0.5) * 0.22,
        z: hitZ + (Math.random() - 0.5) * 0.24,
        vx,
        vy,
        vz,
        scale: (0.88 + Math.random() * 0.52) * (0.78 + clamped * 0.34),
        life: 0.68 + Math.random() * 0.48,
        color,
        rotation: impactAngle,
        rotSpeed: (i % 2 === 0 ? 1 : -1) * (1.8 + Math.random() * 3.4),
        nijimiBloom: 1.38 + Math.random() * 0.48,
        leaveDecal: i % 2 === 0,
      });
    }

    // 6. Accompanying "魂 + 朱墨" Spirit & 3D Droplet Accents
    const accentCount = Math.round(14 + clamped * 8);
    for (let i = 0; i < accentCount; i++) {
      const isSoul = i % 2 === 0;
      const spread = (Math.random() - 0.5) * 2.0;
      const radialDir = (i % 3 === 0 ? 0.65 : -0.75) + (Math.random() - 0.5) * 0.4;
      const speed = (2.8 + Math.random() * 5.2) * (0.7 + clamped * 0.45);
      const vx = (nx * radialDir + tx * spread) * speed;
      const vz = (nz * radialDir + tz * spread) * speed;
      const vy = (isSoul ? 3.2 : 4.2) + Math.random() * 4.6 * clamped;

      const color = isSoul
        ? pal.souls[i % pal.souls.length]
        : pal.inks[i % pal.inks.length];

      this.emitDiceParticle({
        kind: isSoul ? 'soul' : 'ink',
        x: hitX + (Math.random() - 0.5) * 0.22,
        y: hitY + (Math.random() - 0.5) * 0.18,
        z: hitZ + (Math.random() - 0.5) * 0.22,
        vx,
        vy,
        vz,
        scale: (isSoul ? 0.85 : 0.78) * (0.75 + clamped * 0.38),
        life: isSoul ? (0.75 + Math.random() * 0.45) : (0.58 + Math.random() * 0.36),
        color,
        swirlSpeed: (i % 2 === 0 ? 1 : -1) * (5.5 + Math.random() * 3.5),
      });
    }
  }

  onBowlFloorBounce(relX = 0, relZ = 0, intensity = 0.6) {
    const pal = this.getBoardParticlePalette();
    const bp = this.bowlPhysics;
    const clamped = Math.max(0.2, Math.min(1.2, intensity));
    bp.velY -= 2.2 * clamped;
    bp.angVelX += relZ * 3.2 * clamped;
    bp.angVelZ -= relX * 3.2 * clamped;
    bp.vibrationEnergy = Math.min(2.5, bp.vibrationEnergy + clamped * 0.45);

    this.spawnInkDecal(
      THREE.MathUtils.clamp(relX, -1.8, 1.8),
      THREE.MathUtils.clamp(relZ, -1.8, 1.8),
      Math.random() < 0.65 ? '#120d0a' : '#c82517',
      0.68 + clamped * 0.28,
    );

    const bx = this.bowlCenter.x + relX;
    const bz = this.bowlCenter.z + relZ;
    const count = Math.round(12 + clamped * 8);
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const spd = (1.8 + Math.random() * 3.2) * clamped;
      const kind = i % 2 === 0 ? 'sumie' : (i % 4 === 1 ? 'soul' : 'ink');
      this.emitDiceParticle({
        kind,
        variantIdx: i % 4,
        x: bx,
        y: 0.56,
        z: bz,
        vx: Math.cos(a) * spd,
        vy: 2.2 + Math.random() * 3.0 * clamped,
        vz: Math.sin(a) * spd,
        scale: 0.72 + Math.random() * 0.35,
        life: 0.56 + Math.random() * 0.32,
        color: kind === 'sumie'
          ? pal.sumie[i % pal.sumie.length]
          : (kind === 'soul' ? pal.souls[i % pal.souls.length] : pal.inks[i % pal.inks.length]),
      });
    }
  }

  onDiceSettled(value = 1) {
    const pal = this.getBoardParticlePalette();
    const bp = this.bowlPhysics;
    const isHeavenOne = value === 1;
    const isHigh = value === 6 || isHeavenOne;
    const boost = isHigh ? 1.35 : 1.0;

    bp.velY -= 2.6 * boost;
    bp.rimFlash = 1.25 * boost;
    bp.vibrationEnergy = Math.min(2.5, bp.vibrationEnergy + 0.9 * boost);
    bp.cameraShake = Math.min(0.45, bp.cameraShake + 0.18 * boost);

    // Center "水墨・朱墨" seal splatter beneath the settled bone die
    this.spawnInkDecal(0, 0, isHeavenOne ? '#d92818' : '#120d0a', 1.32 * boost, isHeavenOne ? 3 : 0);
    this.spawnBowlShockRing(isHeavenOne ? '#ff3b28' : pal.shock, 1.38, 3.1, 1.75 * boost, 0.58);
    this.spawnBowlShockRing('#f5cb5c', 0.55, 2.2, 1.55 * boost, 0.48);

    // Grand "水墨・魂・朱墨" Finale Ring Explosion around the outer bowl perimeter so the settled 3D die top face stays 100% clear!
    const total = isHigh ? 36 : 28;
    const cx = this.bowlCenter.x;
    const cz = this.bowlCenter.z;
    for (let i = 0; i < total; i++) {
      const a = (Math.PI * 2 * i) / total + (Math.random() - 0.5) * 0.15;
      const kind = i % 3 === 0 ? 'sumie' : (i % 3 === 1 ? 'soul' : 'ink');
      const spd = (3.2 + Math.random() * 4.8) * boost;
      const ringR = 1.65 + (i % 3) * 0.32;
      const color = isHeavenOne && i % 3 === 0
        ? '#d92818'
        : (kind === 'sumie'
          ? pal.sumie[i % pal.sumie.length]
          : (kind === 'soul' ? pal.souls[i % pal.souls.length] : pal.inks[i % pal.inks.length]));

      this.emitDiceParticle({
        kind,
        variantIdx: i % 4,
        x: cx + Math.cos(a) * ringR,
        y: 1.05 + (i % 3) * 0.16,
        z: cz + Math.sin(a) * ringR,
        vx: Math.cos(a) * spd,
        vy: (kind === 'soul' ? 3.8 : 4.4) + Math.random() * 4.2 * boost,
        vz: Math.sin(a) * spd,
        scale: (kind === 'sumie' ? 0.88 : (kind === 'soul' ? 0.85 : 0.78)) * boost,
        life: (kind === 'soul' ? 0.92 : 0.68) + Math.random() * 0.35,
        color,
        swirlSpeed: (i % 2 === 0 ? 1 : -1) * (6.2 + Math.random() * 3.5),
      });
    }
  }

  getDiceEffectStats() {
    let activeParticles = 0;
    let activeSouls = 0;
    let activeInks = 0;
    let activeSumieSplatters = 0;
    if (this.diceParticlePool) {
      for (let i = 0; i < this.diceParticlePool.length; i++) {
        const p = this.diceParticlePool[i];
        if (p.active) {
          activeParticles++;
          if (p.kind === 'soul') activeSouls++;
          else if (p.kind === 'sumie') {
            activeSumieSplatters++;
            activeInks++;
          } else {
            activeInks++;
          }
        }
      }
    }
    let activeDecals = 0;
    if (this.inkDecalPool) {
      for (let i = 0; i < this.inkDecalPool.length; i++) {
        if (this.inkDecalPool[i].active) activeDecals++;
      }
    }
    let activeWallInkStains = 0;
    if (this.wallInkStainPool) {
      for (let i = 0; i < this.wallInkStainPool.length; i++) {
        if (this.wallInkStainPool[i].active) activeWallInkStains++;
      }
    }
    const bp = this.bowlPhysics || {};
    const topFaceInfo = this.getVisualTopFace();
    return {
      activeParticles,
      activeSouls,
      activeInks,
      activeSumieSplatters,
      activeDecals,
      activeWallInkStains,
      sumieSplatterBursts: bp.sumieSplatterBursts || 0,
      sumieTextureVariants: this.sumieTextures ? this.sumieTextures.length : 0,
      activeShockRings: this.bowlShockRings ? this.bowlShockRings.length : 0,
      wallCollisionCount: bp.wallCollisionCount || 0,
      vibrationEnergy: Number((bp.vibrationEnergy || 0).toFixed(3)),
      lastImpactIntensity: bp.lastImpactIntensity || 0,
      lastImpactNormal: bp.lastImpactNormal || { x: 0, z: 0 },
      visualTopFace: topFaceInfo.visualTopFace,
      topFaceAlignment: topFaceInfo.alignmentDot,
      topFaceMatchesLogic: topFaceInfo.matchesLogic,
      turnTransition3D: this.getTurnTransitionStats(),
    };
  }

  /**
   * Computes which face (1..6) of `this.dieMesh` is currently pointing most strongly toward
   * world +Y (0, +1, 0) by transforming the 6 local face normals by `this.dieMesh.quaternion`.
   */
  getVisualTopFace() {
    if (!this.dieMesh) {
      return { visualTopFace: G.diceValue || 1, alignmentDot: 1, matchesLogic: true };
    }
    let bestFace = 1;
    let bestDot = -Infinity;
    for (let face = 1; face <= 6; face++) {
      const [nx, ny, nz] = DIE_LOCAL_NORMALS[face];
      _faceNorm.set(nx, ny, nz).applyQuaternion(this.dieMesh.quaternion);
      if (_faceNorm.y > bestDot) {
        bestDot = _faceNorm.y;
        bestFace = face;
      }
    }
    const logicValue = (G.physDice && G.physDice[0] && G.physDice[0].value) || G.diceValue || 1;
    return {
      visualTopFace: bestFace,
      alignmentDot: Number(bestDot.toFixed(5)),
      matchesLogic: bestFace === logicValue,
    };
  }

  /**
   * Triggers a 3D woodblock "page turn" wave across the board tiles and highlights the active player's pawn.
   */
  onTurnTransition(fromSide = 0, toSide = 1) {
    if (!this.turnTransition3D) return;
    this.turnTransition3D.active = true;
    this.turnTransition3D.age = 0;
    this.turnTransition3D.fromSide = fromSide;
    this.turnTransition3D.toSide = toSide;
    this.turnTransition3D.count = (this.turnTransition3D.count || 0) + 1;

    const board = currentBoard();
    if (G.match && board) {
      const activeNodeId = G.match.pos[toSide] ?? board.start;
      this.spawnTileRipple(activeNodeId, toSide === 0 ? '#f5cb5c' : '#6ce0ff');
    }
  }

  getTurnTransitionStats() {
    if (!this.turnTransition3D) {
      return { active: false, count: 0, fromSide: 0, toSide: 0 };
    }
    return {
      active: Boolean(this.turnTransition3D.active),
      count: this.turnTransition3D.count || 0,
      fromSide: this.turnTransition3D.fromSide,
      toSide: this.turnTransition3D.toSide,
      age: Number((this.turnTransition3D.age || 0).toFixed(3)),
    };
  }

  disposeTree(root) {
    root.traverse(obj => {
      if (obj.geometry) {
        obj.geometry.dispose();
      }
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
  }

  buildBoard(boardIndex) {
    this.builtBoardIdx = boardIndex;
    const board = BOARDS[boardIndex];
    this.builtBoardNodeCount = board.nodes.length;

    // Dispose old board meshes & textures cleanly
    while (this.boardGroup.children.length > 0) {
      const child = this.boardGroup.children[0];
      this.disposeTree(child);
      this.boardGroup.remove(child);
    }
    this.pickableMeshes = this.pickableMeshes.filter(m => m.userData.isDiceBowl);
    this.tileMeshes = [];
    this.regaliaMeshes = [];
    this.lanternMeshes = [];
    this.lastPreviewKey = '';

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    // Board Antique Woodblock Broadsheet Surface Plate
    const broadsheetTex = new THREE.CanvasTexture(createBoardBroadsheetCanvas(board));
    broadsheetTex.colorSpace = THREE.SRGBColorSpace;
    broadsheetTex.generateMipmaps = true;
    broadsheetTex.minFilter = THREE.LinearMipmapLinearFilter;
    broadsheetTex.magFilter = THREE.LinearFilter;
    broadsheetTex.anisotropy = maxAniso;
    const surfaceMat = new THREE.MeshStandardMaterial({
      map: broadsheetTex,
      roughness: 0.62,
      metalness: 0.04,
    });
    const surfaceMesh = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W + 1.2, 0.14, BOARD_D + 1.2), surfaceMat);
    surfaceMesh.position.set(0, 0.02, 0);
    surfaceMesh.receiveShadow = true;
    this.boardGroup.add(surfaceMesh);

    // Build 3D Raised Woodblock Tiles for every node
    for (const node of board.nodes) {
      const tileGroup = new THREE.Group();
      const w = node.w * SCALE * 0.985;
      const d = node.h * SCALE * 0.985;
      const isGoal = node.kind === 'goal';
      const h = isGoal ? 0.62 : (node.kind === 'start' || node.kind === 'jump' || node.kind === 'stay' ? 0.44 : 0.34);

      const center = nodeWorldCenter(node);
      tileGroup.position.set(center.x, 0, center.z);
      if (node.tilt) {
        tileGroup.rotation.y = -THREE.MathUtils.degToRad(node.tilt * 0.55);
      }

      // Frame border color by tile role
      const trimColors = {
        start: '#bf3426',
        goal: '#d4a338',
        jump: '#bf3426',
        stay: '#8c2016',
        branch: '#5a3270',
        good: '#c4962d',
        evil: '#4a2559',
        normal: '#4a3523',
      };
      const sideMat = new THREE.MeshStandardMaterial({
        color: trimColors[node.kind] || '#4a3523',
        roughness: 0.42,
        metalness: isGoal || node.kind === 'good' ? 0.48 : 0.15,
      });

      const topCanvas = create3DTileCanvas(board, node);
      const topTex = new THREE.CanvasTexture(topCanvas);
      topTex.colorSpace = THREE.SRGBColorSpace;
      topTex.generateMipmaps = true;
      topTex.minFilter = THREE.LinearMipmapLinearFilter;
      topTex.magFilter = THREE.LinearFilter;
      topTex.anisotropy = maxAniso;

      const topMat = new THREE.MeshStandardMaterial({
        map: topTex,
        roughness: 0.42,
        metalness: 0.03,
      });

      const blockMaterials = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
      const blockMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), blockMaterials);
      blockMesh.position.y = h * 0.5 + 0.08;
      blockMesh.castShadow = !this.isSoftwareGl;
      blockMesh.receiveShadow = true;
      blockMesh.userData.nodeId = node.id;
      tileGroup.add(blockMesh);
      this.pickableMeshes.push(blockMesh);

      // Gold/Vermilion bevel frame around the tile base
      const PlinthMat = new THREE.MeshStandardMaterial({
        color: isGoal ? '#d9ab42' : '#2a1c13',
        roughness: 0.35,
        metalness: isGoal ? 0.65 : 0.2,
      });
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.18, 0.10, d + 0.18), PlinthMat);
      plinth.position.y = 0.12;
      tileGroup.add(plinth);

      // Kesshu 3D Regalia Tokens on tile
      if (node.tokens) {
        const tokenGroup = new THREE.Group();
        tokenGroup.position.set(-w * 0.25, h + 0.55, -d * 0.22);
        const tokenMat = new THREE.MeshStandardMaterial({
          color: '#f0c24b',
          roughness: 0.2,
          metalness: 0.85,
          emissive: '#593e08',
        });
        const torus = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 1), tokenMat);
        tokenGroup.add(torus);
        tileGroup.add(tokenGroup);
        this.regaliaMeshes.push({ mesh: tokenGroup, mask: node.tokens });
      }

      tileGroup.userData = { node, baseY: 0, currentLift: 0, h };
      this.boardGroup.add(tileGroup);
      this.tileMeshes[node.id] = tileGroup;
    }

    // Build 3D Track Connector Arrows between tiles
    const arrowMat = new THREE.MeshStandardMaterial({
      color: '#c99733',
      roughness: 0.3,
      metalness: 0.7,
    });
    for (const node of board.nodes) {
      if (!node.next) continue;
      const c1 = nodeWorldCenter(node);
      for (const nextId of node.next) {
        const target = board.nodes[nextId];
        if (!target) continue;
        const c2 = nodeWorldCenter(target);
        const midX = (c1.x + c2.x) * 0.5;
        const midZ = (c1.z + c2.z) * 0.5;
        const angle = Math.atan2(c2.x - c1.x, c2.z - c1.z);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.52, 12), arrowMat);
        cone.position.set(midX, 0.22, midZ);
        cone.rotation.x = Math.PI / 2;
        cone.rotation.z = -angle;
        this.boardGroup.add(cone);
      }
    }

    // Yokai 4 Ao-Andon (Blue Lanterns) at the 4 corners of the board
    if (board.id === 'yokai') {
      const corners = [
        [-BOARD_W * 0.48, -BOARD_D * 0.48],
        [BOARD_W * 0.48, -BOARD_D * 0.48],
        [-BOARD_W * 0.48, BOARD_D * 0.48],
        [BOARD_W * 0.48, BOARD_D * 0.48],
      ];
      corners.forEach(([cx, cz], idx) => {
        const lg = new THREE.Group();
        lg.position.set(cx, 0.1, cz);
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(0.75, 1.35, 0.75),
          new THREE.MeshStandardMaterial({ color: '#1b1410', roughness: 0.5 }),
        );
        frame.position.y = 0.68;
        const coreMat = new THREE.MeshStandardMaterial({
          color: '#6ce0ff',
          emissive: '#2ca8d4',
          emissiveIntensity: 1.2,
          roughness: 0.2,
        });
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.05, 16), coreMat);
        core.position.y = 0.68;
        lg.add(frame, core);
        this.boardGroup.add(lg);
        this.lanternMeshes.push({ group: lg, coreMat, idx });
      });
    }

    // Immediately snap all 4 pawns to current board positions so switching volumes or player counts doesn't glide from origin
    if (this.pawns && this.pawns.length > 0) {
      const offsetsX = [-0.62, 0.62, -0.34, 0.34];
      const offsetsZ = [0.28, -0.28, -0.44, 0.44];
      for (let side = 0; side < this.pawns.length; side++) {
        const nodeIdx = G.match ? (G.match.pos[side] ?? board.start) : board.start;
        const c = nodeWorldCenter(board.nodes[nodeIdx] || board.nodes[0]);
        const sideOffsetX = offsetsX[side % 4];
        const sideOffsetZ = offsetsZ[side % 4];
        this.pawns[side].position.set(c.x + sideOffsetX, c.y + 0.08, c.z + sideOffsetZ);
      }
    }
  }

  // Updates 3D glowing preview arcs and numbered badges (①..⑥) for where rolls 1..6 will land
  updatePreviewOverlays() {
    const board = currentBoard();
    if (!G.match || G.screen !== 'PLAYING' || G.phase !== 'ROLL' || G.match.turn !== G.match.humanSide) {
      if (this.previewGroup.children.length > 0) {
        while (this.previewGroup.children.length > 0) {
          const ch = this.previewGroup.children[0];
          this.disposeTree(ch);
          this.previewGroup.remove(ch);
        }
        this.lastPreviewKey = '';
      }
      return;
    }

    const pos = G.match.pos[G.match.humanSide];
    const key = `${G.boardIdx}-${pos}-${G.hoverNode}`;
    if (key === this.lastPreviewKey) return;
    this.lastPreviewKey = key;

    while (this.previewGroup.children.length > 0) {
      const ch = this.previewGroup.children[0];
      this.disposeTree(ch);
      this.previewGroup.remove(ch);
    }

    const fromNode = board.nodes[pos];
    if (!fromNode) return;
    const pStart = nodeWorldCenter(fromNode);

    const circled = ['①', '②', '③', '④', '⑤', '⑥'];
    for (let roll = 1; roll <= 6; roll++) {
      const destObj = EsugorokuCore.previewDestinations(board, G.match, roll)[0];
      const destId = destObj && typeof destObj === 'object' ? destObj.to : destObj;
      const destNode = board.nodes[destId];
      if (!destNode) continue;
      const pEnd = nodeWorldCenter(destNode);

      // Numbered destination badge above the target tile
      const badge = createTextSprite(
        `${circled[roll - 1]} ${roll}点`,
        roll === 1 ? '#bf3426' : '#1b4769',
        '#f7de9c',
        2.0,
        0.66,
      );
      const angleOffset = ((roll - 1) / 6) * Math.PI * 2;
      badge.position.set(
        pEnd.x + Math.cos(angleOffset) * 0.72,
        pEnd.y + 1.0 + (roll % 2) * 0.28,
        pEnd.z + Math.sin(angleOffset) * 0.48,
      );
      this.previewGroup.add(badge);

      // Parabolic 3D trajectory arc on Yokai board or when hovering destination
      if (board.id === 'yokai' || G.hoverNode === destId || destObj?.kind === 'jump' || destObj?.kind === 'back') {
        const mid = new THREE.Vector3(
          (pStart.x + pEnd.x) * 0.5,
          Math.max(pStart.y, pEnd.y) + 2.2 + roll * 0.24,
          (pStart.z + pEnd.z) * 0.5,
        );
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(pStart.x, pStart.y + 0.35, pStart.z),
          mid,
          new THREE.Vector3(pEnd.x, pEnd.y + 0.35, pEnd.z),
        );
        const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.07, 8, false);
        const tubeMat = new THREE.MeshBasicMaterial({
          color: destObj?.kind === 'back' ? '#a83279' : (roll % 2 === 0 ? '#f0c24b' : '#df5745'),
          transparent: true,
          opacity: 0.76,
        });
        this.previewGroup.add(new THREE.Mesh(tubeGeo, tubeMat));
      }
    }
  }

  spawnTileRipple(nodeId, colorHex = '#f5cb5c') {
    const board = currentBoard();
    const node = board.nodes[nodeId];
    if (!node) return;
    const c = nodeWorldCenter(node);
    const geo = new THREE.RingGeometry(0.42, 0.68, 28);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(c.x, c.y + 0.14, c.z);
    this.scene.add(mesh);
    this.ripples.push({ mesh, mat, age: 0, duration: 0.65 });
  }

  setCameraPreset(preset) {
    this.cameraPreset = preset;
    if (preset === 'topdown') {
      this.presetTransition = {
        pos: new THREE.Vector3(2.8, 46.5, 2.0),
        target: new THREE.Vector3(2.8, 0, 0.4),
      };
    } else if (preset === 'follow') {
      const board = currentBoard();
      const humanPos = G.match ? G.match.pos[G.match.humanSide] : 0;
      const c = nodeWorldCenter(board.nodes[humanPos] || board.nodes[0]);
      this.presetTransition = {
        pos: new THREE.Vector3(c.x + 2.2, 18.0, c.z + 12.5),
        target: new THREE.Vector3(c.x + 1.0, 0.5, c.z),
      };
    } else {
      this.presetTransition = {
        pos: new THREE.Vector3(3.4, 38.2, 26.2),
        target: new THREE.Vector3(3.4, -0.9, 1.5),
      };
    }
  }

  update(dt, elapsed) {
    const board = currentBoard();
    if (this.builtBoardIdx !== G.boardIdx || this.builtBoardNodeCount !== board.nodes.length) {
      this.buildBoard(G.boardIdx);
    }

    // Smooth camera preset transition
    if (this.presetTransition) {
      const k = 1 - Math.exp(-6 * dt);
      this.camera.position.lerp(this.presetTransition.pos, k);
      this.controls.target.lerp(this.presetTransition.target, k);
      if (this.camera.position.distanceTo(this.presetTransition.pos) < 0.15) {
        this.presetTransition = null;
      }
    }
    this.controls.update();

    // Advance 3D Woodblock "Page Turn" Wave ("画帖めくり・手番交代")
    let waveActive = false;
    let waveProgress = 0;
    let waveDir = 1;
    if (this.turnTransition3D && this.turnTransition3D.active) {
      this.turnTransition3D.age += dt;
      waveProgress = this.turnTransition3D.age / this.turnTransition3D.duration;
      if (waveProgress >= 1) {
        this.turnTransition3D.active = false;
        waveProgress = 1;
      } else {
        waveActive = true;
        waveDir = this.turnTransition3D.toSide === 0 ? -1 : 1;
      }
    }

    // Update tile hover elevation, active player square glow & 3D page-turn wave ripple
    for (let i = 0; i < this.tileMeshes.length; i++) {
      const tg = this.tileMeshes[i];
      if (!tg) continue;
      const isHovered = G.hoverNode === i;
      const isOccupied = G.match && G.match.pos.some((p, s) => s < (G.match.playerCount || 2) && p === i);
      let waveLift = 0;
      let waveRollZ = 0;
      if (waveActive) {
        // Normalized X position across board [-1..1]
        const normX = (tg.position.x / (BOARD_W * 0.5)) * waveDir;
        const front = waveProgress * 2.6 - 1.3;
        const dist = normX - front;
        if (Math.abs(dist) < 0.72) {
          const bell = Math.cos((dist / 0.72) * (Math.PI * 0.5));
          const env = (1 - waveProgress) * bell * bell;
          waveLift = env * 0.34;
          waveRollZ = Math.sin((dist / 0.72) * Math.PI) * 0.085 * (1 - waveProgress) * waveDir;
        }
      }
      const targetLift = (isHovered ? 0.34 : (isOccupied ? 0.12 : 0)) + waveLift;
      tg.userData.currentLift = THREE.MathUtils.damp(tg.userData.currentLift, targetLift, 14, dt);
      tg.position.y = tg.userData.currentLift;
      tg.rotation.z = THREE.MathUtils.damp(tg.rotation.z || 0, waveRollZ, 16, dt);
    }

    // Rotate Kesshu regalia tokens
    for (const reg of this.regaliaMeshes) {
      reg.mesh.rotation.y = elapsed * 2.2;
      reg.mesh.position.y = 0.95 + Math.sin(elapsed * 3.5) * 0.12;
      const collected = G.match && ((G.match.tokens[0] & reg.mask) || (G.match.tokens[1] & reg.mask));
      reg.mesh.visible = !collected;
    }

    // Yokai lanterns glow state
    for (const l of this.lanternMeshes) {
      const lit = l.idx < G.yokaiLanterns;
      l.coreMat.emissiveIntensity = lit ? (1.0 + Math.sin(elapsed * 6 + l.idx) * 0.25) : 0.05;
      l.coreMat.color.set(lit ? '#6ce0ff' : '#2a333b');
    }

    // Update 3D pawns (with step-by-step parabolic hopping during G.phase === 'MOVE')
    if (G.match) {
      const pCount = Math.max(2, Math.min(4, G.match.playerCount || G.playerCount || 2));
      const offsetsX = [-0.62, 0.62, -0.34, 0.34];
      const offsetsZ = [0.28, -0.28, -0.44, 0.44];
      for (let side = 0; side < this.pawns.length; side++) {
        const pawn = this.pawns[side];
        if (!pawn) continue;
        const wasVisible = pawn.visible;
        pawn.visible = side < pCount;
        const bodyGroup = pawn.userData.bodyGroup;
        const sideOffsetX = offsetsX[side % 4];
        const sideOffsetZ = offsetsZ[side % 4];

        if (!pawn.visible) {
          const nodeIdx = G.match.pos[side] ?? 0;
          const c = nodeWorldCenter(board.nodes[nodeIdx] || board.nodes[0]);
          pawn.position.set(c.x + sideOffsetX, c.y + 0.08, c.z + sideOffsetZ);
          continue;
        }

        if (G.phase === 'MOVE' && G.pieceAnim && G.pieceAnim.side === side && G.pieceAnim.indexes?.length > 1) {
          const anim = G.pieceAnim;
          const totalProgress = Math.max(0, Math.min(1, (performance.now() - anim.t0) / anim.duration));
          const numSteps = anim.indexes.length - 1;
          const exactSeg = totalProgress * numSteps;
          const seg = Math.min(numSteps - 1, Math.floor(exactSeg));
          const localT = exactSeg - seg;

          const fromIdx = anim.indexes[seg];
          const toIdx = anim.indexes[seg + 1];
          const cFrom = nodeWorldCenter(board.nodes[fromIdx] || board.nodes[0]);
          const cTo = nodeWorldCenter(board.nodes[toIdx] || board.nodes[0]);

          const wx = THREE.MathUtils.lerp(cFrom.x, cTo.x, localT) + sideOffsetX;
          const wz = THREE.MathUtils.lerp(cFrom.z, cTo.z, localT) + sideOffsetZ;
          const baseH = THREE.MathUtils.lerp(cFrom.y, cTo.y, localT);

          const hopArc = Math.sin(localT * Math.PI) * 1.65;
          pawn.position.set(wx, baseH + hopArc, wz);

          const pitch = Math.sin(localT * Math.PI * 2) * 0.24;
          bodyGroup.rotation.x = pitch;
          const squash = localT < 0.15 || localT > 0.85 ? 0.90 : 1.08;
          bodyGroup.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
        } else {
          const nodeIdx = G.match.pos[side] ?? 0;
          const c = nodeWorldCenter(board.nodes[nodeIdx] || board.nodes[0]);
          _targetPos.set(c.x + sideOffsetX, c.y + 0.08, c.z + sideOffsetZ);
          if (!wasVisible || pawn.position.distanceTo(_targetPos) > 10) {
            pawn.position.copy(_targetPos);
          } else {
            pawn.position.lerp(_targetPos, 1 - Math.exp(-14 * dt));
          }
          bodyGroup.rotation.x = THREE.MathUtils.damp(bodyGroup.rotation.x, 0, 10, dt);
          const isTurn = G.match.turn === side && G.phase === 'ROLL';
          const bob = isTurn ? Math.abs(Math.sin(elapsed * 4.2)) * 0.18 : 0;
          pawn.position.y = c.y + 0.08 + bob;
          bodyGroup.scale.set(1, 1, 1);
        }
      }

      // Position & pulse the Active Turn Halo Ring beneath the active player's 3D Kokeshi pawn
      if (this.activeTurnHalo) {
        const activeSide = G.match.turn ?? 0;
        const activePawn = this.pawns[activeSide];
        if (activePawn) {
          this.activeTurnHalo.position.set(
            activePawn.position.x,
            Math.max(0.34, activePawn.position.y - 0.04),
            activePawn.position.z,
          );
          const transitionFlare = (this.turnTransition3D && this.turnTransition3D.active)
            ? (1 - this.turnTransition3D.age / this.turnTransition3D.duration) * 0.55
            : 0;
          const haloScale = 1.0 + Math.sin(elapsed * 5.2) * 0.08 + transitionFlare;
          this.activeTurnHalo.scale.setScalar(haloScale);
          this.activeTurnHalo.rotation.y = elapsed * 1.4;
          this.activeTurnHaloMat.color.set(activeSide === 0 ? '#f5cb5c' : '#6ce0ff');
          this.activeTurnInnerMat.color.set(activeSide === 0 ? '#d93829' : '#1d5478');
          this.activeTurnHaloMat.opacity = 0.78 + transitionFlare * 0.22;
          this.activeTurnInnerMat.opacity = 0.38 + transitionFlare * 0.35;
        }
      }
    }

    // Update Physical Bowl Spring-Damper Recoil, Rim Tilt & Ceramic Wall Vibration
    const bp = this.bowlPhysics;
    if (bp) {
      const kLin = 380;
      const cLin = 16;
      bp.velX += (-kLin * bp.offsetX - cLin * bp.velX) * dt;
      bp.velY += (-kLin * bp.offsetY - cLin * bp.velY) * dt;
      bp.velZ += (-kLin * bp.offsetZ - cLin * bp.velZ) * dt;
      bp.offsetX = THREE.MathUtils.clamp(bp.offsetX + bp.velX * dt, -0.68, 0.68);
      bp.offsetY = THREE.MathUtils.clamp(bp.offsetY + bp.velY * dt, -0.35, 0.35);
      bp.offsetZ = THREE.MathUtils.clamp(bp.offsetZ + bp.velZ * dt, -0.68, 0.68);

      const kRot = 340;
      const cRot = 14;
      bp.angVelX += (-kRot * bp.tiltX - cRot * bp.angVelX) * dt;
      bp.angVelZ += (-kRot * bp.tiltZ - cRot * bp.angVelZ) * dt;
      bp.tiltX = THREE.MathUtils.clamp(bp.tiltX + bp.angVelX * dt, -0.24, 0.24);
      bp.tiltZ = THREE.MathUtils.clamp(bp.tiltZ + bp.angVelZ * dt, -0.24, 0.24);

      bp.rimFlash = Math.max(0, bp.rimFlash - dt * 3.2);
      bp.wallArcFlash = Math.max(0, bp.wallArcFlash - dt * 4.5);
      bp.vibrationEnergy = Math.max(0, bp.vibrationEnergy - dt * 2.4);
      bp.cameraShake = Math.max(0, bp.cameraShake - dt * 2.8);

      // High-frequency ceramic ringing micro-tremor when wall collision energy is active
      const ringTremorX = bp.vibrationEnergy > 0.01 ? Math.sin(elapsed * 92) * 0.09 * bp.vibrationEnergy : 0;
      const ringTremorZ = bp.vibrationEnergy > 0.01 ? Math.cos(elapsed * 86) * 0.09 * bp.vibrationEnergy : 0;
      const cupShakeX = G.tube.shake > 0 ? Math.sin(elapsed * 48) * 0.16 * G.tube.shake : 0;
      const cupShakeZ = G.tube.shake > 0 ? Math.cos(elapsed * 42) * 0.14 * G.tube.shake : 0;

      this.bowlGroup.position.set(
        this.bowlCenter.x + bp.offsetX + ringTremorX + cupShakeX,
        this.bowlCenter.y + Math.max(-0.18, bp.offsetY),
        this.bowlCenter.z + bp.offsetZ + ringTremorZ + cupShakeZ,
      );
      this.bowlGroup.rotation.set(bp.tiltX, 0, bp.tiltZ);

      if (this.rimMat) {
        this.rimMat.emissiveIntensity = bp.rimFlash * 0.95;
      }
      if (this.wallImpactArc && this.wallImpactArcMat) {
        this.wallImpactArc.rotation.z = -bp.wallArcAngle;
        this.wallImpactArcMat.opacity = Math.min(0.95, bp.wallArcFlash);
      }
    }

    // Update 3D Bone Die inside the Porcelain Bowl (Physics-Based 3D Roll + Exact Face Convergence)
    const dieState = G.physDice[0];
    if (dieState && this.dieMesh) {
      const half = 0.84;
      const bowlPosX = this.bowlGroup ? this.bowlGroup.position.x : this.bowlCenter.x;
      const bowlPosY = this.bowlGroup ? this.bowlGroup.position.y : this.bowlCenter.y;
      const bowlPosZ = this.bowlGroup ? this.bowlGroup.position.z : this.bowlCenter.z;
      const rolledVal = dieState.value || G.diceValue || 1;
      const targetYaw = dieState.target?.ry ?? 0.25;

      if (!dieState.settled && !dieState.settling) {
        // Free 3D Physics Tumbling inside the Porcelain Chawan Bowl:
        // Map circular 2D bowl physics coordinates (radius 64 around 1120,625) into 3D bowl radius (1.86 world units)
        const relX = ((dieState.x - 1120) / 64) * 1.86;
        const relZ = ((dieState.y - 625) / 64) * 1.86;
        const liftY = Math.max(0, dieState.z * 0.065);
        this.dieMesh.position.set(
          bowlPosX + THREE.MathUtils.clamp(relX, -1.92, 1.92),
          bowlPosY + 0.42 + half + liftY,
          bowlPosZ + THREE.MathUtils.clamp(relZ, -1.92, 1.92),
        );
        _euler.set(dieState.rx, dieState.ry, dieState.rz, 'YXZ');
        this.dieMesh.quaternion.setFromEuler(_euler);

        if (this.dieSettleHaloMat) {
          this.dieSettleHaloMat.opacity = THREE.MathUtils.damp(this.dieSettleHaloMat.opacity, 0.0, 12, dt);
        }
        if (this.dieOutcomeSprites) {
          for (let f = 1; f <= 6; f++) {
            this.dieOutcomeSprites[f].visible = false;
          }
        }
      } else if (dieState.settling && !dieState.settled) {
        // Corner-Bounce Settling Phase: smoothly converge both position and 'YXZ' quaternion toward the exact face-up orientation
        const relX = ((dieState.x - 1120) / 64) * 1.86;
        const relZ = ((dieState.y - 625) / 64) * 1.86;
        const liftY = Math.max(0, dieState.z * 0.065);
        this.dieMesh.position.lerp(
          _vec3.set(
            bowlPosX + THREE.MathUtils.clamp(relX, -1.85, 1.85),
            bowlPosY + 0.42 + half + liftY,
            bowlPosZ + THREE.MathUtils.clamp(relZ, -1.85, 1.85),
          ),
          1 - Math.exp(-16 * dt),
        );
        _euler.set(dieState.rx, dieState.ry, dieState.rz, 'YXZ');
        _quatSpin.setFromEuler(_euler);
        const upEuler = getDieFaceUpEuler(rolledVal, targetYaw);
        _quatTarget.setFromEuler(upEuler);
        _quatSpin.slerp(_quatTarget, 0.55);
        this.dieMesh.quaternion.slerp(_quatSpin, 1 - Math.exp(-18 * dt));
      } else {
        // Settled Rest: Lock 3D die cleanly at center of bowl with exact rolled value pointing straight UP (+Y)
        this.dieMesh.position.lerp(
          _vec3.set(bowlPosX, bowlPosY + 0.42 + half, bowlPosZ),
          1 - Math.exp(-22 * dt),
        );
        const upEuler = getDieFaceUpEuler(rolledVal, targetYaw);
        _quatTarget.setFromEuler(upEuler);
        this.dieMesh.quaternion.copy(_quatTarget);

        if (this.dieSettleHalo && this.dieSettleHaloMat) {
          this.dieSettleHaloMat.color.set(rolledVal === 1 ? '#ff4b36' : '#f5cb5c');
          this.dieSettleHaloMat.opacity = 0.68 + Math.sin(elapsed * 5.5) * 0.18;
          const s = 1.0 + Math.sin(elapsed * 5.5) * 0.06;
          this.dieSettleHalo.scale.set(s, s, 1);
        }
        if (this.dieOutcomeSprites) {
          for (let f = 1; f <= 6; f++) {
            const sp = this.dieOutcomeSprites[f];
            sp.visible = f === rolledVal;
            if (sp.visible) {
              sp.position.y = 2.85 + Math.sin(elapsed * 4.5) * 0.08;
            }
          }
        }
      }
    }

    // Update Three.js "水墨飛沫 / 魂 / 朱墨" (Sumie Ink Splatters, Soul Wisps & Shu-Boku Droplets) Particle System
    if (this.diceParticlePool) {
      const cx = this.bowlCenter.x;
      const cz = this.bowlCenter.z;
      for (let i = 0; i < this.diceParticlePool.length; i++) {
        const p = this.diceParticlePool[i];
        if (!p.active) continue;
        p.age += dt;
        const t = p.age / p.life;
        if (t >= 1) {
          p.active = false;
          p.mesh.visible = false;
          continue;
        }

        if (p.kind === 'sumie') {
          // Texture-Based "Sumie Ink Splatters" ("墨点溅射 / 木版墨迹晕染"):
          // High initial wall-burst impulse, mist air-drag deceleration, and Nijimi capillary ink-bleed expansion!
          p.vy -= 11.5 * dt;
          const drag = Math.max(0, 1 - 3.6 * dt);
          p.vx *= drag;
          p.vz *= drag;
          p.mesh.position.x += p.vx * dt;
          p.mesh.position.y += p.vy * dt;
          p.mesh.position.z += p.vz * dt;

          // Nijimi (滲み) Ink-Bleed Bloom: expands rapidly from compact brush drop (0.42x) to full feathered blot (nijimiBloom)
          const bloomPhase = Math.min(1, t * 2.35);
          const nijimiEase = 1 - Math.pow(1 - bloomPhase, 3);
          const scaleFactor = p.baseScale * (0.42 + (p.nijimiBloom - 0.42) * nijimiEase);
          // Kasure slash variant (variantIdx === 2) stretches slightly more along its motion axis
          const aspect = p.variantIdx === 2 ? 1.24 : 1.0;
          p.mesh.scale.set(scaleFactor * aspect, scaleFactor, 1);
          p.primaryMat.rotation += p.rotSpeed * dt * (1 - t * 0.65);

          // Washi paper absorption fade curve: crisp dark ink during bloom, then organic fiber-soak fade
          const alpha = t < 0.12 ? (t / 0.12) : Math.pow(1 - (t - 0.12) / 0.88, 1.35);
          p.primaryMat.opacity = alpha * 0.94;

          // When airborne sumie splatter settles onto the bowl pad, leave a Nijimi ink-bleed stain
          if (p.mesh.position.y <= 0.48 && p.vy < 0) {
            const relX = p.mesh.position.x - cx;
            const relZ = p.mesh.position.z - cz;
            if (p.leaveDecal && Math.hypot(relX, relZ) < 2.35) {
              this.spawnInkDecal(relX, relZ, p.colorHex, p.baseScale * 0.82, p.variantIdx);
              p.leaveDecal = false;
            }
            p.mesh.position.y = 0.48;
            p.vy = -p.vy * 0.18;
            p.vx *= 0.4;
            p.vz *= 0.4;
          }
        } else if (p.kind === 'soul') {
          // "魂" (Hitodama Soul Wisp): helical vortex swirl around the bowl + upward spirit buoyancy
          const dx = p.mesh.position.x - cx;
          const dz = p.mesh.position.z - cz;
          const dist = Math.max(0.25, Math.hypot(dx, dz));
          const tx = -dz / dist;
          const tz = dx / dist;
          p.vx = p.vx * (1 - 2.2 * dt) + tx * p.swirlSpeed * dt;
          p.vz = p.vz * (1 - 2.2 * dt) + tz * p.swirlSpeed * dt;
          p.vy += 3.8 * dt; // upward soul buoyancy
          p.mesh.position.x += p.vx * dt;
          p.mesh.position.y += p.vy * dt;
          p.mesh.position.z += p.vz * dt;

          const pulse = 0.88 + Math.sin(elapsed * 18 + p.swirlPhase) * 0.22;
          const fade = t < 0.15 ? (t / 0.15) : Math.pow(1 - t, 1.35);
          p.primaryMat.opacity = fade * 0.95;
          if (p.secondaryMat) p.secondaryMat.opacity = fade;
          const s = p.baseScale * pulse * (1 + t * 0.35);
          p.mesh.scale.setScalar(s);
        } else {
          // "朱墨" (Vermilion & Sumi Ink Droplet): ballistic arc with gravity, velocity stretch & bowl stain
          p.vy -= 18.5 * dt;
          p.vx *= (1 - 1.2 * dt);
          p.vz *= (1 - 1.2 * dt);
          p.mesh.position.x += p.vx * dt;
          p.mesh.position.y += p.vy * dt;
          p.mesh.position.z += p.vz * dt;

          // Stretch droplet along vertical/motion speed and tumble
          const spd = Math.hypot(p.vx, p.vy, p.vz);
          const stretch = Math.min(2.2, 1 + spd * 0.08);
          const s = p.baseScale * (1 - t * 0.45);
          p.mesh.scale.set(s * 0.85, s * stretch, s * 0.85);
          p.mesh.rotation.x += 9 * dt;
          p.mesh.rotation.z += 7 * dt;
          p.primaryMat.opacity = Math.pow(1 - t, 1.15);

          // If droplet hits the bowl pad or table surface, leave a "朱墨" splatter decal and bounce softly
          if (p.mesh.position.y <= 0.45 && p.vy < 0) {
            const relX = p.mesh.position.x - cx;
            const relZ = p.mesh.position.z - cz;
            if (p.leaveDecal && Math.hypot(relX, relZ) < 2.35) {
              this.spawnInkDecal(relX, relZ, p.colorHex, p.baseScale * 0.72);
              p.leaveDecal = false;
            }
            p.mesh.position.y = 0.45;
            p.vy = -p.vy * 0.32;
            p.vx *= 0.55;
            p.vz *= 0.55;
          }
        }
      }
    }

    // Update "墨滲み・朱墨" Floor Ink-Bleed Decals inside the Chawan Bowl
    if (this.inkDecalPool) {
      for (let i = 0; i < this.inkDecalPool.length; i++) {
        const d = this.inkDecalPool[i];
        if (!d.active) continue;
        d.age += dt;
        const t = d.age / d.life;
        if (t >= 1) {
          d.active = false;
          d.mesh.visible = false;
          continue;
        }
        // Nijimi capillary ink-bleed diffusion across the crimson felt pad
        const bleedProgress = 1 - Math.pow(1 - Math.min(1, t * 2.5), 3);
        const expand = d.baseScale * (0.48 + ((d.nijimiMax || 1.32) - 0.48) * bleedProgress);
        d.mesh.scale.set(expand, expand, 1);
        d.mat.opacity = (1 - Math.pow(t, 1.65)) * 0.88;
      }
    }

    // Update Curved Porcelain Inner-Wall Sumie Ink-Bleed Stains ("碗壁墨迹晕染")
    if (this.wallInkStainPool) {
      for (let i = 0; i < this.wallInkStainPool.length; i++) {
        const st = this.wallInkStainPool[i];
        if (!st.active) continue;
        st.age += dt;
        const t = st.age / st.life;
        if (t >= 1) {
          st.active = false;
          st.mesh.visible = false;
          continue;
        }
        // Fast initial ink-bleed bloom (Nijimi 暈染) + slow downward capillary seep along the porcelain wall
        const bloom = 1 - Math.pow(1 - Math.min(1, t * 2.8), 3);
        const sx = st.baseScale * (0.42 + (st.nijimiGrowX - 0.42) * bloom);
        const sy = st.baseScale * (0.42 + (st.nijimiGrowY - 0.42) * bloom);
        st.mesh.scale.set(sx, sy, 1);
        st.mesh.position.y = st.startY - t * 0.07;
        st.mat.opacity = (1 - Math.pow(t, 1.55)) * 0.92;
      }
    }

    // Update Porcelain Bowl Shockwave Rings
    if (this.bowlShockRings && this.bowlShockRings.length > 0) {
      for (const sr of this.bowlShockRings) {
        sr.age += dt;
        const p = sr.age / sr.duration;
        const s = 1 + p * (sr.maxScale - 1);
        sr.mesh.scale.set(s, 1, s);
        sr.mat.opacity = Math.max(0, (1 - p) * 0.9);
      }
      this.bowlShockRings = this.bowlShockRings.filter(sr => {
        if (sr.age >= sr.duration) {
          this.scene.remove(sr.mesh);
          sr.mesh.geometry.dispose();
          sr.mat.dispose();
          return false;
        }
        return true;
      });
    }

    // Update ripples
    for (const r of this.ripples) {
      r.age += dt;
      const p = r.age / r.duration;
      const s = 1 + p * 2.4;
      r.mesh.scale.set(s, s, 1);
      r.mat.opacity = Math.max(0, (1 - p) * 0.85);
    }
    this.ripples = this.ripples.filter(r => {
      if (r.age >= r.duration) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mat.dispose();
        return false;
      }
      return true;
    });

    this.updatePreviewOverlays();
    if (this.composer && this.ukiyoeFilterMode !== 'off') {
      this.composer.render(dt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  setupInteraction() {
    const dom = this.renderer.domElement;
    let downX = 0;
    let downY = 0;
    let lastRaycastTime = 0;

    dom.addEventListener('pointermove', e => {
      const now = performance.now();
      if (now - lastRaycastTime < 28) return;
      lastRaycastTime = now;

      const rect = dom.getBoundingClientRect();
      _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      _raycaster.setFromCamera(_pointer, this.camera);
      const hits = _raycaster.intersectObjects(this.pickableMeshes, false);
      if (hits.length > 0) {
        const obj = hits[0].object;
        if (obj.userData.isDiceBowl) {
          dom.style.cursor = 'pointer';
          this.onTileHover(-1);
          return;
        }
        if (obj.userData.nodeId !== undefined) {
          dom.style.cursor = 'pointer';
          this.onTileHover(obj.userData.nodeId);
          return;
        }
      }
      dom.style.cursor = 'grab';
      this.onTileHover(-1);
    });

    dom.addEventListener('pointerdown', e => {
      downX = e.clientX;
      downY = e.clientY;
    });

    dom.addEventListener('pointerup', e => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 10) return;
      const rect = dom.getBoundingClientRect();
      _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      _raycaster.setFromCamera(_pointer, this.camera);
      const hits = _raycaster.intersectObjects(this.pickableMeshes, false);
      if (hits.length > 0) {
        const obj = hits[0].object;
        if (obj.userData.isDiceBowl) {
          this.onBowlClick();
          return;
        }
        if (obj.userData.nodeId !== undefined) {
          const nid = obj.userData.nodeId;
          const tg = this.tileMeshes[nid];
          if (tg) {
            tg.userData.currentLift = Math.min(0.55, (tg.userData.currentLift || 0) + 0.16);
          }
          this.spawnTileRipple(nid, '#f5cb5c');
          this.onTileClick(nid);
        }
      }
    });
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.ukiyoePass) {
      const pr = this.renderer.getPixelRatio();
      this.ukiyoePass.uniforms.uResolution.value.set(
        Math.max(1, Math.floor(w * pr)),
        Math.max(1, Math.floor(h * pr)),
      );
      this.ukiyoePass.uniforms.uPaperScale.value.set((w / 420) * 1.15, (h / 420) * 1.15);
    }
  }
}
