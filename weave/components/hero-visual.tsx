import { Layers } from "lucide-react";
import { PlatformBadge, PlatformStack, type Platform } from "./platform";

const STRANDS: { platform: Platform; line: string; hue: number; rot: string }[] = [
  { platform: "instagram", line: "Welcome photo", hue: 330, rot: "-rotate-3" },
  { platform: "tiktok", line: "Behind the scenes", hue: 290, rot: "rotate-2" },
  { platform: "instagram", line: "Matchday carousel", hue: 15, rot: "-rotate-1" },
  { platform: "tiktok", line: "Same clip, reposted", hue: 230, rot: "rotate-3" },
];

/** Illustrative only: four posts converging into one story card. */
export function HeroVisual() {
  return (
    <div className="relative mx-auto grid w-full max-w-xl grid-cols-[1fr_auto_1.25fr] items-center gap-3 sm:gap-5" aria-hidden>
      <div className="flex flex-col gap-2.5">
        {STRANDS.map((s, i) => (
          <div
            key={s.platform}
            className={`animate-weave-in flex items-center gap-2 rounded-xl border bg-card p-2 shadow-sm ${s.rot}`}
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <span
              className="size-9 shrink-0 rounded-lg"
              style={{ background: `linear-gradient(135deg, oklch(0.75 0.13 ${s.hue}), oklch(0.45 0.14 ${s.hue + 30}))` }}
            />
            <div className="min-w-0">
              <PlatformBadge platform={s.platform} size="sm" className="ring-0" />
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{s.line}</p>
            </div>
          </div>
        ))}
      </div>

      <svg viewBox="0 0 60 200" className="h-48 w-10 sm:w-14">
        {[25, 75, 125, 175].map((y, i) => (
          <path
            key={y}
            d={`M0 ${y} C 30 ${y}, 30 100, 60 100`}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            stroke={["#f472b6", "#a78bfa", "#fb7185", "#60a5fa"][i]}
            strokeDasharray="4 5"
          />
        ))}
      </svg>

      <div className="animate-weave-in overflow-hidden rounded-2xl border bg-card shadow-xl [animation-delay:400ms]">
        <div className="grid aspect-[4/3] grid-cols-3 grid-rows-2 gap-0.5 bg-border">
          {STRANDS.map((s, i) => (
            <div
              key={s.platform}
              className={i === 0 ? "col-span-2 row-span-2" : i === 3 ? "hidden" : ""}
              style={{ background: `linear-gradient(135deg, oklch(0.75 0.13 ${s.hue}), oklch(0.45 0.14 ${s.hue + 30}))` }}
            />
          ))}
        </div>
        <div className="p-3">
          <div className="flex items-center gap-1.5">
            <PlatformStack platforms={STRANDS.map((s) => s.platform)} size="sm" />
            <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background">
              <Layers className="size-2.5" /> 4 → 1
            </span>
          </div>
          <p className="mt-2 font-display text-lg leading-tight">One story, every source kept</p>
          <div className="mt-2 space-y-1">
            <div className="h-1.5 w-full rounded bg-muted" />
            <div className="h-1.5 w-4/5 rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
