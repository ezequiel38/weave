import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { refreshStory } from "./stories";
import { matchCategory } from "./schema";

/**
 * Storage side of the analysis pipeline. The orchestration (image hashing,
 * matching, Claude) lives in analyze.ts, which needs the Node runtime.
 *
 * Step 1: every pending post becomes its own single-post story so real
 * content appears immediately; matching then folds stories together.
 */
export const assignSingles = internalMutation({
  args: { teamId: v.id("teams") },
  returns: v.number(),
  handler: async (ctx, { teamId }) => {
    const pending = await ctx.db
      .query("posts")
      .withIndex("by_team_processing", (q) => q.eq("teamId", teamId).eq("processing", "pending"))
      .take(200);
    let created = 0;
    for (const post of pending) {
      const linked = await ctx.db
        .query("storyPosts")
        .withIndex("by_post", (q) => q.eq("postId", post._id))
        .first();
      if (!linked) {
        const storyId = await ctx.db.insert("stories", {
          teamId,
          origin: post.origin,
          title: post.title ?? firstLine(post.text),
          summary: post.text,
          keyFacts: [],
          conflicts: [],
          summarySource: "heuristic",
          platforms: [post.platform],
          postCount: 1,
          mediaCount: 0,
          firstPostedAt: post.postedAt,
          lastPostedAt: post.postedAt,
          stale: false,
        });
        await ctx.db.insert("storyPosts", { teamId, storyId, postId: post._id, role: "anchor" });
        await refreshStory(ctx, storyId);
        created++;
      }
      await ctx.db.patch(post._id, { processing: "processed" });
    }
    return created;
  },
});

export function firstLine(text: string): string {
  const line = text.split("\n").find((l) => l.trim()) ?? "Untitled post";
  return line.length > 110 ? `${line.slice(0, 107).trimEnd()}…` : line;
}

// ───────────── Phase 3 storage helpers (orchestrated from analyze.ts) ─────────────

/** Dev/demo: forget machine decisions and rebuild one story per post. User splits are kept. */
export const resetMatching = internalMutation({
  args: { teamId: v.id("teams") },
  returns: v.null(),
  handler: async (ctx, { teamId }) => {
    const decisions = await ctx.db.query("matchDecisions").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(2000);
    for (const d of decisions) if (d.decidedBy !== "user") await ctx.db.delete(d._id);
    const stories = await ctx.db.query("stories").withIndex("by_team_last", (q) => q.eq("teamId", teamId)).take(500);
    for (const s of stories) {
      const links = await ctx.db.query("storyPosts").withIndex("by_story", (q) => q.eq("storyId", s._id)).take(50);
      for (const l of links) {
        await ctx.db.delete(l._id);
        await ctx.db.patch(l.postId, { processing: "pending" });
      }
      await ctx.db.delete(s._id);
    }
    return null;
  },
});

export const mediaToHash = internalQuery({
  args: { teamId: v.id("teams") },
  returns: v.array(v.object({ _id: v.id("media"), url: v.string(), video: v.boolean() })),
  handler: async (ctx, { teamId }) => {
    const rows = await ctx.db.query("media").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(500);
    return rows
      // Needs a copy, or a hash (only images / poster frames are hashable).
      .filter((m) => (!m.storageId || (!m.phash && (m.kind === "image" || !!m.thumbnailUrl))) && !m.hashError && m.kind !== "audio")
      .map((m) =>
        m.kind === "image"
          ? { _id: m._id, url: m.url, video: false }
          : m.thumbnailUrl
            ? { _id: m._id, url: m.thumbnailUrl, video: false }
            : // No poster frame: keep a copy of the clip itself (TikTok player embeds never expire).
              { _id: m._id, url: m.url.includes("tiktok.com/player/") ? "" : m.url, video: true },
      )
      .filter((m) => m.url.startsWith("https://"));
  },
});

export const setHashes = internalMutation({
  args: {
    results: v.array(
      v.object({
        id: v.id("media"),
        phash: v.optional(v.string()),
        hashError: v.optional(v.string()),
        storageId: v.optional(v.id("_storage")),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { results }) => {
    for (const { id, ...r } of results) await ctx.db.patch(id, r);
    return null;
  },
});

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const matchingInput = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_team_posted", (q) => q.eq("teamId", teamId))
      .order("desc")
      .take(200);
    const out = [];
    for (const p of posts) {
      const media = await ctx.db.query("media").withIndex("by_post", (q) => q.eq("postId", p._id)).take(20);
      out.push({
        _id: p._id,
        origin: p.origin,
        platform: p.platform,
        authorHandle: p.authorHandle,
        text: p.text,
        title: p.title,
        links: p.links,
        hashtags: p.hashtags,
        postedAt: p.postedAt,
        hashes: media.flatMap((m) => (m.phash ? [m.phash] : [])),
        // Hashable media still waiting on a hash: any "not a match" verdict now would be premature.
        unhashed: media.some((m) => !m.phash && !m.hashError && m.kind !== "audio" && (m.kind === "image" || !!m.thumbnailUrl)),
        videoSecs: media.flatMap((m) => (m.kind === "video" && m.durationSec ? [m.durationSec] : [])),
      });
    }
    const decisions = await ctx.db
      .query("matchDecisions")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .take(2000);
    return {
      posts: out,
      decisions: decisions.map((d) => ({
        key: pairKey(d.postA, d.postB),
        postA: d.postA,
        postB: d.postB,
        merged: d.merged,
        decidedBy: d.decidedBy,
        category: d.category,
      })),
    };
  },
});

