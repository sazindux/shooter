import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-400">{title}</h3>
        {hint && <span className="text-[10px] text-white/40">{hint}</span>}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export function Toggle({
  label, desc, value, onChange, hot, danger,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  hot?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        "group flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors",
        value
          ? danger
            ? "border-red-500/60 bg-red-500/15"
            : "border-emerald-400/60 bg-emerald-400/15"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
      )}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-white">
          {label}
          {hot && <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-mono text-white/60">{hot}</kbd>}
        </span>
        {desc && <span className="block text-[11px] leading-tight text-white/45">{desc}</span>}
      </span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          value ? (danger ? "bg-red-500" : "bg-emerald-400") : "bg-white/20"
        )}
      >
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", value ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}

export function Slider({
  label, value, min, max, step, onChange, fmt, desc,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
  desc?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-white">{label}</span>
        <span className="rounded bg-amber-400/15 px-1.5 py-0.5 font-mono text-[11px] text-amber-300">{fmt ? fmt(value) : value}</span>
      </div>
      {desc && <div className="mb-1 text-[11px] leading-tight text-white/45">{desc}</div>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400"
        style={{ background: `linear-gradient(to right, #fbbf24 ${pct}%, rgba(255,255,255,0.15) ${pct}%)` }}
      />
    </div>
  );
}

export function Btn({
  children, onClick, variant = "ghost", disabled, className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "green";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-2 text-[12px] font-bold uppercase tracking-wider transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35",
        variant === "primary" && "bg-amber-400 text-black shadow-[0_0_24px_rgba(251,191,36,0.35)] hover:bg-amber-300",
        variant === "green" && "bg-emerald-500 text-black hover:bg-emerald-400",
        variant === "danger" && "border border-red-500/50 bg-red-500/15 text-red-300 hover:bg-red-500/30",
        variant === "ghost" && "border border-white/15 bg-white/[0.05] text-white hover:bg-white/[0.12]",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Seg<T extends string>({
  options, value, onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-md border border-white/10 bg-black/30 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "flex-1 rounded px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
            value === o.id ? "bg-amber-400 text-black" : "text-white/60 hover:bg-white/10"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
