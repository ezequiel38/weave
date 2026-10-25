"use client";

import { useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePasswordGate } from "./password-gate";

/**
 * Refresh spends Apify/Claude credits, so it's password-locked (checked server-side).
 * `onDone` fires when a refresh started here finishes successfully.
 */
export function RefreshButton({
  teamId,
  className,
  size = "pill",
  onDone,
}: {
  teamId: Id<"teams">;
  className?: string;
  /** "pill" matches the header nav pills; "lg" is the prominent page version. */
  size?: "pill" | "lg";
  onDone?: () => void;
}) {
  const refresh = useAction(api.ingest.refresh);
  const runs = useQuery(api.runs.latest, { teamId });
  const gate = usePasswordGate("Refresh");
  const [starting, setStarting] = useState(false);
  const latest = runs?.[0];
  const running = starting || gate.busy || latest?.status === "running";

  // Watch for the run we kicked off to finish.
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    if (startedAt.current === null || !latest || latest.startedAt < startedAt.current - 5000) return;
    if (latest.status === "succeeded" || latest.status === "partial") {
      startedAt.current = null;
      onDone?.();
    } else if (latest.status === "failed") {
      startedAt.current = null;
    }
  }, [latest, onDone]);

  return (
    <>
      <Button
        size={size === "lg" ? "lg" : "sm"}
        className={cn(
          "rounded-full",
          size === "pill" ? "h-8 px-3 text-sm" : "h-11 px-6 text-base [&_svg:not([class*='size-'])]:size-4",
          className,
        )}
        disabled={running}
        onClick={() =>
          gate.run(async (password) => {
            setStarting(true);
            try {
              startedAt.current = Date.now();
              const res = await refresh({ teamId, password });
              const locked = "locked" in res && res.locked;
              if (locked || !res.ok) startedAt.current = null;
              if (!locked && !res.ok) toast.error(res.message);
              return res;
            } catch (e) {
              startedAt.current = null;
              toast.error(e instanceof Error ? e.message : "Refresh failed");
              return {};
            } finally {
              setStarting(false);
            }
          })
        }
      >
        <RefreshCw className={cn(running && "animate-spin")} />
        {running ? "Refreshing…" : size === "lg" ? "Fetch posts now" : "Refresh"}
      </Button>
      {gate.dialog}
    </>
  );
}
