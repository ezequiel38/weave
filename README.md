# Weave — every post, one story

Cal Hacks 13.0 project. Weave pulls an organisation's Instagram and TikTok posts and merges
duplicates and same-moment posts into single stories (rules → Elastic → Claude), without losing
any original media.

- [`weave/`](weave/) — the app (Next.js + Convex). Setup and architecture in [`weave/README.md`](weave/README.md).
- [`actors/fcb-social-posts/`](actors/fcb-social-posts/) — the Apify Actor that collects posts (published as `ezeq8/fcb-social-posts`).
