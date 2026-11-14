import * as THREE from "three";

/** One draw call for ALL sparks / debris. Ring-buffered, zero allocations per frame. */
export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private base: Float32Array;
  private grav: Float32Array;
  private n: number;
  private cursor = 0;
  private active = 0;
  private geo: THREE.BufferGeometry;
  private mat: THREE.PointsMaterial;

  constructor(n: number) {
    this.n = n;
    this.pos = new Float32Array(n * 3).fill(0);
    this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n).fill(1);
    this.base = new Float32Array(n * 3);
    this.grav = new Float32Array(n);
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -999;
    this.geo = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(this.pos, 3);
    pa.setUsage(THREE.DynamicDrawUsage);
    const ca = new THREE.BufferAttribute(this.col, 3);
    ca.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("position", pa);
    this.geo.setAttribute("color", ca);
    this.mat = new THREE.PointsMaterial({
      size: 3.5,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setSize(px: number) {
    this.mat.size = Math.max(2, px);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, r: number, g: number, b: number, grav = 14) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.base[i3] = r; this.base[i3 + 1] = g; this.base[i3 + 2] = b;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = grav;
    this.active++;
  }

  update(dt: number) {
    if (this.active <= 0) return;
    let alive = 0;
    const n = this.n;
    for (let i = 0; i < n; i++) {
      let l = this.life[i];
      if (l <= 0) continue;
      l -= dt;
      const i3 = i * 3;
      if (l <= 0) {
        this.life[i] = 0;
        this.pos[i3 + 1] = -999;
        this.col[i3] = this.col[i3 + 1] = this.col[i3 + 2] = 0;
        continue;
      }
      this.life[i] = l;
      alive++;
      const g = this.grav[i];
      this.vel[i3 + 1] -= g * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (g > 0 && this.pos[i3 + 1] < 0.03) {
        this.pos[i3 + 1] = 0.03;
        this.vel[i3 + 1] *= -0.35;
        this.vel[i3] *= 0.7;
        this.vel[i3 + 2] *= 0.7;
      }
      const f = l / this.maxLife[i];
      this.col[i3] = this.base[i3] * f;
      this.col[i3 + 1] = this.base[i3 + 1] * f;
      this.col[i3 + 2] = this.base[i3 + 2] * f;
    }
    this.active = alive;
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.pos.fill(0);
    for (let i = 0; i < this.n; i++) this.pos[i * 3 + 1] = -999;
    this.col.fill(0);
    this.active = 1; // force one upload
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}
