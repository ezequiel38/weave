"use client";

import { useState } from "react";
import { ImageOff, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { duration } from "@/lib/format";
import { PlatformBadge, PlatformGlyph, type Platform } from "./platform";

export interface MediaLike {
  kind: "image" | "video" | "audio";
  url: string;
  thumbnailUrl?: string;
  durationSec?: number;
}

/** Proxy remote images through our route so platform CDNs that block hotlinking still render. */
export function imageSrc(url: string, width = 640): string {
  if (url.startsWith("sample:") || url.startsWith("/") || url.startsWith("data:")) return url;
  // Our own durable copies: resized + cached through the proxy so views don't re-download the originals.
  if (/^https:\/\/[^/]+\.convex\.cloud\/api\/storage\//.test(url)) return `/api/img?u=${encodeURIComponent(url)}&w=${width}`;
  if (/^https:\/\/[^/]+\.convex\.(cloud|site)\//.test(url)) return url;
  return `/api/img?u=${encodeURIComponent(url)}`;
}

/** Platform player pages (e.g. TikTok's embed) — rendered in an iframe, not a <video>. */
export function isEmbedUrl(url: string): boolean {
  return /^https:\/\/www\.tiktok\.com\/player\//.test(url);
}

function SamplePlaceholder({ hue, kind }: { hue: number; kind: MediaLike["kind"] }) {
  return (
    <div
      className="absolute inset-0"
      style={{
        background: `radial-gradient(120% 90% at 20% 15%, oklch(0.78 0.12 ${hue}) 0%, transparent 55%), radial-gradient(90% 80% at 85% 90%, oklch(0.55 0.16 ${(hue + 40) % 360}) 0%, transparent 60%), oklch(0.42 0.12 ${hue})`,
      }}
    >
      <div className="absolute inset-0 opacity-30 mix-blend-overlay paper-grain" />
      <span className="absolute left-2 top-2 rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/90 backdrop-blur">
        Sample {kind}
      </span>
    </div>
  );
}

/** A media thumbnail. Pass `onOpen` to make it clickable (opens the lightbox). */
export function MediaTile({
  media,
  platform,
  className,
  showPlatform = false,
  sizes,
  onOpen,
  compact = false,
  frame = false,
}: {
  media: MediaLike;
  platform?: Platform;
  className?: string;
  showPlatform?: boolean;
  sizes?: string;
  onOpen?: () => void;
  /** Small thumbnail: shrink the play button, hide the duration. */
  compact?: boolean;
  /** With `compact`, still load a poster-less video's first frame (few tiles, e.g. the landing example). */
  frame?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = media.kind === "image" ? media.url : (media.thumbnailUrl ?? media.url);
  const isSample = src.startsWith("sample:");
  const isVideo = media.kind === "video";
  const embed = isVideo && isEmbedUrl(media.url);
  const directVideo = isVideo && !isSample && !embed && /^https?:/.test(media.url);

  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `Expand ${media.kind}` : undefined}
      onClick={onOpen}
      onKeyDown={onOpen ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen()) : undefined}
      className={cn(
        "group relative overflow-hidden bg-muted",
        onOpen && "cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {isSample ? (
        <SamplePlaceholder hue={Number(src.slice(7)) || 0} kind={media.kind} />
      ) : directVideo && !media.thumbnailUrl && (!compact || frame) ? (
        // No poster frame from the scraper — let the browser render the first frame.
        <video src={`${media.url}#t=0.1`} preload="metadata" muted playsInline className="absolute inset-0 size-full object-cover" />
      ) : embed && !media.thumbnailUrl ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-neutral-900 text-white/80">
          <PlatformGlyph platform="tiktok" className="size-7" />
          <span className="text-[11px]">TikTok video</span>
        </div>
      ) : failed || (isVideo && !media.thumbnailUrl) ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
          {!(compact && isVideo) && (isVideo ? <Play className="size-6" /> : <ImageOff className="size-5" />)}
          {!compact && <span className="text-[11px]">{isVideo ? "Video" : "Image unavailable"}</span>}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- remote CDN media of unknown dimensions
        <img
          src={imageSrc(src)}
          alt=""
          loading="lazy"
          sizes={sizes}
          onError={() => setFailed(true)}
          className={cn("absolute inset-0 size-full object-cover", onOpen && "transition-transform duration-300 group-hover:scale-[1.03]")}
        />
      )}
      {isVideo && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
          <span
            className={cn(
              "pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow transition-transform group-hover:scale-110",
              compact ? "size-6" : "size-11 shadow-lg",
            )}
          >
            <Play className={cn("translate-x-px fill-current", compact ? "size-2.5" : "size-4")} />
          </span>
          {!compact && duration(media.durationSec) && (
            <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
              {duration(media.durationSec)}
            </span>
          )}
        </>
      )}
      {showPlatform && platform && (
        <PlatformBadge platform={platform} size="sm" className="absolute bottom-2 left-2" />
      )}
    </div>
  );
}
