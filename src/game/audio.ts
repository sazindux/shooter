// Tiny procedural sound engine - no audio files, very light on CPU.
export type ShotKind =
  | "pistol"
  | "smg"
  | "rifle"
  | "shotgun"
  | "sniper"
  | "rocket"
  | "minigun"
  | "enemy"
  | "marksman";

interface BlastOpts {
  dur: number;
  lp: number;
  gain: number;
  thump: number;
  thumpGain?: number;
  crack?: number;
}

const BLASTS: Record<ShotKind, BlastOpts> = {
  pistol: { dur: 0.14, lp: 5200, gain: 0.7, thump: 200, thumpGain: 0.6 },
  smg: { dur: 0.09, lp: 6200, gain: 0.55, thump: 170, thumpGain: 0.45 },
  rifle: { dur: 0.13, lp: 4600, gain: 0.7, thump: 130, thumpGain: 0.6 },
  shotgun: { dur: 0.34, lp: 3200, gain: 1.0, thump: 95, thumpGain: 0.9 },
  sniper: { dur: 0.6, lp: 2800, gain: 1.0, thump: 70, thumpGain: 1, crack: 3000 },
  rocket: { dur: 0.55, lp: 1600, gain: 0.8, thump: 80, thumpGain: 0.8 },
  minigun: { dur: 0.07, lp: 5000, gain: 0.45, thump: 140, thumpGain: 0.35 },
  enemy: { dur: 0.1, lp: 3600, gain: 0.45, thump: 150, thumpGain: 0.3 },
  marksman: { dur: 0.4, lp: 2400, gain: 0.8, thump: 90, thumpGain: 0.6, crack: 2500 },
};

export class Sfx {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  noise: AudioBuffer | null = null;
  volume = 0.5;
  private lastShotAt = 0;

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private out(pan: number, vol: number): AudioNode | null {
    if (!this.ctx || !this.master) return null;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    if (pan !== 0 && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      p.connect(this.master);
    } else {
      g.connect(this.master);
    }
    return g;
  }

  private noiseBurst(dest: AudioNode, t: number, dur: number, lp: number, gain: number, type: BiquadFilterType = "lowpass") {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(lp, t);
    if (type === "lowpass") f.frequency.exponentialRampToValueAtTime(Math.max(120, lp * 0.08), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private tone(dest: AudioNode, t: number, f0: number, f1: number, dur: number, gain: number, type: OscillatorType = "sine") {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  shot(kind: ShotKind, vol = 1, pan = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // limit event spam
    if (kind === "enemy" && now - this.lastShotAt < 0.03) return;
    if (kind === "enemy") this.lastShotAt = now;
    const o = BLASTS[kind];
    const dest = this.out(pan, vol);
    if (!dest) return;
    this.noiseBurst(dest, now, o.dur, o.lp, o.gain);
    this.tone(dest, now, o.thump, o.thump * 0.35, o.dur * 0.7, o.thumpGain ?? 0.5);
    if (o.crack) this.noiseBurst(dest, now, 0.05, o.crack, 0.5, "highpass");
  }

  explosion(vol = 1, pan = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const dest = this.out(pan, vol);
    if (!dest) return;
    this.noiseBurst(dest, now, 1.2, 1400, 1.2);
    this.tone(dest, now, 90, 28, 0.9, 1.1);
  }

  hit(head: boolean, kill: boolean) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const dest = this.out(0, 0.5);
    if (!dest) return;
    if (head) {
      this.tone(dest, now, 1500, 1300, 0.12, 0.6, "triangle");
      this.tone(dest, now + 0.03, 2300, 2100, 0.2, 0.45, "triangle");
    } else {
      this.tone(dest, now, 900, 700, 0.06, 0.45, "square");
    }
    if (kill) this.tone(dest, now, 200, 60, 0.18, 0.6);
  }

  hurt() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const dest = this.out(0, 0.8);
    if (!dest) return;
    this.noiseBurst(dest, now, 0.2, 500, 0.8);
    this.tone(dest, now, 120, 50, 0.2, 0.6);
  }

  click(freq = 1800, vol = 0.4) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const dest = this.out(0, vol);
    if (!dest) return;
    this.noiseBurst(dest, now, 0.025, freq, 0.7, "highpass");
  }

  reload(total: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const dest = this.out(0, 0.6);
    if (!dest) return;
    this.noiseBurst(dest, now + total * 0.15, 0.04, 1400, 0.8, "highpass");
    this.tone(dest, now + total * 0.15, 400, 200, 0.05, 0.3, "square");
    this.noiseBurst(dest, now + total * 0.7, 0.05, 900, 0.9, "highpass");
    this.tone(dest, now + total * 0.7, 300, 120, 0.07, 0.4, "square");
  }

  pickup() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const dest = this.out(0, 0.5);
    if (!dest) return;
    this.tone(dest, now, 600, 900, 0.1, 0.5, "triangle");
    this.tone(dest, now + 0.08, 900, 1400, 0.14, 0.5, "triangle");
  }

  wave() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const dest = this.out(0, 0.5);
    if (!dest) return;
    this.tone(dest, now, 220, 220, 0.25, 0.4, "sawtooth");
    this.tone(dest, now + 0.2, 330, 330, 0.35, 0.4, "sawtooth");
  }

  toggle(on: boolean) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const dest = this.out(0, 0.4);
    if (!dest) return;
    this.tone(dest, now, on ? 500 : 800, on ? 900 : 400, 0.1, 0.5, "square");
  }
}

export const sfx = new Sfx();
