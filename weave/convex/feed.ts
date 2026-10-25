import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export type PostWithMedia = Doc<"posts"> & { media: Doc<"media">[] };

async function withMedia(ctx: QueryCtx, post: Doc<"posts">): Promise<PostWithMedia> {
  const media = await ctx.db
    .query("media")
    .withIndex("by_post", (q) => q.eq("postId", post._id))
    .take(20);
  media.sort((a, b) => a.position - b.position);
  // Prefer our durable copy over the expiring platform CDN URL.
  for (const m of media) {
    if (!m.storageId) continue;
    const [stored, file] = await Promise.all([ctx.storage.getUrl(m.storageId), ctx.db.system.get(m.storageId)]);
    if (!stored) continue;
    // A stored video is the clip itself; a stored image is the photo or the video's poster.
    if (m.kind === "image" || file?.contentType?.startsWith("video/")) m.url = stored;
    else m.thumbnailUrl = stored;
  }
  return { ...post, media };
}

/** Individual posts, newest first — the "before" view. */
export const raw = query({
  args: { teamId: v.id("teams"), limit: v.optional(v.number()) },
  handler: async (ctx, { teamId, limit }) => {
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_team_posted", (q) => q.eq("teamId", teamId))
      .order("desc")
      .take(Math.min(limit ?? 80, 200));
    return await Promise.all(posts.map((p) => withMedia(ctx, p)));
  },
});

/** Consolidated stories with every member post and its media — the "after" view. */
export const unified = query({
  args: { teamId: v.id("teams"), limit: v.optional(v.number()) },
  handler: async (ctx, { teamId, limit }) => {
    const stories = await ctx.db
      .query("stories")
      .withIndex("by_team_last", (q) => q.eq("teamId", teamId))
      .order("desc")
      .take(Math.min(limit ?? 40, 100));

    return await Promise.all(
      stories.map(async (story) => {
        const links = await ctx.db
          .query("storyPosts")
          .withIndex("by_story", (q) => q.eq("storyId", story._id))
          .take(50);
        const posts = (
          await Promise.all(
            links.map(async (link) => {
              const post = await ctx.db.get(link.postId);
              if (!post) return null;
              return {
                ...(await withMedia(ctx, post)),
                role: link.role,
                contribution: link.contribution,
                matchCategory: link.matchCategory,
              };
            }),
          )
        ).filter((p) => p !== null);
        posts.sort((a, b) => a.postedAt - b.postedAt);
        return { ...story, posts };
      }),
    );
  },
});

/** Similarity evidence for the pairs inside a story (powers "Why merged?"). */
export const storyEvidence = query({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    const links = await ctx.db
      .query("storyPosts")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .take(50);
    const ids = new Set<Id<"posts">>(links.map((l) => l.postId));
    const decisions: Doc<"matchDecisions">[] = [];
    for (const id of ids) {
      const rows = await ctx.db
        .query("matchDecisions")
        .withIndex("by_pair", (q) => q.eq("postA", id))
        .take(50);
      decisions.push(...rows.filter((d) => ids.has(d.postB)));
    }
    return decisions;
  },
});

export const stats = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_team_posted", (q) => q.eq("teamId", teamId))
      .take(1000);
    const stories = await ctx.db
      .query("stories")
      .withIndex("by_team_last", (q) => q.eq("teamId", teamId))
      .take(1000);
    return {
      posts: posts.length,
      stories: stories.length,
      merged: stories.filter((s) => s.postCount > 1).length,
      sampleOnly: posts.length > 0 && posts.every((p) => p.origin === "sample"),
      hasSample: posts.some((p) => p.origin === "sample"),
      pending: posts.filter((p) => p.processing === "pending").length,
    };
  },
});

/** Landing-page example: the richest real merged story (most posts, Claude summary, has media). */
export const showcase = query({
  args: {},
  handler: async (ctx) => {
    const stories = (await ctx.db.query("stories").order("desc").take(200)).filter(
      (s) => s.origin === "live" && s.postCount > 1 && s.mediaCount > 0,
    );
    stories.sort(
      (a, b) =>
        b.postCount - a.postCount ||
        Number(b.summarySource === "claude") - Number(a.summarySource === "claude") ||
        b.lastPostedAt - a.lastPostedAt,
    );
    const story = stories[0];
    if (!story) return null;
    const team = await ctx.db.get(story.teamId);
    const links = await ctx.db.query("storyPosts").withIndex("by_story", (q) => q.eq("storyId", story._id)).take(4);
    const posts = [];
    for (const l of links) {
      const post = await ctx.db.get(l.postId);
      if (!post) continue;
      const withM = await withMedia(ctx, post);
      posts.push({ _id: post._id, platform: post.platform, text: post.text, media: withM.media.slice(0, 1) });
    }
    return {
      title: story.title,
      summary: story.summary,
      postCount: story.postCount,
      platforms: story.platforms,
      team: team ? { name: team.name, slug: team.slug } : null,
      posts,
    };
  },
});
