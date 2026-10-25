"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { CheckCircle2, ChevronDown, CircleAlert, Loader2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";

const RECENT_MS = 15 * 60_000;

export function RunStatus({ teamId }: { teamId: Id<"teams"> }) {
  const runs = useQuery(api.runs.latest, { teamId });
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const run = runs?.[0];
  if (!run || dismissed === run._id) return null;
  const running = run.status === "running";
  if (!running && now - (run.finishedAt ?? run.startedAt) > RECENT_MS) return null;

  const tone = running
    ? "border-sky-200 bg-sky-50 text-sky-950"
    : run.status === "succeeded"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : run.status === "partial"
        ? "border-amber-200 bg-amber-50 text-amber-950"
        : "border-rose-200 bg-rose-50 text-rose-950";
  const Icon = running ? Loader2 : run.status === "succeeded" ? CheckCircle2 : CircleAlert;
  const s = run.stats;

  return (
    <div className={cn("border-b", tone)}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:px-6">
        <span className="inline-flex items-center gap-2 font-medium">
          <Icon className={cn("size-4", running && "animate-spin")} />
          {running ? run.stage : run.status === "succeeded" ? "Feed updated" : run.status === "partial" ? "Updated with warnings" : "Refresh failed"}
        </span>
        <span className="text-xs opacity-80">
          {s.postsFetched} fetched · {s.postsNew} new · {s.storiesTouched} stories updated
          {s.elasticQueries > 0 && ` · ${s.elasticQueries} Elastic lookups`}
          {s.claudeCalls > 0 && ` · ${s.claudeCalls} Claude calls`}
        </span>
        {run.error && <span className="text-xs font-medium">{run.error}</span>}
        <span className="ml-auto flex items-center gap-1 text-xs opacity-70">
          {timeAgo(run.startedAt, now)}
          {run.log.length > 0 && (
            <button onClick={() => setOpen((o) => !o)} className="ml-2 inline-flex items-center gap-0.5 rounded px-1 hover:bg-black/5">
              Log <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
            </button>
          )}
          {!running && (
            <button aria-label="Dismiss" onClick={() => setDismissed(run._id)} className="rounded p-0.5 hover:bg-black/5">
              <X className="size-3.5" />
            </button>
          )}
        </span>
      </div>
      {open && (
        <ol className="mx-auto max-h-48 max-w-6xl overflow-y-auto px-4 pb-3 font-mono text-[11px] leading-relaxed sm:px-6">
          {run.log.map((l, i) => (
            <li key={i} className={cn(l.level === "error" && "text-rose-700", l.level === "warn" && "text-amber-700")}>
              {new Date(l.at).toLocaleTimeString()} {l.message}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
