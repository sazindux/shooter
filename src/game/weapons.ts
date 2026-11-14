import type { ShotKind } from "./audio";

export interface WeaponSpec {
  id: string;
  name: string;
  tag: string;
  damage: number;
  pellets: number;
  headMult: number;
  rpm: number;
  auto: boolean;
  mag: number;
  maxReserve: number;
  reload: number;
  spread: number; // radians cone (hip)
  adsSpread: number; // multiplier while aiming
  moveSpread: number; // added while moving (radians)
  recoil: number; // pitch kick (radians)
  recoilYaw: number;
  kick: number; // viewmodel kickback
  adsFov: number;
  scope: boolean;
  range: number;
  fallStart: number;
  fallEnd: number;
  fallMin: number;
  pierce: number; // enemies penetrated
  projectile?: "rocket";
  splash?: number;
  spinUp?: boolean;
  sound: ShotKind;
  flash: number;
  tracer: number;
  moveMult: number;
  hip: [number, number, number];
  ads: [number, number, number];
  muzzle: [number, number, number];
  stats: { dmg: number; rate: number; acc: number; rng: number };
}

export const WEAPONS: WeaponSpec[] = [
  {
    id: "pistol", name: "M9 RAPTOR", tag: "Sidearm",
    damage: 30, pellets: 1, headMult: 2.6, rpm: 380, auto: false, mag: 15, maxReserve: 150, reload: 1.15,
    spread: 0.007, adsSpread: 0.35, moveSpread: 0.012, recoil: 0.018, recoilYaw: 0.004, kick: 0.05,
    adsFov: 62, scope: false, range: 160, fallStart: 40, fallEnd: 120, fallMin: 0.6, pierce: 1,
    sound: "pistol", flash: 0.7, tracer: 0xffe9a0, moveMult: 1.05,
    hip: [0.2, -0.17, -0.42], ads: [0, -0.1, -0.36], muzzle: [0, 0.03, -0.27],
    stats: { dmg: 40, rate: 45, acc: 85, rng: 55 },
  },
  {
    id: "smg", name: "VECTOR-X SMG", tag: "Submachine gun",
    damage: 17, pellets: 1, headMult: 2.2, rpm: 880, auto: true, mag: 32, maxReserve: 320, reload: 1.55,
    spread: 0.014, adsSpread: 0.45, moveSpread: 0.018, recoil: 0.011, recoilYaw: 0.006, kick: 0.035,
    adsFov: 66, scope: false, range: 140, fallStart: 25, fallEnd: 80, fallMin: 0.45, pierce: 1,
    sound: "smg", flash: 0.75, tracer: 0xfff0b0, moveMult: 1.02,
    hip: [0.2, -0.18, -0.4], ads: [0, -0.11, -0.34], muzzle: [0, 0.015, -0.6],
    stats: { dmg: 30, rate: 90, acc: 60, rng: 40 },
  },
  {
    id: "rifle", name: "AK-Z ASSAULT", tag: "Assault rifle",
    damage: 27, pellets: 1, headMult: 2.7, rpm: 620, auto: true, mag: 30, maxReserve: 270, reload: 1.9,
    spread: 0.009, adsSpread: 0.3, moveSpread: 0.016, recoil: 0.016, recoilYaw: 0.006, kick: 0.045,
    adsFov: 55, scope: false, range: 200, fallStart: 60, fallEnd: 160, fallMin: 0.6, pierce: 1,
    sound: "rifle", flash: 0.95, tracer: 0xffdf80, moveMult: 0.98,
    hip: [0.2, -0.2, -0.38], ads: [0, -0.115, -0.3], muzzle: [0, 0.02, -0.92],
    stats: { dmg: 55, rate: 70, acc: 75, rng: 75 },
  },
  {
    id: "shotgun", name: "BREAKER-12", tag: "Pump shotgun",
    damage: 13, pellets: 10, headMult: 1.8, rpm: 75, auto: false, mag: 8, maxReserve: 64, reload: 2.3,
    spread: 0.055, adsSpread: 0.65, moveSpread: 0.01, recoil: 0.07, recoilYaw: 0.012, kick: 0.14,
    adsFov: 66, scope: false, range: 90, fallStart: 8, fallEnd: 32, fallMin: 0.12, pierce: 1,
    sound: "shotgun", flash: 1.3, tracer: 0xffc070, moveMult: 0.96,
    hip: [0.2, -0.2, -0.4], ads: [0, -0.12, -0.34], muzzle: [0, 0.025, -0.94],
    stats: { dmg: 95, rate: 25, acc: 35, rng: 25 },
  },
  {
    id: "sniper", name: "LONGBOW .50", tag: "Sniper rifle",
    damage: 150, pellets: 1, headMult: 3.2, rpm: 52, auto: false, mag: 5, maxReserve: 40, reload: 2.6,
    spread: 0.03, adsSpread: 0.0, moveSpread: 0.03, recoil: 0.065, recoilYaw: 0.006, kick: 0.16,
    adsFov: 14, scope: true, range: 400, fallStart: 400, fallEnd: 400, fallMin: 1, pierce: 3,
    sound: "sniper", flash: 1.2, tracer: 0xa8e8ff, moveMult: 0.9,
    hip: [0.24, -0.25, -0.34], ads: [0, -0.1, -0.3], muzzle: [0, 0.015, -1.18],
    stats: { dmg: 100, rate: 12, acc: 100, rng: 100 },
  },
  {
    id: "rocket", name: "HAVOC LAUNCHER", tag: "Rocket launcher",
    damage: 170, pellets: 1, headMult: 1, rpm: 70, auto: false, mag: 1, maxReserve: 14, reload: 1.7,
    spread: 0.004, adsSpread: 0.3, moveSpread: 0.006, recoil: 0.06, recoilYaw: 0.01, kick: 0.2,
    adsFov: 64, scope: false, range: 300, fallStart: 300, fallEnd: 300, fallMin: 1, pierce: 1,
    projectile: "rocket", splash: 6.5,
    sound: "rocket", flash: 1.4, tracer: 0xff9040, moveMult: 0.86,
    hip: [0.22, -0.2, -0.4], ads: [0, -0.14, -0.34], muzzle: [0, 0.02, -0.98],
    stats: { dmg: 100, rate: 8, acc: 80, rng: 80 },
  },
  {
    id: "minigun", name: "REAPER MINIGUN", tag: "Heavy",
    damage: 13, pellets: 1, headMult: 2.0, rpm: 1500, auto: true, mag: 200, maxReserve: 600, reload: 4.0,
    spread: 0.03, adsSpread: 0.6, moveSpread: 0.012, recoil: 0.006, recoilYaw: 0.008, kick: 0.02,
    adsFov: 70, scope: false, range: 150, fallStart: 30, fallEnd: 100, fallMin: 0.5, pierce: 1, spinUp: true,
    sound: "minigun", flash: 1.0, tracer: 0xffd070, moveMult: 0.72,
    hip: [0.18, -0.2, -0.38], ads: [0, -0.14, -0.36], muzzle: [0, 0, -0.85],
    stats: { dmg: 22, rate: 100, acc: 40, rng: 45 },
  },
];
