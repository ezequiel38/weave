"use node";

import { v } from "convex/values";
import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { computeSignals, genericTags, ruleVerdict, type Category, type PairSignals } from "./lib/match";
import { elasticClient, indexPosts, neighbours } from "./lib/elastic";

/**
 * Phase 3 analysis: rules → Elastic → Claude.
 *  1. every new post gets its own story (instant feedback)
 *  2. dHash every image / video thumbnail (free, sharp)
 *  3. score all un-decided post pairs with deterministic rules
 *  4. only the ambiguous pairs go to Claude — in ONE batched call
 *  5. union merged pairs into stories; Claude summarises stories whose membership changed
 * Decisions are cached in matchDecisions, so a pair is never paid for twice.
 */

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";
/** Spend guards per run. */
const MAX_PAIRS_PER_RUN = 24;
const MAX_SUMMARIES_PER_RUN = 8;

type RunUpdate = { message: string; level?: "info" | "warn" | "error"; claudeCalls?: number };

async function log(ctx: ActionCtx, runId: Id<"runs"> | undefined, u: RunUpdate) {
  if (!runId) return console.log(u.message);
  await ctx.runMutation(internal.runs.update, {
    runId,
    message: u.message,
    level: u.level,
    addStats: u.claudeCalls ? { claudeCalls: u.claudeCalls } : undefined,
  });
}

function claude(): Anthropic | null {
  return process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
}

// ───────────────────────── image hashing ─────────────────────────

/** 64-bit difference hash: 9×8 greyscale, compare horizontal neighbours. */
async function download(url: string): Promise<{ buf: Buffer; type: string }> {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; WeaveBot/1.0)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { buf: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") ?? "image/jpeg" };
}

async function dHash(buf: Buffer): Promise<string> {
  const px = await sharp(buf).greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let hex = "";
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let col = 0; col < 8; col++) {
      byte = (byte << 1) | (px[row * 9 + col] < px[row * 9 + col + 1] ? 1 : 0);
    }
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

async function hashTeamMedia(ctx: ActionCtx, teamId: Id<"teams">): Promise<{ ok: number; failed: number }> {
  const todo = await ctx.runQuery(internal.pipeline.mediaToHash, { teamId });
  const results: { id: Id<"media">; phash?: string; hashError?: string; storageId?: Id<"_storage"> }[] = [];
  for (let i = 0; i < todo.length; i += 6) {
    const batch = await Promise.all(
      todo.slice(i, i + 6).map(async (m) => {
        try {
          // One download serves both the hash and the durable copy (CDN URLs expire in days).
          const { buf, type } = await download(m.url);
          if (buf.length > 25_000_000) return { id: m._id, hashError: "too large to copy" };
          const storageId = await ctx.storage.store(new Blob([new Uint8Array(buf)], { type }));
          return { id: m._id, phash: m.video ? undefined : await dHash(buf), storageId };
        } catch (e) {
          return { id: m._id, hashError: e instanceof Error ? e.message.slice(0, 200) : "hash failed" };
        }
      }),
    );
    results.push(...batch);
  }
  for (let i = 0; i < results.length; i += 50) {
    await ctx.runMutation(internal.pipeline.setHashes, { results: results.slice(i, i + 50) });
  }
  return { ok: results.filter((r) => r.storageId).length, failed: results.filter((r) => r.hashError).length };
}

// ───────────────────────── Claude ─────────────────────────

const PairJudgement = z.object({
  pairs: z.array(
    z.object({
      id: z.number(),
      category: z.enum(["exact_duplicate", "near_duplicate", "same_event", "related", "unrelated"]),
      confidence: z.number(),
      reasoning: z.string(),
      newInfoA: z.string(),
      newInfoB: z.string(),
    }),
  ),
});

const StorySummary = z.object({
  title: z.string(),
  summary: z.string(),
  keyFacts: z.array(z.string()),
  conflicts: z.array(z.string()),
  contributions: z.array(z.object({ index: z.number(), contribution: z.string() })),
});

const CLASSIFY_SYSTEM = `You deduplicate an organisation's social media posts across Instagram and TikTok.
For each numbered pair decide the relationship:
- exact_duplicate: the same content reposted (same media and message).
- near_duplicate: the same post adapted for another platform (same media or announcement, captions differ in wording, handles, hashtags or extra lines).
- same_event: different posts about the same specific moment/announcement/match/campaign that a reader would want grouped as one story.
- related: same broad topic (e.g. the same upcoming fixture) but distinct moments — keep separate.
- unrelated: nothing specific in common.
Only exact_duplicate, near_duplicate and same_event will be merged, so be conservative: generic club hashtags or the same sponsor alone are not enough.
newInfoA / newInfoB: a short phrase naming what that post adds that the other lacks ("" if nothing).`;

