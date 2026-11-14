import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* ------------------------------------------------------------------ */
/*  Piece-merging: build whole models as ONE geometry w/ vertex colors */
/* ------------------------------------------------------------------ */
export type V3 = [number, number, number];
export interface Piece {
  t: "b" | "c" | "s";
  s: number[];
  p: V3;
  r?: V3;
  c: number;
}
export const B = (w: number, h: number, d: number, x: number, y: number, z: number, c: number, r?: V3): Piece => ({
  t: "b", s: [w, h, d], p: [x, y, z], c, r,
});
/** cylinder along Z. rFront is toward -Z */
export const C = (rFront: number, rBack: number, len: number, x: number, y: number, z: number, c: number, r?: V3): Piece => ({
  t: "c", s: [rFront, rBack, len, 8], p: [x, y, z], c, r,
});
export const S = (radius: number, x: number, y: number, z: number, c: number): Piece => ({
  t: "s", s: [radius, 10, 8], p: [x, y, z], c,
});

const tmpCol = new THREE.Color();
export function mergePieces(pieces: Piece[]): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  for (const pc of pieces) {
    let g: THREE.BufferGeometry;
    if (pc.t === "b") g = new THREE.BoxGeometry(pc.s[0], pc.s[1], pc.s[2]);
    else if (pc.t === "c") {
      g = new THREE.CylinderGeometry(pc.s[1], pc.s[0], pc.s[2], pc.s[3]);
      g.rotateX(Math.PI / 2);
    } else g = new THREE.SphereGeometry(pc.s[0], pc.s[1], pc.s[2]);
    if (pc.r) {
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pc.r[0], pc.r[1], pc.r[2]));
      g.applyMatrix4(m);
    }
    g.translate(pc.p[0], pc.p[1], pc.p[2]);
    g.deleteAttribute("uv");
    tmpCol.setHex(pc.c);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // subtle per-vertex variation gives a hand-painted look
      const k = 1 + ((i * 7919) % 13) * 0.004;
      col[i * 3] = tmpCol.r * k;
      col[i * 3 + 1] = tmpCol.g * k;
      col[i * 3 + 2] = tmpCol.b * k;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  return merged;
}

