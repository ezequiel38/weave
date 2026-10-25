import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

const PALETTE = ["#4f46e5", "#0f766e", "#b45309", "#be123c", "#1d4ed8", "#7c3aed", "#15803d"];

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
    const clean = name.trim().slice(0, 80);
    const slug = slugify(clean);
    if (!slug) throw new ConvexError("Please enter a name");
    const existing = await ctx.db
      .query("teams")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) return existing.slug;
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
    return await ctx.db.query("teams").take(50);
  },
});

export const bySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("teams")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
  },
});
