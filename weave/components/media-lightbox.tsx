"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import { MediaTile, imageSrc, isEmbedUrl, type MediaLike } from "./media-tile";
import { PlatformBadge, type Platform } from "./platform";

export interface LightboxItem {
  media: MediaLike;
  platform?: Platform;
  authorHandle?: string;
  postUrl?: string;
}

const STAGE_H = "h-[min(62vh,640px)]";
/** Shorter stage when details sit underneath, so a peek of them shows. */
const STAGE_H_DETAILS = "h-[min(52vh,540px)]";

function Stage({ media, height }: { media: MediaLike; height: string }) {
  if (media.url.startsWith("sample:")) {
    return <p className="text-sm text-muted-foreground">Sample {media.kind} — no real media to show</p>;
  }
  if (media.kind === "video" && isEmbedUrl(media.url)) {
    return (
      <iframe
        src={media.url}
        title="Video player"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        className={cn("aspect-[9/16] max-w-full rounded-lg", height)}
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
        className="max-h-full max-w-full rounded-lg"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote CDN media of unknown dimensions
    <img src={imageSrc(media.url)} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
  );
}

/**
 * Windowed viewer: media stage with prev/next (buttons + arrow keys), a thumbnail
 * strip, and optional scrollable details underneath. `focus` names a
 * `data-focus` section inside the details to scroll to on open.
 */
export function MediaLightbox({
  items,
  index,
  onIndexChange,
  onClose,
  focus,
  focusKey,
  children,
}: {
  items: LightboxItem[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  focus?: string | null;
  /** Change to re-run the scroll-to-focus (e.g. a timestamp per open). */
  focusKey?: number;
  children?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const open = index !== null && (items.length > 0 || !!children);
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

  useEffect(() => {
    if (!open) return;
    // The popup mounts in a portal on the next frame; wait for it before scrolling.
    // The popup mounts in a portal; jump (no animation) as soon as it has laid out.
    const raf = requestAnimationFrame(() => {
      const box = scrollRef.current;
      const el = focus ? box?.querySelector<HTMLElement>(`[data-focus="${focus}"]`) : null;
      box?.scrollTo({ top: el ? el.offsetTop - 8 : 0 });
    });
    return () => cancelAnimationFrame(raf);
  }, [open, focus, focusKey]);

  const stageH = children ? STAGE_H_DETAILS : STAGE_H;
  const navBtn =
    "absolute top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground shadow ring-1 ring-foreground/10 transition-colors hover:bg-background";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/55 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          aria-label="Media viewer"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(92vw,820px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-card text-card-foreground shadow-2xl ring-1 ring-foreground/10 outline-none will-change-transform duration-100 data-open:animate-in data-open:fade-in-0"
        >
          {open && (
            <>
              <div className="flex items-center gap-2.5 border-b px-4 py-2.5 text-sm">
                {item?.platform && <PlatformBadge platform={item.platform} size="sm" />}
                {item?.authorHandle && <span className="font-medium">@{item.authorHandle}</span>}
                {many && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {i + 1} / {items.length}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  {item?.postUrl && (
                    <a
                      href={item.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      Open <ExternalLink className="size-3" />
                    </a>
                  )}
                  <DialogPrimitive.Close
                    aria-label="Close"
                    className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-4" />
                  </DialogPrimitive.Close>
                </div>
              </div>

              <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {item && (
              <div className={cn("relative flex items-center justify-center bg-muted/40 p-3", stageH)}>
                {/* key resets <video>/<iframe> playback when switching items */}
                <div key={i} className="flex size-full animate-weave-in items-center justify-center">
                  <Stage media={item.media} height={stageH} />
                </div>
                {many && (
                  <>
                    <button aria-label="Previous" onClick={() => go(-1)} className={cn(navBtn, "left-3")}>
                      <ChevronLeft className="size-4" />
                    </button>
                    <button aria-label="Next" onClick={() => go(1)} className={cn(navBtn, "right-3")}>
                      <ChevronRight className="size-4" />
                    </button>
                  </>
                )}
              </div>
              )}

              {many && (
                <div className="flex gap-2 overflow-x-auto border-t px-4 py-3">
                  {items.map((it, n) => (
                    <MediaTile
                      key={n}
                      media={it.media}
                      platform={it.platform}
                      onOpen={() => onIndexChange(n)}
                      compact
                      className={cn(
                        "size-14 shrink-0 rounded-md transition-opacity",
                        n === i ? "ring-2 ring-foreground ring-offset-2 ring-offset-card" : "opacity-60 hover:opacity-100",
                      )}
                    />
                  ))}
                </div>
              )}
              {children && <div className="border-t">{children}</div>}
              </div>
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