/* ------------------------------------------------------------------ */
/*  Procedural canvas textures                                         */
/* ------------------------------------------------------------------ */
function canvas(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return { c, g: c.getContext("2d")! };
}
function tex(c: HTMLCanvasElement, repeat = true, aniso = 2) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}
function speckle(g: CanvasRenderingContext2D, size: number, count: number, light = 0.08) {
  for (let i = 0; i < count; i++) {
    const v = Math.random() > 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * light})`;
    const s = Math.random() * 2 + 1;
    g.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
}

export function groundTexture() {
  const size = 256;
  const { c, g } = canvas(size);
  g.fillStyle = "#85847f";
  g.fillRect(0, 0, size, size);
  // slab variation
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      const v = 120 + Math.random() * 22;
      g.fillStyle = `rgb(${v},${v - 1},${v - 5})`;
      g.fillRect(x * 128, y * 128, 128, 128);
    }
  speckle(g, size, 7000, 0.12);
  // stains
  for (let i = 0; i < 7; i++) {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 40);
    gr.addColorStop(0, "rgba(40,38,34,0.16)");
    gr.addColorStop(1, "rgba(40,38,34,0)");
    g.save();
    g.translate(Math.random() * size, Math.random() * size);
    g.fillStyle = gr;
    g.fillRect(-40, -40, 80, 80);
    g.restore();
  }
  g.strokeStyle = "rgba(25,25,25,0.55)";
  g.lineWidth = 3;
  g.strokeRect(0, 0, size, size);
  g.beginPath();
  g.moveTo(128, 0);
  g.lineTo(128, size);
  g.moveTo(0, 128);
  g.lineTo(size, 128);
  g.lineWidth = 2;
  g.stroke();
  return tex(c, true, 4);
}

export function wallTexture() {
  const size = 256;
  const { c, g } = canvas(size);
  g.fillStyle = "#6c7380";
  g.fillRect(0, 0, size, size);
  speckle(g, size, 4000, 0.1);
  g.strokeStyle = "rgba(15,18,24,0.6)";
  g.lineWidth = 3;
  g.strokeRect(1, 1, size - 2, size - 2);
  g.beginPath();
  g.moveTo(0, 128);
  g.lineTo(size, 128);
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = "rgba(0,0,0,0.18)";
  g.fillRect(0, 200, size, 56);
  // rivets
  g.fillStyle = "rgba(20,22,28,0.7)";
  for (let x = 16; x < size; x += 32) {
    g.fillRect(x, 10, 4, 4);
    g.fillRect(x, 136, 4, 4);
  }
  return tex(c, true, 2);
}

export function crateTexture() {
  const size = 256;
  const { c, g } = canvas(size);
  g.fillStyle = "#a8763e";
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 5; i++) {
    const v = Math.random() * 26 - 13;
    g.fillStyle = `rgb(${168 + v},${118 + v},${62 + v})`;
    g.fillRect(0, i * 51, size, 50);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(0, i * 51 + 49, size, 2);
  }
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(60,35,10,${Math.random() * 0.15})`;
    g.fillRect(Math.random() * size, Math.random() * size, Math.random() * 40 + 8, 1);
  }
  // frame
  g.fillStyle = "#6e4824";
  g.fillRect(0, 0, size, 20);
  g.fillRect(0, size - 20, size, 20);
  g.fillRect(0, 0, 20, size);
  g.fillRect(size - 20, 0, 20, size);
  g.strokeStyle = "#6e4824";
  g.lineWidth = 18;
  g.beginPath();
  g.moveTo(10, 10);
  g.lineTo(size - 10, size - 10);
  g.stroke();
  g.strokeStyle = "rgba(0,0,0,0.4)";
  g.lineWidth = 3;
  g.strokeRect(1, 1, size - 2, size - 2);
  g.fillStyle = "#2b2b2b";
  for (const [x, y] of [[10, 10], [246, 10], [10, 246], [246, 246]]) g.fillRect(x - 2, y - 2, 4, 4);
  return tex(c, true, 2);
}

export function hazardTexture() {
  const size = 128;
  const { c, g } = canvas(size);
  g.fillStyle = "#2a2d33";
  g.fillRect(0, 0, size, size);
  g.save();
  g.translate(size / 2, size / 2);
  g.rotate(-Math.PI / 4);
  for (let i = -6; i < 6; i++) {
    g.fillStyle = i % 2 ? "#f0be12" : "#1d1f22";
    g.fillRect(i * 22, -size, 22, size * 2);
  }
  g.restore();
  speckle(g, size, 800, 0.2);
  g.strokeStyle = "rgba(0,0,0,0.6)";
  g.lineWidth = 3;
  g.strokeRect(0, 0, size, size);
  return tex(c, true, 2);
}

export function radialTexture(inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)", size = 64) {
  const { c, g } = canvas(size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return tex(c, false, 1);
}

export function flashTexture() {
  const size = 128;
  const { c, g } = canvas(size);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,230,1)");
  gr.addColorStop(0.25, "rgba(255,200,90,0.9)");
  gr.addColorStop(0.6, "rgba(255,120,20,0.25)");
  gr.addColorStop(1, "rgba(255,80,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  g.translate(64, 64);
  g.fillStyle = "rgba(255,230,150,0.9)";
  for (let i = 0; i < 6; i++) {
    g.rotate(Math.PI / 3 + Math.random() * 0.2);
    g.beginPath();
    g.moveTo(-3, 0);
    g.lineTo(0, -62 + Math.random() * 14);
    g.lineTo(3, 0);
    g.fill();
  }
  return tex(c, false, 1);
}

/* ------------------------------------------------------------------ */
/*  Weapon view models                                                 */
/* ------------------------------------------------------------------ */
const DARK = 0x202328, MID = 0x40454e, LIGHT = 0x727a88, WOOD = 0x80501f, GOLD = 0xd4a017, GLOVE = 0x1c1e22, SLEEVE = 0x3f5039, OLIVE = 0x4b5a3a;

