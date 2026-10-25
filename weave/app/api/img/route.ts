import type { NextRequest } from "next/server";

// Social CDNs often refuse hotlinked images (referrer / CORP checks). This
// proxies only known platform media hosts — it is not an open proxy.
const ALLOWED = [
  /(^|\.)cdninstagram\.com$/,
  /(^|\.)fbcdn\.net$/,
  /(^|\.)ytimg\.com$/,
  /(^|\.)ggpht\.com$/,
  /(^|\.)googleusercontent\.com$/,
  /(^|\.)tiktokcdn(-[a-z]+)?\.com$/,
  /(^|\.)tiktokcdn\.com$/,
  /(^|\.)ibyteimg\.com$/,
  /(^|\.)twimg\.com$/,
  /(^|\.)apify\.com$/,
  /(^|\.)apifyusercontent\.com$/,
];

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u");
  if (!raw) return new Response("missing u", { status: 400 });
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (url.protocol !== "https:" || !ALLOWED.some((re) => re.test(url.hostname))) {
    return new Response("host not allowed", { status: 403 });
  }
  const upstream = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; WeaveBot/1.0)" },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!upstream || !upstream.ok) {
    return new Response("upstream failed", { status: 502 });
  }
  const type = upstream.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) return new Response("not an image", { status: 415 });
  return new Response(upstream.body, {
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
}
