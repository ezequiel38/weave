"use node";

import { v } from "convex/values";
import { ApifyClient } from "apify-client";
import type { FunctionArgs } from "convex/server";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { normalizeActorPost, type NormalizedPost } from "./lib/normalize";

/** Our Actor (actors/fcb-social-posts): wraps the IG + TikTok store scrapers. */
const ACTOR_ID = process.env.APIFY_ACTOR_ID ?? "ezeq8/fcb-social-posts";
/** Cost guards — keep development runs small. */
const POSTS_PER_ACCOUNT = Math.min(Number(process.env.POSTS_PER_ACCOUNT ?? 12), 25);
const NEWER_THAN = process.env.INGEST_NEWER_THAN ?? "7 days";
const MAX_ITEMS = 120;
const POLL_MS = 15_000;
const MAX_POLLS = 50; // ~12.5 minutes

const SUPPORTED = new Set(["instagram", "tiktok"]);

/** Spending actions are locked behind REFRESH_PASSWORD (set in the Convex env, never in code). */
function unlocked(password: string | undefined): boolean {
  const expected = process.env.REFRESH_PASSWORD;
  return !expected || password === expected;
}
const LOCKED = { ok: false, locked: true, message: "Wrong password" };
const result = v.object({ ok: v.boolean(), message: v.string(), locked: v.optional(v.boolean()) });

function client() {
  const token = process.env.APIFY_TOKEN;
  if (!token) return null;
  return new ApifyClient({ token });
}

type RunUpdate = Omit<FunctionArgs<typeof internal.runs.update>, "runId" | "message">;

async function log(ctx: ActionCtx, runId: Id<"runs">, message: string, extra: RunUpdate = {}) {
  await ctx.runMutation(internal.runs.update, { runId, message, ...extra });
}

/** Validate + normalise raw dataset items, then upsert them and kick off analysis. */
async function ingestItems(ctx: ActionCtx, teamId: Id<"teams">, runId: Id<"runs">, items: unknown[]) {
  const posts: NormalizedPost[] = [];
  let invalid = 0;
  for (const item of items) {
    const n = normalizeActorPost(item);
    if ("error" in n) invalid++;
    else posts.push(n);
  }
  if (invalid) await log(ctx, runId, `Skipped ${invalid} malformed item(s)`, { level: "warn" });

  let newCount = 0;
  for (let i = 0; i < posts.length; i += 25) {
    const { newIds } = await ctx.runMutation(internal.ingestDb.upsertPosts, {
      teamId,
      posts: posts.slice(i, i + 25),
    });
    newCount += newIds.length;
  }
  await log(ctx, runId, `Saved ${posts.length} posts (${newCount} new)`, {
    addStats: { postsFetched: posts.length, postsNew: newCount },
    stage: "Analysing posts",
  });
  await ctx.runAction(internal.analyze.processTeam, { teamId, runId });
}

export const refresh = action({
  args: { teamId: v.id("teams"), password: v.optional(v.string()) },
  returns: result,
  handler: async (ctx, { teamId, password }) => {
    if (!unlocked(password)) return LOCKED;
    const apify = client();
    if (!apify) {
      return { ok: false, message: "Live ingestion isn't configured yet (APIFY_TOKEN missing on the Convex deployment)." };
    }
    const { accounts } = await ctx.runQuery(internal.ingestDb.context, { teamId });
    const instagram = accounts.filter((a) => a.platform === "instagram").map((a) => a.handle);
    const tiktok = accounts.filter((a) => a.platform === "tiktok").map((a) => a.handle);
    const unsupported = accounts.filter((a) => !SUPPORTED.has(a.platform));
    if (instagram.length + tiktok.length === 0) {
      return { ok: false, message: "No included Instagram or TikTok accounts to fetch." };
    }

    const runId = await ctx.runMutation(internal.ingestDb.tryStartRun, { teamId });
    if (!runId) return { ok: false, message: "A refresh is already running." };

    if (unsupported.length) {
      await log(ctx, runId, `Skipping ${unsupported.map((a) => `${a.platform}/@${a.handle}`).join(", ")} — not supported by the Actor yet`, { level: "warn" });
    }
    try {
      // Empty arrays tell the Actor to skip a platform (it defaults to fcbarcelona otherwise).
      const run = await apify.actor(ACTOR_ID).start(
        {
          instagramUsernames: instagram,
          tiktokProfiles: tiktok,
          resultsPerSource: POSTS_PER_ACCOUNT,
          newerThan: NEWER_THAN,
        },
        { memory: 512, timeout: 900, maxItems: MAX_ITEMS },
      );
      await ctx.runMutation(internal.ingestDb.setApifyRun, {
        runId,
        apifyRunId: run.id,
        apifyDatasetId: run.defaultDatasetId,
      });
      await log(ctx, runId, `Started Apify run ${run.id} (${instagram.length} IG, ${tiktok.length} TikTok, ≤${POSTS_PER_ACCOUNT} posts each)`, {
        stage: "Collecting posts with Apify",
      });
      await ctx.scheduler.runAfter(POLL_MS, internal.ingest.poll, { teamId, runId, apifyRunId: run.id, attempt: 1 });
      return { ok: true, message: "Refresh started" };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await log(ctx, runId, `Couldn't start Apify run: ${message}`, { level: "error", finish: "failed", error: "Couldn't start Apify run" });
      return { ok: false, message: `Couldn't start Apify run: ${message}` };
    }
  },
});

