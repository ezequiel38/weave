# Weave — every post, one story

Weave aggregates a team's / brand's posts from Instagram, TikTok, YouTube and X and
merges posts about the same moment into a single story — without losing any
original photo, video, link or fact. Built at Cal Hacks 13.0.

## Run locally

```bash
npm install
npx convex dev          # anonymous local deployment works without an account
npm run dev             # http://localhost:3000
```

Then open **FC Barcelona** on the landing page. "Load sample data" inserts
clearly labelled fictional fixtures (amber **Sample** badges) for UI work.

### Live ingestion (Apify)

```bash
npx convex env set APIFY_TOKEN <token>
npx convex env set APIFY_ACTOR_ID ezeq8/fcb-social-posts   # default
```

**Refresh** starts our Actor (`../actors/fcb-social-posts`, wrapping
`apify/instagram-post-scraper` + `clockworks/tiktok-scraper`) for the included
Instagram/TikTok accounts (≤12 posts each by default, max 25). Convex polls the
run, validates each item with zod (`convex/lib/normalize.ts`), and upserts
idempotently on `(platform, externalId)`. `ingest.importDataset` re-imports an
existing run's dataset at no scraping cost.

## Architecture

| Layer | Where |
|---|---|
| UI (Next.js 16, Tailwind 4, shadcn/Base UI) | `app/`, `components/` |
| Data + reactive queries (Convex, source of truth) | `convex/schema.ts`, `feed.ts`, `accounts.ts`, `teams.ts` |
| Ingestion (Apify Actor → normalizer → upsert) | `convex/ingest.ts`, `ingestDb.ts`, `lib/normalize.ts` |
| Story membership, undo merge ("Not the same story") | `convex/stories.ts` |
| Merge evidence per pair | `matchDecisions` table, "Why merged?" dialog |
| Analysis pipeline | `convex/pipeline.ts` |

Original posts are never deleted; stories reference posts through `storyPosts`.
Splitting a post records a `decidedBy: "user"` decision so it is never re-merged.

## Status / known limitations

- **Done:** schema, landing/search, accounts manager, unified / raw / compare feed,
  run status banner, Apify ingestion path, image proxy for platform CDNs.
- **Phase 3 (rules → Elastic → Claude) built:** `convex/analyze.ts` dHashes media (sharp), scores every
  un-decided pair with free rules (`convex/lib/match.ts`: image distance, caption containment,
  shared links, time window), sends only ambiguous pairs to Claude in one batched call, unions
  merges into stories, and has Claude summarise stories whose membership changed. Decisions are
  cached in `matchDecisions` (never re-paid); user splits are never re-merged. Without
  `ANTHROPIC_API_KEY` it runs rules-only with heuristic summaries. Re-run without scraping:
  `npx convex run analyze:processTeam {"teamId":"..."}` (`pipeline:resetMatching` rebuilds).
  Elastic stage (`convex/lib/elastic.ts`, needs `ELASTIC_URL` + `ELASTIC_API_KEY`): posts are indexed
  once with `semantic_text`; ambiguous pairs that are not semantic neighbours are settled as
  "related" without Claude, and top neighbours the rules missed become new Claude candidates.
- YouTube and X are not covered by the Actor yet; those accounts are skipped
  with a warning in the run log.
- Platform CDN media URLs expire, so the analysis step copies every image, video poster and
  poster-less video (≤25 MB) into Convex file storage; feed queries serve those copies.
- No auth: anyone with the URL can edit accounts (hackathon scope).
