import { cn } from "@/lib/utils";
import { splitTrailingHashtags } from "@/lib/format";

/** Caption text with trailing hashtags moved into a small line underneath. */
export function Caption({ text, className, clamp }: { text: string; className?: string; clamp?: boolean }) {
  const { body, tags } = splitTrailingHashtags(text);
  return (
    <>
      <p className={cn("whitespace-pre-line", clamp && "line-clamp-4", className)}>{body}</p>
      {tags.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{tags.join(" ")}</p>}
    </>
  );
}
