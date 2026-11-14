import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { boxGeoUV, crateTexture, groundTexture, hazardTexture, wallTexture } from "./models";

export const HALF = 46;

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
}

export interface RayHit {
  t: number;
  nx: number;
  ny: number;
  nz: number;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function colored(g: THREE.BufferGeometry, hex: number) {
  g.deleteAttribute("uv");
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}

export class World {
  group = new THREE.Group();
  boxes: Box[] = [];
  spawns: { x: number; z: number }[] = [];
  private textures: THREE.Texture[] = [];

  constructor() {
    const rng = mulberry32(1337);
    const geoms: Record<"wall" | "crate" | "hazard", THREE.BufferGeometry[]> = { wall: [], crate: [], hazard: [] };
    const trim: THREE.BufferGeometry[] = [];
    const decal: THREE.BufferGeometry[] = [];

    const add = (kind: "wall" | "crate" | "hazard", cx: number, cz: number, w: number, d: number, h: number, tile = 4) => {
      this.boxes.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, maxY: h });
      const g = boxGeoUV(w, h, d, tile);
      g.translate(cx, h / 2, cz);
      geoms[kind].push(g);
    };
    const strip = (cx: number, cy: number, cz: number, w: number, h: number, d: number, hex: number) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(cx, cy, cz);
      trim.push(colored(g, hex));
    };
    const flat = (cx: number, cz: number, w: number, d: number, hex: number) => {
      const g = new THREE.PlaneGeometry(w, d);
      g.rotateX(-Math.PI / 2);
      g.translate(cx, 0.03, cz);
      decal.push(colored(g, hex));
    };

    /* ---- perimeter ---- */
    const T = 3;
    add("wall", 0, -HALF - T / 2, (HALF + T) * 2, T, 6);
    add("wall", 0, HALF + T / 2, (HALF + T) * 2, T, 6);
    add("wall", -HALF - T / 2, 0, T, HALF * 2, 6);
    add("wall", HALF + T / 2, 0, T, HALF * 2, 6);
    // neon trim on the inside of the perimeter
    strip(0, 5.3, -HALF + 0.06, HALF * 2, 0.28, 0.1, 0x2ee6ff);
    strip(0, 5.3, HALF - 0.06, HALF * 2, 0.28, 0.1, 0xff7a1a);
    strip(-HALF + 0.06, 5.3, 0, 0.1, 0.28, HALF * 2, 0xff3a8a);
    strip(HALF - 0.06, 5.3, 0, 0.1, 0.28, HALF * 2, 0x7dff5a);
    strip(0, 0.35, -HALF + 0.06, HALF * 2, 0.12, 0.1, 0x2ee6ff);
    strip(0, 0.35, HALF - 0.06, HALF * 2, 0.12, 0.1, 0xff7a1a);
    strip(-HALF + 0.06, 0.35, 0, 0.1, 0.12, HALF * 2, 0xff3a8a);
    strip(HALF - 0.06, 0.35, 0, 0.1, 0.12, HALF * 2, 0x7dff5a);

    /* ---- central platform + stairs ---- */
    const PZ = -6;
    add("wall", 0, PZ, 16, 12, 2.0);
    strip(0, 2.02, PZ + 6.02, 16, 0.05, 0.1, 0xffc400);
    strip(0, 2.02, PZ - 6.02, 16, 0.05, 0.1, 0xffc400);
    strip(8.02, 2.02, PZ, 0.1, 0.05, 12, 0xffc400);
    strip(-8.02, 2.02, PZ, 0.1, 0.05, 12, 0xffc400);
    const stairs = (dir: "n" | "s" | "e" | "w") => {
      for (let i = 0; i < 3; i++) {
        const h = 1.5 - i * 0.5;
        const off = 0.55 + i * 1.1;
        if (dir === "s") add("hazard", 0, PZ + 6 + off, 4, 1.1, h, 2);
        if (dir === "n") add("hazard", 0, PZ - 6 - off, 4, 1.1, h, 2);
        if (dir === "e") add("hazard", 8 + off, PZ, 1.1, 4, h, 2);
        if (dir === "w") add("hazard", -8 - off, PZ, 1.1, 4, h, 2);
      }
    };
    stairs("s");
    stairs("n");
    stairs("e");
    stairs("w");
    // platform cover
    add("crate", -5, PZ - 2, 2, 1.2, 1.1, 2.2);
    add("crate", 5, PZ + 2, 2, 1.2, 1.1, 2.2);
    add("wall", 0, PZ, 1.6, 1.6, 4.2);
    strip(0, 4.22, PZ, 1.7, 0.08, 1.7, 0x2ee6ff);

    /* ---- towers in the corners ---- */
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      add("wall", sx * 34, sz * 34, 5, 5, 7.5);
      strip(sx * 34, 7.55, sz * 34, 5.1, 0.12, 5.1, sx * sz > 0 ? 0xff7a1a : 0x2ee6ff);
      strip(sx * 34, 2.0, sz * 34, 5.1, 0.1, 5.1, sx * sz > 0 ? 0xff7a1a : 0x2ee6ff);
    }

    /* ---- hand placed cover walls ---- */
    const walls: [number, number, number, number, number][] = [
      [-19, -6, 9, 1.2, 3.2], [19, -6, 9, 1.2, 3.2],
      [-20, 14, 1.2, 9, 3.2], [20, 14, 1.2, 9, 3.2],
      [0, -32, 14, 1.2, 3.2], [-32, 2, 1.2, 12, 3.2], [32, 2, 1.2, 12, 3.2],
      [-10, 22, 6, 1.2, 2.6], [10, 22, 6, 1.2, 2.6],
    ];
    for (const [x, z, w, d, h] of walls) {
      add("wall", x, z, w, d, h);
      strip(x, h + 0.03, z, w + 0.05, 0.06, d + 0.05, 0xffc400);
    }

    /* ---- procedural props ---- */
    const free = (cx: number, cz: number, w: number, d: number, margin: number) => {
      if (Math.abs(cx) + w / 2 > HALF - 3 || Math.abs(cz) + d / 2 > HALF - 3) return false;
      if (Math.abs(cx) < 7 + w / 2 && cz > 26 - d / 2) return false; // player spawn
      for (const b of this.boxes) {
        if (cx + w / 2 + margin > b.minX && cx - w / 2 - margin < b.maxX && cz + d / 2 + margin > b.minZ && cz - d / 2 - margin < b.maxZ) return false;
      }
      return true;
    };
    let tries = 0;
    let crates = 0;
    while (crates < 26 && tries++ < 600) {
      const s = 1.4 + rng() * 1.0;
      const h = rng() < 0.3 ? 2.3 : rng() < 0.5 ? 1.2 : 1.1;
      const x = (rng() * 2 - 1) * (HALF - 5);
      const z = (rng() * 2 - 1) * (HALF - 5);
      if (!free(x, z, s, s, 2.2)) continue;
      add("crate", x, z, s, s, h, 2.2);
      crates++;
    }
    tries = 0;
    let barriers = 0;
    while (barriers < 12 && tries++ < 600) {
      const alongX = rng() < 0.5;
      const w = alongX ? 4.6 : 1.1;
      const d = alongX ? 1.1 : 4.6;
      const x = (rng() * 2 - 1) * (HALF - 5);
      const z = (rng() * 2 - 1) * (HALF - 5);
      if (!free(x, z, w, d, 2.0)) continue;
      add("hazard", x, z, w, d, 1.25, 2);
      barriers++;
    }

    /* ---- floor markings ---- */
    const yl = 0xd9b21a, wh = 0xb8bcc4;
    const rect = (cx: number, cz: number, w: number, d: number, t: number, hex: number) => {
      flat(cx, cz - d / 2, w + t, t, hex);
      flat(cx, cz + d / 2, w + t, t, hex);
      flat(cx - w / 2, cz, t, d, hex);
      flat(cx + w / 2, cz, t, d, hex);
    };
    rect(0, PZ, 26, 22, 0.3, yl);
    rect(0, 36, 14, 10, 0.25, wh);
    for (let i = -2; i <= 2; i++) flat(i * 2.5, 36, 0.2, 9, wh);
    flat(0, 0, 0.3, HALF * 2 - 8, 0x70747c);
    flat(0, 0, HALF * 2 - 8, 0.3, 0x70747c);
    const ring = new THREE.RingGeometry(21.6, 22, 64);
    ring.rotateX(-Math.PI / 2);
    ring.translate(0, 0.031, PZ);
    decal.push(colored(ring, wh));

    /* ---- spawn points for enemies ---- */
    const inside = (x: number, z: number) => this.boxes.some((b) => x > b.minX - 1.4 && x < b.maxX + 1.4 && z > b.minZ - 1.4 && z < b.maxZ + 1.4);
    for (let i = 0; i < 80 && this.spawns.length < 28; i++) {
      const ang = rng() * Math.PI * 2;
      const rad = 14 + rng() * 28;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      if (Math.abs(x) > HALF - 3 || Math.abs(z) > HALF - 3) continue;
      if (!inside(x, z)) this.spawns.push({ x, z });
    }

    /* ---- build meshes ---- */
    const gt = groundTexture();
    gt.repeat.set(60, 60);
    const wt = wallTexture();
    const ct = crateTexture();
    const ht = hazardTexture();
    this.textures.push(gt, wt, ct, ht);

    const groundGeo = new THREE.PlaneGeometry(480, 480);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ map: gt }));
    ground.matrixAutoUpdate = false;
    ground.receiveShadow = true;
    this.group.add(ground);

    const mk = (list: THREE.BufferGeometry[], map: THREE.Texture) => {
      const m = new THREE.Mesh(mergeGeometries(list, false)!, new THREE.MeshLambertMaterial({ map }));
      m.castShadow = true;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.frustumCulled = false;
      this.group.add(m);
    };
    mk(geoms.wall, wt);
    mk(geoms.crate, ct);
    mk(geoms.hazard, ht);

    const trimMesh = new THREE.Mesh(mergeGeometries(trim, false)!, new THREE.MeshBasicMaterial({ vertexColors: true }));
    trimMesh.matrixAutoUpdate = false;
    trimMesh.frustumCulled = false;
    this.group.add(trimMesh);

    const decalMat = new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, transparent: true, opacity: 0.8, depthWrite: false });
    const decalMesh = new THREE.Mesh(mergeGeometries(decal, false)!, decalMat);
    decalMesh.matrixAutoUpdate = false;
    decalMesh.frustumCulled = false;
    decalMesh.renderOrder = 1;
    this.group.add(decalMesh);

    /* ---- distant skyline (purely visual) ---- */
    const sky: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 70; i++) {
      const ang = (i / 70) * Math.PI * 2 + rng() * 0.08;
      const rad = 150 + rng() * 40;
      const w = 10 + rng() * 22;
      const h = 14 + rng() * 55;
      const g = new THREE.BoxGeometry(w, h, 10 + rng() * 18);
      g.rotateY(ang);
      g.translate(Math.cos(ang) * rad, h / 2 - 1, Math.sin(ang) * rad);
      const v = 0.32 + rng() * 0.16;
      sky.push(colored(g, new THREE.Color(v * 0.9, v, v * 1.15).getHex()));
    }
    const skyMesh = new THREE.Mesh(mergeGeometries(sky, false)!, new THREE.MeshLambertMaterial({ vertexColors: true }));
    skyMesh.matrixAutoUpdate = false;
    skyMesh.frustumCulled = false;
    this.group.add(skyMesh);
  }

  /** Slab raycast against all boxes + ground plane. dir must be normalized. */
  ray(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out: RayHit, ground = true, useBoxes = true): boolean {
    let best = maxT;
    let found = false;
    const bs = useBoxes ? this.boxes : [];
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      let tmin = 0;
      let tmax = best;
      let nx = 0, ny = 0, nz = 0;
      let entered = false;
      // X
      if (Math.abs(dx) < 1e-9) {
        if (ox < b.minX || ox > b.maxX) continue;
      } else {
        const inv = 1 / dx;
        let t1 = (b.minX - ox) * inv;
        let t2 = (b.maxX - ox) * inv;
        const n = inv > 0 ? -1 : 1;
        if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
        if (t1 > tmin) { tmin = t1; nx = n; ny = 0; nz = 0; entered = true; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }
      // Y (0..maxY)
      if (Math.abs(dy) < 1e-9) {
        if (oy < 0 || oy > b.maxY) continue;
      } else {
        const inv = 1 / dy;
        let t1 = (0 - oy) * inv;
        let t2 = (b.maxY - oy) * inv;
        const n = inv > 0 ? -1 : 1;
        if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
        if (t1 > tmin) { tmin = t1; nx = 0; ny = n; nz = 0; entered = true; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }
      // Z
      if (Math.abs(dz) < 1e-9) {
        if (oz < b.minZ || oz > b.maxZ) continue;
      } else {
        const inv = 1 / dz;
        let t1 = (b.minZ - oz) * inv;
        let t2 = (b.maxZ - oz) * inv;
        const n = inv > 0 ? -1 : 1;
        if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
        if (t1 > tmin) { tmin = t1; nx = 0; ny = 0; nz = n; entered = true; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }
      if (!entered || tmin <= 0 || tmin >= best) continue;
      best = tmin;
      out.t = tmin; out.nx = nx; out.ny = ny; out.nz = nz;
      found = true;
    }
    if (ground && dy < -1e-6 && oy > 0) {
      const t = -oy / dy;
      if (t > 0 && t < best) {
        best = t;
        out.t = t; out.nx = 0; out.ny = 1; out.nz = 0;
        found = true;
      }
    }
    return found;
  }

  private tmpHit: RayHit = { t: 0, nx: 0, ny: 0, nz: 0 };

  /** true if the straight segment a->b is obstructed by geometry */
  blocked(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.01) return false;
    return this.ray(ax, ay, az, dx / len, dy / len, dz / len, len, this.tmpHit, false);
  }

  /** push a circle out of boxes (XZ). returns ground height under it. */
  resolve(p: { x: number; z: number }, r: number, feetY: number, step: number, collide = true): number {
    const bs = this.boxes;
    if (collide) {
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < bs.length; i++) {
          const b = bs[i];
          if (b.maxY <= feetY + step) continue;
          const cx = p.x < b.minX ? b.minX : p.x > b.maxX ? b.maxX : p.x;
          const cz = p.z < b.minZ ? b.minZ : p.z > b.maxZ ? b.maxZ : p.z;
          const dx = p.x - cx, dz = p.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 < 1e-8) {
            const l = p.x - b.minX, rr = b.maxX - p.x, t = p.z - b.minZ, bt = b.maxZ - p.z;
            const m = Math.min(l, rr, t, bt);
            if (m === l) p.x = b.minX - r;
            else if (m === rr) p.x = b.maxX + r;
            else if (m === t) p.z = b.minZ - r;
            else p.z = b.maxZ + r;
          } else {
            const d = Math.sqrt(d2);
            const k = (r - d) / d;
            p.x += dx * k;
            p.z += dz * k;
          }
        }
      }
    }
    const lim = HALF - r;
    if (p.x > lim) p.x = lim; else if (p.x < -lim) p.x = -lim;
    if (p.z > lim) p.z = lim; else if (p.z < -lim) p.z = -lim;
    let ground = 0;
    const rs = r * 0.85;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.maxY > feetY + step || b.maxY <= ground) continue;
      const cx = p.x < b.minX ? b.minX : p.x > b.maxX ? b.maxX : p.x;
      const cz = p.z < b.minZ ? b.minZ : p.z > b.maxZ ? b.maxZ : p.z;
      const dx = p.x - cx, dz = p.z - cz;
      if (dx * dx + dz * dz < rs * rs) ground = b.maxY;
    }
    return ground;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) (m.material as THREE.Material).dispose();
    });
    this.textures.forEach((t) => t.dispose());
  }
}
