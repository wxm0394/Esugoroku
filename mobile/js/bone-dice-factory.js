// Esugoroku V2.1 Bone Dice Factory Module
// Real Three.js bone dice factory extracted from Tabletop3D.setupDiceBowlAndDie()
// 遵循 Esugoroku V2.1 Three.js 规范与 Edo 浮世绘风格

/**
 * Creates texture for a single die face (1..6) on a 256x256 canvas.
 * @param {number} faceValue - Face number (1..6)
 * @returns {THREE.CanvasTexture}
 */
export function createDieFaceTexture(faceValue) {
  if (typeof THREE === 'undefined') {
    throw new Error('Three.js (THREE) is required to create die face textures.');
  }

  const size = 256;
  const c = typeof document !== 'undefined'
    ? document.createElement('canvas')
    : { width: size, height: size, getContext: () => null };

  if (c.width !== size) c.width = size;
  if (c.height !== size) c.height = size;

  const ctx = typeof c.getContext === 'function' ? c.getContext('2d') : null;

  if (ctx) {
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
  }

  const tex = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  return tex;
}

// BoxGeometry face material order: [+X (2), -X (5), +Y (1), -Y (6), +Z (3), -Z (4)]
const FACE_ORDER = [2, 5, 1, 6, 3, 4];

/**
 * Creates a real Three.js bone dice composite group with 6 textured faces and 3D recessed spherical pips.
 * @param {object} [options] - Configuration options
 * @param {boolean} [options.enableShadow=true] - Whether shadows are cast/received
 * @returns {{ group: THREE.Group, pickableMesh: THREE.Mesh }}
 */
export function createBoneDiceFactory(options = {}) {
  if (typeof THREE === 'undefined') {
    throw new Error('Three.js (THREE) is required to create bone dice.');
  }

  const enableShadow = options.enableShadow !== false;
  const dieSize = 1.68;

  // BoxGeometry material order: [+X (2), -X (5), +Y (1), -Y (6), +Z (3), -Z (4)]
  const materials = FACE_ORDER.map(val => {
    const mat = new THREE.MeshStandardMaterial({
      map: createDieFaceTexture(val),
      emissive: '#3d2f1d',
      emissiveIntensity: 0.18,
      roughness: 0.24,
      metalness: 0.05,
    });
    mat.userData = { faceValue: val };
    return mat;
  });

  const dieGroup = new THREE.Group();
  const cubeMesh = new THREE.Mesh(new THREE.BoxGeometry(dieSize, dieSize, dieSize), materials);
  cubeMesh.castShadow = enableShadow;
  cubeMesh.receiveShadow = enableShadow;
  cubeMesh.userData.isDiceBowl = true;
  dieGroup.add(cubeMesh);

  // 3D inset spherical pips on all 6 faces
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

  dieGroup.rotation.order = 'YXZ';

  return {
    group: dieGroup,
    pickableMesh: cubeMesh
  };
}
