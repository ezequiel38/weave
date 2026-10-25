"use client";

import { useQuery } from "convex/react";
import { Scale } from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PLATFORMS, PlatformBadge } from "./platform";
import type { StoryPost, UnifiedStory } from "./feed-types";

const CATEGORY: Record<string, { label: string; tone: string }> = {
  exact_duplicate: { label: "Exact duplicate", tone: "bg-slate-900 text-white" },
  near_duplicate: { label: "Near duplicate", tone: "bg-slate-700 text-white" },
  same_event: { label: "Same event · complementary", tone: "bg-emerald-600 text-white" },
  related: { label: "Related, kept separate", tone: "bg-amber-500 text-white" },
  unrelated: { label: "Unrelated", tone: "bg-muted text-foreground" },
};

function Evidence({ storyId, posts }: { storyId: UnifiedStory["_id"]; posts: StoryPost[] }) {
  const decisions = useQuery(api.feed.storyEvidence, { storyId });
  const byId = new Map(posts.map((p) => [p._id, p]));
  if (decisions === undefined) return <p className="text-sm text-muted-foreground">Loading evidence…</p>;
  if (decisions.length === 0)
    return <p className="text-sm text-muted-foreground">No pairwise evidence recorded for this story.</p>;
  return (
    <ul className="space-y-3">
      {decisions.map((d) => {
        const a = byId.get(d.postA);
        const b = byId.get(d.postB);
        const cat = CATEGORY[d.category];
        const s = d.signals;
        return (
          <li key={d._id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-center gap-2">
              {a && <PlatformBadge platform={a.platform} size="sm" />}
              <span className="text-xs text-muted-foreground">↔</span>
              {b && <PlatformBadge platform={b.platform} size="sm" />}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cat.tone}`}>{cat.label}</span>
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {Math.round(d.confidence * 100)}% · {d.decidedBy}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed">{d.reasoning}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {s.textSimilarity !== undefined && <Badge variant="secondary">text {s.textSimilarity.toFixed(2)}</Badge>}
              {s.imageHashDistance !== undefined && <Badge variant="secondary">image Δ {s.imageHashDistance}/64</Badge>}
              {s.elasticScore !== undefined && <Badge variant="secondary">elastic {s.elasticScore.toFixed(3)}</Badge>}
              {s.hoursApart !== undefined && <Badge variant="secondary">{s.hoursApart.toFixed(1)}h apart</Badge>}
              {!!s.sharedLinks && <Badge variant="secondary">{s.sharedLinks} shared link</Badge>}
              {!!s.sharedHashtags && <Badge variant="secondary">{s.sharedHashtags} shared tags</Badge>}
            </div>
            {(d.newInfoA || d.newInfoB) && (
              <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                {d.newInfoA && a && <p><span className="font-medium text-foreground">{PLATFORMS[a.platform].label} adds:</span> {d.newInfoA}</p>}
                {d.newInfoB && b && <p><span className="font-medium text-foreground">{PLATFORMS[b.platform].label} adds:</span> {d.newInfoB}</p>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function MergeEvidence({ storyId, posts }: { storyId: UnifiedStory["_id"]; posts: StoryPost[] }) {
  return (
    <Dialog>
      <DialogTrigger className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-medium text-foreground hover:bg-muted">
        <Scale className="size-3.5" /> Why merged?
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Why these posts are one story</DialogTitle>
          <DialogDescription>
            Each pair was checked with cheap signals first, then Elastic similarity, then Claude where needed.
          </DialogDescription>
        </DialogHeader>
        <Evidence storyId={storyId} posts={posts} />
      </DialogContent>
    </Dialog>
  );
}
