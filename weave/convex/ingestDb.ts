import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { platform } from "./schema";
import { refreshStory } from "./stories";
import { tiktokEmbedUrl } from "./lib/normalize";

const STALE_RUN_MS = 20 * 60_000;

export const context = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const team = await ctx.db.get(teamId);
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .take(100);
    return { team, accounts: accounts.filter((a) => a.status === "approved") };
  },
});

/** Start an ingest run unless one is already in flight (prevents double-spend). */
export const tryStartRun = internalMutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const latest = await ctx.db
      .query("runs")
      .withIndex("by_team_started", (q) => q.eq("teamId", teamId))
      .order("desc")
      .first();
    if (latest && latest.status === "running") {
      if (Date.now() - latest.startedAt < STALE_RUN_MS) return null;
      await ctx.db.patch(latest._id, {
        status: "failed",
        finishedAt: Date.now(),
        error: "Timed out",
      });
    }
    return await ctx.db.insert("runs", {
      teamId,
      kind: "ingest",
      status: "running",
      stage: "Starting",
      startedAt: Date.now(),
      stats: { postsFetched: 0, postsNew: 0, storiesTouched: 0, claudeCalls: 0, elasticQueries: 0 },
      log: [],
    });
  },
});

export const setApifyRun = internalMutation({
  args: { runId: v.id("runs"), apifyRunId: v.string(), apifyDatasetId: v.string() },
  handler: async (ctx, { runId, ...rest }) => {
    await ctx.db.patch(runId, rest);
  },
});

const mediaValidator = v.object({
  kind: v.union(v.literal("image"), v.literal("video")),
  url: v.string(),
  thumbnailUrl: v.optional(v.string()),
  durationSec: v.optional(v.number()),
});

const postValidator = v.object({
  platform,
  externalId: v.string(),
  url: v.string(),
  authorHandle: v.string(),
  authorName: v.optional(v.string()),
  title: v.optional(v.string()),
  text: v.string(),
  hashtags: v.array(v.string()),
  links: v.array(v.string()),
  transcript: v.optional(v.string()),
  audio: v.optional(v.string()),
  location: v.optional(v.string()),
  postedAt: v.number(),
  metrics: v.object({
    likes: v.optional(v.number()),
    comments: v.optional(v.number()),
    views: v.optional(v.number()),
  }),
  media: v.array(mediaValidator),
});

/**
 * Idempotent upsert keyed on (platform, externalId). Existing posts get fresh
 * metrics and media URLs (CDN links expire) but keep their analysis results.
 */
export const upsertPosts = internalMutation({
  args: { teamId: v.id("teams"), posts: v.array(postValidator) },
  handler: async (ctx, { teamId, posts }) => {
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .take(100);
    const accountFor = (p: string, handle: string) =>
      accounts.find((a) => a.platform === p && a.handle.toLowerCase() === handle.toLowerCase())?._id;

    const now = Date.now();
    const newIds: Id<"posts">[] = [];
    let updated = 0;
    const touchedAccounts = new Set<Id<"accounts">>();

    for (const { media, ...p } of posts) {
      const accountId = accountFor(p.platform, p.authorHandle);
      if (accountId) touchedAccounts.add(accountId);
      const existing = await ctx.db
        .query("posts")
        .withIndex("by_platform_external", (q) =>
          q.eq("platform", p.platform).eq("externalId", p.externalId),
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { metrics: p.metrics, fetchedAt: now });
        const old = await ctx.db
          .query("media")
          .withIndex("by_post", (q) => q.eq("postId", existing._id))
          .take(30);
        // Refresh expiring URLs in place, preserving computed hashes/storage.
        for (const [i, m] of media.entries()) {
          const prev = old.find((o) => o.position === i);
          if (prev) await ctx.db.patch(prev._id, { url: m.url, thumbnailUrl: m.thumbnailUrl });
          else await ctx.db.insert("media", { teamId, postId: existing._id, position: i, ...m });
        }
        updated++;
        continue;
      }

      const postId = await ctx.db.insert("posts", {
        ...p,
        teamId,
        accountId,
        origin: "live",
        fetchedAt: now,
        processing: "pending",
      });
      for (const [i, m] of media.entries()) {
        await ctx.db.insert("media", { teamId, postId, position: i, ...m });
      }
      newIds.push(postId);
    }
    for (const id of touchedAccounts) await ctx.db.patch(id, { lastFetchedAt: now });
    return { newIds, updated };
  },
});

/**
 * One-off repair: TikTok video posts ingested before the embed fallback have no
 * media rows. Give each an embeddable player, plus its cover frame when known.
 */
export const backfillTiktokMedia = internalMutation({
  args: {
    covers: v.array(
      v.object({ externalId: v.string(), thumbnailUrl: v.optional(v.string()), durationSec: v.optional(v.number()) }),
    ),
  },
  returns: v.object({ fixed: v.number() }),
  handler: async (ctx, { covers }) => {
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_platform_external", (q) => q.eq("platform", "tiktok"))
      .take(500);
    let fixed = 0;
    for (const post of posts) {
      if (post.origin !== "live") continue;
      const existing = await ctx.db
        .query("media")
        .withIndex("by_post", (q) => q.eq("postId", post._id))
        .first();
      if (existing) continue;
      const cover = covers.find((c) => c.externalId === post.externalId);
      await ctx.db.insert("media", {
        teamId: post.teamId,
        postId: post._id,
        position: 0,
        kind: "video",
        url: tiktokEmbedUrl(post.externalId),
        thumbnailUrl: cover?.thumbnailUrl,
        durationSec: cover?.durationSec,
      });
      const links = await ctx.db
        .query("storyPosts")
        .withIndex("by_post", (q) => q.eq("postId", post._id))
        .take(10);
      for (const l of links) await refreshStory(ctx, l.storyId);
      fixed++;
    }
    return { fixed };
  },
});
