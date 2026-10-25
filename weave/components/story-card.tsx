"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import {
  ChevronDown,
  ExternalLink,
  Images,
  Layers,
  Scissors,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { compact, splitTrailingHashtags, timeAgo } from "@/lib/format";
import { Caption } from "./caption";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MediaTile } from "./media-tile";
import { useLightbox, type LightboxItem } from "./media-lightbox";
import { PLATFORMS, PlatformBadge, PlatformStack } from "./platform";
import { MergeEvidence } from "./merge-evidence";
import type { StoryPost, UnifiedStory } from "./feed-types";

const ROLE_LABEL: Record<StoryPost["role"], string> = {
  anchor: "Original",
  duplicate: "Duplicate",
  complement: "Adds detail",
};

function Mosaic({ story }: { story: UnifiedStory }) {
  // Exact reposts show their media once — prefer Instagram's copy (no TikTok overlay).
  const dupGroup = story.posts.some((p) => p.role === "duplicate")
    ? story.posts.filter((p) => p.role === "duplicate" || p.role === "anchor")
    : [];
  const keep = dupGroup.find((p) => p.platform === "instagram") ?? dupGroup[0];
  const shownPosts = story.posts.filter((p) => !dupGroup.includes(p) || p === keep);
  // One tile per post first (so every platform's media is represented), then extras.
  const perPost = shownPosts.flatMap((p) => (p.media[0] ? [{ m: p.media[0], p }] : []));
  const extras = shownPosts.flatMap((p) => p.media.slice(1).map((m) => ({ m, p })));
  const tiles = [...perPost, ...extras];
  const lightbox = useLightbox(
    tiles.map(({ m, p }): LightboxItem => ({ media: m, platform: p.platform, authorHandle: p.authorHandle, postUrl: p.url })),
  );
  if (tiles.length === 0) return null;
  const shown = tiles.slice(0, 3);
  const hidden = tiles.length - shown.length;

  const layout =
    shown.length === 1
      ? "grid-cols-1"
      : shown.length === 2
        ? "grid-cols-2"
        : "grid-cols-3 grid-rows-2";

  return (
    <div className={cn("grid aspect-[4/3] gap-0.5 overflow-hidden bg-border", layout)}>
      {shown.map(({ m, p }, i) => (
        <div
          key={m._id}
          className={cn(
            "relative",
            shown.length >= 3 && i === 0 && "col-span-2 row-span-2",
            shown.length === 3 && i > 0 && "col-span-1",
          )}
        >
          <MediaTile
            media={m}
            platform={p.platform}
            showPlatform={story.postCount > 1}
            className="absolute inset-0"
            onOpen={() => lightbox.open(i)}
          />
          {hidden > 0 && i === shown.length - 1 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-medium text-white">
              +{hidden}
            </div>
          )}
        </div>
      ))}
      {lightbox.element}
    </div>
  );
}

