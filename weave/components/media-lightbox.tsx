"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import { imageSrc, isEmbedUrl, type MediaLike } from "./media-tile";
import { PLATFORMS, PlatformBadge, type Platform } from "./platform";

export interface LightboxItem {
  media: MediaLike;
  platform?: Platform;
  authorHandle?: string;
  postUrl?: string;
}

function Stage({ media }: { media: MediaLike }) {
  if (media.url.startsWith("sample:")) {
    return <p className="text-sm text-white/70">Sample {media.kind} — no real media to show</p>;
  }
  if (media.kind === "video" && isEmbedUrl(media.url)) {
    return (
      <iframe
        src={media.url}
        title="Video player"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        className="aspect-[9/16] h-[min(80vh,calc(100vw*16/9))] max-w-full rounded-lg bg-black"
      />
    );
  }
  if (media.kind === "video") {
    return (
      <video
        src={media.url}
        poster={media.thumbnailUrl ? imageSrc(media.thumbnailUrl) : undefined}
        controls
        autoPlay
        playsInline
        className="max-h-[80vh] max-w-full rounded-lg bg-black"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote CDN media of unknown dimensions
    <img src={imageSrc(media.url)} alt="" className="max-h-[80vh] max-w-full rounded-lg object-contain" />
  );
}

/** Full-screen media viewer with prev/next (buttons + arrow keys). */
export function MediaLightbox({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: LightboxItem[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const open = index !== null && items.length > 0;
  const i = index ?? 0;
  const item = items[i];
  const many = items.length > 1;
  const go = useCallback(
    (d: number) => onIndexChange((i + d + items.length) % items.length),
    [i, items.length, onIndexChange],
  );

  useEffect(() => {
    if (!open || !many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, many, go]);

  const navBtn =
    "absolute top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/25";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          aria-label="Media viewer"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4 outline-none sm:p-10"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          {item && (
            <>
              <div className="absolute inset-x-0 top-0 flex items-center gap-3 px-4 py-3 text-sm text-white/85">
                {item.platform && <PlatformBadge platform={item.platform} size="sm" />}
                {item.authorHandle && <span>@{item.authorHandle}</span>}
                {many && (
                  <span className="font-mono text-xs text-white/60">
                    {i + 1} / {items.length}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  {item.postUrl && (
                    <a
                      href={item.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs hover:bg-white/10"
                    >
                      Open{item.platform ? ` on ${PLATFORMS[item.platform].label}` : ""} <ExternalLink className="size-3" />
                    </a>
                  )}
                  <DialogPrimitive.Close
                    aria-label="Close"
                    className="flex size-9 items-center justify-center rounded-full hover:bg-white/10"
                  >
                    <X className="size-5" />
                  </DialogPrimitive.Close>
                </div>
              </div>

              {/* key resets <video>/<iframe> playback when switching items */}
              <div key={i} className="flex animate-weave-in items-center justify-center">
                <Stage media={item.media} />
              </div>

              {many && (
                <>
                  <button aria-label="Previous" onClick={() => go(-1)} className={cn(navBtn, "left-3 sm:left-6")}>
                    <ChevronLeft className="size-5" />
                  </button>
                  <button aria-label="Next" onClick={() => go(1)} className={cn(navBtn, "right-3 sm:right-6")}>
                    <ChevronRight className="size-5" />
                  </button>
                </>
              )}
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Convenience: state + element for a lightbox over a fixed item list. */
export function useLightbox(items: LightboxItem[]) {
  const [index, setIndex] = useState<number | null>(null);
  const element = (
    <MediaLightbox items={items} index={index} onIndexChange={setIndex} onClose={() => setIndex(null)} />
  );
  return { open: setIndex, element };
}
