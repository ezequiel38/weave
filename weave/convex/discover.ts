"use node";

import { v } from "convex/values";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { action } from "./_generated/server";
import { isUnlocked } from "./lib/lock";
import { internal } from "./_generated/api";

/**
 * Suggest a team's official Instagram / TikTok handles with one small Claude call.
 * Suggestions land as *proposed* accounts; nothing is fetched until a human approves.
 */
const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

const Suggestions = z.object({
  accounts: z.array(
    z.object({
      platform: z.enum(["instagram", "tiktok"]),
      handle: z.string(),
      confidence: z.number(),
      note: z.string(),
    }),
  ),
});

const SYSTEM = `You find the OFFICIAL social media accounts of an organisation, team, brand or creator.
Return only Instagram and TikTok handles that you are confident are the official, verified main account
(not fan pages, regional/academy/women's/esports sub-accounts unless asked, and not parody accounts).
If you are not sure an account exists, leave it out — an empty list is fine.
handle: without the @. confidence: 0–1. note: one short phrase of evidence (e.g. "official club account, verified").`;

export const suggest = action({
  args: { teamId: v.id("teams"), password: v.optional(v.string()) },
  returns: v.object({ ok: v.boolean(), message: v.string(), locked: v.optional(v.boolean()) }),
  handler: async (ctx, { teamId, password }): Promise<{ ok: boolean; message: string; locked?: boolean }> => {
    if (!isUnlocked(password)) return { ok: false, locked: true, message: "Wrong password" };
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, message: "ANTHROPIC_API_KEY isn't set on the deployment." };

    const team = await ctx.runQuery(internal.teams.forDiscovery, { teamId });
    if (!team) return { ok: false, message: "Team not found" };

    const client = new Anthropic();
    const res = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(Suggestions) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [
        {
          role: "user",
          content: `Name: ${team.name}\nType: ${team.kind}${team.website ? `\nWebsite: ${team.website}` : ""}`,
        },
      ],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) {
      return { ok: false, message: "Couldn't get suggestions — add accounts manually." };
    }
    const added = await ctx.runMutation(internal.accounts.addProposed, {
      teamId,
      accounts: res.parsed_output.accounts.map((a) => ({
        platform: a.platform,
        handle: a.handle.replace(/^@/, "").trim(),
        confidence: Math.max(0, Math.min(1, a.confidence)),
        note: a.note,
      })),
    });
    return {
      ok: true,
      message: added ? `Suggested ${added} account${added === 1 ? "" : "s"} — review and include the right ones.` : "No new accounts to suggest.",
    };
  },
});
