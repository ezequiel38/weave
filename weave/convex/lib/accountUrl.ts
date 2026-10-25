export type Platform = "instagram" | "youtube" | "tiktok" | "x";

export interface ParsedAccount {
  platform: Platform;
  handle: string;
  url: string;
}

export function profileUrl(platform: Platform, handle: string): string {
  switch (platform) {
    case "instagram":
      return `https://www.instagram.com/${handle}/`;
    case "youtube":
      return `https://www.youtube.com/@${handle}`;
    case "tiktok":
      return `https://www.tiktok.com/@${handle}`;
    case "x":
      return `https://x.com/${handle}`;
  }
}

const HANDLE_RE = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Accepts a profile URL (instagram.com/fcbarcelona, youtube.com/@fcbarcelona,
 * tiktok.com/@fcbarcelona, x.com/FCBarcelona) or a bare handle + platform.
 */
export function parseAccountInput(
  raw: string,
  fallbackPlatform?: Platform,
): ParsedAccount | null {
  const input = raw.trim();
  if (!input) return null;

  let url: URL | null = null;
  try {
    url = new URL(input.startsWith("http") ? input : `https://${input}`);
  } catch {
    url = null;
  }

  if (url && url.hostname.includes(".")) {
    const host = url.hostname.replace(/^(www\.|m\.|mobile\.)/, "");
    const segs = url.pathname.split("/").filter(Boolean);
    const first = segs[0] ?? "";
    let platform: Platform | null = null;
    let handle: string | null = null;
    if (host === "instagram.com") {
      platform = "instagram";
      handle = first;
    } else if (host === "youtube.com") {
      platform = "youtube";
      if (first.startsWith("@")) handle = first.slice(1);
      else if ((first === "c" || first === "user") && segs[1]) handle = segs[1];
    } else if (host === "tiktok.com") {
      platform = "tiktok";
      handle = first.replace(/^@/, "");
    } else if (host === "x.com" || host === "twitter.com") {
      platform = "x";
      handle = first;
    }
    if (platform && handle && HANDLE_RE.test(handle)) {
      return { platform, handle, url: profileUrl(platform, handle) };
    }
    if (platform) return null;
  }

  const handle = input.replace(/^@/, "");
  if (fallbackPlatform && HANDLE_RE.test(handle)) {
    return {
      platform: fallbackPlatform,
      handle,
      url: profileUrl(fallbackPlatform, handle),
    };
  }
  return null;
}
