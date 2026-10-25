"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { compact, timeAgo } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Caption } from "./caption";
import { MediaTile } from "./media-tile";
import { useLightbox } from "./media-lightbox";
import { PLATFORMS, PlatformBadge } from "./platform";
import type { RawPost } from "./feed-types";

/** A single, un-merged post — what you'd see scrolling each app separately. */
export function PostCard({ post, index = 0, className }: { post: RawPost; index?: number; className?: string }) {
  const p = PLATFORMS[post.platform];
  const first = post.media[0];
  const metric = compact(post.metrics.views) ?? compact(post.metrics.likes);
  const lightbox = useLightbox(
    post.media.map((m) => ({ media: m, platform: post.platform, authorHandle: post.authorHandle, postUrl: post.url })),
  );
  return (
    <article
      className={cn("animate-weave-in flex flex-col overflow-hidden rounded-xl border bg-card", className)}
      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
    >
      <header className="flex items-center gap-2 px-3.5 py-3">
        <PlatformBadge platform={post.platform} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium">{post.authorName ?? `@${post.authorHandle}`}</p>
          <p className="truncate text-xs text-muted-foreground">
            {p.label} · @{post.authorHandle} · {timeAgo(post.postedAt)}
          </p>
        </div>
        {post.origin === "sample" && (
          <Badge variant="outline" className="h-5 rounded-full border-amber-300 bg-amber-50 px-2 text-[10px] uppercase tracking-wide text-amber-900">
            Sample
          </Badge>
        )}
      </header>
      {first && (
        <div className="relative">
          <MediaTile media={first} className="aspect-[4/5]" onOpen={() => lightbox.open(0)} />
          {post.media.length > 1 && (
            <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
              1/{post.media.length}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-1 flex-col px-3.5 py-3">
        {post.title && <p className="text-sm font-medium leading-snug">{post.title}</p>}
        <Caption text={post.text} clamp className={cn("text-sm leading-relaxed text-foreground/85", post.title && "mt-1")} />
        <div className="mt-auto flex items-center justify-between pt-2 text-xs text-muted-foreground">
          <span>{metric ? `${metric} ${post.metrics.views ? "views" : "likes"}` : ""}</span>
          <a href={post.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
            Open <ExternalLink className="size-3" />
          </a>
        </div>
      </div>
      {lightbox.element}
    </article>
  );
}
