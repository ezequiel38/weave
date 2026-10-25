"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { splitTrailingHashtags } from "@/lib/format";

/**
 * Caption text with trailing hashtags moved into a small line underneath.
 * With `clamp`, long captions are cut to 4 lines with a More / Less toggle.
 */
export function Caption({
  text,
  className,
  clamp,
  onMore,
}: {
  text: string;
  className?: string;
  clamp?: boolean;
  /** If set, "More" calls this (e.g. open the detail window) instead of expanding in place. */
  onMore?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { body, tags } = splitTrailingHashtags(text);
  const long = body.length > 170 || body.split("\n").filter((l) => l.trim()).length > 4;
  const clamped = clamp && long && !expanded;
  return (
    <>
      <p className={cn("whitespace-pre-line", clamped && "line-clamp-4", className)}>{body}</p>
      {clamp && long && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onMore) onMore();
            else setExpanded((x) => !x);
          }}
          className="mt-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {expanded ? "Less" : "More"}
        </button>
      )}
      {tags.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{tags.join(" ")}</p>}
    </>
  );
}
