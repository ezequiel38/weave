"use node";

import { Client } from "@elastic/elasticsearch";

/**
 * Elastic stage: semantic nearest neighbours over captions (semantic_text uses
 * the deployment's default inference endpoint, so no embedding code here).
 * Used as a cheap filter between the rules and Claude.
 */
const INDEX = process.env.ELASTIC_INDEX ?? "weave-posts";
const WINDOW_MS = 96 * 3_600_000;

export interface ElasticPost {
  _id: string;
  teamId: string;
  platform: string;
  text: string;
  title?: string;
  postedAt: number;
}

export function elasticClient(): Client | null {
  const node = process.env.ELASTIC_URL;
  const apiKey = process.env.ELASTIC_API_KEY;
  if (!node || !apiKey) return null;
  return new Client({ node, auth: { apiKey } });
}

async function ensureIndex(es: Client) {
  if (await es.indices.exists({ index: INDEX })) return;
  await es.indices.create({
    index: INDEX,
    mappings: {
      properties: {
        teamId: { type: "keyword" },
        platform: { type: "keyword" },
        postedAt: { type: "date", format: "epoch_millis" },
        text: { type: "text" },
        semantic: { type: "semantic_text" },
      },
    },
  });
}

/** Index posts once (op_type=create skips ones already there, so inference isn't re-paid). */
export async function indexPosts(es: Client, posts: ElasticPost[]): Promise<number> {
  await ensureIndex(es);
  if (posts.length === 0) return 0;
  const operations = posts.flatMap((p) => {
    const text = `${p.title ?? ""} ${p.text}`.trim() || "(no caption)";
    return [
      { create: { _index: INDEX, _id: p._id } },
      { teamId: p.teamId, platform: p.platform, postedAt: p.postedAt, text, semantic: text },
    ];
  });
  const res = await es.bulk({ operations, refresh: "wait_for" });
  return res.items.filter((i) => i.create?.status === 201).length;
}

/**
 * Top-k semantic neighbours of each post within ±96h, same team.
 * Returns pairKey → { score, rank } (rank 0 = closest).
 */
export async function neighbours(
  es: Client,
  posts: ElasticPost[],
  k = 3,
): Promise<{ pairs: Map<string, { score: number; rank: number }>; queries: number }> {
  const pairs = new Map<string, { score: number; rank: number }>();
  let queries = 0;
  for (const p of posts) {
    const text = `${p.title ?? ""} ${p.text}`.trim();
    if (text.length < 8) continue;
    const res = await es.search<{ teamId: string }>({
      index: INDEX,
      size: k,
      query: {
        bool: {
          must: [{ semantic: { field: "semantic", query: text } }],
          filter: [
            { term: { teamId: p.teamId } },
            { range: { postedAt: { gte: p.postedAt - WINDOW_MS, lte: p.postedAt + WINDOW_MS } } },
          ],
          must_not: [{ ids: { values: [p._id] } }],
        },
      },
    });
    queries++;
    res.hits.hits.forEach((h, rank) => {
      if (!h._id) return;
      const key = p._id < h._id ? `${p._id}|${h._id}` : `${h._id}|${p._id}`;
      const prev = pairs.get(key);
      const score = h._score ?? 0;
      if (!prev || rank < prev.rank) pairs.set(key, { score, rank });
    });
  }
  return { pairs, queries };
}
