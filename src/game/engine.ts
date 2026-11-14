import * as THREE from "three";
import { sfx } from "./audio";
import { getSettings, setSettings, type Settings } from "./settings";
import { WEAPONS, type WeaponSpec } from "./weapons";
import {
  ENEMIES, buildEnemyGeos, buildPickupGeos, buildWeaponModel, flashTexture, mergePieces, radialTexture,
  C, type EnemyDef, type EnemyGeos, type EnemyKind, type WeaponModel,
} from "./models";
import { World, HALF, type RayHit } from "./world";
import { Particles } from "./fx";

export type GameState = "menu" | "playing" | "paused" | "dead";

export interface HudData {
  hp: number;
  mag: number;
  reserve: number;
  infinite: boolean;
  weapon: number;
  reload: number;
  wave: number;
  kills: number;
  heads: number;
  score: number;
  left: number;
  grenades: number;
  streak: number;
  fps: number;
  scale: number;
  scope: boolean;
  spread: number;
  best: number;
  acc: number;
  intermission: number;
  ammoList: number[];
  sprinting: boolean;
}

export type GameEvent =
  | { type: "hit"; head: boolean; kill: boolean }
  | { type: "kill"; head: boolean; name: string; points: number; streak: number }
  | { type: "banner"; text: string; sub?: string }
  | { type: "toast"; text: string; on?: boolean }
  | { type: "hurt"; angle: number }
  | { type: "pickup"; text: string }
  | { type: "lockfail" };

export interface UI {
  onState(s: GameState): void;
  onHud(h: HudData): void;
  onEvent(e: GameEvent): void;
}

interface Enemy {
  def: EnemyDef;
  kind: EnemyKind;
  group: THREE.Group;
  head: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  blob: THREE.Mesh;
  esp: THREE.LineSegments;
  mat: THREE.MeshLambertMaterial;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  scale: number;
  dead: boolean;
  deadT: number;
  age: number;
  flash: number;
  los: boolean;
  losT: number;
  strafe: number;
  strafeT: number;
  shootT: number;
  burstLeft: number;
  burstT: number;
  meleeT: number;
  phase: number;
  moveAmt: number;
  stuckT: number;
  lx: number;
  lz: number;
  detourT: number;
  detourAng: number;
  headFly: boolean;
  headVel: THREE.Vector3;
  headSpin: THREE.Vector3;
}

interface Proj {
  kind: "rocket" | "grenade";
  mesh: THREE.Mesh;
  active: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
}

interface Pickup {
  group: THREE.Group;
  kind: "health" | "ammo";
  x: number;
  z: number;
  life: number;
  t: number;
}

interface Tracer {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  max: number;
  width: number;
}

interface Boom {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  max: number;
  radius: number;
}

interface HitRec {
  e: Enemy;
  t: number;
  head: boolean;
  zone: number;
}

const rh: RayHit = { t: 0, nx: 0, ny: 0, nz: 0 };
const tmpP = { x: 0, z: 0 };
const V = new THREE.Vector3();
const V2 = new THREE.Vector3();
const Q = new THREE.Quaternion();
const FWD = new THREE.Vector3(0, 0, -1);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const wrapAng = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

const BEST_KEY = "arena-strike-best";

export class Engine {
  private ui: UI;
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world: World;
  private sun: THREE.DirectionalLight;
  private skyDome: THREE.Mesh;
  private sunSprite: THREE.Sprite;
  private particles: Particles;
  private viewRoot = new THREE.Group();
  private models: WeaponModel[] = [];
  private weaponMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private flashMat: THREE.MeshBasicMaterial;
  private extraDispose: { dispose(): void }[] = [];

  // pools
  private tracers: Tracer[] = [];
  private tracerCur = 0;
  private tracerGeo: THREE.BoxGeometry;
  private decals: THREE.Mesh[] = [];
  private decalCur = 0;
  private booms: Boom[] = [];
  private boomCur = 0;
  private projs: Proj[] = [];
  private pickups: Pickup[] = [];
  private enemies: Enemy[] = [];
  private hl: HitRec[] = [];

  // enemy assets
  private enemyGeos = {} as Record<EnemyKind, EnemyGeos>;
  private enemyMats = {} as Record<EnemyKind, THREE.MeshLambertMaterial>;
  private blobGeo: THREE.PlaneGeometry;
  private blobMat: THREE.MeshBasicMaterial;
  private espGeo: THREE.EdgesGeometry;
  private espMat: THREE.LineBasicMaterial;
  private pickGeos: ReturnType<typeof buildPickupGeos>;
  private pickMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private beamGeo = new THREE.BoxGeometry(0.1, 3, 0.1);
  private beamMats: Record<string, THREE.MeshBasicMaterial>;
  private rocketGeo: THREE.BufferGeometry;
  private rocketMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private grenGeo = new THREE.IcosahedronGeometry(0.1, 1);
  private grenMat = new THREE.MeshLambertMaterial({ color: 0x4a5a30 });
  private boomGeo = new THREE.IcosahedronGeometry(1, 1);

  // state
  state: GameState = "menu";
  private raf = 0;
  private last = 0;
  private lastS: Settings | null = null;
  private curScale = 0.75;
  private userScale = 0.75;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 60;
  private hudT = 0;
  private pausedAcc = 0;
  private disposed = false;
  private orbit = 0;

  // player
  private px = 0; private py = 0; private pz = 34;
  private vx = 0; private vz = 0; private vy = 0;
  private onGround = true;
  private yaw = 0; private pitch = 0;
  private recoilOff = 0;
  private crouchT = 0;
  private camY = 1.7;
  private hp = 100;
  private lastHurt = 99;
  private trauma = 0;
  private landDip = 0;
  private bobT = 0;
  private moveAmt = 0;
  private sprintT = 0;
  private sprinting = false;
  private deadT = 0;

  // weapon
  private cur = 2;
  private lastWeapon = 0;
  private ws = WEAPONS.map((w) => ({ mag: w.mag, reserve: Math.floor(w.maxReserve * 0.5) }));
  private cooldown = 0;
  private reloading = false;
  private reloadT = 0;
  private swapPhase = 0;
  private swapT = 0;
  private pending = 0;
  private triggerReleased = true;
  private aim = 0;
  private kickV = 0;
  private flashT = 0;
  private spin = 0;
  private swayX = 0; private swayY = 0;
  private mdx = 0; private mdy = 0;
  private grenades = 3;
  private grenCD = 0;
  private shots = 0; private shotHits = 0;

  // game
  private wave = 0;
  private toSpawn = 0;
  private spawnT = 0;
  private intermission = 2.5;
  private kills = 0;
  private heads = 0;
  private score = 0;
  private streak = 0;
  private streakT = 0;
  private best = 0;

  // input
  private keys = new Set<string>();
  private mouse = [false, false, false];
  private locked = false;
  private lockedAt = 0;