function hands(rg: V3, lg: V3): Piece[] {
  return [
    B(0.07, 0.075, 0.11, rg[0], rg[1], rg[2], GLOVE),
    B(0.075, 0.075, 0.42, rg[0] + 0.03, rg[1] - 0.09, rg[2] + 0.26, SLEEVE, [0.35, 0.0, -0.2]),
    B(0.07, 0.07, 0.12, lg[0], lg[1], lg[2], GLOVE),
    B(0.075, 0.075, 0.42, lg[0] - 0.07, lg[1] - 0.12, lg[2] + 0.27, SLEEVE, [0.4, 0.3, 0.1]),
  ];
}

const WEAPON_PIECES: Record<string, { main: Piece[]; rotor?: Piece[] }> = {
  pistol: {
    main: [
      B(0.05, 0.055, 0.24, 0, 0.03, -0.12, MID),
      C(0.012, 0.012, 0.03, 0, 0.03, -0.255, DARK),
      B(0.045, 0.04, 0.2, 0, -0.005, -0.1, DARK),
      B(0.042, 0.12, 0.06, 0, -0.075, -0.015, DARK, [0.25, 0, 0]),
      B(0.052, 0.006, 0.1, 0, 0.0585, -0.1, GOLD),
      B(0.01, 0.014, 0.01, 0, 0.065, -0.23, LIGHT),
      ...hands([0, -0.07, 0.0], [-0.02, -0.095, 0.0]),
    ],
  },
  smg: {
    main: [
      B(0.06, 0.1, 0.36, 0, 0, -0.15, DARK),
      B(0.04, 0.02, 0.3, 0, 0.06, -0.15, MID),
      C(0.014, 0.014, 0.2, 0, 0.015, -0.43, MID),
      C(0.024, 0.024, 0.16, 0, 0.015, -0.52, DARK),
      B(0.035, 0.2, 0.05, 0, -0.14, -0.12, MID, [0.08, 0, 0]),
      B(0.045, 0.12, 0.055, 0, -0.1, 0.0, DARK, [0.2, 0, 0]),
      B(0.04, 0.07, 0.14, 0, 0, 0.12, MID),
      B(0.04, 0.1, 0.04, 0, -0.08, -0.3, GOLD),
      ...hands([0, -0.09, 0.0], [0, -0.14, -0.3]),
    ],
  },
  rifle: {
    main: [
      B(0.06, 0.1, 0.38, 0, 0, -0.1, DARK),
      B(0.07, 0.075, 0.32, 0, 0, -0.4, WOOD),
      C(0.012, 0.012, 0.3, 0, 0.02, -0.7, MID),
      C(0.02, 0.02, 0.06, 0, 0.02, -0.88, DARK),
      B(0.015, 0.015, 0.28, 0, 0.055, -0.45, MID),
      B(0.01, 0.04, 0.01, 0, 0.07, -0.72, LIGHT),
      B(0.03, 0.03, 0.1, 0, 0.07, -0.1, MID),
      B(0.04, 0.2, 0.08, 0, -0.15, -0.15, MID, [0.2, 0, 0]),
      B(0.045, 0.12, 0.055, 0, -0.1, 0.04, WOOD, [0.25, 0, 0]),
      B(0.05, 0.11, 0.3, 0, -0.02, 0.3, WOOD),
      B(0.052, 0.008, 0.12, 0, 0.052, -0.1, GOLD),
      ...hands([0, -0.095, 0.04], [0, -0.07, -0.42]),
    ],
  },
  shotgun: {
    main: [
      B(0.065, 0.1, 0.3, 0, 0, -0.05, DARK),
      C(0.022, 0.022, 0.75, 0, 0.025, -0.55, MID),
      C(0.018, 0.018, 0.6, 0, -0.03, -0.5, DARK),
      B(0.07, 0.06, 0.2, 0, -0.04, -0.42, WOOD),
      B(0.05, 0.12, 0.3, 0, -0.03, 0.25, WOOD, [0.1, 0, 0]),
      B(0.01, 0.02, 0.01, 0, 0.06, -0.9, GOLD),
      B(0.045, 0.1, 0.05, 0, -0.09, 0.07, DARK, [0.25, 0, 0]),
      ...hands([0, -0.1, 0.07], [0, -0.065, -0.42]),
    ],
  },
  sniper: {
    main: [
      B(0.055, 0.09, 0.5, 0, 0, -0.05, DARK),
      C(0.014, 0.014, 0.8, 0, 0.015, -0.7, MID),
      C(0.024, 0.024, 0.08, 0, 0.015, -1.12, DARK),
      C(0.03, 0.03, 0.3, 0, 0.095, -0.1, DARK),
      C(0.042, 0.03, 0.07, 0, 0.095, -0.28, MID),
      C(0.03, 0.036, 0.05, 0, 0.095, 0.08, MID),
      C(0.03, 0.03, 0.004, 0, 0.095, -0.316, 0x4aa8ff),
      B(0.02, 0.035, 0.02, 0, 0.065, -0.2, MID),
      B(0.02, 0.035, 0.02, 0, 0.065, 0.0, MID),
      B(0.05, 0.13, 0.34, 0, -0.03, 0.35, OLIVE),
      B(0.04, 0.09, 0.1, 0, -0.09, -0.05, MID),
      B(0.045, 0.11, 0.05, 0, -0.09, 0.14, DARK, [0.25, 0, 0]),
      ...hands([0, -0.1, 0.14], [0, -0.07, -0.4]),
    ],
  },
  rocket: {
    main: [
      C(0.065, 0.065, 0.95, 0, 0.02, -0.35, OLIVE),
      C(0.065, 0.088, 0.12, 0, 0.02, 0.2, DARK),
      C(0.075, 0.075, 0.08, 0, 0.02, -0.8, DARK),
      C(0.012, 0.055, 0.2, 0, 0.02, -0.92, 0xb33a2a),
      B(0.04, 0.12, 0.05, 0, -0.1, -0.1, DARK, [0.15, 0, 0]),
      B(0.04, 0.1, 0.04, 0, -0.1, -0.4, DARK),
      B(0.03, 0.06, 0.05, 0, 0.1, -0.2, MID),
      B(0.074, 0.01, 0.2, 0, 0.0, -0.45, GOLD),
      ...hands([0, -0.14, -0.1], [0, -0.16, -0.4]),
    ],
  },
  minigun: {
    main: [
      B(0.11, 0.13, 0.24, 0, 0, -0.02, DARK),
      B(0.03, 0.08, 0.03, 0, 0.1, -0.04, MID),
      B(0.04, 0.02, 0.22, 0, 0.145, -0.04, MID),
      B(0.04, 0.12, 0.05, 0, -0.1, 0.05, DARK, [0.2, 0, 0]),
      B(0.03, 0.09, 0.03, 0, -0.1, -0.2, DARK),
      B(0.15, 0.1, 0.12, 0.0, -0.11, 0.0, OLIVE),
      C(0.065, 0.065, 0.03, 0, 0, -0.135, MID),
      ...hands([0, -0.09, 0.05], [0, -0.14, -0.2]),
    ],
    rotor: (() => {
      const p: Piece[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        p.push(C(0.011, 0.011, 0.6, Math.cos(a) * 0.036, Math.sin(a) * 0.036, -0.46, LIGHT));
      }
      p.push(C(0.055, 0.055, 0.025, 0, 0, -0.2, MID));
      p.push(C(0.055, 0.055, 0.025, 0, 0, -0.55, MID));
      p.push(C(0.058, 0.058, 0.04, 0, 0, -0.78, DARK));
      p.push(C(0.02, 0.02, 0.5, 0, 0, -0.45, DARK));
      return p;
    })(),
  },
};

