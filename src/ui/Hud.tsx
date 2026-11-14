import { useEffect, useRef, useState } from "react";
import type { GameEvent, HudData } from "../game/engine";
import { WEAPONS } from "../game/weapons";
import { useSettings } from "../game/settings";
import { cn } from "../utils/cn";

export type Bus = {
  sub: (fn: (e: GameEvent) => void) => () => void;
};

let uid = 1;

export function Hud({ hud, bus }: { hud: HudData; bus: Bus }) {
  const S = useSettings();
  const [hit, setHit] = useState({ id: 0, head: false, kill: false });
  const [feed, setFeed] = useState<{ id: number; text: string; head: boolean; pts: number }[]>([]);
  const [popup, setPopup] = useState<{ id: number; head: boolean; pts: number; streak: number; name: string } | null>(null);
  const [banner, setBanner] = useState<{ id: number; text: string; sub?: string } | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string; on?: boolean } | null>(null);
  const [hurts, setHurts] = useState<{ id: number; angle: number }[]>([]);
  const [pick, setPick] = useState<{ id: number; text: string } | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const later = (fn: () => void, ms: number) => {
      timers.current.push(window.setTimeout(fn, ms));
    };
    const off = bus.sub((e) => {
      switch (e.type) {
        case "hit":
          setHit({ id: uid++, head: e.head, kill: e.kill });
          break;
        case "kill": {
          const id = uid++;
          setPopup({ id, head: e.head, pts: e.points, streak: e.streak, name: e.name });
          setFeed((f) => [...f.slice(-4), { id, text: e.name, head: e.head, pts: e.points }]);
          later(() => setFeed((f) => f.filter((x) => x.id !== id)), 4000);
          break;
        }
        case "banner": {
          const id = uid++;
          setBanner({ id, text: e.text, sub: e.sub });
          later(() => setBanner((b) => (b && b.id === id ? null : b)), 2800);
          break;
        }
        case "toast": {
          const id = uid++;
          setToast({ id, text: e.text, on: e.on });
          later(() => setToast((b) => (b && b.id === id ? null : b)), 1500);
          break;
        }
        case "hurt": {
          const id = uid++;
          setHurts((h) => [...h.slice(-3), { id, angle: e.angle }]);
          later(() => setHurts((h) => h.filter((x) => x.id !== id)), 900);
          break;
        }
        case "pickup": {
          const id = uid++;
          setPick({ id, text: e.text });
          later(() => setPick((b) => (b && b.id === id ? null : b)), 1400);
          break;
        }
      }
    });
    const t = timers.current;
    return () => {
      off();
      t.forEach((x) => window.clearTimeout(x));
    };
  }, [bus]);

  const w = WEAPONS[hud.weapon];
  const gap = 5 + hud.spread;
  const low = hud.hp <= 30;

  const hacks: string[] = [];
  if (S.god) hacks.push("GOD");
  if (S.aimbot) hacks.push("AIMBOT");
  if (S.triggerbot) hacks.push("TRIGGER");
  if (S.esp) hacks.push("ESP");
  if (S.fly) hacks.push("FLY");
  if (S.noclip) hacks.push("NOCLIP");
  if (S.infAmmo) hacks.push("∞AMMO");
  if (S.oneHit) hacks.push("1-HIT");
  if (S.headAlways) hacks.push("ALL HEADSHOTS");
  if (S.explosiveBullets) hacks.push("EXPLOSIVE");
  if (S.freeze) hacks.push("FREEZE");
  if (S.timeScale < 1) hacks.push(`SLOWMO ${S.timeScale.toFixed(1)}x`);

  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden font-sans text-white">
      {/* low health vignette */}
      <div
        className={cn("absolute inset-0", low && "hud-pulse")}
        style={{
          background: `radial-gradient(ellipse at center, transparent 55%, rgba(200,0,0,${low ? 0.55 : 0.0}) 100%)`,
        }}
      />

      {/* damage indicators */}
      {hurts.map((h) => (
        <div key={h.id} className="hud-hurt absolute left-1/2 top-1/2 h-0 w-0" style={{ transform: `rotate(${h.angle}rad)` }}>
          <div
            className="absolute -left-28 -top-[170px] h-10 w-56"
            style={{
              background: "radial-gradient(ellipse at 50% 0%, rgba(255,40,40,0.95), rgba(255,0,0,0) 70%)",
              clipPath: "polygon(0 0,100% 0,85% 100%,15% 100%)",
            }}
          />
        </div>
      ))}

      {/* scope */}
      {hud.scope && (
        <div className="absolute inset-0 bg-black" style={{ WebkitMaskImage: "radial-gradient(circle at center, transparent 0, transparent 33vh, black 33.6vh)", maskImage: "radial-gradient(circle at center, transparent 0, transparent 33vh, black 33.6vh)" }}>
          <div className="absolute left-1/2 top-1/2 h-[66vh] w-[66vh] -translate-x-1/2 -translate-y-1/2 rounded-full" />
        </div>
      )}
      {hud.scope && (
        <>
          <div className="absolute left-0 right-0 top-1/2 h-px bg-black/80" style={{ left: "calc(50% - 33vh)", right: "calc(50% - 33vh)" }} />
          <div className="absolute bottom-0 top-0 w-px bg-black/80" style={{ top: "calc(50% - 33vh)", bottom: "calc(50% - 33vh)", left: "50%" }} />
          <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" />
          <div className="absolute left-1/2 top-1/2 h-[66vh] w-[66vh] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-black" />
        </>
      )}

      {/* crosshair */}
      {!hud.scope && (
        <div className="absolute left-1/2 top-1/2">
          <div className="absolute h-[2px] w-[9px] bg-white shadow-[0_0_2px_#000]" style={{ left: -gap - 9, top: -1 }} />
          <div className="absolute h-[2px] w-[9px] bg-white shadow-[0_0_2px_#000]" style={{ left: gap, top: -1 }} />
          <div className="absolute h-[9px] w-[2px] bg-white shadow-[0_0_2px_#000]" style={{ top: -gap - 9, left: -1 }} />
          <div className="absolute h-[9px] w-[2px] bg-white shadow-[0_0_2px_#000]" style={{ top: gap, left: -1 }} />
          <div className="absolute h-[3px] w-[3px] rounded-full bg-white/90 shadow-[0_0_2px_#000]" style={{ left: -1.5, top: -1.5 }} />
        </div>
      )}

      {/* hit marker */}
      {hit.id > 0 && (
        <div key={hit.id} className="hud-hit absolute left-1/2 top-1/2">
          {[45, 135, 225, 315].map((a) => (
            <div
              key={a}
              className="absolute"
              style={{
                width: hit.head ? 13 : 10,
                height: hit.head ? 4 : 3,
                left: -2,
                top: -2,
                background: hit.head || hit.kill ? "#ff2a2a" : "#fff",
                transform: `rotate(${a}deg) translateX(${hit.head ? 13 : 10}px)`,
                boxShadow: "0 0 4px #000",
              }}
            />
          ))}
        </div>
      )}

      {/* kill popup */}
      {popup && (
        <div key={popup.id} className="hud-popup absolute left-1/2 top-[58%] -translate-x-1/2 text-center">
          {popup.head && <div className="text-2xl font-black tracking-[0.3em] text-red-500 drop-shadow-[0_0_8px_rgba(255,0,0,0.8)]">HEADSHOT</div>}
          <div className="text-lg font-bold text-amber-300 drop-shadow-[0_2px_2px_#000]">
            +{popup.pts} <span className="text-white/80">{popup.name}</span>
            {popup.streak >= 3 && <span className="ml-2 text-orange-400">x{popup.streak} STREAK</span>}
          </div>
        </div>
      )}

      {/* banner */}
      {banner && (
        <div key={banner.id} className="hud-banner absolute left-0 right-0 top-[18%] text-center">
          <div className="text-6xl font-black italic tracking-[0.15em] text-white drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]">{banner.text}</div>
          {banner.sub && <div className="mt-1 text-sm font-semibold uppercase tracking-[0.35em] text-amber-300">{banner.sub}</div>}
        </div>
      )}

      {hud.intermission > 0 && !banner && (
        <div className="absolute left-1/2 top-[14%] -translate-x-1/2 rounded bg-black/50 px-4 py-1 text-sm font-bold tracking-widest text-amber-300">
          NEXT WAVE IN {Math.ceil(hud.intermission)}
        </div>
      )}

      {/* top-left: wave */}
      <div className="absolute left-4 top-4 space-y-1">
        <div className="flex items-center gap-3 rounded border-l-4 border-amber-400 bg-black/55 px-3 py-1.5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-300">Wave</div>
            <div className="text-2xl font-black leading-none">{Math.max(1, hud.wave)}</div>
          </div>
          <div className="h-8 w-px bg-white/20" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/60">Hostiles</div>
            <div className="text-2xl font-black leading-none">{hud.left}</div>
          </div>
        </div>
        {hacks.length > 0 && (
          <div className="flex max-w-[360px] flex-wrap gap-1">
            {hacks.map((h) => (
              <span key={h} className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300 ring-1 ring-emerald-400/40">
                {h}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* top-right: score */}
      <div className="absolute right-4 top-4 text-right">
        <div className="rounded border-r-4 border-amber-400 bg-black/55 px-3 py-1.5">
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-300">Score</div>
          <div className="text-3xl font-black leading-none tabular-nums">{hud.score.toLocaleString()}</div>
          <div className="mt-1 flex justify-end gap-3 text-[11px] font-semibold text-white/70">
            <span>KILLS {hud.kills}</span>
            <span className="text-red-400">HEADSHOTS {hud.heads}</span>
          </div>
        </div>
        <div className="mt-2 space-y-0.5">
          {feed.map((f) => (
            <div key={f.id} className="hud-feed inline-block rounded bg-black/50 px-2 py-0.5 text-[11px] font-bold">
              <div>
                {f.head && <span className="mr-1 text-red-400">☠</span>}
                <span className="text-white/80">{f.text}</span> <span className="text-amber-300">+{f.pts}</span>
              </div>
            </div>
          ))}
        </div>
        {S.showFps && (
          <div className="mt-2 font-mono text-[10px] text-white/60">
            {hud.fps} FPS · {hud.scale}% res
          </div>
        )}
      </div>

      {/* toast */}
      {toast && (
        <div key={toast.id} className="hud-popup absolute left-1/2 top-[30%] -translate-x-1/2 rounded bg-black/70 px-4 py-2 text-lg font-black tracking-widest">
          {toast.text} {toast.on !== undefined && <span className={toast.on ? "text-emerald-400" : "text-red-400"}>{toast.on ? "ON" : "OFF"}</span>}
        </div>
      )}
      {pick && (
        <div key={pick.id} className="hud-popup absolute left-1/2 top-[66%] -translate-x-1/2 text-base font-black tracking-widest text-emerald-300 drop-shadow-[0_2px_2px_#000]">
          {pick.text}
        </div>
      )}

      {/* bottom-left: health */}
      <div className="absolute bottom-5 left-5 w-64">
        <div className="flex items-end gap-2">
          <div className={cn("text-5xl font-black leading-none tabular-nums drop-shadow-[0_2px_4px_#000]", low ? "text-red-500" : "text-white")}>{hud.hp}</div>
          <div className="pb-1 text-xs font-bold tracking-[0.25em] text-white/60">HEALTH{S.god ? " · GOD" : ""}</div>
        </div>
        <div className="mt-1 h-2.5 overflow-hidden rounded-sm border border-white/20 bg-black/60">
          <div
            className="h-full transition-[width] duration-150"
            style={{ width: `${hud.hp}%`, background: low ? "linear-gradient(90deg,#b91c1c,#ef4444)" : S.god ? "linear-gradient(90deg,#f59e0b,#fde047)" : "linear-gradient(90deg,#16a34a,#4ade80)" }}
          />
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs font-bold text-white/80">
          <span className="rounded bg-black/55 px-2 py-0.5">💣 {S.infGrenades ? "∞" : hud.grenades} <span className="text-white/40">[G]</span></span>
          {hud.streak >= 2 && <span className="rounded bg-orange-500/80 px-2 py-0.5 text-black">STREAK x{hud.streak}</span>}
        </div>
      </div>

      {/* bottom-right: ammo */}
      <div className="absolute bottom-5 right-5 text-right">
        <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber-300">{w.name}</div>
        <div className="flex items-end justify-end gap-2">
          <div className={cn("text-6xl font-black leading-none tabular-nums drop-shadow-[0_2px_4px_#000]", hud.mag === 0 && !hud.infinite ? "text-red-500" : "text-white")}>{hud.infinite ? "∞" : hud.mag}</div>
          <div className="pb-1 text-xl font-bold text-white/50">/ {hud.infinite ? "∞" : hud.reserve}</div>
        </div>
        <div className="mt-1 h-1.5 w-56 overflow-hidden rounded-sm bg-black/60">
          <div className="h-full bg-amber-400" style={{ width: hud.reload >= 0 ? `${hud.reload * 100}%` : "0%" }} />
        </div>
        <div className="mt-0.5 h-3 text-[10px] font-bold uppercase tracking-widest text-white/60">{hud.reload >= 0 ? "Reloading…" : hud.mag === 0 && !hud.infinite ? "Press R to reload" : ""}</div>
      </div>

      {/* weapon bar */}
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-1.5">
        {WEAPONS.map((wp, i) => (
          <div
            key={wp.id}
            className={cn(
              "flex h-11 w-[74px] flex-col items-center justify-center rounded border px-1 text-center",
              i === hud.weapon ? "border-amber-400 bg-amber-400/25" : "border-white/15 bg-black/45 opacity-80"
            )}
          >
            <div className="flex w-full items-center justify-between text-[9px] font-bold text-white/60">
              <span>{i + 1}</span>
              <span>{hud.infinite ? "∞" : hud.ammoList[i]}</span>
            </div>
            <div className="w-full truncate text-[10px] font-extrabold leading-tight">{wp.name.split(" ")[0]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
