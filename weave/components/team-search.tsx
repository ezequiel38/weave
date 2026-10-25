"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ArrowRight, Loader2, Plus, Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { TeamMonogram } from "./team-shell";

export function TeamSearch() {
  const router = useRouter();
  const teams = useQuery(api.teams.list);
  const create = useMutation(api.teams.create);
  const ensureDemo = useMutation(api.seed.ensureDemoTeam);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const needle = q.trim().toLowerCase();
  const matches = (teams ?? []).filter(
    (t) => !needle || t.name.toLowerCase().includes(needle) || t.keywords.some((k) => k.includes(needle)),
  );
  const exact = matches.some((t) => t.name.toLowerCase() === needle);

  // Spinner = (async work) or (navigation in flight). Tying it to the transition means it
  // clears when navigation finishes — including when the page is restored on "back".
  const [navigating, startNav] = useTransition();
  const [navKey, setNavKey] = useState<string | null>(null);
  const spinning = (key: string) => busy === key || (navigating && navKey === key);

  async function go(key: string, fn: () => Promise<string>) {
    setBusy(key);
    try {
      const slug = await fn();
      setNavKey(key);
      startNav(() => router.push(`/t/${slug}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const hasBarca = (teams ?? []).some((t) => t.slug === "fc-barcelona");

  return (
    <div className="w-full max-w-xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (matches[0] && (exact || matches.length === 1)) go(matches[0].slug, async () => matches[0].slug);
          else if (needle) go("create", () => create({ name: q }));
        }}
        className="group relative"
      >
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a team, company or creator…"
          className="h-14 w-full rounded-2xl border bg-card pl-11 pr-28 text-base shadow-sm outline-none transition focus:border-foreground/30 focus:shadow-md"
          aria-label="Search organizations"
        />
        <button
          type="submit"
          disabled={!needle}
          className="absolute right-2 top-1/2 inline-flex h-10 -translate-y-1/2 items-center gap-1 rounded-xl bg-foreground px-4 text-sm font-medium text-background disabled:opacity-40"
        >
          Go <ArrowRight className="size-4" />
        </button>
      </form>

      <ul className="mt-3 space-y-1.5">
        {!hasBarca && (!needle || "fc barcelona barça".includes(needle)) && (
          <li>
            <button
              onClick={() => go("barca", () => ensureDemo({}))}
              className="flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition hover:border-foreground/25"
            >
              <TeamMonogram team={{ monogram: "FCB", accentColor: "#a50044" }} />
              <span className="flex-1">
                <span className="block text-sm font-medium">FC Barcelona</span>
                <span className="block text-xs text-muted-foreground">Demo team · 2 official accounts</span>
              </span>
              {spinning("barca") ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4 text-muted-foreground" />}
            </button>
          </li>
        )}
        {matches.slice(0, 6).map((t) => (
          <li key={t._id}>
            <button
              onClick={() => go(t.slug, async () => t.slug)}
              className="flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition hover:border-foreground/25"
            >
              <TeamMonogram team={t} />
              <span className="flex-1">
                <span className="block text-sm font-medium">{t.name}</span>
                <span className="block text-xs capitalize text-muted-foreground">{t.tagline ?? t.kind}</span>
              </span>
              {spinning(t.slug) ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4 text-muted-foreground" />}
            </button>
          </li>
        ))}
        {needle && !exact && (
          <li>
            <button
              onClick={() => go("create", () => create({ name: q }))}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 text-left text-sm text-muted-foreground transition hover:border-foreground/30 hover:text-foreground",
              )}
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-muted">
                {spinning("create") ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              </span>
              Start a feed for “{q.trim()}”
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
