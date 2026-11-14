import { useEffect, useMemo, useRef, useState } from "react";
import { Engine, type GameEvent, type GameState, type HudData } from "./game/engine";
import { Hud, type Bus } from "./ui/Hud";
import { Menu } from "./ui/Menu";

const INITIAL_HUD: HudData = {
  hp: 100, mag: 30, reserve: 135, infinite: false, weapon: 2, reload: -1, wave: 0, kills: 0, heads: 0, score: 0, left: 0,
  grenades: 3, streak: 0, fps: 60, scale: 75, scope: false, spread: 10, best: 0, acc: 0, intermission: 0,
  ammoList: [15, 32, 30, 8, 5, 1, 200], sprinting: false,
};

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [state, setState] = useState<GameState>("menu");
  const [hud, setHud] = useState<HudData>(INITIAL_HUD);
  const [lockFail, setLockFail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listeners = useRef(new Set<(e: GameEvent) => void>());

  const bus: Bus = useMemo(
    () => ({
      sub: (fn) => {
        listeners.current.add(fn);
        return () => {
          listeners.current.delete(fn);
        };
      },
    }),
    []
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let eng: Engine;
    try {
      eng = new Engine(host, {
        onState: (s) => {
          setState(s);
          if (s === "playing") setLockFail(false);
        },
        onHud: (h) => setHud(h),
        onEvent: (e) => {
          if (e.type === "lockfail") setLockFail(true);
          listeners.current.forEach((f) => f(e));
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    setEngine(eng);
    (window as unknown as { __arena?: Engine }).__arena = eng;
    return () => {
      eng.dispose();
      setEngine(null);
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <div ref={hostRef} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black p-6 text-center text-white">
          <div className="max-w-md space-y-3">
            <h1 className="text-2xl font-black text-red-400">WebGL unavailable</h1>
            <p className="text-sm text-white/70">
              This game needs WebGL. Enable hardware acceleration in your browser settings and update your graphics drivers, then reload.
            </p>
            <p className="font-mono text-xs text-white/40">{error}</p>
          </div>
        </div>
      )}
      {state === "playing" && <Hud hud={hud} bus={bus} />}
      {state !== "playing" && !error && <Menu mode={state} engine={engine} hud={hud} lockFail={lockFail} />}
    </div>
  );
}
