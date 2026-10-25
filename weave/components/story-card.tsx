"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import {
  ChevronRight,
  ExternalLink,
  Layers,
  Scissors,
  TriangleAlert,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { compact, splitTrailingHashtags, timeAgo } from "@/lib/format";
import { Caption } from "./caption";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MediaTile } from "./media-tile";
import { MediaLightbox, type LightboxItem } from "./media-lightbox";
import { PLATFORMS, PlatformBadge, PlatformGlyph, PlatformStack } from "./platform";
import { MergeEvidence } from "./merge-evidence";
import type { StoryPost, UnifiedStory } from "./feed-types";

const ROLE_LABEL: Record<StoryPost["role"], string> = {
  anchor: "Original",
  duplicate: "Duplicate",
  complement: "Adds detail",
};

type Tile = { m: StoryPost["media"][number]; p: StoryPost };

/**
 * Viewer order: one tile per shown post, then their extras, then media of exact
 * reposts we hide (prefer Instagram's copy, no TikTok overlay). `visible` is
 * how many of those the grid card itself shows.
 */
function storyMedia(story: UnifiedStory): { all: Tile[]; visible: number } {
  const dupGroup = story.posts.some((p) => p.role === "duplicate")
    ? story.posts.filter((p) => p.role === "duplicate" || p.role === "anchor")
    : [];
  const keep = dupGroup.find((p) => p.platform === "instagram") ?? dupGroup[0];
  const shownPosts = story.posts.filter((p) => !dupGroup.includes(p) || p === keep);
  const perPost = shownPosts.flatMap((p) => (p.media[0] ? [{ m: p.media[0], p }] : []));
  const extras = shownPosts.flatMap((p) => p.media.slice(1).map((m) => ({ m, p })));
  const hiddenDupes = story.posts
    .filter((p) => !shownPosts.includes(p))
    .flatMap((p) => p.media.map((m) => ({ m, p })));
  const visible = [...perPost, ...extras];
  return { all: [...visible, ...hiddenDupes], visible: visible.length };
}