export interface WeaponModel {
  group: THREE.Group;
  rotor: THREE.Mesh | null;
  flash: THREE.Mesh;
  geos: THREE.BufferGeometry[];
}

export function buildWeaponModel(id: string, muzzle: V3, flashSize: number, mat: THREE.Material, flashMat: THREE.Material): WeaponModel {
  const def = WEAPON_PIECES[id];
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const gMain = mergePieces(def.main);
  geos.push(gMain);
  const main = new THREE.Mesh(gMain, mat);
  main.frustumCulled = false;
  group.add(main);
  let rotor: THREE.Mesh | null = null;
  if (def.rotor) {
    const gr = mergePieces(def.rotor);
    geos.push(gr);
    rotor = new THREE.Mesh(gr, mat);
    rotor.frustumCulled = false;
    group.add(rotor);
  }
  const fg = new THREE.PlaneGeometry(0.4 * flashSize, 0.4 * flashSize);
  geos.push(fg);
  const flash = new THREE.Mesh(fg, flashMat);
  flash.position.set(muzzle[0], muzzle[1], muzzle[2] - 0.03);
  flash.visible = false;
  flash.frustumCulled = false;
  group.add(flash);
  group.visible = false;
  return { group, rotor, flash, geos };
}

/* ------------------------------------------------------------------ */
/*  Enemies                                                            */
/* ------------------------------------------------------------------ */
export type EnemyKind = "grunt" | "runner" | "heavy" | "marksman";

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  scale: number;
  dmg: number;
  headMult: number;
  score: number;
  range: number;
  keepMin: number;
  keepMax: number;
  fireMin: number;
  fireMax: number;
  burst: number;
  melee: boolean;
  acc: number;
  armor: number;
  cloth: number;
  trim: number;
  helmet: number;
  visor: number;
  bulk: number;
  gun: number;
  skin: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  grunt: {
    kind: "grunt", name: "Grunt", hp: 100, speed: 3.4, scale: 1, dmg: 7, headMult: 2.5, score: 100, range: 38,
    keepMin: 8, keepMax: 18, fireMin: 0.8, fireMax: 1.5, burst: 2, melee: false, acc: 0.7,
    armor: 0x4f5d3a, cloth: 0x2f3626, trim: 0x8a7a4a, helmet: 0x3b4630, visor: 0x39d0ff, bulk: 1, gun: 1, skin: 0xd8a47a,
  },
  runner: {
    kind: "runner", name: "Rusher", hp: 62, speed: 6.6, scale: 0.94, dmg: 14, headMult: 2.3, score: 120, range: 2,
    keepMin: 0, keepMax: 0, fireMin: 0.7, fireMax: 0.9, burst: 1, melee: true, acc: 1,
    armor: 0x9c2a2a, cloth: 0x4a1616, trim: 0xe0a030, helmet: 0x601818, visor: 0xff5a30, bulk: 0.85, gun: 0, skin: 0xc99070,
  },
  heavy: {
    kind: "heavy", name: "Juggernaut", hp: 380, speed: 2.2, scale: 1.32, dmg: 6, headMult: 1.6, score: 320, range: 40,
    keepMin: 10, keepMax: 22, fireMin: 1.3, fireMax: 2.0, burst: 6, melee: false, acc: 0.6,
    armor: 0x454b56, cloth: 0x23262c, trim: 0xd4531a, helmet: 0x2e323a, visor: 0xff3030, bulk: 1.35, gun: 1.3, skin: 0xb98866,
  },
  marksman: {
    kind: "marksman", name: "Marksman", hp: 78, speed: 2.8, scale: 1.02, dmg: 26, headMult: 2.5, score: 220, range: 80,
    keepMin: 30, keepMax: 52, fireMin: 2.4, fireMax: 3.6, burst: 1, melee: false, acc: 0.88,
    armor: 0x3a3558, cloth: 0x211f33, trim: 0x9a6bff, helmet: 0x2a2640, visor: 0xc060ff, bulk: 0.92, gun: 1.8, skin: 0xd0a080,
  },
};