function SourcePost({ post, storyId, canSplit }: { post: StoryPost; storyId: UnifiedStory["_id"]; canSplit: boolean }) {
  const split = useMutation(api.stories.splitPost);
  const [busy, setBusy] = useState(false);
  const p = PLATFORMS[post.platform];
  const metric = compact(post.metrics.views) ?? compact(post.metrics.likes);
  const lightbox = useLightbox(
    post.media.map((m) => ({ media: m, platform: post.platform, authorHandle: post.authorHandle, postUrl: post.url })),
  );

  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <div className="flex flex-col items-center">
        <PlatformBadge platform={post.platform} />
        <span className="mt-1 w-px flex-1 bg-border" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{p.label}</span>
          <span>@{post.authorHandle}</span>
          <span aria-hidden>·</span>
          <time dateTime={new Date(post.postedAt).toISOString()}>{timeAgo(post.postedAt)}</time>
          {metric && (
            <>
              <span aria-hidden>·</span>
              <span>{metric} {post.metrics.views ? "views" : "likes"}</span>
            </>
          )}
          <Badge
            variant={post.role === "duplicate" ? "outline" : "secondary"}
            className="h-5 rounded-full px-2 text-[10px] font-medium uppercase tracking-wide"
          >
            {ROLE_LABEL[post.role]}
          </Badge>
        </div>
        {post.title && <p className="mt-1 text-sm font-medium">{post.title}</p>}
        <Caption text={post.text} className="mt-1 text-sm leading-relaxed text-foreground/85" />
        {post.contribution && post.role !== "anchor" && (
          <p className="mt-1.5 inline-flex items-start gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
            <Sparkles className="mt-0.5 size-3 shrink-0" />
            <span>
              <span className="font-medium">Contributes:</span> {post.contribution}
            </span>
          </p>
        )}
        {post.media.length > 0 && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {post.media.map((m, i) => (
              <MediaTile
                key={m._id}
                media={m}
                className="size-20 shrink-0 rounded-md"
                onOpen={() => lightbox.open(i)}
              />
            ))}
            {lightbox.element}
          </div>
        )}
        <div className="mt-2 flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            render={<a href={post.url} target="_blank" rel="noopener noreferrer" />}
            nativeButton={false}
          >
            <ExternalLink /> Open on {p.label}
          </Button>
          {canSplit && (
            <Button
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await split({ storyId, postId: post._id });
                  toast.success("Post split into its own story");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Couldn't split post");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Scissors /> Not the same story
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

export function StoryCard({ story, index = 0 }: { story: UnifiedStory; index?: number }) {
  const [open, setOpen] = useState(false);
  const merged = story.postCount > 1;
  const duplicates = story.posts.filter((p) => p.role === "duplicate").length;

  return (
    <article
      className="animate-weave-in overflow-hidden rounded-2xl border bg-card shadow-[0_1px_0_rgba(0,0,0,0.03),0_8px_24px_-12px_rgba(0,0,0,0.12)]"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <Mosaic story={story} />
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <PlatformStack platforms={story.platforms} size="sm" />
          {merged ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 font-medium text-background">
              <Layers className="size-3" />
              {story.postCount} posts → 1 story
            </span>
          ) : (
            <span>Single post</span>
          )}
          {story.mediaCount > 1 && (
            <span className="inline-flex items-center gap-1">
              <Images className="size-3" /> {story.mediaCount} media kept
            </span>
          )}
          <span aria-hidden>·</span>
          <time dateTime={new Date(story.lastPostedAt).toISOString()}>{timeAgo(story.lastPostedAt)}</time>
          {story.origin === "sample" && (
            <Badge variant="outline" className="h-5 rounded-full border-amber-300 bg-amber-50 px-2 text-[10px] uppercase tracking-wide text-amber-900">
              Sample
            </Badge>
          )}
        </div>

        <h2 className="mt-3 line-clamp-3 font-display text-2xl leading-[1.1] text-balance">
          {splitTrailingHashtags(story.title).body}
        </h2>
        <Caption text={story.summary} clamp className="mt-2.5 text-sm leading-relaxed text-foreground/80" />

        {story.keyFacts.length > 0 && (
          <ul className="mt-4 grid gap-1.5">
            {story.keyFacts.map((f) => (
              <li key={f} className="flex gap-2 rounded-lg bg-muted/70 px-3 py-2 text-[13px] leading-snug">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/50" />
                {f}
              </li>
            ))}
          </ul>
        )}

        {story.conflicts.length > 0 && (
          <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <div>
              <span className="font-medium">Sources disagree:</span> {story.conflicts.join(" · ")}
            </div>
          </div>
        )}

        {merged && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {story.posts
              .filter((p, i, all) => all.findIndex((q) => q.platform === p.platform) === i)
              .map((p) => (
                <a
                  key={p._id}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
                >
                  <PlatformBadge platform={p.platform} size="sm" /> Open on {PLATFORMS[p.platform].label}
                  <ExternalLink className="size-3 text-muted-foreground" />
                </a>
              ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} className="-ml-2">
            <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
            {open ? "Hide" : "Show"} {merged ? `all ${story.postCount} original posts` : "original post"}
          </Button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {duplicates > 0 && <span>{duplicates} exact repost{duplicates > 1 ? "s" : ""} folded in</span>}
            {merged && <MergeEvidence storyId={story._id} posts={story.posts} />}
            <span className="hidden sm:inline">
              {story.summarySource === "claude" ? "Summary by Claude" : story.summarySource === "heuristic" ? "Auto summary" : "Sample summary"}
            </span>
          </div>
        </div>

        {open && (
          <ol className="mt-4 animate-weave-in">
            {story.posts.map((p) => (
              <SourcePost key={p._id} post={p} storyId={story._id} canSplit={merged} />
            ))}
          </ol>
        )}
      </div>
    </article>
  );
}