function Mosaic({ story, tiles, onOpen }: { story: UnifiedStory; tiles: Tile[]; onOpen: (i: number) => void }) {
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
    <div className={cn("grid aspect-[4/3] gap-0.5 overflow-hidden bg-border sm:aspect-[4/5]", layout)}>
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
            onOpen={() => onOpen(i)}
          />
          {hidden > 0 && i === shown.length - 1 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-medium text-white">
              +{hidden}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SourcePost({
  post,
  storyId,
  canSplit,
  onMedia,
}: {
  post: StoryPost;
  storyId: UnifiedStory["_id"];
  canSplit: boolean;
  onMedia: (mediaId: string) => void;
}) {
  const split = useMutation(api.stories.splitPost);
  const [busy, setBusy] = useState(false);
  const p = PLATFORMS[post.platform];
  const metric = compact(post.metrics.views) ?? compact(post.metrics.likes);

  return (
    <li data-post={post._id} className="relative flex scroll-mt-3 gap-3 pb-5 last:pb-0">
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
        {post.media.length > 0 && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {post.media.map((m) => (
              <MediaTile
                key={m._id}
                media={m}
                compact
                className="size-20 shrink-0 rounded-md"
                onOpen={() => onMedia(m._id)}
              />
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            render={<a href={post.url} target="_blank" rel="noopener noreferrer" />}
            nativeButton={false}
          >
            <ExternalLink /> Open
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

type Focus = "media" | "summary" | "posts";

/**
 * Sticky jump list for the original posts (in-window scroll only — it does not
 * leave the app; the "Open" links do that). Buttons bubble up on hover.
 */
function ScrollIndex({ posts }: { posts: StoryPost[] }) {
  const colRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Keep the rail centred in the *visible* part of the posts list: between the
  // list's top (or the window's top once scrolled past) and the window's bottom.
  // Positioned with a transform straight on the DOM, once per frame — no re-renders.
  useEffect(() => {
    const col = colRef.current;
    const nav = navRef.current;
    const box = col?.closest<HTMLElement>(".overflow-y-auto");
    if (!col || !nav || !box) return;
    let raf = 0;
    const place = () => {
      raf = 0;
      const c = box.getBoundingClientRect();
      const r = col.getBoundingClientRect();
      const top = Math.max(r.top, c.top);
      const bottom = Math.min(r.bottom, c.bottom);
      const y = (top + bottom) / 2 - r.top - nav.offsetHeight / 2;
      const max = Math.max(0, r.height - nav.offsetHeight);
      nav.style.transform = `translateY(${Math.min(Math.max(y, 0), max)}px)`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(place);
    };
    place();
    box.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(box);
    ro.observe(col);
    return () => {
      box.removeEventListener("scroll", schedule);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={colRef} className="relative w-8 shrink-0 self-stretch">
      <nav
        ref={navRef}
        aria-label="Jump to post"
        className="absolute left-0 top-0 flex flex-col gap-2 rounded-full bg-muted/60 p-1 will-change-transform"
      >
        {posts.map((p) => (
          <button
            key={p._id}
            type="button"
            title={`Jump to the ${PLATFORMS[p.platform].label} post`}
            onClick={(e) =>
              e.currentTarget
                .closest("[data-focus=posts]")
                ?.querySelector(`[data-post="${p._id}"]`)
                ?.scrollIntoView({ block: "start", behavior: "smooth" })
            }
            className="rounded-full transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-125 hover:shadow-md focus-visible:scale-125 focus-visible:outline-none"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-background text-foreground ring-1 ring-foreground/10"><PlatformGlyph platform={p.platform} className="size-3" /></span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function OpenLinks({ story }: { story: UnifiedStory }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {story.posts
        .filter((p, i, all) => all.findIndex((q) => q.platform === p.platform) === i)
        .map((p) => (
          <a
            key={p._id}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open on ${PLATFORMS[p.platform].label}`}
            className="inline-flex items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-2 text-xs hover:bg-muted"
          >
            <PlatformBadge platform={p.platform} size="sm" /> Open
            <ExternalLink className="size-3 text-muted-foreground" />
          </a>
        ))}
    </div>
  );
}

export function StoryCard({ story, index = 0, className }: { story: UnifiedStory; index?: number; className?: string }) {
  const [view, setView] = useState<{ index: number; focus: Focus; key: number } | null>(null);
  const merged = story.postCount > 1;
  const duplicates = story.posts.filter((p) => p.role === "duplicate").length;
  const { all: tiles, visible } = storyMedia(story);
  const items = tiles.map(
    ({ m, p }): LightboxItem => ({ media: m, platform: p.platform, authorHandle: p.authorHandle, postUrl: p.url }),
  );
  const openAt = (focus: Focus, i = view?.index ?? 0) => setView({ index: i, focus, key: Date.now() });

  return (
    <article
      className={cn("animate-weave-in flex flex-col overflow-hidden rounded-xl border bg-card", className)}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <Mosaic story={story} tiles={tiles.slice(0, visible)} onOpen={(i) => openAt("media", i)} />
      <div className="flex flex-1 flex-col px-3.5 py-3">
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
          <span aria-hidden>·</span>
          <time dateTime={new Date(story.lastPostedAt).toISOString()}>{timeAgo(story.lastPostedAt)}</time>
          {story.origin === "sample" && (
            <Badge variant="outline" className="h-5 rounded-full border-amber-300 bg-amber-50 px-2 text-[10px] uppercase tracking-wide text-amber-900">
              Sample
            </Badge>
          )}
        </div>

        <h2 className="mt-2 line-clamp-3 font-display text-xl leading-[1.15] text-balance">
          {splitTrailingHashtags(story.title).body}
        </h2>
        <Caption
          text={story.summary}
          clamp
          onMore={() => openAt("summary")}
          className="mt-2.5 text-sm leading-relaxed text-foreground/80"
        />

        {story.conflicts.length > 0 && (
          <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <div>
              <span className="font-medium">Sources disagree:</span> {story.conflicts.join(" · ")}
            </div>
          </div>
        )}

        {merged && (
          <div className="mt-3 mb-3">
            <OpenLinks story={story} />
          </div>
        )}

        <div className="mt-auto border-t pt-2">
          {merged && (
            <div className="flex items-center gap-3 whitespace-nowrap text-xs text-muted-foreground">
              {duplicates > 0 && <span title="Exact reposts folded in">{duplicates} repost{duplicates > 1 ? "s" : ""} folded in</span>}
              <MergeEvidence storyId={story._id} posts={story.posts} />
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={() => openAt("posts")} className="-ml-2 mt-1 whitespace-nowrap">
            {merged ? `${story.postCount} original posts` : "Original post"} <ChevronRight />
          </Button>
        </div>
      </div>

      <MediaLightbox
        items={items}
        index={view?.index ?? null}
        onIndexChange={(i) => setView((v) => (v ? { ...v, index: i } : v))}
        onClose={() => setView(null)}
        focus={view?.focus}
        focusKey={view?.key}
      >
        <div className="space-y-4 px-5 py-4">
          <div data-focus="summary">
            <h2 className="font-display text-2xl leading-tight text-balance">{splitTrailingHashtags(story.title).body}</h2>
            <Caption text={story.summary} className="mt-2 text-sm leading-relaxed text-foreground/85" />
            {story.conflicts.length > 0 && (
              <p className="mt-2 text-[13px] text-amber-900">
                <span className="font-medium">Sources disagree:</span> {story.conflicts.join(" · ")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <OpenLinks story={story} />
            {duplicates > 0 && <span>{duplicates} repost{duplicates > 1 ? "s" : ""} folded in</span>}
            {merged && <MergeEvidence storyId={story._id} posts={story.posts} />}
          </div>
          <div data-focus="posts" className="border-t pt-4">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {merged ? `${story.postCount} original posts` : "Original post"}
            </h3>
            <div className="flex gap-4">
            {story.posts.length > 1 && <ScrollIndex posts={story.posts} />}
            <ol className="min-w-0 flex-1">
              {story.posts.map((p) => (
                <SourcePost
                  key={p._id}
                  post={p}
                  storyId={story._id}
                  canSplit={merged}
                  onMedia={(id) => {
                    const i = tiles.findIndex((t) => t.m._id === id);
                    if (i >= 0) openAt("media", i);
                  }}
                />
              ))}
            </ol>
            </div>
          </div>
        </div>
      </MediaLightbox>
    </article>
  );
}
