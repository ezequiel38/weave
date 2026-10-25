import { v } from "convex/values";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { profileUrl, type Platform } from "./lib/accountUrl";
import { refreshStory } from "./stories";
import { assertUnlocked } from "./lib/lock";

/**
 * DEMO FIXTURES — everything inserted here has origin: "sample" and is shown
 * with a "Sample" badge in the UI. Names and events are fictional; they exist
 * only to demonstrate the layout and the merge behaviour before live ingestion.
 */

const H = 3600_000;

interface SamplePost {
  key: string;
  platform: Platform;
  handle: string;
  hoursAgo: number;
  title?: string;
  text: string;
  hashtags: string[];
  links?: string[];
  transcript?: string;
  media: { kind: "image" | "video"; hue: number; durationSec?: number }[];
  metrics?: { likes?: number; comments?: number; views?: number };
}

interface SampleStory {
  title: string;
  summary: string;
  keyFacts: string[];
  members: { key: string; role: "anchor" | "duplicate" | "complement"; contribution: string; category?: "exact_duplicate" | "near_duplicate" | "same_event" }[];
}

const POSTS: SamplePost[] = [
  // Story 1 — a signing, told across four platforms with different media.
  {
    key: "sign-ig",
    platform: "instagram",
    handle: "fcbarcelona",
    hoursAgo: 5,
    text: "✍️ Welcome to Barça, Marc Vidal! The midfielder signs until 2030.",
    hashtags: ["ForçaBarça", "WelcomeVidal"],
    media: [{ kind: "image", hue: 330 }, { kind: "image", hue: 350 }],
    metrics: { likes: 182000, comments: 3100 },
  },
  {
    key: "sign-x",
    platform: "x",
    handle: "FCBarcelona",
    hoursAgo: 4.8,
    text: "OFFICIAL: Agreement reached with Marc Vidal. Contract runs until 30 June 2030 with a €500M release clause. Full statement ⬇️",
    hashtags: ["WelcomeVidal"],
    links: ["https://www.fcbarcelona.com/en/news/sample-official-statement"],
    media: [{ kind: "image", hue: 335 }],
    metrics: { likes: 41000, comments: 2200 },
  },
  {
    key: "sign-tt",
    platform: "tiktok",
    handle: "fcbarcelona",
    hoursAgo: 4.2,
    text: "First steps inside the Ciutat Esportiva 👀 #WelcomeVidal",
    hashtags: ["WelcomeVidal", "fyp"],
    media: [{ kind: "video", hue: 300, durationSec: 34 }],
    metrics: { views: 2400000, likes: 310000 },
  },
  {
    key: "sign-yt",
    platform: "youtube",
    handle: "fcbarcelona",
    hoursAgo: 3,
    title: "MARC VIDAL'S FIRST INTERVIEW AS A BARÇA PLAYER",
    text: "Marc Vidal talks about choosing Barça, wearing the number 18, and his first goals for the season.",
    hashtags: ["WelcomeVidal"],
    transcript: "…it's a dream to be here. I'll wear the 18, the number I wore growing up…",
    media: [{ kind: "video", hue: 345, durationSec: 612 }],
    metrics: { views: 540000, likes: 38000 },
  },
  // Story 2 — the same matchday graphic cross-posted (exact/near duplicates).
  {
    key: "match-ig",
    platform: "instagram",
    handle: "fcbarcelona",
    hoursAgo: 26,
    text: "FULL TIME: Barça 3–1 Sample FC. Three points at home! 🔵🔴",
    hashtags: ["BarçaSampleFC"],
    media: [{ kind: "image", hue: 220 }],
    metrics: { likes: 240000, comments: 5100 },
  },
  {
    key: "match-x",
    platform: "x",
    handle: "FCBarcelona",
    hoursAgo: 26,
    text: "FULL TIME: Barça 3–1 Sample FC. Three points at home! 🔵🔴",
    hashtags: ["BarçaSampleFC"],
    media: [{ kind: "image", hue: 220 }],
    metrics: { likes: 52000, comments: 1800 },
  },
  {
    key: "match-yt",
    platform: "youtube",
    handle: "fcbarcelona",
    hoursAgo: 22,
    title: "HIGHLIGHTS | Barça 3–1 Sample FC",
    text: "All the goals: a first-half brace and a late header from a corner.",
    hashtags: ["BarçaSampleFC"],
    media: [{ kind: "video", hue: 215, durationSec: 488 }],
    metrics: { views: 1200000 },
  },
  // Related-but-distinct: same player, different event — must NOT merge.
  {
    key: "training-ig",
    platform: "instagram",
    handle: "fcbarcelona",
    hoursAgo: 50,
    text: "Back at it. Rondos and recovery work before the weekend.",
    hashtags: ["ForçaBarça"],
    media: [{ kind: "image", hue: 160 }, { kind: "image", hue: 170 }, { kind: "image", hue: 180 }],
    metrics: { likes: 98000 },
  },
  // Unrelated single.
  {
    key: "museum-tt",
    platform: "tiktok",
    handle: "fcbarcelona",
    hoursAgo: 72,
    text: "POV: you find the 1999 centenary kit in the museum archive",
    hashtags: ["history"],
    media: [{ kind: "video", hue: 40, durationSec: 21 }],
    metrics: { views: 880000 },
  },
];