  constructor(container: HTMLElement, ui: UI) {
    this.container = container;
    this.ui = ui;
    try {
      this.best = Number(localStorage.getItem(BEST_KEY) || 0);
    } catch {
      this.best = 0;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", stencil: false, alpha: false });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0xd3e0ea);
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;outline:none";
    renderer.domElement.tabIndex = 0;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.camera = new THREE.PerspectiveCamera(78, 1, 0.04, 520);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);
    this.camera.add(this.viewRoot);

    this.scene.fog = new THREE.Fog(0xd3e0ea, 55, 250);

    /* lights */
    const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x7d7060, 1.25);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d2, 2.0);
    sun.position.set(-38, 62, 28);
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -HALF - 6; sc.right = HALF + 6; sc.top = HALF + 6; sc.bottom = -HALF - 6; sc.near = 10; sc.far = 160;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.05;
    this.scene.add(sun);
    this.sun = sun;

    /* sky dome */
    const skyGeo = new THREE.SphereGeometry(420, 20, 12);
    const pos = skyGeo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const top = new THREE.Color(0x3a78cc), hor = new THREE.Color(0xd3e0ea), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = clamp(pos.getY(i) / 420, 0, 1);
      c.copy(hor).lerp(top, Math.pow(t, 0.55));
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    skyGeo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    this.skyDome = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.skyDome.renderOrder = -10;
    this.skyDome.frustumCulled = false;
    this.scene.add(this.skyDome);
    const sunTex = radialTexture("rgba(255,244,214,1)", "rgba(255,200,120,0)", 128);
    this.extraDispose.push(sunTex);
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    this.sunSprite.scale.set(150, 150, 1);
    this.sunSprite.renderOrder = -9;
    this.scene.add(this.sunSprite);

    /* world */
    this.world = new World();
    this.scene.add(this.world.group);

    /* particles */
    this.particles = new Particles(480);
    this.scene.add(this.particles.points);

    /* tracers */
    this.tracerGeo = new THREE.BoxGeometry(1, 1, 1);
    this.tracerGeo.translate(0, 0, 0.5);
    for (let i = 0; i < 28; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const mesh = new THREE.Mesh(this.tracerGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.tracers.push({ mesh, mat, life: 0, max: 0.1, width: 0.02 });
    }

    /* decals */
    const decalTex = radialTexture("rgba(0,0,0,0.9)", "rgba(0,0,0,0)", 32);
    this.extraDispose.push(decalTex);
    const decalGeo = new THREE.PlaneGeometry(0.22, 0.22);
    const decalMat = new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.extraDispose.push(decalGeo, decalMat);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(decalGeo, decalMat);
      m.visible = false;
      m.frustumCulled = false;
      this.scene.add(m);
      this.decals.push(m);
    }

    /* explosions */
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xff8a20, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const mesh = new THREE.Mesh(this.boomGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.booms.push({ mesh, mat, life: 0, max: 0.5, radius: 3 });
    }

    /* enemy assets */
    (Object.keys(ENEMIES) as EnemyKind[]).forEach((k) => {
      this.enemyGeos[k] = buildEnemyGeos(ENEMIES[k]);
      this.enemyMats[k] = new THREE.MeshLambertMaterial({ vertexColors: true });
    });
    this.blobGeo = new THREE.PlaneGeometry(1, 1);
    this.blobGeo.rotateX(-Math.PI / 2);
    const blobTex = radialTexture("rgba(0,0,0,0.75)", "rgba(0,0,0,0)", 32);
    this.extraDispose.push(blobTex);
    this.blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const box = new THREE.BoxGeometry(0.8, 1.9, 0.8);
    box.translate(0, 0.95, 0);
    this.espGeo = new THREE.EdgesGeometry(box);
    box.dispose();
    this.espMat = new THREE.LineBasicMaterial({ color: 0xff2a2a, depthTest: false, transparent: true, fog: false });
    this.pickGeos = buildPickupGeos();
    this.beamMats = {
      health: new THREE.MeshBasicMaterial({ color: 0x3dff7a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
      ammo: new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
    this.rocketGeo = mergePieces([
      C(0.0, 0.07, 0.2, 0, 0, -0.35, 0xb33a2a),
      C(0.07, 0.07, 0.5, 0, 0, 0, 0x5b6b45),
      C(0.05, 0.08, 0.12, 0, 0, 0.3, 0x222222),
      C(0.05, 0.0, 0.3, 0, 0, 0.5, 0xffaa30),
    ]);
    for (let i = 0; i < 128; i++) this.hl.push({ e: null as unknown as Enemy, t: 0, head: false, zone: 0 });

    /* weapon models */
    const fmat = new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.flashMat = fmat;
    WEAPONS.forEach((w) => {
      const m = buildWeaponModel(w.id, w.muzzle, w.flash, this.weaponMat, fmat);
      m.group.position.set(...w.hip);
      this.viewRoot.add(m.group);
      this.models.push(m);
    });
    this.models[this.cur].group.visible = true;

    this.bind();
    this.resize();
    this.applySettings(getSettings());
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ================================================================== */
  /*  Input / lifecycle                                                  */
  /* ================================================================== */
  private onResize = () => this.resize();
  private ro: ResizeObserver | null = null;

  private bind() {
    window.addEventListener("resize", this.onResize);
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.container);
    }
    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("pointerlockerror", this.onLockError);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("wheel", this.onWheel, { passive: true });
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("contextmenu", this.onCtx);
    window.addEventListener("blur", this.onBlur);
  }

  private onBlur = () => {
    this.keys.clear();
    this.mouse = [false, false, false];
  };
  private onCtx = (e: Event) => {
    if (this.locked) e.preventDefault();
  };

  private onLockChange = () => {
    this.locked = document.pointerLockElement === this.renderer.domElement;
    if (this.locked) {
      this.lockedAt = performance.now();
      if (this.state === "paused" || this.state === "menu") this.setState("playing");
    } else {
      this.keys.clear();
      this.mouse = [false, false, false];
      if (this.state === "playing") this.setState("paused");
    }
  };
  private onLockError = () => {
    this.ui.onEvent({ type: "lockfail" });
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked || this.state !== "playing") return;
    if (performance.now() - this.lockedAt < 200) return;
    if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
    const S = this.lastS!;
    const fovNow = this.camera.fov;
    const zoom = Math.tan((fovNow * Math.PI) / 360) / Math.tan((S.fov * Math.PI) / 360);
    const sens = 0.0022 * S.sensitivity * zoom;
    this.yaw -= e.movementX * sens;
    this.pitch -= e.movementY * sens * (S.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.5, 1.5);
    this.mdx += e.movementX;
    this.mdy += e.movementY;
  };
  private onMouseDown = (e: MouseEvent) => {
    if (!this.locked || this.state !== "playing") return;
    this.mouse[e.button] = true;
    if (e.button === 0) this.triggerReleased = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    this.mouse[e.button] = false;
  };
  private onWheel = (e: WheelEvent) => {
    if (!this.locked || this.state !== "playing") return;
    const n = WEAPONS.length;
    const dir = e.deltaY > 0 ? 1 : -1;
    this.switchTo((this.cur + dir + n) % n);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (this.state !== "playing") return;
    const code = e.code;
    this.keys.add(code);
    if (["Space", "Tab", "ArrowUp", "ArrowDown"].includes(code)) e.preventDefault();
    if (code.startsWith("Digit")) {
      const n = Number(code.slice(5)) - 1;
      if (n >= 0 && n < WEAPONS.length) this.switchTo(n);
    }
    const S = this.lastS!;
    switch (code) {
      case "KeyR": this.startReload(); break;
      case "KeyQ": this.switchTo(this.lastWeapon); break;
      case "KeyG": this.throwGrenade(); break;
    }
    if (S.hotkeys) {
      const tog = (k: keyof Settings, label: string) => {
        const v = !S[k];
        setSettings({ [k]: v } as Partial<Settings>);
        sfx.toggle(v);
        this.ui.onEvent({ type: "toast", text: label, on: v });
      };
      switch (code) {
        case "KeyY": tog("god", "GOD MODE"); break;
        case "KeyB": tog("aimbot", "AIMBOT"); break;
        case "KeyV": tog("esp", "ESP WALLHACK"); break;
        case "KeyF": tog("fly", "FLY MODE"); break;
        case "KeyN": tog("noclip", "NOCLIP"); break;
        case "KeyT": {
          const v = S.timeScale < 1 ? 1 : 0.3;
          setSettings({ timeScale: v });
          sfx.toggle(v < 1);
          this.ui.onEvent({ type: "toast", text: "SLOW MOTION", on: v < 1 });
          break;
        }
        case "KeyH": this.refill(); break;
        case "KeyK": this.killAll(); break;
        case "KeyL": this.spawnEnemy(["grunt", "runner", "heavy", "marksman"][Math.floor(Math.random() * 4)] as EnemyKind); break;
      }
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private setState(s: GameState) {
    if (this.state === s) return;
    this.state = s;
    this.pausedAcc = 1;
    this.ui.onState(s);
  }

  private lock() {
    sfx.init();
    const el = this.renderer.domElement;
    try {
      const r = el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === "function") r.catch(() => this.ui.onEvent({ type: "lockfail" }));
    } catch {
      this.ui.onEvent({ type: "lockfail" });
    }
  }

  start() {
    this.reset();
    this.lock();
  }
  resume() {
    this.lock();
  }
  restart() {
    this.reset();
    this.lock();
    if (this.state === "dead") this.setState("paused");
  }
  quitToMenu() {
    if (document.pointerLockElement) document.exitPointerLock();
    this.clearWorld();
    this.setState("menu");
  }

  /* ================================================================== */
  /*  Settings / sizing                                                  */
  /* ================================================================== */
  private resize() {
    const w = Math.max(2, this.container.clientWidth);
    const h = Math.max(2, this.container.clientHeight);
    this.renderer.setSize(Math.max(2, Math.floor(w * this.curScale)), Math.max(2, Math.floor(h * this.curScale)), false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.particles.setSize(3.6 * this.curScale + 0.6);
  }

  private applySettings(S: Settings) {
    const prev = this.lastS;
    this.lastS = S;
    if (!prev || prev.renderScale !== S.renderScale) {
      this.userScale = S.renderScale;
      this.curScale = S.renderScale;
      this.resize();
    }
    if (!S.adaptive && this.curScale !== S.renderScale) {
      this.curScale = S.renderScale;
      this.resize();
    }
    if (!prev || prev.shadows !== S.shadows) this.setShadows(S.shadows);
    sfx.setVolume(S.volume);
    if (!S.decals) this.decals.forEach((d) => (d.visible = false));
  }

  private setShadows(on: boolean) {
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
  }

  /* ================================================================== */
  /*  Reset                                                              */
  /* ================================================================== */
  private clearWorld() {
    for (const e of [...this.enemies]) this.removeEnemy(e);
    this.enemies.length = 0;
    for (const p of this.projs) { p.active = false; p.mesh.visible = false; }
    for (const p of this.pickups) this.scene.remove(p.group);
    this.pickups.length = 0;
    for (const t of this.tracers) { t.life = 0; t.mesh.visible = false; }
    for (const d of this.decals) d.visible = false;
    for (const b of this.booms) { b.life = 0; b.mesh.visible = false; }
    this.particles.clear();
  }

  private reset() {
    this.clearWorld();
    this.px = 0; this.py = 0; this.pz = 34;
    this.vx = this.vz = this.vy = 0;
    this.yaw = 0; this.pitch = 0; this.recoilOff = 0;
    this.hp = 100;
    this.lastHurt = 99;
    this.ws = WEAPONS.map((w) => ({ mag: w.mag, reserve: Math.floor(w.maxReserve * 0.5) }));
    this.cur = 2;
    this.models.forEach((m, i) => (m.group.visible = i === this.cur));
    this.reloading = false;
    this.swapPhase = 0;
    this.cooldown = 0.3;
    this.grenades = 3;
    this.wave = 0;
    this.toSpawn = 0;
    this.intermission = 2.2;
    this.kills = 0; this.heads = 0; this.score = 0; this.streak = 0;
    this.shots = 0; this.shotHits = 0;
    this.deadT = 0;
    this.trauma = 0;
    this.camY = 1.7;
    this.aim = 0;
    this.spin = 0;
  }

  /* ================================================================== */
  /*  Main loop                                                          */
  /* ================================================================== */
  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const raw = (now - this.last) / 1000;
    this.last = now;
    let dt = raw;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0.0005) dt = 0.0005;
    const S = getSettings();
    if (S !== this.lastS) this.applySettings(S);

    // fps + adaptive resolution
    this.fpsFrames++;
    this.fpsTime += raw;
    if (this.fpsTime >= 1.2) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
      if (S.adaptive && this.state === "playing") {
        if (this.fps < 50 && this.curScale > 0.42) {
          this.curScale = Math.max(0.4, this.curScale - (this.fps < 35 ? 0.1 : 0.05));
          this.resize();
        } else if (this.fps > 58 && this.curScale < this.userScale - 0.001) {
          this.curScale = Math.min(this.userScale, this.curScale + 0.03);
          this.resize();
        }
      }
    }

    if (this.state === "playing" || this.state === "dead") {
      this.update(dt, S);
    } else if (this.state === "menu") {
      this.orbit += dt * 0.12;
      const r = 40;
      this.camera.position.set(Math.cos(this.orbit) * r, 13, Math.sin(this.orbit) * r - 6);
      this.camera.lookAt(0, 2.5, -6);
      this.camera.fov = 62;
      this.camera.updateProjectionMatrix();
      this.viewRoot.visible = false;
      this.particles.update(dt);
    } else {
      this.pausedAcc += dt;
      if (this.pausedAcc < 0.12) return;
      this.pausedAcc = 0;
    }
    if (this.state === "playing" || this.state === "paused") this.viewRoot.visible = true;

    // sky follows camera
    this.skyDome.position.copy(this.camera.position);
    this.sunSprite.position.copy(this.camera.position).addScaledVector(V.copy(this.sun.position).normalize(), 380);
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number, S: Settings) {
    const wdt = dt * S.timeScale;
    const alive = this.state === "playing";
    if (alive) {
      this.updatePlayer(dt, S);
      this.updateWeapon(dt, S);
    } else {
      this.deadT += dt;
    }
    this.updateWave(wdt, S);
    this.updateEnemies(wdt, S);
    this.updateProjectiles(wdt, S);
    this.updatePickups(wdt, S);
    this.particles.update(wdt);
    this.updateFx(wdt);
    this.updateCamera(dt, S);

    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.08;
      this.emitHud(S);
    }
  }

  private emitHud(S: Settings) {
    const w = WEAPONS[this.cur];
    const st = this.ws[this.cur];
    const h = this.container.clientHeight || 700;
    const moveSpread = Math.hypot(this.vx, this.vz) / 5 * w.moveSpread;
    const sp = S.noSpread ? 0 : (w.spread * lerp(1, w.adsSpread, this.aim) + moveSpread + (this.onGround ? 0 : 0.02));
    const px = (Math.tan(sp) * (h / 2)) / Math.tan((this.camera.fov * Math.PI) / 360);
    this.ui.onHud({
      hp: Math.max(0, Math.ceil(this.hp)),
      mag: st.mag,
      reserve: st.reserve,
      infinite: S.infAmmo,
      weapon: this.cur,
      reload: this.reloading ? this.reloadT / w.reload : -1,
      wave: this.wave,
      kills: this.kills,
      heads: this.heads,
      score: Math.round(this.score),
      left: this.toSpawn + this.enemies.filter((e) => !e.dead).length,
      grenades: this.grenades,
      streak: this.streak,
      fps: Math.round(this.fps),
      scale: Math.round(this.curScale * 100),
      scope: w.scope && this.aim > 0.5,
      spread: clamp(px, 0, 120),
      best: this.best,
      acc: this.shots > 0 ? Math.round((this.shotHits / this.shots) * 100) : 0,
      intermission: this.intermission > 0 && this.toSpawn === 0 && !this.enemies.some((e) => !e.dead) ? this.intermission : 0,
      ammoList: this.ws.map((a) => a.mag),
      sprinting: this.sprinting,
    });
  }

  /* ================================================================== */
  /*  Player                                                             */
  /* ================================================================== */
  private updatePlayer(dt: number, S: Settings) {
    const k = this.keys;
    const w = WEAPONS[this.cur];
    let fwd = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    let str = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    const len = Math.hypot(fwd, str);
    if (len > 0) { fwd /= len; str /= len; }
    const wantCrouch = k.has("KeyC") && !S.fly;
    this.crouchT = lerp(this.crouchT, wantCrouch ? 1 : 0, Math.min(1, dt * 12));
    const aiming = this.mouse[2];
    this.sprinting = k.has("ShiftLeft") && fwd > 0 && !aiming && this.crouchT < 0.3 && !(this.mouse[0] && w.spinUp);

    let speed = (this.crouchT > 0.5 ? 2.7 : this.sprinting ? 8.0 : 5.4) * S.speedMult;
    if (!this.sprinting) speed *= w.moveMult * (aiming ? 0.78 : 1);
    if (S.fly) speed = (k.has("ShiftLeft") ? 22 : 11) * S.speedMult;

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    const tx = (-sy * fwd + cy * str) * speed;
    const tz = (-cy * fwd - sy * str) * speed;
    const accel = S.fly ? 10 : this.onGround ? 14 : 3.2;
    const a = Math.min(1, dt * accel);
    this.vx += (tx - this.vx) * a;
    this.vz += (tz - this.vz) * a;

    if (S.fly) {
      const up = (k.has("Space") ? 1 : 0) - (k.has("KeyC") ? 1 : 0);
      this.vy += (up * 11 * S.speedMult - this.vy) * Math.min(1, dt * 10);
      this.onGround = false;
    } else {
      this.vy -= 22 * dt;
      if (k.has("Space") && this.onGround) {
        this.vy = 7.6 * S.jumpMult;
        this.onGround = false;
      }
    }

    tmpP.x = this.px + this.vx * dt;
    tmpP.z = this.pz + this.vz * dt;
    let ground = this.world.resolve(tmpP, 0.38, this.py, 0.55, !S.noclip);
    // effective velocity after sliding along walls
    this.vx = (tmpP.x - this.px) / dt;
    this.vz = (tmpP.z - this.pz) / dt;
    this.px = tmpP.x;
    this.pz = tmpP.z;
    if (S.noclip) ground = 0;

    const wasAir = !this.onGround;
    const preVy = this.vy;
    this.py += this.vy * dt;
    if (this.py <= ground + 0.0001) {
      if (wasAir && preVy < -9) this.landDip = Math.min(0.2, -preVy * 0.012);
      this.py = ground;
      if (this.vy < 0) this.vy = 0;
      this.onGround = true;
    } else if (!S.fly && this.onGround && this.py - ground < 0.08 && this.vy <= 0) {
      this.py = ground;
    } else {
      this.onGround = false;
    }
    if (this.py < 0) { this.py = 0; this.vy = 0; }
    if (this.py > 120) this.py = 120;

    const spd = Math.hypot(this.vx, this.vz);
    this.moveAmt = lerp(this.moveAmt, this.onGround && spd > 0.6 ? 1 : 0, Math.min(1, dt * 10));
    this.bobT += dt * spd * 1.55;
    this.sprintT = lerp(this.sprintT, this.sprinting && spd > 3 ? 1 : 0, Math.min(1, dt * 9));
    this.landDip = lerp(this.landDip, 0, Math.min(1, dt * 9));

    // regen
    this.lastHurt += dt;
    if (this.lastHurt > 6 && this.hp < 100 && this.hp > 0) this.hp = Math.min(100, this.hp + 6 * dt);
    if (S.god && this.hp < 100) this.hp = 100;

    // recoil recovery
    this.recoilOff = lerp(this.recoilOff, 0, Math.min(1, dt * 7));
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
  }

  private hurtPlayer(dmg: number, sx: number, sz: number) {
    const S = this.lastS!;
    if (S.god || this.state !== "playing") return;
    this.hp -= dmg;
    this.lastHurt = 0;
    this.trauma = Math.min(1, this.trauma + dmg / 35);
    sfx.hurt();
    const dx = sx - this.px, dz = sz - this.pz;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fwd = -sy * dx + -cy * dz;
    const right = cy * dx + -sy * dz;
    this.ui.onEvent({ type: "hurt", angle: Math.atan2(right, fwd) });
    if (this.hp <= 0) {
      this.hp = 0;
      this.deadT = 0;
      this.keys.clear();
      this.mouse = [false, false, false];
      this.setState("dead");
      if (document.pointerLockElement) document.exitPointerLock();
      if (this.score > this.best) {
        this.best = Math.round(this.score);
        try { localStorage.setItem(BEST_KEY, String(this.best)); } catch { /* ignore */ }
      }
    }
  }

  private eyeHeight() {
    return 1.7 - 0.6 * this.crouchT;
  }

  private updateCamera(dt: number, S: Settings) {
    const cam = this.camera;
    if (this.state === "dead") {
      const t = Math.min(1, this.deadT * 1.5);
      cam.position.set(this.px, this.py + lerp(this.eyeHeight(), 0.25, t), this.pz);
      cam.rotation.set(this.pitch * (1 - t) + 0.3 * t, this.yaw, 0.9 * t);
      this.viewRoot.visible = false;
      return;
    }
    const target = this.py + this.eyeHeight();
    if (Math.abs(target - this.camY) > 0.7) this.camY = target;
    else this.camY += (target - this.camY) * Math.min(1, dt * 22);
    const bob = S.headBob ? Math.sin(this.bobT * 2) * 0.03 * this.moveAmt * (1 - this.aim * 0.8) : 0;
    const sh = this.trauma * this.trauma;
    cam.position.set(
      this.px + (Math.random() - 0.5) * sh * 0.12,
      this.camY + bob - this.landDip + (Math.random() - 0.5) * sh * 0.12,
      this.pz + (Math.random() - 0.5) * sh * 0.12
    );
    const roll = (S.headBob ? Math.sin(this.bobT) * 0.004 * this.moveAmt : 0) + (Math.random() - 0.5) * sh * 0.06;
    cam.rotation.set(this.pitch + this.recoilOff, this.yaw, roll);

    // fov
    const w = WEAPONS[this.cur];
    const fov = lerp(S.fov + this.sprintT * 5, w.adsFov, this.aim);
    if (Math.abs(fov - cam.fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    // view model
    this.updateViewModel(dt, S);
  }

  private updateViewModel(dt: number, S: Settings) {
    const w = WEAPONS[this.cur];
    const m = this.models[this.cur];
    const a = this.aim;
    let x = lerp(w.hip[0], w.ads[0], a);
    let y = lerp(w.hip[1], w.ads[1], a);
    let z = lerp(w.hip[2], w.ads[2], a);
    const bobK = (1 - a * 0.85) * this.moveAmt;
    if (S.headBob) {
      x += Math.sin(this.bobT) * 0.012 * bobK;
      y += Math.abs(Math.cos(this.bobT)) * 0.01 * bobK;
    }
    // mouse sway
    const tx = clamp(-this.mdx * 0.0007, -0.035, 0.035);
    const ty = clamp(this.mdy * 0.0007, -0.035, 0.035);
    this.mdx = 0; this.mdy = 0;
    this.swayX = lerp(this.swayX, tx, Math.min(1, dt * 10));
    this.swayY = lerp(this.swayY, ty, Math.min(1, dt * 10));
    x += this.swayX * (1 - a * 0.7);
    y += this.swayY * (1 - a * 0.7);
    this.kickV = lerp(this.kickV, 0, Math.min(1, dt * 14));
    z += this.kickV;
    let rx = this.kickV * 1.6, ry = 0, rz = 0;
    rx -= this.sprintT * 0.2;
    ry += this.sprintT * 0.55;
    x -= this.sprintT * 0.07;
    y -= this.sprintT * 0.05;
    if (this.reloading) {
      const p = this.reloadT / w.reload;
      const s = Math.sin(Math.PI * clamp(p, 0, 1));
      y -= s * 0.1;
      rx -= s * 0.55;
      rz += s * 0.35;
      x -= s * 0.04;
    }
    if (this.swapPhase === 1) y -= 0.4 * clamp(this.swapT / 0.14, 0, 1);
    else if (this.swapPhase === 2) y -= 0.4 * (1 - clamp(this.swapT / 0.2, 0, 1));
    m.group.position.set(x, y, z);
    m.group.rotation.set(rx, ry, rz);
    // hide model while scoped
    m.group.visible = !(w.scope && this.aim > 0.55);
    // flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      m.flash.visible = this.flashT > 0;
      if (m.flash.visible) {
        m.flash.rotation.z = Math.random() * 6.28;
        const s = 0.7 + Math.random() * 0.6;
        m.flash.scale.set(s, s, 1);
      }
    } else m.flash.visible = false;
    if (m.rotor) m.rotor.rotation.z += this.spin * dt * 32;
  }

  /* ================================================================== */
  /*  Weapons                                                            */
  /* ================================================================== */
  private switchTo(i: number) {
    if (i === this.cur || this.swapPhase !== 0 || i < 0 || i >= WEAPONS.length) return;
    this.pending = i;
    this.swapPhase = 1;
    this.swapT = 0;
    this.reloading = false;
    sfx.click(900, 0.3);
  }

  private startReload() {
    const w = WEAPONS[this.cur];
    const st = this.ws[this.cur];
    if (this.reloading || this.swapPhase !== 0) return;
    if (st.mag >= w.mag) return;
    if (st.reserve <= 0 && !this.lastS!.infAmmo) return;
    this.reloading = true;
    this.reloadT = 0;
    sfx.reload(w.reload);
  }

  private forward(out: THREE.Vector3, pitchExtra = 0) {
    const p = this.pitch + this.recoilOff + pitchExtra;
    const cp = Math.cos(p);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(p), -Math.cos(this.yaw) * cp);
  }

  private updateWeapon(dt: number, S: Settings) {
    const w = WEAPONS[this.cur];
    const st = this.ws[this.cur];

    // swapping
    if (this.swapPhase === 1) {
      this.swapT += dt;
      if (this.swapT >= 0.14) {
        this.models[this.cur].group.visible = false;
        this.models[this.cur].flash.visible = false;
        this.lastWeapon = this.cur;
        this.cur = this.pending;
        this.models[this.cur].group.visible = true;
        this.swapPhase = 2;
        this.swapT = 0;
        this.aim = 0;
        this.spin = 0;
      }
    } else if (this.swapPhase === 2) {
      this.swapT += dt;
      if (this.swapT >= 0.2) this.swapPhase = 0;
    }

    // aim
    const wantAim = this.mouse[2] && !this.sprinting && !this.reloading && this.swapPhase === 0;
    this.aim = lerp(this.aim, wantAim ? 1 : 0, Math.min(1, dt * (w.scope ? 9 : 13)));
    if (Math.abs(this.aim - (wantAim ? 1 : 0)) < 0.005) this.aim = wantAim ? 1 : 0;

    // reload
    if (this.reloading) {
      this.reloadT += dt;
      if (this.reloadT >= w.reload) {
        this.reloading = false;
        const take = Math.min(w.mag - st.mag, st.reserve);
        st.mag += take;
        st.reserve -= take;
      }
    }
    if (S.infAmmo) {
      st.mag = w.mag;
      st.reserve = w.maxReserve;
      this.reloading = false;
    }

    this.cooldown -= dt;
    this.grenCD -= dt;

    // aimbot / triggerbot
    let trigger = false;
    if (S.aimbot) this.runAimbot(dt, S);
    if (S.triggerbot) trigger = this.checkTrigger(w);

    const wantFire = this.mouse[0] || trigger;
    if (w.spinUp) {
      if (wantFire && !this.reloading && this.swapPhase === 0 && (st.mag > 0 || S.infAmmo)) this.spin = Math.min(1, this.spin + dt / 0.45);
      else this.spin = Math.max(0, this.spin - dt / 0.8);
    }
    if (!wantFire) this.triggerReleased = true;
    if (trigger) this.triggerReleased = true;

    if (wantFire && this.cooldown <= 0 && !this.reloading && this.swapPhase === 0 && this.state === "playing") {
      if (!w.auto && !this.triggerReleased) return;
      if (w.spinUp && this.spin < 1) return;
      if (st.mag <= 0) {
        if (st.reserve > 0) this.startReload();
        else if (this.triggerReleased) sfx.click(1200, 0.4);
        this.cooldown = 0.25;
        this.triggerReleased = false;
        return;
      }
      this.shoot(w, st, S);
      this.triggerReleased = false;
    }
  }

  private runAimbot(dt: number, S: Settings) {
    const active = S.aimbotMode === "always" || this.mouse[0] || this.mouse[2];
    if (!active) return;
    const ex = this.px, ey = this.py + this.eyeHeight(), ez = this.pz;
    this.forward(V);
    let best: Enemy | null = null;
    let bestAng = (S.aimbotFov * Math.PI) / 180;
    let tx = 0, ty = 0, tz = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const hs = S.bigHeads;
      const ay = S.aimbotHead ? (1.46 + 0.17 * hs) * e.scale : 1.05 * e.scale;
      const dx = e.x - ex, dy = ay - ey, dz = e.z - ez;
      const l = Math.hypot(dx, dy, dz);
      if (l < 0.5) continue;
      const dot = (dx * V.x + dy * V.y + dz * V.z) / l;
      const ang = Math.acos(clamp(dot, -1, 1));
      if (ang > bestAng) continue;
      if (!S.aimbotWalls && this.world.blocked(ex, ey, ez, e.x, ay, e.z)) continue;
      best = e; bestAng = ang; tx = dx; ty = dy; tz = dz;
    }
    if (!best) return;
    const l = Math.hypot(tx, ty, tz);
    const wantYaw = Math.atan2(-tx, -tz);
    const wantPitch = Math.asin(clamp(ty / l, -1, 1)) - this.recoilOff;
    const k = 1 - Math.exp(-S.aimbotSpeed * dt);
    this.yaw += wrapAng(wantYaw - this.yaw) * k;
    this.pitch += (wantPitch - this.pitch) * k;
  }

  private checkTrigger(w: WeaponSpec): boolean {
    const ex = this.px, ey = this.py + this.eyeHeight(), ez = this.pz;
    this.forward(V);
    const wallFound = this.world.ray(ex, ey, ez, V.x, V.y, V.z, w.range, rh, true, !this.lastS!.pierceWalls);
    const wallT = wallFound ? rh.t : w.range;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (this.rayEnemy(e, ex, ey, ez, V.x, V.y, V.z, wallT) >= 0) return true;
    }
    return false;
  }

  private shoot(w: WeaponSpec, st: { mag: number; reserve: number }, S: Settings) {
    if (!S.infAmmo) st.mag--;
    this.cooldown = 60 / (w.rpm * S.fireRateMult);
    this.shots++;
    const spd = Math.hypot(this.vx, this.vz);
    let spread = w.spread * lerp(1, w.adsSpread, this.aim) + (spd / 5) * w.moveSpread * (1 - this.aim * 0.5) + (this.onGround ? 0 : 0.02);
    if (this.crouchT > 0.5) spread *= 0.75;
    if (S.noSpread) spread = 0;

    const ex = this.px, ey = this.py + this.eyeHeight(), ez = this.pz;
    this.forward(V);
    const fx = V.x, fy = V.y, fz = V.z;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const rx = cy, rz = -sy;
    const ux = sy * fy, uy = -sy * fx - cy * fz, uz = cy * fy;

    // muzzle in world space
    const model = this.models[this.cur];
    model.group.updateMatrix();
    this.camera.updateMatrixWorld(true);
    model.group.updateWorldMatrix(true, false);
    const mz = V2.set(w.muzzle[0], w.muzzle[1], w.muzzle[2]);
    if (w.scope && this.aim > 0.55) this.camera.localToWorld(mz.set(0.12, -0.1, -0.8));
    else model.group.localToWorld(mz);
    const mx0 = mz.x, my0 = mz.y, mz0 = mz.z;

    const agg = { hit: false, head: false, kill: false, explode: true };
    for (let i = 0; i < w.pellets; i++) {
      const r = Math.sqrt(Math.random()) * spread;
      const th = Math.random() * Math.PI * 2;
      const ox = Math.cos(th) * r, oy = Math.sin(th) * r;
      let dx = fx + rx * ox + ux * oy;
      let dy = fy + uy * oy;
      let dz = fz + rz * ox + uz * oy;
      const l = Math.hypot(dx, dy, dz);
      dx /= l; dy /= l; dz /= l;
      if (w.projectile) {
        this.spawnRocket(ex + fx * 0.5 + rx * 0.18, ey + fy * 0.5 - 0.12, ez + fz * 0.5 + rz * 0.18, dx, dy, dz);
      } else {
        this.hitscan(ex, ey, ez, dx, dy, dz, w, S, agg, mx0, my0, mz0);
      }
    }
    if (agg.hit) {
      this.shotHits++;
      this.ui.onEvent({ type: "hit", head: agg.head, kill: agg.kill });
      sfx.hit(agg.head, agg.kill);
    }

    // feedback
    sfx.shot(w.sound, w.sound === "minigun" ? 0.7 : 1);
    if (!S.noRecoil) {
      const rk = w.recoil * lerp(1, 0.65, this.aim);
      this.recoilOff += rk * 0.65;
      this.pitch += rk * 0.35;
      this.yaw += (Math.random() - 0.5) * w.recoilYaw * 2;
    }
    this.kickV += w.kick * lerp(1, 0.5, this.aim);
    this.flashT = 0.05;
    this.trauma = Math.min(1, this.trauma + w.kick * 0.9);
  }

  private hitscan(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, w: WeaponSpec, S: Settings, agg: { hit: boolean; head: boolean; kill: boolean; explode: boolean }, mx: number, my: number, mz: number) {
    const maxT = w.range;
    const wallFound = this.world.ray(ox, oy, oz, dx, dy, dz, maxT, rh, true, !S.pierceWalls);
    const wallT = wallFound ? rh.t : maxT;
    const wnx = rh.nx, wny = rh.ny, wnz = rh.nz;
    let n = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const t = this.rayEnemy(e, ox, oy, oz, dx, dy, dz, wallT);
      if (t < 0) continue;
      const rec = this.hl[n++];
      rec.e = e; rec.t = t; rec.head = this.lastHead; rec.zone = this.lastZone;
      if (n >= this.hl.length) break;
    }
    // insertion sort by t
    for (let i = 1; i < n; i++) {
      const r = this.hl[i];
      let j = i - 1;
      while (j >= 0 && this.hl[j].t > r.t) { this.hl[j + 1] = this.hl[j]; j--; }
      this.hl[j + 1] = r;
    }
    const pierce = S.pierceWalls ? Math.max(w.pierce, 6) : w.pierce;
    const cnt = Math.min(n, pierce);
    let endT = wallT;
    let hitEnemy = false;
    for (let i = 0; i < cnt; i++) {
      const r = this.hl[i];
      const head = r.head || S.headAlways;
      let fall = 1;
      if (r.t > w.fallStart) fall = lerp(1, w.fallMin, clamp((r.t - w.fallStart) / Math.max(1, w.fallEnd - w.fallStart), 0, 1));
      const mult = head ? (w.headMult * r.e.def.headMult) / 2.5 : r.zone === 0 ? 0.75 : 1;
      const dmg = S.oneHit ? 1e5 : w.damage * fall * mult * S.damageMult;
      const hx = ox + dx * r.t, hy = oy + dy * r.t, hz = oz + dz * r.t;
      const kill = this.damageEnemy(r.e, dmg, head, hx, hy, hz, dx, dy, dz);
      agg.hit = true;
      if (head) agg.head = true;
      if (kill) agg.kill = true;
      hitEnemy = true;
    }
    if (n >= pierce && n > 0) endT = this.hl[cnt - 1].t;

    // tracer
    const ex = ox + dx * endT, ey = oy + dy * endT, ez = oz + dz * endT;
    this.addTracer(mx, my, mz, ex, ey, ez, w.tracer, w.id === "sniper" ? 0.16 : 0.07, w.id === "sniper" ? 0.03 : w.pellets > 1 ? 0.012 : 0.02);

    // wall impact
    if (!hitEnemy && wallFound && endT === wallT) {
      this.impact(ex, ey, ez, wnx, wny, wnz, S);
    }
    if (S.explosiveBullets && agg.explode && (hitEnemy || wallFound)) {
      agg.explode = false;
      this.explode(ex - dx * 0.2, ey - dy * 0.2, ez - dz * 0.2, 3.6, 70, false);
    }
  }

  private impact(x: number, y: number, z: number, nx: number, ny: number, nz: number, S: Settings) {
    const cnt = Math.max(1, Math.round(5 * S.particles));
    for (let i = 0; i < cnt; i++) {
      const sp = rand(1.5, 5);
      this.particles.emit(x + nx * 0.03, y + ny * 0.03, z + nz * 0.03,
        nx * sp + rand(-1.5, 1.5), ny * sp + rand(-0.5, 2) + 1, nz * sp + rand(-1.5, 1.5), rand(0.15, 0.4), 1, rand(0.6, 0.9), 0.3, 14);
    }
    if (S.decals) {
      const d = this.decals[this.decalCur];
      this.decalCur = (this.decalCur + 1) % this.decals.length;
      d.position.set(x + nx * 0.02, y + ny * 0.02, z + nz * 0.02);
      d.lookAt(x + nx, y + ny, z + nz);
      d.rotateZ(Math.random() * 6);
      d.visible = true;
    }
  }

  /* ---------- enemy hit testing ---------- */
  private lastHead = false;
  private lastZone = 1;

  /** returns hit distance or -1. sets lastHead/lastZone */
  private rayEnemy(e: Enemy, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
    const s = e.scale;
    const hs = this.lastS!.bigHeads;
    // head sphere
    const hcx = e.x, hcy = (1.46 + 0.17 * hs) * s, hcz = e.z;
    const hr = 0.235 * hs * s;
    let headT = -1;
    {
      const ocx = ox - hcx, ocy = oy - hcy, ocz = oz - hcz;
      const b = ocx * dx + ocy * dy + ocz * dz;
      const c = ocx * ocx + ocy * ocy + ocz * ocz - hr * hr;
      const disc = b * b - c;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        let t = -b - sq;
        if (t < 0) t = -b + sq;
        if (t > 0 && t < maxT) headT = t;
      }
    }
    // body AABB
    const hw = 0.34 * s * Math.max(0.85, e.def.bulk * 0.92);
    const minX = e.x - hw, maxX = e.x + hw, minZ = e.z - hw, maxZ = e.z + hw, maxY = 1.47 * s;
    let tmin = 0, tmax = maxT;
    let ok = true;
    if (Math.abs(dx) < 1e-9) { if (ox < minX || ox > maxX) ok = false; }
    else {
      const inv = 1 / dx;
      let t1 = (minX - ox) * inv, t2 = (maxX - ox) * inv;
      if (t1 > t2) { const q = t1; t1 = t2; t2 = q; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) ok = false;
    }
    if (ok) {
      if (Math.abs(dy) < 1e-9) { if (oy < 0 || oy > maxY) ok = false; }
      else {
        const inv = 1 / dy;
        let t1 = -oy * inv, t2 = (maxY - oy) * inv;
        if (t1 > t2) { const q = t1; t1 = t2; t2 = q; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) ok = false;
      }
    }
    if (ok) {
      if (Math.abs(dz) < 1e-9) { if (oz < minZ || oz > maxZ) ok = false; }
      else {
        const inv = 1 / dz;
        let t1 = (minZ - oz) * inv, t2 = (maxZ - oz) * inv;
        if (t1 > t2) { const q = t1; t1 = t2; t2 = q; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) ok = false;
      }
    }
    const bodyT = ok && tmin > 0 ? tmin : -1;
    if (headT >= 0 && (bodyT < 0 || headT <= bodyT + 0.3)) {
      this.lastHead = true;
      this.lastZone = 2;
      return headT;
    }
    if (bodyT >= 0) {
      this.lastHead = false;
      const hy = oy + dy * bodyT;
      this.lastZone = hy < 0.9 * s ? 0 : 1;
      return bodyT;
    }
    return -1;
  }

  private damageEnemy(e: Enemy, dmg: number, head: boolean, x: number, y: number, z: number, dx: number, dy: number, dz: number): boolean {
    const S = this.lastS!;
    e.hp -= dmg;
    e.flash = 1;
    // sparks
    const cnt = Math.max(1, Math.round((head ? 16 : 6) * S.particles));
    for (let i = 0; i < cnt; i++) {
      const sp = rand(1, head ? 6 : 4);
      this.particles.emit(x, y, z, -dx * sp * 0.4 + rand(-2.5, 2.5), rand(0, 3.5), -dz * sp * 0.4 + rand(-2.5, 2.5), rand(0.2, 0.5),
        head ? 1 : 1, head ? 0.95 : rand(0.3, 0.55), head ? 0.6 : 0.12, 12);
    }
    // aggro: hit enemies always notice you
    if (e.hp > 0) return false;
    this.killEnemy(e, head, dx, dy, dz);
    return true;
  }

  private killEnemy(e: Enemy, head: boolean, dx: number, _dy: number, dz: number) {
    if (e.dead) return;
    e.dead = true;
    e.deadT = 0;
    e.esp.visible = false;
    this.kills++;
    if (head) this.heads++;
    this.streak++;
    this.streakT = 5;
    const mult = 1 + Math.min(this.streak - 1, 10) * 0.1;
    const pts = Math.round(e.def.score * (head ? 1.5 : 1) * mult);
    this.score += pts;
    this.ui.onEvent({ type: "kill", head, name: e.def.name, points: pts, streak: this.streak });
    if (head) {
      // pop the head off
      this.scene.attach(e.head);
      e.headFly = true;
      e.headVel.set(dx * 3 + rand(-2, 2), rand(4, 8), dz * 3 + rand(-2, 2));
      e.headSpin.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
      const hs = this.lastS!.bigHeads;
      const hy = (1.46 + 0.17 * hs) * e.scale;
      const n = Math.max(6, Math.round(26 * this.lastS!.particles));
      for (let i = 0; i < n; i++) {
        this.particles.emit(e.x, hy, e.z, rand(-4, 4), rand(1, 7), rand(-4, 4), rand(0.3, 0.8), 1, rand(0.7, 1), 0.5, 14);
      }
    }
    // drops
    const r = Math.random();
    if (e.kind === "heavy") {
      this.dropPickup(e.x - 0.5, e.z, "health");
      this.dropPickup(e.x + 0.5, e.z, "ammo");
    } else if (r < 0.2) this.dropPickup(e.x, e.z, "health");
    else if (r < 0.52) this.dropPickup(e.x, e.z, "ammo");
  }

  /* ---------- explosions & projectiles ---------- */
  private explode(x: number, y: number, z: number, radius: number, dmg: number, selfDmg: boolean) {
    const S = this.lastS!;
    let anyHit = false, anyKill = false;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const cy = 0.9 * e.scale;
      const d = Math.hypot(e.x - x, cy - y, e.z - z);
      if (d > radius + 0.5) continue;
      const f = 1 - clamp(d / (radius + 0.5), 0, 1);
      const dx = (e.x - x) / (d || 1), dz = (e.z - z) / (d || 1);
      const dd = S.oneHit ? 1e5 : dmg * (0.25 + 0.75 * f) * S.damageMult;
      anyHit = true;
      if (this.damageEnemy(e, dd, false, e.x, cy + 0.3, e.z, -dx, 0, -dz)) anyKill = true;
    }
    if (anyHit) {
      this.ui.onEvent({ type: "hit", head: false, kill: anyKill });
      sfx.hit(false, anyKill);
    }
    const ey = this.py + this.eyeHeight() * 0.6;
    const pd = Math.hypot(this.px - x, ey - y, this.pz - z);
    if (pd < radius) {
      const f = 1 - pd / radius;
      if (selfDmg) {
        this.hurtPlayer(dmg * 0.4 * f, x, z);
        // rocket-jump push
        const l = pd || 1;
        this.vx += ((this.px - x) / l) * f * 10;
        this.vz += ((this.pz - z) / l) * f * 10;
        this.vy += f * 9;
        this.onGround = false;
      }
    }
    // visuals
    const b = this.booms[this.boomCur];
    this.boomCur = (this.boomCur + 1) % this.booms.length;
    b.life = b.max = 0.55;
    b.radius = radius;
    b.mesh.position.set(x, y, z);
    b.mesh.visible = true;
    const n = Math.round(70 * S.particles);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, el = Math.random() * 1.2 - 0.1;
      const sp = rand(3, radius * 2.4);
      this.particles.emit(x, y, z, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + 2, Math.sin(a) * Math.cos(el) * sp, rand(0.4, 1.1), 1, rand(0.35, 0.8), 0.15, 9);
    }
    const dist = Math.hypot(this.px - x, this.pz - z);
    this.trauma = Math.min(1, this.trauma + clamp(1.1 - dist / 30, 0, 1) * (radius / 6.5));
    V.set(x - this.px, 0, z - this.pz);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const pan = clamp((cy * V.x - sy * V.z) / (dist || 1), -1, 1);
    sfx.explosion(clamp(1.1 - dist / 90, 0.2, 1) * (radius > 4 ? 1 : 0.6), pan);
  }

  private spawnRocket(x: number, y: number, z: number, dx: number, dy: number, dz: number) {
    const p = this.getProj("rocket");
    p.x = x; p.y = y; p.z = z;
    const sp = 52;
    p.vx = dx * sp; p.vy = dy * sp; p.vz = dz * sp;
    p.life = 5;
    p.active = true;
    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    Q.setFromUnitVectors(FWD, V.set(dx, dy, dz));
    p.mesh.quaternion.copy(Q);
  }

  private throwGrenade() {
    const S = this.lastS!;
    if (this.grenCD > 0 || this.state !== "playing") return;
    if (this.grenades <= 0 && !S.infGrenades) return;
    if (!S.infGrenades) this.grenades--;
    this.grenCD = 0.7;
    const p = this.getProj("grenade");
    this.forward(V);
    p.x = this.px + V.x * 0.6;
    p.y = this.py + this.eyeHeight() - 0.15;
    p.z = this.pz + V.z * 0.6;
    const sp = 17;
    p.vx = V.x * sp + this.vx * 0.5;
    p.vy = V.y * sp + 3.5;
    p.vz = V.z * sp + this.vz * 0.5;
    p.life = 2.2;
    p.active = true;
    p.mesh.visible = true;
    p.mesh.position.set(p.x, p.y, p.z);
    sfx.click(700, 0.5);
  }

  private getProj(kind: "rocket" | "grenade"): Proj {
    for (const p of this.projs) if (!p.active && p.kind === kind) return p;
    const mesh = new THREE.Mesh(kind === "rocket" ? this.rocketGeo : this.grenGeo, kind === "rocket" ? this.rocketMat : this.grenMat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.scene.add(mesh);
    const p: Proj = { kind, mesh, active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0 };
    this.projs.push(p);
    return p;
  }

  private updateProjectiles(dt: number, S: Settings) {
    for (const p of this.projs) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.kind === "rocket") {
        const sp = Math.hypot(p.vx, p.vy, p.vz);
        const dx = p.vx / sp, dy = p.vy / sp, dz = p.vz / sp;
        const step = sp * dt;
        let hitT = step + 1;
        let boom = false;
        if (this.world.ray(p.x, p.y, p.z, dx, dy, dz, step + 0.3, rh)) { hitT = rh.t; boom = true; }
        for (const e of this.enemies) {
          if (e.dead) continue;
          const t = this.rayEnemy(e, p.x, p.y, p.z, dx, dy, dz, Math.min(step + 0.3, hitT));
          if (t >= 0 && t < hitT) { hitT = t; boom = true; }
        }
        if (boom) {
          const hx = p.x + dx * hitT, hy = p.y + dy * hitT, hz = p.z + dz * hitT;
          p.active = false;
          p.mesh.visible = false;
          this.explode(hx - dx * 0.15, hy - dy * 0.15, hz - dz * 0.15, WEAPONS[5].splash!, WEAPONS[5].damage, true);
          continue;
        }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.mesh.position.set(p.x, p.y, p.z);
        // smoke / flame trail
        const n = Math.max(1, Math.round(3 * S.particles));
        for (let i = 0; i < n; i++) {
          this.particles.emit(p.x - dx * 0.4, p.y - dy * 0.4, p.z - dz * 0.4, rand(-0.6, 0.6) - dx * 3, rand(-0.6, 0.6) - dy * 3, rand(-0.6, 0.6) - dz * 3, rand(0.2, 0.5), 1, rand(0.5, 0.8), 0.2, 0);
        }
        if (p.life <= 0) { p.active = false; p.mesh.visible = false; this.explode(p.x, p.y, p.z, 6, 120, true); }
      } else {
        // grenade
        p.vy -= 18 * dt;
        let nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
        if (ny < 0.1) { ny = 0.1; p.vy = -p.vy * 0.45; p.vx *= 0.7; p.vz *= 0.7; if (Math.abs(p.vy) < 1) p.vy = 0; }
        for (const b of this.world.boxes) {
          if (nx > b.minX - 0.1 && nx < b.maxX + 0.1 && nz > b.minZ - 0.1 && nz < b.maxZ + 0.1 && ny < b.maxY + 0.1) {
            if (p.y >= b.maxY) { ny = b.maxY + 0.1; p.vy = -p.vy * 0.4; p.vx *= 0.8; p.vz *= 0.8; }
            else {
              const dl = Math.abs(p.x - b.minX), dr = Math.abs(p.x - b.maxX), dn = Math.abs(p.z - b.minZ), df = Math.abs(p.z - b.maxZ);
              const m = Math.min(dl, dr, dn, df);
              if (m === dl || m === dr) { p.vx = -p.vx * 0.5; nx = p.x; } else { p.vz = -p.vz * 0.5; nz = p.z; }
            }
          }
        }
        p.x = nx; p.y = ny; p.z = nz;
        p.mesh.position.set(p.x, p.y, p.z);
        p.mesh.rotation.x += dt * 8;
        p.mesh.rotation.z += dt * 6;
        if (Math.random() < 0.5) this.particles.emit(p.x, p.y + 0.1, p.z, rand(-0.5, 0.5), rand(0.5, 1.5), rand(-0.5, 0.5), 0.25, 1, 0.5, 0.1, 0);
        if (p.life <= 0) {
          p.active = false;
          p.mesh.visible = false;
          this.explode(p.x, p.y + 0.2, p.z, 7, 170, true);
        }
      }
    }
  }

  /* ---------- tracers / fx ---------- */
  private addTracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: number, life: number, width: number) {
    const t = this.tracers[this.tracerCur];
    this.tracerCur = (this.tracerCur + 1) % this.tracers.length;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.2) return;
    t.mesh.position.set(ax, ay, az);
    t.mesh.lookAt(bx, by, bz);
    t.mesh.scale.set(width, width, len);
    t.mat.color.setHex(color);
    t.mat.opacity = 0.9;
    t.life = t.max = life;
    t.width = width;
    t.mesh.visible = true;
  }

  private updateFx(dt: number) {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; continue; }
      t.mat.opacity = (t.life / t.max) * 0.9;
    }
    for (const b of this.booms) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) { b.mesh.visible = false; continue; }
      const p = 1 - b.life / b.max;
      const s = b.radius * (0.25 + 0.75 * (1 - Math.pow(1 - p, 3))) * 0.8;
      b.mesh.scale.setScalar(s);
      b.mat.opacity = (1 - p) * 0.85;
      b.mat.color.setRGB(1, 0.75 - p * 0.45, 0.25 - p * 0.2);
    }
    this.streakT -= dt;
    if (this.streakT <= 0) this.streak = 0;
  }

  /* ================================================================== */
  /*  Enemies / waves                                                    */
  /* ================================================================== */
  private startWave() {
    this.wave++;
    const S = this.lastS!;
    const count = Math.round((5 + this.wave * 2.4) * (S.maxAlive > 20 ? 1.2 : 1));
    this.toSpawn = Math.min(count, 70);
    this.spawnT = 0.5;
    this.ui.onEvent({ type: "banner", text: `WAVE ${this.wave}`, sub: `${this.toSpawn} hostiles incoming` });
    sfx.wave();
  }

  private updateWave(dt: number, S: Settings) {
    if (this.state !== "playing") return;
    const aliveCount = this.enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
    if (this.toSpawn === 0 && aliveCount === 0) {
      if (this.intermission > 0) {
        this.intermission -= dt;
        if (this.intermission <= 0) this.startWave();
      } else {
        this.intermission = this.wave === 0 ? 0.1 : 5;
        if (this.wave > 0) {
          this.ui.onEvent({ type: "banner", text: "WAVE CLEARED", sub: "Restock and get ready" });
          this.grenades = Math.min(6, this.grenades + 1);
          this.hp = Math.min(100, this.hp + 25);
        }
      }
      return;
    }
    if (this.toSpawn > 0) {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && aliveCount < S.maxAlive) {
        const w = this.wave;
        const r = Math.random();
        const heavy = w >= 3 ? Math.min(0.05 + (w - 3) * 0.03, 0.2) : 0;
        const mark = w >= 4 ? Math.min(0.07 + (w - 4) * 0.02, 0.16) : 0;
        const run = w >= 2 ? Math.min(0.16 + w * 0.02, 0.34) : 0;
        let kind: EnemyKind = "grunt";
        if (r < heavy) kind = "heavy";
        else if (r < heavy + mark) kind = "marksman";
        else if (r < heavy + mark + run) kind = "runner";
        this.spawnEnemy(kind);
        this.toSpawn--;
        this.spawnT = 0.55;
      }
    }
  }

  spawnEnemy(kind: EnemyKind) {
    if (this.state === "menu") return;
    const pts = this.world.spawns;
    let best = pts[0];
    let bd = -1;
    for (let i = 0; i < 14; i++) {
      const p = pts[Math.floor(Math.random() * pts.length)];
      const d = Math.hypot(p.x - this.px, p.z - this.pz);
      if (d >= 22) { best = p; bd = d; break; }
      if (d > bd) { bd = d; best = p; }
    }
    this.makeEnemy(kind, best.x + rand(-0.4, 0.4), best.z + rand(-0.4, 0.4));
  }

  private makeEnemy(kind: EnemyKind, x: number, z: number) {
    const def = ENEMIES[kind];
    const g = this.enemyGeos[kind];
    const mat = this.enemyMats[kind].clone();
    const group = new THREE.Group();
    group.rotation.order = "YXZ";
    const body = new THREE.Mesh(g.body, mat);
    const head = new THREE.Mesh(g.head, mat);
    head.position.y = 1.46;
    const legL = new THREE.Mesh(g.legL, mat);
    const legR = new THREE.Mesh(g.legR, mat);
    legL.position.y = legR.position.y = 0.88;
    body.castShadow = head.castShadow = legL.castShadow = legR.castShadow = true;
    const esp = new THREE.LineSegments(this.espGeo, this.espMat);
    esp.renderOrder = 999;
    esp.visible = false;
    esp.frustumCulled = false;
    group.add(body, head, legL, legR, esp);
    group.position.set(x, 0, z);
    this.scene.add(group);
    const blob = new THREE.Mesh(this.blobGeo, this.blobMat);
    blob.position.set(x, 0.04, z);
    this.scene.add(blob);
    const S = this.lastS!;
    const scale = def.scale * S.enemyScale;
    const hpMult = 1 + (this.wave - 1) * 0.06;
    const e: Enemy = {
      def, kind, group, head, legL, legR, blob, esp, mat, x, z, yaw: Math.atan2(this.px - x, this.pz - z),
      hp: def.hp * hpMult, maxHp: def.hp * hpMult, scale, dead: false, deadT: 0, age: 0, flash: 0, los: false, losT: Math.random() * 0.2,
      strafe: Math.random() < 0.5 ? -1 : 1, strafeT: rand(0.5, 2), shootT: rand(0.9, 2.1) + (kind === "marksman" ? 1.2 : 0), burstLeft: 0, burstT: 0,
      meleeT: 0.3, phase: Math.random() * 6, moveAmt: 0, stuckT: 0, lx: x, lz: z, detourT: 0, detourAng: 0,
      headFly: false, headVel: new THREE.Vector3(), headSpin: new THREE.Vector3(),
    };
    this.enemies.push(e);
    // spawn column
    const n = Math.max(4, Math.round(16 * S.particles));
    for (let i = 0; i < n; i++) {
      this.particles.emit(x + rand(-0.4, 0.4), rand(0, 0.3), z + rand(-0.4, 0.4), 0, rand(3, 7), 0, rand(0.35, 0.7), 0.2, 0.8, 1, 0);
    }
    return e;
  }

  private removeEnemy(e: Enemy) {
    this.scene.remove(e.group);
    this.scene.remove(e.blob);
    if (e.headFly) this.scene.remove(e.head);
    e.mat.dispose();
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
  }

  killAll() {
    for (const e of this.enemies) {
      if (!e.dead) this.killEnemy(e, false, 0, 0, 0);
    }
    this.toSpawn = 0;
  }

  refill() {
    this.hp = 100;
    this.ws.forEach((a, i) => { a.mag = WEAPONS[i].mag; a.reserve = WEAPONS[i].maxReserve; });
    this.grenades = 6;
    sfx.pickup();
    this.ui.onEvent({ type: "pickup", text: "FULL RESTOCK" });
  }

  nextWave() {
    for (const e of this.enemies) if (!e.dead) this.killEnemy(e, false, 0, 0, 0);
    this.toSpawn = 0;
    this.intermission = 0.1;
  }

  giveScore(n: number) {
    this.score += n;
  }

  /** debug helper */
  debugSet(x: number, y: number, z: number, yaw: number, pitch: number) {
    this.px = x; this.py = y; this.pz = z; this.yaw = yaw; this.pitch = pitch;
  }

  teleportTop() {
    this.px = 0; this.pz = -6; this.py = 4.3; this.vy = 0;
  }

  private updateEnemies(dt: number, S: Settings) {
    const eyeY = this.py + this.eyeHeight();
    const list = this.enemies;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      e.scale = e.def.scale * S.enemyScale;
      const sc = e.scale;
      if (!e.headFly) e.head.scale.setScalar(S.bigHeads);
      if (e.dead) {
        this.updateDeadEnemy(e, dt, S);
        if (e.deadT > 6) this.removeEnemy(e);
        continue;
      }
      e.age += dt;
      const appear = Math.min(1, e.age / 0.4);
      e.group.scale.set(sc, sc * (0.1 + 0.9 * appear), sc);
      e.esp.visible = S.esp;
      // flash
      if (e.flash > 0) {
        e.flash = Math.max(0, e.flash - dt * 7);
        e.mat.emissive.setRGB(e.flash * 0.9, e.flash * 0.25, e.flash * 0.1);
      }
      if (S.freeze || this.state !== "playing") {
        e.moveAmt = lerp(e.moveAmt, 0, Math.min(1, dt * 8));
        e.legL.rotation.x = lerp(e.legL.rotation.x, 0, Math.min(1, dt * 8));
        e.legR.rotation.x = -e.legL.rotation.x;
        continue;
      }
      const def = e.def;
      const dx = this.px - e.x, dz = this.pz - e.z;
      const dist = Math.hypot(dx, dz);
      const ty = Math.atan2(dx, dz);
      e.yaw += wrapAng(ty - e.yaw) * Math.min(1, dt * 9);
      e.group.rotation.y = e.yaw;

      e.losT -= dt;
      if (e.losT <= 0) {
        e.losT = 0.2 + Math.random() * 0.12;
        e.los = !this.world.blocked(e.x, 1.45 * sc, e.z, this.px, eyeY - 0.1, this.pz);
      }

      const nx = dist > 0.001 ? dx / dist : 0;
      const nz = dist > 0.001 ? dz / dist : 0;
      let mx = 0, mz = 0, spd = def.speed * (0.85 + 0.15 * S.enemyAggro);
      if (def.melee) {
        mx = nx; mz = nz;
        if (dist < 1.1 * sc + 0.45) { mx = 0; mz = 0; }
      } else if (!e.los || dist > def.keepMax) { mx = nx; mz = nz; }
      else if (dist < def.keepMin) { mx = -nx; mz = -nz; spd *= 0.8; }
      else {
        e.strafeT -= dt;
        if (e.strafeT <= 0) { e.strafeT = rand(1.2, 3); e.strafe = Math.random() < 0.5 ? -1 : 1; }
        mx = -nz * e.strafe; mz = nx * e.strafe; spd *= 0.55;
      }
      const wantsMove = mx !== 0 || mz !== 0;
      if (e.detourT > 0 && wantsMove) {
        e.detourT -= dt;
        const c = Math.cos(e.detourAng), s = Math.sin(e.detourAng);
        const rx = mx * c - mz * s, rz = mx * s + mz * c;
        mx = rx; mz = rz;
      }
      tmpP.x = e.x + mx * spd * dt * appear;
      tmpP.z = e.z + mz * spd * dt * appear;
      this.world.resolve(tmpP, 0.42 * sc, 0, 0.3);
      e.x = tmpP.x; e.z = tmpP.z;
      e.stuckT += dt;
      if (e.stuckT > 0.7) {
        const moved = Math.hypot(e.x - e.lx, e.z - e.lz);
        if (wantsMove && moved < spd * 0.7 * 0.22) {
          e.detourT = 1.3;
          e.detourAng = (Math.random() < 0.5 ? 1 : -1) * (1 + Math.random() * 0.7);
        }
        e.lx = e.x; e.lz = e.z; e.stuckT = 0;
      }
      e.group.position.set(e.x, 0, e.z);
      e.blob.position.set(e.x, 0.04, e.z);
      e.blob.scale.setScalar(1.35 * sc * appear);

      // animation
      e.moveAmt = lerp(e.moveAmt, wantsMove ? 1 : 0, Math.min(1, dt * 8));
      e.phase += spd * dt * 2.3 * (wantsMove ? 1 : 0);
      const sw = Math.sin(e.phase) * 0.75 * e.moveAmt;
      e.legL.rotation.x = sw;
      e.legR.rotation.x = -sw;
      e.head.position.y = 1.46 + Math.abs(Math.sin(e.phase)) * 0.025 * e.moveAmt;

      // attacks
      const agg = S.enemyAggro;
      if (agg > 0) {
        if (def.melee) {
          if (dist < 1.4 * sc + 0.6) {
            e.meleeT -= dt;
            if (e.meleeT <= 0) {
              e.meleeT = 0.75;
              this.hurtPlayer(def.dmg * Math.sqrt(agg), e.x, e.z);
            }
          } else e.meleeT = Math.max(e.meleeT, 0.25);
        } else if (e.los && dist < def.range) {
          if (e.burstLeft > 0) {
            e.burstT -= dt;
            if (e.burstT <= 0) {
              this.enemyShoot(e, dist);
              e.burstLeft--;
              e.burstT = 0.12;
              if (e.burstLeft === 0) e.shootT = rand(def.fireMin, def.fireMax) / agg;
            }
          } else {
            e.shootT -= dt;
            if (e.shootT <= 0) { e.burstLeft = def.burst; e.burstT = 0; }
          }
        }
      }
    }
    // separation
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        const min = 0.8 * (a.scale + b.scale) * 0.5;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          a.x -= (dx / d) * push; a.z -= (dz / d) * push;
          b.x += (dx / d) * push; b.z += (dz / d) * push;
        }
      }
    }
  }

  private updateDeadEnemy(e: Enemy, dt: number, S: Settings) {
    e.deadT += dt;
    const f = Math.min(1, e.deadT * 3.2);
    const ease = f * f * (3 - 2 * f);
    e.group.rotation.x = -ease * (Math.PI / 2) * 0.96;
    e.group.scale.set(e.scale, e.scale, e.scale);
    e.legL.rotation.x = lerp(e.legL.rotation.x, 0.2, dt * 6);
    e.legR.rotation.x = lerp(e.legR.rotation.x, -0.15, dt * 6);
    if (e.flash > 0) {
      e.flash = Math.max(0, e.flash - dt * 5);
      e.mat.emissive.setRGB(e.flash * 0.9, e.flash * 0.25, e.flash * 0.1);
    }
    if (e.deadT > 3.5) {
      e.group.position.y -= dt * 0.7;
      e.blob.scale.multiplyScalar(Math.max(0, 1 - dt * 2));
    }
    if (e.headFly) {
      const h = e.head;
      e.headVel.y -= 18 * dt;
      h.position.addScaledVector(e.headVel, dt);
      h.rotation.x += e.headSpin.x * dt;
      h.rotation.y += e.headSpin.y * dt;
      h.rotation.z += e.headSpin.z * dt;
      const floor = 0.2 * S.bigHeads;
      if (h.position.y < floor) {
        h.position.y = floor;
        e.headVel.y *= -0.4;
        e.headVel.x *= 0.65;
        e.headVel.z *= 0.65;
        e.headSpin.multiplyScalar(0.6);
        if (Math.abs(e.headVel.y) < 0.8) e.headVel.y = 0;
      }
      if (e.deadT > 3.5) h.position.y -= dt * 0.7;
    }
  }

  private enemyShoot(e: Enemy, dist: number) {
    const S = this.lastS!;
    const def = e.def;
    const geo = this.enemyGeos[e.kind];
    const s = e.scale;
    const mxl = geo.muzzle[0], myl = geo.muzzle[1], mzl = geo.muzzle[2];
    const cy = Math.cos(e.yaw), sy = Math.sin(e.yaw);
    const wx = e.x + (mxl * cy + mzl * sy) * s;
    const wz = e.z + (-mxl * sy + mzl * cy) * s;
    const wy = myl * s;
    const tx = this.px, ty = this.py + this.eyeHeight() * 0.72, tz = this.pz;
    const moving = Math.hypot(this.vx, this.vz) / 5;
    let p = def.acc * clamp(1.1 - dist / 70, 0.28, 1) * (1 - 0.25 * Math.min(1, moving)) * (this.crouchT > 0.5 ? 0.85 : 1) * Math.min(1.4, 0.6 + S.enemyAggro * 0.4);
    p = clamp(p, 0.05, 0.95);
    const hit = Math.random() < p;
    let ex = tx, ey = ty, ez = tz;
    if (!hit) {
      const off = 0.5 + dist * 0.04;
      ex += rand(-off, off); ey += rand(-off * 0.5, off * 0.5); ez += rand(-off, off);
      // make sure misses don't instantly end at the player
      if (Math.hypot(ex - tx, ez - tz) < 0.5) ex += 0.9;
    }
    const col = e.kind === "marksman" ? 0xd090ff : e.kind === "heavy" ? 0xff7040 : 0xff5030;
    // extend miss tracer beyond target
    if (!hit) {
      const dx = ex - wx, dy = ey - wy, dz = ez - wz;
      ex = wx + dx * 1.4; ey = wy + dy * 1.4; ez = wz + dz * 1.4;
    }
    this.addTracer(wx, wy, wz, ex, ey, ez, col, e.kind === "marksman" ? 0.18 : 0.09, e.kind === "marksman" ? 0.04 : 0.025);
    const sy2 = Math.sin(this.yaw), cy2 = Math.cos(this.yaw);
    const pan = clamp((cy2 * (e.x - this.px) - sy2 * (e.z - this.pz)) / (dist || 1), -1, 1);
    sfx.shot(e.kind === "marksman" ? "marksman" : "enemy", clamp(1.1 - dist / 70, 0.15, 1), pan);
    if (hit) this.hurtPlayer(def.dmg * Math.sqrt(S.enemyAggro), e.x, e.z);
    else if (Math.random() < 0.4) {
      // near-miss flinch
      this.trauma = Math.min(1, this.trauma + 0.12);
    }
  }

  /* ================================================================== */
  /*  Pickups                                                            */
  /* ================================================================== */
  private dropPickup(x: number, z: number, kind: "health" | "ammo") {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(kind === "health" ? this.pickGeos.health : this.pickGeos.ammo, this.pickMat);
    mesh.position.y = 0.6;
    const beam = new THREE.Mesh(this.beamGeo, this.beamMats[kind]);
    beam.position.y = 1.5;
    group.add(mesh, beam);
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.pickups.push({ group, kind, x, z, life: 28, t: Math.random() * 6 });
    if (this.pickups.length > 14) this.removePickup(0);
  }

  private removePickup(i: number) {
    const p = this.pickups[i];
    this.scene.remove(p.group);
    this.pickups.splice(i, 1);
  }

  private updatePickups(dt: number, S: Settings) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.life -= dt;
      p.t += dt;
      const mesh = p.group.children[0];
      mesh.rotation.y += dt * 2;
      mesh.position.y = 0.6 + Math.sin(p.t * 3) * 0.1;
      if (p.life < 4) p.group.visible = Math.floor(p.life * 6) % 2 === 0;
      if (p.life <= 0) { this.removePickup(i); continue; }
      if (this.state !== "playing") continue;
      let d = Math.hypot(this.px - p.x, this.pz - p.z);
      if (S.magnet && d < 18 && d > 0.1) {
        const k = Math.min(1, dt * 7);
        p.x += (this.px - p.x) * k;
        p.z += (this.pz - p.z) * k;
        p.group.position.set(p.x, 0, p.z);
        d = Math.hypot(this.px - p.x, this.pz - p.z);
      }
      if (d < 1.5 && Math.abs(this.py - 0) < 4) {
        if (p.kind === "health") {
          if (this.hp >= 100) continue;
          this.hp = Math.min(100, this.hp + 35);
          this.ui.onEvent({ type: "pickup", text: "+35 HEALTH" });
        } else {
          this.ws.forEach((a, idx) => {
            const w = WEAPONS[idx];
            a.reserve = Math.min(w.maxReserve, a.reserve + Math.ceil(w.mag * (idx === this.cur ? 2 : 1)));
          });
          if (this.grenades < 6) this.grenades++;
          this.ui.onEvent({ type: "pickup", text: "+AMMO  +GRENADE" });
        }
        sfx.pickup();
        this.removePickup(i);
      }
    }
  }

  /* ================================================================== */
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    this.ro?.disconnect();
    document.removeEventListener("pointerlockchange", this.onLockChange);
    document.removeEventListener("pointerlockerror", this.onLockError);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("wheel", this.onWheel);
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("contextmenu", this.onCtx);
    window.removeEventListener("blur", this.onBlur);
    if (document.pointerLockElement) document.exitPointerLock();
    this.world.dispose();
    this.particles.dispose();
    this.models.forEach((m) => m.geos.forEach((g) => g.dispose()));
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !(m.geometry as THREE.BufferGeometry).userData.keep) m.geometry.dispose();
    });
    this.extraDispose.forEach((d) => d.dispose());
    this.flashMat.map?.dispose();
    this.flashMat.dispose();
    this.weaponMat.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    if (this.renderer.domElement.parentElement) this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
  }
}
