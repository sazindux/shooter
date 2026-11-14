import { useSyncExternalStore } from "react";

export type Quality = "potato" | "low" | "medium" | "high" | "custom";

export interface Settings {
  /* ---------- HACKS ---------- */
  god: boolean;
  infAmmo: boolean;
  noRecoil: boolean;
  noSpread: boolean;
  oneHit: boolean;
  headAlways: boolean;
  explosiveBullets: boolean;
  pierceWalls: boolean;
  infGrenades: boolean;
  magnet: boolean;
  fly: boolean;
  noclip: boolean;
  aimbot: boolean;
  aimbotMode: "always" | "fire";
  aimbotHead: boolean;
  aimbotWalls: boolean;
  aimbotFov: number; // degrees
  aimbotSpeed: number; // 1..40
  triggerbot: boolean;
  esp: boolean;
  freeze: boolean;
  damageMult: number;
  fireRateMult: number;
  speedMult: number;
  jumpMult: number;
  timeScale: number;
  bigHeads: number;
  enemyScale: number;
  maxAlive: number;
  enemyAggro: number;
  hotkeys: boolean;

  /* ---------- GRAPHICS ---------- */
  quality: Quality;
  renderScale: number;
  adaptive: boolean;
  shadows: boolean;
  particles: number;
  decals: boolean;
  fov: number;
  showFps: boolean;

  /* ---------- CONTROLS ---------- */
  sensitivity: number;
  volume: number;
  invertY: boolean;
  headBob: boolean;
}

export const DEFAULTS: Settings = {
  god: false,
  infAmmo: false,
  noRecoil: false,
  noSpread: false,
  oneHit: false,
  headAlways: false,
  explosiveBullets: false,
  pierceWalls: false,
  infGrenades: false,
  magnet: false,
  fly: false,
  noclip: false,
  aimbot: false,
  aimbotMode: "fire",
  aimbotHead: true,
  aimbotWalls: false,
  aimbotFov: 60,
  aimbotSpeed: 14,
  triggerbot: false,
  esp: false,
  freeze: false,
  damageMult: 1,
  fireRateMult: 1,
  speedMult: 1,
  jumpMult: 1,
  timeScale: 1,
  bigHeads: 1,
  enemyScale: 1,
  maxAlive: 12,
  enemyAggro: 1,
  hotkeys: true,

  quality: "low",
  renderScale: 0.75,
  adaptive: true,
  shadows: false,
  particles: 0.6,
  decals: true,
  fov: 78,
  showFps: true,

  sensitivity: 1,
  volume: 0.5,
  invertY: false,
  headBob: true,
};

export const PRESETS: Record<Exclude<Quality, "custom">, Partial<Settings>> = {
  potato: { renderScale: 0.5, shadows: false, particles: 0.3, decals: false },
  low: { renderScale: 0.75, shadows: false, particles: 0.6, decals: true },
  medium: { renderScale: 0.9, shadows: false, particles: 0.85, decals: true },
  high: { renderScale: 1, shadows: true, particles: 1, decals: true },
};

const KEY = "arena-strike-settings-v1";

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

let current: Settings = load();
const listeners = new Set<() => void>();
let saveTimer: number | undefined;

export function getSettings(): Settings {
  return current;
}

export function setSettings(patch: Partial<Settings>) {
  const next = { ...current, ...patch };
  // any manual gfx tweak flips quality to custom
  if (
    patch.quality === undefined &&
    ("renderScale" in patch || "shadows" in patch || "particles" in patch || "decals" in patch)
  ) {
    next.quality = "custom";
  }
  current = next;
  listeners.forEach((l) => l());
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
      /* ignore */
    }
  }, 300);
}

export function applyPreset(q: Exclude<Quality, "custom">) {
  setSettings({ ...PRESETS[q], quality: q });
}

export function resetHacks() {
  const keep: Partial<Settings> = {};
  const hackKeys: (keyof Settings)[] = [
    "god","infAmmo","noRecoil","noSpread","oneHit","headAlways","explosiveBullets","pierceWalls","infGrenades",
    "magnet","fly","noclip","aimbot","aimbotMode","aimbotHead","aimbotWalls","aimbotFov","aimbotSpeed","triggerbot",
    "esp","freeze","damageMult","fireRateMult","speedMult","jumpMult","timeScale","bigHeads","enemyScale","maxAlive","enemyAggro",
  ];
  for (const k of hackKeys) (keep as Record<string, unknown>)[k] = DEFAULTS[k];
  setSettings(keep);
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
