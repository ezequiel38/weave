"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "./logo";
import { RunStatus } from "./run-status";
import { RefreshButton } from "./refresh-button";
import { ThemeToggle } from "./theme-toggle";

export function TeamMonogram({
  team,
  className,
}: {
  team: Pick<Doc<"teams">, "monogram" | "accentColor"> & { logoUrl?: string | null };
  className?: string;
}) {
  if (team.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small stored logo
      <img
        src={team.logoUrl}
        alt=""
        className={cn("inline-flex size-10 shrink-0 rounded-xl bg-white object-cover ring-1 ring-foreground/10", className)}
      />
    );
  }
  return (
    <span
      className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-semibold tracking-wide text-white", className)}
      style={{ background: team.accentColor }}
    >
      {team.monogram}
    </span>
  );
}

export function TeamShell({ slug, children }: { slug: string; children: (team: Doc<"teams">) => ReactNode }) {
  const team = useQuery(api.teams.bySlug, { slug });
  const pathname = usePathname();

  const nav = [
    { href: `/t/${slug}`, label: "Feed" },
    { href: `/t/${slug}/accounts`, label: "Accounts" },
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <span className="h-5 w-px bg-border" />
          {team ? (
            <div className="flex min-w-0 items-center gap-2">
              <TeamMonogram team={team} className="size-7 rounded-lg text-[9px]" />
              <span className="truncate text-sm font-medium">{team.name}</span>
            </div>
          ) : (
            <Skeleton className="h-6 w-32" />
          )}
          <nav className="ml-auto hidden items-center gap-1 sm:flex">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
                  pathname === n.href && "bg-foreground text-background hover:text-background",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <ThemeToggle className="ml-auto sm:ml-0" />
          {team && <RefreshButton teamId={team._id} />}
        </div>
        <nav className="flex gap-1 border-t px-4 py-1.5 sm:hidden">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex-1 rounded-full px-3 py-1.5 text-center text-sm text-muted-foreground",
                pathname === n.href && "bg-foreground text-background",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      {team === null ? (
        <div className="mx-auto max-w-md px-6 py-24 text-center">
          <p className="font-display text-3xl">We couldn&apos;t find that team.</p>
          <Link href="/" className="mt-4 inline-block text-sm underline underline-offset-4">
            Back to search
          </Link>
        </div>
      ) : team ? (
        <>
          <RunStatus teamId={team._id} />
          {children(team)}
        </>
      ) : (
        <div className="mx-auto w-full max-w-6xl space-y-4 px-6 py-10">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      )}
    </div>
  );
}
