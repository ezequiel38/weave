"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ArrowRight, LayoutGrid, Layers, List, ListOrdered, Sparkles, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StoryCard } from "./story-card";
import { PostCard } from "./post-card";
import { PlatformStack, type Platform } from "./platform";

type Mode = "unified" | "raw";
type Layout = "grid" | "list";
const LAYOUT_KEY = "weave.layout";
const layoutListeners = new Set<() => void>();
const subscribeLayout = (cb: () => void) => {
  layoutListeners.add(cb);
  return () => void layoutListeners.delete(cb);
};
const readLayout = (): Layout => (localStorage.getItem(LAYOUT_KEY) === "list" ? "list" : "grid");
function setLayout(l: Layout) {
  localStorage.setItem(LAYOUT_KEY, l);
  layoutListeners.forEach((cb) => cb());
}

const MODES: { id: Mode; label: string; icon: typeof Layers }[] = [
  { id: "unified", label: "Woven", icon: Layers },
  { id: "raw", label: "Raw feed", icon: ListOrdered },
];

function FeedSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="overflow-hidden rounded-2xl border bg-card">
          <Skeleton className="aspect-[4/3] rounded-none" />
          <div className="space-y-3 p-6">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyFeed({ team }: { team: Doc<"teams"> }) {
  const load = useMutation(api.seed.loadSampleData);
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-3xl border border-dashed bg-card/60 px-6 py-16 text-center">
      <p className="font-display text-3xl">No posts yet</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Approve {team.name}&apos;s accounts and hit <span className="font-medium text-foreground">Refresh</span> to pull
        recent posts, or load clearly-labelled sample data to explore the interface.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="outline" render={<Link href={`/t/${team.slug}/accounts`} />} nativeButton={false}>
          Manage accounts <ArrowRight />
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await load({ teamId: team._id });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Couldn't load samples");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Sparkles /> Load sample data
        </Button>
      </div>
    </div>
  );
}

export function FeedView({ team }: { team: Doc<"teams"> }) {
  const [mode, setMode] = useState<Mode>("unified");
  const layout = useSyncExternalStore(subscribeLayout, readLayout, () => "grid" as const);
  const grid = layout === "grid";
  const stories = useQuery(api.feed.unified, { teamId: team._id });
  const posts = useQuery(api.feed.raw, { teamId: team._id });
  const stats = useQuery(api.feed.stats, { teamId: team._id });
  const clearSamples = useMutation(api.seed.clearSampleData);

  const platforms = [...new Set((posts ?? []).map((p) => p.platform))] as Platform[];
  const loading = stories === undefined || posts === undefined;
  const empty = !loading && posts.length === 0;
  const saved = stats ? stats.posts - stats.stories : 0;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <section className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {team.kind === "sports" ? "Club feed" : "Feed"}
          </p>
          <h1 className="mt-2 font-display text-5xl leading-none sm:text-6xl">{team.name}</h1>
          {stats && stats.posts > 0 && (
            <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <PlatformStack platforms={platforms} size="sm" />
              <span>
                <span className="font-medium text-foreground">{stats.posts} posts</span> woven into{" "}
                <span className="font-medium text-foreground">{stats.stories} stories</span>
                {saved > 0 && <> — {saved} repeats you don&apos;t have to scroll past</>}
              </span>
            </p>
          )}
        </div>
        {!empty && (
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <div role="tablist" className="inline-flex rounded-full border bg-card p-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                role="tab"
                aria-selected={mode === m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm text-muted-foreground transition-colors",
                  mode === m.id ? "bg-foreground text-background" : "hover:text-foreground",
                )}
              >
                <m.icon className="size-3.5" /> {m.label}
              </button>
            ))}
          </div>
          {(
            <div role="group" aria-label="Layout" className="inline-flex rounded-full border bg-card p-1">
              {([
                { id: "grid", label: "Grid view", icon: LayoutGrid },
                { id: "list", label: "List view", icon: List },
              ] as const).map((l) => (
                <button
                  key={l.id}
                  aria-label={l.label}
                  title={l.label}
                  aria-pressed={layout === l.id}
                  onClick={() => setLayout(l.id)}
                  className={cn(
                    "inline-flex items-center rounded-full p-2 text-muted-foreground transition-colors",
                    layout === l.id ? "bg-foreground text-background" : "hover:text-foreground",
                  )}
                >
                  <l.icon className="size-3.5" />
                </button>
              ))}
            </div>
          )}
          </div>
        )}
      </section>

      {stats?.hasSample && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950">
          <span>
            <span className="font-medium">Sample data shown.</span> Items marked “Sample” are fictional demo fixtures, not real posts.
          </span>
          <button
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
            onClick={() => clearSamples({ teamId: team._id })}
          >
            <Trash2 className="size-3" /> Remove samples
          </button>
        </div>
      )}

      <div className="mt-8">
        {loading ? (
          <FeedSkeleton />
        ) : empty ? (
          <EmptyFeed team={team} />
        ) : mode === "unified" ? (
          stories.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">Posts are still being analysed into stories…</p>
          ) : (
            <div className={grid ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "mx-auto max-w-xl space-y-4"}>
              {stories.map((s, i) => (
                <StoryCard key={s._id} story={s} index={i} className={grid ? "h-full" : undefined} />
              ))}
            </div>
          )
        ) : (
          <div className={grid ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "mx-auto max-w-xl space-y-4"}>
            {posts.map((p, i) => (
              <PostCard key={p._id} post={p} index={i} className="h-full" />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
