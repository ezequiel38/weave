/**
 * Phase 3 rule stage: cheap, deterministic signals that decide most pairs
 * without an LLM. Only the ambiguous middle goes to Claude.
 */

export type Category = "exact_duplicate" | "near_duplicate" | "same_event" | "related" | "unrelated";

export interface PostSignalsInput {
  text: string;
  title?: string;
  links: string[];
  hashtags: string[];
  postedAt: number;
  hashes: string[]; // dHash hex of each image / video thumbnail
}

export interface PairSignals {
  textSimilarity: number;
  imageHashDistance?: number;
  hoursApart: number;
  sharedLinks: number;
  sharedHashtags: number;
  elasticScore?: number;
}

export type RuleVerdict =
  | { kind: "decided"; category: Category; merged: boolean; confidence: number; reasoning: string }
  | { kind: "ambiguous" }
  | { kind: "skip" };

// Case- and accent-insensitive, so #ElClásico and #elclasico are the same tag.
const normTag = (t: string) => t.normalize("NFKD").replace(/\p{M}/gu, "").replace(/^#+/, "").toLowerCase();

/** A tag on more than this share of a team's posts is "generic" (brand, sponsor, always-on campaign). */
export const GENERIC_TAG_SHARE = 0.35;
/** Below this many posts, frequencies are too noisy to call anything generic. */
const MIN_POSTS_FOR_GENERIC = 8;

/**
 * Hashtags that carry no event information for this team, learned from the
 * team's own posts: anything used on > GENERIC_TAG_SHARE of them (e.g.
 * #fcbarcelona, #barçaontiktok, a season-long sponsor tag). No per-team setup.
 */
export function genericTags(posts: { hashtags: string[] }[], share = GENERIC_TAG_SHARE): Set<string> {
  if (posts.length < MIN_POSTS_FOR_GENERIC) return new Set();
  const counts = new Map<string, number>();
  for (const p of posts) for (const t of new Set(p.hashtags.map(normTag))) counts.set(t, (counts.get(t) ?? 0) + 1);
  return new Set([...counts].filter(([, n]) => n / posts.length > share).map(([t]) => t));
}

function stripNoise(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[\p{L}\p{N}_]+/gu, " ") // hashtags are compared separately
    .replace(/@/g, " "); // "@spotify" ≈ "spotify"
}

export function wordTokens(text: string): Set<string> {
  return new Set(stripNoise(text).match(/[\p{L}\p{N}]{2,}/gu) ?? []);
}

/** Character trigrams over the text with all separators removed — robust to "@golfwang" vs "GOLF WANG". */
export function trigrams(text: string): Set<string> {
  const s = (stripNoise(text).match(/[\p{L}\p{N}]+/gu) ?? []).join("");
  const out = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3));
  return out;
}

/** |A ∩ B| / min(|A|, |B|): 1.0 when the shorter caption is contained in the longer. */
function containment(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let hit = 0;
  for (const x of small) if (big.has(x)) hit++;
  return hit / small.size;
}

export function textSimilarity(a: string, b: string): number {
  const wa = wordTokens(a);
  const wb = wordTokens(b);
  if (Math.min(wa.size, wb.size) < 2) return 0; // too little text to judge
  return Math.max(containment(wa, wb), containment(trigrams(a), trigrams(b)));
}

export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < a.length; i += 4) {
    let x = parseInt(a.slice(i, i + 4), 16) ^ parseInt(b.slice(i, i + 4), 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

export function computeSignals(a: PostSignalsInput, b: PostSignalsInput, generic: Set<string> = new Set()): PairSignals {
  let best: number | undefined;
  for (const ha of a.hashes) for (const hb of b.hashes) {
    const d = hamming(ha, hb);
    if (best === undefined || d < best) best = d;
  }
  const tagsA = new Set(a.hashtags.map(normTag).filter((t) => !generic.has(t)));
  return {
    textSimilarity: textSimilarity(`${a.title ?? ""} ${a.text}`, `${b.title ?? ""} ${b.text}`),
    imageHashDistance: best,
    hoursApart: Math.abs(a.postedAt - b.postedAt) / 3_600_000,
    sharedLinks: a.links.filter((l) => b.links.includes(l)).length,
    sharedHashtags: new Set(b.hashtags.map(normTag).filter((t) => tagsA.has(t))).size,
  };
}

/** Thresholds are on a 64-bit dHash: ≤6 is visually the same image, ≤12 very similar. */
export function ruleVerdict(s: PairSignals): RuleVerdict {
  const img = s.imageHashDistance;
  const text = s.textSimilarity;
  if (s.hoursApart > 24 * 7) return { kind: "skip" };

  // Same caption cross-posted within hours = the same video/photo on two platforms.
  if ((img !== undefined && img <= 4 && text >= 0.9) || (text >= 0.95 && s.hoursApart <= 3 && (img === undefined || img <= 12))) {
    return { kind: "decided", category: "exact_duplicate", merged: true, confidence: 0.98, reasoning: `${img !== undefined ? `Same image (Δ${img}/64)` : "Same caption"} posted within ${Math.round(s.hoursApart * 10) / 10}h — the same content cross-posted.` };
  }
  if (img !== undefined && img <= 12 && text >= 0.5) {
    return { kind: "decided", category: "near_duplicate", merged: true, confidence: 0.92, reasoning: `Visually matching media (Δ${img}/64) and one caption largely contained in the other (${Math.round(text * 100)}%).` };
  }
  // Caption-only matches must be same-day: campaign taglines recur across days
  // inside otherwise different posts, which still scores 100% containment.
  if (text >= 0.9 && s.hoursApart <= 12 && (img === undefined || img <= 18)) {
    return { kind: "decided", category: "near_duplicate", merged: true, confidence: 0.88, reasoning: `Captions match ${Math.round(text * 100)}% within ${Math.round(s.hoursApart)}h — the same post shared on another platform.` };
  }
  if (s.sharedLinks > 0 && s.hoursApart <= 72) {
    return { kind: "decided", category: "same_event", merged: true, confidence: 0.85, reasoning: `Both link to the same page within ${Math.round(s.hoursApart)}h.` };
  }
  const maybe =
    (img !== undefined && img <= 18) || text >= 0.45 || (s.sharedHashtags >= 2 && s.hoursApart <= 48);
  return maybe && s.hoursApart <= 96 ? { kind: "ambiguous" } : { kind: "skip" };
}
