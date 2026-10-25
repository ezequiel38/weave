import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { platform } from "./schema";
import { parseAccountInput } from "./lib/accountUrl";

export const listForTeam = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    return await ctx.db
      .query("accounts")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .take(100);
  },
});

/** Add an account from a profile URL or "@handle" (with an explicit platform). */
export const add = mutation({
  args: {
    teamId: v.id("teams"),
    input: v.string(),
    platform: v.optional(platform),
  },
  handler: async (ctx, { teamId, input, platform }) => {
    const parsed = parseAccountInput(input, platform);
    if (!parsed) {
      throw new ConvexError(
        "Couldn't recognise that account. Paste a profile URL, or pick a platform and enter a handle.",
      );
    }
    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_team_platform_handle", (q) =>
        q
          .eq("teamId", teamId)
          .eq("platform", parsed.platform)
          .eq("handle", parsed.handle),
      )
      .unique();
    if (existing) {
      if (existing.status !== "approved") {
        await ctx.db.patch(existing._id, { status: "approved" });
      }
      return existing._id;
    }
    return await ctx.db.insert("accounts", {
      teamId,
      platform: parsed.platform,
      handle: parsed.handle,
      url: parsed.url,
      status: "approved",
      source: "manual",
      verification: {
        level: "unverified",
        evidence: ["Added manually"],
      },
    });
  },
});

export const setStatus = mutation({
  args: {
    accountId: v.id("accounts"),
    status: v.union(
      v.literal("proposed"),
      v.literal("approved"),
      v.literal("excluded"),
    ),
  },
  handler: async (ctx, { accountId, status }) => {
    await ctx.db.patch(accountId, { status });
  },
});

export const remove = mutation({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    // Posts keep their data; they just lose the account link.
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .take(500);
    for (const p of posts) await ctx.db.patch(p._id, { accountId: undefined });
    await ctx.db.delete(accountId);
  },
});