const signalsValidator = v.object({
  textSimilarity: v.optional(v.number()),
  imageHashDistance: v.optional(v.number()),
  hoursApart: v.optional(v.number()),
  sharedLinks: v.optional(v.number()),
  sharedHashtags: v.optional(v.number()),
  elasticScore: v.optional(v.number()),
});

export const recordDecisions = internalMutation({
  args: {
    teamId: v.id("teams"),
    decisions: v.array(
      v.object({
        postA: v.id("posts"),
        postB: v.id("posts"),
        category: matchCategory,
        confidence: v.number(),
        merged: v.boolean(),
        decidedBy: v.union(v.literal("rule"), v.literal("elastic"), v.literal("claude")),
        reasoning: v.string(),
        signals: signalsValidator,
        newInfoA: v.optional(v.string()),
        newInfoB: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { teamId, decisions }) => {
    for (const d of decisions) {
      const swap = d.postB < d.postA;
      const [postA, postB] = swap ? [d.postB, d.postA] : [d.postA, d.postB];
      const existing = await ctx.db
        .query("matchDecisions")
        .withIndex("by_pair", (q) => q.eq("postA", postA).eq("postB", postB))
        .unique();
      if (existing?.decidedBy === "user") continue; // never override a human
      const row = {
        ...d,
        postA,
        postB,
        newInfoA: swap ? d.newInfoB : d.newInfoA,
        newInfoB: swap ? d.newInfoA : d.newInfoB,
      };
      if (existing) await ctx.db.patch(existing._id, row);
      else await ctx.db.insert("matchDecisions", { teamId, ...row });
    }
    return null;
  },
});

/**
 * Fold each group of posts into one story (the earliest post's story). Posts are
 * never deleted — only their story membership moves. Returns touched story ids.
 */
export const applyMerges = internalMutation({
  args: {
    groups: v.array(v.object({ postIds: v.array(v.id("posts")), duplicates: v.array(v.id("posts")) })),
  },
  returns: v.array(v.id("stories")),
  handler: async (ctx, { groups }) => {
    const touched: Id<"stories">[] = [];
    for (const g of groups) {
      const posts = (await Promise.all(g.postIds.map((id) => ctx.db.get(id)))).filter(
        (p): p is Doc<"posts"> => p !== null,
      );
      if (posts.length < 2) continue;
      posts.sort((a, b) => a.postedAt - b.postedAt);
      const links = await Promise.all(
        posts.map((p) => ctx.db.query("storyPosts").withIndex("by_post", (q) => q.eq("postId", p._id)).first()),
      );
      const target = links[0]?.storyId;
      if (!target) continue;
      let changed = false;
      for (const [i, p] of posts.entries()) {
        const link = links[i];
        const role = i === 0 ? "anchor" : g.duplicates.includes(p._id) ? "duplicate" : "complement";
        if (!link) {
          await ctx.db.insert("storyPosts", { teamId: p.teamId, storyId: target, postId: p._id, role });
          changed = true;
        } else if (link.storyId !== target) {
          const old = link.storyId;
          await ctx.db.patch(link._id, { storyId: target, role });
          await refreshStory(ctx, old); // deletes the old story once it's empty
          changed = true;
        } else if (link.role !== role) {
          await ctx.db.patch(link._id, { role });
        }
      }
      if (changed) {
        await ctx.db.patch(target, { stale: true });
        touched.push(target);
      }
      await refreshStory(ctx, target);
    }
    return touched;
  },
});

export const staleStories = internalQuery({
  args: { teamId: v.id("teams"), limit: v.number(), upgradeHeuristic: v.optional(v.boolean()) },
  handler: async (ctx, { teamId, limit, upgradeHeuristic }) => {
    const stories = await ctx.db
      .query("stories")
      .withIndex("by_team_last", (q) => q.eq("teamId", teamId))
      .order("desc")
      .take(200);
    const out = [];
    for (const s of stories.filter((s) => s.postCount > 1 && (s.stale || (upgradeHeuristic && s.summarySource === "heuristic"))).slice(0, limit)) {
      const links = await ctx.db.query("storyPosts").withIndex("by_story", (q) => q.eq("storyId", s._id)).take(50);
      const posts = [];
      for (const l of links) {
        const p = await ctx.db.get(l.postId);
        if (p) {
          posts.push({
            _id: p._id,
            platform: p.platform,
            authorHandle: p.authorHandle,
            postedAt: p.postedAt,
            title: p.title,
            text: p.text,
            role: l.role,
          });
        }
      }
      posts.sort((a, b) => a.postedAt - b.postedAt);
      out.push({ _id: s._id, posts });
    }
    return out;
  },
});

export const saveSummary = internalMutation({
  args: {
    storyId: v.id("stories"),
    title: v.string(),
    summary: v.string(),
    keyFacts: v.array(v.string()),
    conflicts: v.array(v.string()),
    summarySource: v.union(v.literal("claude"), v.literal("heuristic")),
    contributions: v.array(v.object({ postId: v.id("posts"), contribution: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, { storyId, contributions, ...fields }) => {
    if (!(await ctx.db.get(storyId))) return null;
    await ctx.db.patch(storyId, { ...fields, stale: false });
    for (const c of contributions) {
      const link = await ctx.db.query("storyPosts").withIndex("by_post", (q) => q.eq("postId", c.postId)).first();
      if (link && link.storyId === storyId) await ctx.db.patch(link._id, { contribution: c.contribution || undefined });
    }
    return null;
  },
});
