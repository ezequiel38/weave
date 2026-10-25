import { cn } from "@/lib/utils";

export type Platform = "instagram" | "youtube" | "tiktok" | "x";

export const PLATFORMS: Record<
  Platform,
  { label: string; color: string; bg: string }
> = {
  instagram: { label: "Instagram", color: "#d62976", bg: "linear-gradient(135deg,#feda75,#fa7e1e 30%,#d62976 60%,#962fbf 85%,#4f5bd5)" },
  youtube: { label: "YouTube", color: "#ff0033", bg: "#ff0033" },
  tiktok: { label: "TikTok", color: "#111111", bg: "#111111" },
  x: { label: "X", color: "#111111", bg: "#111111" },
};

/** Simplified brand glyphs (lucide no longer ships brand icons). */
export function PlatformGlyph({ platform, className }: { platform: Platform; className?: string }) {
  const common = { className: cn("size-3.5", className), viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true } as const;
  switch (platform) {
    case "instagram":
      return (
        <svg {...common}>
          <path d="M12 7.3a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4Zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm4.9-7.9a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0ZM12 3.6c2.7 0 3 0 4.1.1 2.7.1 4 1.4 4.1 4.1.1 1.1.1 1.4.1 4.1s0 3-.1 4.1c-.1 2.7-1.4 4-4.1 4.1-1.1.1-1.4.1-4.1.1s-3 0-4.1-.1c-2.7-.1-4-1.4-4.1-4.1C3.7 15 3.6 14.7 3.6 12s0-3 .1-4.1c.1-2.7 1.4-4 4.1-4.1 1.1-.1 1.4-.2 4.2-.2ZM12 2c-2.7 0-3.1 0-4.1.1-3.6.2-5.6 2.2-5.8 5.8C2 8.9 2 9.3 2 12s0 3.1.1 4.1c.2 3.6 2.2 5.6 5.8 5.8 1 .1 1.4.1 4.1.1s3.1 0 4.1-.1c3.6-.2 5.6-2.2 5.8-5.8.1-1 .1-1.4.1-4.1s0-3.1-.1-4.1c-.2-3.6-2.2-5.6-5.8-5.8C15.1 2 14.7 2 12 2Z" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common}>
          <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.7 15V9l5.8 3-5.8 3Z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common}>
          <path d="M16.6 2h-3.4v13.4a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .8.1V9.1a6.3 6.3 0 1 0 5.5 6.3V8.6a8 8 0 0 0 4.6 1.5V6.7a4.6 4.6 0 0 1-4.6-4.7Z" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M17.8 2.5h3.3l-7.2 8.2 8.5 11.2h-6.6l-5.2-6.8-6 6.8H1.3l7.7-8.8L.9 2.5h6.8l4.7 6.2 5.4-6.2Zm-1.2 17.4h1.8L6.6 4.4h-2l12 15.5Z" />
        </svg>
      );
  }
}

export function PlatformBadge({
  platform,
  size = "md",
  className,
}: {
  platform: Platform;
  size?: "sm" | "md";
  className?: string;
}) {
  const p = PLATFORMS[platform];
  return (
    <span
      title={p.label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-white ring-2 ring-background",
        size === "sm" ? "size-5" : "size-6",
        className,
      )}
      style={{ background: p.bg }}
    >
      <PlatformGlyph platform={platform} className={size === "sm" ? "size-2.5" : "size-3"} />
    </span>
  );
}

export function PlatformStack({ platforms, size = "md" }: { platforms: Platform[]; size?: "sm" | "md" }) {
  return (
    <span className="inline-flex items-center -space-x-1.5">
      {platforms.map((p) => (
        <PlatformBadge key={p} platform={p} size={size} />
      ))}
    </span>
  );
}
