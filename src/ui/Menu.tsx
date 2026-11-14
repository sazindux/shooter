import { useState } from "react";
import type { Engine, HudData } from "../game/engine";
import { WEAPONS } from "../game/weapons";
import { applyPreset, DEFAULTS, resetHacks, setSettings, useSettings, type Settings } from "../game/settings";
import { Btn, Section, Seg, Slider, Toggle } from "./controls";
import { cn } from "../utils/cn";

type Tab = "play" | "hacks" | "graphics" | "controls";

const TABS: { id: Tab; label: string }[] = [
  { id: "play", label: "Armory" },
  { id: "hacks", label: "God Mode Hacks" },
  { id: "graphics", label: "Graphics" },
  { id: "controls", label: "Controls" },
];

function Bar({ v, color }: { v: number; color: string }) {
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, v)}%`, background: color }} />
    </div>
  );
}

const ALL_CHEATS: Partial<Settings> = {
  god: true, infAmmo: true, noRecoil: true, noSpread: true, infGrenades: true, magnet: true, headAlways: true,
  aimbot: true, esp: true, damageMult: 3, fireRateMult: 1.5, speedMult: 1.4,
};

export function Menu({
  mode, engine, hud, lockFail,
}: {
  mode: "menu" | "paused" | "dead";
  engine: Engine | null;
  hud: HudData;
  lockFail: boolean;
}) {
  const [tab, setTab] = useState<Tab>("play");
  const S = useSettings();
  const set = (p: Partial<Settings>) => setSettings(p);
  const inGame = mode !== "menu";

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(8,12,20,0.55),rgba(4,6,10,0.88))] p-3 text-white">
      <div className="flex max-h-[96vh] w-[min(1120px,98vw)] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0b0f17]/[0.96] shadow-2xl">
        {/* header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-amber-500/15 via-transparent to-transparent px-5 py-3">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 40 40" className="h-9 w-9 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="20" cy="20" r="12" />
              <path d="M20 2v10M20 28v10M2 20h10M28 20h10" />
              <circle cx="20" cy="20" r="2" fill="currentColor" />
            </svg>
            <div>
              <h1 className="text-2xl font-black italic leading-none tracking-[0.12em]">
                ARENA<span className="text-amber-400"> STRIKE</span>
              </h1>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">3D wave shooter · tuned for low-end PCs</p>
            </div>
          </div>
          <nav className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-md px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors",
                  tab === t.id ? "bg-amber-400 text-black" : "text-white/60 hover:bg-white/10 hover:text-white",
                  t.id === "hacks" && tab !== t.id && "text-emerald-300"
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "play" && <PlayTab mode={mode} engine={engine} hud={hud} />}
          {tab === "hacks" && <HacksTab S={S} set={set} engine={engine} inGame={inGame} />}
          {tab === "graphics" && <GraphicsTab S={S} set={set} />}
          {tab === "controls" && <ControlsTab S={S} set={set} />}
        </div>

        {/* footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-black/30 px-5 py-3">
          <div className="text-[11px] text-white/45">
            {lockFail ? (
              <span className="font-semibold text-amber-300">Mouse capture was blocked — wait a second and click again (or open in a new tab).</span>
            ) : (
              <>Settings save automatically. Press <kbd className="rounded bg-white/10 px-1">Esc</kbd> in-game to open this menu.</>
            )}
          </div>
          <div className="flex gap-2">
            {mode === "menu" && (
              <Btn variant="primary" className="px-8 py-3 text-sm" onClick={() => engine?.start()}>
                ▶ Deploy
              </Btn>
            )}
            {mode === "paused" && (
              <>
                <Btn variant="danger" onClick={() => engine?.quitToMenu()}>Quit</Btn>
                <Btn onClick={() => engine?.restart()}>Restart</Btn>
                <Btn variant="primary" className="px-8 py-3 text-sm" onClick={() => engine?.resume()}>▶ Resume</Btn>
              </>
            )}
            {mode === "dead" && (
              <>
                <Btn variant="danger" onClick={() => engine?.quitToMenu()}>Main menu</Btn>
                <Btn variant="primary" className="px-8 py-3 text-sm" onClick={() => engine?.restart()}>↻ Redeploy</Btn>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function PlayTab({ mode, engine, hud }: { mode: "menu" | "paused" | "dead"; engine: Engine | null; hud: HudData }) {
  void engine;
  return (
    <div className="space-y-4">
      {mode === "dead" && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-center">
          <div className="text-4xl font-black italic tracking-[0.2em] text-red-400">YOU DIED</div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Score", hud.score.toLocaleString()],
              ["Best", Math.max(hud.best, hud.score).toLocaleString()],
              ["Wave", String(hud.wave)],
              ["Kills", String(hud.kills)],
              ["Headshots", `${hud.heads}  ·  ${hud.acc}% acc`],
            ].map(([k, v]) => (
              <div key={k} className="rounded bg-black/40 px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">{k}</div>
                <div className="text-lg font-black">{v}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-white/60">Too hard? Open <b className="text-emerald-300">God Mode Hacks</b> and flip on invincibility, aimbot or one-hit kills.</p>
        </div>
      )}
      {mode === "menu" && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-4">
          <p className="text-sm leading-relaxed text-white/80">
            Survive endless waves of hostile troopers in a neon-lit arena. <b className="text-red-400">Aim for the head</b> — headshots deal massive bonus damage, drop heads and award 1.5× points. Grab health and ammo drops, chain kills for streak multipliers, and use the{" "}
            <b className="text-emerald-300">God Mode Hacks</b> tab for invincibility, aimbot, wallhack, fly and more.
          </p>
        </div>
      )}
      <div>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.25em] text-amber-400">Arsenal — all 7 unlocked (keys 1–7 / mouse wheel)</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {WEAPONS.map((w, i) => (
            <div key={w.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-extrabold tracking-wide">{w.name}</div>
                  <div className="text-[10px] uppercase tracking-widest text-white/40">{w.tag}</div>
                </div>
                <kbd className="rounded bg-amber-400 px-2 py-1 text-xs font-black text-black">{i + 1}</kbd>
              </div>
              <div className="mt-2 space-y-1 text-[10px] font-bold uppercase tracking-wider text-white/50">
                {[
                  ["DMG", w.stats.dmg, "#f87171"],
                  ["RATE", w.stats.rate, "#fbbf24"],
                  ["ACC", w.stats.acc, "#4ade80"],
                  ["RNG", w.stats.rng, "#60a5fa"],
                ].map(([k, v, c]) => (
                  <div key={k as string} className="flex items-center gap-2">
                    <span className="w-8">{k}</span>
                    <Bar v={v as number} color={c as string} />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-white/45">
                <span>Mag {w.mag}</span>
                <span>{w.headMult}× head</span>
                <span>{w.pellets > 1 ? `${w.pellets} pellets` : w.projectile ? "explosive" : w.auto ? "full-auto" : "semi-auto"}</span>
              </div>
            </div>
          ))}
          <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-3 text-xs text-white/55">
            <div className="text-sm font-extrabold text-white">GRENADES [G]</div>
            Cook-free frag toss with a 2.2 s fuse. One refilled each wave. Bounces off walls and crates.
            <div className="mt-2 text-white/40">Enemies: Grunts, Rushers (melee), Juggernauts (armored), Marksmen (long range, high damage).</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function HacksTab({ S, set, engine, inGame }: { S: Settings; set: (p: Partial<Settings>) => void; engine: Engine | null; inGame: boolean }) {
  const x = (v: number) => `${v.toFixed(v >= 10 ? 0 : 1)}×`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/5 px-4 py-2.5">
        <p className="text-xs text-emerald-100/80">
          Every hack works live — toggle them here or with <b>hotkeys</b> while playing. Hacks are saved between sessions.
        </p>
        <div className="flex gap-2">
          <Btn variant="green" onClick={() => set(ALL_CHEATS)}>⚡ Enable all</Btn>
          <Btn variant="danger" onClick={() => resetHacks()}>Reset hacks</Btn>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-3">
          <Section title="Survival">
            <Toggle label="God Mode" hot="Y" desc="Invincible. Nothing can hurt you." value={S.god} onChange={(v) => set({ god: v })} />
            <Toggle label="Infinite Ammo" desc="Never reload, never run dry." value={S.infAmmo} onChange={(v) => set({ infAmmo: v })} />
            <Toggle label="Infinite Grenades" value={S.infGrenades} onChange={(v) => set({ infGrenades: v })} />
            <Toggle label="Pickup Magnet" desc="Drops fly to you from across the arena." value={S.magnet} onChange={(v) => set({ magnet: v })} />
          </Section>
          <Section title="Movement">
            <Toggle label="Fly Mode" hot="F" desc="Space = up, C = down, Shift = boost." value={S.fly} onChange={(v) => set({ fly: v })} />
            <Toggle label="Noclip" hot="N" desc="Walk through walls and crates." value={S.noclip} onChange={(v) => set({ noclip: v })} />
            <Slider label="Move speed" value={S.speedMult} min={0.5} max={4} step={0.1} fmt={x} onChange={(v) => set({ speedMult: v })} />
            <Slider label="Jump power" value={S.jumpMult} min={1} max={4} step={0.1} fmt={x} onChange={(v) => set({ jumpMult: v })} />
          </Section>
        </div>

        <div className="space-y-3">
          <Section title="Weapons">
            <Toggle label="No Recoil" value={S.noRecoil} onChange={(v) => set({ noRecoil: v })} />
            <Toggle label="No Spread" desc="Laser-accurate, even shotguns." value={S.noSpread} onChange={(v) => set({ noSpread: v })} />
            <Toggle label="One-Hit Kill" desc="Every bullet kills." value={S.oneHit} onChange={(v) => set({ oneHit: v })} danger />
            <Toggle label="Always Headshot" desc="Every hit counts as a headshot." value={S.headAlways} onChange={(v) => set({ headAlways: v })} />
            <Toggle label="Explosive Bullets" value={S.explosiveBullets} onChange={(v) => set({ explosiveBullets: v })} danger />
            <Toggle label="Wall-bang" desc="Bullets pierce walls and enemies." value={S.pierceWalls} onChange={(v) => set({ pierceWalls: v })} />
            <Slider label="Damage" value={S.damageMult} min={0.5} max={20} step={0.5} fmt={x} onChange={(v) => set({ damageMult: v })} />
            <Slider label="Fire rate" value={S.fireRateMult} min={0.5} max={6} step={0.1} fmt={x} onChange={(v) => set({ fireRateMult: v })} />
          </Section>
        </div>

        <div className="space-y-3">
          <Section title="Aim assist & vision">
            <Toggle label="Aimbot" hot="B" desc="Locks onto the nearest enemy." value={S.aimbot} onChange={(v) => set({ aimbot: v })} />
            {S.aimbot && (
              <div className="space-y-1.5 rounded-md border border-white/10 bg-black/30 p-2">
                <Seg options={[{ id: "fire", label: "While firing / ADS" }, { id: "always", label: "Always" }]} value={S.aimbotMode} onChange={(v) => set({ aimbotMode: v })} />
                <Seg options={[{ id: "head", label: "Head" }, { id: "body", label: "Body" }]} value={S.aimbotHead ? "head" : "body"} onChange={(v) => set({ aimbotHead: v === "head" })} />
                <Toggle label="Through walls" value={S.aimbotWalls} onChange={(v) => set({ aimbotWalls: v })} />
                <Slider label="FOV" value={S.aimbotFov} min={5} max={180} step={1} fmt={(v) => `${v}°`} onChange={(v) => set({ aimbotFov: v })} />
                <Slider label="Lock speed" desc="Low = human-like, high = instant snap." value={S.aimbotSpeed} min={1} max={40} step={1} onChange={(v) => set({ aimbotSpeed: v })} />
              </div>
            )}
            <Toggle label="Triggerbot" desc="Auto-fires when crosshair is on an enemy." value={S.triggerbot} onChange={(v) => set({ triggerbot: v })} />
            <Toggle label="ESP Wallhack" hot="V" desc="See enemy boxes through walls." value={S.esp} onChange={(v) => set({ esp: v })} />
          </Section>
          <Section title="Enemies & world">
            <Slider label="Slow motion" desc="World slows down, you don't." value={S.timeScale} min={0.1} max={1} step={0.05} fmt={(v) => `${v.toFixed(2)}×`} onChange={(v) => set({ timeScale: v })} />
            <Toggle label="Freeze Enemies" value={S.freeze} onChange={(v) => set({ freeze: v })} />
            <Slider label="Big heads" desc="Bigger head hitbox & model." value={S.bigHeads} min={1} max={5} step={0.25} fmt={x} onChange={(v) => set({ bigHeads: v })} />
            <Slider label="Enemy size" value={S.enemyScale} min={0.5} max={3} step={0.1} fmt={x} onChange={(v) => set({ enemyScale: v })} />
            <Slider label="Max alive" value={S.maxAlive} min={2} max={40} step={1} onChange={(v) => set({ maxAlive: v })} />
            <Slider label="Aggression" desc="0 = pacifist, 1 = normal, 2.5 = nightmare" value={S.enemyAggro} min={0} max={2.5} step={0.1} fmt={x} onChange={(v) => set({ enemyAggro: v })} />
          </Section>
        </div>
      </div>

      <Section title="Cheat actions" hint={inGame ? "instant" : "deploy first to use"}>
        <div className="flex flex-wrap gap-2">
          <Btn variant="green" disabled={!inGame} onClick={() => engine?.refill()}>❤ Heal + refill [H]</Btn>
          <Btn variant="danger" disabled={!inGame} onClick={() => engine?.killAll()}>☠ Kill all [K]</Btn>
          <Btn disabled={!inGame} onClick={() => engine?.nextWave()}>⏭ Skip wave</Btn>
          <Btn disabled={!inGame} onClick={() => engine?.giveScore(10000)}>+10,000 score</Btn>
          <Btn disabled={!inGame} onClick={() => engine?.teleportTop()}>⇪ Teleport to platform</Btn>
          <span className="mx-1 hidden w-px bg-white/15 sm:block" />
          <Btn disabled={!inGame} onClick={() => engine?.spawnEnemy("grunt")}>+ Grunt</Btn>
          <Btn disabled={!inGame} onClick={() => engine?.spawnEnemy("runner")}>+ Rusher</Btn>
          <Btn disabled={!inGame} onClick={() => engine?.spawnEnemy("heavy")}>+ Juggernaut</Btn>
          <Btn disabled={!inGame} onClick={() => engine?.spawnEnemy("marksman")}>+ Marksman</Btn>
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function GraphicsTab({ S, set }: { S: Settings; set: (p: Partial<Settings>) => void }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="space-y-3">
        <Section title="Quality preset">
          <Seg
            options={[
              { id: "potato", label: "Potato" },
              { id: "low", label: "Low" },
              { id: "medium", label: "Medium" },
              { id: "high", label: "High" },
            ]}
            value={(S.quality === "custom" ? "" : S.quality) as "potato"}
            onChange={(v) => applyPreset(v)}
          />
          <p className="text-[11px] text-white/45">
            Current: <b className="text-amber-300">{S.quality.toUpperCase()}</b>
          </p>
        </Section>
        <Section title="Performance">
          <Slider label="Render resolution" desc="Biggest FPS lever. Lower = faster." value={S.renderScale} min={0.4} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ renderScale: v })} />
          <Toggle label="Adaptive resolution" desc="Automatically lowers resolution when FPS drops, restores it when there's headroom." value={S.adaptive} onChange={(v) => set({ adaptive: v })} />
          <Toggle label="Dynamic shadows" desc="Pretty but heavy on integrated GPUs." value={S.shadows} onChange={(v) => set({ shadows: v })} />
          <Slider label="Particle amount" value={S.particles} min={0.1} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ particles: v })} />
          <Toggle label="Bullet-hole decals" value={S.decals} onChange={(v) => set({ decals: v })} />
          <Toggle label="Show FPS counter" value={S.showFps} onChange={(v) => set({ showFps: v })} />
        </Section>
      </div>
      <div className="space-y-3">
        <Section title="Camera">
          <Slider label="Field of view" value={S.fov} min={60} max={110} step={1} fmt={(v) => `${v}°`} onChange={(v) => set({ fov: v })} />
          <Toggle label="Head bob & sway" value={S.headBob} onChange={(v) => set({ headBob: v })} />
        </Section>
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-4 text-xs leading-relaxed text-white/70">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">Optimized for your PC</div>
          Built for Intel HD Graphics + Core i5-2400 class hardware: no post-processing, no real-time lights, merged level geometry (a handful of draw calls),
          vertex-colored low-poly models, one-draw-call particles, pooled effects and analytic hit detection instead of mesh raycasts.
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-white/55">
            <li>Default is <b>Low + adaptive resolution</b> which holds ~60 FPS by itself.</li>
            <li>Still choppy? Choose <b>Potato</b> or drop render resolution to 50%.</li>
            <li>Keep <b>shadows off</b> for the smoothest play.</li>
            <li>Close other browser tabs & enable hardware acceleration in your browser.</li>
          </ul>
        </div>
        <Btn onClick={() => set({ ...DEFAULTS, ...pick(S) })}>Restore graphics defaults</Btn>
      </div>
    </div>
  );
}

function pick(S: Settings): Partial<Settings> {
  // keep all non-graphics settings untouched when restoring graphics defaults
  const keepKeys = Object.keys(DEFAULTS).filter((k) => !["quality", "renderScale", "adaptive", "shadows", "particles", "decals", "fov", "showFps"].includes(k));
  const out: Record<string, unknown> = {};
  for (const k of keepKeys) out[k] = (S as unknown as Record<string, unknown>)[k];
  return out as Partial<Settings>;
}

/* ------------------------------------------------------------------ */
function ControlsTab({ S, set }: { S: Settings; set: (p: Partial<Settings>) => void }) {
  const keys: [string, string][] = [
    ["W A S D", "Move"], ["Shift", "Sprint"], ["Space", "Jump"], ["C", "Crouch"], ["Mouse 1", "Fire"], ["Mouse 2", "Aim down sights / scope"],
    ["R", "Reload"], ["1–7 / Wheel", "Switch weapon"], ["Q", "Last weapon"], ["G", "Throw grenade"], ["Esc", "Pause / menu"],
    ["Y", "God mode"], ["B", "Aimbot"], ["V", "ESP wallhack"], ["F", "Fly"], ["N", "Noclip"], ["T", "Slow motion"],
    ["H", "Heal + refill"], ["K", "Kill all"], ["L", "Spawn random enemy"],
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="space-y-3">
        <Section title="Input">
          <Slider label="Mouse sensitivity" value={S.sensitivity} min={0.1} max={3} step={0.05} fmt={(v) => v.toFixed(2)} onChange={(v) => set({ sensitivity: v })} />
          <Toggle label="Invert Y axis" value={S.invertY} onChange={(v) => set({ invertY: v })} />
          <Toggle label="Cheat hotkeys" desc="Y B V F N T H K L work during play." value={S.hotkeys} onChange={(v) => set({ hotkeys: v })} />
        </Section>
        <Section title="Audio">
          <Slider label="Master volume" value={S.volume} min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ volume: v })} />
        </Section>
      </div>
      <Section title="Key bindings">
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {keys.map(([k, d]) => (
            <div key={k} className="flex items-center justify-between rounded bg-white/[0.04] px-2.5 py-1.5 text-xs">
              <span className="text-white/70">{d}</span>
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">{k}</kbd>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
