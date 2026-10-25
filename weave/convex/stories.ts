import { ConvexError, v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/** Recompute denormalised fields (platforms, counts, dates, cover) from members. */
export async function refreshStory(ctx: MutationCtx, storyId: Id<"stories">) {
  const story = await ctx.db.get(storyId);
  if (!story) return;
  const links = await ctx.db
    .query("storyPosts")
    .withIndex("by_story", (q) => q.eq("storyId", storyId))
    .take(50);
  if (links.length === 0) {
    await ctx.db.delete(storyId);
    return;
  }
  const posts = (await Promise.all(links.map((l) => ctx.db.get(l.postId)))).filter(
    (p) => p !== null,
  );
  let mediaCount = 0;
  let coverUrl: string | undefined;
  for (const p of [...posts].sort((a, b) => a.postedAt - b.postedAt)) {
    const media = await ctx.db
      .query("media")
      .withIndex("by_post", (q) => q.eq("postId", p._id))
      .take(20);
    mediaCount += media.length;
    if (!coverUrl) {
      const m = media.find((x) => x.kind === "image") ?? media[0];
      coverUrl = m?.thumbnailUrl ?? m?.url;
    }
  }
  await ctx.db.patch(storyId, {
    platforms: [...new Set(posts.map((p) => p.platform))],
    postCount: posts.length,
    mediaCount,
    coverUrl,
    firstPostedAt: Math.min(...posts.map((p) => p.postedAt)),
    lastPostedAt: Math.max(...posts.map((p) => p.postedAt)),
  });
}

/** Undo a merge: move one post out of a story into its own single-post story. */
export const splitPost = mutation({
  args: { storyId: v.id("stories"), postId: v.id("posts") },
  handler: async (ctx, { storyId, postId }) => {
    const story = await ctx.db.get(storyId);
    const post = await ctx.db.get(postId);
    if (!story || !post) throw new ConvexError("Story or post not found");
    const link = await ctx.db
      .query("storyPosts")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .unique();
    if (!link || link.storyId !== storyId) {
      throw new ConvexError("That post isn't part of this story");
    }
    if (story.postCount <= 1) return storyId;

    await ctx.db.delete(link._id);
    const newStory = await ctx.db.insert("stories", {
      teamId: post.teamId,
      origin: post.origin,
      title: post.title ?? post.text.slice(0, 90),
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
    await ctx.db.insert("storyPosts", {
      teamId: post.teamId,
      storyId: newStory,
      postId,
      role: "anchor",
    });
    await refreshStory(ctx, newStory);

    // Record the user override so the pipeline never re-merges these posts.
    const others = await ctx.db
      .query("storyPosts")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .take(50);
    for (const other of others) {
      const [a, b] =
        postId < other.postId ? [postId, other.postId] : [other.postId, postId];
      const existing = await ctx.db
        .query("matchDecisions")
        .withIndex("by_pair", (q) => q.eq("postA", a).eq("postB", b))
        .unique();
      const decision = {
        category: "unrelated" as const,
        merged: false,
        decidedBy: "user" as const,
        confidence: 1,
        reasoning: "Split apart manually by a user.",
      };
      if (existing) await ctx.db.patch(existing._id, decision);
      else
        await ctx.db.insert("matchDecisions", {
          teamId: post.teamId,
          postA: a,
          postB: b,
          signals: {},
          ...decision,
        });
    }
    await ctx.db.patch(storyId, { stale: true });
    await refreshStory(ctx, storyId);
    return newStory;
  },
});
