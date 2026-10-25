"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/** Header team name → menu of every weave, to jump between teams (keeps the current tab). */
function TeamSwitcher({ team }: { team: Doc<"teams"> & { logoUrl?: string | null } }) {
  const teams = useQuery(api.teams.list);
  const router = useRouter();
  const pathname = usePathname();
  const onAccounts = pathname.endsWith("/accounts");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Switch team (current: ${team.name})`} className="flex min-w-0 items-center gap-2 rounded-full p-1 sm:pr-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
        <TeamMonogram team={team} className="size-7 rounded-lg text-[9px]" />
        {/* Small screens: logo only (the menu still opens on tap) */}
        <span className="hidden truncate text-sm font-medium sm:inline">{team.name}</span>
        <ChevronsUpDown className="hidden size-3.5 shrink-0 text-muted-foreground sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {(teams ?? []).map((t) => (
          <DropdownMenuItem
            key={t._id}
            onClick={() => router.push(`/t/${t.slug}${onAccounts ? "/accounts" : ""}`)}
            className="gap-2.5 py-1.5"
          >
            <TeamMonogram team={t} className="size-6 rounded-md text-[8px]" />
            <span className="flex-1 truncate">{t.name}</span>
            {t._id === team._id && <Check className="text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/")} className="gap-2.5 py-1.5 text-muted-foreground">
          <span className="flex size-6 items-center justify-center rounded-md border border-dashed">
            <Plus className="size-3.5" />
          </span>
          Add a team or brand
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
            <TeamSwitcher team={team} />
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
