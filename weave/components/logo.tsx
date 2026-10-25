import Link from "next/link";
import { cn } from "@/lib/utils";

export function WeaveMark({ className }: { className?: string }) {
  // Four strands (one per platform) converging into a single thread.
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-foreground" />
      <g fill="none" strokeWidth="2.2" strokeLinecap="round">
        <path d="M7 9c6 0 7 7 13 7h5" stroke="#f472b6" />
        <path d="M7 14c5 0 6 2 13 2" stroke="#fb7185" />
        <path d="M7 18c5 0 6-2 13-2" stroke="#a78bfa" />
        <path d="M7 23c6 0 7-7 13-7" stroke="#60a5fa" />
      </g>
      <circle cx="24" cy="16" r="2.4" className="fill-background" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2", className)}>
      <WeaveMark />
      <span className="text-xl font-normal leading-none tracking-[-0.03em]">weave</span>
    </Link>
  );
}