export interface EnemyGeos {
  body: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  legL: THREE.BufferGeometry;
  legR: THREE.BufferGeometry;
  muzzle: V3;
}

export function buildEnemyGeos(d: EnemyDef): EnemyGeos {
  const b = d.bulk;
  const body: Piece[] = [
    B(0.44 * b, 0.2, 0.26, 0, 0.9, 0, d.cloth),
    B(0.5 * b, 0.55, 0.3, 0, 1.2, 0, d.armor),
    B(0.44 * b, 0.3, 0.06, 0, 1.25, 0.16, d.trim),
    B(0.3 * b, 0.42, 0.16, 0, 1.22, -0.22, d.cloth),
    B(0.15 * b, 0.14, 0.22, 0.31 * b, 1.4, 0, d.armor),
    B(0.15 * b, 0.14, 0.22, -0.31 * b, 1.4, 0, d.armor),
    B(0.1, 0.1, 0.1, 0, 1.5, 0, d.skin),
    B(0.46 * b, 0.05, 0.28, 0, 0.98, 0, d.trim),
  ];
  let muzzle: V3 = [0.04, 1.28, 0.6];
  if (d.gun > 0) {
    const gl = 0.5 * d.gun;
    body.push(B(0.1, 0.1, 0.5, 0.22 * b, 1.28, 0.27, d.cloth));
    body.push(B(0.1, 0.1, 0.45, -0.16 * b, 1.26, 0.3, d.cloth));
    body.push(B(0.07, 0.11, gl, 0.04, 1.28, 0.3 + gl / 2, 0x1a1c20));
    body.push(C(0.016, 0.016, 0.25 * d.gun, 0.04, 1.29, 0.3 + gl + 0.1 * d.gun, 0x101214));
    if (d.kind === "heavy") body.push(B(0.2, 0.2, 0.2, 0.04, 1.1, 0.5, 0x25282d));
    muzzle = [0.04, 1.29, 0.3 + gl + 0.25 * d.gun];
  } else {
    // arms swing out wide for melee runner
    body.push(B(0.1, 0.1, 0.5, 0.26 * b, 1.3, 0.22, d.cloth, [0, -0.15, 0]));
    body.push(B(0.1, 0.1, 0.5, -0.26 * b, 1.3, 0.22, d.cloth, [0, 0.15, 0]));
    body.push(B(0.04, 0.04, 0.2, 0.34 * b, 1.3, 0.55, 0xdddddd));
    body.push(B(0.04, 0.04, 0.2, -0.34 * b, 1.3, 0.55, 0xdddddd));
  }
  const head: Piece[] = [
    S(0.17, 0, 0.17, 0, d.skin),
    S(0.185, 0, 0.235, -0.015, d.helmet),
    B(0.27, 0.06, 0.06, 0, 0.19, 0.145, d.visor),
  ];
  const leg = (x: number): Piece[] => [
    B(0.17 * b, 0.84, 0.2, x * b, -0.42, 0, d.cloth),
    B(0.185 * b, 0.12, 0.28, x * b, -0.82, 0.04, 0x15171a),
    B(0.19 * b, 0.2, 0.22, x * b, -0.25, 0.02, d.armor),
  ];
  return { body: mergePieces(body), head: mergePieces(head), legL: mergePieces(leg(-0.12)), legR: mergePieces(leg(0.12)), muzzle };
}

