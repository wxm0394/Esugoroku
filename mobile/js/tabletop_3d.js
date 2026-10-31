// Three.js 3D Tabletop Engine for E-Sugoroku (江戸浮世絵・立体絵双六)
// Implements raised 3D woodblock print tiles, composite Kokeshi pawns with step-by-step hopping,
// true 3D bone dice with inset spherical pips inside a porcelain chawan bowl, and preview arcs.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BOARDS } from './boards.js';
import { EsugorokuCore } from './core.js';
import { G, currentBoard } from './state.js';
import { create3DTileCanvas, UKIYOE_INK } from './nishikie_woodblock.js';

const SCALE = 0.04; // 800x640 logical board -> 32.0 x 25.6 world units
const BOARD_W = 800 * SCALE;
const BOARD_D = 640 * SCALE;

// Reusable math objects (zero GC in render loop)
const _vec3 = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _quatTarget = new THREE.Quaternion();
const _euler = new THREE.Euler();
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

// Rotations that place face `value` (1..6) pointing straight UP (+Y)
// Face mapping on BoxGeometry:
// +X (right): 2, -X (left): 5, +Y (top): 1, -Y (bottom): 6, +Z (front): 3, -Z (back): 4
export function getDieFaceUpEuler(value, yaw = 0) {
  switch (value) {
    case 1: return new THREE.Euler(0, yaw, 0, 'YXZ');
    case 6: return new THREE.Euler(Math.PI, yaw, 0, 'YXZ');
    case 2: return new THREE.Euler(0, yaw, Math.PI / 2, 'ZXY');
    case 5: return new THREE.Euler(0, yaw, -Math.PI / 2, 'ZXY');
    case 3: return new THREE.Euler(-Math.PI / 2, yaw, 0, 'XYZ');
    case 4: return new THREE.Euler(Math.PI / 2, yaw, 0, 'XYZ');
    default: return new THREE.Euler(0, yaw, 0, 'YXZ');
  }
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
  c.width = 320;
  c.height = 104;
  const ctx = c.getContext('2d');

  ctx.fillStyle = bgColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(8, 8, c.width - 16, c.height - 16, 22);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fff9ec';
  ctx.font = '800 44px "Shippori Mincho B1", "Noto Serif SC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + 2);

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

    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.5, 160);
    this.camera.position.set(2.2, 36.5, 27.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.minPolarAngle = Math.PI * 0.06;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 60;
    this.controls.target.set(2.2, -1.2, 2.2);
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

    this.setupInteraction();
    window.addEventListener('resize', () => this.onResize());
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
      this.createKokeshiPawn(0, '#c83223', '#f5cb5c', 'あなた・旅'),
      this.createKokeshiPawn(1, '#1d5478', '#d9e6f2', '相手・伴'),
    ];
    this.pawns.forEach(p => this.scene.add(p));
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
    // Place the 3D Porcelain Dice Bowl (Chawan) cleanly to the right of the board
    this.bowlCenter = new THREE.Vector3(BOARD_W * 0.5 + 4.2, 0.0, 2.2);
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

    // Sometsuke Prussian-blue rim ring & inner felt pad
    const rimRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.28, 0.14, 14, 36),
      new THREE.MeshStandardMaterial({ color: '#1b4b72', roughness: 0.25, metalness: 0.2 }),
    );
    rimRing.rotation.x = Math.PI / 2;
    rimRing.position.y = 1.38;
    bowlGroup.add(rimRing);

    const padMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(2.75, 2.75, 0.08, 32),
      new THREE.MeshStandardMaterial({ color: '#8a241b', roughness: 0.78, metalness: 0.05 }),
    );
    padMesh.position.y = 0.38;
    padMesh.receiveShadow = true;
    padMesh.userData.isDiceBowl = true;
    bowlGroup.add(padMesh);
    this.pickableMeshes.push(padMesh);

    // Overhead label above the 3D dice bowl
    const bowlLabel = createTextSprite('🎲 賽碗 (クリックで振る)', '#1d364d', '#e5be62', 3.6, 0.92);
    bowlLabel.position.set(0, 3.6, 0);
    bowlGroup.add(bowlLabel);

    this.scene.add(bowlGroup);
    this.bowlGroup = bowlGroup;

    // True 3D Bone Die (Composite Group: 6 textured faces + 3D recessed spherical pips)
    // BoxGeometry material order: [+X (2), -X (5), +Y (1), -Y (6), +Z (3), -Z (4)]
    const faceOrder = [2, 5, 1, 6, 3, 4];
    const materials = faceOrder.map(val => new THREE.MeshStandardMaterial({
      map: createDieFaceTexture(val),
      roughness: 0.26,
      metalness: 0.06,
    }));

    const dieSize = 1.48;
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
    const redPipMat = new THREE.MeshStandardMaterial({ color: '#c82517', roughness: 0.25 });
    const blackPipMat = new THREE.MeshStandardMaterial({ color: '#140f0c', roughness: 0.3 });
    const half = dieSize * 0.5;

    const addFacePips = (val, normalAxis, sign) => {
      const coords = pipLayouts[val];
      const r = val === 1 ? dieSize * 0.13 : dieSize * 0.072;
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

    dieGroup.position.set(this.bowlCenter.x, 0.42 + half, this.bowlCenter.z);
    this.scene.add(dieGroup);
    this.dieMesh = dieGroup;
  }

  buildBoard(boardIndex) {
    this.builtBoardIdx = boardIndex;
    const board = BOARDS[boardIndex];

    // Dispose old board meshes
    while (this.boardGroup.children.length > 0) {
      const child = this.boardGroup.children[0];
      this.boardGroup.remove(child);
    }
    this.pickableMeshes = this.pickableMeshes.filter(m => m.userData.isDiceBowl);
    this.tileMeshes = [];
    this.regaliaMeshes = [];
    this.lanternMeshes = [];
    this.lastPreviewKey = '';

    // Board Washi Surface Plate
    const surfaceColors = {
      tokaido: '#dfd0ae',
      yokai: '#1d2733',
      kesshu: '#d5be93',
      genji: '#e2d1ae',
    };
    const surfaceMat = new THREE.MeshStandardMaterial({
      color: surfaceColors[board.id] || '#dfd0ae',
      roughness: 0.72,
      metalness: 0.05,
    });
    const surfaceMesh = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W + 1.2, 0.14, BOARD_D + 1.2), surfaceMat);
    surfaceMesh.position.set(0, 0.02, 0);
    surfaceMesh.receiveShadow = true;
    this.boardGroup.add(surfaceMesh);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    // Build 3D Raised Woodblock Tiles for every node
    for (const node of board.nodes) {
      const tileGroup = new THREE.Group();
      const w = node.w * SCALE * 0.96;
      const d = node.h * SCALE * 0.96;
      const isGoal = node.kind === 'goal';
      const h = isGoal ? 0.58 : (node.kind === 'start' || node.kind === 'jump' || node.kind === 'stay' ? 0.42 : 0.32);

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
      topTex.anisotropy = maxAniso;

      const topMat = new THREE.MeshStandardMaterial({
        map: topTex,
        roughness: 0.48,
        metalness: 0.04,
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
  }

  // Updates 3D glowing preview arcs and numbered badges (①..⑥) for where rolls 1..6 will land
  updatePreviewOverlays() {
    const board = currentBoard();
    if (!G.match || G.screen !== 'PLAYING' || G.phase !== 'ROLL' || G.match.turn !== G.match.humanSide) {
      if (this.previewGroup.children.length > 0) {
        while (this.previewGroup.children.length > 0) {
          this.previewGroup.remove(this.previewGroup.children[0]);
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
      this.previewGroup.remove(this.previewGroup.children[0]);
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
        1.85,
        0.62,
      );
      const angleOffset = ((roll - 1) / 6) * Math.PI * 2;
      badge.position.set(
        pEnd.x + Math.cos(angleOffset) * 0.65,
        pEnd.y + 0.95 + (roll % 2) * 0.28,
        pEnd.z + Math.sin(angleOffset) * 0.45,
      );
      this.previewGroup.add(badge);

      // Parabolic 3D trajectory arc on Yokai board or when hovering destination
      if (board.id === 'yokai' || G.hoverNode === destId || destObj?.kind === 'jump') {
        const mid = new THREE.Vector3(
          (pStart.x + pEnd.x) * 0.5,
          Math.max(pStart.y, pEnd.y) + 2.0 + roll * 0.22,
          (pStart.z + pEnd.z) * 0.5,
        );
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(pStart.x, pStart.y + 0.35, pStart.z),
          mid,
          new THREE.Vector3(pEnd.x, pEnd.y + 0.35, pEnd.z),
        );
        const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.06, 8, false);
        const tubeMat = new THREE.MeshBasicMaterial({
          color: roll % 2 === 0 ? '#f0c24b' : '#df5745',
          transparent: true,
          opacity: 0.72,
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
    const geo = new THREE.RingGeometry(0.35, 0.58, 28);
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
        pos: new THREE.Vector3(1.2, 41.5, 2.5),
        target: new THREE.Vector3(1.2, 0, 0.2),
      };
    } else if (preset === 'follow') {
      const board = currentBoard();
      const humanPos = G.match ? G.match.pos[G.match.humanSide] : 0;
      const c = nodeWorldCenter(board.nodes[humanPos] || board.nodes[0]);
      this.presetTransition = {
        pos: new THREE.Vector3(c.x + 2.5, 19.5, c.z + 13.5),
        target: new THREE.Vector3(c.x + 1.5, 0.5, c.z),
      };
    } else {
      this.presetTransition = {
        pos: new THREE.Vector3(1.5, 30.5, 22.8),
        target: new THREE.Vector3(1.5, 0, 0.8),
      };
    }
  }

  update(dt, elapsed) {
    if (this.builtBoardIdx !== G.boardIdx) {
      this.buildBoard(G.boardIdx);
    }

    const board = currentBoard();

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

    // Update tile hover elevation & active player square glow
    for (let i = 0; i < this.tileMeshes.length; i++) {
      const tg = this.tileMeshes[i];
      if (!tg) continue;
      const isHovered = G.hoverNode === i;
      const isOccupied = G.match && (G.match.pos[0] === i || G.match.pos[1] === i);
      const targetLift = isHovered ? 0.34 : (isOccupied ? 0.12 : 0);
      tg.userData.currentLift = THREE.MathUtils.damp(tg.userData.currentLift, targetLift, 12, dt);
      tg.position.y = tg.userData.currentLift;
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
      for (let side = 0; side < 2; side++) {
        const pawn = this.pawns[side];
        const bodyGroup = pawn.userData.bodyGroup;
        const sideOffsetX = side === 0 ? -0.62 : 0.62;
        const sideOffsetZ = side === 0 ? 0.28 : -0.28;

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

          // High parabolic hop arc + squash & stretch
          const hopArc = Math.sin(localT * Math.PI) * 1.65;
          pawn.position.set(wx, baseH + hopArc, wz);

          // Forward pitch during hop
          const pitch = Math.sin(localT * Math.PI * 2) * 0.24;
          bodyGroup.rotation.x = pitch;
          const squash = localT < 0.15 || localT > 0.85 ? 0.90 : 1.08;
          bodyGroup.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
        } else {
          const nodeIdx = G.match.pos[side] ?? 0;
          const c = nodeWorldCenter(board.nodes[nodeIdx] || board.nodes[0]);
          _targetPos.set(c.x + sideOffsetX, c.y + 0.08, c.z + sideOffsetZ);
          pawn.position.lerp(_targetPos, 1 - Math.exp(-14 * dt));
          bodyGroup.rotation.x = THREE.MathUtils.damp(bodyGroup.rotation.x, 0, 10, dt);
          // Subtle idle breathing bob on active turn
          const isTurn = G.match.turn === side && G.phase === 'ROLL';
          const bob = isTurn ? Math.abs(Math.sin(elapsed * 4.2)) * 0.18 : 0;
          pawn.position.y = c.y + 0.08 + bob;
          bodyGroup.scale.set(1, 1, 1);
        }
      }
    }

    // Update 3D Bone Die inside the Porcelain Bowl
    const dieState = G.physDice[0];
    if (dieState && this.dieMesh) {
      const half = 0.74;
      if (!dieState.settled && !dieState.settling) {
        // Map 2D tray physics coordinates into 3D bowl coordinates
        const relX = ((dieState.x - 1120) / 70) * 1.45;
        const relZ = ((dieState.y - 625) / 55) * 1.45;
        const liftY = Math.max(0, dieState.z * 0.065);
        this.dieMesh.position.set(
          this.bowlCenter.x + THREE.MathUtils.clamp(relX, -1.5, 1.5),
          0.42 + half + liftY,
          this.bowlCenter.z + THREE.MathUtils.clamp(relZ, -1.5, 1.5),
        );
        this.dieMesh.rotation.set(dieState.rx, dieState.ry, dieState.rz);
      } else {
        // Smoothly settle at center of bowl with exact rolled value pointing straight UP (+Y)
        this.dieMesh.position.lerp(
          _vec3.set(this.bowlCenter.x, 0.42 + half, this.bowlCenter.z),
          1 - Math.exp(-14 * dt),
        );
        const upEuler = getDieFaceUpEuler(dieState.value || G.diceValue || 1, 0.25);
        _quatTarget.setFromEuler(upEuler);
        this.dieMesh.quaternion.slerp(_quatTarget, 1 - Math.exp(-16 * dt));
      }

      // Bowl shake feedback when holding/shaking cup
      if (G.tube.shake > 0) {
        this.bowlGroup.position.x = this.bowlCenter.x + Math.sin(elapsed * 48) * 0.18 * G.tube.shake;
        this.bowlGroup.position.z = this.bowlCenter.z + Math.cos(elapsed * 42) * 0.14 * G.tube.shake;
      } else {
        this.bowlGroup.position.copy(this.bowlCenter);
      }
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
    this.renderer.render(this.scene, this.camera);
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
          this.onTileClick(obj.userData.nodeId);
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
  }
}
