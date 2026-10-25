import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

export const latest = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    return await ctx.db
      .query("runs")
      .withIndex("by_team_started", (q) => q.eq("teamId", teamId))
      .order("desc")
      .take(5);
  },
});

export const start = internalMutation({
  args: {
    teamId: v.id("teams"),
    kind: v.union(v.literal("ingest"), v.literal("process")),
    stage: v.string(),
  },
  handler: async (ctx, { teamId, kind, stage }) => {
    return await ctx.db.insert("runs", {
      teamId,
      kind,
      status: "running",
      stage,
      startedAt: Date.now(),
      stats: {
        postsFetched: 0,
        postsNew: 0,
        storiesTouched: 0,
        claudeCalls: 0,
        elasticQueries: 0,
      },
      log: [],
    });
  },
});

export const update = internalMutation({
  args: {
    runId: v.id("runs"),
    stage: v.optional(v.string()),
    message: v.optional(v.string()),
    level: v.optional(
      v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
    ),
    addStats: v.optional(
      v.object({
        postsFetched: v.optional(v.number()),
        postsNew: v.optional(v.number()),
        storiesTouched: v.optional(v.number()),
        claudeCalls: v.optional(v.number()),
        elasticQueries: v.optional(v.number()),
      }),
    ),
    finish: v.optional(
      v.union(v.literal("succeeded"), v.literal("partial"), v.literal("failed")),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return;
    const stats = { ...run.stats };
    for (const [k, n] of Object.entries(args.addStats ?? {})) {
      const key = k as keyof typeof stats;
      stats[key] += n ?? 0;
    }
    const log = args.message
      ? [
          ...run.log,
          { at: Date.now(), level: args.level ?? "info", message: args.message },
        ].slice(-60)
      : run.log;
    await ctx.db.patch(args.runId, {
      stage: args.stage ?? run.stage,
      stats,
      log,
      ...(args.finish
        ? { status: args.finish, finishedAt: Date.now() }
        : {}),
      ...(args.error ? { error: args.error } : {}),
    });
  },
});