/* ------------------------------------------------------------------ */
/*  Pickups                                                            */
/* ------------------------------------------------------------------ */
export function buildPickupGeos() {
  const health = mergePieces([
    B(0.44, 0.3, 0.3, 0, 0, 0, 0xeeeeee),
    B(0.26, 0.08, 0.32, 0, 0, 0, 0xd8202a),
    B(0.08, 0.32, 0.32, 0, 0, 0, 0xd8202a),
  ]);
  const ammo = mergePieces([
    B(0.44, 0.28, 0.3, 0, 0, 0, 0x4d5a36),
    B(0.46, 0.06, 0.32, 0, 0.06, 0, 0xe8b820),
    C(0.035, 0.035, 0.2, -0.1, 0.17, 0, 0xc9a24a, [0, 0, 0]),
    C(0.035, 0.035, 0.2, 0, 0.17, 0, 0xc9a24a),
    C(0.035, 0.035, 0.2, 0.1, 0.17, 0, 0xc9a24a),
  ]);
  return { health, ammo };
}

/** Axis-aligned box with UVs scaled to world size (for tiling textures on merged geometry). */
export function boxGeoUV(w: number, h: number, d: number, tile = 4): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // face order: +x -x +y -y +z -z ; 4 verts each
  const dims: [number, number][] = [
    [d, h], [d, h], [w, d], [w, d], [w, h], [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, (uv.getX(idx) * dims[f][0]) / tile, (uv.getY(idx) * dims[f][1]) / tile);
    }
  }
  return g;
}
