"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { BadgeCheck, CircleHelp, ExternalLink, Loader2, Plus, ShieldQuestion, Sparkles, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PLATFORMS, PlatformBadge, PlatformGlyph, type Platform } from "./platform";
import { lockable, usePasswordGate } from "./password-gate";
import { RefreshButton } from "./refresh-button";

/** Platforms the ingestion Actor actually covers. */
const SUPPORTED: Platform[] = ["instagram", "tiktok"];

const VERIFY = {
  verified: { label: "Verified", icon: BadgeCheck, tone: "text-emerald-700 bg-emerald-50" },
  likely: { label: "Likely official", icon: ShieldQuestion, tone: "text-sky-800 bg-sky-50" },
  unverified: { label: "Unverified", icon: CircleHelp, tone: "text-muted-foreground bg-muted" },
} as const;

function AccountRow({ account }: { account: Doc<"accounts"> }) {
  const setStatus = useMutation(api.accounts.setStatus);
  const remove = useMutation(api.accounts.remove);
  const gate = usePasswordGate("Editing accounts");
  const v = VERIFY[account.verification.level];
  const included = account.status === "approved";

  return (
    <li className={cn("flex items-center gap-3 px-4 py-3.5 sm:px-5", !included && "opacity-60")}>
      <PlatformBadge platform={account.platform} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <a href={account.url} target="_blank" rel="noopener noreferrer" className="truncate font-medium hover:underline">
            @{account.handle}
          </a>
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", v.tone)} title={account.verification.evidence.join("\n")}>
            <v.icon className="size-3" /> {v.label}
          </span>
          {account.status === "proposed" && (
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800">Suggested</span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {PLATFORMS[account.platform].label}
          {account.lastFetchedAt ? ` · fetched ${timeAgo(account.lastFetchedAt)}` : " · not fetched yet"}
          {account.verification.evidence[0] && ` · ${account.verification.evidence[0]}`}
        </p>
      </div>
      <a href={account.url} target="_blank" rel="noopener noreferrer" className="hidden rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground sm:block" aria-label="Open profile">
        <ExternalLink className="size-4" />
      </a>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="hidden sm:inline">{included ? "Included" : "Excluded"}</span>
        <Switch
          checked={included}
          onCheckedChange={(on) =>
            gate.run((password) =>
              lockable(() => setStatus({ accountId: account._id, status: on ? "approved" : "excluded", password })),
            )
          }
        />
      </label>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Remove account"
        onClick={() =>
          gate.run(async (password) => {
            const res = await lockable(() => remove({ accountId: account._id, password }));
            if (!res.locked) toast.success(`Removed @${account.handle}`);
            return res;
          })
        }
      >
        <Trash2 />
      </Button>
      {gate.dialog}
    </li>
  );
}

function AddAccount({ team }: { team: Doc<"teams"> }) {
  const add = useMutation(api.accounts.add);
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const gate = usePasswordGate("Adding accounts");

  return (
    <>
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        gate.run(async (password) => {
          setBusy(true);
          try {
            const res = await lockable(() => add({ teamId: team._id, input: value, platform, password }));
            if (!res.locked) {
              setValue("");
              toast.success("Account added");
            }
            return res;
          } catch (err) {
            const msg = err instanceof Error ? err.message.replace(/^.*ConvexError: /, "").split("\n")[0] : "Couldn't add account";
            toast.error(msg);
            return {};
          } finally {
            setBusy(false);
          }
        });
      }}
    >
      <div className="flex gap-1.5">
        {SUPPORTED.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatform(p)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
              platform === p ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <PlatformGlyph platform={p} className="size-3" /> {PLATFORMS[p].label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste a profile URL or type @handle"
          className="h-10 rounded-xl bg-background"
        />
        <Button type="submit" disabled={busy || !value.trim()} className="h-10 rounded-xl px-4">
          <Plus /> Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Profile URLs are detected automatically. Manually added accounts are marked unverified.
      </p>
    </form>
    {gate.dialog}
    </>
  );
}

function SuggestAccounts({ team }: { team: Doc<"teams"> }) {
  const suggest = useAction(api.discover.suggest);
  const gate = usePasswordGate("Suggesting accounts");
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 rounded-full text-xs"
        disabled={gate.busy}
        onClick={() =>
          gate.run(async (password) => {
            try {
              const res = await suggest({ teamId: team._id, password });
              if (!("locked" in res && res.locked)) (res.ok ? toast.success : toast.error)(res.message);
              return res;
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Couldn't suggest accounts");
              return {};
            }
          })
        }
      >
        {gate.busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Suggest accounts
      </Button>
      {gate.dialog}
    </>
  );
}

export function AccountsView({ team }: { team: Doc<"teams"> }) {
  const router = useRouter();
  const accounts = useQuery(api.accounts.listForTeam, { teamId: team._id });
  // Stable order (not by status) so rows don't jump when toggled.
  const sorted = [...(accounts ?? [])].filter((a) => SUPPORTED.includes(a.platform)).sort((a, b) => a.platform.localeCompare(b.platform) || a._creationTime - b._creationTime);
  const approved = sorted.filter((a) => a.status === "approved").length;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Sources</p>
      <h1 className="mt-2 font-display text-5xl leading-none">Accounts</h1>
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">
        Choose which profiles feed {team.name}&apos;s stories. Only included accounts are fetched on refresh
        (about 15 recent posts each, to keep costs low).
      </p>

      <section className="mt-8 overflow-hidden rounded-2xl border bg-card">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <h2 className="text-sm font-medium">Connected profiles</h2>
          <span className="ml-auto text-xs text-muted-foreground">{approved} included</span>
          <SuggestAccounts team={team} />
        </header>
        {accounts === undefined ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : sorted.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No accounts yet — use <span className="font-medium text-foreground">Suggest accounts</span> or add one below.
          </p>
        ) : (
          <ul className="divide-y">
            {sorted.map((a) => (
              <AccountRow key={a._id} account={a} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 flex flex-col items-start gap-4 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex-1">
          <h2 className="text-sm font-medium">Ready to weave?</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {approved
              ? `Fetches recent posts from the ${approved} included account${approved === 1 ? "" : "s"}, merges them into stories, then opens the feed.`
              : "Include at least one account above first."}
          </p>
        </div>
        {approved > 0 && <RefreshButton teamId={team._id} size="lg" onDone={() => router.push(`/t/${team.slug}`)} />}
      </section>

      <section className="mt-6 rounded-2xl border bg-card p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-medium">Add an account</h2>
        <AddAccount team={team} />
      </section>
    </main>
  );
}
