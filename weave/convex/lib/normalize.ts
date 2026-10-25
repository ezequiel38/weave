import { z } from "zod";
import type { Platform } from "./accountUrl";

/**
 * Adapter for the `fcb-social-posts` Actor's `UnifiedPost` dataset items
 * (actors/fcb-social-posts/src/main.ts). Fields marked "newer" are optional
 * additions so older Actor builds still validate.
 */
const nullableStr = z.string().nullish();
const nullableNum = z.number().finite().nullish();

export const actorPostSchema = z.object({
  platform: z.enum(["instagram", "tiktok", "youtube", "x"]),
  sourceProfile: z.string().default(""),
  postUrl: z.string().url(),
  postId: z.coerce.string().min(1),
  postedAt: nullableStr,
  caption: z.string().nullish().transform((s) => s ?? ""),
  photos: z.array(z.string()).nullish().transform((a) => a ?? []),
  videos: z.array(z.string()).nullish().transform((a) => a ?? []),
  audioName: nullableStr,
  audioArtist: nullableStr,
  location: nullableStr,
  locationId: nullableNum,
  videoDurationSecs: nullableNum,
  likes: nullableNum,
  comments: nullableNum,
  views: nullableNum,
  // newer / optional
  title: nullableStr,
  thumbnailUrl: nullableStr,
  hashtags: z.array(z.string()).nullish(),
  links: z.array(z.string()).nullish(),
  transcript: nullableStr,
  authorName: nullableStr,
  authorAvatarUrl: nullableStr,
});

export type ActorPost = z.infer<typeof actorPostSchema>;

export interface NormalizedMedia {
  kind: "image" | "video";
  url: string;
  thumbnailUrl?: string;
  durationSec?: number;
}

export interface NormalizedPost {
  platform: Platform;
  externalId: string;
  url: string;
  authorHandle: string;
  authorName?: string;
  title?: string;
  text: string;
  hashtags: string[];
  links: string[];
  transcript?: string;
  audio?: string;
  location?: string;
  postedAt: number;
  metrics: { likes?: number; comments?: number; views?: number };
  media: NormalizedMedia[];
}

const HASHTAG_RE = /#([\p{L}\p{N}_]+)/gu;
const URL_RE = /https?:\/\/[^\s)]+/g;

export function extractHashtags(text: string): string[] {
  return [...new Set([...text.matchAll(HASHTAG_RE)].map((m) => m[1]))];
}

export function extractLinks(text: string): string[] {
  return [...new Set(text.match(URL_RE) ?? [])];
}

export function tiktokEmbedUrl(postId: string): string {
  return `https://www.tiktok.com/player/v1/${postId}?autoplay=1&description=0&music_info=0&rel=0`;
}

const opt = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);

export function normalizeActorPost(raw: unknown, now = Date.now()): NormalizedPost | { error: string } {
  const parsed = actorPostSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  const p = parsed.data;
  const postedAt = p.postedAt ? Date.parse(p.postedAt) : NaN;

  const media: NormalizedMedia[] = [];
  // A video's poster frame: explicit thumbnail if the Actor provides one,
  // otherwise the first photo of a video post (IG/TikTok often include it).
  const videoThumb = opt(p.thumbnailUrl) ?? (p.videos.length && p.photos.length ? p.photos[0] : undefined);
  for (const url of p.videos) {
    media.push({ kind: "video", url, thumbnailUrl: videoThumb, durationSec: opt(p.videoDurationSecs) });
  }
  for (const url of p.photos) {
    if (p.videos.length && url === videoThumb) continue;
    media.push({ kind: "image", url });
  }
  // TikTok video posts arrive without a downloadable URL (the scraper runs with
  // shouldDownloadVideos: false) — fall back to TikTok's embeddable player.
  if (media.length === 0 && p.platform === "tiktok") {
    media.push({
      kind: "video",
      url: tiktokEmbedUrl(p.postId),
      thumbnailUrl: opt(p.thumbnailUrl),
      durationSec: opt(p.videoDurationSecs),
    });
  }
  // Video post with only a thumbnail and no playable URL — still keep the frame.
  if (media.length === 0 && p.thumbnailUrl) media.push({ kind: "image", url: p.thumbnailUrl });

  const text = p.caption.trim();
  const audio = [p.audioName, p.audioArtist].filter(Boolean).join(" — ") || undefined;
  return {
    platform: p.platform,
    externalId: p.postId,
    url: p.postUrl,
    authorHandle: p.sourceProfile || "unknown",
    authorName: opt(p.authorName),
    title: opt(p.title),
    text,
    hashtags: p.hashtags?.length ? p.hashtags.map((h) => h.replace(/^#/, "")) : extractHashtags(text),
    links: [...new Set([...(p.links ?? []), ...extractLinks(text)])],
    transcript: opt(p.transcript),
    audio,
    location: opt(p.location),
    postedAt: Number.isFinite(postedAt) ? postedAt : now,
    metrics: { likes: opt(p.likes), comments: opt(p.comments), views: opt(p.views) },
    media,
  };
}
