import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const platform = v.union(
  v.literal("instagram"),
  v.literal("youtube"),
  v.literal("tiktok"),
  v.literal("x"),
);

/** "sample" rows are clearly-labelled demo fixtures; "live" rows came from Apify. */
export const origin = v.union(v.literal("sample"), v.literal("live"));

export const matchCategory = v.union(
  v.literal("exact_duplicate"),
  v.literal("near_duplicate"),
  v.literal("same_event"),
  v.literal("related"),
  v.literal("unrelated"),
);

export default defineSchema({
  teams: defineTable({
    name: v.string(),
    slug: v.string(),
    kind: v.union(
      v.literal("sports"),
      v.literal("company"),
      v.literal("creator"),
      v.literal("organization"),
    ),
    tagline: v.optional(v.string()),
    website: v.optional(v.string()),
    accentColor: v.string(),
    monogram: v.string(),
    keywords: v.array(v.string()),
    /** Real crest / logo copied into file storage (platform avatar URLs expire). */
    logoStorageId: v.optional(v.id("_storage")),
  }).index("by_slug", ["slug"]),

  accounts: defineTable({
    teamId: v.id("teams"),
    platform,
    handle: v.string(),
    url: v.string(),
    displayName: v.optional(v.string()),
    status: v.union(
      v.literal("proposed"),
      v.literal("approved"),
      v.literal("excluded"),
    ),
    source: v.union(
      v.literal("seed"),
      v.literal("manual"),
      v.literal("discovery"),
    ),
    verification: v.object({
      level: v.union(
        v.literal("verified"),
        v.literal("likely"),
        v.literal("unverified"),
      ),
      evidence: v.array(v.string()),
    }),
    lastFetchedAt: v.optional(v.number()),
  })
    .index("by_team", ["teamId"])
    .index("by_team_platform_handle", ["teamId", "platform", "handle"]),

  posts: defineTable({
    teamId: v.id("teams"),
    accountId: v.optional(v.id("accounts")),
    origin,
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
    fetchedAt: v.number(),
    metrics: v.object({
      likes: v.optional(v.number()),
      comments: v.optional(v.number()),
      views: v.optional(v.number()),
    }),
    processing: v.union(
      v.literal("pending"),
      v.literal("processed"),
      v.literal("error"),
    ),
    processingError: v.optional(v.string()),
  })
    .index("by_platform_external", ["platform", "externalId"])
    .index("by_team_posted", ["teamId", "postedAt"])
    .index("by_team_processing", ["teamId", "processing"])
    .index("by_account", ["accountId"]),

  media: defineTable({
    teamId: v.id("teams"),
    postId: v.id("posts"),
    kind: v.union(
      v.literal("image"),
      v.literal("video"),
      v.literal("audio"),
    ),
    url: v.string(),
    thumbnailUrl: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    durationSec: v.optional(v.number()),
    /** 64-bit dHash as 16 hex chars, computed from the image or video thumbnail. */
    phash: v.optional(v.string()),
    /** Durable copy in Convex file storage (platform CDN URLs expire). */
    storageId: v.optional(v.id("_storage")),
    hashError: v.optional(v.string()),
    position: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_team", ["teamId"]),

  stories: defineTable({
    teamId: v.id("teams"),
    origin,
    title: v.string(),
    summary: v.string(),
    keyFacts: v.array(v.string()),
    conflicts: v.array(v.string()),
    summarySource: v.union(
      v.literal("claude"),
      v.literal("heuristic"),
      v.literal("sample"),
    ),
    coverUrl: v.optional(v.string()),
    platforms: v.array(platform),
    postCount: v.number(),
    mediaCount: v.number(),
    firstPostedAt: v.number(),
    lastPostedAt: v.number(),
    /** Set when membership changed and the summary should be regenerated. */
    stale: v.boolean(),
  }).index("by_team_last", ["teamId", "lastPostedAt"]),

  storyPosts: defineTable({
    teamId: v.id("teams"),
    storyId: v.id("stories"),
    postId: v.id("posts"),
    role: v.union(
      v.literal("anchor"),
      v.literal("duplicate"),
      v.literal("complement"),
    ),
    /** What this post adds that the others don't (from Claude or heuristics). */
    contribution: v.optional(v.string()),
    matchCategory: v.optional(matchCategory),
  })
    .index("by_story", ["storyId"])
    .index("by_post", ["postId"]),

  matchDecisions: defineTable({
    teamId: v.id("teams"),
    postA: v.id("posts"),
    postB: v.id("posts"),
    category: matchCategory,
    confidence: v.number(),
    merged: v.boolean(),
    decidedBy: v.union(
      v.literal("rule"),
      v.literal("elastic"),
      v.literal("claude"),
      v.literal("user"),
    ),
    reasoning: v.string(),
    signals: v.object({
      textSimilarity: v.optional(v.number()),
      imageHashDistance: v.optional(v.number()),
      elasticScore: v.optional(v.number()),
      hoursApart: v.optional(v.number()),
      sharedLinks: v.optional(v.number()),
      sharedHashtags: v.optional(v.number()),
    }),
    newInfoA: v.optional(v.string()),
    newInfoB: v.optional(v.string()),
  })
    .index("by_pair", ["postA", "postB"])
    .index("by_postB", ["postB"])
    .index("by_team", ["teamId"]),

  runs: defineTable({
    teamId: v.id("teams"),
    apifyRunId: v.optional(v.string()),
    apifyDatasetId: v.optional(v.string()),
    kind: v.union(v.literal("ingest"), v.literal("process")),
    status: v.union(
      v.literal("running"),
      v.literal("succeeded"),
      v.literal("partial"),
      v.literal("failed"),
    ),
    stage: v.string(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    stats: v.object({
      postsFetched: v.number(),
      postsNew: v.number(),
      storiesTouched: v.number(),
      claudeCalls: v.number(),
      elasticQueries: v.number(),
    }),
    log: v.array(
      v.object({
        at: v.number(),
        level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
        message: v.string(),
      }),
    ),
    error: v.optional(v.string()),
  }).index("by_team_started", ["teamId", "startedAt"]),
});
