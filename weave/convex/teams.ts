import { ConvexError, v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

const MAX_TEAMS = 25;
const PALETTE = ["#4f46e5", "#0f766e", "#b45309", "#be123c", "#1d4ed8", "#7c3aed", "#15803d"];

/** "golden state warriors" → "Golden State Warriors"; leaves mixed-case input ("FC Barcelona") alone. */
export function displayName(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (clean !== clean.toLowerCase()) return clean;
  const small = new Set(["and", "of", "the", "de", "del", "la", "y", "&"]);
  return clean
    .split(" ")
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/** Create (or return) an organization from a free-text name. */
export const create = mutation({
  args: {
    name: v.string(),
    kind: v.optional(
      v.union(
        v.literal("sports"),
        v.literal("company"),
        v.literal("creator"),
        v.literal("organization"),
      ),
    ),
  },
  handler: async (ctx, { name, kind }) => {
    const clean = displayName(name);
    const slug = slugify(clean);
    if (!slug) throw new ConvexError("Please enter a name");
    const existing = await ctx.db
      .query("teams")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) return existing.slug;
    // Open to visitors, so cap it: nobody can fill the deployment with junk teams.
    if ((await ctx.db.query("teams").take(MAX_TEAMS + 1)).length > MAX_TEAMS) {
      throw new ConvexError("Team limit reached for this demo");
    }
    const words = clean.split(/\s+/).filter(Boolean);
    await ctx.db.insert("teams", {
      name: clean,
      slug,
      kind: kind ?? "organization",
      accentColor: PALETTE[[...slug].reduce((h, c) => h + c.charCodeAt(0), 0) % PALETTE.length],
      monogram: words.map((w) => w[0]).join("").slice(0, 3).toUpperCase(),
      keywords: [clean.toLowerCase(), slug.replace(/-/g, "")],
    });
    return slug;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const teams = await ctx.db.query("teams").take(50);
    return await Promise.all(teams.map((team) => withLogo(ctx, team)));
  },
});

export const bySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const team = await ctx.db
      .query("teams")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    return team ? await withLogo(ctx, team) : null;
  },
});

async function withLogo(ctx: QueryCtx, team: Doc<"teams">) {
  return { ...team, logoUrl: team.logoStorageId ? await ctx.storage.getUrl(team.logoStorageId) : null };
}

/** Copy a logo image (e.g. the club's verified TikTok avatar) into storage and attach it. */
export const setLogo = internalAction({
  args: { slug: v.string(), url: v.string() },
  returns: v.null(),
  handler: async (ctx, { slug, url }) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) throw new Error(`Logo fetch failed: ${res.status} ${type}`);
    const storageId = await ctx.storage.store(await res.blob());
    await ctx.runMutation(internal.teams.attachLogo, { slug, storageId });
    return null;
  },
});

export const attachLogo = internalMutation({
  args: { slug: v.string(), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { slug, storageId }) => {
    const team = await ctx.db.query("teams").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!team) throw new Error(`No team ${slug}`);
    if (team.logoStorageId) await ctx.storage.delete(team.logoStorageId);
    await ctx.db.patch(team._id, { logoStorageId: storageId });
    return null;
  },
});

export const hasLogo = internalQuery({
  args: { teamId: v.id("teams") },
  returns: v.boolean(),
  handler: async (ctx, { teamId }) => !!(await ctx.db.get(teamId))?.logoStorageId,
});

/** Ingest hook: store the account avatar as the logo if the team doesn't have one yet. */
export const setLogoIfMissing = internalAction({
  args: { teamId: v.id("teams"), url: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { teamId, url }) => {
    if (await ctx.runQuery(internal.teams.hasLogo, { teamId })) return false;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) throw new Error(`${res.status} ${type}`);
    const storageId = await ctx.storage.store(await res.blob());
    const team = await ctx.runQuery(internal.teams.slugOf, { teamId });
    if (!team) return false;
    await ctx.runMutation(internal.teams.attachLogo, { slug: team, storageId });
    return true;
  },
});

export const slugOf = internalQuery({
  args: { teamId: v.id("teams") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { teamId }) => (await ctx.db.get(teamId))?.slug ?? null,
});

export const forDiscovery = internalQuery({
  args: { teamId: v.id("teams") },
  returns: v.union(v.object({ name: v.string(), kind: v.string(), website: v.optional(v.string()) }), v.null()),
  handler: async (ctx, { teamId }) => {
    const t = await ctx.db.get(teamId);
    return t ? { name: t.name, kind: t.kind, website: t.website } : null;
  },
});

/** One-off repair for teams created before displayName existed. */
export const fixNames = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    let fixed = 0;
    for (const t of await ctx.db.query("teams").take(200)) {
      const name = displayName(t.name);
      if (name !== t.name) {
        const words = name.split(/\s+/).filter(Boolean);
        await ctx.db.patch(t._id, { name, monogram: words.map((w) => w[0]).join("").slice(0, 3).toUpperCase() });
        fixed++;
      }
    }
    return fixed;
  },
});