const SUMMARY_SYSTEM = `You write a single story card that consolidates several social posts about the same moment.
Never invent facts — use only what the posts say. Keep every distinct detail somewhere (summary, keyFacts or contributions).
title: ≤ 80 chars, plain, no hashtags. summary: 1–3 sentences. keyFacts: 0–5 short concrete facts (people, products, dates, places).
conflicts: statements where posts disagree (usually empty). contributions: for each post index, a short phrase saying what it adds beyond the others ("" for none).`;

async function callClaude<T>(
  client: Anthropic,
  system: string,
  user: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system,
    output_config: { effort: "low", format: betaZodOutputFormat(schema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: user }],
  });
  if (res.stop_reason === "refusal") return null;
  return res.parsed_output as T | null;
}

const clip = (s: string, n = 600) => (s.length > n ? `${s.slice(0, n)}…` : s);

// ───────────────────────── orchestration ─────────────────────────

type MatchPost = {
  _id: Id<"posts">;
  origin: "live" | "sample";
  platform: string;
  authorHandle: string;
  text: string;
  title?: string;
  links: string[];
  hashtags: string[];
  postedAt: number;
  hashes: string[];
  videoSecs: number[];
};

type NewDecision = {
  postA: Id<"posts">;
  postB: Id<"posts">;
  category: Category;
  confidence: number;
  merged: boolean;
  decidedBy: "rule" | "elastic" | "claude";
  reasoning: string;
  signals: PairSignals;
  newInfoA?: string;
  newInfoB?: string;
};

const keyOf = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const MERGE_CATEGORIES = new Set<Category>(["exact_duplicate", "near_duplicate", "same_event"]);