const STORIES: SampleStory[] = [
  {
    title: "Barça sign midfielder Marc Vidal until 2030",
    summary:
      "The club announced the signing of midfielder Marc Vidal on a contract running to 30 June 2030. The official statement lists a €500M release clause; in his first interview he confirmed he will wear the number 18, and a behind-the-scenes video shows his first visit to the training ground.",
    keyFacts: [
      "Contract until 30 June 2030 (X, Instagram)",
      "€500M release clause (X / official statement)",
      "Will wear the number 18 (YouTube interview)",
      "First visit to the Ciutat Esportiva (TikTok)",
    ],
    members: [
      { key: "sign-ig", role: "anchor", contribution: "Announcement photos" },
      { key: "sign-x", role: "complement", contribution: "Release clause and link to the official statement", category: "same_event" },
      { key: "sign-tt", role: "complement", contribution: "Behind-the-scenes training-ground video", category: "same_event" },
      { key: "sign-yt", role: "complement", contribution: "First interview; shirt number 18", category: "same_event" },
    ],
  },
  {
    title: "Barça 3–1 Sample FC: full time and highlights",
    summary:
      "Barça beat Sample FC 3–1 at home. The full-time graphic was posted identically on Instagram and X; YouTube adds a highlights package covering a first-half brace and a late header from a corner.",
    keyFacts: ["Final score 3–1 (home win)", "Highlights include a first-half brace and a late header (YouTube)"],
    members: [
      { key: "match-ig", role: "anchor", contribution: "Full-time graphic" },
      { key: "match-x", role: "duplicate", contribution: "Identical full-time graphic", category: "exact_duplicate" },
      { key: "match-yt", role: "complement", contribution: "Highlights video", category: "same_event" },
    ],
  },
];

const SINGLES = ["training-ig", "museum-tt"];

async function ensureBarca(ctx: MutationCtx): Promise<Id<"teams">> {
  const existing = await ctx.db
    .query("teams")
    .withIndex("by_slug", (q) => q.eq("slug", "fc-barcelona"))
    .unique();
  if (existing) return existing._id;
  const teamId = await ctx.db.insert("teams", {
    name: "FC Barcelona",
    slug: "fc-barcelona",
    kind: "sports",
    tagline: "Més que un club",
    website: "https://www.fcbarcelona.com",
    accentColor: "#a50044",
    monogram: "FCB",
    keywords: ["barça", "barca", "fcbarcelona", "forçabarça", "forcabarca"],
  });
  const handles: [Platform, string][] = [
    ["instagram", "fcbarcelona"],
    ["tiktok", "fcbarcelona"],
  ];
  for (const [platform, handle] of handles) {
    await ctx.db.insert("accounts", {
      teamId,
      platform,
      handle,
      url: profileUrl(platform, handle),
      status: "approved",
      source: "seed",
      verification: {
        level: "likely",
        evidence: ["Well-known club handle — not yet cross-checked against fcbarcelona.com"],
      },
    });
  }
  return teamId;
}

export const ensureDemoTeam = mutation({
  args: {},
  handler: async (ctx) => {
    const teamId = await ensureBarca(ctx);
    const team = await ctx.db.get(teamId);
    return team!.slug;
  },
});

