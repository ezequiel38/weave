"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowRight, Layers } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { splitTrailingHashtags, titleAndRest } from "@/lib/format";
import { MediaTile } from "./media-tile";
import { PlatformBadge, PlatformStack, type Platform } from "./platform";

const STRAND_COLORS = ["#f472b6", "#a78bfa", "#fb7185", "#60a5fa"];
// Tilted cards only where there is room (literal classes so Tailwind sees them).
const ROTATIONS = ["sm:-rotate-3", "sm:rotate-2", "sm:-rotate-1", "sm:rotate-3"];

function Strands({ count }: { count: number }) {
  const ys = Array.from({ length: count }, (_, i) => (200 / (count + 1)) * (i + 1));
  return (
    <>
      {/* Small screens: sources sit side by side above the card, strands run down */}
      <svg viewBox="0 0 200 48" className="h-10 w-full sm:hidden" aria-hidden>
        {ys.map((x, i) => (
          <path
            key={i}
            d={`M${x} 0 C ${x} 24, 100 24, 100 48`}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            stroke={STRAND_COLORS[i % STRAND_COLORS.length]}
            strokeDasharray="4 5"
          />
        ))}
      </svg>
    <svg viewBox="0 0 60 200" className="hidden h-48 w-14 sm:block" aria-hidden>
      {ys.map((y, i) => (
        <path
          key={i}
          d={`M0 ${y} C 30 ${y}, 30 100, 60 100`}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          stroke={STRAND_COLORS[i % STRAND_COLORS.length]}
          strokeDasharray="4 5"
        />
      ))}
    </svg>
    </>
  );
}

/** Live example: the best real merged story in the database, converging into its card. */
export function HeroVisual() {
  const stories = useQuery(api.feed.showcase);
  const [n, setN] = useState(0);
  const count = stories?.length ?? 0;
  // Shuffle through real weaves; start at a random one so reloads vary.
  useEffect(() => {
    if (count < 2) return;
    const start = setTimeout(() => setN(Math.floor(Math.random() * count)), 0);
    const tick = setInterval(() => setN((i) => (i + 1) % count), 6000);
    return () => {
      clearTimeout(start);
      clearInterval(tick);
    };
  }, [count]);
  if (stories === undefined) return <div className="mx-auto aspect-[4/3] w-full max-w-xl" />;
  const story = stories[n % Math.max(count, 1)];
  if (!story) return <IllustrativeHero />;
  // Exact reposts show their media once, like the feed (prefer Instagram: no TikTok overlay).
  const dupGroup = story.posts.some((p) => p.role === "duplicate") ? story.posts.filter((p) => p.role !== "complement") : [];
  const keep = dupGroup.find((p) => p.platform === "instagram") ?? dupGroup[0];
  const tiles = story.posts
    .filter((p) => !dupGroup.includes(p) || p === keep)
    .flatMap((p) => (p.media[0] ? [{ m: p.media[0], platform: p.platform }] : []))
    .slice(0, 3);

  return (
    <div key={story._id} className="relative mx-auto flex w-full max-w-sm flex-col items-stretch sm:grid sm:max-w-xl sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.25fr)] sm:items-center sm:gap-5">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-col sm:gap-2.5">
        {story.posts.map((p, i) => (
          <div
            key={p._id}
            className={`animate-weave-in flex min-w-0 items-center gap-2 rounded-xl border bg-card p-2 shadow-sm ${ROTATIONS[i % 4]}`}
            style={{ animationDelay: `${i * 90}ms` }}
          >
            {p.media[0] ? (
              <MediaTile media={p.media[0]} compact frame className="size-10 shrink-0 rounded-lg" />
            ) : (
              <span className="size-10 shrink-0 rounded-lg bg-muted" />
            )}
            <div className="min-w-0">
              <PlatformBadge platform={p.platform} size="sm" className="ring-0" />
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{titleAndRest(p.text).title}</p>
            </div>
          </div>
        ))}
      </div>

      <Strands count={story.posts.length} />

      <div className="animate-weave-in overflow-hidden rounded-2xl border bg-card shadow-xl [animation-delay:400ms]">
        <div
          className={`grid aspect-[4/3] gap-0.5 bg-border ${tiles.length >= 3 ? "grid-cols-3 grid-rows-2" : tiles.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}
        >
          {tiles.map(({ m, platform }, i) => (
            <div key={m._id} className={`relative ${tiles.length >= 3 && i === 0 ? "col-span-2 row-span-2" : ""}`}>
              <MediaTile media={m} platform={platform} className="absolute inset-0" />
            </div>
          ))}
        </div>
        <div className="p-3">
          <div className="flex items-center gap-1.5">
            <PlatformStack platforms={story.platforms} size="sm" />
            <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background">
              <Layers className="size-2.5" /> {story.postCount} → 1
            </span>
          </div>
          <p className="mt-2 line-clamp-2 font-display text-lg leading-tight">{splitTrailingHashtags(story.title).body}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{story.summary}</p>
          {story.team && (
            <Link
              href={`/t/${story.team.slug}`}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              A real story from {story.team.name}&apos;s weave <ArrowRight className="size-3" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

const STRANDS: { platform: Platform; line: string; hue: number }[] = [
  { platform: "instagram", line: "Welcome photo", hue: 330 },
  { platform: "tiktok", line: "Behind the scenes", hue: 290 },
  { platform: "instagram", line: "Matchday carousel", hue: 15 },
  { platform: "tiktok", line: "Same clip, reposted", hue: 230 },
];

/** Fallback before any real weave exists: four posts converging into one story card. */
function IllustrativeHero() {
  return (
    <div className="relative mx-auto flex w-full max-w-sm flex-col items-stretch sm:grid sm:max-w-xl sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.25fr)] sm:items-center sm:gap-5" aria-hidden>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-col sm:gap-2.5">
        {STRANDS.map((s, i) => (
          <div
            key={i}
            className={`animate-weave-in flex min-w-0 items-center gap-2 rounded-xl border bg-card p-2 shadow-sm ${ROTATIONS[i]}`}
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
      <Strands count={4} />
      <div className="animate-weave-in overflow-hidden rounded-2xl border bg-card shadow-xl [animation-delay:400ms]">
        <div className="grid aspect-[4/3] grid-cols-3 grid-rows-2 gap-0.5 bg-border">
          {STRANDS.slice(0, 3).map((s, i) => (
            <div
              key={i}
              className={i === 0 ? "col-span-2 row-span-2" : ""}
              style={{ background: `linear-gradient(135deg, oklch(0.75 0.13 ${s.hue}), oklch(0.45 0.14 ${s.hue + 30}))` }}
            />
          ))}
        </div>
        <div className="p-3">
          <div className="flex items-center gap-1.5">
            <PlatformStack platforms={["instagram", "tiktok"]} size="sm" />
            <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background">
              <Layers className="size-2.5" /> 4 → 1
            </span>
          </div>
          <p className="mt-2 font-display text-lg leading-tight">One story, every source kept</p>
        </div>
      </div>
    </div>
  );
}