export const processTeam = internalAction({
  args: { teamId: v.id("teams"), runId: v.optional(v.id("runs")) },
  returns: v.null(),
  handler: async (ctx, { teamId, runId }) => {
    try {
      await analyse(ctx, teamId, runId);
      if (runId) {
        await ctx.runMutation(internal.runs.update, { runId, message: "Analysis complete", finish: "succeeded", stage: "Done" });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (runId) {
        await ctx.runMutation(internal.runs.update, {
          runId,
          message: `Analysis failed: ${message}`,
          level: "error",
          finish: "partial",
          error: "Analysis failed",
        });
      } else throw e;
    }
    return null;
  },
});

async function analyse(ctx: ActionCtx, teamId: Id<"teams">, runId?: Id<"runs">) {
  const created = await ctx.runMutation(internal.pipeline.assignSingles, { teamId });
  if (created) await log(ctx, runId, { message: `Created ${created} story card(s)` });

  const hashed = await hashTeamMedia(ctx, teamId);
  if (hashed.ok + hashed.failed) {
    await log(ctx, runId, { message: `Saved ${hashed.ok} media file(s)${hashed.failed ? `, ${hashed.failed} unreachable` : ""}` });
  }

  const { posts, decisions } = await ctx.runQuery(internal.pipeline.matchingInput, { teamId });
  const generic = genericTags(posts);
  if (generic.size) await log(ctx, runId, { message: `Ignoring generic hashtags: #${[...generic].join(" #")}` });
  const known = new Map(decisions.map((d) => [d.key, d]));

  // Rule stage over every un-decided pair.
  const fresh: NewDecision[] = [];
  const ambiguous: { a: MatchPost; b: MatchPost; s: PairSignals }[] = [];
  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      const a = posts[i] as MatchPost;
      const b = posts[j] as MatchPost;
      if (a.origin !== b.origin || known.has(keyOf(a._id, b._id))) continue;
      const s = computeSignals(a, b, generic);
      const verdict = ruleVerdict(s);
      if (verdict.kind === "decided") {
        const { category, merged, confidence, reasoning } = verdict;
        fresh.push({ postA: a._id, postB: b._id, decidedBy: "rule", signals: s, category, merged, confidence, reasoning });
      } else if (verdict.kind === "ambiguous") {
        ambiguous.push({ a, b, s });
      }
    }
  }

  // Elastic stage: semantic neighbours filter the ambiguous pairs and surface ones the rules missed.
  const es = elasticClient();
  if (es) {
    try {
      const ePosts = posts.map((p) => ({ ...p, teamId: teamId as string }));
      const added = await indexPosts(es, ePosts);
      const { pairs: near, queries } = await neighbours(es, ePosts);
      if (runId) await ctx.runMutation(internal.runs.update, { runId, addStats: { elasticQueries: queries } });
      const byId = new Map(posts.map((p) => [p._id as string, p as MatchPost]));
      const kept: typeof ambiguous = [];
      for (const pair of ambiguous) {
        const hit = near.get(keyOf(pair.a._id, pair.b._id));
        if (hit) kept.push({ ...pair, s: { ...pair.s, elasticScore: hit.score } });
        else {
          fresh.push({
            postA: pair.a._id,
            postB: pair.b._id,
            category: "related",
            confidence: 0.6,
            merged: false,
            decidedBy: "elastic",
            reasoning: "Some surface overlap, but not semantically close in Elastic — kept separate.",
            signals: pair.s,
          });
        }
      }
      const seen = new Set([...fresh, ...kept].map((d) => ("postA" in d ? keyOf(d.postA, d.postB) : keyOf(d.a._id, d.b._id))));
      let discovered = 0;
      for (const [key, hit] of near) {
        const [ida, idb] = key.split("|");
        const a = byId.get(ida);
        const b = byId.get(idb);
        if (!a || !b || a.origin !== b.origin || hit.rank > 0 || seen.has(key) || known.has(key)) continue;
        const s = { ...computeSignals(a, b, generic), elasticScore: hit.score };
        if (s.hoursApart > 48) continue;
        kept.push({ a, b, s });
        seen.add(key);
        discovered++;
      }
      await log(ctx, runId, {
        message: `Elastic: indexed ${added} new post(s); ${ambiguous.length - (kept.length - discovered)} weak pair(s) filtered, ${discovered} new candidate(s) found`,
      });
      ambiguous.splice(0, ambiguous.length, ...kept);
    } catch (e) {
      await log(ctx, runId, { message: `Elastic stage skipped: ${e instanceof Error ? e.message : e}`, level: "warn" });
    }
  }

  // Claude stage: one batched call for the ambiguous middle.
  const client = claude();
  let claudeCalls = 0;
  if (ambiguous.length && !client) {
    await log(ctx, runId, { message: `${ambiguous.length} ambiguous pair(s) left for later — ANTHROPIC_API_KEY not set`, level: "warn" });
  } else if (ambiguous.length && client) {
    ambiguous.sort((x, y) => y.s.textSimilarity - x.s.textSimilarity);
    const batch = ambiguous.slice(0, MAX_PAIRS_PER_RUN);
    const prompt = batch
      .map(
        ({ a, b, s }, id) =>
          `### Pair ${id}\nA (${a.platform} @${a.authorHandle}, ${new Date(a.postedAt).toISOString()}): ${clip(`${a.title ?? ""} ${a.text}`)}\n` +
          `B (${b.platform} @${b.authorHandle}, ${new Date(b.postedAt).toISOString()}): ${clip(`${b.title ?? ""} ${b.text}`)}\n` +
          `Signals: caption overlap ${s.textSimilarity.toFixed(2)},${s.elasticScore !== undefined ? ` semantic neighbour (score ${s.elasticScore.toFixed(2)}),` : ""} image distance ${s.imageHashDistance ?? "n/a"}/64 (≤12 = visually same), ${s.hoursApart.toFixed(1)}h apart, ${s.sharedHashtags} shared specific hashtag(s).`,
      )
      .join("\n\n");
    try {
      const out = await callClaude(client, CLASSIFY_SYSTEM, prompt, PairJudgement);
      claudeCalls++;
      for (const j of out?.pairs ?? []) {
        const p = batch[j.id];
        if (!p) continue;
        fresh.push({
          postA: p.a._id,
          postB: p.b._id,
          category: j.category,
          confidence: Math.max(0, Math.min(1, j.confidence)),
          merged: MERGE_CATEGORIES.has(j.category),
          decidedBy: "claude",
          reasoning: j.reasoning,
          signals: p.s,
          newInfoA: j.newInfoA || undefined,
          newInfoB: j.newInfoB || undefined,
        });
      }
      await log(ctx, runId, { message: `Claude judged ${out?.pairs.length ?? 0} ambiguous pair(s)`, claudeCalls: 1 });
    } catch (e) {
      await log(ctx, runId, { message: `Claude pair check failed: ${e instanceof Error ? e.message : e}`, level: "warn" });
    }
  }

  // Persist merges plus every Elastic/Claude verdict so those pairs are never re-checked.
  const worthKeeping = fresh.filter((d) => d.merged || d.decidedBy !== "rule");
  for (let i = 0; i < worthKeeping.length; i += 50) {
    await ctx.runMutation(internal.pipeline.recordDecisions, { teamId, decisions: worthKeeping.slice(i, i + 50) });
  }

  // Union-find over every merged edge, refusing joins that would reunite a user split.
  const all = [
    ...decisions.map((d) => ({ a: d.postA, b: d.postB, merged: d.merged, category: d.category as Category, user: d.decidedBy === "user" })),
    ...fresh.map((d) => ({ a: d.postA, b: d.postB, merged: d.merged, category: d.category, user: false })),
  ];
  const userSplit = new Set(all.filter((e) => e.user && !e.merged).map((e) => keyOf(e.a, e.b)));
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.has(x) && parent.get(x) !== x) x = parent.get(x)!;
    return x;
  };
  const members = (root: string) => posts.filter((p) => find(p._id) === root).map((p) => p._id as string);
  for (const p of posts) parent.set(p._id, p._id);
  for (const e of all.filter((e) => e.merged && !e.user)) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra === rb) continue;
    const ma = members(ra);
    const mb = members(rb);
    if (ma.some((x) => mb.some((y) => userSplit.has(keyOf(x, y))))) continue;
    parent.set(rb, ra);
  }
  const groups = new Map<string, Id<"posts">[]>();
  for (const p of posts) {
    const r = find(p._id);
    groups.set(r, [...(groups.get(r) ?? []), p._id]);
  }
  // A merged pair whose videos have the same length (±1s) is the same clip cross-posted:
  // treat it as an exact repost so the UI shows one copy.
  const secs = new Map(posts.map((p) => [p._id as string, p.videoSecs]));
  const sameClip = (a: string, b: string) =>
    (secs.get(a) ?? []).some((x) => (secs.get(b) ?? []).some((y) => Math.abs(x - y) <= 1));
  const exactDupes = new Set(
    all
      .filter((e) => e.merged && (e.category === "exact_duplicate" || sameClip(e.a, e.b)))
      .flatMap((e) => [e.a, e.b]),
  );
  const mergeGroups = [...groups.values()]
    .filter((g) => g.length > 1)
    .map((postIds) => ({ postIds, duplicates: postIds.filter((id) => exactDupes.has(id)) }));
  const touched = mergeGroups.length ? await ctx.runMutation(internal.pipeline.applyMerges, { groups: mergeGroups }) : [];
  const mergedNow = fresh.filter((d) => d.merged).length;
  await log(ctx, runId, {
    message: `Matching: ${fresh.length} new decision(s), ${mergedNow} merge(s) — ${touched.length} stor${touched.length === 1 ? "y" : "ies"} changed`,
  });

  // Summaries for stories whose membership changed.
  const stale = await ctx.runQuery(internal.pipeline.staleStories, {
    teamId,
    limit: MAX_SUMMARIES_PER_RUN,
    upgradeHeuristic: client !== null, // replace caption-only summaries once Claude is available
  });
  let summarised = 0;
  for (const story of stale) {
    let saved = false;
    if (client) {
      try {
        const prompt = story.posts
          .map((p, i) => `### Post ${i} (${p.platform} @${p.authorHandle}, ${new Date(p.postedAt).toISOString()})\n${clip(`${p.title ?? ""}\n${p.text}`.trim(), 1200)}`)
          .join("\n\n");
        const out = await callClaude(client, SUMMARY_SYSTEM, prompt, StorySummary);
        claudeCalls++;
        await log(ctx, runId, { message: `Summarised story with ${story.posts.length} posts`, claudeCalls: 1 });
        if (out) {
          await ctx.runMutation(internal.pipeline.saveSummary, {
            storyId: story._id,
            title: out.title,
            summary: out.summary,
            keyFacts: out.keyFacts.slice(0, 6),
            conflicts: out.conflicts.slice(0, 4),
            summarySource: "claude",
            contributions: out.contributions.flatMap((c) =>
              story.posts[c.index] ? [{ postId: story.posts[c.index]._id, contribution: c.contribution }] : [],
            ),
          });
          saved = true;
        }
      } catch (e) {
        await log(ctx, runId, { message: `Summary failed: ${e instanceof Error ? e.message : e}`, level: "warn" });
      }
    }
    if (!saved) {
      // Free fallback: anchor's first line as title, the most detailed caption as summary.
      const longest = [...story.posts].sort((a, b) => b.text.length - a.text.length)[0];
      const anchor = story.posts[0];
      await ctx.runMutation(internal.pipeline.saveSummary, {
        storyId: story._id,
        title: (anchor.title ?? anchor.text.split("\n").find((l) => l.trim()) ?? "Story").slice(0, 110),
        summary: longest.text,
        keyFacts: [],
        conflicts: [],
        summarySource: "heuristic",
        contributions: [],
      });
    }
    summarised++;
  }
  if (summarised) await log(ctx, runId, { message: `Refreshed ${summarised} story summar${summarised === 1 ? "y" : "ies"} (${claudeCalls} Claude call(s) this run)` });
}