/** Insert the labelled sample posts + pre-grouped sample stories. Idempotent. */
export const loadSampleData = mutation({
  args: { teamId: v.id("teams"), password: v.optional(v.string()) },
  handler: async (ctx, { teamId, password }) => {
    assertUnlocked(password);
    const now = Date.now();
    const ids = new Map<string, Id<"posts">>();
    for (const p of POSTS) {
      const externalId = `sample-${p.key}`;
      const existing = await ctx.db
        .query("posts")
        .withIndex("by_platform_external", (q) =>
          q.eq("platform", p.platform).eq("externalId", externalId),
        )
        .unique();
      if (existing) {
        ids.set(p.key, existing._id);
        continue;
      }
      const postId = await ctx.db.insert("posts", {
        teamId,
        origin: "sample",
        platform: p.platform,
        externalId,
        url: profileUrl(p.platform, p.handle),
        authorHandle: p.handle,
        authorName: "FC Barcelona",
        title: p.title,
        text: p.text,
        hashtags: p.hashtags,
        links: p.links ?? [],
        transcript: p.transcript,
        postedAt: now - p.hoursAgo * H,
        fetchedAt: now,
        metrics: p.metrics ?? {},
        processing: "processed",
      });
      ids.set(p.key, postId);
      for (const [i, m] of p.media.entries()) {
        await ctx.db.insert("media", {
          teamId,
          postId,
          kind: m.kind,
          url: `sample:${m.hue}`,
          durationSec: m.durationSec,
          position: i,
        });
      }
    }

    const alreadyGrouped = async (postId: Id<"posts">) =>
      (await ctx.db
        .query("storyPosts")
        .withIndex("by_post", (q) => q.eq("postId", postId))
        .first()) !== null;

    const groups: SampleStory[] = [
      ...STORIES,
      ...SINGLES.map((key) => {
        const p = POSTS.find((x) => x.key === key)!;
        return {
          title: (p.title ?? p.text).replace("", ""),
          summary: p.text.replace("", ""),
          keyFacts: [],
          members: [{ key, role: "anchor" as const, contribution: "Original post" }],
        };
      }),
    ];

    for (const s of groups) {
      const memberIds = s.members.map((m) => ids.get(m.key)!);
      if (await alreadyGrouped(memberIds[0])) continue;
      const storyId = await ctx.db.insert("stories", {
        teamId,
        origin: "sample",
        title: s.title,
        summary: s.summary,
        keyFacts: s.keyFacts,
        conflicts: [],
        summarySource: "sample",
        platforms: [],
        postCount: 0,
        mediaCount: 0,
        firstPostedAt: now,
        lastPostedAt: now,
        stale: false,
      });
      for (const m of s.members) {
        await ctx.db.insert("storyPosts", {
          teamId,
          storyId,
          postId: ids.get(m.key)!,
          role: m.role,
          contribution: m.contribution,
          matchCategory: m.category,
        });
        if (m.category) {
          const anchor = memberIds[0];
          const other = ids.get(m.key)!;
          const [a, b] = anchor < other ? [anchor, other] : [other, anchor];
          await ctx.db.insert("matchDecisions", {
            teamId,
            postA: a,
            postB: b,
            category: m.category,
            confidence: m.category === "exact_duplicate" ? 1 : 0.86,
            merged: true,
            decidedBy: "rule",
            reasoning: `[Sample fixture] ${m.contribution}`,
            signals: {},
          });
        }
      }
      await refreshStory(ctx, storyId);
    }
    return null;
  },
});

/** Remove every sample row for a team (posts, media, stories, links, decisions). */
export const clearSampleData = mutation({
  args: { teamId: v.id("teams"), password: v.optional(v.string()) },
  handler: async (ctx, { teamId, password }) => {
    assertUnlocked(password);
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_team_posted", (q) => q.eq("teamId", teamId))
      .take(1000);
    for (const p of posts.filter((x) => x.origin === "sample")) {
      await deletePostCascade(ctx, p._id);
    }
    return null;
  },
});

async function deletePostCascade(ctx: MutationCtx, postId: Id<"posts">) {
  for (const m of await ctx.db
    .query("media")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .take(50))
    await ctx.db.delete(m._id);
  for (const d of await ctx.db
    .query("matchDecisions")
    .withIndex("by_pair", (q) => q.eq("postA", postId))
    .take(200))
    await ctx.db.delete(d._id);
  for (const d of await ctx.db
    .query("matchDecisions")
    .withIndex("by_postB", (q) => q.eq("postB", postId))
    .take(200))
    await ctx.db.delete(d._id);
  const link = await ctx.db
    .query("storyPosts")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .unique();
  await ctx.db.delete(postId);
  if (link) {
    await ctx.db.delete(link._id);
    await refreshStory(ctx, link.storyId);
  }
}

export const seedAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ensureBarca(ctx);
    return null;
  },
});
