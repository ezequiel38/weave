export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function compact(n: number | undefined): string | null {
  if (n === undefined || n === null) return null;
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function duration(sec: number | undefined): string | null {
  if (!sec) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Split a run of hashtags off the end of a caption so it can be shown small.
 * Inline tags ("Setting the tone for #ElClásico ⚒️") stay in the body.
 */
export function splitTrailingHashtags(text: string): { body: string; tags: string[] } {
  const m = text.match(/(?:\s*#[\p{L}\p{N}_]+)+\s*$/u);
  const body = m ? text.slice(0, m.index).trimEnd() : text;
  if (!m || !body) return { body: text, tags: [] };
  return { body, tags: m[0].trim().split(/\s+/) };
}
