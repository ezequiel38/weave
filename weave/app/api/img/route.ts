import type { NextRequest } from "next/server";
import sharp from "sharp";

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
  // Our own durable copies live in Convex file storage; serving them through here lets the CDN/browser cache
  // a resized copy instead of every page view downloading the full original (file bandwidth is metered).
  const ownStorage = /\.convex\.cloud$/.test(url.hostname) && url.pathname.startsWith("/api/storage/");
  if (url.protocol !== "https:" || !(ownStorage || ALLOWED.some((re) => re.test(url.hostname)))) {
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
  const width = Math.min(Number(req.nextUrl.searchParams.get("w")) || 0, 2000);
  if (ownStorage && width > 0 && !/gif|svg/.test(type)) {
    const resized = await sharp(Buffer.from(await upstream.arrayBuffer()))
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer()
      .catch(() => null);
    if (resized) {
      return new Response(new Uint8Array(resized), {
        headers: { "content-type": "image/webp", "cache-control": "public, max-age=86400, s-maxage=604800, immutable" },
      });
    }
    return new Response("resize failed", { status: 502 });
  }
  return new Response(upstream.body, {
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
}