export const poll = internalAction({
  args: { teamId: v.id("teams"), runId: v.id("runs"), apifyRunId: v.string(), attempt: v.number() },
  handler: async (ctx, { teamId, runId, apifyRunId, attempt }) => {
    const apify = client();
    if (!apify) return;
    const run = await apify.run(apifyRunId).get();
    if (!run) {
      await log(ctx, runId, "Apify run disappeared", { level: "error", finish: "failed", error: "Apify run not found" });
      return;
    }
    if (run.status === "READY" || run.status === "RUNNING") {
      if (attempt >= MAX_POLLS) {
        await log(ctx, runId, "Gave up waiting for Apify", { level: "error", finish: "failed", error: "Apify run timed out" });
        return;
      }
      await ctx.scheduler.runAfter(POLL_MS, internal.ingest.poll, { teamId, runId, apifyRunId, attempt: attempt + 1 });
      return;
    }
    const cost = run.usageTotalUsd !== undefined ? ` · $${run.usageTotalUsd.toFixed(3)}` : "";
    if (run.status !== "SUCCEEDED") {
      // Still salvage whatever the Actor pushed before failing.
      await log(ctx, runId, `Apify run ended ${run.status}${cost}`, { level: "warn" });
    } else {
      await log(ctx, runId, `Apify run succeeded${cost}`);
    }
    try {
      const { items } = await apify.dataset(run.defaultDatasetId).listItems({ limit: MAX_ITEMS, clean: true });
      if (items.length === 0 && run.status !== "SUCCEEDED") {
        await log(ctx, runId, "No posts were collected", { level: "error", finish: "failed", error: `Apify run ${run.status}` });
        return;
      }
      await ingestItems(ctx, teamId, runId, items);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await log(ctx, runId, `Ingest failed: ${message}`, { level: "error", finish: "failed", error: "Ingest failed" });
    }
  },
});

/**
 * Re-use a finished Actor run's dataset without paying for a new scrape —
 * handy for demos and development. Reads only (no Actor compute).
 */
export const importDataset = action({
  args: { teamId: v.id("teams"), datasetId: v.string(), password: v.optional(v.string()) },
  returns: result,
  handler: async (ctx, { teamId, datasetId, password }) => {
    if (!unlocked(password)) return LOCKED;
    const apify = client();
    if (!apify) return { ok: false, message: "APIFY_TOKEN missing on the Convex deployment." };
    const runId = await ctx.runMutation(internal.ingestDb.tryStartRun, { teamId });
    if (!runId) return { ok: false, message: "A refresh is already running." };
    try {
      await log(ctx, runId, `Importing dataset ${datasetId}`, { stage: "Importing existing Apify dataset" });
      const { items } = await apify.dataset(datasetId).listItems({ limit: MAX_ITEMS, clean: true });
      await ingestItems(ctx, teamId, runId, items);
      return { ok: true, message: `Imported ${items.length} items` };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await log(ctx, runId, `Import failed: ${message}`, { level: "error", finish: "failed", error: "Import failed" });
      return { ok: false, message };
    }
  },
});
